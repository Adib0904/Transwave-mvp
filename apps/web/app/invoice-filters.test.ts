import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyInvoiceFilters,
  filterInvoices,
  type InvoiceFilters,
} from "./invoice-filters";

const invoices = [
  {
    createdAt: "2026-09-01T10:00:00.000Z",
    invoiceDate: "2026-09-10",
    customerName: "ACME LLC",
    invoiceNumber: "INV/TSW/2026/00100",
    draftReference: "DRAFT-ONE",
    hbl: "HBL-100",
    mbl: null,
    paymentStatus: "PAID" as const,
    status: "ISSUED" as const,
    polName: "SOHAR",
    podName: "NHAVA SHEVA",
  },
  {
    createdAt: "2026-09-20T10:00:00.000Z",
    invoiceDate: null,
    customerName: "BETA FZE",
    invoiceNumber: null,
    draftReference: "DRAFT-TWO",
    hbl: null,
    mbl: "MBL-200",
    paymentStatus: "UNPAID" as const,
    status: "DRAFT" as const,
    polName: "JEBEL ALI",
    podName: "MUNDRA",
  },
];

const withFilters = (filters: Partial<InvoiceFilters>) => ({
  ...emptyInvoiceFilters,
  ...filters,
});

test("filters invoice fields case-insensitively", () => {
  assert.equal(filterInvoices(invoices, withFilters({ invoiceNumber: "00100" })).length, 1);
  assert.equal(filterInvoices(invoices, withFilters({ blNumber: "mbl-200" }))[0]?.customerName, "BETA FZE");
});

test("combines route, customer, status and payment filters", () => {
  const result = filterInvoices(
    invoices,
    withFilters({
      customer: "ACME LLC",
      pol: "SOHAR",
      pod: "NHAVA SHEVA",
      invoiceStatus: "ISSUED",
      paymentStatus: "PAID",
    }),
  );
  assert.deepEqual(result.map((invoice) => invoice.invoiceNumber), ["INV/TSW/2026/00100"]);
});

test("uses creation date for drafts without an invoice date", () => {
  assert.equal(
    filterInvoices(invoices, withFilters({ dateFrom: "2026-09-20", dateTo: "2026-09-20" }))[0]
      ?.draftReference,
    "DRAFT-TWO",
  );
});
