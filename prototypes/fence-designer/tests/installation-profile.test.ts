import { describe, expect, it } from "vitest";
import { EMPTY_DESIGN, addPoint, feetAndInchesToMm, setSegmentKind, type FenceDesign } from "../src/model";
import {
  applyInstallationProfileOverrides,
  BLACK_ALUMINUM_DRAFT_PROFILE,
  canonicalInstallationProfileJson,
  installationProfileContentHash,
  TREATED_PINE_PRIVACY_DRAFT_PROFILE,
  validateInstallationProfile,
  validateInstallationProfileOverrideSet,
  type InstallationProfileOverrideSet,
} from "../src/installation-profile";
import {
  calculateBlackAluminumTakeoff,
  calculateTakeoffForInstallationProfile,
  calculateTreatedPinePrivacyTakeoff,
} from "../src/takeoff";

function line(lengthsFeet: readonly number[]): FenceDesign {
  let design = addPoint(EMPTY_DESIGN, { id: "point-1", xMm: 0, yMm: 0 });
  let xMm = 0;
  lengthsFeet.forEach((length, index) => {
    xMm += feetAndInchesToMm(length, 0);
    design = addPoint(design, { id: `point-${index + 2}`, xMm, yMm: 0 }, `segment-${index + 1}`);
  });
  return design;
}

function overrideSet(
  profile: typeof BLACK_ALUMINUM_DRAFT_PROFILE | typeof TREATED_PINE_PRIVACY_DRAFT_PROFILE,
  overrides: InstallationProfileOverrideSet["overrides"],
): InstallationProfileOverrideSet {
  return {
    schemaVersion: "fence-installation-profile-override-v1",
    overrideId: "verified-job-override-1",
    baseProfileContentHash: installationProfileContentHash(profile),
    overrides,
  };
}

describe("draft Fence Installation Profiles", () => {
  it("validates only closed supported rule shapes and rejects unknown behavior", () => {
    expect(validateInstallationProfile(BLACK_ALUMINUM_DRAFT_PROFILE)).toEqual(BLACK_ALUMINUM_DRAFT_PROFILE);
    expect(() => validateInstallationProfile({ ...BLACK_ALUMINUM_DRAFT_PROFILE, formula: "quantity * 2" })).toThrow(/unsupported fields/);
    expect(() => validateInstallationProfile({
      ...BLACK_ALUMINUM_DRAFT_PROFILE,
      construction: { ...BLACK_ALUMINUM_DRAFT_PROFILE.construction, panelCutPolicy: "reuse_any_cutoff" },
    })).toThrow(/Panel cut policy/);
    expect(() => validateInstallationProfile({
      ...TREATED_PINE_PRIVACY_DRAFT_PROFILE,
      purchaseWaste: { ...TREATED_PINE_PRIVACY_DRAFT_PROFILE.purchaseWaste, appliesTo: ["posts", "pickets", "rail_and_gate_frame_lumber"] },
    })).toThrow(/component order/);
  });

  it("canonicalizes deterministically and matches a SHA-256 reference implementation", () => {
    const canonical = canonicalInstallationProfileJson(BLACK_ALUMINUM_DRAFT_PROFILE);
    const reordered = validateInstallationProfile({
      gateHardware: BLACK_ALUMINUM_DRAFT_PROFILE.gateHardware,
      posts: BLACK_ALUMINUM_DRAFT_PROFILE.posts,
      construction: BLACK_ALUMINUM_DRAFT_PROFILE.construction,
      displayName: BLACK_ALUMINUM_DRAFT_PROFILE.displayName,
      status: BLACK_ALUMINUM_DRAFT_PROFILE.status,
      profileVersion: BLACK_ALUMINUM_DRAFT_PROFILE.profileVersion,
      profileId: BLACK_ALUMINUM_DRAFT_PROFILE.profileId,
      schemaVersion: BLACK_ALUMINUM_DRAFT_PROFILE.schemaVersion,
    });
    expect(canonicalInstallationProfileJson(reordered)).toBe(canonical);
    expect(installationProfileContentHash(reordered)).toBe("sha256:ece705ac14e3fdf937067e89e9aa5b0e6d9f4f186d06d375659daff95a00dad6");
  });

  it("binds content identity to the exact profile version", () => {
    const nextVersion = validateInstallationProfile({ ...BLACK_ALUMINUM_DRAFT_PROFILE, profileVersion: "draft-v2" });
    expect(installationProfileContentHash(nextVersion)).not.toBe(installationProfileContentHash(BLACK_ALUMINUM_DRAFT_PROFILE));
    expect(BLACK_ALUMINUM_DRAFT_PROFILE.status).toBe("draft_unvalidated");
    expect(TREATED_PINE_PRIVACY_DRAFT_PROFILE.status).toBe("draft_unvalidated");
  });

  it("applies an exact hash-bound bay override without mutating the base profile", () => {
    const before = canonicalInstallationProfileJson(BLACK_ALUMINUM_DRAFT_PROFILE);
    const overrides = overrideSet(BLACK_ALUMINUM_DRAFT_PROFILE, [{
      kind: "maximum_bay_width",
      maximumBayWidthMm: feetAndInchesToMm(4, 0),
      reasonCode: "verified_job_maximum_bay_width",
    }]);
    const resolved = applyInstallationProfileOverrides(BLACK_ALUMINUM_DRAFT_PROFILE, overrides);
    expect(resolved.effectiveProfile.construction.maximumBayWidthMm).toBe(feetAndInchesToMm(4, 0));
    expect(resolved.effectiveProfile).not.toBe(resolved.baseProfile);
    expect(canonicalInstallationProfileJson(BLACK_ALUMINUM_DRAFT_PROFILE)).toBe(before);
    const evaluation = calculateTakeoffForInstallationProfile(line([16]), BLACK_ALUMINUM_DRAFT_PROFILE, overrides);
    expect(evaluation.kind).toBe("manufactured_panel");
    expect(evaluation.takeoff).toMatchObject({ fencePanelCount: 4, linePosts: 3 });
    expect(evaluation.overrideContentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("allows only reviewed lumber waste on stick-built profiles", () => {
    const overrides = overrideSet(TREATED_PINE_PRIVACY_DRAFT_PROFILE, [{
      kind: "lumber_waste_basis_points",
      basisPoints: 0,
      reasonCode: "reviewed_job_lumber_waste",
    }]);
    const evaluation = calculateTakeoffForInstallationProfile(line([16]), TREATED_PINE_PRIVACY_DRAFT_PROFILE, overrides);
    expect(evaluation.kind).toBe("stick_built_privacy");
    expect(evaluation.takeoff).toMatchObject({ installedPickets: 32, picketsWithWaste: 32, twoByFoursWithWaste: 6, fourByFoursWithWaste: 3 });
    const rejected = overrideSet(BLACK_ALUMINUM_DRAFT_PROFILE, overrides.overrides);
    expect(() => calculateTakeoffForInstallationProfile(line([16]), BLACK_ALUMINUM_DRAFT_PROFILE, rejected)).toThrow(/stick-built privacy/);
  });

  it("rejects stale, duplicate, arbitrary, and extra-field overrides", () => {
    const stale = { ...overrideSet(BLACK_ALUMINUM_DRAFT_PROFILE, [{
      kind: "maximum_bay_width" as const,
      maximumBayWidthMm: feetAndInchesToMm(4, 0),
      reasonCode: "verified_job_maximum_bay_width" as const,
    }]), baseProfileContentHash: `sha256:${"0".repeat(64)}` };
    expect(() => applyInstallationProfileOverrides(BLACK_ALUMINUM_DRAFT_PROFILE, stale)).toThrow(/exact profile version/);
    expect(() => validateInstallationProfileOverrideSet({
      ...stale,
      baseProfileContentHash: installationProfileContentHash(BLACK_ALUMINUM_DRAFT_PROFILE),
      overrides: [stale.overrides[0], stale.overrides[0]],
    })).toThrow(/unique/);
    expect(() => validateInstallationProfileOverrideSet({
      ...stale,
      baseProfileContentHash: installationProfileContentHash(BLACK_ALUMINUM_DRAFT_PROFILE),
      overrides: [{ kind: "arbitrary_formula", expression: "* 2" }],
    })).toThrow(/Unsupported/);
    expect(() => validateInstallationProfileOverrideSet({
      ...stale,
      baseProfileContentHash: installationProfileContentHash(BLACK_ALUMINUM_DRAFT_PROFILE),
      overrides: [{ ...stale.overrides[0], note: "free-form behavior" }],
    })).toThrow(/unsupported fields/);
  });

  it("replays both embedded systems through the generic evaluator with exact parity and order", () => {
    let design = line([8, 4, 8]);
    design = setSegmentKind(design, "segment-2", "gate");
    const black = calculateTakeoffForInstallationProfile(design, BLACK_ALUMINUM_DRAFT_PROFILE);
    const pine = calculateTakeoffForInstallationProfile(design, TREATED_PINE_PRIVACY_DRAFT_PROFILE);
    expect(black.kind).toBe("manufactured_panel");
    expect(pine.kind).toBe("stick_built_privacy");
    expect(black.takeoff).toEqual(calculateBlackAluminumTakeoff(design));
    expect(pine.takeoff).toEqual(calculateTreatedPinePrivacyTakeoff(design));
    expect(JSON.stringify(calculateTakeoffForInstallationProfile(design, BLACK_ALUMINUM_DRAFT_PROFILE))).toBe(JSON.stringify(black));
    expect(JSON.stringify(calculateTakeoffForInstallationProfile(design, TREATED_PINE_PRIVACY_DRAFT_PROFILE))).toBe(JSON.stringify(pine));
  });
});
