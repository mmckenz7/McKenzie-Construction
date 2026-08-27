import type { DeckGroundPointV5, DeckSiteContextProjectionV5 } from "./siteContextProjectionV5";

export type DeckSiteContextFixtureV5 = Readonly<{
  fixtureId: string;
  addressLabel: string;
  baseLayer: "satellite" | "hybrid";
  parcelVisible: boolean;
  parcels: readonly Readonly<{ id: string; outer: readonly Readonly<{ xMm: number; yMm: number }>[] }>[];
  liveLocationVisible: boolean;
  liveLocation: Readonly<{
    point: Readonly<{ xMm: number; yMm: number }>;
    accuracyMm: number;
    observedAt: string;
    status: "observational";
  }> | null;
}>;

export type DeckSiteContextFixtureFrameV5 = Readonly<{
  deck: DeckSiteContextProjectionV5;
  context: DeckSiteContextFixtureV5;
}>;

const idPattern = /^[a-z0-9][a-z0-9:_-]{0,119}$/;

function requiredId(value: string, label: string): string {
  const normalized = value.trim();
  if (!idPattern.test(normalized)) throw new TypeError(`${label} must be a stable lowercase fixture ID.`);
  return normalized;
}

function requiredLabel(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 240) throw new TypeError("Fixture address label is required and must be 240 characters or fewer.");
  return normalized;
}

function localPoint(point: Readonly<{ xMm: number; yMm: number }>, label: string): Readonly<{ xMm: number; yMm: number }> {
  if (!Number.isSafeInteger(point.xMm) || !Number.isSafeInteger(point.yMm)) throw new TypeError(`${label} must use integer millimeters.`);
  return Object.freeze({ xMm: point.xMm, yMm: point.yMm });
}

function normalizedTimestamp(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) throw new TypeError("Fixture observation time must be UTC RFC 3339.");
  return value;
}

export function normalizeDeckSiteContextFixtureV5(input: DeckSiteContextFixtureV5): DeckSiteContextFixtureV5 {
  if (input.baseLayer !== "satellite" && input.baseLayer !== "hybrid") throw new TypeError("Deck site fixture base layer must be satellite or hybrid.");
  const parcelIds = new Set<string>();
  const parcels = Object.freeze(input.parcels.map((parcel) => {
    const id = requiredId(parcel.id, "Parcel fixture ID");
    if (parcelIds.has(id)) throw new RangeError("Parcel fixture IDs must be unique.");
    parcelIds.add(id);
    if (parcel.outer.length < 3) throw new RangeError(`${id} requires at least three points.`);
    return Object.freeze({ id, outer: Object.freeze(parcel.outer.map((point, index) => localPoint(point, `${id}.point.${index + 1}`))) });
  }));
  const liveLocation = input.liveLocation === null ? null : (() => {
    if (!Number.isSafeInteger(input.liveLocation.accuracyMm) || input.liveLocation.accuracyMm <= 0) throw new RangeError("Fixture location accuracy must be positive integer millimeters.");
    if (input.liveLocation.status !== "observational") throw new TypeError("Fixture live location must remain observational.");
    return Object.freeze({
      point: localPoint(input.liveLocation.point, "Fixture live location"),
      accuracyMm: input.liveLocation.accuracyMm,
      observedAt: normalizedTimestamp(input.liveLocation.observedAt),
      status: "observational" as const,
    });
  })();
  return Object.freeze({
    fixtureId: requiredId(input.fixtureId, "Deck site fixture ID"),
    addressLabel: requiredLabel(input.addressLabel),
    baseLayer: input.baseLayer,
    parcelVisible: Boolean(input.parcelVisible),
    parcels,
    liveLocationVisible: Boolean(input.liveLocationVisible),
    liveLocation,
  });
}

/**
 * Provider-free test seam. It deliberately has no mount, network, edit-event,
 * key, billing, or persistence behavior and does not mirror Fence's renderer.
 */
export class DeckLocalSiteContextFixtureAdapterV5 {
  private readonly deck: DeckSiteContextProjectionV5;

  constructor(deck: DeckSiteContextProjectionV5) {
    if (deck.plane !== "MCKENZIE_LOCAL_MM" || !Object.isFrozen(deck)) throw new TypeError("A frozen Deck ground-plane projection is required.");
    this.deck = deck;
  }

  present(context: DeckSiteContextFixtureV5): DeckSiteContextFixtureFrameV5 {
    return Object.freeze({ deck: this.deck, context: normalizeDeckSiteContextFixtureV5(context) });
  }
}

export function fixturePoint(point: DeckGroundPointV5): Readonly<{ xMm: number; yMm: number }> {
  return Object.freeze({ xMm: point.xMm, yMm: point.yMm });
}
