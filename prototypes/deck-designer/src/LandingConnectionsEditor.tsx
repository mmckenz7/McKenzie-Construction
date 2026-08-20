import { useEffect, useState } from "react";
import type { StairLandingConnectionV3, StairLandingV3 } from "./modelV3";

export function LandingConnectionsEditor({ landing, onAdd, onUpdateLanding, onUpdateConnection }: Readonly<{
  landing: StairLandingV3;
  onAdd: (destination: "deck" | "grade") => void;
  onUpdateLanding: (connections: readonly StairLandingConnectionV3[], message: string) => void;
  onUpdateConnection: (connectionId: string, update: Partial<StairLandingConnectionV3>, message: string) => void;
}>) {
  const pending = landing.connections.at(-1) && !landing.connections.at(-1)?.locked;
  return <section className="landing-connections">
    <div><strong>Shared landing junction</strong><small>Extra flights merge here. The landing is rendered and counted once.</small></div>
    {landing.connections.map((connection, index) => <article className="landing-connection-card" key={connection.id}>
      <div><strong>Connected flight {index + 1}</strong><small>{connection.locked ? "locked" : "editing"} · {connection.destination === "deck" ? "up to deck" : "down to grade"}</small></div>
      {!connection.locked && <>
        <fieldset><legend>Flight destination</legend><div className="toggle-grid two"><button type="button" disabled={landing.afterRiser === 0} className={`toggle${connection.destination === "deck" ? " active" : ""}`} onClick={() => onUpdateConnection(connection.id, { destination: "deck" }, "Connected flight now climbs toward deck.")}>Up to deck</button><button type="button" className={`toggle${connection.destination === "grade" ? " active" : ""}`} onClick={() => onUpdateConnection(connection.id, { destination: "grade" }, "Connected flight now descends toward grade.")}>Down to grade</button></div></fieldset>
        <fieldset><legend>Open side used</legend><div className="toggle-grid">{(["straight", "left", "right"] as const).map((direction) => { const unavailable = direction === landing.turn || landing.connections.some((other) => other.id !== connection.id && other.direction === direction); return <button type="button" key={direction} disabled={unavailable} className={`toggle${connection.direction === direction ? " active" : ""}`} onClick={() => onUpdateConnection(connection.id, { direction }, `Connected flight moved to the ${direction} landing side.`)}>{direction}</button>; })}</div></fieldset>
        <div className="field-grid"><ConnectionNumberField label="Connected stair width" value={connection.width} onCommit={(value) => onUpdateConnection(connection.id, { width: value }, "Connected stair width updated exactly.")} /><ConnectionNumberField label="Connected step depth" value={connection.treadDepth} onCommit={(value) => onUpdateConnection(connection.id, { treadDepth: value }, "Connected step depth updated exactly.")} /></div>
        <button className="primary" onClick={() => onUpdateConnection(connection.id, { locked: true }, "Connected flight locked into this shared landing.")}>Lock connected flight</button>
      </>}
      <button onClick={() => onUpdateLanding(landing.connections.filter((other) => other.id !== connection.id), "Connected flight removed; the shared landing remains.")}>Remove connected flight</button>
    </article>)}
    <div className="selected-edge-actions contextual"><button disabled={Boolean(pending) || landing.connections.length >= 2} onClick={() => onAdd("grade")}>Connect stair down</button><button disabled={landing.afterRiser === 0 || Boolean(pending) || landing.connections.length >= 2} onClick={() => onAdd("deck")}>Connect stair up</button></div>
    <small>Connections use the remaining open landing sides; unrelated overlaps are not silently merged.</small>
  </section>;
}

function ConnectionNumberField({ label, value, onCommit }: Readonly<{ label: string; value: number; onCommit: (value: number) => void }>) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <label className="field"><span>{label}</span><input type="number" step=".25" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => { onCommit(Number(draft)); setDraft(String(value)); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>;
}
