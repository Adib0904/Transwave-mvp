import { Injectable } from "@nestjs/common";
import { containerSchema, type Invoice, type RecordPage, type UpdateInvoice } from "@transwave/contracts";
import type { Database, Json, TransWaveDatabaseClient } from "@transwave/database";
import { requireData, throwDatabaseError } from "../common/database-error.js";
import { decimal, money } from "../common/format.js";
import { requireTenantRole, resolveTenant } from "../common/tenant.js";

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type InvoiceLineRow = Database["public"]["Tables"]["invoice_lines"]["Row"];

@Injectable()
export class InvoicesService {
  async list(database: TransWaveDatabaseClient, userId: string): Promise<Invoice[]> {
    const tenant = await resolveTenant(database, userId);
    let query = database
      .from("invoices")
      .select("*")
      .eq("company_id", tenant.companyId)
      .order("created_at", { ascending: false });
    if (tenant.role !== "OWNER" && tenant.role !== "ADMIN") {
      query = query.eq("created_by", userId);
    }
    const { data: invoices, error } = await query;
    if (error) throwDatabaseError(error);
    return this.withLines(database, invoices ?? []);
  }

  async listPage(database: TransWaveDatabaseClient, userId: string, offset: number, limit: number): Promise<RecordPage<Invoice>> {
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
    const safeLimit = Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.floor(limit))) : 20;
    const tenant = await resolveTenant(database, userId);
    let query = database.from("invoices").select("*", { count: "exact" })
      .eq("company_id", tenant.companyId).order("created_at", { ascending: false})
      .range(safeOffset, safeOffset + safeLimit - 1);
    if (tenant.role !== "OWNER" && tenant.role !== "ADMIN") query = query.eq("created_by", userId);
    const { data, error, count } = await query;
    if (error) throwDatabaseError(error);
    const items = await this.withLines(database, data ?? []);
    const total = count ?? items.length;
    return { items, total, offset: safeOffset, limit: safeLimit, hasMore: safeOffset + items.length < total };
  }

  private async withLines(database: TransWaveDatabaseClient, invoices: InvoiceRow[]): Promise<Invoice[]> {
    if (!invoices.length) return [];

    const { data: lines, error: linesError } = await database
      .from("invoice_lines")
      .select("*")
      .in("invoice_id", invoices.map(invoice => invoice.id))
      .order("line_number");
    if (linesError) throwDatabaseError(linesError);
    const linesByInvoice = new Map<string, InvoiceLineRow[]>();
    for (const line of lines ?? []) {
      const invoiceLines = linesByInvoice.get(line.invoice_id) ?? [];
      invoiceLines.push(line);
      linesByInvoice.set(line.invoice_id, invoiceLines);
    }
    return invoices.map(invoice => this.toInvoice(invoice, linesByInvoice.get(invoice.id) ?? []));
  }

  async findOne(database: TransWaveDatabaseClient, id: string): Promise<Invoice> {
    const invoiceResult = await database
      .from("invoices")
      .select("*, lines:invoice_lines!invoice_lines_invoice_id_company_id_fkey(*)")
      .eq("id", id)
      .maybeSingle();
    if (invoiceResult.error) throwDatabaseError(invoiceResult.error);
    type InvoiceDetail = InvoiceRow & { lines: InvoiceLineRow[] };
    const invoice = requireData(invoiceResult.data as unknown as InvoiceDetail | null, null, "Invoice not found");
    return this.toInvoice(invoice, [...invoice.lines].sort((left, right) => left.line_number - right.line_number));
  }

  async createDraft(database: TransWaveDatabaseClient, userId: string, jobId: string, chargeIds: string[]): Promise<Invoice> {
    await requireTenantRole(database, userId, ["OWNER", "ADMIN", "OPERATIONS", "FINANCE"]);
    const { data: invoiceId, error } = await database.rpc("create_invoice_draft", {
      p_job_id: jobId,
      p_charge_ids: chargeIds
    });
    if (error) throwDatabaseError(error);
    return this.findOne(database, invoiceId);
  }

  async issue(database: TransWaveDatabaseClient, userId: string, id: string): Promise<Invoice> {
    await requireTenantRole(database, userId, ["OWNER", "ADMIN", "OPERATIONS", "FINANCE"]);
    const { error } = await database.rpc("issue_invoice", { p_invoice_id: id });
    if (error) throwDatabaseError(error);
    return this.findOne(database, id);
  }

  async update(database: TransWaveDatabaseClient, userId: string, id: string, input: UpdateInvoice): Promise<Invoice> {
    await requireTenantRole(database, userId, ["OWNER", "ADMIN", "OPERATIONS", "FINANCE"]);
    const { error } = await database.rpc("update_invoice", {
      p_invoice_id: id,
      p_invoice_date: input.invoiceDate,
      p_due_date: input.dueDate,
      p_payment_date: input.paymentDate,
      p_customer_name: input.customerName,
      p_customer_trn: input.customerTrn,
      p_customer_vat_number: input.customerVatNumber,
      p_customer_address: input.customerAddress,
      p_remarks: input.remarks,
      p_details: {
        transportMode: input.transportMode,
        polName: input.polName,
        podName: input.podName,
        transshipmentPortName: input.transshipmentPortName,
        vessel: input.vessel,
        voyage: input.voyage,
        sailedDate: input.sailedDate,
        originPort: input.originPort,
        placeOfDelivery: input.placeOfDelivery,
        shipper: input.shipper,
        consignee: input.consignee,
        notifyName: input.notifyName,
        commodity: input.commodity,
        salesPerson: input.salesPerson,
        customerReference: input.customerReference,
        packageCount: input.packageCount,
        weightKg: input.weightKg,
        volumeCbm: input.volumeCbm,
        chargeableWeightKg: input.chargeableWeightKg,
        customsDocReference: input.customsDocReference,
        shipmentTerms: input.shipmentTerms,
        hbl: input.hbl,
        mbl: input.mbl,
        plannedContainerType: input.plannedContainerType,
        plannedContainerCount: input.plannedContainerCount,
        containers: input.containers,
      } as unknown as Json,
      p_lines: input.lines as unknown as Json,
    });
    if (error) throwDatabaseError(error);
    return this.findOne(database, id);
  }

  async markPaid(database: TransWaveDatabaseClient, userId: string, id: string, paymentDate: string): Promise<Invoice> {
    await requireTenantRole(database, userId, ["OWNER", "ADMIN", "OPERATIONS", "FINANCE"]);
    const { error } = await database.rpc("mark_invoice_paid", {
      p_invoice_id: id,
      p_payment_date: paymentDate,
    });
    if (error) throwDatabaseError(error);
    return this.findOne(database, id);
  }

  private toInvoice(invoice: InvoiceRow, lines: InvoiceLineRow[]): Invoice {
    const containers = containerSchema.array().safeParse(invoice.containers_snapshot);
    return {
      id: invoice.id,
      draftReference: invoice.draft_reference,
      invoiceNumber: invoice.invoice_number,
      status: invoice.status,
      createdAt: invoice.created_at,
      issuedAt: invoice.issued_at,
      invoiceDate: invoice.invoice_date,
      dueDate: invoice.due_date,
      paymentStatus: invoice.payment_date ? "PAID" : "UNPAID",
      paymentDate: invoice.payment_date,
      companyName: invoice.company_name_snapshot,
      companyTrn: invoice.company_trn_snapshot,
      companyAddress: invoice.company_address_snapshot,
      branchName: invoice.branch_name_snapshot,
      branchAddress: invoice.branch_address_snapshot,
      customerName: invoice.customer_name_snapshot,
      customerTrn: invoice.customer_trn_snapshot,
      customerVatNumber: invoice.customer_vat_number_snapshot,
      customerAddress: invoice.customer_address_snapshot,
      remarks: invoice.remarks,
      paymentTermsDays: invoice.payment_terms_days_snapshot,
      jobId: invoice.job_id,
      jobNumber: invoice.job_number_snapshot,
      polName: invoice.pol_snapshot,
      podName: invoice.pod_snapshot,
      transshipmentPortName: invoice.transshipment_port_snapshot,
      transportMode: invoice.transport_mode_snapshot,
      vessel: invoice.vessel_snapshot,
      voyage: invoice.voyage_snapshot,
      sailedDate: invoice.sailed_at_snapshot,
      originPort: invoice.origin_port_snapshot,
      placeOfDelivery: invoice.place_of_delivery_snapshot,
      shipper: invoice.shipper_snapshot,
      consignee: invoice.consignee_snapshot,
      notifyName: invoice.notify_name_snapshot,
      commodity: invoice.commodity_snapshot,
      salesPerson: invoice.sales_person_snapshot,
      customerReference: invoice.customer_reference_snapshot,
      packageCount: invoice.package_count_snapshot,
      weightKg: invoice.weight_kg_snapshot === null ? null : Number(invoice.weight_kg_snapshot),
      volumeCbm: invoice.volume_cbm_snapshot === null ? null : Number(invoice.volume_cbm_snapshot),
      chargeableWeightKg: invoice.chargeable_weight_kg_snapshot === null ? null : Number(invoice.chargeable_weight_kg_snapshot),
      customsDocReference: invoice.customs_doc_reference_snapshot,
      shipmentTerms: invoice.shipment_terms_snapshot,
      hbl: invoice.hbl_snapshot,
      mbl: invoice.mbl_snapshot,
      plannedContainerType: invoice.planned_container_type_snapshot,
      plannedContainerCount: invoice.planned_container_count_snapshot,
      containers: containers.success ? containers.data : [],
      lines: lines.map(line => ({
        id: line.id,
        chargeId: line.job_charge_id,
        lineNumber: line.line_number,
        serviceCode: line.service_code_snapshot,
        serviceName: line.service_name_snapshot,
        description: line.description_snapshot,
        quantity: decimal(line.quantity),
        uom: line.uom_snapshot,
        currency: line.currency_code_snapshot,
        exchangeRate: decimal(line.exchange_rate_snapshot),
        unitRate: money(line.unit_rate_snapshot),
        taxCode: line.tax_code_snapshot,
        taxRate: decimal(line.tax_rate_snapshot),
        netAmount: money(line.taxable_amount_aed),
        vatAmount: money(line.vat_amount_aed),
        totalAmount: money(line.total_amount_aed)
      })),
      subtotal: money(invoice.subtotal_aed),
      vatAmount: money(invoice.vat_amount_aed),
      total: money(invoice.total_aed)
    };
  }
}
