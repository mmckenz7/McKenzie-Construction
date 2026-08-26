import { MM_PER_FOOT, MM_PER_INCH, type FenceDesign, type Segment } from "./model";

export type RunDirection = "north" | "east" | "south" | "west" | "straight" | "left" | "right";

export type ParsedRunCommand = Readonly<{
  direction: RunDirection;
  lengthMm: number;
  bearingRadians: number;
  turnDegrees: number | null;
  summary: string;
}>;

const normalize = (input: string) => input.toLowerCase().replace(/[’′]/g, "'").replace(/[“”″]/g, '"').replace(/,/g, " ").replace(/\s+/g, " ").trim();

const formatLength = (millimeters: number): string => {
  const totalInches = Math.round(millimeters / MM_PER_INCH);
  return `${Math.floor(totalInches / 12)}′ ${totalInches % 12}″`;
};

const parseLengthMm = (text: string): number => {
  const feetMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:feet|foot|ft|')(?=\s|$)/);
  const inchesMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:inches|inch|in|")(?=\s|$)/);
  let feet = feetMatch ? Number(feetMatch[1]) : 0;
  const inches = inchesMatch ? Number(inchesMatch[1]) : 0;
  if (!feetMatch && !inchesMatch) {
    const numbers = [...text.matchAll(/\d+(?:\.\d+)?/g)].map(({ 0: value }) => Number(value));
    if (numbers.length === 0) throw new RangeError("Include a run length, such as 20 ft.");
    feet = numbers.at(-1)!;
  }
  const lengthMm = Math.round(feet * MM_PER_FOOT + inches * MM_PER_INCH);
  if (!Number.isSafeInteger(lengthMm) || lengthMm < 25 || lengthMm > 304_800) throw new RangeError("Run length must be from 1 inch through 1,000 feet.");
  return lengthMm;
};

const absoluteDirection = (text: string): Exclude<RunDirection, "straight" | "left" | "right"> | null => {
  if (/\b(north|up)\b/.test(text)) return "north";
  if (/\b(east)\b/.test(text)) return "east";
  if (/\b(south|down)\b/.test(text)) return "south";
  if (/\b(west)\b/.test(text)) return "west";
  return null;
};

const absoluteBearing = (direction: "north" | "east" | "south" | "west"): number => ({ north: -Math.PI / 2, east: 0, south: Math.PI / 2, west: Math.PI }[direction]);

export function parseRunCommand(input: string, previousBearingRadians: number | null): ParsedRunCommand {
  const text = normalize(input);
  if (!text) throw new RangeError("Describe the next run, such as “south 20 ft” or “right 90, 40 ft.”");
  const lengthMm = parseLengthMm(text);
  const absolute = absoluteDirection(text);
  let direction: RunDirection;
  let bearingRadians: number;
  let turnDegrees: number | null = null;
  if (absolute) {
    direction = absolute; bearingRadians = absoluteBearing(absolute);
  } else if (/\bleft\b/.test(text) || /\bright\b/.test(text)) {
    if (previousBearingRadians === null) throw new RangeError("The first precise run needs north, south, east, or west. You can also draw its direction visually.");
    direction = /\bleft\b/.test(text) ? "left" : "right";
    const degreeMatch = text.match(/\b(45|90)(?:\s*(?:degrees?|deg)\b|\s*°)?/);
    turnDegrees = degreeMatch ? Number(degreeMatch[1]) : 90;
    bearingRadians = previousBearingRadians + (direction === "right" ? 1 : -1) * turnDegrees * Math.PI / 180;
  } else {
    if (previousBearingRadians === null) throw new RangeError("The first precise run needs north, south, east, or west. You can also draw its direction visually.");
    direction = "straight"; bearingRadians = previousBearingRadians;
  }
  const directionLabel = turnDegrees === null ? direction : `${direction} ${turnDegrees}°`;
  return Object.freeze({ direction, lengthMm, bearingRadians, turnDegrees, summary: `${formatLength(lengthMm)} · ${directionLabel}` });
}

export function runEndpoint(anchor: Readonly<{ xMm: number; yMm: number }>, command: Pick<ParsedRunCommand, "lengthMm" | "bearingRadians">): Readonly<{ xMm: number; yMm: number }> {
  return Object.freeze({
    xMm: Math.round(anchor.xMm + Math.cos(command.bearingRadians) * command.lengthMm),
    yMm: Math.round(anchor.yMm + Math.sin(command.bearingRadians) * command.lengthMm),
  });
}

export function quickGateTarget(
  design: Pick<FenceDesign, "segments">,
  selectedSegmentId: string | null,
  anchorPointId: string | null,
): Segment | null {
  const selected = selectedSegmentId ? design.segments.find(({ id }) => id === selectedSegmentId) ?? null : null;
  if (selected?.kind === "fence") return selected;
  if (!anchorPointId) return null;
  return [...design.segments].reverse().find(({ kind, toPointId }) => kind === "fence" && toPointId === anchorPointId) ?? null;
}
