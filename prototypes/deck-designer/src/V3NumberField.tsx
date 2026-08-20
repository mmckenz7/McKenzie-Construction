import { useEffect, useState } from "react";

export function V3NumberField({ label, value, step = .25, onCommit }: { label: string; value: number; step?: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <label className="field"><span>{label}</span><input type="number" step={step} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => { const next = Number(draft); if (draft.trim() !== "" && Number.isFinite(next)) onCommit(next); setDraft(String(value)); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>;
}
