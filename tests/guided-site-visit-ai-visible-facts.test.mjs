import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const read = (path) => fs.readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260813100000_guided_site_visit_ai_visible_facts.sql",
);
const provider = read("src/lib/guided-site-visits/ai-visible-facts.ts");
const route = read(
  "src/app/api/guided-site-visits/[visitId]/photos/[photoId]/visible-fact-reviews/route.ts",
);
const decision = read(
  "src/app/api/guided-site-visits/[visitId]/photos/[photoId]/visible-fact-reviews/[reviewId]/decision/route.ts",
);
const ui = read("src/components/estimates/guided-deck-site-visit.tsx");

function loadValidator() {
  const source = provider
    .replace('import "server-only";', "")
    .replace(
      'import {createHash} from "node:crypto";',
      'const createHash=()=>({update(){return this},digest(){return "0".repeat(64)}});',
    )
    .replace(
      /import \{NEXT_CAPTURE_ACTIONS,VISIBLE_FACT_STATUSES,type NextCaptureAction,type VisibleFactResult\} from "\.\/visible-fact-criteria";/,
      'const NEXT_CAPTURE_ACTIONS=["move_closer","step_back","change_angle","add_light","remove_obstruction","show_other_end"];const VISIBLE_FACT_STATUSES=["visible","not_visible","unclear"];',
    );
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  new Function(
    "module",
    "exports",
    "require",
    "process",
    "Buffer",
    "AbortSignal",
    js,
  )(module, module.exports, require, process, Buffer, AbortSignal);
  return module.exports.validateVisibleFactResult;
}

test("visible-fact validator requires the exact declared checklist", () => {
  const validate = loadValidator();
  const keys = ["post_bases", "footing_or_ground_entry"];
  assert.deepEqual(
    validate(
      {
        criteria: keys.map((criterionKey) => ({
          criterionKey,
          status: "visible",
        })),
        recommendedNextCapture: null,
      },
      keys,
    ).criteria.length,
    2,
  );
  assert.throws(() =>
    validate(
      {
        criteria: [{ criterionKey: "post_bases", status: "visible" }],
        recommendedNextCapture: null,
      },
      keys,
    ),
  );
  assert.throws(() =>
    validate(
      {
        criteria: [
          { criterionKey: "post_bases", status: "visible" },
          { criterionKey: "post_bases", status: "visible" },
        ],
        recommendedNextCapture: null,
      },
      keys,
    ),
  );
  assert.throws(() =>
    validate(
      {
        criteria: [
          { criterionKey: "invented_claim", status: "visible" },
          { criterionKey: "footing_or_ground_entry", status: "visible" },
        ],
        recommendedNextCapture: null,
      },
      keys,
    ),
  );
});

test("recommendations target an unresolved declared criterion", () => {
  const validate = loadValidator();
  const keys = ["post_bases", "footing_or_ground_entry"];
  assert.equal(
    validate(
      {
        criteria: [
          { criterionKey: "post_bases", status: "visible" },
          { criterionKey: "footing_or_ground_entry", status: "unclear" },
        ],
        recommendedNextCapture: {
          criterionKey: "footing_or_ground_entry",
          actionCode: "move_closer",
        },
      },
      keys,
    ).recommendedNextCapture.actionCode,
    "move_closer",
  );
  assert.throws(() =>
    validate(
      {
        criteria: keys.map((criterionKey) => ({
          criterionKey,
          status: "visible",
        })),
        recommendedNextCapture: {
          criterionKey: "post_bases",
          actionCode: "move_closer",
        },
      },
      keys,
    ),
  );
});

test("trusted endpoint owns criteria, private image, and model output", () => {
  assert.match(route, /GUIDED_VISIBLE_FACT_CRITERIA/);
  assert.match(route, /ai-estimator-private/);
  assert.match(route, /runOpenAiVisibleFactReview/);
  assert.match(route, /record_guided_site_visit_ai_visible_fact_review/);
  assert.doesNotMatch(route, /body\.(criteria|model|prompt|result)/);
});

test("AI proposals and human decisions are append-only and tenant-linked", () => {
  assert.match(
    migration,
    /before update or delete on public\.guided_site_visit_ai_visible_fact_reviews/,
  );
  assert.match(
    migration,
    /before update or delete on public\.guided_site_visit_visible_fact_decisions/,
  );
  assert.match(
    migration,
    /visible_fact_review_id,photo_attempt_id,asset_id,visit_item_id,visit_id,company_id/,
  );
  assert.match(
    migration,
    /guided_site_visit_actor_company\(requested_auth_user_id\)/,
  );
  assert.match(migration, /guided_visible_fact_keys_match/);
});

test("exact idempotency and atomic human confirmation are enforced", () => {
  assert.match(migration, /existing\.request_sha256=requested_request_sha256/);
  assert.match(migration, /existing\.final_criteria=requested_final_criteria/);
  assert.match(migration, /resulting_visit_revision/);
  assert.match(migration, /state='pending'/);
  assert.match(migration, /requested_next_action='retake_photo'/);
  assert.match(decision, /requested_next_action:nextAction/);
});

test("phone UI is sequential and keeps measurements human-only", () => {
  assert.match(ui, /Check what the photo shows/);
  assert.match(ui, /Correct results/);
  assert.match(ui, /Save this photo checklist/);
  assert.match(ui, /ManualConfirmation/);
  assert.doesNotMatch(provider, /measurements\s*:/);
  assert.match(provider, /Do not infer measurements/);
});
