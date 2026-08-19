# Prototype architecture and integration contract proposal

## Boundary

Everything under `prototypes/deck-designer/` is an isolated browser application. It does not import from McKenzie OS, call its APIs, use Supabase, or modify shared domain models. `DeckDesign` schema v2 is a prototype-owned contract until the owner and Master Technical Controller approve an integration contract.

The build runs an isolation guard before compilation. It rejects source imports that escape the prototype, unapproved bare imports, browser network primitives, and environment-variable access. This complements scoped-diff review; it does not grant integration authority.

## Authoritative flow

`DeckDesign JSON -> normalize and validate -> deterministic geometry projection -> 2D + 3D + deterministic quantity projection`

The design document is authoritative. Render meshes, SVG elements, and quantities are disposable projections and are never written back as design facts. Measurements are inches in a right-handed local coordinate system: `x` runs along the house, `y` is elevation, and `z` projects away from the house. The attached house edge is `z = 0`.

Phase A established a single rectangular platform; later isolated slices added an L-shape expressed as a front-right rectangular cutout and explicit site context. Numeric facts are normalized to hundredths of an inch, bounded, and rejected if non-finite. Construction and attachment intent is explicit but does not assert structural adequacy, code compliance, field conditions, or product availability. Local schema-v1 JSON is deterministically migrated to v2 with a conceptual grade-zero wall context; unsupported future versions fail closed.

The UI directly adds, selects, edits, and removes up to eight conceptual house-wall segments. Each wall records endpoints, base elevation, height, attachment intent, and multiple non-overlapping door/window openings. These remain site-context facts only and require field verification.

## Photo-assisted start boundary

The optional photo intake is deliberately outside DeckDesign v3. It creates temporary browser object URLs for six guided angles (wide site, house connection, left corner, right corner, stairs/grade, and elevated overview) plus up to six additional images, revokes those previews when review closes, and never writes image bytes, file names, or inferred measurements to design JSON or browser storage. The user can skip every photo. A deterministic coverage review recommends missing corner/overview angles for a non-standard deck but never blocks manual design.

Only explicitly confirmed width, projection, optional elevation, attachment response, and manual outline edits can create authoritative geometry through the existing deterministic migration/normalization path. Rectangle starts use the confirmed dimensions directly. A non-standard start opens a side-by-side photo-reference and measured-plan tracer, keeps the calibrated house edge fixed, and requires a changed valid polygon before the design can start. The traced polygon passes through the same v3 normalization and deterministic projection path as every other design. A door width without a recorded wall position remains a review reference and is not placed automatically. Missing elevation carries the current design elevation with a visible field-verification note.

This tracer is not photogrammetry and performs no image analysis or AI calls: images help the user recognize the shape, while only their plan edits record corners. Future perspective calibration, multi-view reconstruction, or AI suggestions must remain reviewable proposals until user confirmation and must not alter this authority boundary.

## Current prototype JSON shape

```json
{
  "schemaVersion": 2,
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
  "siteContext": {
    "gradeElevation": 0,
    "houseWalls": [{
      "id": "house-wall-1",
      "start": { "x": -60, "z": 0 },
      "end": { "x": 252, "z": 0 },
      "baseElevation": 0,
      "height": 120,
      "attachment": "unknown",
      "openings": [{
        "id": "door-1", "kind": "door", "offset": 138,
        "width": 36, "sillHeight": 0, "height": 80
      }]
    }]
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
- Site-context measurements: grade reference, house-wall segments, openings, and attachment intent with field-verification status.
- Generic quantity lines: stable semantic key, quantity class (`visualization` or `takeoff_candidate`), amount, unit, assembly intent, source geometry references, calculation explanation, and warning codes.
- The isolated polygon report spike demonstrates these classifications and source references without becoming a production DTO or changing DeckDesign v2.
- Configuration intent: generic material family, board direction/pattern, railing edge/length intent, stair/landing intent, and framing intent without product IDs or prices.
- Review state kept outside the design document: reviewer, accepted/replaced quantity, catalog selection, and rationale.

Semantic mismatches to resolve before integration include inches versus catalog selling units; continuous geometry versus purchasable stock lengths; generic assembly intent versus manufacturer system compatibility; visualization allowances versus estimate-grade waste/fastening policy; design revision versus estimate revision; and quantity replacement/approval ownership. The current product/cost generator owns review and product matching, Material Catalog owns approved product and price facts, and Estimating Core owns labor, waste, margin, and commercial totals.

## Performance boundary

The editor shell and deterministic 2D/quantity projections load independently of the Three.js runtime. The 3D view is a lazy browser chunk with a visible status fallback. A post-build check enforces gzip budgets of 90 KiB for the initial entry, 170 KiB for the largest JavaScript chunk, and 220 KiB for all JavaScript combined. Local economy, balanced, and detailed tiers bound pixel ratio and shadow cost without entering the authoritative design document or changing projections. These are prototype regression limits, not production service-level guarantees; later device testing can tighten them.
