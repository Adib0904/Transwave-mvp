import { loadEnvFile } from "node:process";

loadEnvFile("apps/api/.env");

const authBase = process.env.SUPABASE_URL;
const apiBase = "http://127.0.0.1:3001/api/v1";
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!authBase || !publishable) throw new Error("Local API environment is not configured");

async function signIn(email, password) {
  const response = await fetch(`${authBase}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishable, "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) throw new Error(`Sign-in failed: ${response.status}`);
  return (await response.json()).access_token;
}

async function request(path, token, init = {}) {
  const contentHeaders = init.body === undefined ? {} : { "content-type": "application/json" };
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...contentHeaders, ...(init.headers ?? {}) }
  });
  return { status: response.status, body: await response.json() };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const finance = await signIn("finance@transwave.local", "Transwave123!");
const viewer = await signIn("viewer@secondco.local", "Secondco123!");
const financeJobs = await request("/jobs", finance);
assert(financeJobs.status === 200 && financeJobs.body.length === 2, "Finance jobs were not returned");
assert(!financeJobs.body.some(job => job.jobNumber.startsWith("SC-")), "Finance user crossed the tenant boundary");

const viewerJobs = await request("/jobs", viewer);
assert(viewerJobs.status === 200 && viewerJobs.body.length === 1, "Viewer jobs were not isolated");
assert(viewerJobs.body[0].jobNumber === "SC-26001", "Viewer received another company's job");

const job = await request("/jobs/50000000-0000-4000-8000-000000000001", finance);
assert(job.status === 200, "Job detail was not returned");
assert(job.body.containers.length === 1, "Job-level containers were not returned");
assert(job.body.services.length === 2 && new Set(job.body.services.map(service => service.id)).size === 2, "Job services were duplicated");
assert(job.body.charges.length === 2 && job.body.charges.every(charge => !("containerId" in charge)), "Charges contain invalid container links");

const chargeIds = job.body.charges.map(charge => charge.id);
const draft = await request("/invoices/drafts", finance, {
  method: "POST",
  body: JSON.stringify({ jobId: job.body.id, chargeIds })
});
assert(draft.status === 201 && draft.body.status === "DRAFT", "Draft invoice was not created");
assert(draft.body.lines.length === 2 && draft.body.total === "3517.50", "Draft totals or lines are incorrect");

const duplicate = await request("/invoices/drafts", finance, {
  method: "POST",
  body: JSON.stringify({ jobId: job.body.id, chargeIds })
});
assert(duplicate.status === 409, "Allocated charges were accepted by a second draft");

const issued = await request(`/invoices/${draft.body.id}/issue`, finance, { method: "POST" });
assert(issued.status === 201 && issued.body.status === "ISSUED", `Draft invoice was not issued: ${issued.status} ${JSON.stringify(issued.body)}`);
assert(Boolean(issued.body.invoiceNumber), "Issued invoice number was not allocated");

const reread = await request(`/invoices/${draft.body.id}`, finance);
assert(reread.status === 200 && reread.body.invoiceNumber === issued.body.invoiceNumber, "Issued invoice could not be re-read");
assert(reread.body.containers[0]?.containerNumber === "REGU5214111", "Invoice container snapshot is incorrect");

console.log(JSON.stringify({
  financeJobs: financeJobs.body.length,
  viewerJobs: viewerJobs.body.length,
  draftLines: draft.body.lines.length,
  draftTotal: draft.body.total,
  duplicateAllocationStatus: duplicate.status,
  issuedStatus: issued.body.status,
  invoiceNumberAssigned: Boolean(issued.body.invoiceNumber),
  snapshotContainers: reread.body.containers.length
}, null, 2));
