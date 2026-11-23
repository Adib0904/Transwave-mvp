import assert from "node:assert/strict";
import test from "node:test";
import type { TransWaveDatabaseClient } from "@transwave/database";
import { InvoicesService } from "./invoices.service.js";

// Exercise the actual report calculation against persisted-style rows.
function fixture(containers = 1) {
  const line = (id: string, service: string, quantity: number, uom: string, selling: number) => ({
    id, invoice_id: "invoice", job_charge_id: id, service_name_snapshot: service,
    quantity, uom_snapshot: uom, unit_rate_snapshot: selling, exchange_rate_snapshot: 1,
    taxable_amount_aed: selling * quantity,
  });
  return {
    company_members: { company_id: "company", role: "OWNER" },
    companies: { id: "company", legal_name: "Test" },
    branches: { id: "branch", active: true },
    invoices: [{ id: "invoice", invoice_number: "INV/1", invoice_date: "2026-11-20", customer_name_snapshot: "Customer", containers_snapshot: [], planned_container_count_snapshot: containers, total_aed: 1200 * containers + 250 }],
    invoice_lines: [line("freight", "Ocean Freight", containers, "CNT", 1200), line("swbl", "SWBL", 1, "PCS", 787)],
    invoice_line_profit_details: [
      { invoice_line_id: "freight", buying_cost_per_container_aed: 1000, selling_price_per_container_aed: 1200, commission_per_container_aed: 75, commission_quantity: containers, agent_name_snapshot: "IMRAN" },
      { invoice_line_id: "swbl", buying_cost_per_container_aed: 737, selling_price_per_container_aed: 787, commission_per_container_aed: 75, commission_quantity: 0, agent_name_snapshot: "IMRAN" },
    ],
    invoice_line_agent_commissions: [{ invoice_line_id: "freight", agent_name_snapshot: "IMRAN", commission_per_container_aed: 75 }],
    job_charges: [{ id: "freight", job_service_id: "freight" }, { id: "swbl", job_service_id: "swbl" }],
    job_services: [{ id: "freight", service_id: "freight" }, { id: "swbl", service_id: "swbl" }],
    vendor_bills: [{ id: "bill", customer_invoice_id: "invoice", vendor_invoice_number: "VENDOR/1" }],
    vendor_bill_lines: [{ vendor_bill_id: "bill", total_amount_aed: 1000 * containers + 200 }] as Record<string, unknown>[],
  };
}
function database(data: Record<string, unknown>): TransWaveDatabaseClient {
  return { from(table: string) {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "not", "order", "limit", "gte", "lte"]) query[method] = () => query;
    query.single = query.maybeSingle = async () => ({ data: data[table], error: null });
    query.then = (resolve: (result: unknown) => unknown) => Promise.resolve(resolve({ data: data[table], error: null }));
    return query;
  } } as unknown as TransWaveDatabaseClient;
}
const report = (data: ReturnType<typeof fixture>) => new InvoicesService().commissionReport(database(data), "user", undefined, undefined, undefined);


void test("uses customer total minus vendor total minus agent commission", async () => {
  const result = await report(fixture());
  assert.equal(result.items[0]!.grossProfitAed, "250.00");
  assert.equal(result.items[0]!.commissionAed, "75.00");
  assert.equal(result.items[0]!.companyPureProfitAed, "175.00");
  assert.equal(result.totals.companyPureProfitAed, "175.00");
  assert.equal(result.byAgent[0]!.commissionAed, "75.00");
  assert.deepEqual(result.items[0]!.lines, []);
});
void test("invoice 00130 uses recorded totals without multiplying invoice amounts by containers", async () => {
  const data = fixture(14);
  data.invoices[0]!.total_aed = 60249.75;
  data.vendor_bill_lines[0]!.total_amount_aed = 52327;
  data.invoice_line_agent_commissions[0]!.commission_per_container_aed = 276.38;
  const result = await report(data);
  assert.equal(result.totals.grossProfitAed, "7922.75");
  assert.equal(result.totals.commissionAed, "3869.32");
  assert.equal(result.totals.companyPureProfitAed, "4053.43");
  assert.equal(result.totals.containerCount, 14);
});
void test("multiple agents are subtracted once each, independent of service count", async () => {
  const data = fixture(2);
  data.invoice_lines[1]!.uom_snapshot = "CNT";
  data.invoice_line_agent_commissions.push({ invoice_line_id: "freight", agent_name_snapshot: "OTHER", commission_per_container_aed: 25 });
  const result = await report(data);
  assert.equal(result.totals.grossProfitAed, "450.00");
  assert.equal(result.totals.commissionAed, "200.00");
  assert.equal(result.totals.companyPureProfitAed, "250.00");
  assert.deepEqual(result.byAgent.map((entry) => entry.commissionAed), ["150.00", "50.00"]);
});
void test("all linked vendor bills count exactly once", async () => {
  const data = fixture();
  data.vendor_bills.push({ id: "bill-2", customer_invoice_id: "invoice", vendor_invoice_number: "VENDOR/2" });
  data.vendor_bill_lines.push({ vendor_bill_id: "bill-2", total_amount_aed: 40 });
  const result = await report(data);
  assert.equal(result.totals.buyingCostAed, "1240.00");
  assert.equal(result.totals.companyPureProfitAed, "135.00");
});
void test("explicit zero keeps all profit; missing vendor link or commission remains unknown", async () => {
  const data = fixture();
  data.invoice_line_agent_commissions = [];
  data.invoice_line_profit_details.forEach((line) => { line.commission_per_container_aed = 0; });
  assert.equal((await report(data)).totals.companyPureProfitAed, "250.00");
  data.invoice_line_profit_details = [];
  const missingCommission = await report(data);
  assert.equal(missingCommission.items[0]!.commissionAed, null);
  assert.equal(missingCommission.items[0]!.companyPureProfitAed, null);
  data.vendor_bills = [];
  assert.equal((await report(data)).items[0]!.grossProfitAed, null);
});
void test("stale service buying and selling inputs do not affect profit", async () => {
  const data = fixture();
  data.invoice_line_profit_details.forEach((line) => { line.buying_cost_per_container_aed = 99999; line.selling_price_per_container_aed = 1; });
  data.invoice_lines[1]!.taxable_amount_aed = 99999;
  assert.equal((await report(data)).totals.companyPureProfitAed, "175.00");
});
void test("legacy commission quantities scale to the actual shipment count", async () => {
  const data = fixture(14);
  data.invoice_line_profit_details.forEach((line) => { delete (line as Partial<typeof line>).commission_quantity; });
  data.invoice_lines[0]!.quantity = 1;
  assert.equal((await report(data)).totals.commissionAed, "1050.00");
});
