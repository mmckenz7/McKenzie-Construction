import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  parseMunicipalityFromAddress,
  resolveMunicipalityMaterialTaxRate,
  snapshotMunicipalityMaterialTaxRate,
  type MunicipalityMaterialTaxRate,
} from "./municipality-tax-rates";

export async function resolveEstimateMaterialTax(
  supabase: SupabaseClient,
  propertyAddress: string | null,
  asOf = new Date().toISOString().slice(0, 10),
) {
  const locality = parseMunicipalityFromAddress(propertyAddress);
  if (!locality) return null;
  const result = await supabase
    .from("municipality_material_tax_rates")
    .select("id, municipality, county, state_code, rate_percent, effective_from, effective_to, source_url, verified_at")
    .ilike("municipality", locality.municipality)
    .eq("state_code", locality.stateCode)
    .lte("effective_from", asOf)
    .or(`effective_to.is.null,effective_to.gte.${asOf}`);
  if (result.error) {
    if (result.error.code === "42P01") return null;
    throw new Error("Municipality material-tax rates could not be loaded.");
  }
  const rates: MunicipalityMaterialTaxRate[] = (result.data ?? []).map((rate) => ({
    id: String(rate.id),
    municipality: String(rate.municipality),
    county: typeof rate.county === "string" ? rate.county : null,
    stateCode: String(rate.state_code),
    ratePercent: String(rate.rate_percent),
    effectiveFrom: String(rate.effective_from),
    effectiveTo: typeof rate.effective_to === "string" ? rate.effective_to : null,
    sourceUrl: String(rate.source_url),
    verifiedAt: String(rate.verified_at),
  }));
  if (rates.length === 0) return null;
  return snapshotMunicipalityMaterialTaxRate(resolveMunicipalityMaterialTaxRate(rates, {
    ...locality,
    asOf,
  }));
}
