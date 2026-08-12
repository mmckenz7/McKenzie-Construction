import { NextRequest, NextResponse } from "next/server";

import { getMaterialCatalogMutationAuthorizationDecision } from "@/lib/material-catalog-access";
import type { CatalogCapability } from "@/lib/material-catalog-access-policy";
import {
  approveLowesEastKnoxvillePilot,
  LowesPilotWorkflowError,
  previewLowesEastKnoxvillePilot,
  publishLowesEastKnoxvillePilot,
  reviewLowesEastKnoxvillePilot,
  stageLowesEastKnoxvillePilot,
} from "@/lib/material-catalog-lowes-pilot-service";

type PilotAction = "stage" | "review" | "preview" | "approve" | "publish";

const actionCapabilities: Record<
  PilotAction,
  Exclude<CatalogCapability, "search_products" | "view_supplier_comparisons">
> = {
  stage: "upload_supplier_imports",
  review: "review_product_mappings",
  preview: "preview_price_changes",
  approve: "publish_supplier_prices",
  publish: "publish_supplier_prices",
};

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function response(body: unknown, status = 200) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store");
  return result;
}

export async function POST(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  if ((fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") ||
    (origin && origin !== new URL(request.url).origin)) {
    return response({ success: false, error: "Same-origin request required." }, 403);
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return response({ success: false, error: "JSON is required." }, 415);
  }

  let body: Record<string, unknown>;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 2_048) {
      return response({ success: false, error: "Request body is too large." }, 413);
    }
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return response({ success: false, error: "Invalid JSON." }, 400);
  }
  const action = body.action;
  if (typeof action !== "string" || !(action in actionCapabilities)) {
    return response({ success: false, error: "Unknown pilot action." }, 400);
  }

  const capability = actionCapabilities[action as PilotAction];
  const decision = await getMaterialCatalogMutationAuthorizationDecision(capability);
  if (decision.state !== "authorized") {
    const status = decision.state === "unauthorized" ? 401
      : decision.state === "feature_unavailable" || decision.state === "access_unavailable" ? 500
      : decision.state === "tenant_scope_unavailable" ? 503
      : 403;
    return response({ success: false, error: "Catalog pilot access was denied." }, status);
  }

  try {
    let result: unknown;
    if (action === "stage") {
      result = await stageLowesEastKnoxvillePilot(decision.authorization);
    } else {
      if (!isUuid(body.importId)) {
        return response({ success: false, error: "A valid import ID is required." }, 400);
      }
      if (action === "review") {
        result = await reviewLowesEastKnoxvillePilot(decision.authorization, body.importId);
      } else if (action === "preview") {
        result = await previewLowesEastKnoxvillePilot(decision.authorization, body.importId);
      } else {
        if (!isUuid(body.previewId)) {
          return response({ success: false, error: "A valid preview ID is required." }, 400);
        }
        if (action === "approve") {
          result = await approveLowesEastKnoxvillePilot(
            decision.authorization,
            body.importId,
            body.previewId,
          );
        } else {
          if (typeof body.previewSha256 !== "string" ||
            !/^[0-9a-f]{64}$/.test(body.previewSha256)) {
            return response({ success: false, error: "A valid preview hash is required." }, 400);
          }
          result = await publishLowesEastKnoxvillePilot(
            decision.authorization,
            body.importId,
            body.previewId,
            body.previewSha256,
          );
        }
      }
    }
    return response({ success: true, result });
  } catch (error) {
    if (error instanceof LowesPilotWorkflowError) {
      return response({ success: false, error: error.message }, 409);
    }
    return response({ success: false, error: "Catalog pilot operation failed." }, 500);
  }
}
