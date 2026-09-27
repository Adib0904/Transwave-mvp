import assert from "node:assert/strict";
import test from "node:test";
import {
  attachVendorDocumentSchema,
  calculateLineAmounts,
  createDraftSchema,
  createManagedUserSchema,
  normalizeServiceName,
  saveContainerSchema,
  saveCustomerSchema,
  saveServiceSchema,
  saveVendorSchema,
  saveVendorBillSchema,
  updateInvoiceSchema,
} from "./index.js";

test("calculates net, VAT and total using line-first monetary rounding", () => {
  assert.deepEqual(calculateLineAmounts("1", "3200.00", "5"), {
    netAmount: "3200.00",
    vatAmount: "160.00",
    totalAmount: "3360.00"
  });
  assert.deepEqual(calculateLineAmounts("0.333", "10.00", "5"), {
    netAmount: "3.33",
    vatAmount: "0.17",
    totalAmount: "3.50"
  });
});

test("normalizes service identity and rejects duplicate draft charge ids", () => {
  assert.equal(normalizeServiceName("  LAND   Transport "), "land transport");
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(createDraftSchema.safeParse({ jobId: id, chargeIds: [id, id] }).success, false);
});

test("accepts carrier-specific container references", () => {
  assert.equal(
    saveContainerSchema.safeParse({
      containerNumber: "carrier-ref-7",
      size: "20",
      containerType: "GP",
      sealNumber: null,
    }).success,
    true,
  );
});

test("validates managed portal users and strong temporary passwords", () => {
  assert.equal(createManagedUserSchema.safeParse({ email: "new@transwave.local", name: "New User", role: "OPERATIONS", temporaryPassword: "Temporary123!" }).success, true);
  assert.equal(createManagedUserSchema.safeParse({ email: "invalid", name: "N", role: "POWER_USER", temporaryPassword: "short" }).success, false);
});

test("validates AED and USD vendor invoice lines", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const input = {
    vendorId: id,
    jobId: id,
    customerInvoiceId: null,
    vendorInvoiceNumber: "OTSDXB260700096",
    billDate: "2026-07-15",
    dueDate: null,
    dateOfSupply: "2026-07-15",
    status: "DRAFT",
    revenueAllocatedAed: "0.00",
    lines: [
      {
        serviceId: null,
        description: "Ocean freight",
        quantity: "4",
        uom: "CNTR",
        currency: "USD",
        exchangeRate: "3.685",
        unitRate: "2000.00",
        taxRate: "0",
      },
    ],
  };
  assert.equal(saveVendorBillSchema.safeParse(input).success, true);
  assert.equal(
    saveVendorBillSchema.safeParse({
      ...input,
      lines: [{ ...input.lines[0], currency: "AED", exchangeRate: "3.685" }],
    }).success,
    false,
  );
});

test("accepts only PDF vendor document metadata", () => {
  assert.equal(
    attachVendorDocumentSchema.safeParse({
      storagePath: "company/vendor-bills/bill/source.pdf",
      fileName: "Vendor Invoice.PDF",
    }).success,
    true,
  );
  assert.equal(
    attachVendorDocumentSchema.safeParse({
      storagePath: "company/vendor-bills/bill/source.pdf",
      fileName: "invoice.exe",
    }).success,
    false,
  );
});

test("allows invoice revisions without customer TRN or VAT number", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const result = updateInvoiceSchema.safeParse({
    invoiceDate: "2026-09-23",
    dueDate: null,
    customerName: "CUSTOMER LLC",
    customerTrn: "",
    customerVatNumber: null,
    customerAddress: null,
    remarks: null,
    lines: [
      {
        id,
        description: "OCEAN FREIGHT",
        quantity: "1",
        uom: "CNT",
        currency: "AED",
        exchangeRate: "1",
        unitRate: "100.00",
        taxRateId: id,
      },
    ],
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.customerTrn, null);
    assert.equal(result.data.customerVatNumber, null);
    assert.equal(result.data.paymentDate, null);
  }
});

test("allows customers without tax IDs and defaults new master records to USD", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const customer = saveCustomerSchema.parse({
    name: "CUSTOMER LLC",
    trn: "",
    vatNumber: null,
    email: null,
  });
  const vendor = saveVendorSchema.parse({ name: "VENDOR LLC", email: null });
  const service = saveServiceSchema.parse({
    code: "OCEAN",
    name: "OCEAN FREIGHT",
    defaultUom: "CNT",
    defaultTaxRateId: id,
  });
  assert.equal(customer.trn, null);
  assert.equal(customer.vatNumber, null);
  assert.equal(customer.defaultCurrency, "USD");
  assert.equal(vendor.defaultCurrency, "USD");
  assert.equal(service.defaultCurrency, "USD");
});
