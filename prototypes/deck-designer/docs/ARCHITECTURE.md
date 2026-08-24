# Prototype architecture and integration contract proposal

## Boundary

Everything under `prototypes/deck-designer/` is an isolated browser application. It does not import from McKenzie OS, call its APIs, use Supabase, or modify shared domain models. `DeckDesign` schema v3 is a prototype-owned contract until the owner and Master Technical Controller approve an integration contract.

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

The active browser document is DeckDesign v3. Legacy v1/v2 imports migrate to polygon platforms plus geometric edge references. Each v3 platform records decking `direction` as `left_right` or `house_yard`; earlier v3 files without the field normalize to `left_right`, preserving their prior projection. The board direction rotates the deterministic board scan lines and their perpendicular conceptual joists together, so plan, 3D, quantities, JSON, fingerprinting, and undo/redo cannot disagree. This is generic geometric intent—not a product, span, fastening, or structural conclusion. Earlier v3 documents with the former single `stairs` object remain accepted and normalize into one `stairSystems[]` entry. New v3 saves and downloads serialize only `stairSystems[]`; the old single-stair view is derived in memory for compatibility and is never a second authority.

## Deterministic quantity policy

The current projection reports geometry-derived conceptual quantities: platform area, surface board rows and linear feet, joist count and linear feet, one beam line, post count, deck-edge railing length and unique railing-post count, stair tread/run, side-stringer paths, descending stair-side handrail paths and endpoint posts, ordered landing area/rails/support locations, and a visible screw allowance. Stair railings are reported as `stair-railing-*` quantities with `stair_railing` assembly intent, never folded into the standard `railing-*` lines. Each stair system is projected independently, and each ordered landing records the completed-riser count where it occurs. The following flight can continue straight or turn left/right; a turning landing must be at least as deep as the stair width. Rounding happens only at named output boundaries. Every number is reproducible from normalized design facts; no AI participates. Stringers and stair rail posts remain conceptual visualization paths and do not claim estimate-grade, code-compliant, or structurally adequate assemblies.

The browser workspace presents Deck Layout and Railings as separate UI stages. Before the railing stage, a pure deterministic review derives outline area/perimeter/side count, elevation, house-side status, stair/landing completion, and cutout count from the normalized design and projection. Unfinished stair facts block the transition; field-verification notes remain visible but do not pretend to be geometry failures. This review and the UI stage are intentionally not stored in DeckDesign v3: locking the layout changes which editing controls are available but does not create a second geometry model or mutate the design. The railing stage selects the same exact geometric edge IDs, refuses house-attached edges, and records enabled free edges in deterministic platform-edge order. Its read-only assembly summary exposes deck-edge, descending stair-side, and landing-side railings as separate groups derived from the same geometry; it introduces no second railing model. Returning to layout preserves the existing explicit-review boundary for any edge-referenced house, stair, or railing facts.

The same review derives geometry-only warnings without making code or structural claims. Convex stair-tread and landing footprints from different stair systems are compared in plan; positive-area overlap is a blocking collision, while touching boundaries are allowed. Route footprint samples also detect a stair or landing returning through the selected deck region, excluding recorded cutout voids. Recorded house-wall panel segments are tested for strict passage through a route footprint, so a shared boundary touch is not mislabeled as a crossing. Valid cutouts closer than 12 inches to the outer ring or another cutout receive non-blocking clearance notes for human verification. Corner dragging continues to use exact snapped coordinates; visible alignment guides expose the chosen horizontal and vertical axes, and equal-distance snap choices prefer the two sides attached to the dragged corner before unrelated outline points.

The plan editor defaults to a UI-only keep-square constraint. Moving an orthogonal corner changes that corner plus one coordinate on each adjacent endpoint, preserving two perpendicular connected sides as one deterministic region edit. Turning the control off restores free two-axis corner movement for intentionally angled outlines. Keyboard nudges bypass magnetic re-alignment so one requested grid step cannot snap back to its starting coordinate. Both modes still pass through the same polygon normalization, self-intersection rejection, edge-reference review, history, and quantity pipeline; the editing preference is not stored in DeckDesign v3.

Rendered stair treads and landings carry their source `stairSystemId` and authoritative landing ID as projection metadata. This lets touch, pointer, or keyboard selection in the measured plan reopen the exact source controls without creating a second selection model or writing UI state into DeckDesign v3. The metadata does not change geometry, quantities, hashing, or stable JSON.

Recorded door projections expose a wide, transparent plan hit area above generic deck-side handles. Touch, pointer, or keyboard selection returns to the existing measured House connection controls and does not create a second opening editor. Windows remain visible recorded context and are not presented as editable until a dedicated measured-opening workflow exists.

Every free platform edge has a stable semantic ID. Rectangles expose `front`, `left`, and `right`; L-shapes additionally expose `notch-horizontal` and `notch-vertical`. Each `stairSystems[]` entry has a stable ID, lock state, exact edge ID, attachment offset, width, tread depth, maximum-riser intent, and ordered `landings[]`. Each landing has its own stable ID, lock state, `afterRiser`, width, depth, `straight | left | right` primary turn, and optional ordered `connections[]`. A connection records a stable ID, lock state, deck- or grade-bound destination, open landing side, width, and tread depth. A deck-bound connection may additionally record another platform's stable ID and exact free edge. The current UI records these references but does not expose its earlier destination-deck translation action; fixed-layer level connections use the terminal-landing fitter below.

The final landing may instead record `terminalPlatformId` plus `terminalEdgeId`. This is not another outgoing flight: it makes the landing the terminal point of the upper route at the exact lower-platform elevation. Normalization requires both references, a lower above-grade destination, the calculated whole-riser count for the measured level difference, no later landing, no additional connected flight, and a recorded free destination side. The primary route then stops at that elevation instead of continuing to grade. Its landing, rails, supports, treads, stringers, and quantities are projected once; stairs authored on the lower level remain the only separate route from that level to grade. The current fixed-level fitter leaves both platform regions unchanged, creates an upper top landing, selects a left/right turn, and searches bounded tread-depth, landing-depth, and snapped-offset candidates until the lower landing's near edge intersects the exact destination edge. If no candidate fits within tolerance, it rejects the connection instead of moving a deck or silently weakening the reference.

A non-terminal midway landing may use `switchback`. The landing is shifted laterally so the incoming flight occupies one half and the outgoing flight reverses beside it on the other half. Normalization requires a width of at least two stair widths, depth of at least one stair width, no additional merger branches, and placement at or beyond the halfway riser; the UI raises a newly selected switchback to that minimum automatically. Those bounds prevent the returning lower flight from extending back beneath the source deck. The same route facts drive opposing treads, four stringer paths, four stair-railing paths, landing guards, 2D, 3D, and quantities. This remains conceptual layout geometry, not stair-code or structural approval.

When at least two levels exist, the primary UI asks whether they connect by stairs before requiring any landing editor knowledge. **Yes — connect levels** selects the highest level and arms one outer-side choice. That choice creates an unlocked upper stair assembly, calculates the exact level-to-level risers, creates an upper top landing and terminal lower landing, and deterministically selects a turn and exact free outer edge on the next lower platform. Sliding the stair handle or entering an exact position refits only the stair assembly against the recorded fixed platform regions. A request that cannot remain connected is rejected with an explanation. This is deterministic placement assistance, not a structural or code-compliance claim.

These rules make each landing an explicit merger or terminal junction without allowing the same field to mean both. Each used side removes only that side's landing guard, so no railing crosses a recorded stair opening. Multiple unfinished landings may be added and positioned before their details are finished; shared-flight connections still require an explicitly finished landing. Another stair system is started only after the active system is finished. Systems on the same deck edge cannot overlap, and unrelated geometry is never silently assigned to a merger. Landing order, rise bounds, unique open sides, width, and turn-depth constraints fail closed. The same route engine drives 2D, 3D, stringers, stair railings, landing protection, and quantities. Undo/redo restores the entire grouped fact change as a new monotonic revision rather than silently moving the authoritative revision backward.

Rectangular cutouts are edited through the same safe region-replacement command used by exact numeric controls. Selecting a cutout exposes a center handle and four corner handles for pointer/touch movement plus arrow-key snapping; the text fields remain the fine-adjustment path. Every preview and committed shape is normalized against contained-hole and self-intersection rules before 2D, 3D, and quantities update.

Picture-frame decking remains a future surface-pattern option rather than a visual shortcut. Its prototype-local geometry groundwork creates deterministic mitered inward rings for convex and concave outlines, separates one outer border course from field boards clipped to a second inset region, normalizes reversed input identically, and rejects collapsed, self-intersecting, outside, or excessively acute results. The border remains unchanged when the recorded field-board direction rotates. Cutout designs fail closed until hole-border offset semantics are reviewed. These modules are not yet imported by the browser application and therefore do not change DeckDesign, rendered boards, quantities, or the production bundle. A future activation slice must define the v3 pattern fact and cutout-border behavior before making this projection authoritative.

The v3 model and isolated engine preserve the earlier multiple-platform experiment, including exact elevations, region translation, deterministic projections, and connection validation. Field testing showed that level-to-level stair placement was not yet intuitive enough for the active workflow, so the browser authoring interface is intentionally single-level. A loaded experimental multi-level draft exposes one explicit **Keep selected level only** recovery action; it removes cross-level references before normalization rather than silently moving geometry or choosing a destination. Multi-level authoring will return only after its interaction contract is redesigned and revalidated. These presentation choices never enter DeckDesign.

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

The editor shell and deterministic 2D/quantity projections load independently of the Three.js runtime. The 3D view, guided house-connection editor, level/cutout controls, platform commands, and shared-landing controls are lazy browser chunks with visible status fallbacks. Related on-demand design controls are grouped into one browser chunk to avoid repeated compression overhead. A post-build check enforces gzip budgets of 99 KiB for the initial entry, 170 KiB for the largest JavaScript chunk, and 244 KiB for all JavaScript combined. After removing the paused multi-level connection editor from the live interface, the single-level workflow measures 86.3 KiB initial, 119.9 KiB largest, and 240.9 KiB total gzip. Local economy, balanced, and detailed tiers bound pixel ratio and shadow cost without entering the authoritative design document or changing projections. These are prototype regression limits, not production service-level guarantees; later device testing can tighten them.
