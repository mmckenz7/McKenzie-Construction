import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260801010000_inspection_rpc_authorization_hardening.sql",
  "utf8",
);

const businessRpcs = [
  "activate_project_inspection_workflow",
  "apply_project_inspection_research",
  "complete_project_inspection_document_extraction",
  "confirm_project_inspection_result",
  "create_project_inspection_correction",
  "create_project_inspection_document",
  "create_project_inspection_reinspection",
  "create_project_inspection_research_run",
  "fail_project_inspection_document_extraction",
  "get_project_inspection_correction_summary",
  "get_project_inspection_dependencies",
  "get_project_inspection_summary",
  "is_project_task_blocked_by_inspection",
  "record_project_inspection_result",
  "refresh_project_inspection_dependencies",
  "remove_project_inspection_task_dependency",
  "reopen_project_inspection_checklist",
  "review_project_inspection_document_finding",
  "review_project_inspection_research_finding",
  "set_project_inspection_task_dependency",
  "start_project_inspection_document_extraction",
  "update_project_inspection_correction",
  "verify_project_inspection_checklist",
];

test("every inspection business RPC revokes public API execution", () => {
  for (const rpc of businessRpcs) {
    const revokePattern = new RegExp(
      `revoke all on function public\\.${rpc}\\([^;]+?\\)\\s+from public, anon, authenticated;`,
      "s",
    );

    assert.match(
      migration,
      revokePattern,
      `${rpc} must revoke PUBLIC, anon, and authenticated`,
    );
  }
});

test("every inspection business RPC grants service-role execution", () => {
  for (const rpc of businessRpcs) {
    const grantPattern = new RegExp(
      `grant execute on function public\\.${rpc}\\([^;]+?\\)\\s+to service_role;`,
      "s",
    );

    assert.match(
      migration,
      grantPattern,
      `${rpc} must grant service_role`,
    );
  }
});

test("inspection routes do not use direct authenticated RPC execution", () => {
  const routeAuthorizationTest =
    readFileSync(
      "tests/inspection-route-authorization.test.mjs",
      "utf8",
    );

  const routeFiles = [
    ...routeAuthorizationTest.matchAll(
      /"(src\/app\/api\/projects\/\[projectId\]\/inspection[^\"]+\/route\.ts)"/g,
    ),
  ].map((match) => match[1]);

  assert.ok(routeFiles.length > 0);

  for (const routeFile of routeFiles) {
    const source = readFileSync(
      routeFile,
      "utf8",
    );

    assert.equal(
      source.includes(
        "createAuthenticatedServerClient",
      ),
      false,
      `${routeFile} must not execute inspection RPCs as authenticated`,
    );

    if (source.includes(".rpc(")) {
      assert.equal(
        source.includes(
          "createAdminServerClient",
        ),
        true,
        `${routeFile} RPC calls must retain a service-role path`,
      );
    }
  }
});
