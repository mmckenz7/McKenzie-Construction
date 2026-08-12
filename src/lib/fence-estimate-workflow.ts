export const FENCE_ESTIMATE_STEPS = Object.freeze([
  "draw_fence",
  "answer_questions",
  "verify_materials",
  "apply_lowes_prices",
  "review_estimate",
] as const);

export type FenceEstimateStepKey = typeof FENCE_ESTIMATE_STEPS[number];
export type FenceEstimateStepStatus = "not_started" | "waiting" | "manual_review";

export type FenceEstimateWorkflowInput = Readonly<{
  estimate: Readonly<{
    title: unknown;
    status: unknown;
    propertyAddress?: unknown;
  }>;
  editable: boolean;
  fenceDataState?: "ready" | "unsupported";
}>;

export type FenceEstimateWorkflowStep = Readonly<{
  key: FenceEstimateStepKey;
  label: string;
  status: FenceEstimateStepStatus;
  statusLabel: string;
  expanded: boolean;
  detail: string;
}>;

export type FenceEstimateWorkflowProjection = Readonly<{
  estimateTitle: string;
  estimateStatus: string;
  propertyAddress: string;
  propertyAddressKnown: boolean;
  currentStep: FenceEstimateStepKey;
  steps: readonly FenceEstimateWorkflowStep[];
}>;

function readableText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function statusLabel(value: unknown) {
  return readableText(value, "Status unavailable")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

const WAITING_DETAIL = "This step waits for the step above it. Nothing has been assumed or added.";

export function projectFenceEstimateWorkflow(
  input: FenceEstimateWorkflowInput,
): FenceEstimateWorkflowProjection {
  const unsupported = input.fenceDataState === "unsupported" || !input.editable;
  const firstStatus: FenceEstimateStepStatus = unsupported ? "manual_review" : "not_started";
  const firstDetail = input.fenceDataState === "unsupported"
    ? "This fence system is not supported by the guided workflow. Keep the estimate in manual review and follow the exact manufacturer installation guide."
    : !input.editable
      ? "This estimate is not editable, so the guided fence workflow cannot begin here. Review the fence scope manually."
      : "Create straight connected fence runs and type each measured length. This local draft does not save or change the estimate.";

  const definitions: ReadonlyArray<Readonly<{
    key: FenceEstimateStepKey;
    label: string;
    detail: string;
  }>> = [
    { key: "draw_fence", label: "Draw fence", detail: firstDetail },
    { key: "answer_questions", label: "Answer missing questions", detail: WAITING_DETAIL },
    { key: "verify_materials", label: "Verify materials", detail: WAITING_DETAIL },
    { key: "apply_lowes_prices", label: "Apply Lowe's prices", detail: WAITING_DETAIL },
    { key: "review_estimate", label: "Review estimate", detail: WAITING_DETAIL },
  ];

  const steps = definitions.map((definition, index) => Object.freeze({
    ...definition,
    status: index === 0 ? firstStatus : "waiting" as const,
    statusLabel: index === 0
      ? firstStatus === "manual_review" ? "Manual review" : "Ready to draw"
      : "Waiting",
    expanded: index === 0,
  }));

  return Object.freeze({
    estimateTitle: readableText(input.estimate.title, "Untitled estimate"),
    estimateStatus: statusLabel(input.estimate.status),
    propertyAddress: readableText(input.estimate.propertyAddress, "Address not added"),
    propertyAddressKnown: typeof input.estimate.propertyAddress === "string" && input.estimate.propertyAddress.trim().length > 0,
    currentStep: "draw_fence",
    steps: Object.freeze(steps),
  });
}
