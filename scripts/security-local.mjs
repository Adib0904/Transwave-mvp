import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";

loadEnvFile("apps/api/.env");

const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const apiBase = process.env.SECURITY_API_BASE ?? "http://127.0.0.1:3001/api/v1";

if (!supabaseUrl || !publishableKey || !secretKey) throw new Error("Local security test environment is not configured");

const system = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function signIn(email, password) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert(response.ok, `Sign-in failed for ${email}: ${response.status}`);
  return (await response.json()).access_token;
}

async function api(path, token, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}

async function setMembership(companyId, userId, values) {
  const result = await system.from("company_members").update(values).eq("company_id", companyId).eq("user_id", userId);
  if (result.error) throw result.error;
}

const adminToken = await signIn("finance@transwave.local", "Transwave123!");
const viewerToken = await signIn("viewer@secondco.local", "Secondco123!");
const me = await api("/account/me", adminToken);
assert(me.response.status === 200, "Administrator account context was not returned");
const { companyId, userId } = me.body;

const originalMembership = await system.from("company_members").select("role, active").eq("company_id", companyId).eq("user_id", userId).single();
if (originalMembership.error) throw originalMembership.error;

try {
  const health = await fetch(`${apiBase}/health/live`);
  assert(health.headers.get("cache-control") === "no-store", "Sensitive response caching is not disabled");
  assert(health.headers.get("x-frame-options") === "DENY", "Clickjacking protection is not strict");
  assert(Boolean(health.headers.get("x-ratelimit-limit")), "Rate limiting headers are missing");

  const anonymous = await fetch(`${apiBase}/jobs`);
  assert(anonymous.status === 401, "Anonymous API access was not rejected");

  const adminJobs = await api("/jobs", adminToken);
  assert(adminJobs.response.status === 200, "Administrator jobs were not returned");
  const invoices = await api("/invoices", adminToken);
  assert(invoices.response.status === 200 && invoices.body.length > 0, "Invoices were not returned");
  const testJobId = adminJobs.body[0]?.id ?? invoices.body[0].jobId;
  const crossTenant = await api(`/jobs/${testJobId}`, viewerToken);
  assert(crossTenant.response.status === 404, "Cross-tenant object access was not hidden");

  const invoiceId = invoices.body[0]?.id ?? "00000000-0000-4000-8000-000000000001";
  const directTamper = await fetch(`${supabaseUrl}/rest/v1/invoices?id=eq.${invoiceId}`, {
    method: "PATCH",
    headers: { apikey: publishableKey, authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
    body: JSON.stringify({ customer_name_snapshot: "Tampered" })
  });
  assert([401, 403].includes(directTamper.status), "Direct invoice snapshot tampering was not rejected");

  const ownerEscalation = await api(`/users/${userId}`, adminToken, {
    method: "PATCH",
    body: JSON.stringify({ role: "OWNER" })
  });
  assert(ownerEscalation.response.status === 403, "An administrator was allowed to promote themselves to owner");

  const masters = await api("/masters", adminToken);
  assert(masters.response.status === 200, "Master data was not returned");
  const serviceInput = {
    code: masters.body.services[0].code,
    name: masters.body.services[0].name,
    defaultUom: masters.body.services[0].defaultUom,
    defaultCurrency: masters.body.services[0].defaultCurrency,
    defaultTaxRateId: masters.body.services[0].defaultTaxRateId,
    active: masters.body.services[0].active
  };

  await setMembership(companyId, userId, { role: "OPERATIONS" });
  const operationDraft = await api("/invoices/drafts", adminToken, {
    method: "POST",
    body: JSON.stringify({ jobId: testJobId, chargeIds: ["00000000-0000-4000-8000-000000000001"] })
  });
  assert(operationDraft.response.status !== 403, "Operations role was blocked from creating an invoice draft");
  const operationSetup = await api("/masters/services", adminToken, { method: "POST", body: JSON.stringify(serviceInput) });
  assert(operationSetup.response.status !== 403, "Operations role was blocked from changing protected setup");
  const operationUsers = await api("/users", adminToken);
  assert(operationUsers.response.status === 200, "Operations role was blocked from managing portal users");
  const operationOwnerEscalation = await api(`/users/${userId}`, adminToken, {
    method: "PATCH",
    body: JSON.stringify({ role: "OWNER" })
  });
  assert(operationOwnerEscalation.response.status === 403, "Operations role was allowed to grant owner access");
  const operationVendorBills = await api("/vendor-bills", adminToken);
  assert(operationVendorBills.response.status === 200, "Operations role was blocked from viewing vendor costs and profit");

  await setMembership(companyId, userId, { role: "FINANCE" });
  const jobDetail = await api(`/jobs/${testJobId}`, adminToken);
  const financeJobUpdate = await api(`/jobs/${jobDetail.body.id}`, adminToken, {
    method: "PATCH",
    body: JSON.stringify({
      customerId: jobDetail.body.customerId,
      branchId: jobDetail.body.branchId,
      transportMode: jobDetail.body.transportMode,
      status: jobDetail.body.status,
      plannedContainerType: jobDetail.body.plannedContainerType,
      plannedContainerCount: jobDetail.body.plannedContainerCount,
      polId: jobDetail.body.polId,
      podId: jobDetail.body.podId,
      transshipmentPortId: jobDetail.body.transshipmentPortId,
      vessel: jobDetail.body.vessel,
      voyage: jobDetail.body.voyage,
      hbl: jobDetail.body.hbl,
      mbl: jobDetail.body.mbl,
      serviceIds: jobDetail.body.services.map(service => service.id)
    })
  });
  assert(financeJobUpdate.response.status === 403, `Finance operational update returned ${financeJobUpdate.response.status}: ${JSON.stringify(financeJobUpdate.body)}`);
  const financeCustomer = await api("/masters/customers", adminToken, {
    method: "POST",
    body: JSON.stringify({ name: "Security Test", trn: "SECURITY-TRN", vatNumber: "SECURITY-VAT", email: null, phone: null, billingAddress: null, defaultCurrency: "AED", paymentTermsDays: 30, active: true })
  });
  assert(financeCustomer.response.status === 403, "Finance role was allowed to create operational customer data");

  await setMembership(companyId, userId, { active: false });
  const suspended = await api("/jobs", adminToken);
  assert(suspended.response.status === 403, "A suspended membership retained API access");
} finally {
  await setMembership(companyId, userId, originalMembership.data);
}

console.log(JSON.stringify({
  authentication: "passed",
  activeMembership: "passed",
  tenantIsolation: "passed",
  operationsCombinedAccess: "passed",
  financeRoleSeparation: "passed",
  ownerEscalationProtection: "passed",
  invoiceSnapshotProtection: "passed",
  responseHeaders: "passed"
}, null, 2));
