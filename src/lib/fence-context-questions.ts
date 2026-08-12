import type { FenceLayoutDraftProjection } from "@/lib/fence-layout-draft";

export const FENCE_EMBLEM_SYSTEM_KEY = "lowes_emblem_white_privacy_6x8_working_v0";
export const FENCE_CONTEXT_SCHEMA_VERSION = "fence-context-v1";

export type FenceContextAnswers = Readonly<{
  system?: "emblem_6x8_white" | "different_or_unsure";
  measurementBasis?: "post_centers" | "different_or_unsure";
  terrain?: "level" | "sloped_or_unsure";
  corners?: "exact_90" | "different_or_unsure";
  frostDepthInches?: string;
  conditions?: "none" | "single_gate_4ft" | "single_gate_5ft" | "pool" | "other_unsupported";
}>;

export type FenceContextQuestion = Readonly<{
  key: keyof FenceContextAnswers;
  prompt: string;
  help: string;
  options?: readonly Readonly<{ value: string; label: string }>[];
  inputKind: "choice" | "whole_inches";
}>;

export type FenceContextProjection = Readonly<{
  status: "waiting_for_draft" | "asking" | "job_context_complete" | "manual_review";
  statusLabel: string;
  estimateStatusLabel: string;
  propertyAddressLabel: string;
  currentQuestion: FenceContextQuestion | null;
  answeredQuestionKeys: readonly (keyof FenceContextAnswers)[];
  manufacturerFacts: readonly string[];
  jobBlocker: string | null;
  companyStandardBlockers: readonly string[];
  testFixtureNotice: string;
}>;

const MANUFACTURER_FACTS = Object.freeze([
  "The selected Emblem panel is 72 in high by 94 in wide and uses coordinating routed 5 in posts.",
  "An uncut panel with a 5 in post gives the source-derived 99 in nominal post-center pitch.",
  "Ordinary full panels require no separate panel brackets with the coordinating routed posts.",
  "The manufacturer specifies a 10 in hole diameter for a 5 in by 5 in post and ties hole depth to the local frost line.",
  "The panel may rack up to 1 in per foot, but this workflow does not yet calculate sloped takeoffs.",
]);

const COMPANY_STANDARD_BLOCKERS = Object.freeze([
  "Approve the minimum permitted cut-panel width and production cut-balancing policy.",
  "Approve ordinary-post and gate-post foundation profiles, including gravel depth, displacement, concrete product, yield, and waste.",
  "Approve the gate insert, latch, clearance, and gate-foundation rules before gate quantities are produced.",
]);

const TEST_FIXTURE_NOTICE = "Test only: the 36 in foundation example uses 12 in of gravel and 24 in of post surrounded by concrete. It is a calculation fixture, not customer-authoritative job guidance.";

const CHOICES = {
  system: Object.freeze([
    { value: "emblem_6x8_white", label: "Yes — Emblem 6 × 8 white" },
    { value: "different_or_unsure", label: "Different system or unsure" },
  ]),
  measurementBasis: Object.freeze([
    { value: "post_centers", label: "Post center to post center" },
    { value: "different_or_unsure", label: "Different measurement or unsure" },
  ]),
  terrain: Object.freeze([
    { value: "level", label: "Level" },
    { value: "sloped_or_unsure", label: "Sloped or unsure" },
  ]),
  corners: Object.freeze([
    { value: "exact_90", label: "Yes — every corner is exactly 90°" },
    { value: "different_or_unsure", label: "No or unsure" },
  ]),
  conditions: Object.freeze([
    { value: "none", label: "None of these" },
    { value: "single_gate_4ft", label: "One 4-ft single gate" },
    { value: "single_gate_5ft", label: "One 5-ft single gate" },
    { value: "pool", label: "Pool enclosure or pool gate" },
    { value: "other_unsupported", label: "Other gate or special condition" },
  ]),
} as const;

function readable(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function statusLabel(value: unknown) {
  return readable(value, "Status unavailable")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function question(
  key: keyof FenceContextAnswers,
  prompt: string,
  help: string,
  options?: FenceContextQuestion["options"],
): FenceContextQuestion {
  return Object.freeze({
    key,
    prompt,
    help,
    options,
    inputKind: key === "frostDepthInches" ? "whole_inches" : "choice",
  });
}

function base(input: Readonly<{
  estimate: Readonly<{ propertyAddress?: unknown; status?: unknown }>;
}>) {
  return {
    estimateStatusLabel: statusLabel(input.estimate.status),
    propertyAddressLabel: readable(input.estimate.propertyAddress, "Address not added"),
    manufacturerFacts: MANUFACTURER_FACTS,
    companyStandardBlockers: COMPANY_STANDARD_BLOCKERS,
    testFixtureNotice: TEST_FIXTURE_NOTICE,
  };
}

function manualReview(
  input: Parameters<typeof base>[0],
  answeredQuestionKeys: readonly (keyof FenceContextAnswers)[],
  jobBlocker: string,
): FenceContextProjection {
  return Object.freeze({
    ...base(input),
    status: "manual_review",
    statusLabel: "Manual review",
    currentQuestion: null,
    answeredQuestionKeys: Object.freeze([...answeredQuestionKeys]),
    jobBlocker,
  });
}

export function projectFenceContextQuestions(input: Readonly<{
  draft: Pick<FenceLayoutDraftProjection, "status" | "runs">;
  needsGate?: boolean;
  estimate: Readonly<{ propertyAddress?: unknown; status?: unknown }>;
  answers?: FenceContextAnswers;
}>): FenceContextProjection {
  const answers = input.answers ?? {};
  const answered: (keyof FenceContextAnswers)[] = [];
  const buildAsking = (currentQuestion: FenceContextQuestion): FenceContextProjection => Object.freeze({
    ...base(input),
    status: "asking",
    statusLabel: "Question needed",
    currentQuestion,
    answeredQuestionKeys: Object.freeze([...answered]),
    jobBlocker: null,
  });

  const validGateDraft = input.needsGate === true
    && input.draft.runs.length > 0
    && input.draft.runs.every((run) => run.error === null);
  if (input.draft.status !== "ready" && !validGateDraft) {
    return Object.freeze({
      ...base(input),
      status: "waiting_for_draft",
      statusLabel: "Finish drawing first",
      currentQuestion: null,
      answeredQuestionKeys: Object.freeze([]),
      jobBlocker: null,
    });
  }

  if (!answers.system) {
    return buildAsking(question(
      "system",
      "Is this the CATALYST/Freedom Emblem 6 × 8 white privacy system?",
      "The guided rules apply only to this exact panel and coordinating post family.",
      CHOICES.system,
    ));
  }
  answered.push("system");
  if (answers.system !== "emblem_6x8_white") {
    return manualReview(input, answered, "A different or unconfirmed fence system needs its own manufacturer-backed rule set.");
  }

  if (!answers.measurementBasis) {
    return buildAsking(question(
      "measurementBasis",
      "Were the typed run lengths measured from post center to post center?",
      "The working 99 in section rule is valid only for post-center measurements.",
      CHOICES.measurementBasis,
    ));
  }
  answered.push("measurementBasis");
  if (answers.measurementBasis !== "post_centers") {
    return manualReview(input, answered, "Measurements that are not confirmed post-center dimensions cannot use the working 99 in pitch.");
  }

  if (!answers.terrain) {
    return buildAsking(question(
      "terrain",
      "Is every drawn run level?",
      "The panel rack limit is known, but the sloped takeoff convention is not approved yet.",
      CHOICES.terrain,
    ));
  }
  answered.push("terrain");
  if (answers.terrain !== "level") {
    return manualReview(input, answered, "Sloped or unverified terrain needs manual review until the slope measurement and rack-limit rules are approved.");
  }

  if (input.draft.runs.length > 1) {
    if (!answers.corners) {
      return buildAsking(question(
        "corners",
        "Are all connected corners exactly 90°?",
        "T-junctions and arbitrary angles do not have an approved Emblem V0 post rule.",
        CHOICES.corners,
      ));
    }
    answered.push("corners");
    if (answers.corners !== "exact_90") {
      return manualReview(input, answered, "A non-90° or unverified corner does not have an approved routed-post rule.");
    }
  }

  const frostDepth = answers.frostDepthInches?.trim();
  const propertyAddress = typeof input.estimate.propertyAddress === "string"
    ? input.estimate.propertyAddress.trim()
    : "";
  if (!frostDepth || !/^\d{1,4}$/.test(frostDepth) || BigInt(frostDepth) === 0n) {
    return buildAsking(question(
      "frostDepthInches",
      "What verified frost depth applies at this job?",
      propertyAddress
        ? `Enter whole inches for ${propertyAddress}. Verify the local code source; the software does not infer frost depth from the address.`
        : "Enter whole inches from the verified job jurisdiction. Add or verify the job address before relying on this answer.",
    ));
  }
  answered.push("frostDepthInches");

  if (!answers.conditions) {
    return buildAsking(question(
      "conditions",
      input.needsGate
        ? "What gate or special condition applies to this job?"
        : "Does this job include a gate, pool enclosure, or another special condition?",
      "Gate identities exist, but gate foundations, latch selection, insert count, and pool compliance are not approved takeoff rules.",
      input.needsGate
        ? Object.freeze(CHOICES.conditions.filter((option) => option.value !== "none"))
        : CHOICES.conditions,
    ));
  }
  answered.push("conditions");
  if (input.needsGate && answers.conditions === "none") {
    return manualReview(input, answered, "The saved drawing says a gate is needed, so a no-gate answer cannot be used.");
  }
  if (answers.conditions === "pool") {
    return manualReview(input, answered, "The cited gate instructions state that the gate is not pool-code approved.");
  }
  if (answers.conditions === "single_gate_4ft" || answers.conditions === "single_gate_5ft") {
    return manualReview(input, answered, "Single-gate takeoff remains blocked by the gate foundation, insert-count, latch, and clearance rules.");
  }
  if (answers.conditions === "other_unsupported") {
    return manualReview(input, answered, "Double gates, drive gates, surface mounts, T-junctions, mixed heights, and other special conditions are outside Emblem V0.");
  }

  return Object.freeze({
    ...base(input),
    status: "job_context_complete",
    statusLabel: "Job questions complete",
    currentQuestion: null,
    answeredQuestionKeys: Object.freeze([...answered]),
    jobBlocker: null,
  });
}
