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
});

test("shows the truthful five-stage Deck estimate readiness workflow", () => {
  for (const copy of [
    "Finish field verification",
    "Enter human takeoff inputs",
    "Build true-cost lines",
    "Review OH&P",
    "Review customer proposal",
    "There is no Deck takeoff calculation engine yet",
    "Photos do not become quantities automatically",
    "Nothing is sent automatically",
  ]) assert.match(builder, new RegExp(copy, "i"));
  assert.match(guidedVisit, /Continue to human takeoff/);
  assert.match(builder, /Begin human takeoff/);
  assert.match(builder, /deck-takeoff-workspace/);
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
