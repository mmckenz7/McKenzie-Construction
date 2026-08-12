import type { FenceContextAnswers } from "./fence-context-questions";

export const FENCE_EMBLEM_TAKEOFF_SYSTEM_KEY = "lowes_emblem_white_privacy_6x8_working_v0";

export const EMBLEM_POST_CENTER_PITCH_INCHES = 99n;
export const EMBLEM_POST_WIDTH_INCHES = 5n;

export type EmblemTakeoffIssueCode =
  | "INCOMPLETE_JOB_ANSWERS"
  | "UNSUPPORTED_SYSTEM"
  | "UNSUPPORTED_MEASUREMENT_BASIS"
  | "UNSUPPORTED_SLOPE"
  | "UNSUPPORTED_CORNER"
  | "UNSUPPORTED_GATE"
  | "UNSUPPORTED_POOL_OR_SPECIAL_CONDITION"
  | "INVALID_RUN_LENGTH"
  | "UNVERIFIED_CUT_WIDTH";

export type EmblemRunTakeoffTrace = Readonly<{
  runNumber: number;
  centerlineLengthInches: string;
  panelCount: number;
  linePostCount: number;
  finalPanelPhysicalWidthInches: string;
  requiresCut: boolean;
}>;

export type EmblemManufacturerTakeoff = Readonly<{
  authority: "source_derived_working_test_rule";
  systemKey: typeof FENCE_EMBLEM_TAKEOFF_SYSTEM_KEY;
  panelCount: number;
  endPostCount: number;
  linePostCount: number;
  cornerPostCount: number;
  capCount: number;
  bracketCount: 0;
  physicalPostCount: number;
  runs: readonly EmblemRunTakeoffTrace[];
}>;

export type EmblemTakeoffProjection = Readonly<{
  status: "ready" | "manual_review";
  manufacturerTakeoff: EmblemManufacturerTakeoff | null;
  blockedCalculationTrace: EmblemManufacturerTakeoff | null;
  issueCodes: readonly EmblemTakeoffIssueCode[];
  issue: string | null;
}>;

export type EmblemFoundationTestFixture = Readonly<{
  authority: "test_only";
  notice: string;
  physicalPostCount: number;
  theoreticalConcreteCubicFeet: string;
  theoreticalGravelCubicFeet: string;
  concreteBagCount80Lb: number;
  gravelBagCountHalfCubicFoot: number;
  assumptions: readonly string[];
}>;

const POSITIVE_WHOLE_INCHES = /^\d+$/;
const TEST_FIXTURE_CONCRETE_PER_POST_TEN_THOUSANDTHS = 7_436n;
const TEST_FIXTURE_GRAVEL_PER_POST_TEN_THOUSANDTHS = 5_454n;
const TEST_FIXTURE_CONCRETE_BAG_YIELD_TEN_THOUSANDTHS = 6_000n;
const TEST_FIXTURE_GRAVEL_BAG_YIELD_TEN_THOUSANDTHS = 5_000n;

function frozenIssue(code: EmblemTakeoffIssueCode, issue: string): EmblemTakeoffProjection {
  return Object.freeze({
    status: "manual_review",
    manufacturerTakeoff: null,
    blockedCalculationTrace: null,
    issueCodes: Object.freeze([code]),
    issue,
  });
}

function validateContext(
  answers: FenceContextAnswers,
  needsGate: boolean,
  runCount: number,
): EmblemTakeoffProjection | null {
  const required = [answers.system, answers.measurementBasis, answers.terrain,
    answers.frostDepthInches, answers.conditions];
  if (runCount > 1) required.push(answers.corners);
  if (required.some((answer) => typeof answer !== "string" || !answer.trim())) {
    return frozenIssue("INCOMPLETE_JOB_ANSWERS", "Complete every required job question before calculating materials.");
  }
  if (!/^\d{1,4}$/.test(answers.frostDepthInches as string)
    || BigInt(answers.frostDepthInches as string) === 0n) {
    return frozenIssue("INCOMPLETE_JOB_ANSWERS", "A verified positive whole-inch frost depth is required for the job record.");
  }
  if (answers.system !== "emblem_6x8_white") {
    return frozenIssue("UNSUPPORTED_SYSTEM", "Only the documented Emblem 6 × 8 white system is supported.");
  }
  if (answers.measurementBasis !== "post_centers") {
    return frozenIssue("UNSUPPORTED_MEASUREMENT_BASIS", "The 99-inch working rule requires post-center measurements.");
  }
  if (answers.terrain !== "level") {
    return frozenIssue("UNSUPPORTED_SLOPE", "Sloped takeoffs remain unsupported even within the stated rack limit.");
  }
  if (runCount > 1 && answers.corners !== "exact_90") {
    return frozenIssue("UNSUPPORTED_CORNER", "Every connected corner must be confirmed as exactly 90 degrees.");
  }
  if (needsGate || answers.conditions === "single_gate_4ft" || answers.conditions === "single_gate_5ft") {
    return frozenIssue("UNSUPPORTED_GATE", "Gate takeoffs remain blocked by unresolved gate assembly and foundation rules.");
  }
  if (answers.conditions !== "none") {
    return frozenIssue("UNSUPPORTED_POOL_OR_SPECIAL_CONDITION", "Pool enclosures and special conditions are outside Emblem V0.");
  }
  return null;
}

function safeNumber(value: bigint) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Takeoff quantity exceeds the safe integer range.");
  return Number(value);
}

function calculateManufacturerTrace(runLengthsInches: readonly string[]): EmblemManufacturerTakeoff {
  const runs = runLengthsInches.map((rawLength, index): EmblemRunTakeoffTrace => {
    const length = BigInt(rawLength);
    const sections = (length + EMBLEM_POST_CENTER_PITCH_INCHES - 1n) / EMBLEM_POST_CENTER_PITCH_INCHES;
    const finalPitch = length - (sections - 1n) * EMBLEM_POST_CENTER_PITCH_INCHES;
    const finalPanelWidth = finalPitch - EMBLEM_POST_WIDTH_INCHES;
    return Object.freeze({
      runNumber: index + 1,
      centerlineLengthInches: length.toString(),
      panelCount: safeNumber(sections),
      linePostCount: safeNumber(sections - 1n),
      finalPanelPhysicalWidthInches: finalPanelWidth.toString(),
      requiresCut: finalPitch !== EMBLEM_POST_CENTER_PITCH_INCHES,
    });
  });
  const panelCount = runs.reduce((sum, run) => sum + run.panelCount, 0);
  const linePostCount = runs.reduce((sum, run) => sum + run.linePostCount, 0);
  const cornerPostCount = Math.max(runs.length - 1, 0);
  const endPostCount = runs.length > 0 ? 2 : 0;
  const physicalPostCount = endPostCount + linePostCount + cornerPostCount;
  return Object.freeze({
    authority: "source_derived_working_test_rule",
    systemKey: FENCE_EMBLEM_TAKEOFF_SYSTEM_KEY,
    panelCount,
    endPostCount,
    linePostCount,
    cornerPostCount,
    capCount: physicalPostCount,
    bracketCount: 0,
    physicalPostCount,
    runs: Object.freeze(runs),
  });
}

export function projectEmblemManufacturerTakeoff(input: Readonly<{
  runLengthsInches: readonly string[];
  needsGate: boolean;
  answers: FenceContextAnswers;
}>): EmblemTakeoffProjection {
  if (input.runLengthsInches.length < 1 || input.runLengthsInches.length > 50
    || input.runLengthsInches.some((length) => !POSITIVE_WHOLE_INCHES.test(length)
      || BigInt(length) === 0n || BigInt(length) > 12_000n)
    || input.runLengthsInches.reduce((sum, length) =>
      POSITIVE_WHOLE_INCHES.test(length) ? sum + BigInt(length) : sum, 0n) > 60_000n) {
    return frozenIssue("INVALID_RUN_LENGTH", "Every run must contain a supported positive whole-inch centerline length.");
  }

  const contextIssue = validateContext(input.answers, input.needsGate, input.runLengthsInches.length);
  if (contextIssue) return contextIssue;

  const trace = calculateManufacturerTrace(input.runLengthsInches);
  const invalidCut = trace.runs.some((run) => run.requiresCut
    && BigInt(run.finalPanelPhysicalWidthInches) <= 0n);
  if (invalidCut) {
    return frozenIssue("UNVERIFIED_CUT_WIDTH", "A run is too short to produce a positive physical panel width under the working geometry rule.");
  }
  if (trace.runs.some((run) => run.requiresCut)) {
    const issueCodes: readonly EmblemTakeoffIssueCode[] = Object.freeze(["UNVERIFIED_CUT_WIDTH"]);
    return Object.freeze({
      status: "manual_review",
      manufacturerTakeoff: null,
      blockedCalculationTrace: trace,
      issueCodes,
      issue: "The calculated cut width is traceable, but no minimum permitted cut-panel width is approved. Do not use this trace as an issued material takeoff.",
    });
  }

  return Object.freeze({
    status: "ready",
    manufacturerTakeoff: trace,
    blockedCalculationTrace: null,
    issueCodes: Object.freeze([]),
    issue: null,
  });
}

function formatTenThousandths(value: bigint) {
  const whole = value / 10_000n;
  const fractional = (value % 10_000n).toString().padStart(4, "0");
  return `${whole}.${fractional}`;
}

function ceilDivide(numerator: bigint, denominator: bigint) {
  return (numerator + denominator - 1n) / denominator;
}

export function calculateEmblemFoundationTestFixture(
  physicalPostCount: number,
): EmblemFoundationTestFixture {
  if (!Number.isSafeInteger(physicalPostCount) || physicalPostCount < 1) {
    throw new TypeError("The test fixture requires a positive whole physical-post count.");
  }
  const posts = BigInt(physicalPostCount);
  const concrete = posts * TEST_FIXTURE_CONCRETE_PER_POST_TEN_THOUSANDTHS;
  const gravel = posts * TEST_FIXTURE_GRAVEL_PER_POST_TEN_THOUSANDTHS;
  return Object.freeze({
    authority: "test_only",
    notice: "Calculation fixture only. These 36-inch foundation assumptions are not customer-authoritative and do not replace verified job code or an approved McKenzie foundation profile.",
    physicalPostCount,
    theoreticalConcreteCubicFeet: formatTenThousandths(concrete),
    theoreticalGravelCubicFeet: formatTenThousandths(gravel),
    concreteBagCount80Lb: safeNumber(ceilDivide(concrete, TEST_FIXTURE_CONCRETE_BAG_YIELD_TEN_THOUSANDTHS)),
    gravelBagCountHalfCubicFoot: safeNumber(ceilDivide(gravel, TEST_FIXTURE_GRAVEL_BAG_YIELD_TEN_THOUSANDTHS)),
    assumptions: Object.freeze([
      "10-inch-diameter cylindrical hole",
      "36-inch hole depth with 12 inches of gravel and 24 inches surrounded by concrete",
      "5-inch-square embedded post displacement deducted from concrete",
      "0.7436 cubic feet concrete and 0.5454 cubic feet gravel per ordinary post",
      "80-pound QUIKRETE Concrete Mix No. 1101 at 0.60 cubic feet per bag",
      "Sakrete 853183 gravel at 0.50 cubic feet per bag",
      "Job-level package rounding with no added waste percentage",
    ]),
  });
}
