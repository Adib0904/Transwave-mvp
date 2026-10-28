import { Injectable } from "@nestjs/common";
import type { AttachVendorDocument, SaveVendorBill, VendorBill } from "@transwave/contracts";
import type { Database, TransWaveDatabaseClient } from "@transwave/database";
import { requireData, throwDatabaseError } from "../common/database-error.js";
import { decimal, money } from "../common/format.js";
import { requireTenantRole } from "../common/tenant.js";

type BillRow = Database["public"]["Tables"]["vendor_bills"]["Row"];
type LineRow = Database["public"]["Tables"]["vendor_bill_lines"]["Row"];

@Injectable()
export class VendorBillsService {
  async list(database: TransWaveDatabaseClient): Promise<VendorBill[]> {
    const visibleJobs = await database.from("jobs").select("id");
    if (visibleJobs.error) throwDatabaseError(visibleJobs.error);
    const visibleJobIds = (visibleJobs.data ?? []).map((job) => job.id);
    if (visibleJobIds.length === 0) return [];

    const result = await database
      .from("vendor_bills")
      .select("*")
      .in("job_id", visibleJobIds)
      .order("bill_date", { ascending: false });
    if (result.error) throwDatabaseError(result.error);
    const bills = result.data ?? [];
    if (!bills.length) return [];

    const billIds = bills.map((bill) => bill.id);
    const vendorIds = [...new Set(bills.map((bill) => bill.vendor_id))];
    const jobIds = [...new Set(bills.map((bill) => bill.job_id))];
    const invoiceIds = [...new Set(bills.map((bill) => bill.customer_invoice_id).filter((id): id is string => Boolean(id)))];
    const [linesResult, vendorsResult, jobsResult, invoicesResult] = await Promise.all([
      database.from("vendor_bill_lines").select("*").in("vendor_bill_id", billIds).order("line_number"),
      database.from("vendors").select("id, vendor_code, legal_name, trn").in("id", vendorIds),
      database.from("jobs").select("id, job_number").in("id", jobIds),
      invoiceIds.length
        ? database.from("invoices").select("id, invoice_number, draft_reference, subtotal_aed").in("id", invoiceIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [linesResult, vendorsResult, jobsResult, invoicesResult]) if (result.error) throwDatabaseError(result.error);
    const lines = linesResult.data ?? [];
    const serviceIds = [...new Set(lines.map((line) => line.service_id).filter((id): id is string => Boolean(id)))];
    const servicesResult = serviceIds.length
      ? await database.from("services").select("id, name").in("id", serviceIds)
      : { data: [], error: null };
    if (servicesResult.error) throwDatabaseError(servicesResult.error);

    const linesByBill = new Map<string, LineRow[]>();
    for (const line of lines) {
      const billLines = linesByBill.get(line.vendor_bill_id) ?? [];
      billLines.push(line);
      linesByBill.set(line.vendor_bill_id, billLines);
    }
    const vendorsById = new Map((vendorsResult.data ?? []).map((vendor) => [vendor.id, vendor]));
    const jobsById = new Map((jobsResult.data ?? []).map((job) => [job.id, job]));
    const invoicesById = new Map((invoicesResult.data ?? []).map((invoice) => [invoice.id, invoice]));
    const servicesById = new Map((servicesResult.data ?? []).map((service) => [service.id, service.name]));

    return bills.map((bill) => {
      const vendor = vendorsById.get(bill.vendor_id);
      const job = jobsById.get(bill.job_id);
      if (!vendor || !job) throw new Error("Vendor invoice references an unavailable vendor or job");
      return this.mapBill(
        bill,
        linesByBill.get(bill.id) ?? [],
        vendor,
        job,
        bill.customer_invoice_id ? invoicesById.get(bill.customer_invoice_id) ?? null : null,
        servicesById,
      );
    });
  }

  async findOne(database: TransWaveDatabaseClient, id: string): Promise<VendorBill> {
    const billResult = await database
      .from("vendor_bills")
      .select(`
        *,
        vendor:vendors!vendor_bills_vendor_id_company_id_fkey(id, vendor_code, legal_name, trn),
        job:jobs!vendor_bills_job_id_company_id_fkey(id, job_number),
        customer_invoice:invoices!vendor_bills_customer_invoice_id_company_id_fkey(id, invoice_number, draft_reference, subtotal_aed),
        lines:vendor_bill_lines!vendor_bill_lines_vendor_bill_id_company_id_fkey(*,
          service:services!vendor_bill_lines_service_id_company_id_fkey(id, name)
        )
      `)
      .eq("id", id)
      .maybeSingle();
    if (billResult.error) throwDatabaseError(billResult.error);
    type BillDetail = BillRow & {
      vendor: { id: string; vendor_code: string; legal_name: string; trn: string | null } | null;
      job: { id: string; job_number: string } | null;
      customer_invoice: { id: string; invoice_number: string | null; draft_reference: string; subtotal_aed: number } | null;
      lines: (LineRow & { service: { id: string; name: string } | null })[];
    };
    const bill = requireData(billResult.data as unknown as BillDetail | null, null, "Vendor bill not found");
    const vendor = requireData(bill.vendor, null, "Vendor not found");
    const job = requireData(bill.job, null, "Job not found");
    const lines = [...bill.lines].sort((left, right) => left.line_number - right.line_number);
    const services = new Map(lines.flatMap((line) => line.service ? [[line.service.id, line.service.name] as const] : []));
    return this.mapBill(bill, lines, vendor, job, bill.customer_invoice, services);
  }

  async create(database: TransWaveDatabaseClient, userId: string, input: SaveVendorBill) {
    await requireTenantRole(database, userId, ["OWNER", "ADMIN", "OPERATIONS", "FINANCE"]);
    const id = await this.save(database, null, input);
    return this.findOne(database, id);
  }

  async update(database: TransWaveDatabaseClient, userId: string, id: string, input: SaveVendorBill) {
    await requireTenantRole(database, userId, ["OWNER", "ADMIN", "OPERATIONS", "FINANCE"]);
    await this.save(database, id, input);
    return this.findOne(database, id);
  }

  async remove(database: TransWaveDatabaseClient, userId: string, id: string) {
    await requireTenantRole(database, userId, ["OWNER", "ADMIN", "OPERATIONS", "FINANCE"]);
    const { error } = await database.rpc("delete_vendor_bill", { p_id: id });
    if (error) throwDatabaseError(error);
  }

  async attachDocument(database: TransWaveDatabaseClient, userId: string, id: string, input: AttachVendorDocument) {
    await requireTenantRole(database, userId, ["OWNER", "ADMIN", "OPERATIONS", "FINANCE"]);
    const { error } = await database.rpc("attach_vendor_bill_document", {
      p_id: id,
      p_storage_path: input.storagePath,
      p_file_name: input.fileName,
    });
    if (error) throwDatabaseError(error);
    return this.findOne(database, id);
  }

  private async save(database: TransWaveDatabaseClient, id: string | null, input: SaveVendorBill): Promise<string> {
    const args = {
      p_id: id,
      p_vendor_id: input.vendorId,
      p_job_id: input.jobId,
      p_customer_invoice_id: input.customerInvoiceId,
      p_vendor_invoice_number: input.vendorInvoiceNumber,
      p_bill_date: input.billDate,
      p_due_date: input.dueDate,
      p_payment_date: input.paymentDate,
      p_date_of_supply: input.dateOfSupply,
      p_bl_number: input.blNumber,
      p_department: input.department,
      p_remarks: input.remarks,
      p_source_file_name: input.sourceFileName,
      p_status: input.status,
      p_revenue_allocated_aed: Number(input.revenueAllocatedAed),
      p_lines: input.lines,
    } as unknown as Database["public"]["Functions"]["save_vendor_bill_with_payment_date"]["Args"];
    const { data, error } = await database.rpc("save_vendor_bill_with_payment_date", args);
    if (error) throwDatabaseError(error);
    return requireData(data, null, "Vendor bill was not saved");
  }

  private mapBill(
    bill: BillRow,
    lines: LineRow[],
    vendor: { id: string; vendor_code: string; legal_name: string; trn: string | null },
    job: { id: string; job_number: string },
    invoice: { id: string; invoice_number: string | null; draft_reference: string; subtotal_aed: number } | null,
    services: Map<string, string>,
  ): VendorBill {
    const subtotal = lines.reduce((sum, line) => sum + Number(line.net_amount_aed), 0);
    const vat = lines.reduce((sum, line) => sum + Number(line.vat_amount_aed), 0);
    const total = lines.reduce((sum, line) => sum + Number(line.total_amount_aed), 0);
    const revenue = Number(invoice?.subtotal_aed ?? 0);
    return {
      id: bill.id,
      vendorId: vendor.id,
      vendorCode: vendor.vendor_code,
      vendorName: vendor.legal_name,
      vendorTrn: vendor.trn,
      jobId: job.id,
      jobNumber: job.job_number,
      customerInvoiceId: invoice?.id ?? null,
      customerInvoiceNumber: invoice ? invoice.invoice_number ?? invoice.draft_reference : null,
      vendorInvoiceNumber: bill.vendor_invoice_number,
      billDate: bill.bill_date,
      dueDate: bill.due_date,
      paymentDate: bill.payment_date,
      dateOfSupply: bill.date_of_supply,
      blNumber: bill.bl_number,
      department: bill.department,
      remarks: bill.remarks,
      sourceFileName: bill.source_file_name,
      sourceFilePath: bill.source_file_path,
      status: bill.status as VendorBill["status"],
      revenueAllocatedAed: money(revenue),
      subtotalAed: money(subtotal),
      vatAmountAed: money(vat),
      totalAmountAed: money(total),
      profitAed: money(revenue - subtotal),
      lines: lines.map((line) => ({
        id: line.id,
        lineNumber: line.line_number,
        serviceId: line.service_id,
        serviceName: line.service_id ? services.get(line.service_id) ?? null : null,
        description: line.description,
        quantity: decimal(line.quantity),
        uom: line.uom,
        currency: line.currency_code.trim() as "AED" | "USD",
        exchangeRate: decimal(line.exchange_rate),
        unitRate: money(line.unit_rate),
        taxRate: decimal(line.tax_rate),
        netAmountAed: money(line.net_amount_aed ?? 0),
        vatAmountAed: money(line.vat_amount_aed ?? 0),
        totalAmountAed: money(line.total_amount_aed ?? 0),
      })),
    };
  }
}
