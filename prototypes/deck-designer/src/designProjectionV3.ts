import { deckDesignV3Fingerprint, normalizeDeckDesignV3, type DeckDesignV3 } from "./modelV3";
import { derivePolygonProjectionReport, type PolygonProjectionReport } from "./polygonReport";
import {
  deriveDeckAccessoryProjectionV3,
  type DeckAccessoryProjectionReportV3,
} from "./quantityProjectionV3";

type AggregateQuantityV3 = Readonly<{
  key: string;
  quantityClass: "takeoff_candidate" | "visualization";
  amount: number;
  unit: "sq ft" | "lin ft" | "each";
  platformIds: readonly string[];
  sourceGeometry: readonly string[];
}>;

export type DeckDesignProjectionV3 = Readonly<{
  projectionVersion: 1;
  designSchemaVersion: 3;
  designId: string;
  designFingerprint: string;
  coordinateUnits: "in";
  platforms: readonly Readonly<{
    platformId: string;
    elevation: number;
    surface: PolygonProjectionReport;
    accessories: DeckAccessoryProjectionReportV3;
  }>[];
  aggregateQuantities: readonly AggregateQuantityV3[];
  warnings: readonly [
    "conceptual_not_for_construction",
    "field_verification_required",
    "inter_platform_connections_not_determined",
  ];
}>;

type QuantityInput = Readonly<{
  key: string;
  quantityClass: "takeoff_candidate" | "visualization";
  amount: number;
  unit: "sq ft" | "lin ft" | "each";
  sourceGeometry: readonly string[];
}>;

const round = (value: number): number => Math.round(value * 100) / 100;

export function deriveDeckDesignProjectionV3(design: DeckDesignV3): DeckDesignProjectionV3 {
  const normalized = normalizeDeckDesignV3(design);
  const platforms = Object.freeze([...normalized.platforms]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((platform) => Object.freeze({
      platformId: platform.id,
      elevation: platform.elevation,
      surface: derivePolygonProjectionReport(platform.id, platform.region, {
        boardWidth: platform.construction.decking.boardWidth,
        gap: platform.construction.decking.gap,
        joistSpacing: platform.construction.framing.joistSpacing,
      }),
      accessories: deriveDeckAccessoryProjectionV3(normalized, platform.id),
    })));
  const aggregate = new Map<string, {
    quantityClass: QuantityInput["quantityClass"];
    amount: number;
    unit: QuantityInput["unit"];
    platformIds: Set<string>;
    sourceGeometry: string[];
  }>();
  for (const platform of platforms) {
    const lines: readonly QuantityInput[] = [...platform.surface.quantities, ...platform.accessories.quantities];
    for (const line of lines) {
      const current = aggregate.get(line.key);
      if (current && (current.unit !== line.unit || current.quantityClass !== line.quantityClass)) {
        throw new TypeError(`Quantity ${line.key} has inconsistent projection semantics across platforms.`);
      }
      const target = current ?? {
        quantityClass: line.quantityClass,
        amount: 0,
        unit: line.unit,
        platformIds: new Set<string>(),
        sourceGeometry: [],
      };
      target.amount += line.amount;
      target.platformIds.add(platform.platformId);
      target.sourceGeometry.push(...line.sourceGeometry);
      aggregate.set(line.key, target);
    }
  }
  const aggregateQuantities = Object.freeze([...aggregate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, line]) => Object.freeze({
      key,
      quantityClass: line.quantityClass,
      amount: round(line.amount),
      unit: line.unit,
      platformIds: Object.freeze([...line.platformIds].sort()),
      sourceGeometry: Object.freeze([...line.sourceGeometry].sort()),
    })));
  return Object.freeze({
    projectionVersion: 1,
    designSchemaVersion: 3,
    designId: normalized.id,
    designFingerprint: deckDesignV3Fingerprint(normalized),
    coordinateUnits: "in",
    platforms,
    aggregateQuantities,
    warnings: Object.freeze([
      "conceptual_not_for_construction",
      "field_verification_required",
      "inter_platform_connections_not_determined",
    ] as const),
  });
}

export function stableDeckDesignProjectionV3Json(report: DeckDesignProjectionV3): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
