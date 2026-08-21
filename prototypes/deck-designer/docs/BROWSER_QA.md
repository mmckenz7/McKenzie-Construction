# Browser QA record

## 2026-08-21 phone-width door selection

- A recorded door now has a wide transparent plan target above the generic house-side and segment handles. Tapping or keyboard-selecting it returns directly to the existing measured door width/offset controls and names the selected opening.
- Windows remain visible reference context but are not falsely exposed as editable by the current door-only House connection workflow.
- At a real 390-by-844 viewport, the square-corner control and recorded-door target remained available, the page had no horizontal overflow, and tapping the door exposed its measured width controls and selected-door status. The viewport override was reset after QA.
- Full validation passed 187 tests, isolation, build, and golden fixtures. The measured bundle is 87.9 KiB initial and 243.5 KiB total gzip under the 99/170/244 KiB initial/largest/total ceilings.

## 2026-08-21 conservative midway switchback

- A midway landing now offers **Switchback** beside Straight, Left, and Right. Selecting it expands the landing to at least twice the stair width and reverses the lower flight beside the upper flight.
- The first live render exposed a lower-flight re-entry risk when a seven-riser stair switched back after only three risers. The normalized rule now requires the landing at or beyond the halfway riser, and selection automatically moved that case to step four. Invalid imported or typed facts reject instead of drawing beneath the deck.
- Switchbacks cannot be top landings or merger junctions. The landing must be at least one stair width deep and two stair widths wide; the returning route keeps its separate treads, stringers, stair rails, and quantities.
- Live desktop QA created a four-foot-high switchback: the landing moved to after step 4, widened to 8 feet for a 4-foot stair, retained seven treads, projected four stringers and four stair-railing paths, and reported a separate 32-square-foot landing. The layout review confirmed **Geometry conflicts — None detected** and allowed the railing handoff.
- Full validation passed 187 tests, isolation, build, and golden fixtures. The measured bundle is 87.7 KiB initial and 243.3 KiB total gzip under the 99/170/244 KiB initial/largest/total ceilings.

## 2026-08-21 keep-square corner editing

- **Keep attached sides square** is on by default. Moving one corner also updates the two neighboring endpoints, so both attached sides remain perpendicular and the full region is still normalized as one authoritative edit.
- Turning the switch off retains intentional angled-outline editing. If an already angled corner is used while the square constraint is on, the edit is rejected with a direct instruction to turn the switch off.
- Live desktop QA unlocked a 20-by-12-foot rectangle and nudged its lower-right corner left by one six-inch step. Both right-side corners moved from 240 to 234 inches, both horizontal sides changed to 19′ 6″, and both vertical sides remained 12′ 0″. With the switch off, nudging only the upper-right corner down created the requested angled edge and reported **Corner moved freely**.
- Full validation passed 185 tests, isolation, build, and golden fixtures. The measured bundle is 87.6 KiB initial and 243.1 KiB total gzip under narrowly revised 99/170/244 KiB initial/largest/total ceilings.

## 2026-08-21 direct stair and landing selection

- Every visible stair tread is now a touch, pointer, and keyboard selection target for its exact owning stair system. Selecting even the tread that overlaps the source deck edge reopens stair position, width, and landing controls instead of selecting the underlying deck side.
- Every visible landing carries its authoritative landing ID and reopens that exact landing editor. This source metadata is projection-only and does not alter design JSON, quantities, or geometry.
- Live desktop QA selected the first tread in a seven-tread run, confirmed the exact **Stairs selected for editing** state and contextual stair controls, added a midway landing, then selected it directly and confirmed **Landing selected for editing**. No browser alerts were reported.
- Full validation passed 183 tests, isolation, build, and golden fixtures. The measured bundle is 87.5 KiB initial and 242.8 KiB total gzip under the 99/170/243 KiB initial/largest/total ceilings.

## 2026-08-21 collision review and visible alignment

- The layout review now includes a separate **Geometry conflicts** result. Positive-area overlap between two stair systems blocks the railing handoff with an exact move/reroute instruction; mere touching does not count as a collision.
- Cutouts under 12 inches from the deck edge or another cutout remain valid but produce a measured field-verification note rather than an invented code ruling.
- While a round corner handle is dragged onto another corner axis, orange dashed horizontal/vertical guides show the exact snap. If two axes are equally close, an attached side wins before an unrelated corner line.
- Live desktop QA added a 3-by-3-foot cutout, set its center two feet from the left origin, and confirmed the review reported **0 collisions · 1 clearance note** plus the exact six-inch edge clearance. The pre-existing unfinished stair remained a separate blocker, proving advisory and blocking states do not overwrite each other. The browser reported no alerts.
- Full validation passed 181 tests. Initial JavaScript is 86.8 KiB gzip and total JavaScript is 242.2 KiB under the narrowly revised 99/170/243 KiB initial/largest/total ceilings.
- Follow-up geometry coverage blocks a turned route that re-enters the solid part of an L-shaped deck and a route crossing a separately recorded house wall. A route merely sharing the wall or deck boundary is not treated as an interior collision.

## 2026-08-21 single-level layout review gate

- **Review deck layout** and the Railings tab now open the same compact geometry review instead of moving stages immediately.
- The review reads the normalized DeckDesign v3 and deterministic projection: outline area/perimeter/side count, height above grade, house-connection status, stair/landing counts, and cutout count.
- Unfinished stair systems, landings, or landing connections disable the continue action with exact finish instructions. Unknown or missing house attachment remains a visible field-verification note and does not falsely block conceptual design.
- The review is transient UI state only; it does not mutate or serialize a second geometry model.
- Live desktop QA loaded a saved layout with one unfinished stair system, confirmed the disabled continue action and exact blocker, then cleared edge-linked options and confirmed the ready state advanced to the dedicated Railings stage with no browser alerts. Full validation passed 175 tests; initial JavaScript is 85.8 KiB gzip and total JavaScript is 241.1 KiB under the enforced budgets.

## 2026-08-21 single-level workflow reset

- Multi-level authoring and level-connection prompts are paused in the active interface after field testing showed the connected stair flow was not yet intuitive enough.
- Deck setup now shows one clear **Deck height** control and no **Add another level** action. Rectangle/L-shape, custom outline, cutouts, stairs, landings, railings, photos, local JSON, and deterministic quantities remain available for one deck level.
- A loaded experimental multi-level draft gets one explicit **Keep selected level only** recovery action. It removes cross-level stair references before normalization rather than leaving broken targets or silently choosing a different level.
- Live desktop QA confirmed the ordinary local design opens as one platform, exposes no level-connection controls, and reports quantities from one platform only. The experimental multi-level engine remains isolated in source for a later redesign.

## 2026-08-21 terminal shared-level landing

### Fixed-level turned assembly correction

- The primary two-level workflow now leaves both deck regions fixed. It adds an upper top landing, deterministically chooses a left/right turn, runs the measured flight to the lower elevation, and intersects a lower-level top landing with an exact recorded free edge.
- Moving the connected stair handle refits the stair assembly only. It never translates either deck layer; an arrangement with no bounded exact fit is rejected instead of distorted.
- The old **Align lower level** action is no longer exposed for terminal landings. The interface identifies the upper and lower landings separately and states that both deck layers remain fixed.
- Live desktop QA stacked 14-foot and 4-foot levels with both exact position fields at zero, selected the upper 16-foot outer side, and created a right-turning 16-riser assembly with distinct upper and lower four-foot landings. The plan, 3D view, status, and deterministic quantities agreed on 16 treads and 32 square feet of landing area.
- Entering a different stair offset kept both platform-position fields at zero and selected the nearest valid connected fit. The status reports that fitted position instead of implying that an impossible requested position was accepted.

- Added two stacked levels at 4 and 14 feet, selected a free upper-deck side, added stairs and a midway landing, and chose **Stop upper stairs at this level** with an exact lower-level free side.
- The command recalculated the upper flight to 16 equal risers over the measured 10-foot level difference, changed to Combined View, aligned the lower deck side to the landing, and reported that the upper route now stops at Level 1.
- Live 2D and 3D inspection confirmed that the former six-riser continuation to grade disappeared. Aggregate tread quantity changed from 29 to 23: sixteen upper-level treads plus the lower level's existing seven-tread stair system. The landing remained one 16-square-foot geometry item.
- The terminal controls explain that the lower level's stairs are the sole remaining route to grade and provide explicit Align lower level and Disconnect level actions. No production, catalog, estimating, database, or network dependency was introduced.
- Full validation passed 171 tests. Initial JavaScript is 82.5 KiB gzip and total JavaScript is 241.5 KiB under the enforced 99/242 KiB budgets.

### Two-level connected assembly follow-up

- From a clean 4-foot rectangle, added a 14-foot second level. The setup panel immediately asked whether the levels connect by stairs; **Yes — connect levels** selected the upper layer and requested one outer side.
- Selecting the 16-foot outer side and **Add connected stair assembly** created the complete 16-riser upper flight plus one lower landing, switched to Combined View, and snapped the lower platform's nearest free outer edge to that landing without exposing platform IDs or a separate destination editor.
- Changed the exact stair position from 4 to 6 feet. The upper flight, terminal landing, and lower platform remained aligned as one draggable assembly; the status confirmed the two-foot move and deterministic quantities remained 16 treads plus one 16-square-foot landing.
- The setup card then read **Levels connected by stairs** and exposed one **Edit connected stairs** action. The measured plan and 3D model showed the same aligned arrangement.

## 2026-08-21 automatic destination-layer alignment

- Finishing an exact level connection now translates the destination deck layer as one rigid body until the selected destination-side midpoint meets the connected stair centerline endpoint.
- The same atomic command remaps destination edge conditions, railings, stairs, and every incoming `targetEdgeId`, then advances the design revision once so Undo restores the previous whole-layer placement.
- The alignment command is deterministic across replays and rejects missing connections, levels, sides, or unresolved stair endpoints instead of partially moving geometry.
- Live desktop QA created 10-foot and 4-foot stacked levels, added a midway landing, connected left to Level 2 Side 1, and confirmed that `Finish connection` aligned Level 2 to the stair endpoint, opened Combined View, and reported no browser alerts.
- Previously locked exact connections expose `Align connected level`, allowing older local designs to run the same deterministic alignment without deleting their stair or landing facts.
- Full validation passed 168 tests. The alignment logic is an on-demand 0.86 KiB gzip chunk; the measured bundle is 97.6 KiB initial and 241.7 KiB total under 99/242 KiB ceilings.

## 2026-08-21 measured multi-level start and exact destination-side connections

- The project-information dialog now asks how many deck levels are planned and requires a measured height above grade for every additional layer; a two-level 10-foot/4-foot test created stacked, independently selectable platforms without invented offsets or elevations.
- A locked midway landing can connect to another level through an explicit destination-level and destination-free-side selection. The level height drives the stair rise, left/straight/right controls the route, and house-attached or missing destination sides are rejected by normalization.
- Desktop browser QA created two levels, added stairs and a midway landing, selected Level 2 Side 1, finished the connection, and confirmed both levels in Combined View with no alerts or horizontal overflow at the active desktop viewport.
- The destination edge is now authoritative in JSON, validation, undo/redo, and storage round-trips. Automatic endpoint realignment after either whole level moves remains a deliberate next geometry slice; the prototype does not silently move decks or claim that an unaligned route is construction-ready.
- Full validation passed 167 tests. The measured bundle is 97.4 KiB initial and 240.6 KiB total gzip under 99/241 KiB ceilings; level setup and connection controls remain lazy-loaded.

## 2026-08-21 selectable level layers and combined placement

- `Add another level` now requires an entered height above grade, then starts the new platform directly over the selected source layer at zero left/right and zero away-from-house offset instead of inventing elevation or a 22-foot side placement.
- Level cards show each recorded height above grade and switch the editing authority without changing geometry. Selected-layer view hides other levels; Combined view restores all 2D/3D context and exposes a selected-level move handle plus exact position fields.
- A live pass entered 15 feet above grade and confirmed that the layer card, measured-plan header, 3D projection, and design revision all used the same 180-inch fact. The conceptual height bound now supports 6 through 360 inches and rejects values above it.
- Whole-layer keyboard movement shifted the selected level by the active six-inch snap while preserving shape and cutouts. The same control exposes a pointer/touch drag path; exact left/right and house-distance fields remain the fine-adjustment fallback.
- At 390 × 844, both level cards, the height-above-grade field, view switch, combined move control, and exact placement fields were available with no horizontal overflow.
- Full validation passed 165 tests. The measured bundle is 98.9 KiB initial and 239.8 KiB total gzip under 99/240 KiB ceilings; the 170 KiB largest-chunk ceiling is unchanged.

## 2026-08-20 direct cutout editing and target-level stair intent

- A selected rectangular cutout now exposes a center move target and four resize targets in the measured plan. The same safe region command drives direct manipulation, arrow-key snapping, and exact numeric fields; a live keyboard pass moved the center from 10 to 10.5 feet and resized the width from 3 to 3.5 feet while quantities updated from the normalized region.
- A connected landing flight can explicitly select another platform as its destination. The target platform supplies the exact final elevation, while the interface states that target-edge alignment is not inferred and remains for review.
- Focused geometry coverage confirms an eight-tread connected flight terminates exactly at the recorded 84-inch target elevation. Normalization rejects missing, same-platform, grade-bound, and same-elevation target IDs.
- At 390 × 844, direct cutout controls, visible Undo, `Connect another level`, the destination selector, and the alignment warning remained available. The browser reported no warnings or errors.
- Full validation passed 162 tests. The measured bundle is 98.3 KiB initial and 238.6 KiB total gzip under 99/239 KiB ceilings; the 170 KiB largest-chunk ceiling is unchanged.

## 2026-08-20 flexible landings, levels, cutouts, and visible history

- Added two unfinished midway landings consecutively on one stair system at a 6-foot level; both appeared in the deterministic sequence without requiring the first landing to be finished.
- Added a second platform at an exact elevation and offset. The active level remained editable while the other level stayed visible and selectable in the measured plan; both rendered together in the 3D context.
- Added a 3-by-3-foot rectangular cutout to only the selected level. Aggregate platform area changed from 480 to 471 square feet, the cutout became selectable in the plan, and visible Undo restored 480 square feet in one action with Redo available.
- At 390 × 844, Add level, Add cutout, Undo, Add midway landing, and the selected-side tray were all visible. A clean browser session reported no warnings or errors.
- Full validation passed 157 tests. The measured bundle is 97.1 KiB initial and 237.2 KiB total gzip under 98/238 KiB ceilings; level/cutout controls and platform commands remain on-demand chunks.

## 2026-08-20 shared-landing stair mergers

- A locked midway landing now exposes `Connect stair down` and `Connect stair up`. Each connected flight has its own destination, unused landing side, width, tread depth, lock state, and removal action.
- Clean-session QA created a three-riser upper approach, the primary lower flight, one additional grade-bound flight, and one additional deck-bound flight. The route projected 14 treads, eight stringer paths, and eight stair-railing paths while keeping one 16-square-foot landing.
- All three travel sides remained open and the landing-railing projection correctly fell to zero segments and zero posts; no railing crossed a stair opening.
- At 390 × 844, every merger action measured at least 44 pixels high, the document had no horizontal overflow, and the browser reported no warnings or errors.
- Older v3 landings without `connections` still normalize to an explicit empty list. The measured bundle is 95.7 KiB initial and 233.8 KiB total gzip under narrow 96/234 KiB ceilings; the advanced controls are lazy-loaded in a 1.17 KiB chunk.

## 2026-08-20 grouped stair systems and ordered landings

- Desktop QA locked Landing 1, revealed and added Landing 2, locked the complete stair system, then added Stair system 2 on another exact free edge. The completed first group remained unchanged and separately selectable.
- The same route authority updated 2D, 3D, stair/landing railing geometry, and conceptual quantities. Two landings aggregated to 32 square feet and retained separate geometry references; adding the second stair system increased stair treads, stringers, and stair-railing quantities without changing deck geometry.
- At 390 × 844, stair-system and landing selectors remained 48–49 pixels high, all add/lock/remove actions measured at least 44 pixels high, both visual cards fit the viewport, and there was no horizontal overflow.
- The browser reported no warnings or errors. Old local v3 single-stair state loaded as one editable stair system, demonstrating the compatibility path in the live application.
- The grouped route measured 94.5 KiB initial and 231.5 KiB total JavaScript gzip. Enforced ceilings are now narrowly set at 95 KiB and 232 KiB; the 170 KiB largest-chunk ceiling is unchanged.

## 2026-08-20 turning-landing perimeter fix

- Each 90° turn leaves its outgoing stair edge open while retaining both the opposite protected-side railing and the outside landing railing; left and right turns mirror exactly.
- The corrected edge selection drives the same 2D plan, 3D model, landing-railing posts, and deterministic quantity references.
- Focused geometry tests assert both turn directions create the complete L-shaped landing guard opposite the outgoing stair flight so later rendering changes cannot silently drop an exposed edge.

## 2026-08-20 visible landing-railing groups

- Enabling `Add top landing` now states directly in Deck Layout that protected landing sides receive railings automatically while the stair opening stays open.
- The dedicated Railings stage shows deck-edge, stair-side, and landing railings as three separate groups rather than hiding landing railings in the model or quantity list.
- A 48-inch-deep straight landing displayed 2 protected landing sides and 8′ 0″ of landing railing, matching the separate deterministic quantity projection.
- The 2D and 3D views showed the same landing, stair opening, stair rails, and landing rails; the local browser reported no errors.

## 2026-08-20 separate stair-railing check

- Every enabled stair now projects two deterministic descending-side handrail paths and four conceptual endpoint posts from the same run, rise, width, and landing-turn facts.
- Desktop visual QA confirmed the handrails slope with straight stairs and rotate with a left-turn landing in both the measured plan and 3D model.
- `stair-railing-linear-feet` and `stair-railing-post-count` appear as separate conceptual quantity cards; the original `railing-linear-feet` and `railing-post-count` remain deck-edge-only.
- The stair card explains that both descending sides are included separately, while the dedicated Railings stage explicitly states that it controls deck-edge railings only.
- At 390 × 844, the stair-railing notice and separate quantity line remain available with no browser warnings or errors.
- The validated bundle budgets remain 92 KiB initial entry and increase from 228 to 229 KiB total gzip for the sloped 3D rail geometry and separate projection semantics.

## 2026-08-20 landing and stair-turn check

- The existing v3 top-landing fact is now exposed only inside the active stair card, keeping the Deck Layout page staged and uncluttered.
- Enabling the landing reveals one exact depth field and three touch-sized choices: Straight, Left, and Right. Left/right are defined while walking down from the deck.
- Desktop visual QA confirmed the same recorded turn updates the measured plan, the framed 3D model, landing rails/supports, and conceptual quantities in real time.
- At 390 × 844, the landing controls remain one-column, the three direction choices stay fully visible, and the selected direction has a clear active state. There were no browser warnings or errors.
- A turning landing shallower than the stair width is rejected, restores the prior valid dimension, and explains the limit. Older v3 JSON without `landingTurn` normalizes to `straight`.
- Locking the layout still moves to the dedicated railing stage with zero corner/segment/stair movement handles; the turned stair and its deterministic opening remain part of the same design.
- The validated bundle budgets are now 92 KiB initial entry and 228 KiB total gzip, a one-KiB increase for this complete geometry/UI slice.

## 2026-08-20 staged railing-workspace check

- Deck Layout and Railings are separate internal prototype stages; the layout stage contains shape, house, and stair controls but no railing action.
- Lock layout & continue opens a dedicated railing workspace whose plan retains exact dimensions but removes corner, segment, and stair-movement handles.
- Tapping a free side exposes only Add railing or Remove railing; the recorded house side remains unavailable, and stair openings continue to split enabled railing deterministically.
- Returning to Deck Layout retains edge-reference protection so later outline changes require an explicit unlock and cannot silently remap railings.
- The railing workspace is a separate on-demand code chunk. The narrowly revised budgets are 91 KiB for the initial entry and 227 KiB total gzip after adding the second workflow page.

## 2026-08-20 contextual side-action check

- At 390 × 844, the sticky navigation shows Plan & 3D, Shape, Stairs, and House.
- Tapping a plan side or its white square handle highlights that exact side and reveals only its contextual Add bumpout, Add/Move stairs, and Toggle railing actions below the plan.
- When side references lock the outline, the bumpout action stays disabled and explains that Shape must be unlocked first.
- In photo-reference tracing, the row of per-side offset buttons is gone. Selecting one side reveals one Add bumpout here action and its exact length field.
- The same selected-side panel now shows Add stairs here beside Add bumpout here. Selecting stairs immediately renders the centered stair treads outside the orange-marked exact side and carries that same placement into the confirmed design; house and short sides reject stair placement.
- Photo-outline stairs now expose an orange touch handle for rough sliding along the selected side plus synchronized From left/right or From top/bottom measurements for exact placement. Both routes preserve the full four-foot stair width and carry the recorded offset into the authoritative design.
- The selected-side stair controls include an exact width from 2.5 to 8 feet. Width changes preserve the stair center when possible, update both end clearances, resize the orange preview, and carry the recorded width into final 2D/3D geometry.

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
- Fresh-origin QA confirms **Start with photos** is visible in the original foundation header and opens the v3 photo intake directly, without requiring **Open flexible corner editor** first.
- Edge-length visibility follow-up renders feet-and-inches labels outside every v3 plan segment and moves photo-tracer labels away from the white segment handles. Rectangle QA confirmed both right and left 12-foot labels plus both 20-foot labels remain visible.

## 2026-08-19 guided house-connection check

- The lazy-loaded House step lists plan-relative sides with visible lengths instead of unexplained edge IDs and remains reachable from the three-button mobile jump bar.
- Selected the 20-foot upper side, ledger attachment, a six-foot door, and a four-foot offset from the left corner. One command advanced revision 6 to 7 and displayed the recorded wall/door in both 2D and 3D.
- The plan projected four wall panels, one door opening, and one exact highlighted attachment edge. The 3D wall retained a matching six-foot opening at deck elevation.
- Focused tests reject doors outside the selected side and reject attempts to silently replace railing or stair references. Photos still provide no automatic measurements.
## 2026-08-20 midway-landing and two-flight check

- Enabling a landing now offers an explicit At deck or Midway choice. Midway reveals one whole-number Steps before landing field; existing v3 designs default to At deck without changing their geometry or quantities.
- With a 48-inch deck height and three steps before the landing, the measured plan and live 3D model showed three upper treads, a landing below deck elevation, and four lower treads.
- Straight, left, and right outgoing flights retain open travel paths. Desktop visual QA confirmed left and right mirror correctly and keep landing protection on the exposed sides rather than across either stair opening.
- The same midway facts produced seven total treads, four stringer paths, four stair-railing paths, eight stair-rail endpoint posts, and a separate 16-square-foot landing. Returning the same design to At deck restored two stringers and four stair-rail posts while retaining seven treads.
- Browser interaction produced no application warnings or errors. Existing responsive layout rules and touch-sized controls remain unchanged; the new location choices and exact split input use the same mobile control patterns already verified at 390 × 844.
- The narrowly revised bundle ceilings are 93 KiB for the initial entry and 230 KiB for total JavaScript gzip; measured output is 92.3 KiB and 229.3 KiB respectively.
