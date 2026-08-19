import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builder = readFileSync(
  "src/components/estimates/estimate-builder.tsx",
  "utf8",
);
const guidedVisit = readFileSync(
  "src/components/estimates/guided-deck-site-visit.tsx",
  "utf8",
);
const visitRoute = readFileSync(
  "src/app/api/estimates/[estimateId]/guided-site-visits/route.ts",
  "utf8",
);
const proposalCard = readFileSync(
  "src/components/estimates/estimate-proposal-card.tsx",
  "utf8",
);

test("rediscovers the latest completed Deck visit without weakening tenant scope", () => {
  assert.match(visitRoute, /latestCompletedVisit/);
  assert.match(visitRoute, /\.eq\("status", "completed"\)/);
  assert.match(visitRoute, /\.order\("completed_at", \{ ascending: false \}\)/);
  assert.match(
    visitRoute,
    /\.eq\("company_id", auth\.authorization!\.companyId\)/,
  );
  assert.match(visitRoute, /Cache-Control": "private, no-store/);
  assert.match(guidedVisit, /body\.latestCompletedVisit\?\.id/);
  assert.match(
    visitRoute,
    /\.select\("item_key,title,ordinal,state,observation"\)/,
  );
  assert.match(visitRoute, /items: rows\.map/);
});

test("shows one focused Deck stage at a time with a truthful next action", () => {
  for (const copy of [
    "Current step:",
    "Site visit",
    "Deck shape",
    "Framing",
    "Materials",
    "Proposal",
    "Review and send estimate",
    "The approved shape feeds the framing plan",
    "Nothing is sent automatically",
  ]) assert.match(builder, new RegExp(copy, "i"));
  assert.match(guidedVisit, /Continue to human takeoff/);
  assert.match(builder, /deckWorkspaceStage === "site_visit"/);
  assert.match(builder, /deckWorkspaceStage === "shape"/);
  assert.match(builder, /deckWorkspaceStage === "structure"/);
  assert.match(builder, /deckWorkspaceStage === "takeoff"/);
  assert.match(builder, /deckWorkspaceStage === "proposal"/);
  assert.match(builder, /aria-current=\{activeStage === stage\.key \? "step"/);
  assert.match(builder, /disabled=\{!stage\.enabled\}/);
  assert.match(builder, /issuedOrResponded \? "proposal"/);
  assert.match(builder, /sticky top-20/);
  assert.match(builder, /deck-takeoff-workspace/);
  assert.doesNotMatch(builder, /function DeckEstimateReadiness/);
  assert.doesNotMatch(
    builder,
    /generateDeckTakeoff|auto(?:matic)?(?:ally)? create.*(?:quantity|price)|sendAutomatically/i,
  );
});

test("gates Deck OH&P and customer-link creation on real readiness", () => {
  assert.match(
    builder,
    /const deckPricingReady = deckVisitStatus === "completed" && deckTrueCostsReady/,
  );
  assert.match(
    builder,
    /OH&amp;P is locked until the Deck visit is completed and at least one positive true-cost line is saved/,
  );
  assert.match(
    builder,
    /showDeckWorkflow && !deckPricingReady/,
  );
  assert.match(builder, /issuanceBlockedReason=/);
  assert.match(proposalCard, /issuanceBlockedReason/);
  assert.match(
    proposalCard,
    /&& !issuanceBlockedReason/,
  );
});

test("completed field work opens a Deck-specific true-cost workspace", () => {
  for (const copy of [
    "Choose finish materials",
    "Review true costs",
    "Choose the visible decking and railing finishes",
    "Create Deck construction section",
  ]) assert.match(builder, new RegExp(copy, "i"));
  assert.match(builder, /Continue to OH&amp;P/);
  for (const category of ["material", "labor", "subcontractor", "equipment", "other"])
    assert.match(builder, new RegExp(`key: "${category}"`));
  assert.match(builder, /Add \{category\.label\}/);
  assert.match(builder, /deckObservationRows/);
  assert.match(builder, /item\.observation/);
  assert.match(builder, /status === "completed"\) void loadDeckVisitStatus\(\)/);
  assert.match(builder, /entry\.name\.trim\(\)\.toLowerCase\(\) === "deck construction"/);
  assert.match(builder, /costCategory: category/);
  assert.match(builder, /category === "labor" \? "hr"/);
  assert.match(builder, /category === "equipment" \? "day"/);
  assert.match(builder, /prefers-reduced-motion: reduce/);
  assert.match(builder, /target\?\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(
    builder,
    /(?:photo|image).{0,80}(?:calculate|derive|infer).{0,40}(?:quantity|price)/i,
  );
});
