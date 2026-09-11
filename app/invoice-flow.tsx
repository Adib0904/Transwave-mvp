"use client";
import { useEffect, useRef, useState } from "react";
import type { EditableJob } from "./job-editor";
import { allocatedInvoice, Charge, DraftInvoice, invoiceAmounts, lineAmounts } from "./invoice-model";
import "./invoice-flow.css";
import { PrintInvoice } from "./invoice-print";
import { printInvoice } from "./print-invoice";

const money = new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED" });
function IssueConfirmation({ invoice, onClose, onConfirm }: { invoice: DraftInvoice; onClose: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="overlay"><div className="modal invoice-review" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="issue-title" aria-describedby="issue-warning" onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    if (event.key === "Tab") {
      const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>("button");
      const first = buttons?.[0], last = buttons?.[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}><h2 id="issue-title">Confirm invoice issuance</h2><p><b>{invoice.id}</b></p><p>{invoice.job.customer}</p><p>Total: <b>{money.format(invoiceAmounts(invoice.lines).total)}</b></p><p id="issue-warning">The issued invoice is locked. Its customer, shipment details and charges cannot be changed. This action cannot be undone in this prototype.</p><p className="form-help">No email or payment is sent. Data remains in memory and resets on refresh.</p><div className="form-actions"><button className="soft" onClick={onClose}>Cancel</button><button className="button" onClick={onConfirm}>Issue invoice</button></div></div></div>;
}
function Totals({ lines }: { lines: Charge[] }) {
  const totals = invoiceAmounts(lines);
  return <div className="totals"><span>Subtotal <b>{money.format(totals.net)}</b></span><span>VAT <b>{money.format(totals.vat)}</b></span><strong>Invoice total <b>{money.format(totals.total)}</b></strong></div>;
}
function ChargeDescription({ line }: { line: Charge }) {
  return <div><b>{line.name}</b><small>{line.qty} {line.uom} × {money.format(line.rate)} · VAT {line.vat}%</small></div>;
}
export function JobBilling({ job, charges, invoices, onCreate, onOpen, onEdit }: { onEdit: (charge: Charge) => void; job: EditableJob; charges: Charge[]; invoices: DraftInvoice[]; onCreate: () => void; onOpen: (id: string) => void }) {
  const available = charges.filter(line => !allocatedInvoice(invoices, job.id, line.id));
  return <section className="job-billing" aria-label="Job billing"><h3>Charges for this job</h3>
    {!charges.length && <p className="form-help">Add an agreed charge to a service above before creating an invoice.</p>}
    {charges.map(line => { const invoice = allocatedInvoice(invoices, job.id, line.id); return <div className="billing-line" key={line.id}><ChargeDescription line={line}/><div className="billing-line-end"><strong>{money.format(lineAmounts(line).total)}</strong>{invoice ? <button className="link-button" onClick={() => onOpen(invoice.id)}>{invoice.status === "ISSUED" ? "Issued" : "In draft"} · {invoice.id}</button> : <><small>Unbilled</small><button className="link-button" aria-label={`Edit ${line.name} charge ${line.id}`} onClick={() => onEdit(line)}>Edit</button></>}</div></div>; })}
    <div className="billing-create"><p>{available.length ? `${available.length} unbilled charge${available.length === 1 ? "" : "s"} · ${money.format(invoiceAmounts(available).total)} including VAT` : charges.length ? "All charges are already included in an invoice. Add new charges to create another invoice." : "No unbilled charges yet."}</p><button className="button" disabled={!available.length} onClick={onCreate}>Create invoice</button></div>
  </section>;
}
export function InvoiceReview({ job, charges, onClose, onCreate }: { job: EditableJob; charges: Charge[]; onClose: () => void; onCreate: (ids: string[]) => void }) {
  const [selected, setSelected] = useState(charges.map(line => line.id));
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const lines = charges.filter(line => selected.includes(line.id));
  const totalSupported = Number.isSafeInteger(Math.round(invoiceAmounts(lines).total * 100));
  return <div className="overlay"><div className="modal invoice-review" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="invoice-review-title" onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    if (event.key === "Tab") {
      const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]');
      const first = controls?.[0], last = controls?.[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}><div className="panel-head"><div><h2 id="invoice-review-title">Create invoice</h2><p>{job.id} · {job.customer}</p></div><button className="x" aria-label="Close invoice review" onClick={onClose}>×</button></div>
    <p>Select the unbilled charges to include. Creating a draft reserves these charges and opens the invoice.</p>
    <p className="form-help">{job.pol} → {job.pod} · {job.plannedEquipment}</p>
    <div className="review-selection"><button className="link-button" onClick={() => setSelected(charges.map(line => line.id))}>Select all</button><button className="link-button" onClick={() => setSelected([])}>Clear selection</button></div>
    {charges.map(line => <label className="billing-line review-line" key={line.id}><input type="checkbox" checked={selected.includes(line.id)} onChange={event => setSelected(current => event.target.checked ? [...current, line.id] : current.filter(id => id !== line.id))}/><ChargeDescription line={line}/><strong>{money.format(lineAmounts(line).total)}</strong></label>)}
    <Totals lines={lines}/><p className="form-help">The draft keeps a copy of the current job and charge details. Later job edits will not change it. Drafts are not issued invoices.</p>
    {!totalSupported && <p role="alert" className="edit-error">This selection exceeds the supported invoice amount. Select fewer charges.</p>}
    <div className="form-actions"><button className="soft" onClick={onClose}>Cancel</button><button className="button" disabled={!lines.length || !totalSupported} onClick={() => onCreate(lines.map(line => line.id))}>Create draft ({lines.length})</button></div>
  </div></div>;
}
export function InvoiceWorkspace({ invoices, selectedId, onSelect, onJobs, onIssue }: { onIssue: (id: string) => void; invoices: DraftInvoice[]; selectedId: string; onSelect: (id: string) => void; onJobs: () => void }) {
  const [confirmIssue, setConfirmIssue] = useState(false);
  const printCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => { printCleanup.current?.(); }, []);
  const invoice = invoices.find(item => item.id === selectedId) || invoices[0];
  if (!invoice) return <section className="panel"><h2>No draft invoices yet</h2><p>Create an invoice from a job’s unbilled charges.</p><button className="button" onClick={onJobs}>Go to Jobs</button></section>;
  return <div className="invoice-layout"><section className="panel"><div className="panel-head"><div><h2>Invoices</h2><p>{invoices.length} created this session</p></div></div><div className="invoice-list">{invoices.map(item => <button key={item.id} className={item.id === invoice.id ? "invoice selected" : "invoice"} onClick={() => onSelect(item.id)}><b>{item.id}</b><span>{item.job.customer}</span><span className={`tag ${item.status === "ISSUED" ? "green" : "amber"}`}>{item.status}</span><strong>{money.format(invoiceAmounts(item.lines).total)}</strong></button>)}</div></section>
    <section className="panel"><div className="panel-head"><div><h2>{invoice.id}</h2><p>Job {invoice.job.id} · Saved in this session</p></div><span className={`tag ${invoice.status === "ISSUED" ? "green" : "amber"}`}>{invoice.status}</span></div>
      <div className="detail-grid">{[["Bill to", invoice.job.customer], ["Customer TRN", invoice.customerTrn], ["Payment terms", invoice.paymentTerms], ["Currency", "AED"], ["POL", invoice.job.pol], ["POD", invoice.job.pod], ["Transport mode", invoice.job.mode], ["Vessel / voyage", invoice.job.vessel || "Not captured"], ["HBL / MBL", invoice.job.hbl || "Not captured"], ["Planned equipment", invoice.job.plannedEquipment], ["Created", new Date(invoice.createdAt).toLocaleString()]].map(([label, value]) => <div className="detail" key={label}><small>{label}</small><b>{value}</b></div>)}</div>
      <h3>Containers ({invoice.job.containers.length})</h3><div className="chips">{invoice.job.containers.length ? invoice.job.containers.map(container => <span key={container}>{container}</span>) : <span>No actual containers captured</span>}</div>
      <h3>Invoice charges</h3>{invoice.lines.map(line => <div className="billing-line" key={line.id}><ChargeDescription line={line}/><strong>{money.format(lineAmounts(line).total)}</strong></div>)}<Totals lines={invoice.lines}/>
      <p className="form-help">Snapshot of the job at draft creation. Later job edits do not alter this invoice. Email and payments are not connected. Refresh resets this prototype.</p><div className="form-actions"><button className="soft" onClick={onJobs}>Back to Jobs</button>{invoice.status === "DRAFT" ? <button className="button" onClick={() => setConfirmIssue(true)}>Issue invoice</button> : <><p className="form-help">Issued {invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleString() : ""} · Invoice locked</p><button className="button" onClick={() => { printCleanup.current?.(); printCleanup.current = printInvoice(invoice.id); }}>Print / Save PDF</button></>}</div>{confirmIssue && invoice.status === "DRAFT" && <IssueConfirmation key={invoice.id} invoice={invoice} onClose={() => setConfirmIssue(false)} onConfirm={() => { onIssue(invoice.id); setConfirmIssue(false); }}/>}
    {invoice.status === "ISSUED" && <><p className="form-help">The browser print dialog lets you print or choose Save as PDF.</p><PrintInvoice invoice={invoice}/></>}
    </section></div>;
}
