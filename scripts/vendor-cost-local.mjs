import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";

loadEnvFile("apps/api/.env");

const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const apiBase = "http://127.0.0.1:3001/api/v1";

if (!supabaseUrl || !publishableKey || !secretKey) {
  throw new Error("Local vendor-cost test environment is not configured");
}

const system = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function signIn(email, password) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert(response.ok, `Sign-in failed: ${response.status}`);
  return (await response.json()).access_token;
}

async function api(path, token, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const finance = await signIn("finance@transwave.local", "Transwave123!");
const viewer = await signIn("viewer@secondco.local", "Secondco123!");
const suffix = Date.now().toString(36).toUpperCase();
let vendorId;
let billId;
let temporaryJobId;
let temporaryInvoiceId;

try {
  const [invoices, masters] = await Promise.all([
    api("/invoices", finance),
    api("/masters", finance),
  ]);
  assert(invoices.status === 200, "Customer invoices were not returned");
  assert(masters.status === 200, `Master data was not returned: ${JSON.stringify(masters.body)}`);
  const service = masters.body.services.find((item) => item.name === "Ocean Freight") ?? masters.body.services[0];
  let customerInvoice = invoices.body[0];

  if (!customerInvoice) {
    const createdJob = await api("/jobs", finance, {
      method: "POST",
      body: JSON.stringify({
        customerId: masters.body.customers[0].id,
        branchId: masters.body.branches[0].id,
        transportMode: "SEA",
        status: "READY_TO_INVOICE",
        plannedContainerType: "20SD",
        plannedContainerCount: 4,
        polId: masters.body.ports[0].id,
        podId: masters.body.ports.find((port) => port.id !== masters.body.ports[0].id).id,
        transshipmentPortId: null,
        vessel: "CMA CGM AFRICA THREE",
        voyage: "0MDGWE1MA",
        sailedDate: "2026-07-12",
        originPort: "Sohar",
        placeOfDelivery: "Surabaya",
        shipper: null,
        consignee: null,
        notifyName: null,
        commodity: null,
        salesPerson: null,
        customerReference: `COST-TEST-${suffix}`,
        packageCount: null,
        weightKg: null,
        volumeCbm: null,
        chargeableWeightKg: null,
        customsDocReference: null,
        shipmentTerms: "PREPAID",
        hbl: null,
        mbl: "LCSOHSUBWHO2600124",
        containerNumbers: [],
        serviceIds: [service.id],
      }),
    });
    assert(createdJob.status === 201, `Temporary job creation failed: ${JSON.stringify(createdJob.body)}`);
    temporaryJobId = createdJob.body.id;
    const charge = await api(`/jobs/${temporaryJobId}/charges`, finance, {
      method: "POST",
      body: JSON.stringify({
        jobServiceId: createdJob.body.services[0].jobServiceId,
        description: "Customer ocean freight",
        quantity: "4",
        uom: "CNTR",
        currency: "AED",
        exchangeRate: "1",
        unitRate: "9000.00",
        taxRateId: masters.body.taxRates.find((tax) => tax.rate === "0")?.id ?? masters.body.taxRates[0].id,
      }),
    });
    assert(charge.status === 201, `Temporary customer charge failed: ${JSON.stringify(charge.body)}`);
    const chargeId = charge.body.charges[0].id;
    const draft = await api("/invoices/drafts", finance, {
      method: "POST",
      body: JSON.stringify({ jobId: temporaryJobId, chargeIds: [chargeId] }),
    });
    assert(draft.status === 201, `Temporary customer invoice failed: ${JSON.stringify(draft.body)}`);
    temporaryInvoiceId = draft.body.id;
    const issued = await api(`/invoices/${temporaryInvoiceId}/issue`, finance, { method: "POST" });
    assert(issued.status === 201, `Temporary customer invoice issue failed: ${JSON.stringify(issued.body)}`);
    customerInvoice = issued.body;
  }

  const vendor = await api("/masters/vendors", finance, {
    method: "POST",
    body: JSON.stringify({
      name: `Lancia Shipping Test ${suffix}`,
      trn: "100498428000003",
      email: null,
      phone: null,
      address: "Dubai, UAE",
      defaultCurrency: "USD",
      paymentTermsDays: 30,
      active: true,
    }),
  });
  assert(vendor.status === 201, `Vendor creation failed: ${JSON.stringify(vendor.body)}`);
  vendorId = vendor.body.id;

  const allocation = Number(customerInvoice.subtotal).toFixed(2);
  const billInput = {
    vendorId,
    jobId: customerInvoice.jobId,
    customerInvoiceId: customerInvoice.id,
    vendorInvoiceNumber: `OTSDXB-${suffix}`,
    billDate: "2026-07-15",
    dueDate: null,
    dateOfSupply: "2026-07-15",
    blNumber: "LCSOHSUBWHO2600124",
    department: "OTHER",
    remarks: "Automated vendor-cost flow check",
    sourceFileName: "OTSDXB260700096 INV.pdf",
    status: "APPROVED",
    revenueAllocatedAed: allocation,
    lines: [{
      serviceId: service?.id ?? null,
      description: "Ocean freight",
      quantity: "4",
      uom: "CNTR",
      currency: "USD",
      exchangeRate: "3.685",
      unitRate: "2000.00",
      taxRate: "0",
    }],
  };

  const created = await api("/vendor-bills", finance, {
    method: "POST",
    body: JSON.stringify(billInput),
  });
  assert(created.status === 201, `Vendor invoice creation failed: ${JSON.stringify(created.body)}`);
  billId = created.body.id;
  assert(created.body.customerInvoiceId === customerInvoice.id, "Customer invoice was not linked");
  assert(created.body.subtotalAed === "29480.00", "USD cost was not converted at 3.685");
  assert(created.body.profitAed === (Number(allocation) - 29480).toFixed(2), "Profit was not calculated from allocated income and vendor cost");

  const updated = await api(`/vendor-bills/${billId}`, finance, {
    method: "PATCH",
    body: JSON.stringify({ ...billInput, lines: [{ ...billInput.lines[0], unitRate: "1900.00" }] }),
  });
  assert(updated.status === 200, `Vendor invoice update failed: ${JSON.stringify(updated.body)}`);
  assert(updated.body.lines.length === 1, "Updating a vendor cost duplicated its line");
  assert(updated.body.subtotalAed === "28006.00", "Updated vendor expense is incorrect");

  const crossTenant = await api(`/vendor-bills/${billId}`, viewer);
  assert(crossTenant.status === 404, "A vendor invoice crossed the tenant boundary");

  console.log(JSON.stringify({
    linkedCustomerInvoice: created.body.customerInvoiceNumber,
    usdToAedRate: created.body.lines[0].exchangeRate,
    originalExpenseAed: created.body.subtotalAed,
    updatedExpenseAed: updated.body.subtotalAed,
    updatedLineCount: updated.body.lines.length,
    profitAed: updated.body.profitAed,
    tenantIsolation: "passed",
  }, null, 2));
} finally {
  if (billId) await api(`/vendor-bills/${billId}`, finance, { method: "DELETE" });
  if (vendorId) await system.from("vendors").delete().eq("id", vendorId);
  if (temporaryInvoiceId) await system.from("invoices").delete().eq("id", temporaryInvoiceId);
  if (temporaryJobId) await system.from("jobs").delete().eq("id", temporaryJobId);
}
