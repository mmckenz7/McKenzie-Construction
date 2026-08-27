import { deriveDeckSiteContextPresentationV5 } from "./siteContextPresentationV5";
import type { DeckSiteContextProjectionV5 } from "./siteContextProjectionV5";

/** Dormant presentation only; mounting a provider remains a separate approval. */
export function SiteContextReadinessV5({ projection }: { projection: DeckSiteContextProjectionV5 }) {
  const presentation = deriveDeckSiteContextPresentationV5(projection);
  return <section className="site-context-readiness" aria-labelledby="site-context-title">
    <header>
      <div><span>Site context</span><h2 id="site-context-title">Local overlay ready</h2></div>
      <strong>Map connection not active</strong>
    </header>
    <div className="site-context-preview" role="img" aria-label={`${presentation.counts.platforms} deck level local site-context preview`}>
      <svg viewBox={presentation.viewBox} preserveAspectRatio="xMidYMid meet">
        <g className="site-context-house" stroke="#344e41" strokeWidth="4">{presentation.houseWalls.map((wall) => <line vectorEffect="non-scaling-stroke" key={wall.id} x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2} />)}</g>
        <g className="site-context-decks" fill="#c99963" stroke="#65452e" strokeWidth="2">{presentation.platforms.map((platform) => <path vectorEffect="non-scaling-stroke" fillRule="evenodd" key={platform.id} d={`M ${platform.outer} Z ${platform.holes.map((hole) => `M ${hole} Z`).join(" ")}`} />)}</g>
      </svg>
    </div>
    <dl><div><dt>Coordinate plane</dt><dd>{presentation.plane}</dd></div><div><dt>Source</dt><dd>{presentation.revisionLabel}</dd></div><div><dt>Local context</dt><dd>{presentation.counts.houseWalls} house wall{presentation.counts.houseWalls === 1 ? "" : "s"}</dd></div></dl>
    <p>Deck geometry is connected to the shared read-only site-map contract. No map provider is active, and no address, parcel, aerial, GPS, or field-verification claim is attached.</p>
    <small>Context only · not a survey or construction authority</small>
  </section>;
}
