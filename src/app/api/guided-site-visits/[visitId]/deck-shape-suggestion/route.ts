import { NextRequest, NextResponse } from "next/server";

import {
  DeckShapeSuggestionError,
  runOpenAiDeckShapeSuggestion,
} from "@/lib/guided-site-visits/ai-deck-shape-suggestion";
import { authorizeGuidedSiteVisit } from "@/lib/guided-site-visits/access";
import { exactObject, UUID } from "@/lib/guided-site-visits/core";
import { deckFieldDimensions, type DeckObservationItem } from "@/lib/deck-takeoff-v0";
import { isValidDeckOutline, type DeckOutlinePoint } from "@/lib/deck-prescriptive-plan";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const BODY_FIELDS = new Set(["idempotencyKey", "projectKind"]);
const REVIEWABLE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function rectangle(length: number, width: number): DeckOutlinePoint[] {
  return [
    { x: 0, y: 0 },
    { x: length, y: 0 },
    { x: length, y: width },
    { x: 0, y: width },
  ];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ visitId: string }> },
) {
  try {
    const auth = await authorizeGuidedSiteVisit(request);
    if (auth.response) return auth.response;
    const { visitId } = await params;
    if (!UUID.test(visitId)) throw new TypeError("Visit ID is invalid.");
    const body = exactObject(await request.json(), BODY_FIELDS);
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    if (!idempotencyKey || idempotencyKey.length > 200)
      throw new TypeError("A valid review key is required.");
    if (body.projectKind !== "replacement" && body.projectKind !== "new_construction")
      throw new TypeError("Choose replacement or new construction.");

    const db = createAdminServerClient();
    const [visit, items, intakeAttempts, guidedAttempts] = await Promise.all([
      db
        .from("guided_site_visits")
        .select("id,status")
        .eq("id", visitId)
        .eq("company_id", auth.authorization!.companyId)
        .maybeSingle(),
      db
        .from("guided_site_visit_items")
        .select("item_key,title,ordinal,state,observation")
        .eq("visit_id", visitId)
        .eq("company_id", auth.authorization!.companyId)
        .order("ordinal"),
      db
        .from("guided_site_visit_intake_attempts")
        .select("id,confirmed_at,ai_estimator_assets!inner(storage_path,mime_type,status)")
        .eq("visit_id", visitId)
        .eq("company_id", auth.authorization!.companyId)
        .eq("state", "confirmed")
        .order("confirmed_at", { ascending: true }),
      db
        .from("guided_site_visit_photo_attempts")
        .select("id,confirmed_at,ai_estimator_assets!inner(storage_path,mime_type,status)")
        .eq("visit_id", visitId)
        .eq("company_id", auth.authorization!.companyId)
        .eq("state", "confirmed")
        .order("confirmed_at", { ascending: true }),
    ]);
    if (visit.error || items.error || intakeAttempts.error || guidedAttempts.error)
      throw new Error("The completed site visit evidence could not be loaded.");
    if (!visit.data || visit.data.status !== "completed")
      return NextResponse.json({ success: false, error: "Complete the site visit before building the Deck shape." }, { status: 422 });
    const observations: DeckObservationItem[] = (items.data ?? []).map((item) => ({
      itemKey: item.item_key,
      title: item.title,
      ordinal: item.ordinal,
      state: item.state,
      observation: item.observation as Record<string, unknown>,
    }));
    const dimensions = deckFieldDimensions(observations);
    const length = dimensions.lengthFeet;
    const width = dimensions.widthFeet;
    if (!length || !width)
      return NextResponse.json({ success: false, error: "Verified Deck length and width are required before drawing the shape." }, { status: 422 });
    const startingRectangle = rectangle(length, width);
    if (body.projectKind === "new_construction")
      return NextResponse.json({
        success: true,
        usedAi: false,
        outline: startingRectangle,
        photoCount: 0,
        explanation: "New construction starts from the field-entered dimensions; existing-site photos are context, not the proposed footprint.",
      });

    const linkedRows = [...(intakeAttempts.data ?? []), ...(guidedAttempts.data ?? [])] as unknown as {
      id: string;
      ai_estimator_assets: { storage_path: string; mime_type: string; status: string };
    }[];
    const uniqueAssets = [...new Map(
      linkedRows
        .filter((row) => row.ai_estimator_assets.status === "available" && REVIEWABLE_MIME.has(row.ai_estimator_assets.mime_type))
        .map((row) => [row.ai_estimator_assets.storage_path, row.ai_estimator_assets]),
    ).values()].slice(0, 6);
    const photos: { bytes: ArrayBuffer; mimeType: string }[] = [];
    for (const asset of uniqueAssets) {
      const download = await db.storage.from("ai-estimator-private").download(asset.storage_path);
      if (!download.error && download.data)
        photos.push({ bytes: await download.data.arrayBuffer(), mimeType: asset.mime_type });
    }
    if (!photos.length)
      return NextResponse.json({
        success: true,
        usedAi: false,
        outline: startingRectangle,
        photoCount: 0,
        explanation: "No reviewable saved photo could support a footprint suggestion, so the verified field dimensions created a rectangle.",
      });
    try {
      const suggestion = await runOpenAiDeckShapeSuggestion({
        photos,
        idempotencyKey: `${auth.authorization!.companyId}:${visitId}:${idempotencyKey}`,
      });
      const scaled = suggestion.points.map((point) => ({
        x: Math.round(point.x * length * 2) / 2,
        y: Math.round(point.y * width * 2) / 2,
      }));
      if (suggestion.result !== "suggested" || suggestion.confidence < 0.55 || !isValidDeckOutline(scaled))
        return NextResponse.json({
          success: true,
          usedAi: false,
          outline: startingRectangle,
          photoCount: photos.length,
          explanation: "The saved photos did not support a reliable footprint. Verified field dimensions created the editable rectangle instead.",
        });
      return NextResponse.json({
        success: true,
        usedAi: true,
        outline: scaled,
        photoCount: photos.length,
        confidence: suggestion.confidence,
        shapeType: suggestion.shapeType,
        explanation: "AI suggested only the general footprint topology from saved photos. Exact edge dimensions still come from field measurements and your edits.",
      });
    } catch (error) {
      const diagnostic = error instanceof DeckShapeSuggestionError ? error.diagnostic : "review_unavailable";
      return NextResponse.json({
        success: true,
        usedAi: false,
        outline: startingRectangle,
        photoCount: photos.length,
        diagnostic,
        explanation: "Photo shape review was unavailable. Verified field dimensions created the editable rectangle instead.",
      });
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof TypeError ? error.message : "The photo-assisted Deck shape could not be prepared." },
      { status: error instanceof TypeError ? 400 : 500 },
    );
  }
}
