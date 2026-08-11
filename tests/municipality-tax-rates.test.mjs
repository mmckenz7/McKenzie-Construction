import assert from "node:assert/strict";
import test from "node:test";

import {
  parseMunicipalityFromAddress,
  resolveMunicipalityMaterialTaxRate,
  snapshotMunicipalityMaterialTaxRate,
} from "../src/lib/municipality-tax-rates.ts";

test("extracts municipality and state from a complete job address", () => {
  assert.deepEqual(
    parseMunicipalityFromAddress("128 River Bend Way, Knoxville, TN 37922"),
    { municipality: "Knoxville", stateCode: "TN" },
  );
  assert.equal(parseMunicipalityFromAddress("128 River Bend Way"), null);
});

function rate(overrides = {}) {
  return {
    id: "rate-1",
    municipality: "Example City",
    county: "Example County",
    stateCode: "TN",
    ratePercent: "9.250",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sourceUrl: "https://example.gov/rates",
    verifiedAt: "2026-01-02T12:00:00.000Z",
    ...overrides,
  };
}

test("resolves one effective municipality rate without hardcoded data", () => {
  const resolved = resolveMunicipalityMaterialTaxRate(
    [rate()],
    {
      municipality: " example city ",
      county: "EXAMPLE COUNTY",
      stateCode: "TN",
      asOf: "2026-08-07",
    },
  );
  assert.equal(resolved.id, "rate-1");
  assert.equal(resolved.ratePercent, "9.250");
  assert.equal(Object.isFrozen(resolved), true);
});

test("uses effective dates and rejects missing or ambiguous rates", () => {
  const lookup = {
    municipality: "Example City",
    stateCode: "TN",
    asOf: "2026-08-07",
  };
  assert.throws(
    () =>
      resolveMunicipalityMaterialTaxRate(
        [rate({ effectiveTo: "2026-06-30" })],
        lookup,
      ),
    /not found/,
  );
  assert.throws(
    () =>
      resolveMunicipalityMaterialTaxRate(
        [rate(), rate({ id: "rate-2" })],
        lookup,
      ),
    /ambiguous/,
  );
});

test("rejects invalid rate metadata and impossible dates", () => {
  const lookup = {
    municipality: "Example City",
    stateCode: "TN",
    asOf: "2026-08-07",
  };
  assert.throws(
    () =>
      resolveMunicipalityMaterialTaxRate(
        [rate({ ratePercent: "100.001" })],
        lookup,
      ),
    /metadata is invalid/,
  );
  assert.throws(
    () =>
      resolveMunicipalityMaterialTaxRate(
        [rate()],
        { ...lookup, asOf: "2026-02-30" },
      ),
    /real calendar date/,
  );
});

test("snapshots the rate source used by an estimate", () => {
  const snapshot = snapshotMunicipalityMaterialTaxRate(
    rate(),
  );
  assert.deepEqual(snapshot, {
    rateId: "rate-1",
    municipality: "Example City",
    county: "Example County",
    stateCode: "TN",
    ratePercent: "9.250",
    sourceUrl: "https://example.gov/rates",
    effectiveFrom: "2026-01-01",
    verifiedAt: "2026-01-02T12:00:00.000Z",
  });
  assert.equal(Object.isFrozen(snapshot), true);
});
