import type { DeckDesign, HouseAttachment, HouseOpeningKind } from "./model";

export type HouseWallPanel = Readonly<{
  id: string;
  wallId: string;
  start: Readonly<{ x: number; z: number }>;
  end: Readonly<{ x: number; z: number }>;
  baseElevation: number;
  height: number;
  attachment: HouseAttachment;
}>;

export type HouseOpeningProjection = Readonly<{
  id: string;
  wallId: string;
  kind: HouseOpeningKind;
  start: Readonly<{ x: number; z: number }>;
  end: Readonly<{ x: number; z: number }>;
  sillElevation: number;
  height: number;
}>;

export type HouseContextGeometry = Readonly<{
  houseWallPanels: readonly HouseWallPanel[];
  houseOpenings: readonly HouseOpeningProjection[];
}>;

export function deriveHouseContextGeometry(siteContext: DeckDesign["siteContext"]): HouseContextGeometry {
  const houseWallPanels: HouseWallPanel[] = [];
  const houseOpenings: HouseOpeningProjection[] = [];
  for (const wall of siteContext.houseWalls) {
    const wallLength = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
    const wallDx = (wall.end.x - wall.start.x) / wallLength;
    const wallDz = (wall.end.z - wall.start.z) / wallLength;
    const wallPoint = (distance: number) => Object.freeze({ x: wall.start.x + wallDx * distance, z: wall.start.z + wallDz * distance });
    const addPanel = (suffix: string, startDistance: number, endDistance: number, baseElevation: number, height: number) => {
      if (endDistance <= startDistance || height <= 0) return;
      houseWallPanels.push(Object.freeze({
        id: `${wall.id}-${suffix}`,
        wallId: wall.id,
        start: wallPoint(startDistance),
        end: wallPoint(endDistance),
        baseElevation,
        height,
        attachment: wall.attachment,
      }));
    };
    let cursor = 0;
    for (const opening of wall.openings) {
      addPanel(`full-${cursor}`, cursor, opening.offset, wall.baseElevation, wall.height);
      addPanel(`below-${opening.id}`, opening.offset, opening.offset + opening.width, wall.baseElevation, opening.sillHeight);
      const openingTop = wall.baseElevation + opening.sillHeight + opening.height;
      addPanel(`above-${opening.id}`, opening.offset, opening.offset + opening.width, openingTop, wall.baseElevation + wall.height - openingTop);
      houseOpenings.push(Object.freeze({
        id: opening.id,
        wallId: wall.id,
        kind: opening.kind,
        start: wallPoint(opening.offset),
        end: wallPoint(opening.offset + opening.width),
        sillElevation: wall.baseElevation + opening.sillHeight,
        height: opening.height,
      }));
      cursor = opening.offset + opening.width;
    }
    addPanel(`full-${cursor}`, cursor, wallLength, wall.baseElevation, wall.height);
  }
  return Object.freeze({ houseWallPanels: Object.freeze(houseWallPanels), houseOpenings: Object.freeze(houseOpenings) });
}
