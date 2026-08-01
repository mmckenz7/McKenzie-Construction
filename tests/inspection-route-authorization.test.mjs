import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

const routeFiles = [
  "src/app/api/projects/[projectId]/inspection-requirements/route.ts",
  "src/app/api/projects/[projectId]/inspection-settings/route.ts",
  "src/app/api/projects/[projectId]/inspections/[inspectionId]/results/[resultId]/confirm/route.ts",
  "src/app/api/projects/[projectId]/inspections/[inspectionId]/results/route.ts",
  "src/app/api/projects/[projectId]/inspections/checklist/reopen/route.ts",
  "src/app/api/projects/[projectId]/inspections/corrections/[correctionId]/reinspection/route.ts",
  "src/app/api/projects/[projectId]/inspections/corrections/[correctionId]/route.ts",
  "src/app/api/projects/[projectId]/inspections/corrections/route.ts",
  "src/app/api/projects/[projectId]/inspections/dependencies/route.ts",
  "src/app/api/projects/[projectId]/inspections/research/[researchRunId]/route.ts",
  "src/app/api/projects/[projectId]/inspections/research/route.ts",
  "src/app/api/projects/[projectId]/inspections/route.ts",
  "src/app/api/projects/[projectId]/inspections/workflow/route.ts",
];

test("every inspection API handler invokes project authorization", () => {
  for (const routeFile of routeFiles) {
    const source = readFileSync(
      routeFile,
      "utf8",
    );

    const handlerCount =
      source.match(
        /export async function /g,
      )?.length ?? 0;

    const guardCount =
      source.match(
        /await authorizeInspectionProjectRequest\(/g,
      )?.length ?? 0;

    assert.equal(
      guardCount,
      handlerCount,
      `${routeFile} must guard every handler`,
    );
  }
});
