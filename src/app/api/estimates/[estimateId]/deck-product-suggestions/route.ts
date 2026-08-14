import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { findDeckLowesDefaults, DeckLowesSuggestionError } from "@/lib/deck-lowes-product-suggestions";
import { deckFieldDimensions, deckRailingGeometry, type DeckObservationItem } from "@/lib/deck-takeoff-v0";
import { authorizeEstimateRequest, ESTIMATE_NOT_FOUND_BODY } from "@/lib/estimate-access";
import { UUID_PATTERN } from "@/lib/estimate-mutations";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = { params: Promise<{ estimateId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { estimateId } = await context.params;
    if (!UUID_PATTERN.test(estimateId)) throw new TypeError("Invalid estimate ID.");
    const auth = await authorizeEstimateRequest(request, estimateId);
    if (auth.response) return auth.response;
    if (!auth.authorization!.canEditPrices) {
      return NextResponse.json({ success: false, error: "Estimate price-edit access is required." }, { status: 403 });
    }
    const body = await request.json() as Record<string, unknown>;
    if (Object.keys(body).length !== 3 || typeof body.visitId !== "string" || !UUID_PATTERN.test(body.visitId)
      || (body.boardRunDirection !== "along_length" && body.boardRunDirection !== "along_width")
      || !Number.isSafeInteger(body.expectedVisitRevision) || (body.expectedVisitRevision as number) < 1) {
      throw new TypeError("The completed field visit identity is invalid.");
    }
    const supabase = createAdminServerClient();
    const visit = await supabase.from("guided_site_visits")
      .select("id,status,revision")
      .eq("id", body.visitId)
      .eq("company_id", auth.authorization!.companyId)
      .eq("target_estimate_id", estimateId)
      .maybeSingle();
    if (visit.error) throw new Error("The completed field visit could not be loaded.");
    if (!visit.data) return NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 });
    if (visit.data.status !== "completed" || visit.data.revision !== body.expectedVisitRevision) {
      return NextResponse.json({ success: false, error: "Reload the completed field visit before finding products." }, { status: 409 });
    }
    const itemResult = await supabase.from("guided_site_visit_items")
      .select("item_key,observation")
      .eq("company_id", auth.authorization!.companyId)
      .eq("visit_id", visit.data.id)
      .order("ordinal");
    if (itemResult.error) throw new Error("The completed field facts could not be loaded.");
    const items: DeckObservationItem[] = (itemResult.data ?? []).map((item) => ({
      itemKey: item.item_key,
      observation: item.observation as Record<string, unknown>,
    }));
    const dimensions = deckFieldDimensions(items);
    if (!dimensions.lengthFeet || !dimensions.widthFeet) {
      return NextResponse.json({ success: false, error: "Verified deck length and width are required before finding products." }, { status: 409 });
    }
    const railing = deckRailingGeometry(items);
    const result = await findDeckLowesDefaults({
      deckLengthFeet: body.boardRunDirection === "along_width" ? dimensions.widthFeet : dimensions.lengthFeet,
      deckWidthFeet: body.boardRunDirection === "along_width" ? dimensions.lengthFeet : dimensions.widthFeet,
      railingLengthFeet: railing.railingLengthFeet,
      idempotencyKey: randomUUID(),
    });
    return NextResponse.json({ success: true, ...result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const isInput = error instanceof TypeError;
    const unavailable = error instanceof DeckLowesSuggestionError;
    return NextResponse.json({
      success: false,
      error: isInput
        ? error.message
        : unavailable
          ? "Lowe's product suggestions are temporarily unavailable. Existing catalog prices and manual verified sources are still available."
          : "Lowe's product suggestions could not be loaded.",
    }, { status: isInput ? 400 : unavailable ? 503 : 500 });
  }
}
