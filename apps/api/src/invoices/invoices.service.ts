import { BadRequestException, Injectable } from "@nestjs/common";
import { invoiceProfitTotals, containerSchema, type Invoice, type InvoiceProfitInput, type InvoiceProfitReport, type RecordPage, type UpdateInvoice } from "@transwave/contracts";
import type { Database, Json, TransWaveDatabaseClient } from "@transwave/database";
import { requireData, throwDatabaseError } from "../common/database-error.js";
import { decimal, money } from "../common/format.js";
import { requireTenantRole, resolveTenant } from "../common/tenant.js";

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type InvoiceLineRow = Database["public"]["Tables"]["invoice_lines"]["Row"];

@Injectable()
export class InvoicesService {
  async listAgents(database: TransWaveDatabaseClient, userId: string): Promise<string[]> {
    const tenant = await requireTenantRole(database, userId, ["OWNER", "ADMIN", "OPERATIONS", "FINANCE"]);
    const [legacyResult, commissionResult] = await Promise.all([
      database.from("invoice_line_profit_details").select("agent_name_snapshot").eq("company_id", tenant.companyId).not("agent_name_snapshot", "is", null),
      database.from("invoice_line_agent_commissions").select("agent_name_snapshot").eq("company_id", tenant.companyId),
    ]);
    if (legacyResult.error) throwDatabaseError(legacyResult.error);
    if (commissionResult.error) throwDatabaseError(commissionResult.error);
    return [...new Set([
      ...(legacyResult.data ?? []).map((row) => row.agent_name_snapshot?.trim()),
      ...(commissionResult.data ?? []).map((row) => row.agent_name_snapshot.trim()),
    ].filter((name): name is string => Boolean(name)))].sort((left, right) => left.localeCompare(right));
  }

  async saveProfitDetails(database: TransWaveDatabaseClient, userId: string, invoiceId: string, input: InvoiceProfitInput): Promise<Invoice> {
    await requireTenantRole(database, userId, ["OWNER", "ADMIN", "OPERATIONS", "FINANCE"]);
    if (input.agents) {
      const { error } = await database.rpc("save_invoice_profit_details_multi", {
        p_invoice_id: invoiceId,
        p_lines: input.lines.map((line) => ({
          invoice_line_id: line.invoiceLineId,
          buying_cost_per_container_aed: line.buyingCostPerContainerAed === null ? null : Number(line.buyingCostPerContainerAed),
          selling_price_per_container_aed: line.sellingPricePerContainerAed === null ? null : Number(line.sellingPricePerContainerAed),
        })) as unknown as Json,
        p_agents: input.agents.map((agent) => ({
          agent_name: agent.agentName,
          commission_per_container_aed: Number(agent.commissionPerContainerAed),
        })) as unknown as Json,
      });
      if (error) throwDatabaseError(error);
      return this.findOne(database, invoiceId);
    }
    const { error } = await database.rpc("save_invoice_profit_details", {
      p_invoice_id: invoiceId,
      p_agent_name: input.agentName as string,
      p_lines: input.lines.map((line) => ({
        invoice_line_id: line.invoiceLineId,
        buying_cost_per_container_aed: line.buyingCostPerContainerAed === null ? null : Number(line.buyingCostPerContainerAed),
        selling_price_per_container_aed: line.sellingPricePerContainerAed === null ? null : Number(line.sellingPricePerContainerAed),
        commission_per_container_aed: Number(line.commissionPerContainerAed),
      })) as unknown as Json,
    });
    if (error) throwDatabaseError(error);
    return this.findOne(database, invoiceId);
  }

  async commissionReport(database: TransWaveDatabaseClient, userId: string, fromDate: string | undefined, toDate: string | undefined, agent: string | undefined, dateBasis = "invoice"): Promise<InvoiceProfitReport> {
    const tenant = await requireTenantRole(database, userId, ["OWNER", "ADMIN", "FINANCE"]);
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!['invoice', 'payment'].includes(dateBasis) || (fromDate && !datePattern.test(fromDate)) || (toDate && !datePattern.test(toDate)) || (fromDate && toDate && fromDate > toDate)) {
      throw new BadRequestException("Select a valid invoice date range");
    }
    const dateColumn = dateBasis === "payment" ? "payment_date" : "invoice_date";
    let invoicesQuery = database.from("invoices")
      .select("id, job_id, hbl_snapshot, mbl_snapshot, invoice_number, draft_reference, invoice_date, payment_date, customer_name_snapshot, containers_snapshot, planned_container_count_snapshot, total_aed")
      .eq("company_id", tenant.companyId).eq("status", "ISSUED").not(dateColumn, "is", null)
      .order(dateColumn, { ascending: false });
    if (fromDate) invoicesQuery = invoicesQuery.gte(dateColumn, fromDate);
    if (toDate) invoicesQuery = invoicesQuery.lte(dateColumn, toDate);
    const invoiceResult = await invoicesQuery;
    if (invoiceResult.error) throwDatabaseError(invoiceResult.error);
    const invoices = invoiceResult.data ?? [];
    const invoiceIds = invoices.map((invoice) => invoice.id);
    const linesResult = invoiceIds.length
      ? await database.from("invoice_lines").select("id, invoice_id, job_charge_id, service_name_snapshot, service_code_snapshot, description_snapshot, quantity, uom_snapshot, unit_rate_snapshot, exchange_rate_snapshot, taxable_amount_aed").in("invoice_id", invoiceIds)
      : { data: [], error: null };
    if (linesResult.error) throwDatabaseError(linesResult.error);
    const lineIds = (linesResult.data ?? []).map((line) => line.id);
    const detailsResult = lineIds.length
      ? await database.from("invoice_line_profit_details").select("invoice_line_id, agent_name_snapshot, buying_cost_per_container_aed, selling_price_per_container_aed, commission_per_container_aed, commission_quantity").in("invoice_line_id", lineIds)
      : { data: [], error: null };
    if (detailsResult.error) throwDatabaseError(detailsResult.error);
    const detailsByLine = new Map((detailsResult.data ?? []).map((detail) => [detail.invoice_line_id, detail]));
    const agentCommissionResult = lineIds.length
      ? await database.from("invoice_line_agent_commissions").select("invoice_line_id, agent_name_snapshot, commission_per_container_aed").in("invoice_line_id", lineIds)
      : { data: [], error: null };
    if (agentCommissionResult.error) throwDatabaseError(agentCommissionResult.error);
    const agentCommissionsByLine = new Map<string, NonNullable<typeof agentCommissionResult.data>>();
    for (const entry of agentCommissionResult.data ?? []) agentCommissionsByLine.set(entry.invoice_line_id, [...(agentCommissionsByLine.get(entry.invoice_line_id) ?? []), entry]);
    // Costs Reports must use explicit links only. Guessing by job/B/L can attach
    // one vendor bill to multiple customer invoices and inflate buying costs.
    const vendorBillsResult = invoiceIds.length ? await database.from("vendor_bills").select("id, customer_invoice_id, vendor_invoice_number").eq("company_id", tenant.companyId).in("customer_invoice_id", invoiceIds).order("bill_date", { ascending: true }).order("vendor_invoice_number", { ascending: true }) : { data: [], error: null };
    if (vendorBillsResult.error) throwDatabaseError(vendorBillsResult.error);
    const billsByInvoice = new Map<string, { id: string; vendor_invoice_number: string }[]>();
    for (const bill of vendorBillsResult.data ?? []) {
      if (!bill.customer_invoice_id) continue;
      billsByInvoice.set(bill.customer_invoice_id, [...(billsByInvoice.get(bill.customer_invoice_id) ?? []), bill]);
    }
    const vendorBillIds = (vendorBillsResult.data ?? []).map((bill) => bill.id);
    const vendorLinesResult = vendorBillIds.length ? await database.from("vendor_bill_lines").select("vendor_bill_id, total_amount_aed").in("vendor_bill_id", vendorBillIds).order("vendor_bill_id", { ascending: true }).order("line_number", { ascending: true }) : { data: [], error: null };
    if (vendorLinesResult.error) throwDatabaseError(vendorLinesResult.error);
    const agents = [...new Set([
      ...(detailsResult.data ?? []).map((detail) => detail.agent_name_snapshot?.trim()),
      ...(agentCommissionResult.data ?? []).map((detail) => detail.agent_name_snapshot.trim()),
    ].filter((name): name is string => Boolean(name)))].sort((left, right) => left.localeCompare(right));
    const rows = invoices.map((invoice) => {
      const lines = (linesResult.data ?? []).filter((line) => line.invoice_id === invoice.id);
      const containerLines = lines.filter((line) => line.uom_snapshot.trim().toUpperCase() === "CNT");
      const containerCount = (Array.isArray(invoice.containers_snapshot) ? invoice.containers_snapshot.length : 0) || invoice.planned_container_count_snapshot || containerLines.reduce((sum, line) => sum + Number(line.quantity), 0);
      const allocatedLines = lines.filter((line) => detailsByLine.get(line.id)?.commission_quantity != null);
      const commissionLines = allocatedLines.length ? allocatedLines : containerLines;
      const recorded = commissionLines.length > 0 && commissionLines.every((line) => detailsByLine.has(line.id));
      const legacyQuantity = containerLines.reduce((sum, line) => sum + Number(line.quantity), 0);
      const agentAmounts = new Map<string, number>();
      let commission = 0;
      for (const line of commissionLines) {
        const detail = detailsByLine.get(line.id);
        const quantity = detail?.commission_quantity ?? (legacyQuantity ? Number(line.quantity) / legacyQuantity * containerCount : 0);
        if (!quantity) continue;
        const saved = agentCommissionsByLine.get(line.id) ?? [];
        const entries = saved.length ? saved : detail?.agent_name_snapshot ? [{ agent_name_snapshot: detail.agent_name_snapshot, commission_per_container_aed: detail.commission_per_container_aed }] : [];
        commission += (entries.length ? entries.reduce((sum, entry) => sum + Number(entry.commission_per_container_aed), 0) : Number(detail?.commission_per_container_aed ?? 0)) * quantity;
        for (const entry of entries) agentAmounts.set(entry.agent_name_snapshot, (agentAmounts.get(entry.agent_name_snapshot) ?? 0) + Number(entry.commission_per_container_aed) * quantity);
      }
      const linkedBills = billsByInvoice.get(invoice.id) ?? [];
      const linkedIds = new Set(linkedBills.map((bill) => bill.id));
      const vendorLines = (vendorLinesResult.data ?? []).filter((line) => linkedIds.has(line.vendor_bill_id));
      const vendorTotal = linkedBills.length && linkedBills.every((bill) => vendorLines.some((line) => line.vendor_bill_id === bill.id)) && vendorLines.every((line) => line.total_amount_aed !== null)
        ? vendorLines.reduce((sum, line) => sum + Number(line.total_amount_aed), 0) : null;
      const financials = invoiceProfitTotals(Number(invoice.total_aed), vendorTotal, recorded ? Number(money(commission)) : null);
      const invoiceAgents = [...agentAmounts.keys()].sort((left, right) => left.localeCompare(right));
      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number ?? invoice.draft_reference,
        vendorInvoiceNumbers: linkedBills.map((bill) => bill.vendor_invoice_number),
        invoiceDate: invoice.invoice_date!,
        customerName: invoice.customer_name_snapshot,
        agentName: invoiceAgents.join(", ") || null,
        agentNames: invoiceAgents,
        agentCommissions: invoiceAgents.map((name) => ({ agentName: name, commissionAed: money(agentAmounts.get(name)!) })),
        containerCount,
        buyingCostAed: vendorTotal === null ? null : money(vendorTotal),
        salesRevenueAed: money(Number(invoice.total_aed)),
        grossProfitAed: financials.totalProfit === null ? null : money(financials.totalProfit),
        commissionAed: recorded ? money(commission) : null,
        companyPureProfitAed: financials.pureProfit === null ? null : money(financials.pureProfit),
        lines: [],
      };
    }).filter((row) => {
      if (agent === "__unrecorded__") return row.commissionAed === null;
      if (agent === "__none__") return row.commissionAed !== null && row.agentNames.length === 0;
      return !agent || row.agentNames.some((name) => name.toLocaleLowerCase() === agent.toLocaleLowerCase());
    });
    const sumOrNull = (values: (string | null)[]) => values.some((value) => value === null) ? null : money(values.reduce<number>((sum, value) => sum + Number(value), 0));
    const sumKnown = (values: (string | null)[]) => money(values.reduce<number>((sum, value) => sum + Number(value ?? 0), 0));
    const byAgent = new Map<string, typeof rows>();
    for (const row of rows) {
      const groups = row.agentNames.length ? row.agentNames : row.commissionAed === null ? [] : ["No agent"];
      for (const group of groups) byAgent.set(group, [...(byAgent.get(group) ?? []), row]);
    }
    return {
      agents,
      items: rows,
      totals: {
        containerCount: rows.reduce((sum, row) => sum + row.containerCount, 0),
        buyingCostAed: sumKnown(rows.map((row) => row.buyingCostAed)),
        salesRevenueAed: sumKnown(rows.map((row) => row.salesRevenueAed)),
        grossProfitAed: sumKnown(rows.map((row) => row.grossProfitAed)),
        commissionAed: sumKnown(rows.map((row) => row.commissionAed)),
        companyPureProfitAed: sumKnown(rows.map((row) => row.companyPureProfitAed)),
        unrecordedInvoiceCount: rows.filter((row) => row.commissionAed === null).length,
        incompleteBuyingCostInvoiceCount: rows.filter((row) => row.buyingCostAed === null).length,
        incompleteCommissionInvoiceCount: rows.filter((row) => row.commissionAed === null).length,
      },
      byAgent: [...byAgent.entries()].map(([agentName, agentRows]) => ({
        agentName,
        invoiceCount: agentRows.length,
        containerCount: agentRows.reduce((sum, row) => sum + row.containerCount, 0),
        commissionAed: sumOrNull(agentRows.map((row) => row.agentCommissions.find((entry) => entry.agentName === agentName)?.commissionAed ?? "0.00")),
        companyPureProfitAed: sumOrNull(agentRows.map((row) => row.companyPureProfitAed)),
      })).sort((left, right) => left.agentName.localeCompare(right.agentName)),
    };
  }

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

  async listPage(database: TransWaveDatabaseClient, userId: string, offset: number, limit: number, vendorInvoice: string = "all"): Promise<RecordPage<Invoice>> {
    if (!["all", "linked", "missing"].includes(vendorInvoice)) {
      throw new BadRequestException("Select a valid vendor invoice filter");
    }
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
    const safeLimit = Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.floor(limit))) : 20;
    const tenant = await resolveTenant(database, userId);
    let query = database.from("invoices").select("*", { count: "exact" })
      .eq("company_id", tenant.companyId).order("created_at", { ascending: false})
      .range(safeOffset, safeOffset + safeLimit - 1);
    if (tenant.role !== "OWNER" && tenant.role !== "ADMIN") query = query.eq("created_by", userId);
    if (vendorInvoice !== "all") {
      let visibleInvoicesQuery = database.from("invoices")
        .select("id, job_id, hbl_snapshot, mbl_snapshot")
        .eq("company_id", tenant.companyId);
      if (tenant.role !== "OWNER" && tenant.role !== "ADMIN") visibleInvoicesQuery = visibleInvoicesQuery.eq("created_by", userId);
      const [visibleInvoicesResult, billsResult] = await Promise.all([
        visibleInvoicesQuery,
        database.from("vendor_bills")
          .select("customer_invoice_id, job_id, bl_number")
          .eq("company_id", tenant.companyId),
      ]);
      if (visibleInvoicesResult.error) throwDatabaseError(visibleInvoicesResult.error);
      if (billsResult.error) throwDatabaseError(billsResult.error);
      const visibleInvoices = visibleInvoicesResult.data ?? [];
      const invoicesByJob = new Map<string, typeof visibleInvoices>();
      for (const invoice of visibleInvoices) {
        const jobInvoices = invoicesByJob.get(invoice.job_id) ?? [];
        jobInvoices.push(invoice);
        invoicesByJob.set(invoice.job_id, jobInvoices);
      }
      const normalizeBl = (value: string | null | undefined) => value?.replace(/[^a-z\d]/gi, "").toUpperCase() ?? "";
      const linkedInvoiceIds = new Set<string>();
      for (const bill of billsResult.data ?? []) {
        if (bill.customer_invoice_id) {
          linkedInvoiceIds.add(bill.customer_invoice_id);
          continue;
        }
        const jobInvoices = invoicesByJob.get(bill.job_id) ?? [];
        const billBl = normalizeBl(bill.bl_number);
        if (billBl) {
          for (const invoice of jobInvoices) {
            if ([invoice.hbl_snapshot, invoice.mbl_snapshot].some((value) => normalizeBl(value) === billBl)) linkedInvoiceIds.add(invoice.id);
          }
        } else if (jobInvoices.length === 1) {
          linkedInvoiceIds.add(jobInvoices[0].id);
        }
      }
      const linkedIds = [...linkedInvoiceIds];
      if (vendorInvoice === "linked") {
        if (!linkedIds.length) return { items: [], total: 0, offset: safeOffset, limit: safeLimit, hasMore: false };
        query = query.in("id", linkedIds);
      } else if (linkedIds.length) {
        query = query.not("id", "in", `(${linkedIds.join(",")})`);
      }
    }
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
    const lineIds = (lines ?? []).map((line) => line.id);
    const detailsResult = lineIds.length
      ? await database.from("invoice_line_profit_details").select("invoice_line_id, agent_name_snapshot, buying_cost_per_container_aed, selling_price_per_container_aed, commission_per_container_aed, commission_quantity").in("invoice_line_id", lineIds)
      : { data: [], error: null };
    if (detailsResult.error) throwDatabaseError(detailsResult.error);
    const detailsByLine = new Map((detailsResult.data ?? []).map((detail) => [detail.invoice_line_id, detail]));
    const agentCommissionResult = lineIds.length
      ? await database.from("invoice_line_agent_commissions").select("invoice_line_id, agent_name_snapshot, commission_per_container_aed").in("invoice_line_id", lineIds)
      : { data: [], error: null };
    if (agentCommissionResult.error) throwDatabaseError(agentCommissionResult.error);
    const agentCommissionsByLine = new Map<string, typeof agentCommissionResult.data>();
    for (const entry of agentCommissionResult.data ?? []) agentCommissionsByLine.set(entry.invoice_line_id, [...(agentCommissionsByLine.get(entry.invoice_line_id) ?? []), entry]);
    return invoices.map((invoice) => this.toInvoice(invoice, linesByInvoice.get(invoice.id) ?? [], detailsByLine, agentCommissionsByLine));
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
    const orderedLines = [...invoice.lines].sort((left, right) => left.line_number - right.line_number);
    const lineIds = orderedLines.map((line) => line.id);
    const detailsResult = lineIds.length
      ? await database.from("invoice_line_profit_details").select("invoice_line_id, agent_name_snapshot, buying_cost_per_container_aed, selling_price_per_container_aed, commission_per_container_aed, commission_quantity").in("invoice_line_id", lineIds)
      : { data: [], error: null };
    if (detailsResult.error) throwDatabaseError(detailsResult.error);
    const agentCommissionResult = lineIds.length
      ? await database.from("invoice_line_agent_commissions").select("invoice_line_id, agent_name_snapshot, commission_per_container_aed").in("invoice_line_id", lineIds)
      : { data: [], error: null };
    if (agentCommissionResult.error) throwDatabaseError(agentCommissionResult.error);
    const agentCommissionsByLine = new Map<string, typeof agentCommissionResult.data>();
    for (const entry of agentCommissionResult.data ?? []) agentCommissionsByLine.set(entry.invoice_line_id, [...(agentCommissionsByLine.get(entry.invoice_line_id) ?? []), entry]);
    const vendorResult = await database.from("vendor_bills")
      .select("id, lines:vendor_bill_lines!vendor_bill_lines_vendor_bill_id_company_id_fkey(total_amount_aed)")
      .eq("customer_invoice_id", id);
    if (vendorResult.error) throwDatabaseError(vendorResult.error);
    const bills = vendorResult.data ?? [];
    const linkedVendorTotalAed = bills.length && bills.every((bill) => bill.lines.length > 0 && bill.lines.every((line) => line.total_amount_aed !== null))
      ? money(bills.reduce((sum, bill) => sum + bill.lines.reduce((total, line) => total + Number(line.total_amount_aed), 0), 0)) : null;
    return { ...this.toInvoice(invoice, orderedLines, new Map((detailsResult.data ?? []).map((detail) => [detail.invoice_line_id, detail])), agentCommissionsByLine), linkedVendorTotalAed };
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
      p_due_date: input.dueDate as string,
      p_payment_date: input.paymentDate as string,
      p_customer_name: input.customerName,
      p_customer_trn: input.customerTrn as string,
      p_customer_vat_number: input.customerVatNumber as string,
      p_customer_address: input.customerAddress as string,
      p_remarks: input.remarks as string,
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
    if (input.profitDetailsRecorded) {
      return this.saveProfitDetails(database, userId, id, {
        agentName: input.agentName,
        lines: input.lines.map((line) => ({
          invoiceLineId: line.id,
          buyingCostPerContainerAed: line.buyingCostPerContainerAed,
          sellingPricePerContainerAed: line.sellingPricePerContainerAed,
          commissionPerContainerAed: line.commissionPerContainerAed,
        })),
      });
    }
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

  private toInvoice(
    invoice: InvoiceRow,
    lines: InvoiceLineRow[],
    detailsByLine = new Map<string, { agent_name_snapshot: string | null; buying_cost_per_container_aed: number | null; selling_price_per_container_aed: number | null; commission_per_container_aed: number; commission_quantity?: number | null }>(),
    agentCommissionsByLine = new Map<string, { invoice_line_id: string; agent_name_snapshot: string; commission_per_container_aed: number }[]>(),
  ): Invoice {
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
      agentName: [...new Set(lines.flatMap((line) => {
        const saved = agentCommissionsByLine.get(line.id) ?? [];
        return saved.length ? saved.map((entry) => entry.agent_name_snapshot) : [detailsByLine.get(line.id)?.agent_name_snapshot].filter((name): name is string => Boolean(name));
      }))].join(", ") || null,
      profitRecorded: lines.length > 0 && lines.every((line) => detailsByLine.has(line.id)),
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
        totalAmount: money(line.total_amount_aed),
        profitDetails: detailsByLine.has(line.id) ? {
          agentName: detailsByLine.get(line.id)!.agent_name_snapshot,
          commissionQuantity: detailsByLine.get(line.id)!.commission_quantity ?? null,
          buyingCostPerContainerAed: detailsByLine.get(line.id)!.buying_cost_per_container_aed === null ? null : money(detailsByLine.get(line.id)!.buying_cost_per_container_aed!),
          sellingPricePerContainerAed: detailsByLine.get(line.id)!.selling_price_per_container_aed === null ? null : money(detailsByLine.get(line.id)!.selling_price_per_container_aed!),
          commissionPerContainerAed: money((agentCommissionsByLine.get(line.id) ?? []).reduce((sum, entry) => sum + Number(entry.commission_per_container_aed), agentCommissionsByLine.get(line.id)?.length ? 0 : Number(detailsByLine.get(line.id)!.commission_per_container_aed))),
          agentCommissions: (agentCommissionsByLine.get(line.id) ?? (detailsByLine.get(line.id)?.agent_name_snapshot ? [{ invoice_line_id: line.id, agent_name_snapshot: detailsByLine.get(line.id)!.agent_name_snapshot!, commission_per_container_aed: detailsByLine.get(line.id)!.commission_per_container_aed }] : [])).map((entry) => ({ agentName: entry.agent_name_snapshot, commissionPerContainerAed: money(entry.commission_per_container_aed) })),
        } : null,
      })),
      subtotal: money(invoice.subtotal_aed),
      vatAmount: money(invoice.vat_amount_aed),
      total: money(invoice.total_aed)
    };
  }
}
