import { NextRequest, NextResponse } from "next/server";

import { authorizeAiEstimatorRequest, loadSingletonCompanyId } from "@/lib/ai-estimator/case-access";
import {
  AI_ESTIMATOR_CASE_SELECT,
  AI_ESTIMATOR_RETENTION_POLICY_VERSION,
  parseAiEstimatorCaseCreateInput,
  projectAiEstimatorCase,
} from "@/lib/ai-estimator/case-core";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const auth = await authorizeAiEstimatorRequest(request);
  if (auth.response) return auth.response;

  try {
    const input = parseAiEstimatorCaseCreateInput(await request.json());
    const supabase = createAdminServerClient();
    const companyId = await loadSingletonCompanyId();
    const lead = await supabase
      .from("leads")
      .select("id")
      .eq("id", input.leadId)
      .maybeSingle();

    if (lead.error) {
      throw new Error("The lead could not be verified.");
    }
    if (!lead.data) {
      return json({ success: false, error: "Lead not found." }, 404);
    }

    const acknowledgedAt = new Date().toISOString();
    const inserted = await supabase
      .from("ai_estimator_cases")
      .insert({
        company_id: companyId,
        lead_id: input.leadId,
        title: input.title,
        retention_policy_version: AI_ESTIMATOR_RETENTION_POLICY_VERSION,
        recording_permission_acknowledged_at: acknowledgedAt,
        recording_permission_acknowledged_by_auth_user_id:
          auth.authorization!.authUserId,
        created_by_auth_user_id: auth.authorization!.authUserId,
      } as never)
      .select(AI_ESTIMATOR_CASE_SELECT)
      .single();

    if (inserted.error || !inserted.data) {
      throw new Error("AI Estimator case creation failed.");
    }

    return json(
      {
        success: true,
        case: projectAiEstimatorCase(inserted.data as unknown as Record<string, unknown>),
      },
      201,
    );
  } catch (error) {
    const isInputError = error instanceof TypeError || error instanceof SyntaxError;
    return json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "AI Estimator case creation failed.",
      },
      isInputError ? 400 : 500,
    );
  }
}
