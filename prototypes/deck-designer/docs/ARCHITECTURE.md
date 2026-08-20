# Prototype architecture and integration contract proposal

## Boundary

Everything under `prototypes/deck-designer/` is an isolated browser application. It does not import from McKenzie OS, call its APIs, use Supabase, or modify shared domain models. `DeckDesign` schema v2 is a prototype-owned contract until the owner and Master Technical Controller approve an integration contract.

The build runs an isolation guard before compilation. It rejects source imports that escape the prototype, unapproved bare imports, browser network primitives, and environment-variable access. This complements scoped-diff review; it does not grant integration authority.

## Authoritative flow

`DeckDesign JSON -> normalize and validate -> deterministic geometry projection -> 2D + 3D + deterministic quantity projection`

The design document is authoritative. Render meshes, SVG elements, and quantities are disposable projections and are never written back as design facts. Measurements are inches in a right-handed local coordinate system: `x` runs along the house, `y` is elevation, and `z` projects away from the house. The attached house edge is `z = 0`.

Phase A established a single rectangular platform; later isolated slices added an L-shape expressed as a front-right rectangular cutout and explicit site context. Numeric facts are normalized to hundredths of an inch, bounded, and rejected if non-finite. Construction and attachment intent is explicit but does not assert structural adequacy, code compliance, field conditions, or product availability. Local schema-v1 JSON is deterministically migrated to v2 with a conceptual grade-zero wall context; unsupported future versions fail closed.

The UI directly adds, selects, edits, and removes up to eight conceptual house-wall segments. Each wall records endpoints, base elevation, height, attachment intent, and multiple non-overlapping door/window openings. These remain site-context facts only and require field verification.

The v3 guided house-connection command records one exact geometric deck edge as the house side, aligns the primary conceptual wall to that edge, and optionally places a door from an explicitly entered width and offset. The command updates the edge condition and site-context wall together, advances revision once, and drives the same deterministic 2D and 3D wall/opening projection. It rejects doors outside the selected edge and refuses to silently replace a railing/stair reference or relocate recorded windows. Wall height is visualization context derived only far enough to contain the recorded deck-height door; it is not a field measurement or structural conclusion.

## Photo-assisted start boundary

The original foundation header exposes **Start with photos** before v3 is otherwise activated. That action passes the current legacy design through the existing v3 migration boundary, then opens the local-only photo intake immediately; it does not create a second geometry model or a separate persistence path.

The optional photo intake is deliberately outside DeckDesign v3. It creates temporary browser object URLs for six guided angles (wide site, house connection, left corner, right corner, stairs/grade, and elevated overview) plus up to six additional images, revokes those previews when review closes, and never writes image bytes, file names, or inferred measurements to design JSON or browser storage. The user can skip every photo. A deterministic coverage review recommends missing corner/overview angles for a non-standard deck but never blocks manual design.

Only explicitly confirmed width, projection, optional elevation, attachment response, and manual outline edits can create authoritative geometry through the existing deterministic migration/normalization path. Rectangle starts use the confirmed dimensions directly. A non-standard start opens a side-by-side photo-reference and measured-plan tracer, requires one straight edge on the calibrated house line, and requires a changed valid polygon before the design can start. Its endpoints may extend or merge when an adjacent offset is intentionally aligned; the resulting geometric edge becomes the exact v3 house-attachment reference. The traced polygon passes through the same v3 normalization and deterministic projection path as every other design. A door width without a recorded wall position remains a review reference and is not placed automatically. Missing elevation carries the current design elevation with a visible field-verification note.

The tracer displays deterministic feet-and-inches labels on every segment. Selecting a round corner exposes exact along-house and away-from-house coordinates. Selecting a square segment shows only its actual length; its position is controlled directly by dragging both endpoints together. Typed corner values use six-inch increments without magnetic realignment, while direct dragging retains snap behavior and a frozen drag view so resizing geometry does not change the pointer scale mid-drag.

Before a traced polygon becomes DeckDesign v3, the dialog owns a bounded local undo stack. Offset creation, each pointer-drag start, each focused exact-dimension edit, and rectangle reset record a prior polygon snapshot. Undo restores only this ephemeral trace state; it does not write history into the design document or interfere with the main editor's monotonic command history.

Photo-tracer segment handles keep stable render identities during a drag. A white square translates both endpoints of its segment as one unit; the neighboring edges remain attached and their dimensions are recalculated from the resulting polygon.

The tracer's touch-first viewport remains presentation state: pinch gestures and the zoom/Fit controls change only the local SVG view and never design coordinates. Dimension labels are selectable. An exact segment-length edit keeps the segment start fixed, moves its end and the following side together, then passes the result through the same polygon and house-line validation before acceptance.

This tracer is not photogrammetry and performs no image analysis or AI calls: images help the user recognize the shape, while only their plan edits record corners. Future perspective calibration, multi-view reconstruction, or AI suggestions must remain reviewable proposals until user confirmation and must not alter this authority boundary.

## Legacy v2 input shape

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
    "stairs": { "enabled": false, "edgeId": "front", "offset": 48, "width": 48, "treadDepth": 10, "maxRiserHeight": 7.75, "landingEnabled": false, "landingWidth": 48, "landingDepth": 48, "landingPosition": "top", "upperFlightRisers": 3, "landingTurn": "straight" }
  },
  "metadata": { "status": "conceptual", "revision": 1 }
}
```

The active browser document is DeckDesign v3. Legacy v1/v2 imports migrate to polygon platforms plus geometric edge references. Earlier v3 documents remain accepted and normalize missing stair facts to `landingPosition: "top"`, `upperFlightRisers: 3`, `landingWidth: stairs.width`, and `landingTurn: "straight"`. New v3 saves and downloads always include those explicit fields.

## Deterministic quantity policy

The current projection reports geometry-derived conceptual quantities: platform area, surface board rows and linear feet, joist count and linear feet, one beam line, post count, deck-edge railing length and unique railing-post count, stair tread/run, side-stringer paths, descending stair-side handrail paths and endpoint posts, optional top- or midway-landing area/rails/support locations, and a visible screw allowance. Stair railings are reported as `stair-railing-*` quantities with `stair_railing` assembly intent, never folded into the standard `railing-*` lines. A recorded landing can sit at the deck or split the stair into an upper and lower flight. The outgoing flight can continue straight or turn left/right; a turning landing must be at least as deep as the stair width. Rounding happens only at named output boundaries. Every number is reproducible from normalized design facts; no AI participates. Stringers and stair rail posts remain conceptual visualization paths and do not claim estimate-grade, code-compliant, or structurally adequate assemblies.

The browser workspace presents Deck Layout and Railings as separate UI stages. This stage is intentionally not stored in DeckDesign v3: locking the layout changes which editing controls are available but does not create a second geometry model or mutate the design. The railing stage selects the same exact geometric edge IDs, refuses house-attached edges, and records enabled free edges in deterministic platform-edge order. Its read-only assembly summary exposes deck-edge, descending stair-side, and landing-side railings as separate groups derived from the same geometry; it introduces no second railing model. Returning to layout preserves the existing explicit-review boundary for any edge-referenced house, stair, or railing facts.

Every free platform edge has a stable semantic ID. Rectangles expose `front`, `left`, and `right`; L-shapes additionally expose `notch-horizontal` and `notch-vertical`. When enabled, stairs attach to one recorded edge ID. The attachment offset and width create the railing opening; the edge direction and deterministic outward normal orient the run. Elevation and maximum-riser intent produce equal conceptual rises and tread count. A landing records independent width/depth plus whether it is at the deck or midway down the stairs; width cannot be narrower than the attached stair. For a midway landing, `upperFlightRisers` deterministically splits the total rise while requiring at least one riser in each flight. Its explicit `landingTurn` is `straight`, `left`, or `right`, defined while walking down from the deck; no collision or code-compliance conclusion is inferred. The same derived flights drive 2D, 3D, stringers, stair railings, landing protection, and quantities. Undo/redo restores recorded facts as a new monotonic revision rather than silently moving the authoritative revision backward.

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

The editor shell and deterministic 2D/quantity projections load independently of the Three.js runtime. The 3D view and guided house-connection editor are lazy browser chunks with visible status fallbacks. A post-build check enforces gzip budgets of 90 KiB for the initial entry, 170 KiB for the largest JavaScript chunk, and 224 KiB for all JavaScript combined. The total ceiling increased by 3 KiB for the isolated house-wall/door command and editor while its lazy boundary kept the initial entry below 90 KiB; the initial-load and largest-chunk limits remain unchanged. Local economy, balanced, and detailed tiers bound pixel ratio and shadow cost without entering the authoritative design document or changing projections. These are prototype regression limits, not production service-level guarantees; later device testing can tighten them.
