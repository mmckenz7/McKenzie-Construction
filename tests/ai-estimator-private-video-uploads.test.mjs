import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AI_ESTIMATOR_MAX_VIDEO_BYTES,
  aiEstimatorAssetPath,
  parseVideoUploadInput,
} from "../src/lib/ai-estimator/asset-core.ts";

const session = readFileSync(
  "src/app/api/ai-estimator/cases/[caseId]/assets/upload-session/route.ts",
  "utf8",
);
const completion = readFileSync(
  "src/app/api/ai-estimator/cases/[caseId]/assets/[assetId]/complete/route.ts",
  "utf8",
);
const core = readFileSync("src/lib/ai-estimator/asset-core.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260810130000_ai_estimator_private_video_uploads.sql",
  "utf8",
);

test("V0 upload input is exact, bounded, and video-only", () => {
  const valid = {
    originalFilename: "jobsite.mov",
    mimeType: "video/quicktime",
    byteSize: AI_ESTIMATOR_MAX_VIDEO_BYTES,
    sha256: "a".repeat(64),
  };
  assert.deepEqual(parseVideoUploadInput(valid), valid);
  assert.throws(() => parseVideoUploadInput({ ...valid, price: "100" }), /unsupported fields/);
  assert.throws(() => parseVideoUploadInput({ ...valid, byteSize: AI_ESTIMATOR_MAX_VIDEO_BYTES + 1 }), /50 MB/);
  assert.throws(() => parseVideoUploadInput({ ...valid, mimeType: "application/pdf" }), /video type/);
  assert.throws(() => parseVideoUploadInput({ ...valid, sha256: "A".repeat(64) }), /lowercase/);
});

test("storage paths are generated from tenant, case, asset, and a sanitized leaf", () => {
  assert.equal(
    aiEstimatorAssetPath("company", "case", "asset", "../../Job Site (1).mov"),
    "company/case/asset/..-..-Job-Site-1-.mov",
  );
  assert.match(core, /storageObjectFilename/);
  assert.doesNotMatch(session, /getPublicUrl|publicUrl/);
});

test("upload sessions require authorized intake cases and use non-upsert signed URLs", () => {
  assert.match(session, /authorizeAiEstimatorRequest\(request\)/);
  assert.match(session, /\.eq\("id", caseId\)[\s\S]*?\.eq\("company_id", companyId\)/);
  assert.match(session, /status !== "intake"/);
  assert.match(session, /createSignedUploadUrl\(storagePath, \{ upsert: false \}\)/);
  assert.match(session, /inserted\.error\?\.code === "23505"/);
  assert.match(session, /declared_byte_size: input\.byteSize/);
  assert.match(session, /declared_sha256: input\.sha256/);
  assert.match(session, /"Cache-Control": "no-store"/);
});

test("completion verifies Storage metadata but does not claim deep validation", () => {
  assert.match(completion, /\.info\(asset\.storage_path\)/);
  assert.match(completion, /actualSize === expectedSize/);
  assert.match(completion, /actualMimeType === expectedMimeType/);
  assert.match(completion, /status: "failed_validation"/);
  assert.match(completion, /removed\.error[\s\S]*?status: "deletion_pending"/);
  assert.match(completion, /status: "quarantined"/);
  assert.match(completion, /requiresContentValidation: true/);
  assert.doesNotMatch(completion, /status: "available"|sha256:/);
  assert.doesNotMatch(completion, /from\("estimates"\)|from\("projects"\)|lead_status|proposal|contract/);
});

test("the private bucket enforces free-tier size and MIME constraints", () => {
  assert.match(migration, /'ai-estimator-private',[\s\S]*?false,[\s\S]*?52428800/);
  for (const mime of ["video/mp4", "video/quicktime", "video/webm"]) {
    assert.match(migration, new RegExp(`'${mime}'`));
  }
  assert.match(migration, /ai_estimator_one_active_v0_video_per_case_uidx/);
  assert.doesNotMatch(migration, /\bgrant\b|\bpolicy\b|public\s*=\s*true/i);
});

test("declared metadata remains distinct from verified object metadata", () => {
  assert.match(migration, /declared_byte_size bigint/);
  assert.match(migration, /declared_sha256 text/);
  assert.match(migration, /ai_estimator_assets_user_upload_declaration_check/);
  assert.match(migration, /origin <> 'user_upload'/);
  assert.match(migration, /Storage Content-Type metadata only/);
  assert.match(migration, /sha256 remains null until an isolated worker hashes/);
});
