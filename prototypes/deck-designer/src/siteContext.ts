import type { DeckDesign, HouseOpeningKind } from "./model";

type HouseWall = DeckDesign["siteContext"]["houseWalls"][number];
type HouseOpening = HouseWall["openings"][number];

export function createHouseWall(design: DeckDesign): HouseWall {
  if (design.siteContext.houseWalls.length >= 8) throw new RangeError("A design can contain no more than 8 house walls.");
  let sequence = 1;
  while (design.siteContext.houseWalls.some((wall) => wall.id === `house-wall-${sequence}`)) sequence += 1;
  const first = design.siteContext.houseWalls[0];
  const useSideWall = design.siteContext.houseWalls.length === 1;
  const offset = -24 * (design.siteContext.houseWalls.length - 1);
  return Object.freeze({
    id: `house-wall-${sequence}`,
    start: Object.freeze(useSideWall ? { ...first.start } : { x: -60, z: offset }),
    end: Object.freeze(useSideWall
      ? { x: first.start.x, z: design.platform.projection + 60 }
      : { x: design.platform.width + 60, z: offset }),
    baseElevation: design.siteContext.gradeElevation,
    height: first.height,
    attachment: "unknown" as const,
    openings: Object.freeze([]),
  });
}

export function createHouseOpening(wall: HouseWall, kind: HouseOpeningKind): HouseOpening {
  const width = kind === "door" ? 36 : 48;
  const wallLength = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
  const openings = [...wall.openings].sort((a, b) => a.offset - b.offset || a.id.localeCompare(b.id));
  let offset = openings.length === 0 ? Math.max(0, Math.round((wallLength - width) / 2)) : 0;
  if (openings.length > 0) {
    for (const opening of openings) {
      if (opening.offset - offset >= width) break;
      offset = Math.max(offset, opening.offset + opening.width);
    }
    if (offset + width > wallLength) throw new RangeError(`No ${width}-inch opening fits on ${wall.id}.`);
  }
  let sequence = 1;
  while (wall.openings.some((opening) => opening.id === `${kind}-${sequence}`)) sequence += 1;
  return Object.freeze({
    id: `${kind}-${sequence}`,
    kind,
    offset,
    width,
    sillHeight: kind === "door" ? 0 : 36,
    height: kind === "door" ? 80 : 48,
  });
}
