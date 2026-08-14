import { useId } from "react";

import { deckStairOpeningGeometry, type DeckProposalDesign } from "@/lib/deck-proposal-design";

type Segment = Readonly<{ x1: number; y1: number; x2: number; y2: number }>;

export function DeckPlanVisual({ design, compact = false }: { design: DeckProposalDesign; compact?: boolean }) {
  const titleId = useId();
  const descriptionId = useId();
  const {
    lengthFeet, widthFeet, boardRunDirection, railingLengthFeet, attached,
    stairsPresent, stairEdge, stairPosition,
  } = design;
  const maximum = Math.max(lengthFeet, widthFeet);
  const deckWidth = 220 * (lengthFeet / maximum);
  const deckHeight = 150 * (widthFeet / maximum);
  const x = (300 - deckWidth) / 2;
  const y = (215 - deckHeight) / 2;
  const boardLines = Array.from({ length: 11 }, (_, index) => index / 10);
  const opening = deckStairOpeningGeometry(design, { x, y, width: deckWidth, height: deckHeight });
  const railSegments: Segment[] = [];
  let stairPath = "";
  let stairLabelX = 150;
  let stairLabelY = Math.min(242, y + deckHeight + 35);
  let stairLabelRotation: string | undefined;

  function addHorizontalRail(edge: "top" | "yard", edgeY: number) {
    if (opening?.edge === edge) {
      railSegments.push({ x1: x, y1: edgeY, x2: opening.start, y2: edgeY });
      railSegments.push({ x1: opening.end, y1: edgeY, x2: x + deckWidth, y2: edgeY });
    } else {
      railSegments.push({ x1: x, y1: edgeY, x2: x + deckWidth, y2: edgeY });
    }
  }

  function addVerticalRail(edge: "left" | "right", edgeX: number) {
    if (opening?.edge === edge) {
      railSegments.push({ x1: edgeX, y1: y, x2: edgeX, y2: opening.start });
      railSegments.push({ x1: edgeX, y1: opening.end, x2: edgeX, y2: y + deckHeight });
    } else {
      railSegments.push({ x1: edgeX, y1: y, x2: edgeX, y2: y + deckHeight });
    }
  }

  if (railingLengthFeet === null || railingLengthFeet > 0) {
    if (!attached) addHorizontalRail("top", y);
    addVerticalRail("left", x);
    addVerticalRail("right", x + deckWidth);
    addHorizontalRail("yard", y + deckHeight);
  }

  if (opening) {
    if (opening.edge === "left" || opening.edge === "right") {
      const sideX = opening.edge === "left" ? x : x + deckWidth;
      const outward = opening.edge === "left" ? -26 : 26;
      stairPath = `M ${sideX} ${opening.start} L ${sideX + outward} ${opening.start} L ${sideX + outward} ${opening.end} L ${sideX} ${opening.end}`;
      stairLabelX = sideX + (opening.edge === "left" ? -37 : 37);
      stairLabelY = opening.center;
      stairLabelRotation = `rotate(${opening.edge === "left" ? -90 : 90} ${stairLabelX} ${stairLabelY})`;
    } else {
      const edgeY = opening.edge === "top" ? y : y + deckHeight;
      const outward = opening.edge === "top" ? -24 : 24;
      stairPath = `M ${opening.start} ${edgeY} L ${opening.start} ${edgeY + outward} L ${opening.end} ${edgeY + outward} L ${opening.end} ${edgeY}`;
      stairLabelX = opening.center;
      stairLabelY = edgeY + (opening.edge === "top" ? -31 : 35);
    }
  }

  const stairDescription = stairsPresent
    ? `, with the stairs on the ${stairEdge === "yard" ? "yard edge" : stairEdge === "top" ? "top edge" : `${stairEdge} side`} ${stairEdge === "yard" || stairEdge === "top"
      ? stairPosition === "start" ? "toward the left" : stairPosition === "end" ? "toward the right" : "at the center"
      : stairPosition === "start" ? "near the top of the plan" : stairPosition === "end" ? "far from the top of the plan" : "at the middle"}`
    : "";

  return <figure className={`overflow-hidden rounded-xl border border-slate-300 bg-slate-100 ${compact ? "p-2" : "p-4"}`}>
    <svg viewBox="0 0 300 250" role="img" aria-labelledby={`${titleId} ${descriptionId}`} className="mx-auto block w-full max-w-xl">
      <title id={titleId}>Proposed deck quantity plan</title>
      <desc id={descriptionId}>A rectangular {lengthFeet} by {widthFeet} foot deck with boards running {boardRunDirection === "along_length" ? "along its length" : "across its width"}, {attached ? "attached to the house" : "shown as freestanding"}{stairDescription}.</desc>
      {attached ? <><rect x={x} y={Math.max(2, y - 20)} width={deckWidth} height="18" rx="3" fill="#334155" /><text x="150" y={Math.max(15, y - 7)} textAnchor="middle" fontSize="9" fill="white">HOUSE / LEDGER</text></> : <text x="150" y={Math.max(15, y - 7)} textAnchor="middle" fontSize="8" fontWeight="700" fill="#475569">TOP OF PLAN</text>}
      <rect x={x} y={y} width={deckWidth} height={deckHeight} rx="3" fill="#d6b98c" stroke="#0f172a" strokeWidth="3" />
      {boardLines.map((ratio) => boardRunDirection === "along_length"
        ? <line key={ratio} x1={x} y1={y + deckHeight * ratio} x2={x + deckWidth} y2={y + deckHeight * ratio} stroke="#8b5e34" strokeWidth="1" />
        : <line key={ratio} x1={x + deckWidth * ratio} y1={y} x2={x + deckWidth * ratio} y2={y + deckHeight} stroke="#8b5e34" strokeWidth="1" />)}
      {railSegments.map((segment, index) => <line key={`${segment.x1}:${segment.y1}:${index}`} {...segment} stroke={railingLengthFeet === null ? "#94a3b8" : "#15803d"} strokeWidth={railingLengthFeet === null ? "3" : "5"} strokeDasharray={railingLengthFeet === null ? "6 5" : undefined} />)}
      {stairsPresent && stairPath ? <><path d={stairPath} fill="none" stroke="#475569" strokeWidth="2" /><text x={stairLabelX} y={stairLabelY} transform={stairLabelRotation} textAnchor="middle" fontSize="8" fontWeight="700" fill="#334155">STAIRS</text></> : null}
      {railingLengthFeet === null ? <text x="150" y={Math.min(230, y + deckHeight + 14)} textAnchor="middle" fontSize="8" fontWeight="700" fill="#64748b">RAILING TBD</text> : null}
      <text x="150" y="242" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0f172a">{lengthFeet} ft × {widthFeet} ft · {railingLengthFeet === null ? "railing needs review" : `${railingLengthFeet} railing ft`}</text>
    </svg>
    <figcaption className="mt-2 text-center text-xs text-slate-600">Conceptual quantity plan. Final construction follows the approved contract, field verification, and applicable requirements.</figcaption>
  </figure>;
}
