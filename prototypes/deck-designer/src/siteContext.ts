import type { DeckDesign, HouseOpeningKind } from "./model";

type HouseWall = DeckDesign["siteContext"]["houseWalls"][number];
type HouseOpening = HouseWall["openings"][number];

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
