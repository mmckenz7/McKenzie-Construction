import { deckDesignV5Fingerprint, normalizeDeckDesignV5, type DeckDesignV5 } from "./modelV5";
import { derivePolygonProjectionReport } from "./polygonReport";
import { deriveDeckAccessoryProjectionV5 } from "./quantityProjectionV5";

const round = (value: number): number => Math.round(value * 100) / 100;

export function deriveDeckDesignProjectionV5(design: DeckDesignV5) {
  const normalized = normalizeDeckDesignV5(design);
  const platforms = Object.freeze([...normalized.platforms].sort((a, b) => a.id.localeCompare(b.id)).map((platform) => Object.freeze({
    platformId: platform.id,
    elevation: platform.elevation,
    surface: derivePolygonProjectionReport(platform.id, platform.region, {
      boardWidth: platform.construction.decking.boardWidth,
      gap: platform.construction.decking.gap,
      boardDirection: platform.construction.decking.direction,
      surfacePattern: platform.construction.decking.pattern,
      joistSpacing: platform.construction.framing.joistSpacing,
    }),
    accessories: deriveDeckAccessoryProjectionV5(normalized, platform.id),
  })));
  const aggregate = new Map<string, { quantityClass: "takeoff_candidate" | "visualization"; amount: number; unit: "sq ft" | "lin ft" | "each"; platformIds: Set<string>; sourceGeometry: string[] }>();
  platforms.forEach((platform) => [...platform.surface.quantities, ...platform.accessories.quantities].forEach((line) => {
    const current = aggregate.get(line.key);
    if (current && (current.unit !== line.unit || current.quantityClass !== line.quantityClass)) throw new TypeError(`Quantity ${line.key} has inconsistent projection semantics across platforms.`);
    const target = current ?? { quantityClass: line.quantityClass, amount: 0, unit: line.unit, platformIds: new Set<string>(), sourceGeometry: [] };
    target.amount += line.amount; target.platformIds.add(platform.platformId); target.sourceGeometry.push(...line.sourceGeometry); aggregate.set(line.key, target);
  }));
  const aggregateQuantities = Object.freeze([...aggregate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, line]) => Object.freeze({
    key, quantityClass: line.quantityClass, amount: round(line.amount), unit: line.unit,
    platformIds: Object.freeze([...line.platformIds].sort()), sourceGeometry: Object.freeze([...line.sourceGeometry].sort()),
  })));
  return Object.freeze({
    projectionVersion: 1 as const, designSchemaVersion: 5 as const, designId: normalized.id,
    designFingerprint: deckDesignV5Fingerprint(normalized), coordinateUnits: "in" as const, platforms, aggregateQuantities,
    warnings: Object.freeze(["conceptual_not_for_construction", "field_verification_required", "inter_platform_connections_not_determined"] as const),
  });
}
