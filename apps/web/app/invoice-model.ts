import type { EditableJob } from "./job-editor";

export type Charge = { id: string; name: string; qty: number; uom: string; currency: "AED"; rate: number; vat: number; container: string };
export type DraftInvoice = { id: string; status: "DRAFT" | "ISSUED"; issuedAt: string | null; job: EditableJob; customerTrn: string; paymentTerms: string; createdAt: string; lines: Charge[] };
export type BillingState = { chargesByJob: Record<string, Charge[]>; invoices: DraftInvoice[]; nextSequence: number };
export const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
export function lineAmounts(line: Charge) {
  const net = roundMoney(line.qty * line.rate);
  const vat = roundMoney(net * line.vat / 100);
  return { net, vat, total: roundMoney(net + vat) };
}
export function invoiceAmounts(lines: Charge[]) {
  return lines.reduce((sum, line) => {
    const amounts = lineAmounts(line);
    return { net: roundMoney(sum.net + amounts.net), vat: roundMoney(sum.vat + amounts.vat), total: roundMoney(sum.total + amounts.total) };
  }, { net: 0, vat: 0, total: 0 });
}
export function validCharge(line: Charge) {
  return !!line.name.trim() && Number.isFinite(line.qty) && line.qty > 0 && Number.isFinite(line.rate) && line.rate >= 0 && Number.isFinite(line.vat) && line.vat >= 0 && Number.isSafeInteger(Math.round(lineAmounts(line).total * 100));
}
export function allocatedInvoice(invoices: DraftInvoice[], jobId: string, chargeId: string) {
  return invoices.find(invoice => invoice.job.id === jobId && invoice.lines.some(line => line.id === chargeId));
}
export function availableCharges(state: BillingState, jobId: string) {
  return (state.chargesByJob[jobId] || []).filter(line => !allocatedInvoice(state.invoices, jobId, line.id));
}
export const draftId = (sequence: number) => `INV/TSW/2026/${String(sequence).padStart(5, "0")}`;
export function draftCharges(state: BillingState, jobId: string, chargeIds: string[]): Charge[] | null {
  const ids = new Set(chargeIds);
  const lines = availableCharges(state, jobId).filter(line => ids.has(line.id));
  return ids.size && lines.length === ids.size && lines.every(validCharge) && Number.isSafeInteger(Math.round(invoiceAmounts(lines).total * 100)) ? lines : null;
}
export const serviceKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
type BillingAction = { type: "issueInvoice"; invoiceId: string; issuedAt: string } | { type: "addCharge" | "updateCharge"; jobId: string; charge: Charge } | { type: "createDraft"; job: EditableJob; chargeIds: string[]; customerTrn: string; paymentTerms: string; createdAt: string };
export function billingReducer(state: BillingState, action: BillingAction): BillingState {
  if (action.type === "issueInvoice") {
    const invoice = state.invoices.find(item => item.id === action.invoiceId);
    if (!invoice || invoice.status !== "DRAFT" || !Number.isFinite(Date.parse(action.issuedAt))) return state;
    return { ...state, invoices: state.invoices.map(item => item.id === invoice.id ? { ...item, status: "ISSUED", issuedAt: action.issuedAt } : item) };
  }
  if (action.type !== "createDraft") {
    const existing = state.chargesByJob[action.jobId] || [];
    if (!validCharge(action.charge)) return state;
    if (action.type === "updateCharge") {
      const original = existing.find(line => line.id === action.charge.id);
      if (!original || allocatedInvoice(state.invoices, action.jobId, original.id) || serviceKey(original.name) !== serviceKey(action.charge.name)) return state;
      return { ...state, chargesByJob: { ...state.chargesByJob, [action.jobId]: existing.map(line => line.id === original.id ? { ...action.charge, name: original.name, container: original.container } : line) } };
    }
    if (existing.some(line => line.id === action.charge.id || serviceKey(line.name) === serviceKey(action.charge.name))) return state;
    return { ...state, chargesByJob: { ...state.chargesByJob, [action.jobId]: [...existing, { ...action.charge }] } };
  }
  const lines = draftCharges(state, action.job.id, action.chargeIds);
  // Validate against current allocations atomically, including rapid repeated clicks.
  if (!lines) return state;
  const invoice: DraftInvoice = {
    id: draftId(state.nextSequence), status: "DRAFT", issuedAt: null, job: { ...action.job, services: [...action.job.services], containers: [...action.job.containers] },
    customerTrn: action.customerTrn, paymentTerms: action.paymentTerms, createdAt: action.createdAt,
    lines: lines.map(line => ({ ...line }))
  };
  return { ...state, invoices: [invoice, ...state.invoices], nextSequence: state.nextSequence + 1 };
}
