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
      .select("id")
      .in("job_id", visibleJobIds)
      .order("bill_date", { ascending: false });
    if (result.error) throwDatabaseError(result.error);
    return Promise.all((result.data ?? []).map((bill) => this.findOne(database, bill.id)));
  }

  async findOne(database: TransWaveDatabaseClient, id: string): Promise<VendorBill> {
    const billResult = await database.from("vendor_bills").select("*").eq("id", id).maybeSingle();
    const bill = requireData(billResult.data, billResult.error, "Vendor bill not found");
    const [linesResult, vendorResult, jobResult, invoiceResult] = await Promise.all([
      database.from("vendor_bill_lines").select("*").eq("vendor_bill_id", id).order("line_number"),
      database.from("vendors").select("id, vendor_code, legal_name, trn").eq("id", bill.vendor_id).single(),
      database.from("jobs").select("id, job_number").eq("id", bill.job_id).single(),
      bill.customer_invoice_id
        ? database.from("invoices").select("id, invoice_number, draft_reference, subtotal_aed").eq("id", bill.customer_invoice_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    for (const result of [linesResult, vendorResult, jobResult, invoiceResult]) if (result.error) throwDatabaseError(result.error);
    const lines = linesResult.data ?? [];
    const serviceIds = [...new Set(lines.map((line) => line.service_id).filter((value): value is string => Boolean(value)))];
    const servicesResult = serviceIds.length
      ? await database.from("services").select("id, name").in("id", serviceIds)
      : { data: [], error: null };
    if (servicesResult.error) throwDatabaseError(servicesResult.error);
    return this.mapBill(bill, lines, requireData(vendorResult.data, null, "Vendor not found"), requireData(jobResult.data, null, "Job not found"), invoiceResult.data, new Map((servicesResult.data ?? []).map((service) => [service.id, service.name])));
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
      p_date_of_supply: input.dateOfSupply,
      p_bl_number: input.blNumber,
      p_department: input.department,
      p_remarks: input.remarks,
      p_source_file_name: input.sourceFileName,
      p_status: input.status,
      p_revenue_allocated_aed: Number(input.revenueAllocatedAed),
      p_lines: input.lines,
    } as unknown as Database["public"]["Functions"]["save_vendor_bill"]["Args"];
    const { data, error } = await database.rpc("save_vendor_bill", args);
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
