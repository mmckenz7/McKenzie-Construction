import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessInspectionProject,
  INSPECTION_PROJECT_FORBIDDEN_BODY,
  taskBelongsToProject,
} from "../src/lib/inspection-task-dependencies.ts";

test("project authorization denial is safe and non-enumerating", () => {
  assert.deepEqual(
    INSPECTION_PROJECT_FORBIDDEN_BODY,
    {
      success: false,
      error:
        "You do not have access to this project.",
    },
  );

  const serialized = JSON.stringify(
    INSPECTION_PROJECT_FORBIDDEN_BODY,
  );

  for (const forbiddenValue of [
    "projectId",
    "inspectionId",
    "taskId",
    "correctionId",
  ]) {
    assert.equal(
      serialized.includes(
        forbiddenValue,
      ),
      false,
    );
  }
});

test("owners and administrators can access any existing project", () => {
  for (const role of [
    "owner",
    "admin",
    "administrator",
  ]) {
    assert.equal(
      canAccessInspectionProject(
        {
          teamMemberId:
            "other-team-member",
          roles: [role],
        },
        {
          project_manager_id:
            "project-manager",
        },
      ),
      true,
    );
  }
});

test("the assigned project manager can access the project", () => {
  assert.equal(
    canAccessInspectionProject(
      {
        teamMemberId:
          "project-manager",
        roles: ["project_manager"],
      },
      {
        project_manager_id:
          "project-manager",
      },
    ),
    true,
  );
});

test("unassigned employees and missing projects are denied identically", () => {
  const access = {
    teamMemberId: "employee",
    roles: ["project_manager"],
  };

  assert.equal(
    canAccessInspectionProject(
      access,
      {
        project_manager_id:
          "different-manager",
      },
    ),
    false,
  );

  assert.equal(
    canAccessInspectionProject(
      access,
      null,
    ),
    false,
  );
});

test("accepts a task belonging to the dependency project", () => {
  assert.equal(
    taskBelongsToProject(
      {
        id: "task-id",
        project_id: "project-id",
      },
      "project-id",
    ),
    true,
  );
});

test("rejects a task belonging to another project", () => {
  assert.equal(
    taskBelongsToProject(
      {
        id: "task-id",
        project_id: "other-project-id",
      },
      "project-id",
    ),
    false,
  );
});

test("rejects missing and company-wide tasks", () => {
  assert.equal(
    taskBelongsToProject(
      null,
      "project-id",
    ),
    false,
  );

  assert.equal(
    taskBelongsToProject(
      {
        id: "task-id",
        project_id: null,
      },
      "project-id",
    ),
    false,
  );
});
