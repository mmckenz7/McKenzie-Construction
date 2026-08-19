# Browser QA record

## 2026-08-19 responsive smoke check

Scope: isolated DeckDesign v2 browser application before any v3 activation.

- Desktop default viewport: measured plan and live 3D model render side by side; L-shape-with-landing template produces 270 sq ft and seven conceptual stair treads with no console errors.
- Tablet at 768 × 1024: 753 CSS-pixel content viewport, 753-pixel document width, two 530-pixel-high visual cards, no horizontal overflow, no console errors.
- Mobile at 390 × 844: 375 CSS-pixel content viewport, 375-pixel document width, two 438-pixel-high visual cards, equal-width header actions, no horizontal overflow, no console errors.
- Desktop visual mounts: measured plan and 3D mount are each 471 CSS pixels high; the WebGL canvas matches its mount dimensions exactly.
- Automatic Preview for commit `f003d71` reached READY and returned HTTP 200 before this layout slice.

The smoke check found and corrected a flex/grid feedback loop caused by percentage-height visual children inside intrinsically sized grid cards. Visual cards now have bounded responsive heights, and the high-density WebGL drawing buffer is scaled to its mount instead of expanding layout.

Remaining Phase A visual-quality gap: durable golden screenshot automation and checks in additional browser engines.

## 2026-08-19 v3 polygon and movable-stair check

- Existing v2 local state migrated to the new v3 key and loaded as a four-corner polygon; the prior v2 key remained untouched by automated tests.
- Explicit outline unlock cleared protected edge options before geometry edits.
- Added one rectangular offset and then a second offset on another edge, producing a valid 12-corner outline; 2D, 3D, and deterministic area updated together.
- Attached stairs to an exact geometric edge and changed the bounded stair position to 72 inches; the plan and 3D stair run updated without changing quantity semantics.
- Desktop visual inspection confirmed editable corner handles, the orange stair handle, the two-offset outline, and matching procedural 3D geometry.
- Existing responsive rules remain unchanged: the visual workspace is sticky only above 1050 pixels and returns to normal flow at tablet/mobile widths.
- Follow-up usability check exposed a hidden prerequisite: the offset action could appear clickable while protected edge references or a missing edge selection blocked it. The control now presents explicit unlock/select/add steps, disables unavailable actions, and keeps the current requirement beside the button.
- A second follow-up found that clearing the now-obsolete edge selection after a successful region edit looked like a failed action. The action now changes to “Offset added ✓” and explains that a new edge is required only when adding another offset.
- Direct-edit follow-up added an armed “Add corner” mode, clickable wide segment targets, persistent round corner handles, and square segment handles. Browser QA added a fifth corner by clicking segment 2, then moved segment 1 by one snap increment; both endpoints moved and the adjacent segments remained connected in 2D/3D.
- The single-corner default created two diagonal segments, which was unsuitable for typical deck offsets. Click placement now creates a small outward rectangular bumpout: the new center segment remains parallel to the original edge, its sides are perpendicular, and all four inserted corners remain editable.
- Corner-alignment follow-up allows bumpout placement near an edge endpoint to anchor directly to that existing corner. Dragging a bumpout side or corner onto its adjacent existing corner now merges coincident vertices instead of leaving an unusable short segment or rejecting a zero-length edge.
- Repeated-alignment follow-up fixed an inactive stair placeholder that could block a later outline edit after the owner explicitly unlocked and disabled edge options. Active stair references still require review. Both round corners and square side handles now magnetically align to nearby corner axes within the selected drag step; a live desktop pass aligned one bumpout side to the top corner and then the remaining side to the bottom corner without a false review stop.

## 2026-08-19 sidebar clarity and sticky workspace check

- Replaced drafting jargon in the primary controls with plain-language deck width, distance-from-house, deck height, ground, railing, and stair labels.
- Added short explanations for plan orientation, drag steps, house-wall positions, and stair position.
- Desktop at 1060 CSS pixels: after 1,350 pixels of page scroll, the 2D/3D workspace remained pinned at viewport top with no console errors.
- Tablet at 768 × 1024: sticky behavior correctly disabled, content returned to normal flow, and 753-pixel content width matched document width with no horizontal overflow.

## 2026-08-19 photo-assisted start check

- Opened the optional photo start from the v3 header and confirmed all three photo slots are skippable, replaceable, and labeled by purpose.
- Confirmed the dialog states that photos remain local and are excluded from JSON, browser storage, and the repository.
- Entered a 12 × 12-foot deck, 6-foot door reference, and ledger response; the handoff created an exact 144 × 144-inch v3 rectangle with 144 square feet while leaving the unpositioned door out of geometry.
- Desktop dialog measured 980 CSS pixels wide with no horizontal overflow; all six visible dialog actions measured at least 44 CSS pixels high for touch use.
- Mobile CSS collapses photo slots, facts, and review columns to one column; the dialog becomes full-screen and retains 44-pixel actions. A device-width interactive pass remains required before treating mobile photo capture as beta-ready.
- Non-standard follow-up expanded intake to six guided angles (wide, connection, left corner, right corner, stairs/grade, elevated overview) plus up to six additional images. Selecting non-standard immediately listed the five missing recommended angles, retained the zero-photo/manual path, and changed the handoff to “Start editable outline.”
- The non-standard handoff created a 20 × 18-foot overall envelope with a persistent outline warning beside the controls and a separate warning that quantity cards represent the envelope only. The expanded desktop dialog had no horizontal overflow and all ten visible actions remained at least 44 CSS pixels high.
- The photo dialog is now lazy-loaded in its own 3.0 KiB gzip chunk; the initial entry returned below its enforced 90 KiB gzip budget.

## 2026-08-19 photo-reference outline tracing check

- Selected the non-standard path and confirmed the main action remains disabled while the calibrated outline is still a rectangle.
- Added an offset using the explicit edge action, confirmed the action became enabled, and created an eight-corner DeckDesign v3 polygon rather than a rectangle envelope.
- Confirmed the accepted polygon immediately drove the measured 2D plan, procedural 3D model, and deterministic quantity projection; no image pixels or inferred measurements entered the design.
- The calibrated house-attachment edge and its two corners are visibly fixed during tracing. Other corners and edge handles remain editable, and invalid polygon edits continue to fail through shared prototype normalization.
- At a 390 × 844 viewport, the full-screen dialog remained within the 375-pixel document width, trace controls collapsed to one column, and explicit edge actions measured 44 pixels high. No page-level horizontal overflow was present.
- Direct SVG edge tapping remains a shortcut; explicit 44-pixel edge buttons were added after semantic browser QA found SVG-only activation unreliable.
- Follow-up corner-alignment QA removed the overly strict original house endpoints: both house-line corner handles are now movable along `z = 0`, and an adjacent corner landing on that line collapses the redundant middle point into one straight attachment edge.
- Follow-up placement QA added visible feet-and-inches labels for every segment and exact feet inputs for a selected corner or edge. Moving the bumpout face from 12.5 feet to 18 feet produced two six-foot side segments with no runtime errors. Typed dimensions bypass magnetic alignment; pointer drags retain six-inch snapping and a frozen view scale.
- Tracer-local undo QA confirmed the button starts disabled, becomes enabled after adding an offset, restores an eight-corner outline to the original four-corner rectangle in one action, then disables again with no runtime errors.
- Continuous segment-drag QA verifies a white square stays captured through several pointer moves, translates both segment endpoints together, and recalculates both connected edge dimensions.
- Offset actions identify their matching plan segments by visible length and horizontal/vertical direction instead of unexplained edge numbers. Selecting a white square shows Length rather than distance from the house.
- Touch-first follow-up adds a three-step outline guide, tappable dimension labels, exact segment-length entry, larger corner/segment/edge targets, matching-line hover/focus highlighting, zoom controls, Fit, and two-finger pinch/pan. Verify these interactions without changing authoritative coordinates when only the viewport moves.
- Whole-phone workflow follow-up puts Plan & 3D before the long design controls, adds a sticky two-way jump bar, adds persistent Photos/Measurements/Review/Outline navigation inside the full-screen intake, and labels camera actions “Take or choose photo.” The edge-reference gate is now explained as “Edit deck outline.”
