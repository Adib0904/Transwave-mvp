import { Injectable } from "@nestjs/common";
import { containerSchema, type Invoice } from "@transwave/contracts";
import type { Database, TransWaveDatabaseClient } from "@transwave/database";
import { requireData, throwDatabaseError } from "../common/database-error.js";
import { decimal, money } from "../common/format.js";
import { requireTenantRole } from "../common/tenant.js";

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type InvoiceLineRow = Database["public"]["Tables"]["invoice_lines"]["Row"];

@Injectable()
export class InvoicesService {
  async list(database: TransWaveDatabaseClient): Promise<Invoice[]> {
    const { data: invoices, error } = await database.from("invoices").select("*").order("created_at", { ascending: false });
    if (error) throwDatabaseError(error);
    if (!invoices?.length) return [];

    const { data: lines, error: linesError } = await database
      .from("invoice_lines")
      .select("*")
      .in("invoice_id", invoices.map(invoice => invoice.id))
      .order("line_number");
    if (linesError) throwDatabaseError(linesError);
    return invoices.map(invoice => this.toInvoice(invoice, (lines ?? []).filter(line => line.invoice_id === invoice.id)));
  }

  async findOne(database: TransWaveDatabaseClient, id: string): Promise<Invoice> {
    const [invoiceResult, linesResult] = await Promise.all([
      database.from("invoices").select("*").eq("id", id).maybeSingle(),
      database.from("invoice_lines").select("*").eq("invoice_id", id).order("line_number")
    ]);
    const invoice = requireData(invoiceResult.data, invoiceResult.error, "Invoice not found");
    if (linesResult.error) throwDatabaseError(linesResult.error);
    return this.toInvoice(invoice, linesResult.data ?? []);
  }

  async createDraft(database: TransWaveDatabaseClient, userId: string, jobId: string, chargeIds: string[]): Promise<Invoice> {
    await requireTenantRole(database, userId, ["OWNER", "ADMIN", "FINANCE"]);
    const { data: invoiceId, error } = await database.rpc("create_invoice_draft", {
      p_job_id: jobId,
      p_charge_ids: chargeIds
    });
    if (error) throwDatabaseError(error);
    return this.findOne(database, invoiceId);
  }

  async issue(database: TransWaveDatabaseClient, userId: string, id: string): Promise<Invoice> {
    await requireTenantRole(database, userId, ["OWNER", "ADMIN", "FINANCE"]);
    const { error } = await database.rpc("issue_invoice", { p_invoice_id: id });
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
      companyName: invoice.company_name_snapshot,
      companyTrn: invoice.company_trn_snapshot,
      companyAddress: invoice.company_address_snapshot,
      branchName: invoice.branch_name_snapshot,
      branchAddress: invoice.branch_address_snapshot,
      customerName: invoice.customer_name_snapshot,
      customerTrn: invoice.customer_trn_snapshot,
      customerAddress: invoice.customer_address_snapshot,
      paymentTermsDays: invoice.payment_terms_days_snapshot,
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
