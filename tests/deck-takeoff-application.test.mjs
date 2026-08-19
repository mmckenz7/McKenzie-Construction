import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/app/api/estimates/[estimateId]/deck-takeoff/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260814100000_deck_reviewed_takeoff_application.sql", "utf8");
const ui = readFileSync("src/components/estimates/deck-takeoff-planner.tsx", "utf8");
const builder = readFileSync("src/components/estimates/estimate-builder.tsx", "utf8");
const globalStyles = readFileSync("src/app/globals.css", "utf8");
const suggestionRoute = readFileSync("src/app/api/estimates/[estimateId]/deck-product-suggestions/route.ts", "utf8");
const suggestionProvider = readFileSync("src/lib/deck-lowes-product-suggestions.ts", "utf8");
const curatedSuggestions = readFileSync("src/lib/deck-curated-product-suggestions.ts", "utf8");
const railingSystem = readFileSync("src/lib/deck-railing-system.ts", "utf8");
const estimatingDefaults = readFileSync("src/lib/deck-estimating-product-defaults.ts", "utf8");

test("preview and apply reconstruct the authoritative field and catalog inputs server-side", () => {
  assert.match(route, /authorizeEstimateRequest\(request, estimateId\)/);
  assert.match(route, /canEditPrices/);
  assert.match(route, /guided_site_visits/);
  assert.match(route, /target_estimate_id/);
  assert.match(route, /status !== "completed"/);
  assert.match(route, /material_supplier_prices/);
  assert.match(route, /buildDeckTakeoffPreview/);
  assert.match(route, /preview\.previewBinding !== body\.previewBinding/);
  assert.match(route, /expectedCalculationRevision/);
  assert.match(route, /boardRunDirection/);
  assert.match(route, /stairEdge/);
  assert.match(route, /stairPosition/);
  assert.match(route, /stairPlacementConfirmed/);
  assert.match(route, /PRE_REBUILD_PLAN_KEYS/);
  assert.match(route, /COMPLETE_REBUILD_LINE_KEYS/);
  assert.match(route, /exactFields\([\s\S]*plan\.scopeDecisions/);
  assert.match(route, /buildPlanConfirmed/);
  assert.match(route, /completeRebuildConfirmed/);
  assert.match(route, /LEGACY_PLAN_KEYS/);
  assert.match(route, /SHAPE_BINDING_KEYS/);
  assert.match(route, /guided_deck_shape_revisions/);
  assert.match(route, /shape_revision/);
  assert.match(route, /stale_shape_revision/);
  assert.doesNotMatch(route, /if \(plan\.shapeBinding\) \{[\s\S]*guided_deck_shape_revisions/);
  assert.match(route, /latest && !plan\.shapeBinding/);
  assert.match(route, /design:\s*\{/);
  assert.match(route, /apply_reviewed_deck_takeoff/);
});

test("atomic persistence is tenant-scoped, append-only, idempotent, and revision fenced", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.match(migration, /get_effective_user_access/);
  assert.match(migration, /assert_single_company_fence_estimate_scope/);
  assert.match(migration, /company_id = resolved_company_id/);
  assert.match(migration, /target_estimate_id = requested_estimate_id for update/);
  assert.match(migration, /visit_record\.status <> 'completed'/);
  assert.match(migration, /visit_record\.revision <> requested_expected_visit_revision/);
  assert.match(migration, /estimate_record\.calculation_revision <> requested_expected_calculation_revision/);
  assert.match(migration, /deck_takeoff_application_idempotency_unique/);
  assert.match(migration, /before update or delete/);
  assert.match(migration, /persist_structured_estimate_outputs/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /insert into public\.material_catalog|update public\.material_catalog/i);
});

test("UI keeps calculation, human plan, price evidence, and customer proposal as separate gates", () => {
  for (const copy of [
    "Finish material selections",
    "Matching Lowe(?:'|&apos;)s product package",
    "Choose what the customer will see",
    "Wood decking",
    "Composite decking",
    "Composite color family",
    "Cable",
    "Complete framing, hardware, labor, and remaining costs",
    "Change products, costs, or advanced quantities",
    "Calculate quantities and costs",
    "Estimating retail price per board",
    "Estimating retail price per railing section",
    "Calculated boards to purchase",
    "Calculated railing package quantity",
    "Quantity comes from the approved perimeter and selected",
    "no individual railing SKU is required",
    "Estimating material cost per linear foot",
    "approved polygon calculates deck\\s+area, board count, and level-railing length automatically",
    "Correct product details manually",
    "Open Lowe(?:'|&apos;)s product",
    "Enter .* missing price.* to continue",
    "I reviewed the field dimensions",
    "I reviewed the build-plan quantities",
    "I reviewed every true cost and its source",
    "Add reviewed takeoff to estimate",
    "Framing materials, hardware, labor, and remaining costs",
    "Reviewed build-plan source",
    "Ledger and house attachment",
    "Foundations / footings and concrete",
    "Blocking and bracing",
    "Structural connectors and fasteners",
    "Demolition and disposal",
    "Material delivery",
    "Equipment and rentals",
    "This estimate replaces the entire deck,[\\s\\S]*including decking, framing,[\\s\\S]*supports, and footings",
  ]) assert.match(ui, new RegExp(copy, "i"));
  assert.match(ui, /border-slate-300 bg-white[\s\S]*Finish selections/);
  assert.match(ui, /deckingFamily === value[\s\S]*bg-blue-50/);
  assert.match(ui, /compositeColor === color\.key[\s\S]*bg-blue-50/);
  assert.match(ui, /railingFamily === value[\s\S]*bg-blue-50/);
  assert.match(ui, /Matching products for the custom footprint[\s\S]*border-slate-300 bg-white/);
  assert.match(ui, /Finish material estimate[\s\S]*bg-emerald-50/);
  assert.match(builder, /deck-estimate-light/);
  assert.match(globalStyles, /\.platform-content \.deck-estimate-light \.bg-white \{ background-color: #ffffff !important; \}/);
  assert.match(globalStyles, /\.platform-content \.deck-estimate-light input,[\s\S]*background: #ffffff !important; color: #0f172a !important;/);
  assert.match(
    ui,
    /requestedRailing === "wood"[\s\S]*quantity: woodRailingFeet\.toFixed\(2\)/,
  );
  assert.match(ui, /\/api\/material-catalog\?active=true&includePrices=true/);
  assert.match(ui, /Deck blueprint/);
  assert.match(ui, /Place the stairs on the drawing/);
  assert.match(ui, /Farthest from the house/);
  assert.match(ui, /I checked this stair location against the jobsite/);
  assert.match(ui, /Compare deck-board and railing combinations/);
  assert.match(ui, /material-only comparisons/i);
  assert.match(ui, /Open Lowe(?:'|&apos;)s product and check price/);
  assert.match(
    ui,
    /The Lowe(?:'|&apos;)s links are already saved[\s\S]*as the price[\s\S]*sources/,
  );
  assert.match(ui, /missingRequiredPrices\.length > 0/);
  assert.match(ui, /This app did not size the structure or choose code requirements/);
  assert.match(ui, /Not in this estimate/);
  assert.match(ui, /does not choose count, diameter, depth, reinforcement, or soil capacity/);
  assert.match(ui, /Required for complete rebuild/);
  assert.match(ui, /Only delivery, equipment/);
  assert.match(ui, /Checklist progress/);
  assert.match(ui, /Every required category is shown below/);
  assert.match(ui, /price and source needed/);
  assert.match(ui, /available · choose whether this is included/);
  assert.match(ui, /COMPLETE_REBUILD_LINE_KEYS\.map/);
  assert.match(ui, /Next category/);
  assert.match(ui, /Deck-board fasteners \(required\)/);
  assert.match(ui, /Compatibility \/ reviewed-detail verification/);
  assert.match(ui, /Number\(selection\.quantity\) >= requirement\.quantity/);
  assert.match(route, /verificationReference/);
  assert.match(ui, /crypto\.randomUUID\(\)/);
  assert.match(ui, /method: "PUT"/);
  assert.match(builder, /onTakeoffApplied/);
  assert.match(builder, /Continue to OH&amp;P/);
  assert.match(builder, /EstimateProposalCard/);
  assert.doesNotMatch(ui, /send.*customer|issue.*proposal/i);
});

test("Lowe's defaults are read-only, tenant-authorized, and bound to exact product pages", () => {
  assert.match(suggestionRoute, /authorizeEstimateRequest\(request, estimateId\)/);
  assert.match(suggestionRoute, /canEditPrices/);
  assert.match(suggestionRoute, /status !== "completed"/);
  assert.match(suggestionRoute, /expectedVisitRevision/);
  assert.match(suggestionRoute, /deckingFamily/);
  assert.match(suggestionRoute, /compositeColor/);
  assert.match(suggestionRoute, /railingFamily/);
  assert.match(suggestionProvider, /allowed_domains:\s*\["lowes\.com"\]/);
  assert.match(suggestionProvider, /Return only matching deck-board products/);
  assert.match(suggestionProvider, /do not substitute another railing family/);
  assert.match(suggestionProvider, /one coherent system from one manufacturer and one named product line/);
  assert.match(suggestionProvider, /Do not mix rails, posts, brackets, panels, cable, gates, caps, or fasteners/);
  assert.match(ui, /Stair railing coverage/);
  assert.match(ui, /A stair rail kit is one rail for one side/);
  assert.match(ui, /One side/);
  assert.match(ui, /Both sides/);
  assert.match(ui, /Wood railing allowance/);
  assert.match(ui, /const DEFAULT_WOOD_RAILING_RATE = "25"/);
  assert.match(
    ui,
    /saved\.woodRailingRate === null[\s\S]*DEFAULT_WOOD_RAILING_RATE/,
  );
  assert.match(ui, /stairProjectionFeet \* sides/);
  assert.match(ui, /buildDefaultCableRailingPackage/);
  assert.match(suggestionProvider, /manufacturedRailing && \(!manufacturer \|\| !productLine\)/);
  assert.match(ui, /Compatible system:/);
  assert.match(suggestionRoute, /selectCuratedDeckProducts/);
  assert.match(suggestionRoute, /\.in\("price_type", \["retail", "estimated"\]\)/);
  assert.match(suggestionRoute, /mergeDeckProductSuggestions\(savedProducts, live\)/);
  assert.match(suggestionRoute, /deckEstimatingProductDefaults/);
  assert.match(suggestionRoute, /woodScrewCoverageSquareFeetPerPack/);
  assert.match(suggestionRoute, /liveLookupStatus/);
  assert.match(suggestionRoute, /unpricedKinds/);
  assert.match(suggestionRoute, /deckProductKindsNeedingRefresh/);
  assert.match(suggestionRoute, /unpricedDeckProductKinds/);
  assert.match(
    suggestionRoute,
    /kind !== "deck_fastener"[\s\S]*!deckingKinds\.includes\(product\.kind\) \|\| !product\.unitCost/,
  );
  assert.match(estimatingDefaults, /Clinton Highway/);
  assert.match(estimatingDefaults, /25\.8/);
  assert.match(ui, /Load products and estimating costs/);
  assert.match(ui, /saved product pages remain attached/);
  assert.match(curatedSuggestions, /cached_retail/);
  assert.match(curatedSuggestions, /price\.price_type === "retail"/);
  assert.doesNotMatch(curatedSuggestions, /price\.price_type === "contract"/);
  assert.match(ui, /No Pro discount is assumed/);
  assert.match(ui, /Reprice the complete[\s\S]*takeoff before purchasing/);
  assert.match(ui, /Default complete system/);
  assert.match(ui, /Parts already included in a kit are not counted twice/);
  assert.match(ui, /Post anchoring fasteners are not included with the post kits/);
  assert.match(railingSystem, /Deckorators/);
  assert.match(railingSystem, /Contemporary/);
  assert.match(railingSystem, /post cap/);
  assert.match(railingSystem, /mounting brackets and bracket hardware/);
  assert.match(suggestionProvider, /railing_stair_lower_post/);
  assert.match(suggestionProvider, /\["lowes\.com", "www\.lowes\.com"\]\.includes\(url\.hostname\.toLowerCase\(\)\)/);
  assert.match(suggestionProvider, /pathname\.startsWith\("\/pd\/"\)/);
  assert.doesNotMatch(suggestionRoute + suggestionProvider, /insert\(|update\(|delete\(/);
});

test("custom finish geometry remains visible while product matching is pending", () => {
  assert.match(ui, /customDeckingCoverageSquareFeet = customFinishGeometry/);
  assert.match(
    ui,
    /customDeckBoardEstimate\s*\? String\(customDeckBoardEstimate\.pieces\)\s*:\s*customDeckingCoverageSquareFeet\?\.toFixed\(2\)/,
  );
  assert.match(ui, /customDeckBoardEstimate \? "ea" : "sq ft"/);
  assert.match(ui, /Calculated decking coverage/);
  assert.match(
    ui,
    /The approved polygon requires[\s\S]*including[\s\S]*waste[\s\S]*converts this to boards/,
  );
  assert.match(ui, /nextRailQuantity[\s\S]*woodRailingFeet\.toFixed\(2\)/);
  assert.match(
    ui,
    /railingFamily !== "wood"[\s\S]*line\.sourceReference\.trim\(\)[\s\S]*return line/,
  );
});
