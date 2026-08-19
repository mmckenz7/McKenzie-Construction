# DeckDesign v3 isolated application activation contract

Status: accepted by the Master Technical Controller and activated inside the isolated prototype on 2026-08-19. This contract authorizes only an internal model switch inside `prototypes/deck-designer/`. It does not authorize production integration, shared code, APIs, databases, cloud storage, catalogs, estimating, deployment promotion, or workflow changes.

## Purpose

Replace the prototype browser application's authoritative in-memory and local JSON model from DeckDesign v2 with DeckDesign v3 after equivalence gates pass. V3 records one to eight independently elevated polygon platforms, contained holes, geometric edge conditions, edge-referenced rail/stair intent, site context, and metadata. The same normalized document drives 2D, 3D, local JSON, history, and deterministic projections.

## Ownership and file boundary

- All implementation remains under `prototypes/deck-designer/` on the isolated `codex/deck-designer-rd` branch.
- Deck Designer owns the v3 authoring document, browser-local state, geometry projections, and generic conceptual quantities only.
- The current product/cost generator continues to own reviewed takeoff flow and product-system matching.
- Material Catalog continues to own approved product and supplier/price facts.
- Estimating Core continues to own waste, labor, margin, pricing, and commercial totals.
- No existing McKenzie OS route, component, model, library, schema, migration, or deployment configuration changes.

## Browser persistence behavior

- Import accepts v1, v2, or v3 JSON and normalizes once into v3 in memory.
- Export writes canonical, newline-terminated v3 JSON only and includes no derived geometry or quantities.
- Browser local storage moves to a new prototype-only key; the existing v2 key is read as a migration source but is never overwritten.
- The first successful v2-to-v3 local migration writes v3 only after normalization and projection succeed.
- Invalid or ambiguous input fails closed with the original local value retained and an actionable conceptual-design notice.
- No remote persistence, telemetry, share link, API call, cookie, identity, tenant, or secret is introduced.

## Projection rules

- `normalizeDeckDesignV3` is the sole entrypoint for authoritative facts.
- 2D and 3D consume deterministic v3 platform geometry; quantities consume versioned v3 projection reports.
- Platform selection affects editing focus only, never aggregate facts.
- Edge-changing edits use the region replacement planner; ambiguous house, rail, or stair references require explicit review and are not auto-applied.
- Inter-platform stairs, connections, clashes, supports, and structural relationships are not inferred.
- AI is not used for geometry, migration, validation, quantities, or structural conclusions.

## Compatibility and safety gates

Activation is acceptable only when all of the following are true:

1. Existing v1/v2 golden fixtures migrate to v3 with equivalent footprint, surface members, rail/stair/landing geometry, and supported quantity values.
2. V3 JSON export/import is byte-stable after normalization.
3. Browser local migration is idempotent and preserves the untouched v2 fallback value.
4. Undo/redo restores v3 facts with monotonic revisions.
5. Rectangle and L-shape workflows remain usable before custom polygon controls are exposed.
6. 2D and 3D render the same selected platforms and elevations from one v3 document.
7. Quantity output remains conceptual, traceable, reproducible, and free of catalog, price, labor, waste, margin, or code-compliance claims.
8. Isolation, tests, type checks, build, bundle budgets, and browser smoke checks pass.
9. A scoped diff confirms that only `prototypes/deck-designer/` changed.

## Activation sequence

1. Add browser-local v3 import/export and migration tests without changing UI behavior.
2. Adapt existing 2D and 3D views to v3 projection inputs behind a prototype-local switch.
3. Run dual-projection golden comparisons; remove the switch only after exact supported equivalence.
4. Activate v3 as the prototype's local authoritative state and retain v2 read-only migration fallback.
5. Add custom polygon and multi-platform controls incrementally through immutable v3 commands.

## Rollback

Rollback means reverting the prototype-local activation commit and returning the browser to v2 authority. The old v2 local-storage value remains untouched, so rollback does not require reverse-migrating v3 into v2. V3 exports remain user-downloadable JSON but are not silently downgraded.

## Explicitly deferred decisions

- Any neutral DTO shared with another track.
- Production persistence, tenant/security model, APIs, routes, migrations, or project association.
- Product references, compatibility rules, stock lengths, waste, fasteners, pricing, labor, margin, and estimate revision ownership.
- Structural sizing, code compliance, permit documents, and field verification conclusions.
- Inter-level connection modeling and collision policy.

## Requested controller decision

Approve or reject the isolated application activation sequence above. Approval permits v3 browser/local-state implementation only inside the existing prototype boundary; it does not relax any production or integration gate.
