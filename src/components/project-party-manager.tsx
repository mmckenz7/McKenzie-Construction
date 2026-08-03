"use client";
import { FormEvent, useState } from "react";

type Party = { id: string; party_type: string; name: string; trade_role: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null; workflow_permissions: string[] };
type Supplier = { id: string; name: string };

export function ProjectPartyManager({ projectId, initialParties, suppliers }: { projectId: string; initialParties: Party[]; suppliers: Supplier[] }) {
  const [parties, setParties] = useState(initialParties), [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); const form = new FormData(event.currentTarget);
    const supplierId = String(form.get("supplierId") ?? ""); const supplier = suppliers.find((item) => item.id === supplierId);
    const response = await fetch(`/api/projects/${projectId}/parties`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partyType: form.get("partyType"), supplierId, name: supplier?.name ?? form.get("name"), tradeRole: form.get("tradeRole"), contactName: form.get("contactName"), contactEmail: form.get("contactEmail"), contactPhone: form.get("contactPhone"), workflows: form.getAll("workflows") }) });
    const result = await response.json(); if (!response.ok) { setMessage(result.error ?? "Unable to add project partner."); return; }
    setParties((current) => [...current, result.party]); event.currentTarget.reset(); setMessage("Project partner added.");
  }
  return <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
    <form onSubmit={submit} className="border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Add subcontractor or vendor</h2><p className="mt-1 text-sm text-slate-600">External partners are kept separate from internal employees.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><Field label="Type"><select name="partyType" className="input" required><option value="subcontractor">Subcontractor</option><option value="vendor">Vendor</option></select></Field><Field label="Existing vendor"><select name="supplierId" className="input"><option value="">Create new</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field><Field label="Company name"><input name="name" className="input" placeholder="Required for new company" /></Field><Field label="Trade or role"><input name="tradeRole" className="input" required /></Field><Field label="Contact name"><input name="contactName" className="input" /></Field><Field label="Email"><input type="email" name="contactEmail" className="input" /></Field><Field label="Phone"><input type="tel" name="contactPhone" className="input" /></Field></div>
      <fieldset className="mt-4"><legend className="text-sm font-bold">Allowed workflows</legend><div className="mt-2 flex flex-wrap gap-4">{["schedule","bid","material","vendor"].map((item) => <label key={item} className="text-sm capitalize"><input type="checkbox" name="workflows" value={item} className="mr-2" />{item}</label>)}</div></fieldset>
      <button className="mt-5 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">Connect to project</button>{message ? <p className="mt-3 text-sm">{message}</p> : null}
    </form>
    <section className="border border-slate-200 bg-white shadow-sm"><h2 className="border-b border-slate-200 px-5 py-4 text-lg font-bold">External project team</h2>{parties.length ? <div className="divide-y divide-slate-100">{parties.map((p) => <article key={p.id} className="p-5"><div className="flex justify-between gap-3"><strong>{p.name}</strong><span className="text-xs font-bold uppercase tracking-wide text-amber-800">External {p.party_type}</span></div><p className="mt-1 text-sm text-slate-600">{p.trade_role}</p><p className="mt-2 text-xs text-slate-500">Workflows: {p.workflow_permissions.length ? p.workflow_permissions.join(", ") : "None selected"}</p></article>)}</div> : <p className="p-6 text-sm text-slate-500">No subcontractors or vendors are connected yet.</p>}</section>
  </div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">{label}</span>{children}</label>; }
