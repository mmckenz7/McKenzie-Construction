"use client";

import { useState, type FormEvent } from "react";

import {
  buildDeckFieldBlock,
  DECK_FIELD_LIMITATIONS,
  replaceDeckFieldBlock,
  type DeckFieldDraft,
} from "@/lib/deck-field-beta";

const emptyDraft: DeckFieldDraft = {
  projectCondition: "", length: "", width: "", heightAboveGrade: "", supportType: "",
  stairs: "", stairWidth: "", railingNotes: "", surfaceAndFramingNotes: "",
  accessAndDemolitionNotes: "", utilitiesAndObstructions: "", fieldNotes: "",
};
const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base text-slate-950 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100 disabled:bg-slate-100";

export function DeckFieldBeta({
  internalNotes,
  disabled,
  onSave,
}: {
  internalNotes: string | null;
  disabled: boolean;
  onSave: (internalNotes: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<DeckFieldDraft>(emptyDraft);
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("");

  function update(key: keyof DeckFieldDraft, value: string) {
    setDraft({ ...draft, [key]: value });
    setPreview("");
    setMessage("");
  }

  function showPreview(event: FormEvent) {
    event.preventDefault();
    try { setPreview(buildDeckFieldBlock(draft)); setMessage(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The field notes could not be previewed."); }
  }

  async function save() {
    try {
      const nextNotes = replaceDeckFieldBlock(internalNotes, preview);
      if (await onSave(nextNotes)) setMessage("Deck field block saved to private internal notes. Continue with manual estimate lines below.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The field notes could not be saved."); }
  }

  return <section aria-labelledby="deck-field-title" className="overflow-hidden rounded-xl border-2 border-amber-500 bg-white shadow-sm">
    <div role="alert" className="border-b-2 border-amber-500 bg-amber-100 p-4 text-amber-950">
      <p className="text-sm font-black uppercase tracking-[.14em]">Field beta limitations</p>
      <p className="mt-2 text-sm font-semibold leading-6">{DECK_FIELD_LIMITATIONS.replace("FIELD BETA: ", "")}</p>
    </div>
    <form onSubmit={showPreview} className="p-4 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-amber-800">Deck field beta</p>
      <h2 id="deck-field-title" className="mt-1 text-2xl font-bold text-slate-950">Record what you observed</h2>
      <p className="mt-2 text-sm text-slate-600">Leave anything unknown blank. This creates private notes only—it does not create quantities, costs, or customer scope.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Select label="Existing or new deck" value={draft.projectCondition} onChange={(value) => update("projectCondition", value)} disabled={disabled} options={["Existing deck", "New deck"]} />
        <Select label="Attached or freestanding" value={draft.supportType} onChange={(value) => update("supportType", value)} disabled={disabled} options={["Attached", "Freestanding", "Not verified"]} />
        <Field label="Overall length — field measurement"><input className={input} value={draft.length} onChange={(event) => update("length", event.target.value)} disabled={disabled} placeholder="Enter value and unit" /></Field>
        <Field label="Overall width — field measurement"><input className={input} value={draft.width} onChange={(event) => update("width", event.target.value)} disabled={disabled} placeholder="Enter value and unit" /></Field>
        <Field label="Height above grade — field measurement"><input className={input} value={draft.heightAboveGrade} onChange={(event) => update("heightAboveGrade", event.target.value)} disabled={disabled} placeholder="Enter value and unit" /></Field>
        <Select label="Stairs observed" value={draft.stairs} onChange={(value) => update("stairs", value)} disabled={disabled} options={["Yes", "No", "Not verified"]} />
        <Field label="Approximate stair width"><input className={input} value={draft.stairWidth} onChange={(event) => update("stairWidth", event.target.value)} disabled={disabled} placeholder="Enter value and unit" /></Field>
        <Field label="Railing areas or notes"><textarea className={`${input} min-h-24`} value={draft.railingNotes} onChange={(event) => update("railingNotes", event.target.value)} disabled={disabled} /></Field>
        <Field label="Surface and framing condition"><textarea className={`${input} min-h-24`} value={draft.surfaceAndFramingNotes} onChange={(event) => update("surfaceAndFramingNotes", event.target.value)} disabled={disabled} /></Field>
        <Field label="Access and demolition"><textarea className={`${input} min-h-24`} value={draft.accessAndDemolitionNotes} onChange={(event) => update("accessAndDemolitionNotes", event.target.value)} disabled={disabled} /></Field>
        <Field label="Utilities and obstructions"><textarea className={`${input} min-h-24`} value={draft.utilitiesAndObstructions} onChange={(event) => update("utilitiesAndObstructions", event.target.value)} disabled={disabled} /></Field>
        <Field label="Other field notes"><textarea className={`${input} min-h-24`} value={draft.fieldNotes} onChange={(event) => update("fieldNotes", event.target.value)} disabled={disabled} /></Field>
      </div>
      {message ? <p role="status" className="mt-4 rounded-lg bg-slate-100 p-3 text-sm font-semibold text-slate-800">{message}</p> : null}
      <button disabled={disabled} className="mt-5 w-full rounded-lg bg-slate-950 px-4 py-3 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">Preview private field notes</button>
    </form>
    {preview ? <div className="border-t border-amber-300 bg-amber-50 p-4 sm:p-6">
      <div role="alert" className="rounded-lg border border-amber-500 bg-amber-100 p-3 text-sm font-bold text-amber-950">FIELD BETA — Review every entry. Nothing below is engineered, code-checked, calculated, or customer-ready.</div>
      <h3 className="mt-4 font-bold text-slate-950">Private internal-notes preview</h3>
      <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-300 bg-white p-4 text-sm leading-6 text-slate-800">{preview}</pre>
      <button type="button" disabled={disabled} onClick={() => void save()} className="mt-4 w-full rounded-lg bg-amber-800 px-4 py-3 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">Save unverified field notes privately</button>
      <p className="mt-4 text-sm font-semibold text-slate-800">Next: add manual sections and cost lines, set the job price, choose the customer display, then preview the customer estimate.</p>
    </div> : null}
  </section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-bold text-slate-800"><span>{label}</span>{children}</label>;
}

function Select({ label, value, onChange, disabled, options }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; options: string[] }) {
  return <Field label={label}><select className={input} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}><option value="">Leave blank</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field>;
}
