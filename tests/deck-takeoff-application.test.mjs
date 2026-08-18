import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/app/api/estimates/[estimateId]/deck-takeoff/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260814100000_deck_reviewed_takeoff_application.sql", "utf8");
const ui = readFileSync("src/components/estimates/deck-takeoff-planner.tsx", "utf8");
const builder = readFileSync("src/components/estimates/estimate-builder.tsx", "utf8");
const suggestionRoute = readFileSync("src/app/api/estimates/[estimateId]/deck-product-suggestions/route.ts", "utf8");
const suggestionProvider = readFileSync("src/lib/deck-lowes-product-suggestions.ts", "utf8");
const curatedSuggestions = readFileSync("src/lib/deck-curated-product-suggestions.ts", "utf8");
const railingSystem = readFileSync("src/lib/deck-railing-system.ts", "utf8");

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
    "Framing costs and remaining estimate items",
    "Change products, costs, or advanced quantities",
    "Calculate quantities and costs",
    "Estimating retail price per board",
    "Estimating retail price per railing section",
    "How many boards should be purchased",
    "How many railing sections or kits should be purchased",
    "This[\\s\\S]*is a purchase count, not square footage",
    "Correct product details manually",
    "Open Lowe(?:'|&apos;)s product",
    "Enter .* missing price.* to continue",
    "I reviewed the field dimensions",
    "I reviewed the build-plan quantities",
    "I reviewed every true cost and its source",
    "Add reviewed takeoff to estimate",
    "Complete-rebuild scope and planned quantities",
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
  assert.match(ui, /bg-slate-950[\s\S]*Finish selections/);
  assert.match(ui, /deckingFamily === value[\s\S]*bg-blue-950/);
  assert.match(ui, /compositeColor === color\.key[\s\S]*bg-blue-950/);
  assert.match(ui, /railingFamily === value[\s\S]*bg-blue-950/);
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
  assert.match(suggestionProvider, /manufacturedRailing && \(!manufacturer \|\| !productLine\)/);
  assert.match(ui, /Compatible system:/);
  assert.match(suggestionRoute, /selectCuratedDeckProducts/);
  assert.match(suggestionRoute, /\.in\("price_type", \["retail", "estimated"\]\)/);
  assert.match(suggestionRoute, /mergeDeckProductSuggestions\(curated, live\)/);
  assert.match(curatedSuggestions, /cached_retail/);
  assert.match(curatedSuggestions, /price\.price_type === "retail"/);
  assert.doesNotMatch(curatedSuggestions, /price\.price_type === "contract"/);
  assert.match(ui, /No Pro discount is assumed/);
  assert.match(ui, /Reprice the complete[\s\S]*takeoff before purchasing/);
  assert.match(ui, /Default aluminum system/);
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
