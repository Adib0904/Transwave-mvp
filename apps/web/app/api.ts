import { createClient, type Session } from "@supabase/supabase-js";
import type { Customer, Invoice, JobDetail, JobSummary, MasterData, Port, SaveContainer, SaveCustomer, SaveJob, SavePort, SaveService, UserContext, CreateCharge, ManagedUser, CreateManagedUser, UpdateManagedUser } from "@transwave/contracts";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!supabaseUrl || !supabaseKey) throw new Error("Supabase browser environment is not configured");

export const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function call<T>(session: Session, path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  if (init?.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : typeof data?.message?.message === "string" ? data.message.message : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export const api = {
  me: (s: Session) => call<UserContext>(s, "/account/me"),
  masters: (s: Session) => call<MasterData>(s, "/masters"),
  createCustomer: (s: Session, value: SaveCustomer) => call<Customer>(s, "/masters/customers", { method: "POST", body: JSON.stringify(value) }),
  updateCustomer: (s: Session, id: string, value: Partial<SaveCustomer>) => call<Customer>(s, `/masters/customers/${id}`, { method: "PATCH", body: JSON.stringify(value) }),
  createPort: (s: Session, value: SavePort) => call<Port>(s, "/masters/ports", { method: "POST", body: JSON.stringify(value) }),
  updatePort: (s: Session, id: string, value: Partial<SavePort>) => call<Port>(s, `/masters/ports/${id}`, { method: "PATCH", body: JSON.stringify(value) }),
  createService: (s: Session, value: SaveService) => call(s, "/masters/services", { method: "POST", body: JSON.stringify(value) }),
  updateService: (s: Session, id: string, value: Partial<SaveService>) => call(s, `/masters/services/${id}`, { method: "PATCH", body: JSON.stringify(value) }),
  jobs: (s: Session) => call<JobSummary[]>(s, "/jobs"),
  job: (s: Session, id: string) => call<JobDetail>(s, `/jobs/${id}`),
  createJob: (s: Session, value: SaveJob) => call<JobDetail>(s, "/jobs", { method: "POST", body: JSON.stringify(value) }),
  updateJob: (s: Session, id: string, value: SaveJob) => call<JobDetail>(s, `/jobs/${id}`, { method: "PATCH", body: JSON.stringify(value) }),
  addContainer: (s: Session, id: string, value: SaveContainer) => call<JobDetail>(s, `/jobs/${id}/containers`, { method: "POST", body: JSON.stringify(value) }),
  removeContainer: (s: Session, id: string, containerId: string) => call<JobDetail>(s, `/jobs/${id}/containers/${containerId}`, { method: "DELETE" }),
  saveCharge: (s: Session, id: string, value: CreateCharge) => call<JobDetail>(s, `/jobs/${id}/charges`, { method: "POST", body: JSON.stringify(value) }),
  removeCharge: (s: Session, id: string, chargeId: string) => call<JobDetail>(s, `/jobs/${id}/charges/${chargeId}`, { method: "DELETE" }),
  invoices: (s: Session) => call<Invoice[]>(s, "/invoices"),
  invoice: (s: Session, id: string) => call<Invoice>(s, `/invoices/${id}`),
  createDraft: (s: Session, jobId: string, chargeIds: string[]) => call<Invoice>(s, "/invoices/drafts", { method: "POST", body: JSON.stringify({ jobId, chargeIds }) }),
  issueInvoice: (s: Session, id: string) => call<Invoice>(s, `/invoices/${id}/issue`, { method: "POST" })
  ,users: (s: Session) => call<ManagedUser[]>(s, "/users")
  ,createUser: (s: Session, value: CreateManagedUser) => call<ManagedUser>(s, "/users", { method: "POST", body: JSON.stringify(value) })
  ,updateUser: (s: Session, id: string, value: UpdateManagedUser) => call<ManagedUser>(s, `/users/${id}`, { method: "PATCH", body: JSON.stringify(value) })
};
