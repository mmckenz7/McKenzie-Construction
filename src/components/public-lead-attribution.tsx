"use client";

import { useEffect, useState } from "react";

import {
  normalizePublicLeadAttribution,
  publicLeadAttributionFields,
  type PublicLeadAttribution,
} from "@/lib/public-lead-attribution";

const storageKey = "mckenzie-public-lead-attribution-v1";

function currentAttribution() {
  const values: Record<string, unknown> = {};
  const search = new URLSearchParams(window.location.search);
  for (const field of publicLeadAttributionFields) values[field] = search.get(field);
  values.landing_path = window.location.pathname;
  return normalizePublicLeadAttribution(values);
}

function storedAttribution(): PublicLeadAttribution {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "null");
    return parsed && typeof parsed === "object"
      ? normalizePublicLeadAttribution(parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function campaignAttribution() {
  const current = currentAttribution();
  const hasCampaignFact = publicLeadAttributionFields.some((field) => current[field]);
  return hasCampaignFact ? current : storedAttribution();
}

export function PublicLeadAttributionCapture() {
  useEffect(() => {
    const attribution = currentAttribution();
    if (publicLeadAttributionFields.some((field) => attribution[field])) {
      window.sessionStorage.setItem(storageKey, JSON.stringify(attribution));
    }
  }, []);
  return null;
}

export function PublicLeadAttributionFields() {
  const [attribution, setAttribution] = useState<PublicLeadAttribution>({});
  useEffect(() => setAttribution(campaignAttribution()), []);
  return (
    <>
      {publicLeadAttributionFields.map((field) => (
        <input key={field} type="hidden" name={field} value={attribution[field] ?? ""} />
      ))}
      <input type="hidden" name="landing_path" value={attribution.landing_path ?? ""} />
    </>
  );
}
