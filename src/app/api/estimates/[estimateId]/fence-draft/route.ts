import { NextRequest, NextResponse } from "next/server";

import { authorizeEstimateRequest, ESTIMATE_NOT_FOUND_BODY } from "@/lib/estimate-access";
import { FENCE_LAYOUT_SCHEMA_VERSION } from "@/lib/fence-layout-draft";
import { FENCE_CONTEXT_SCHEMA_VERSION } from "@/lib/fence-context-questions";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUT_FIELDS = new Set(["expectedRevision", "schemaVersion", "runLengthsInches", "needsGate", "contextSchemaVersion", "contextAnswers"]);
const CONTEXT_FIELDS = new Set(["system", "measurementBasis", "terrain", "corners", "frostDepthInches", "conditions"]);
type RouteContext = { params: Promise<{ estimateId: string }> };

function firstRpcRow(value: unknown) {
  if (Array.isArray(value)) return value[0] as Record<string, unknown> | undefined;
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function resultFailure(code: unknown) {
  if (code === "not_found") return NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 });
  if (code === "forbidden") return NextResponse.json({ success: false, error: "Sales estimate access is required.", code }, { status: 403 });
  if (code === "non_draft") return NextResponse.json({ success: false, error: "Only draft estimates can store a Fence layout.", code }, { status: 409 });
  if (code === "stale_fence_revision") return NextResponse.json({ success: false, error: "This Fence draft was saved somewhere else. Reload the saved draft before trying again.", code }, { status: 409 });
  if (code === "invalid_draft") return NextResponse.json({ success: false, error: "The Fence draft contains invalid run lengths.", code }, { status: 400 });
  if (code === "invalid_context") return NextResponse.json({ success: false, error: "The Fence job answers are invalid or out of order.", code }, { status: 400 });
  return NextResponse.json({ success: false, error: "The Fence draft could not be saved." }, { status: 500 });
}

function parseContextAnswers(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("contextAnswers must be an object.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !CONTEXT_FIELDS.has(key))) throw new TypeError("contextAnswers contains an unsupported field.");
  const oneOf = (field: string, values: readonly string[]) => {
    const answer = record[field];
    if (answer === undefined) return null;
    if (typeof answer !== "string" || !values.includes(answer)) throw new TypeError(`${field} is invalid.`);
    return answer;
  };
  const frost = record.frostDepthInches;
  if (frost !== undefined && (!Number.isSafeInteger(frost) || (frost as number) < 1 || (frost as number) > 9999)) {
    throw new TypeError("frostDepthInches must be a whole number from 1 through 9999.");
  }
  return {
    system: oneOf("system", ["emblem_6x8_white", "different_or_unsure"]),
    measurementBasis: oneOf("measurementBasis", ["post_centers", "different_or_unsure"]),
    terrain: oneOf("terrain", ["level", "sloped_or_unsure"]),
    corners: oneOf("corners", ["exact_90", "different_or_unsure"]),
    frostDepthInches: frost === undefined ? null : frost as number,
    conditions: oneOf("conditions", ["none", "single_gate_4ft", "single_gate_5ft", "pool", "other_unsupported"]),
  };
}

async function authorizedContext(request: NextRequest, context: RouteContext) {
  const { estimateId } = await context.params;
  if (!UUID.test(estimateId)) {
    return { estimateId, auth: null, response: NextResponse.json({ success: false, error: "Invalid estimate ID." }, { status: 400 }) };
  }
  const auth = await authorizeEstimateRequest(request, estimateId);
  return { estimateId, auth, response: auth.response };
}

async function loadDraft(authUserId: string, estimateId: string) {
  const supabase = createAdminServerClient();
  const result = await supabase.rpc("get_fence_estimate_draft", {
    requested_auth_user_id: authUserId,
    requested_estimate_id: estimateId,
  });
  if (result.error) throw new Error(result.error.message);
  const row = firstRpcRow(result.data);
  return { code: row?.result_code, draft: row?.draft ?? null };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const prepared = await authorizedContext(request, context);
  if (prepared.response) return prepared.response;
  if (!prepared.auth?.authorization) {
    return NextResponse.json({ success: false, error: "Fence draft access could not be verified." }, { status: 500 });
  }
  try {
    const loaded = await loadDraft(prepared.auth.authorization.authUserId, prepared.estimateId);
    if (loaded.code !== "ok") return resultFailure(loaded.code);
    return NextResponse.json({ success: true, draft: loaded.draft }, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Fence draft access could not be verified." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const prepared = await authorizedContext(request, context);
  if (prepared.response) return prepared.response;
  if (!prepared.auth?.authorization) {
    return NextResponse.json({ success: false, error: "Fence draft access could not be verified." }, { status: 500 });
  }
  if (!prepared.auth.authorization.canEditPrices) {
    return NextResponse.json({ success: false, error: "You do not have permission to edit this estimate." }, { status: 403 });
  }
  try {
    const body = await request.json() as Record<string, unknown>;
    if (Object.keys(body).some((field) => !PUT_FIELDS.has(field)) || Object.keys(body).length !== PUT_FIELDS.size) {
      throw new TypeError("The request contains unsupported or missing fields.");
    }
    if (!Number.isSafeInteger(body.expectedRevision) || (body.expectedRevision as number) < 0) {
      throw new TypeError("expectedRevision must be a nonnegative whole number.");
    }
    if (body.schemaVersion !== FENCE_LAYOUT_SCHEMA_VERSION) throw new TypeError("Unsupported Fence layout schema version.");
    if (body.contextSchemaVersion !== FENCE_CONTEXT_SCHEMA_VERSION) throw new TypeError("Unsupported Fence context schema version.");
    if (typeof body.needsGate !== "boolean" || !Array.isArray(body.runLengthsInches)
      || body.runLengthsInches.some((value) => !Number.isSafeInteger(value))) {
      throw new TypeError("Fence run lengths must be exact whole inches.");
    }
    const contextAnswers = parseContextAnswers(body.contextAnswers);

    const supabase = createAdminServerClient();
    const result = await supabase.rpc("save_fence_estimate_draft", {
      requested_auth_user_id: prepared.auth.authorization.authUserId,
      requested_estimate_id: prepared.estimateId,
      requested_expected_revision: body.expectedRevision,
      requested_schema_version: body.schemaVersion,
      requested_run_lengths_inches: body.runLengthsInches,
      requested_needs_gate: body.needsGate,
      requested_context_schema_version: body.contextSchemaVersion,
      requested_context_system: contextAnswers.system,
      requested_context_measurement_basis: contextAnswers.measurementBasis,
      requested_context_terrain: contextAnswers.terrain,
      requested_context_corners: contextAnswers.corners,
      requested_context_frost_depth_inches: contextAnswers.frostDepthInches,
      requested_context_conditions: contextAnswers.conditions,
    });
    if (result.error) throw new Error(result.error.message);
    const outcome = firstRpcRow(result.data);
    if (outcome?.result_code !== "ok") return resultFailure(outcome?.result_code);

    const loaded = await loadDraft(prepared.auth.authorization.authUserId, prepared.estimateId);
    if (loaded.code !== "ok" || !loaded.draft) {
      return NextResponse.json({ success: false, error: "The Fence draft was saved, but its confirmed state could not be loaded." }, { status: 500 });
    }
    return NextResponse.json({ success: true, draft: loaded.draft });
  } catch (error) {
    const status = error instanceof TypeError || error instanceof SyntaxError ? 400 : 500;
    return NextResponse.json({ success: false, error: status === 400 && error instanceof Error ? error.message : "The Fence draft could not be saved." }, { status });
  }
}
