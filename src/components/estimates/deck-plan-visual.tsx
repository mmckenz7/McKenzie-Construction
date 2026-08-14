import type { DeckProposalDesign } from "@/lib/deck-proposal-design";

export function DeckPlanVisual({ design, compact = false }: { design: DeckProposalDesign; compact?: boolean }) {
  const { lengthFeet, widthFeet, boardRunDirection, railingLengthFeet, attached, stairsPresent } = design;
  const maximum = Math.max(lengthFeet, widthFeet);
  const deckWidth = 240 * (lengthFeet / maximum);
  const deckHeight = 160 * (widthFeet / maximum);
  const x = (300 - deckWidth) / 2;
  const y = (220 - deckHeight) / 2;
  const boardLines = Array.from({ length: 11 }, (_, index) => index / 10);
  return <figure className={`overflow-hidden rounded-xl border border-slate-300 bg-slate-100 ${compact ? "p-2" : "p-4"}`}>
    <svg viewBox="0 0 300 250" role="img" aria-labelledby="deck-plan-title deck-plan-description" className="mx-auto block w-full max-w-xl">
      <title id="deck-plan-title">Proposed deck quantity plan</title>
      <desc id="deck-plan-description">A rectangular {lengthFeet} by {widthFeet} foot deck with boards running {boardRunDirection === "along_length" ? "along its length" : "across its width"}, {attached ? "attached to the house" : "shown as freestanding"}{stairsPresent ? ", with a stair opening" : ""}.</desc>
      {attached ? <><rect x={x} y={Math.max(2, y - 20)} width={deckWidth} height="18" rx="3" fill="#334155" /><text x="150" y={Math.max(15, y - 7)} textAnchor="middle" fontSize="9" fill="white">HOUSE / LEDGER</text></> : null}
      <rect x={x} y={y} width={deckWidth} height={deckHeight} rx="3" fill="#d6b98c" stroke="#0f172a" strokeWidth="3" />
      {boardLines.map((ratio) => boardRunDirection === "along_length"
        ? <line key={ratio} x1={x} y1={y + deckHeight * ratio} x2={x + deckWidth} y2={y + deckHeight * ratio} stroke="#8b5e34" strokeWidth="1" />
        : <line key={ratio} x1={x + deckWidth * ratio} y1={y} x2={x + deckWidth * ratio} y2={y + deckHeight} stroke="#8b5e34" strokeWidth="1" />)}
      {!attached && railingLengthFeet !== 0 ? <line x1={x} y1={y} x2={x + deckWidth} y2={y} stroke="#15803d" strokeWidth="5" /> : null}
      {railingLengthFeet !== 0 ? <><line x1={x} y1={y} x2={x} y2={y + deckHeight} stroke="#15803d" strokeWidth="5" /><line x1={x + deckWidth} y1={y} x2={x + deckWidth} y2={y + deckHeight} stroke="#15803d" strokeWidth="5" />{stairsPresent ? <><line x1={x} y1={y + deckHeight} x2={x + deckWidth * .38} y2={y + deckHeight} stroke="#15803d" strokeWidth="5" /><line x1={x + deckWidth * .62} y1={y + deckHeight} x2={x + deckWidth} y2={y + deckHeight} stroke="#15803d" strokeWidth="5" /><path d={`M ${x + deckWidth * .38} ${y + deckHeight} L ${x + deckWidth * .38} ${y + deckHeight + 24} L ${x + deckWidth * .62} ${y + deckHeight + 24} L ${x + deckWidth * .62} ${y + deckHeight}`} fill="none" stroke="#475569" strokeWidth="2" /><text x="150" y={Math.min(244, y + deckHeight + 39)} textAnchor="middle" fontSize="9" fill="#334155">STAIR OPENING</text></> : <line x1={x} y1={y + deckHeight} x2={x + deckWidth} y2={y + deckHeight} stroke="#15803d" strokeWidth="5" />}</> : null}
      <text x="150" y="238" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0f172a">{lengthFeet} ft × {widthFeet} ft · {railingLengthFeet === null ? "railing needs review" : `${railingLengthFeet} railing ft`}</text>
    </svg>
    <figcaption className="mt-2 text-center text-xs text-slate-600">Conceptual quantity plan. Final construction follows the approved contract, field verification, and applicable requirements.</figcaption>
  </figure>;
}
