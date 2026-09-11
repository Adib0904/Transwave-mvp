import type { DraftInvoice } from "./invoice-model";
import { invoiceAmounts, lineAmounts } from "./invoice-model";
const amount = (value: number) => value.toFixed(2);
export function PrintInvoice({ invoice }: { invoice: DraftInvoice }) {
  const totals = invoiceAmounts(invoice.lines);
  const job = invoice.job;
  return <article className="print-invoice" aria-hidden="true">
    <div className="print-heading"><div><h1>TransWave</h1><p>SHIPPING AND LOGISTICS</p></div><div><small>ORIGINAL FOR RECIPIENT</small><h2>Tax Invoice</h2><b>{invoice.id}</b></div></div>
    <div className="print-details"><section><h3>Bill To</h3><b>{job.customer}</b><p>Customer TRN: {invoice.customerTrn}</p><p>Payment terms: {invoice.paymentTerms}</p></section><section><p>Invoice date: {invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString("en-GB") : "—"}</p><p>Currency: AED</p><p>Job: {job.id}</p></section></div>
    <div className="print-shipment">{[["Transport", job.mode], ["POL", job.pol], ["Transshipment port", job.transshipmentPort || "Direct shipment"], ["POD", job.pod], ["Vessel / voyage", job.vessel || "—"], ["HBL / MBL", job.hbl || "—"], ["Planned equipment", job.plannedEquipment]].map(([label, value]) => <div key={label}><small>{label}</small><b>{value}</b></div>)}</div>
    <p className="print-containers"><b>Containers ({job.containers.length}): </b>{job.containers.join(", ") || "No actual containers captured"}</p>
    <table><thead><tr><th>Description</th><th>Qty / unit</th><th>Rate</th><th>CCY</th><th>Net</th><th>VAT</th><th>Total</th></tr></thead><tbody>{invoice.lines.map(line => { const values = lineAmounts(line); return <tr key={line.id}><td>{line.name}</td><td>{line.qty} {line.uom}</td><td>{amount(line.rate)}</td><td>{line.currency}</td><td>{amount(values.net)}</td><td>{line.vat}%<br/>{amount(values.vat)}</td><td>{amount(values.total)}</td></tr>; })}</tbody></table>
    <div className="print-totals"><p>Subtotal (AED)<b>{amount(totals.net)}</b></p><p>VAT (AED)<b>{amount(totals.vat)}</b></p><p><strong>Total (AED)</strong><strong>{amount(totals.total)}</strong></p></div>
  </article>;
}
