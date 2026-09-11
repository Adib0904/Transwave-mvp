"use client";
import { useState } from "react";

export type EditableJob = {
  id: string; customer: string; mode: string; services: string[]; pol: string; pod: string;
  status: "Open" | "Ready to invoice" | "Invoiced"; value: number; plannedEquipment: string;
  containers: string[]; hbl: string; vessel: string;
};
const equipment = ["20GP", "20SD", "40GP", "40HC", "20RF", "40RF"];
export default function JobEditor({ job, customers, ports, onSave, onClose }: {
  job: EditableJob; customers: string[]; ports: string[];
  onSave: (job: EditableJob) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState({ ...job, services: [...job.services] });
  const [quantity, setQuantity] = useState(job.plannedEquipment.split(" × ")[0]);
  const [type, setType] = useState(job.plannedEquipment.split(" × ")[1] || "20GP");
  const [containers, setContainers] = useState(job.containers.map(value => {
    const [number, type] = value.split(" · "); return { number, type: type || "20GP" };
  }));
  const [error, setError] = useState("");
  const services = Array.from(new Set([...job.services, "Ocean Freight", "Air Freight", "Land Transport", "Clearance", "Delivery", "Documentation", "Exworks Charges", "BL"]));
  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.customer.trim() || !draft.pol.trim() || !draft.pod.trim() || !draft.services.length) {
      setError("Choose a customer, POL, POD and at least one service."); return;
    }
    if (!Number.isInteger(Number(quantity)) || Number(quantity) < 1) {
      setError("Planned container quantity must be a positive whole number."); return;
    }
    const normalized = containers.map(c => ({ ...c, number: c.number.trim().toUpperCase() }));
    if (normalized.some(c => !/^[A-Z]{4}[0-9]{7}$/.test(c.number))) {
      setError("Each container number must contain four letters followed by seven digits."); return;
    }
    if (new Set(normalized.map(c => c.number)).size !== normalized.length) {
      setError("Container numbers must be unique within the job."); return;
    }
    if (normalized.length > Number(quantity)) {
      setError("Planned quantity cannot be smaller than the actual container list."); return;
    }
    onSave({ ...draft, plannedEquipment: quantity + " × " + type,
      containers: normalized.map(c => c.number + " · " + c.type) });
  }
  return <div className="overlay"><form className="modal job-editor" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="edit-job-title">
    <div className="panel-head"><div><h2 id="edit-job-title">Edit job</h2><p>{job.id}</p></div><button className="x" type="button" aria-label="Close job editor" onClick={onClose}>×</button></div>
    <p>Update this job’s details. Customer selection changes the billing customer for this job.</p>
    <label>Customer<select required value={draft.customer} onChange={e => setDraft({ ...draft, customer: e.target.value })}>{Array.from(new Set([draft.customer, ...customers])).map(c => <option key={c}>{c}</option>)}</select></label>
    <div className="two">{(["pol", "pod"] as const).map(key => <label key={key}>{key.toUpperCase()}<select required value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })}>{Array.from(new Set([draft[key], ...ports])).map(p => <option key={p}>{p}</option>)}</select></label>)}</div>
    <label>Transport mode<select value={draft.mode} onChange={e => setDraft({ ...draft, mode: e.target.value })}>{["SEA", "ROAD", "AIR", "MULTIMODAL"].map(m => <option key={m}>{m}</option>)}</select></label>
    <fieldset><legend>Services</legend><div className="service-picker">{services.map(s => <label className="service-check" key={s}><input type="checkbox" checked={draft.services.includes(s)} onChange={e => setDraft({ ...draft, services: e.target.checked ? [...draft.services, s] : draft.services.filter(v => v !== s) })}/>{s}</label>)}</div></fieldset>
    <div className="two"><label>Vessel / voyage<input value={draft.vessel} onChange={e => setDraft({ ...draft, vessel: e.target.value })}/></label><label>HBL / MBL reference<input value={draft.hbl} onChange={e => setDraft({ ...draft, hbl: e.target.value })}/></label></div>
    <h3>Planned equipment</h3><div className="two"><label>Number of containers<input required type="number" min="1" step="1" value={quantity} onChange={e => setQuantity(e.target.value)}/></label><label>Container type<select value={type} onChange={e => setType(e.target.value)}>{Array.from(new Set([type, ...equipment, "LCL"])).map(t => <option key={t}>{t}</option>)}</select></label></div>
    <h3>Actual containers ({containers.length})</h3>
    {containers.map((c, i) => <div className="container-edit-row" key={i}><label>Container number {i + 1}<input required value={c.number} placeholder="ABCD1234567" onChange={e => setContainers(containers.map((v, n) => n === i ? { ...v, number: e.target.value } : v))}/></label><label>Type<select value={c.type} onChange={e => setContainers(containers.map((v, n) => n === i ? { ...v, type: e.target.value } : v))}>{Array.from(new Set([c.type, ...equipment])).map(t => <option key={t}>{t}</option>)}</select></label><button type="button" className="soft" aria-label={"Remove container " + (i + 1)} onClick={() => setContainers(containers.filter((_, n) => n !== i))}>Remove</button></div>)}
    <button type="button" className="link-button" onClick={() => setContainers([...containers, { number: "", type }])}>+ Add container row</button>
    {error && <p role="alert" className="edit-error">{error}</p>}
    <div className="form-actions"><button className="soft" type="button" onClick={onClose}>Cancel</button><button className="button" type="submit">Save changes</button></div>
  </form></div>;
}
