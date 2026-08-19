# Prototype architecture and integration contract proposal

## Boundary

Everything under `prototypes/deck-designer/` is an isolated browser application. It does not import from McKenzie OS, call its APIs, use Supabase, or modify shared domain models. `DeckDesignV1` is a prototype-owned contract until the owner and Master Technical Controller approve an integration contract.

The build runs an isolation guard before compilation. It rejects source imports that escape the prototype, unapproved bare imports, browser network primitives, and environment-variable access. This complements scoped-diff review; it does not grant integration authority.

## Authoritative flow

`DeckDesignV1 JSON -> normalize and validate -> deterministic geometry projection -> 2D + 3D + deterministic quantity projection`

The design document is authoritative. Render meshes, SVG elements, and quantities are disposable projections and are never written back as design facts. Measurements are inches in a right-handed local coordinate system: `x` runs along the house, `y` is elevation, and `z` projects away from the house. The attached house edge is `z = 0`.

Phase A established a single rectangular platform; the next isolated slice adds an L-shape expressed as a front-right rectangular cutout. Numeric facts are normalized to hundredths of an inch, bounded, and rejected if non-finite. Construction intent is explicit but does not assert structural adequacy, code compliance, field conditions, or product availability.

## Proposed versioned JSON shape

```json
{
  "schemaVersion": 1,
  "id": "local-deck-001",
  "name": "Back deck concept",
  "units": "in",
  "platform": {
    "kind": "rectangle",
    "width": 192,
    "projection": 144,
    "surfaceElevation": 48,
    "cutoutWidth": 48,
    "cutoutDepth": 48
  },
  "construction": {
    "decking": { "boardWidth": 5.5, "gap": 0.25 },
    "framing": { "joistSpacing": 16, "beamInset": 24, "maxPostSpacing": 72 },
    "railing": { "height": 36, "enabledEdges": ["front", "left", "right"] },
    "stairs": { "enabled": false, "edgeId": "front", "offset": 48, "width": 48, "treadDepth": 10, "maxRiserHeight": 7.75, "landingEnabled": false, "landingDepth": 48 }
  },
  "metadata": { "status": "conceptual", "revision": 1 }
}
```

## Deterministic quantity policy

The current projection reports geometry-derived conceptual quantities: platform area, surface board rows and linear feet, joist count and linear feet, one beam line, post count, railing length and unique railing-post count, straight-stair tread/run and two side-stringer paths, and a visible screw allowance. Rounding happens only at named output boundaries. Every number is reproducible from normalized design facts; no AI participates. Stringers are deliberately limited to two visualization paths and do not claim an estimate-grade or structurally adequate count.

Every free platform edge has a stable semantic ID. Rectangles expose `front`, `left`, and `right`; L-shapes additionally expose `notch-horizontal` and `notch-vertical`. When enabled, stairs attach to one recorded edge ID. The attachment offset and width create the railing opening; the edge direction and deterministic outward normal orient the run. Elevation and maximum-riser intent produce equal conceptual rises and tread count. An optional recorded top-landing depth shifts the run outward and produces a separate landing-area projection. Undo/redo restores recorded facts as a new monotonic revision rather than silently moving the authoritative revision backward.

Normalization accepts the prototype's earlier local `edge: "front-outer"` field and projects it to `edgeId: "front"`. This is a local prototype compatibility rule, not an authorized shared migration.

These are visualization quantities, not estimate quantities. Future estimate quantities may require stock-length optimization, waste policy, fastening schedules, connections, blocking, ledgers, footings, stairs, local rules, and verified product assemblies.

## Future adapter boundary

After written approval, prefer one-way adapters:

- `DeckDesign -> DeckQuantityProjection` owned by Deck Designer.
- `DeckQuantityProjection + CatalogSnapshot -> CatalogSelectionProjection` owned at the catalog boundary.
- `CatalogSelectionProjection + labor/waste policy -> EstimateDraftInput` owned at the estimating boundary.

Do not share database rows or internal application types across these boundaries. Candidate shared decisions requiring controller review are stable design IDs, schema-version policy, units/rounding, product-reference semantics, quantity classifications, revision ownership, and persistence ownership. Recommended integration order: stabilize design fixtures and projections; approve neutral adapter DTOs; catalog adapter; estimating adapter; persistence and workflow last.

### Proposed reviewed-takeoff payload

The future adapter should emit a neutral payload rather than catalog items or estimate lines:

- `sourceDesignId`, `sourceSchemaVersion`, `sourceRevision`, and deterministic `sourceFingerprint`.
- `measurementPolicyVersion` and `quantityPolicyVersion`.
- `units` and explicit rounding rules.
- Platform measurements: polygon/level identifier, area, perimeter, elevation, and attached/free edge lengths.
- Generic quantity lines: stable semantic key, quantity class (`visualization` or `takeoff_candidate`), amount, unit, assembly intent, source geometry references, calculation explanation, and warning codes.
- Configuration intent: generic material family, board direction/pattern, railing edge/length intent, stair/landing intent, and framing intent without product IDs or prices.
- Review state kept outside the design document: reviewer, accepted/replaced quantity, catalog selection, and rationale.

Semantic mismatches to resolve before integration include inches versus catalog selling units; continuous geometry versus purchasable stock lengths; generic assembly intent versus manufacturer system compatibility; visualization allowances versus estimate-grade waste/fastening policy; design revision versus estimate revision; and quantity replacement/approval ownership. The current product/cost generator owns review and product matching, Material Catalog owns approved product and price facts, and Estimating Core owns labor, waste, margin, and commercial totals.

## Performance boundary

The editor shell and deterministic 2D/quantity projections load independently of the Three.js runtime. The 3D view is a lazy browser chunk with a visible status fallback. A post-build check enforces gzip budgets of 90 KiB for the initial entry, 170 KiB for the largest JavaScript chunk, and 220 KiB for all JavaScript combined. Local economy, balanced, and detailed tiers bound pixel ratio and shadow cost without entering the authoritative design document or changing projections. These are prototype regression limits, not production service-level guarantees; later device testing can tighten them.
