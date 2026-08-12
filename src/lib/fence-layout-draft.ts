export const FENCE_DRAFT_MAX_RUNS = 50;
export const FENCE_DRAFT_MAX_RUN_LENGTH_INCHES = 12_000n;
export const FENCE_DRAFT_MAX_TOTAL_INCHES = 60_000n;
export const FENCE_LAYOUT_SCHEMA_VERSION = "fence-layout-v1";

export type FenceDraftRunInput = Readonly<{
  feet: string;
  inches: string;
}>;

export type FenceDraftRunProjection = Readonly<{
  number: number;
  feet: string;
  inches: string;
  lengthInches: string | null;
  error: string | null;
  fromLabel: string;
  toLabel: string;
}>;

export type FenceLayoutDraftProjection = Readonly<{
  status: "empty" | "invalid" | "ready" | "manual_review";
  statusLabel: string;
  runs: readonly FenceDraftRunProjection[];
  totalLengthInches: string | null;
  totalLengthLabel: string | null;
  issue: string | null;
}>;

export type PersistableFenceLayoutDraft = Readonly<{
  schemaVersion: typeof FENCE_LAYOUT_SCHEMA_VERSION;
  runLengthsInches: readonly number[];
  totalLengthInches: number;
  needsGate: boolean;
  contextAnswers?: import("@/lib/fence-context-questions").FenceContextAnswers;
}>;

export type StoredFenceLayoutDraft = PersistableFenceLayoutDraft & Readonly<{
  id: string;
  estimateId: string;
  revision: number;
  updatedAt: string;
}>;

const FEET_INPUT = /^\d{1,4}$/;
const INCHES_INPUT = /^\d{1,2}$/;

function formatFeetAndInches(totalInches: bigint) {
  const feet = totalInches / 12n;
  const inches = totalInches % 12n;
  return `${feet.toString()} ft ${inches.toString()} in`;
}

function projectRun(
  run: FenceDraftRunInput,
  index: number,
  runCount: number,
): FenceDraftRunProjection {
  const feetValid = FEET_INPUT.test(run.feet);
  const inchesValid = INCHES_INPUT.test(run.inches);
  let error: string | null = null;
  let length: bigint | null = null;

  if (!feetValid || !inchesValid) {
    error = "Enter whole numbers for feet and inches.";
  } else {
    const feet = BigInt(run.feet);
    const inches = BigInt(run.inches);
    length = feet * 12n + inches;
    if (inches > 11n) {
      error = "Inches must be from 0 through 11.";
    } else if (length === 0n) {
      error = "Run length must be greater than zero.";
    } else if (length > FENCE_DRAFT_MAX_RUN_LENGTH_INCHES) {
      error = "One run cannot exceed 1,000 ft.";
    }
  }

  return Object.freeze({
    number: index + 1,
    feet: run.feet,
    inches: run.inches,
    lengthInches: error === null && length !== null ? length.toString() : null,
    error,
    fromLabel: index === 0 ? "Start" : `Corner ${index}`,
    toLabel: index === runCount - 1 ? "End" : `Corner ${index + 1}`,
  });
}

export function projectFenceLayoutDraft(input: Readonly<{
  runs: readonly FenceDraftRunInput[];
  needsGate: boolean;
}>): FenceLayoutDraftProjection {
  if (input.runs.length === 0) {
    return Object.freeze({
      status: input.needsGate ? "manual_review" : "empty",
      statusLabel: input.needsGate ? "Manual review" : "Add a run",
      runs: Object.freeze([]),
      totalLengthInches: null,
      totalLengthLabel: null,
      issue: input.needsGate
        ? "Gate assemblies are not approved for this guided workflow yet."
        : "Add at least one straight fence run.",
    });
  }

  if (input.runs.length > FENCE_DRAFT_MAX_RUNS) {
    return Object.freeze({
      status: "manual_review",
      statusLabel: "Manual review",
      runs: Object.freeze(input.runs.map((run, index) =>
        projectRun(run, index, input.runs.length))),
      totalLengthInches: null,
      totalLengthLabel: null,
      issue: `This guided draft supports at most ${FENCE_DRAFT_MAX_RUNS} connected runs.`,
    });
  }

  const runs = Object.freeze(input.runs.map((run, index) =>
    projectRun(run, index, input.runs.length)));
  const hasInvalidRun = runs.some((run) => run.error !== null);
  const total = hasInvalidRun
    ? null
    : runs.reduce((sum, run) => sum + BigInt(run.lengthInches as string), 0n);

  if (input.needsGate) {
    return Object.freeze({
      status: "manual_review",
      statusLabel: "Manual review",
      runs,
      totalLengthInches: null,
      totalLengthLabel: null,
      issue: "Gate assemblies are not approved for this guided workflow yet. No gate opening or quantity has been created.",
    });
  }

  if (hasInvalidRun) {
    return Object.freeze({
      status: "invalid",
      statusLabel: "Check lengths",
      runs,
      totalLengthInches: null,
      totalLengthLabel: null,
      issue: "Correct every run before the fence length is ready.",
    });
  }

  if (total === null || total > FENCE_DRAFT_MAX_TOTAL_INCHES) {
    return Object.freeze({
      status: "manual_review",
      statusLabel: "Manual review",
      runs,
      totalLengthInches: null,
      totalLengthLabel: null,
      issue: "This guided draft cannot exceed 5,000 ft total.",
    });
  }

  return Object.freeze({
    status: "ready",
    statusLabel: "Length ready",
    runs,
    totalLengthInches: total.toString(),
    totalLengthLabel: formatFeetAndInches(total),
    issue: null,
  });
}

export function buildPersistableFenceLayoutDraft(input: Readonly<{
  runs: readonly FenceDraftRunInput[];
  needsGate: boolean;
  contextAnswers?: import("@/lib/fence-context-questions").FenceContextAnswers;
}>): PersistableFenceLayoutDraft {
  if (input.runs.length < 1 || input.runs.length > FENCE_DRAFT_MAX_RUNS) {
    throw new TypeError(`A saved Fence draft requires 1 through ${FENCE_DRAFT_MAX_RUNS} runs.`);
  }
  const projectedRuns = input.runs.map((run, index) =>
    projectRun(run, index, input.runs.length));
  const invalid = projectedRuns.find((run) => run.error !== null || run.lengthInches === null);
  if (invalid) throw new TypeError(invalid.error ?? "Every run requires an exact length.");
  const lengths = projectedRuns.map((run) => Number(run.lengthInches));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!Number.isSafeInteger(total) || BigInt(total) > FENCE_DRAFT_MAX_TOTAL_INCHES) {
    throw new TypeError("A saved Fence draft cannot exceed 5,000 ft total.");
  }
  return Object.freeze({
    schemaVersion: FENCE_LAYOUT_SCHEMA_VERSION,
    runLengthsInches: Object.freeze(lengths),
    totalLengthInches: total,
    needsGate: input.needsGate,
    contextAnswers: Object.freeze({ ...(input.contextAnswers ?? {}) }),
  });
}

export function storedFenceRunInputs(
  runLengthsInches: readonly number[],
): readonly FenceDraftRunInput[] {
  return Object.freeze(runLengthsInches.map((length) => {
    if (!Number.isSafeInteger(length) || length < 1 || BigInt(length) > FENCE_DRAFT_MAX_RUN_LENGTH_INCHES) {
      throw new TypeError("The saved Fence draft contains an invalid run length.");
    }
    return Object.freeze({
      feet: String(Math.floor(length / 12)),
      inches: String(length % 12),
    });
  }));
}
