import { useEffect, useRef, useState } from "react";

export function resolveV3NumberFieldCommit(raw: string, recordedValue: number, canceled: boolean): number | null {
  if (canceled || raw.trim() === "") return null;
  const next = Number(raw);
  return Number.isFinite(next) && next !== recordedValue ? next : null;
}

export const shouldCancelV3NumberField = (key: string, isComposing: boolean): boolean => key === "Escape" && !isComposing;

export function V3NumberField({ label, value, step = .25, onCommit }: { label: string; value: number; step?: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const cancelPending = useRef(false);
  useEffect(() => setDraft(String(value)), [value]);
  return <label className="field"><span>{label}</span><input type="number" step={step} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={(event) => { try { const next = resolveV3NumberFieldCommit(event.currentTarget.value, value, cancelPending.current); if (next !== null) onCommit(next); } finally { cancelPending.current = false; setDraft(String(value)); } }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); else if (shouldCancelV3NumberField(event.key, event.nativeEvent.isComposing)) { event.preventDefault(); cancelPending.current = true; setDraft(String(value)); event.currentTarget.blur(); } }} /></label>;
}
