import { MM_PER_FOOT } from "./model";

export const INSTALLATION_PROFILE_SCHEMA_VERSION = "fence-installation-profile-v1" as const;
export const INSTALLATION_PROFILE_OVERRIDE_SCHEMA_VERSION = "fence-installation-profile-override-v1" as const;

type DraftProfileIdentity = Readonly<{
  schemaVersion: typeof INSTALLATION_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  status: "draft_unvalidated";
  displayName: string;
}>;

type DerivedPostPolicy = Readonly<{ kind: "derived_layout_roles_v1" }>;
type PerLeafGateHardwarePolicy = Readonly<{
  kind: "per_leaf";
  hingesPerLeaf: number;
  latchesPerOpening: number;
  doubleGateDropPolesPerOpening: number;
}>;

export type ManufacturedPanelInstallationProfile = DraftProfileIdentity & Readonly<{
  construction: Readonly<{
    kind: "manufactured_panel";
    maximumBayWidthMm: number;
    panelCutPolicy: "end_cut_no_reuse";
    gateFabrication: Readonly<{
      kind: "stock_panel_cut";
      usableWidthMm: number;
      doubleGateSinglePanelMaximumWidthMm: number;
      doubleGateLeafPolicy: "equal_split";
    }>;
  }>;
  posts: DerivedPostPolicy;
  gateHardware: PerLeafGateHardwarePolicy;
}>;

export type StickBuiltPrivacyInstallationProfile = DraftProfileIdentity & Readonly<{
  construction: Readonly<{
    kind: "stick_built_privacy";
    maximumBayWidthMm: number;
    picketWidthMm: number;
    picketPlacement: "touching";
    railsPerBay: number;
    gateFramePiecesPerLeaf: number;
  }>;
  posts: DerivedPostPolicy;
  purchaseWaste: Readonly<{
    kind: "ceil_basis_points";
    basisPoints: number;
    appliesTo: readonly ["pickets", "rail_and_gate_frame_lumber", "posts"];
  }>;
  concrete: Readonly<{
    kind: "fixed_packages_per_installed_post";
    packagesPerPost: number;
    packageLabel: "50 lb";
  }>;
  fasteners: Readonly<{
    kind: "fixed_counts";
    picketScrewsPerPicket: number;
    railToPostScrewsPerBay: number;
    gateFrameScrewsPerLeaf: number;
    hardwareMounting: "included";
  }>;
  gateHardware: PerLeafGateHardwarePolicy;
}>;

export type FenceInstallationProfile = ManufacturedPanelInstallationProfile | StickBuiltPrivacyInstallationProfile;

export function isManufacturedPanelProfile(profile: FenceInstallationProfile): profile is ManufacturedPanelInstallationProfile {
  return profile.construction.kind === "manufactured_panel";
}

export function isStickBuiltPrivacyProfile(profile: FenceInstallationProfile): profile is StickBuiltPrivacyInstallationProfile {
  return profile.construction.kind === "stick_built_privacy";
}

export type InstallationProfileOverride =
  | Readonly<{
    kind: "maximum_bay_width";
    maximumBayWidthMm: number;
    reasonCode: "verified_job_maximum_bay_width";
  }>
  | Readonly<{
    kind: "lumber_waste_basis_points";
    basisPoints: number;
    reasonCode: "reviewed_job_lumber_waste";
  }>;

export type InstallationProfileOverrideSet = Readonly<{
  schemaVersion: typeof INSTALLATION_PROFILE_OVERRIDE_SCHEMA_VERSION;
  overrideId: string;
  baseProfileContentHash: string;
  overrides: readonly InstallationProfileOverride[];
}>;

const objectKeys = (value: Record<string, unknown>) => Object.keys(value).sort();

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string) {
  const actual = objectKeys(value);
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new TypeError(`${label} contains missing or unsupported fields.`);
  }
}

function literal<T extends string>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new TypeError(`${label} must be ${expected}.`);
  return expected;
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_-]{1,79}$/.test(value)) throw new TypeError(`${label} is invalid.`);
  return value;
}

function displayText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > 120) throw new TypeError(`${label} is invalid.`);
  return value;
}

function positiveInteger(value: unknown, label: string, maximum = 1_000_000): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > maximum) throw new TypeError(`${label} must be a bounded positive integer.`);
  return value as number;
}

function nonnegativeInteger(value: unknown, label: string, maximum = 1_000_000): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) throw new TypeError(`${label} must be a bounded nonnegative integer.`);
  return value as number;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
}

function validateIdentity(raw: Record<string, unknown>): DraftProfileIdentity {
  literal(raw.schemaVersion, INSTALLATION_PROFILE_SCHEMA_VERSION, "Profile schema version");
  const profileId = identifier(raw.profileId, "Profile ID");
  const profileVersion = identifier(raw.profileVersion, "Profile version");
  literal(raw.status, "draft_unvalidated", "Profile status");
  const displayName = displayText(raw.displayName, "Profile display name");
  return { schemaVersion: INSTALLATION_PROFILE_SCHEMA_VERSION, profileId, profileVersion, status: "draft_unvalidated", displayName };
}

function validatePosts(value: unknown): DerivedPostPolicy {
  const raw = record(value, "Post policy");
  exactKeys(raw, ["kind"], "Post policy");
  literal(raw.kind, "derived_layout_roles_v1", "Post policy kind");
  return { kind: "derived_layout_roles_v1" };
}

function validateGateHardware(value: unknown): PerLeafGateHardwarePolicy {
  const raw = record(value, "Gate hardware policy");
  exactKeys(raw, ["kind", "hingesPerLeaf", "latchesPerOpening", "doubleGateDropPolesPerOpening"], "Gate hardware policy");
  literal(raw.kind, "per_leaf", "Gate hardware policy kind");
  return {
    kind: "per_leaf",
    hingesPerLeaf: nonnegativeInteger(raw.hingesPerLeaf, "Hinges per leaf", 20),
    latchesPerOpening: nonnegativeInteger(raw.latchesPerOpening, "Latches per opening", 20),
    doubleGateDropPolesPerOpening: nonnegativeInteger(raw.doubleGateDropPolesPerOpening, "Double-gate drop poles", 20),
  };
}

export function validateInstallationProfile(input: unknown): FenceInstallationProfile {
  const raw = record(input, "Installation profile");
  const construction = record(raw.construction, "Construction policy");
  const identity = validateIdentity(raw);
  const posts = validatePosts(raw.posts);
  const gateHardware = validateGateHardware(raw.gateHardware);

  if (construction.kind === "manufactured_panel") {
    exactKeys(raw, ["schemaVersion", "profileId", "profileVersion", "status", "displayName", "construction", "posts", "gateHardware"], "Manufactured-panel profile");
    exactKeys(construction, ["kind", "maximumBayWidthMm", "panelCutPolicy", "gateFabrication"], "Manufactured-panel construction policy");
    const gateFabrication = record(construction.gateFabrication, "Gate fabrication policy");
    exactKeys(gateFabrication, ["kind", "usableWidthMm", "doubleGateSinglePanelMaximumWidthMm", "doubleGateLeafPolicy"], "Gate fabrication policy");
    const normalized: ManufacturedPanelInstallationProfile = {
      ...identity,
      construction: {
        kind: "manufactured_panel",
        maximumBayWidthMm: positiveInteger(construction.maximumBayWidthMm, "Maximum bay width"),
        panelCutPolicy: literal(construction.panelCutPolicy, "end_cut_no_reuse", "Panel cut policy"),
        gateFabrication: {
          kind: literal(gateFabrication.kind, "stock_panel_cut", "Gate fabrication kind"),
          usableWidthMm: positiveInteger(gateFabrication.usableWidthMm, "Usable gate material width"),
          doubleGateSinglePanelMaximumWidthMm: positiveInteger(gateFabrication.doubleGateSinglePanelMaximumWidthMm, "Double-gate single-panel maximum"),
          doubleGateLeafPolicy: literal(gateFabrication.doubleGateLeafPolicy, "equal_split", "Double-gate leaf policy"),
        },
      },
      posts,
      gateHardware,
    };
    if (normalized.construction.gateFabrication.doubleGateSinglePanelMaximumWidthMm > normalized.construction.gateFabrication.usableWidthMm) {
      throw new RangeError("Double-gate single-panel maximum cannot exceed usable gate material width.");
    }
    return deepFreeze(normalized);
  }

  if (construction.kind === "stick_built_privacy") {
    exactKeys(raw, ["schemaVersion", "profileId", "profileVersion", "status", "displayName", "construction", "posts", "purchaseWaste", "concrete", "fasteners", "gateHardware"], "Stick-built profile");
    exactKeys(construction, ["kind", "maximumBayWidthMm", "picketWidthMm", "picketPlacement", "railsPerBay", "gateFramePiecesPerLeaf"], "Stick-built construction policy");
    const purchaseWaste = record(raw.purchaseWaste, "Purchase waste policy");
    exactKeys(purchaseWaste, ["kind", "basisPoints", "appliesTo"], "Purchase waste policy");
    const appliesTo = purchaseWaste.appliesTo;
    if (!Array.isArray(appliesTo) || JSON.stringify(appliesTo) !== JSON.stringify(["pickets", "rail_and_gate_frame_lumber", "posts"])) throw new TypeError("Purchase waste component order is invalid.");
    const concrete = record(raw.concrete, "Concrete policy");
    exactKeys(concrete, ["kind", "packagesPerPost", "packageLabel"], "Concrete policy");
    const fasteners = record(raw.fasteners, "Fastener policy");
    exactKeys(fasteners, ["kind", "picketScrewsPerPicket", "railToPostScrewsPerBay", "gateFrameScrewsPerLeaf", "hardwareMounting"], "Fastener policy");
    return deepFreeze({
      ...identity,
      construction: {
        kind: "stick_built_privacy" as const,
        maximumBayWidthMm: positiveInteger(construction.maximumBayWidthMm, "Maximum bay width"),
        picketWidthMm: positiveInteger(construction.picketWidthMm, "Picket width"),
        picketPlacement: literal(construction.picketPlacement, "touching", "Picket placement"),
        railsPerBay: positiveInteger(construction.railsPerBay, "Rails per bay", 20),
        gateFramePiecesPerLeaf: positiveInteger(construction.gateFramePiecesPerLeaf, "Gate frame pieces per leaf", 40),
      },
      posts,
      purchaseWaste: {
        kind: literal(purchaseWaste.kind, "ceil_basis_points", "Purchase waste kind"),
        basisPoints: nonnegativeInteger(purchaseWaste.basisPoints, "Purchase waste basis points", 100_000),
        appliesTo: ["pickets", "rail_and_gate_frame_lumber", "posts"] as const,
      },
      concrete: {
        kind: literal(concrete.kind, "fixed_packages_per_installed_post", "Concrete policy kind"),
        packagesPerPost: positiveInteger(concrete.packagesPerPost, "Concrete packages per post", 20),
        packageLabel: literal(concrete.packageLabel, "50 lb", "Concrete package label"),
      },
      fasteners: {
        kind: literal(fasteners.kind, "fixed_counts", "Fastener policy kind"),
        picketScrewsPerPicket: nonnegativeInteger(fasteners.picketScrewsPerPicket, "Picket screws per picket", 100),
        railToPostScrewsPerBay: nonnegativeInteger(fasteners.railToPostScrewsPerBay, "Rail-to-post screws per bay", 100),
        gateFrameScrewsPerLeaf: nonnegativeInteger(fasteners.gateFrameScrewsPerLeaf, "Gate-frame screws per leaf", 100),
        hardwareMounting: literal(fasteners.hardwareMounting, "included", "Hardware mounting policy"),
      },
      gateHardware,
    });
  }

  throw new TypeError("Unsupported installation profile construction kind.");
}

function canonicalJsonValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("Canonical profile numbers must be safe integers.");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJsonValue).join(",")}]`;
  const raw = record(value, "Canonical profile value");
  return `{${objectKeys(raw).map((key) => `${JSON.stringify(key)}:${canonicalJsonValue(raw[key])}`).join(",")}}`;
}

export function canonicalInstallationProfileJson(profile: FenceInstallationProfile): string {
  return canonicalJsonValue(validateInstallationProfile(profile));
}

function rotateRight(value: number, amount: number) {
  return (value >>> amount) | (value << (32 - amount));
}

function sha256Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes); padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const w15 = words[index - 15]; const w2 = words[index - 2];
      const s0 = rotateRight(w15, 7) ^ rotateRight(w15, 18) ^ (w15 >>> 3);
      const s1 = rotateRight(w2, 17) ^ rotateRight(w2, 19) ^ (w2 >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choice + constants[index] + words[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0; hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0; hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
  }
  return hash.map((word) => word.toString(16).padStart(8, "0")).join("");
}

export function installationProfileContentHash(profile: FenceInstallationProfile): string {
  return `sha256:${sha256Utf8(canonicalInstallationProfileJson(profile))}`;
}

export function validateInstallationProfileOverrideSet(input: unknown): InstallationProfileOverrideSet {
  const raw = record(input, "Installation profile override set");
  exactKeys(raw, ["schemaVersion", "overrideId", "baseProfileContentHash", "overrides"], "Installation profile override set");
  literal(raw.schemaVersion, INSTALLATION_PROFILE_OVERRIDE_SCHEMA_VERSION, "Override schema version");
  const overrideId = identifier(raw.overrideId, "Override ID");
  if (typeof raw.baseProfileContentHash !== "string" || !/^sha256:[0-9a-f]{64}$/.test(raw.baseProfileContentHash)) throw new TypeError("Base profile content hash is invalid.");
  if (!Array.isArray(raw.overrides) || raw.overrides.length < 1 || raw.overrides.length > 2) throw new TypeError("Override set must contain one or two controlled overrides.");
  const seen = new Set<string>();
  const overrides = raw.overrides.map((value, index): InstallationProfileOverride => {
    const item = record(value, `Override ${index + 1}`);
    if (typeof item.kind !== "string" || seen.has(item.kind)) throw new TypeError("Override kinds must be supported and unique.");
    seen.add(item.kind);
    if (item.kind === "maximum_bay_width") {
      exactKeys(item, ["kind", "maximumBayWidthMm", "reasonCode"], "Maximum-bay override");
      return Object.freeze({
        kind: "maximum_bay_width" as const,
        maximumBayWidthMm: positiveInteger(item.maximumBayWidthMm, "Override maximum bay width"),
        reasonCode: literal(item.reasonCode, "verified_job_maximum_bay_width", "Maximum-bay override reason"),
      });
    }
    if (item.kind === "lumber_waste_basis_points") {
      exactKeys(item, ["kind", "basisPoints", "reasonCode"], "Lumber-waste override");
      return Object.freeze({
        kind: "lumber_waste_basis_points" as const,
        basisPoints: nonnegativeInteger(item.basisPoints, "Override waste basis points", 100_000),
        reasonCode: literal(item.reasonCode, "reviewed_job_lumber_waste", "Lumber-waste override reason"),
      });
    }
    throw new TypeError("Unsupported installation profile override kind.");
  });
  return deepFreeze({
    schemaVersion: INSTALLATION_PROFILE_OVERRIDE_SCHEMA_VERSION,
    overrideId,
    baseProfileContentHash: raw.baseProfileContentHash,
    overrides: Object.freeze(overrides),
  });
}

export function applyInstallationProfileOverrides(
  profileInput: FenceInstallationProfile,
  overrideInput: InstallationProfileOverrideSet | null,
): Readonly<{ baseProfile: FenceInstallationProfile; effectiveProfile: FenceInstallationProfile; baseProfileContentHash: string; overrideContentHash: string | null }> {
  const baseProfile = validateInstallationProfile(profileInput);
  const baseProfileContentHash = installationProfileContentHash(baseProfile);
  if (!overrideInput) return Object.freeze({ baseProfile, effectiveProfile: baseProfile, baseProfileContentHash, overrideContentHash: null });
  const overrideSet = validateInstallationProfileOverrideSet(overrideInput);
  if (overrideSet.baseProfileContentHash !== baseProfileContentHash) throw new RangeError("Override set does not target this exact profile version.");
  let effectiveProfile: FenceInstallationProfile = baseProfile;
  overrideSet.overrides.forEach((override) => {
    if (override.kind === "maximum_bay_width") {
      effectiveProfile = validateInstallationProfile({
        ...effectiveProfile,
        construction: { ...effectiveProfile.construction, maximumBayWidthMm: override.maximumBayWidthMm },
      });
      return;
    }
    if (!isStickBuiltPrivacyProfile(effectiveProfile)) throw new RangeError("Lumber-waste override is valid only for a stick-built privacy profile.");
    effectiveProfile = validateInstallationProfile({ ...effectiveProfile, purchaseWaste: { ...effectiveProfile.purchaseWaste, basisPoints: override.basisPoints } });
  });
  const overrideContentHash = `sha256:${sha256Utf8(canonicalJsonValue(overrideSet))}`;
  return Object.freeze({ baseProfile, effectiveProfile, baseProfileContentHash, overrideContentHash });
}

export const BLACK_ALUMINUM_DRAFT_PROFILE = validateInstallationProfile({
  schemaVersion: INSTALLATION_PROFILE_SCHEMA_VERSION,
  profileId: "black-aluminum-embedded-draft",
  profileVersion: "draft-v1",
  status: "draft_unvalidated",
  displayName: "Black Aluminum — embedded assumptions",
  construction: {
    kind: "manufactured_panel",
    maximumBayWidthMm: Math.round(8 * MM_PER_FOOT),
    panelCutPolicy: "end_cut_no_reuse",
    gateFabrication: {
      kind: "stock_panel_cut",
      usableWidthMm: Math.round(7 * MM_PER_FOOT),
      doubleGateSinglePanelMaximumWidthMm: Math.round(6 * MM_PER_FOOT),
      doubleGateLeafPolicy: "equal_split",
    },
  },
  posts: { kind: "derived_layout_roles_v1" },
  gateHardware: { kind: "per_leaf", hingesPerLeaf: 2, latchesPerOpening: 1, doubleGateDropPolesPerOpening: 1 },
}) as ManufacturedPanelInstallationProfile;

export const TREATED_PINE_PRIVACY_DRAFT_PROFILE = validateInstallationProfile({
  schemaVersion: INSTALLATION_PROFILE_SCHEMA_VERSION,
  profileId: "treated-pine-privacy-embedded-draft",
  profileVersion: "draft-v1",
  status: "draft_unvalidated",
  displayName: "Treated Pine Privacy — embedded assumptions",
  construction: {
    kind: "stick_built_privacy",
    maximumBayWidthMm: Math.round(8 * MM_PER_FOOT),
    picketWidthMm: Math.round(6 * MM_PER_FOOT / 12),
    picketPlacement: "touching",
    railsPerBay: 3,
    gateFramePiecesPerLeaf: 5,
  },
  posts: { kind: "derived_layout_roles_v1" },
  purchaseWaste: { kind: "ceil_basis_points", basisPoints: 1_000, appliesTo: ["pickets", "rail_and_gate_frame_lumber", "posts"] },
  concrete: { kind: "fixed_packages_per_installed_post", packagesPerPost: 1, packageLabel: "50 lb" },
  fasteners: { kind: "fixed_counts", picketScrewsPerPicket: 6, railToPostScrewsPerBay: 12, gateFrameScrewsPerLeaf: 12, hardwareMounting: "included" },
  gateHardware: { kind: "per_leaf", hingesPerLeaf: 2, latchesPerOpening: 1, doubleGateDropPolesPerOpening: 1 },
}) as StickBuiltPrivacyInstallationProfile;
