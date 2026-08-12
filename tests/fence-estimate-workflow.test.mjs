import assert from "node:assert/strict";
import test from "node:test";

const {
  FENCE_ESTIMATE_STEPS,
  projectFenceEstimateWorkflow,
} = await import("../src/lib/fence-estimate-workflow.ts");

test("the read-only fence projection is ordered and expands exactly one current step", () => {
  const result = projectFenceEstimateWorkflow({
    estimate: { title: "Back yard fence", status: "draft", propertyAddress: "12 Oak St" },
    editable: true,
    fenceDataState: "ready",
  });

  assert.deepEqual(result.steps.map((step) => step.key), FENCE_ESTIMATE_STEPS);
  assert.equal(result.steps.filter((step) => step.expanded).length, 1);
  assert.equal(result.currentStep, "draw_fence");
  assert.equal(result.steps[0].status, "not_started");
  assert.deepEqual(result.steps.slice(1).map((step) => step.status), ["waiting", "waiting", "waiting", "waiting"]);
  assert.deepEqual(
    [result.estimateTitle, result.estimateStatus, result.propertyAddress],
    ["Back yard fence", "Draft", "12 Oak St"],
  );
  assert.equal(result.propertyAddressKnown, true);
});

test("missing estimate context uses honest labels without inventing fence data", () => {
  const result = projectFenceEstimateWorkflow({
    estimate: { title: null, status: null, propertyAddress: "  " },
    editable: true,
  });

  assert.equal(result.estimateTitle, "Untitled estimate");
  assert.equal(result.estimateStatus, "Status Unavailable");
  assert.equal(result.propertyAddress, "Address not added");
  assert.equal(result.propertyAddressKnown, false);
  assert.match(result.steps[0].detail, /straight connected fence runs/i);
  assert.match(result.steps[0].detail, /does not save/i);
});

test("unsupported and non-editable estimates stop at manual review", () => {
  const unsupported = projectFenceEstimateWorkflow({
    estimate: { title: "Fence", status: "draft", propertyAddress: null },
    editable: true,
    fenceDataState: "unsupported",
  });
  assert.equal(unsupported.steps[0].status, "manual_review");
  assert.match(unsupported.steps[0].detail, /manufacturer installation guide/i);

  const locked = projectFenceEstimateWorkflow({
    estimate: { title: "Fence", status: "sent", propertyAddress: null },
    editable: false,
  });
  assert.equal(locked.steps[0].status, "manual_review");
  assert.match(locked.steps[0].detail, /not editable/i);
});
