import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { findDeckLowesDefaults, DeckLowesSuggestionError } from "@/lib/deck-lowes-product-suggestions";
import type { DeckLowesSuggestion } from "@/lib/deck-lowes-product-suggestions";
import {
  deckProductKindsNeedingRefresh,
  enrichLiveDeckProducts,
  mergeDeckProductSuggestions,
  selectCuratedDeckProducts,
  unpricedDeckProductKinds,
  type CuratedDeckMaterial,
  type CuratedDeckPrice,
} from "@/lib/deck-curated-product-suggestions";
import { deckEstimatingProductDefaults } from "@/lib/deck-estimating-product-defaults";
import { deckBlueprintVisitSeed, deckFieldDimensions, deckRailingGeometry, type DeckObservationItem } from "@/lib/deck-takeoff-v0";
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
    if (Object.keys(body).length !== 6 || typeof body.visitId !== "string" || !UUID_PATTERN.test(body.visitId)
      || (body.boardRunDirection !== "along_length" && body.boardRunDirection !== "along_width")
      || (body.deckingFamily !== "wood" && body.deckingFamily !== "composite")
      || !(["wood", "metal", "cable", "none"] as unknown[]).includes(body.railingFamily)
      || (body.deckingFamily === "wood" && body.compositeColor !== null)
      || (body.deckingFamily === "composite" && !(["brown", "gray", "cedar", "redwood", "coastal"] as unknown[]).includes(body.compositeColor))
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
    if (
      (railing.railingsPresent === false && body.railingFamily !== "none") ||
      (railing.railingsPresent !== false && body.railingFamily === "none")
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The railing selection does not match the completed field facts. Reload the visit before finding products.",
        },
        { status: 409 },
      );
    }
    const materialResult = await supabase
      .from("material_catalog")
      .select("id,category,description,brand,product_line,unit_cost,metadata")
      .eq("is_active", true);
    if (materialResult.error) throw new Error("The approved estimating catalog could not be loaded.");
    const materialIds = (materialResult.data ?? []).map((material) => material.id);
    const priceResult = materialIds.length
      ? await supabase
          .from("material_supplier_prices")
          .select("material_catalog_id,unit_cost,price_type,last_checked_at,source_reference,confidence,suppliers(name)")
          .in("material_catalog_id", materialIds)
          .eq("is_active", true)
          .in("price_type", ["retail", "estimated"])
      : { data: [], error: null };
    if (priceResult.error) throw new Error("The approved estimating prices could not be loaded.");
    const requestFinish = {
      deckingFamily: body.deckingFamily as "wood" | "composite",
      compositeColor: body.compositeColor as "brown" | "gray" | "cedar" | "redwood" | "coastal" | null,
      railingFamily: body.railingFamily as "wood" | "metal" | "cable" | "none",
    } as const;
    const curated = selectCuratedDeckProducts({
      materials: (materialResult.data ?? []) as CuratedDeckMaterial[],
      prices: (priceResult.data ?? []) as unknown as CuratedDeckPrice[],
      request: requestFinish,
    });
    const joistSpacing = deckBlueprintVisitSeed(items).supportedJoistSpacingInches;
    const woodScrewCoverageSquareFeetPerPack = joistSpacing
      ? Math.floor(
          625 /
            (2 * (12 / 5.5) * (12 / Number(joistSpacing))),
        )
      : null;
    const bundled = deckEstimatingProductDefaults({
      request: requestFinish,
      woodScrewCoverageSquareFeetPerPack,
    });
    const savedProducts = mergeDeckProductSuggestions(curated, bundled);
    const railingKinds: DeckLowesSuggestion["kind"][] =
      requestFinish.railingFamily === "metal" || requestFinish.railingFamily === "cable"
        ? [
            "railing_level_kit",
            "railing_level_post",
            ...(requestFinish.railingFamily === "cable"
              ? (["railing_cable_pack", "railing_cable_end_post"] as const)
              : []),
            ...(railing.stairsPresent
              ? (["railing_stair_kit", "railing_stair_lower_post"] as const)
              : []),
          ]
        : requestFinish.railingFamily === "none" || requestFinish.railingFamily === "wood"
          ? []
          : ["railing_section"];
    const requiredKinds: DeckLowesSuggestion["kind"][] = [
      "deck_board",
      "deck_fastener",
      ...railingKinds,
    ];
    const refreshKinds = deckProductKindsNeedingRefresh(
      requiredKinds,
      savedProducts,
    );

    let live = [] as ReturnType<typeof enrichLiveDeckProducts>;
    let liveLookupStatus: "not_needed" | "completed" | "unavailable" =
      refreshKinds.length ? "unavailable" : "not_needed";
    if (refreshKinds.length) {
      try {
        const result = await findDeckLowesDefaults({
          deckLengthFeet: body.boardRunDirection === "along_width" ? dimensions.widthFeet : dimensions.lengthFeet,
          deckWidthFeet: body.boardRunDirection === "along_width" ? dimensions.lengthFeet : dimensions.widthFeet,
          railingLengthFeet: railing.railingLengthFeet,
          stairsPresent: railing.stairsPresent,
          ...requestFinish,
          idempotencyKey: randomUUID(),
        });
        live = enrichLiveDeckProducts(result.products);
        liveLookupStatus = "completed";
      } catch (error) {
        if (!(error instanceof DeckLowesSuggestionError) || !savedProducts.length) throw error;
      }
    }
    const products = mergeDeckProductSuggestions(savedProducts, live);
    if (!products.length) throw new DeckLowesSuggestionError("invalid_result");
    const productKinds = new Set(products.map((product) => product.kind));
    const missingKinds = requiredKinds.filter((kind) => !productKinds.has(kind));
    const unpricedKinds = unpricedDeckProductKinds(requiredKinds, products);
    return NextResponse.json({
      success: true,
      version: "deck-curated-estimating-products-v1",
      products,
      catalogMatched: curated.length,
      liveLookupUsed: refreshKinds.length > 0,
      liveLookupStatus,
      missingKinds,
      unpricedKinds,
      pricingNotice: "Retail estimating prices only. No Pro discount is assumed; final purchasing is repriced from the complete takeoff.",
    }, { headers: { "Cache-Control": "private, no-store" } });
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
