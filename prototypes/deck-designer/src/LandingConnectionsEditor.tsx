import { useEffect, useState } from "react";
import type { StairLandingConnectionV3, StairLandingV3 } from "./modelV3";

export function LandingConnectionsEditor({ landing, destinationPlatforms, onAdd, onUpdateLanding, onUpdateConnection }: Readonly<{
  landing: StairLandingV3;
  destinationPlatforms: readonly Readonly<{ id: string; label: string; edges: readonly Readonly<{ id: string; label: string }>[] }>[];
  onAdd: (destination: "deck" | "grade", targetPlatformId?: string, targetEdgeId?: string) => void;
  onUpdateLanding: (connections: readonly StairLandingConnectionV3[], message: string) => void;
  onUpdateConnection: (connectionId: string, update: Partial<StairLandingConnectionV3>, message: string) => void;
}>) {
  const pending = landing.connections.at(-1) && !landing.connections.at(-1)?.locked;
  return <section className="landing-connections">
    <div><strong>Connect this landing</strong><small>Choose the other level and the exact side where the stairs arrive. This landing is rendered and counted once.</small></div>
    {landing.connections.map((connection, index) => <article className="landing-connection-card" key={connection.id}>
      <div><strong>Connected flight {index + 1}</strong><small>{connection.locked ? "locked" : "editing"} · {connection.destination === "deck" ? connection.targetPlatformId ? `to ${destinationPlatforms.find((item) => item.id === connection.targetPlatformId)?.label ?? connection.targetPlatformId}` : "up to deck" : "down to grade"}</small></div>
      {!connection.locked && <>
        <fieldset><legend>Flight destination</legend><div className="toggle-grid two"><button type="button" disabled={landing.afterRiser === 0 && destinationPlatforms.length === 0} className={`toggle${connection.destination === "deck" ? " active" : ""}`} onClick={() => onUpdateConnection(connection.id, { destination: "deck", targetPlatformId: destinationPlatforms[0]?.id, targetEdgeId: destinationPlatforms[0]?.edges[0]?.id }, "Connected flight now leads to another level.")}>To deck level</button><button type="button" className={`toggle${connection.destination === "grade" ? " active" : ""}`} onClick={() => onUpdateConnection(connection.id, { destination: "grade", targetPlatformId: undefined, targetEdgeId: undefined }, "Connected flight now descends toward grade.")}>Down to grade</button></div></fieldset>
        {connection.destination === "deck" && destinationPlatforms.length > 0 && <>
          <label className="field"><span>Connect to level</span><select value={connection.targetPlatformId ?? ""} onChange={(event) => { const target = destinationPlatforms.find((item) => item.id === event.target.value); onUpdateConnection(connection.id, { targetPlatformId: target?.id, targetEdgeId: target?.edges[0]?.id }, "Destination level and side updated exactly."); }}><option value="">Choose a level…</option>{destinationPlatforms.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          {connection.targetPlatformId && <label className="field"><span>Side on that level</span><select value={connection.targetEdgeId ?? ""} onChange={(event) => onUpdateConnection(connection.id, { targetEdgeId: event.target.value || undefined }, "Exact destination side updated.")}><option value="">Choose a side…</option>{destinationPlatforms.find((item) => item.id === connection.targetPlatformId)?.edges.map((edge) => <option key={edge.id} value={edge.id}>{edge.label}</option>)}</select></label>}
        </>}
        <fieldset><legend>Open side used</legend><div className="toggle-grid">{(["straight", "left", "right"] as const).map((direction) => { const unavailable = direction === landing.turn || landing.connections.some((other) => other.id !== connection.id && other.direction === direction); return <button type="button" key={direction} disabled={unavailable} className={`toggle${connection.direction === direction ? " active" : ""}`} onClick={() => onUpdateConnection(connection.id, { direction }, `Connected flight moved to the ${direction} landing side.`)}>{direction}</button>; })}</div></fieldset>
        <div className="field-grid"><ConnectionNumberField label="Connected stair width" value={connection.width} onCommit={(value) => onUpdateConnection(connection.id, { width: value }, "Connected stair width updated exactly.")} /><ConnectionNumberField label="Connected step depth" value={connection.treadDepth} onCommit={(value) => onUpdateConnection(connection.id, { treadDepth: value }, "Connected step depth updated exactly.")} /></div>
        <button className="primary" disabled={connection.destination === "deck" && (!connection.targetPlatformId || !connection.targetEdgeId)} onClick={() => onUpdateConnection(connection.id, { locked: true }, "Level connection locked from this landing to the selected destination side.")}>Finish connection</button>
      </>}
      <button onClick={() => onUpdateLanding(landing.connections.filter((other) => other.id !== connection.id), "Connected flight removed; the shared landing remains.")}>Remove connected flight</button>
    </article>)}
    <div className="selected-edge-actions contextual"><button disabled={Boolean(pending) || landing.connections.length >= 2} onClick={() => onAdd("grade")}>Continue to ground</button><button disabled={destinationPlatforms.length === 0 || Boolean(pending) || landing.connections.length >= 2} onClick={() => onAdd("deck", destinationPlatforms[0]?.id, destinationPlatforms[0]?.edges[0]?.id)}>Connect to another level</button></div>
    <small>Left and right are viewed while walking down. Only a recorded free side can receive the connection; house sides are never selected automatically.</small>
  </section>;
}

function ConnectionNumberField({ label, value, onCommit }: Readonly<{ label: string; value: number; onCommit: (value: number) => void }>) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <label className="field"><span>{label}</span><input type="number" step=".25" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => { onCommit(Number(draft)); setDraft(String(value)); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>;
}

type TerminalDestination = Readonly<{ id: string; label: string; edges: readonly Readonly<{ id: string; label: string }>[] }>;

export function TerminalLandingEditor({ landing, destinations, onConnect, onDetach }: Readonly<{
  landing: StairLandingV3;
  destinations: readonly TerminalDestination[];
  onConnect: (platformId: string, edgeId: string) => void;
  onDetach: () => void;
}>) {
  const [platformId, setPlatformId] = useState(landing.terminalPlatformId ?? destinations[0]?.id ?? "");
  const destination = destinations.find((item) => item.id === platformId);
  const [edgeId, setEdgeId] = useState(landing.terminalEdgeId ?? destination?.edges[0]?.id ?? "");
  useEffect(() => {
    if (!destinations.some((item) => item.id === platformId)) setPlatformId(destinations[0]?.id ?? "");
  }, [destinations, platformId]);
  useEffect(() => {
    const current = destinations.find((item) => item.id === platformId);
    if (!current?.edges.some((edge) => edge.id === edgeId)) setEdgeId(current?.edges[0]?.id ?? "");
  }, [destinations, edgeId, platformId]);
  if (landing.terminalPlatformId) return <section className="landing-connections terminal-landing-editor">
    <div><strong>Shared lower-level landing</strong><small>Upper stairs stop here. Both deck layers stay fixed while the stair assembly meets this edge.</small></div>
    <div className="selected-edge-actions contextual"><button onClick={onDetach}>Disconnect level</button></div>
  </section>;
  return <section className="landing-connections terminal-landing-editor">
    <div><strong>Should the upper stairs stop at another deck level?</strong><small>Use this landing as that lower level's top landing. No duplicate flight to grade will be created.</small></div>
    {destinations.length === 0 ? <small>Add a lower deck level first.</small> : <>
      <label className="field"><span>Lower deck level</span><select value={platformId} onChange={(event) => setPlatformId(event.target.value)}>{destinations.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label className="field"><span>Side receiving this landing</span><select value={edgeId} onChange={(event) => setEdgeId(event.target.value)}>{destination?.edges.map((edge) => <option key={edge.id} value={edge.id}>{edge.label}</option>)}</select></label>
      <button className="primary" disabled={!platformId || !edgeId} onClick={() => onConnect(platformId, edgeId)}>Stop upper stairs at this level</button>
    </>}
  </section>;
}
