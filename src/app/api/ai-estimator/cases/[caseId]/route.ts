import { NextRequest, NextResponse } from "next/server";

import { authorizeAiEstimatorRequest, loadSingletonCompanyId } from "@/lib/ai-estimator/case-access";
import {
  AI_ESTIMATOR_CASE_SELECT,
  isUuid,
  projectAiEstimatorCase,
} from "@/lib/ai-estimator/case-core";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  const auth = await authorizeAiEstimatorRequest(request);
  if (auth.response) return auth.response;

  const { caseId } = await context.params;
  if (!isUuid(caseId)) {
    return json({ success: false, error: "caseId must be a UUID." }, 400);
  }

  try {
    const companyId = await loadSingletonCompanyId();
    const result = await createAdminServerClient()
      .from("ai_estimator_cases")
      .select(AI_ESTIMATOR_CASE_SELECT)
      .eq("id", caseId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (result.error) {
      throw new Error("AI Estimator case access could not be verified.");
    }
    if (!result.data) {
      return json({ success: false, error: "AI Estimator case not found." }, 404);
    }

    return json({
      success: true,
      case: projectAiEstimatorCase(result.data as unknown as Record<string, unknown>),
    });
  } catch (error) {
    return json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "AI Estimator case could not be loaded.",
      },
      500,
    );
  }
}
