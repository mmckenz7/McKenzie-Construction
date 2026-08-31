import type { StairLandingConnectionV3, StairLandingV3 } from "./modelV3";
import { V3NumberField } from "./V3NumberField";

export function LandingConnectionsEditor({ landing, onAdd, onUpdateLanding, onUpdateConnection }: Readonly<{
  landing: StairLandingV3;
  onAdd: (destination: "grade") => void;
  onUpdateLanding: (connections: readonly StairLandingConnectionV3[], message: string) => void;
  onUpdateConnection: (connectionId: string, update: Partial<StairLandingConnectionV3>, message: string) => void;
}>) {
  const pending = landing.connections.at(-1) && !landing.connections.at(-1)?.locked;
  return <section className="landing-connections">
    <div><strong>Landing flights</strong><small>Add a flight to grade.</small></div>
    {landing.connections.map((connection, index) => <article className="landing-connection-card" key={connection.id}>
      <div><strong>Flight {index + 1}</strong><small>{connection.locked ? "locked" : "editing"} · {connection.destination === "grade" ? "to grade" : "saved deck connection paused"}</small></div>
      {!connection.locked && <>
        {connection.destination === "deck" && <button type="button" onClick={() => onUpdateConnection(connection.id, { destination: "grade", targetPlatformId: undefined, targetEdgeId: undefined }, "Flight updated.")}>Change to ground</button>}
        <fieldset><legend>Open side used</legend><div className="toggle-grid">{(["straight", "left", "right"] as const).map((direction) => { const unavailable = direction === landing.turn || landing.connections.some((other) => other.id !== connection.id && other.direction === direction); return <button type="button" key={direction} disabled={unavailable} className={`toggle${connection.direction === direction ? " active" : ""}`} onClick={() => onUpdateConnection(connection.id, { direction }, "Flight updated.")}>{direction}</button>; })}</div></fieldset>
        <div className="field-grid"><V3NumberField label="Stair width" value={connection.width} onCommit={(value) => onUpdateConnection(connection.id, { width: value }, "Flight updated.")} /><V3NumberField label="Step depth" value={connection.treadDepth} onCommit={(value) => onUpdateConnection(connection.id, { treadDepth: value }, "Flight updated.")} /></div>
        <button className="primary" disabled={connection.destination !== "grade"} onClick={() => onUpdateConnection(connection.id, { locked: true }, "Flight updated.")}>Finish connection</button>
      </>}
      <button onClick={() => onUpdateLanding(landing.connections.filter((other) => other.id !== connection.id), "Flight removed.")}>Remove connected flight</button>
    </article>)}
    <div className="selected-edge-actions contextual"><button disabled={Boolean(pending) || landing.connections.length >= 2} onClick={() => onAdd("grade")}>Continue to ground</button></div>
    <small>Directions face down-stair.</small>
  </section>;
}
