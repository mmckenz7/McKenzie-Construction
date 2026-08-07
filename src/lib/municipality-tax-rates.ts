export type MunicipalityMaterialTaxRate = Readonly<{
  id: string;
  municipality: string;
  county: string | null;
  stateCode: string;
  ratePercent: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceUrl: string;
  verifiedAt: string;
}>;

export type MunicipalityTaxLookup = Readonly<{
  municipality: string;
  county?: string | null;
  stateCode: string;
  asOf: string;
}>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RATE = /^(?:0|[1-9]\d?)(?:\.\d{1,3})?$|^100(?:\.0{1,3})?$/;

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function requireDate(value: string, label: string) {
  if (!DATE.test(value)) {
    throw new TypeError(`${label} must use YYYY-MM-DD.`);
  }

  const [year, month, day] = value
    .split("-")
    .map(Number);
  const date = new Date(
    Date.UTC(year, month - 1, day),
  );

  if (
    year === 0 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new TypeError(`${label} must be a real calendar date.`);
  }
}

function validateRate(
  rate: MunicipalityMaterialTaxRate,
) {
  if (
    !rate.id ||
    !rate.municipality.trim() ||
    !/^[A-Z]{2}$/.test(rate.stateCode) ||
    !RATE.test(rate.ratePercent) ||
    !/^https:\/\//i.test(rate.sourceUrl) ||
    Number.isNaN(Date.parse(rate.verifiedAt))
  ) {
    throw new TypeError(
      "Municipality material-tax rate metadata is invalid.",
    );
  }
  requireDate(rate.effectiveFrom, "effectiveFrom");
  if (rate.effectiveTo !== null) {
    requireDate(rate.effectiveTo, "effectiveTo");
    if (rate.effectiveTo < rate.effectiveFrom) {
      throw new RangeError(
        "effectiveTo cannot precede effectiveFrom.",
      );
    }
  }
}

export function resolveMunicipalityMaterialTaxRate(
  rates: readonly MunicipalityMaterialTaxRate[],
  lookup: MunicipalityTaxLookup,
) {
  requireDate(lookup.asOf, "asOf");
  if (
    !lookup.municipality.trim() ||
    !/^[A-Z]{2}$/.test(lookup.stateCode)
  ) {
    throw new TypeError(
      "Municipality and two-letter state code are required.",
    );
  }

  const municipality = normalized(
    lookup.municipality,
  );
  const county = lookup.county
    ? normalized(lookup.county)
    : null;

  const matches = rates.filter((rate) => {
    validateRate(rate);
    return (
      normalized(rate.municipality) ===
        municipality &&
      rate.stateCode === lookup.stateCode &&
      (!county ||
        (rate.county !== null &&
          normalized(rate.county) === county)) &&
      rate.effectiveFrom <= lookup.asOf &&
      (rate.effectiveTo === null ||
        rate.effectiveTo >= lookup.asOf)
    );
  });

  if (matches.length !== 1) {
    throw new RangeError(
      matches.length
        ? "Municipality material-tax rate is ambiguous."
        : "Municipality material-tax rate was not found.",
    );
  }

  return Object.freeze({ ...matches[0] });
}

export function snapshotMunicipalityMaterialTaxRate(
  rate: MunicipalityMaterialTaxRate,
) {
  validateRate(rate);
  return Object.freeze({
    rateId: rate.id,
    municipality: rate.municipality.trim(),
    county: rate.county?.trim() || null,
    stateCode: rate.stateCode,
    ratePercent: rate.ratePercent,
    sourceUrl: rate.sourceUrl,
    effectiveFrom: rate.effectiveFrom,
    verifiedAt: rate.verifiedAt,
  });
}
