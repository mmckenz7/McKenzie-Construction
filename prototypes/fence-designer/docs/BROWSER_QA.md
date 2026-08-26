# Browser QA

Date: 2026-08-24

Environment: local Vite development server and local McKenzie OS development server in the Codex in-app browser.

Validated workflow:

1. Opened an empty local design and placed three connected points.
2. Confirmed two visible spans, one corner, two open endpoints, and a deterministic 50′ 0″ total.
3. Selected the first span, set it to exactly 30′ 6″, and confirmed the connected following span and total recalculated.
4. Marked that whole span as gate intent and confirmed distinct line, label, inspector, and aggregate gate feedback.
5. Saved locally, used undo/redo, and loaded the saved revision back from local browser storage.
6. Dragged the shared corner and confirmed both connected measurements updated; undo restored the prior dimensions.
7. Deleted the shared corner and confirmed the path reconnected as one span; undo restored both spans and their prior gate intent.
8. Tested at a 390 × 844 viewport. The page had no horizontal overflow, the canvas and inspector stacked, and every toolbar control measured 44 px high.
9. Checked browser console warnings and errors: none.
10. Added a 42′ 6″ × 30′ 0″ house footprint, edited its exact dimensions, and confirmed it remained excluded from fence totals.
11. Toggled snap off/on and confirmed the visible mode and millimeter/grid behavior.
12. With snap on, placed a fence point near the middle of the house's top edge and confirmed its accepted plan coordinate landed exactly on that edge (`yMm = 0`).
13. Confirmed the house footprint, midpoint connection path, controls, labels, and selection feedback were visually clear, then removed all QA measurements from the open design.
14. Confirmed the embedded OS route is registered at `/sales/fence-designer`, is visible as **Fence Measure** in Sales navigation, and redirects signed-out visitors to `/login?next=%2Fsales%2Ffence-designer`.
15. Confirmed the scoped designer stylesheet still renders the full desktop workspace correctly without applying its generic button, input, or layout rules outside the designer root.
16. Confirmed **Zoom In** changed the plan from 100% to 125% around its center and **Zoom Out** remained available beside a visible scale readout.
17. Confirmed dragging in dedicated **Pan** mode shifted the plan view without changing its scale or moving a fence point.
18. Confirmed mouse-wheel/trackpad input zoomed around the pointer location; deterministic tests cover the same focal-point math, zoom clamps, aspect ratio, and pan conversion used by two-finger pinch navigation.
19. After placing a start point, confirmed a dashed prospective run followed the pointer and continuously displayed its current feet/inches before placement.
20. At the same pointer position, confirmed **Snap on** locked the prospective run to a horizontal 45-degree increment while **Snap off** followed the free pointer bearing; the live accessible measurement changed from 28′ 10″ to 28′ 11″.
21. Selected the start point of a 37′ 0″ fence run, opened **Add gate**, chose **Double gate**, entered a 10′ 0″ total width, and confirmed the run split into a labeled 10′ 0″ double-gate opening plus 27′ 0″ of fence while the total remained 37′ 0″.
22. Confirmed the created gate remains selectable and its single/double intent can be edited without introducing products or pricing.
23. Drew two 18′ 0″ runs, dragged their shared corner with **Lengths** locked, and confirmed both measurements stayed 18′ 0″ while the shared corner rotated and the following endpoint translated with it.
24. Turned **Lengths** off, dragged the same corner independently, and confirmed the following endpoint stayed fixed while the two adjacent measurements changed to 18′ 8″ and 26′ 3″.
25. Confirmed **Free angle** is the default and 45°/90° assistance is explicitly optional.
26. Scrolled the wheel over the plan and confirmed plan scale changed from 100% to 162% while the surrounding page remained at `scrollY = 0`.
27. Pressed Escape while Draw was active and confirmed the editor returned to neutral Edit state, cleared the selection/preview, and displayed a cancellation message.
28. Command-dragged in neutral Edit state and confirmed the view box panned while the stored point coordinate remained unchanged. The same navigation path accepts two simultaneous touch pointers for pan/pinch without placing a point.
29. Deterministic geometry tests confirm a house-connected exact-length edit keeps the house endpoint fixed, preserves the preceding locked run, selects the nearest valid angle solution, and rejects unreachable locked geometry.
30. With free angle active, placed the first point on a 40′ × 20′ house edge, drew three odd-angle spans measuring 15′ 4″, 24′ 8″, and 24′ 7″, chose **Close to house**, and tapped the second house edge.
31. Confirmed closure moved the flexible corners, fixed both house connections, and retained all three displayed measurements plus the 64′ 7″ total.
32. Confirmed the closure success message, enabled endpoint gate workflow, and zero browser console errors.
33. Drew a four-span farm-field perimeter, then used **Separate line** twice to add two cross-fences and create three independently measured fence lines.
34. Started the first divider 5′ back from the perimeter corner and confirmed its exact projected coordinate attached partway along the existing run rather than jumping to the last corner.
35. Ended both dividers on the opposite perimeter run, confirmed all four divider endpoints displayed as connected, and confirmed the combined total increased from 183′ 10″ to 249′ 8″ without altering a perimeter span.
36. Confirmed six spans, three fence lines, deterministic independent-line geometry, and zero browser console errors.
37. Opened **Site walk** in the browser, visually reviewed the panel, and verified the responsive mobile rules stack its mark, separate-line, correction, and finish controls into full-width touch targets.
38. Confirmed Site Walk does not request location when the panel opens, requests a fresh position only from the explicit mark action, and presents a useful browser permission/availability failure without changing the design.
39. Confirmed **KGIS** opens a separate reference panel, validates an address locally, and builds an official KGIS aerial/address link without importing GIS geometry into the plan or totals.
40. Opened the new **Property** panel and confirmed Acres, KGIS, and Google reference actions remain explicit user actions with no automatic request.
41. Uploaded a local PNG through the visible file chooser and confirmed it rendered below the grid and measured geometry without changing the 0′ 0″ total or document revision.
42. Confirmed independent visibility controls for the reference image, grid, house, and dimension labels; hiding and restoring the image did not remove or mutate it.
43. Entered a known 40′ 0″ distance, picked two canvas points, and confirmed the image calibrated with a clear success notice while fence geometry remained unchanged.
44. Rotated the image 12°, locked it, and confirmed calibration and position controls became disabled while opacity and layer visibility remained usable.
45. Drew an 18′ 2″ fence run over the calibrated locked image and confirmed the reference layer remained visible and excluded from the measured total.
46. Tested the Property panel at a 390 × 844 viewport. Controls stacked to full width, the plan remained 359 px wide, and the document had no horizontal overflow.
47. Checked browser console errors after upload, calibration, layer toggling, locking, rotation, and fence drawing: none.
48. Confirmed the desktop Property panel makes **Capture map tab** and **Paste image** primary actions, leaves file upload as a fallback, and explains the Acres/KGIS tab-picker and screenshot shortcuts without requiring saved files.
49. Pasted an image directly from the browser clipboard, confirmed it was compressed and rendered as the reference layer, then used **Save local**, refreshed, and used **Load local** to restore the image and its transform on the same device.
50. Confirmed removing the reference clears its separate local record without changing the fence design, totals, or revision.
51. Drew a live 32′ 3″ run and confirmed its changing value appeared in a fixed top-right measurement card while the dashed run, target point, and plan remained unobstructed.
52. Placed the run and confirmed the live card disappeared at the zero-length continuation state, while the completed 32′ 3″ label appeared beside the run with a leader rather than covering the fence line.
53. Zoomed to 211% and confirmed the completed dimension retained a compact, readable screen size and offset with zero browser console errors.
54. Created three closely packed single-gate spans and confirmed their wide labels automatically distributed above, beside, and below the geometry without overlapping.
55. Selected a crowded gate, used **Flip dimension side**, and confirmed its label stayed on the requested side while moving farther out to avoid its neighbors; geometry, totals, and revision remained unchanged.
56. Drew a three-span shape against the top of the visible plan and confirmed automatic labels stayed on-canvas while choosing clear sides around the runs.
57. Flipped a selected dimension, confirmed **Auto-position dimension** appeared, used it, and confirmed the manual override disappeared, the label returned to deterministic placement, and geometry, totals, and revision remained unchanged.
58. Checked browser logs after edge-aware placement and the flip/reset flow: no application warnings or errors.

Repository validation note: the supported webpack production build completed successfully, including TypeScript and the protected `/sales/fence-designer` route.

## Takeoff visual QA — 2026-08-25

59. Built a two-span, one-corner layout and confirmed the Black Aluminum panel showed 46′ 4″ of fence, seven panels, two end posts, one corner post, and five run posts.
60. Enabled **Show takeoff on plan** and confirmed seven labeled panel spans plus eight post markers matched the panel and post totals. Full and cut panels and end/corner/run posts used distinct labels, colors, and legend entries.
61. Confirmed the screen-reader status announced the same panel/post counts and individual SVG markers exposed descriptive image labels.
62. Converted the 28′ 2″ span to a single gate and confirmed the takeoff recalculated live to 18′ 2″ of fence, three panels, one single gate, two hinges, one latch, and no center drop pole. The grouped 28′ 2″ gate opening appeared without a reload.
63. Hid and restored the plan takeoff and confirmed the overlay was removed/restored while the `FenceDesign` revision remained 4 in both states.
64. Tested the open Materials panel and takeoff overlay at 390 × 844. Summary cards and three takeoff sections stacked to one column, the plan remained 359 px wide, all buttons remained at least 44 px high, the legend wrapped, and the document had no horizontal overflow.
65. Checked browser console warnings and errors after desktop rendering, live gate recalculation, takeoff toggling, and mobile resizing: none.
66. Expanded **Review panel and post decisions** and confirmed two straight runs were listed as `8′ 0″ full + 8′ 0″ full + 8′ 0″ full + 4′ 2″ cut` and `8′ 0″ full + 8′ 0″ full + 2′ 2″ cut`, matching the `R1` and `R2` plan markers.
67. Confirmed the post audit grouped two open ends, one corner, and five standard panel boundaries, while each plan post exposed its type and calculation reason to assistive technology.
68. Added one divider at a feasible natural boundary and confirmed **Run post shared with divider** appeared. Added a second divider at a non-natural boundary and confirmed **Added end post at divider** appeared without changing the perimeter panel arrangement.
69. Tested the expanded audit at 390 × 844. The two decision sections stacked to one column inside a 313 px card, the disclosure control stayed 44 px high, the plan remained available below it, the document had no horizontal overflow, and browser console warnings/errors remained empty.
70. Confirmed **Copy takeoff** is disabled for an empty layout, becomes enabled after measured spans exist, invokes the browser clipboard, and presents a success notice that reiterates the no-products/no-pricing boundary.
71. The browser harness's inspection clipboard is isolated from the page clipboard and returned no page-written payload, so no browser-level payload-read claim is made. An exact deterministic unit test verifies the full copied report string, including totals, panel layout, post decisions, gate/hardware sections, and the preliminary boundary.
72. Tested **Copy takeoff** at 390 × 844. It rendered as a 196 × 44 px control in the stacked Materials heading, the document remained horizontally contained, and browser console warnings/errors remained empty.
73. Placed a new line from a non-grid-aligned first point with 45°/90° assistance enabled and confirmed the next point aligned from that exact first point rather than from the screen grid.
74. Used the always-available toolbar grid control to hide and restore the grid; the measured design revision, coordinates, and total remained unchanged.
75. Confirmed the deterministic takeoff regression for two independent straight lines containing one single and one double non-corner gate: four open endpoints plus four gate sides produce eight end posts and no false corner posts.
76. Drew an arbitrary 15.64° first run, enabled relative angle assistance, and confirmed the following run continued at the same 15.64° bearing instead of snapping to a screen-axis angle.
77. Clicked the middle of that fence run, opened **Add gate to this run**, chose a 4′ 0″ double gate, and confirmed the default position was 50% with an adjustable position control.
78. Placed the gate and confirmed the fence/gate/fence intervals remained collinear, the gate measured 4′ 0″, the combined layout stayed 44′ 4″, and the revision advanced exactly once.
79. Tested the inline gate editor at 390 × 844: the position slider and placement button were each 285 × 44 px, the 359 px inspector stayed contained, document width remained below the 390 px viewport, and browser warnings/errors remained empty.
80. On an exact 26′ 0″ run, placed a 10′ 0″ double gate and opened Materials. The summary updated immediately to 16′ 0″ of fence and four total 8′ panels, explicitly broken into two fence-run panels plus two gate-fabrication panels; revision remained 4 and browser warnings/errors were empty.
81. Deterministic boundary coverage confirms a 6′ 0″ double gate uses one fabrication panel and a 7′ 0″ double gate uses two; widths over 6′ 0″ follow the two-panel rule.
82. Deterministic whole-job width packing with the 7′ usable limit confirms 2′ + 2′ + 3′ single gates use one 8′ fabrication panel, while 2′ + 3′ + 3′ single gates require two. This width-based optimization remains separate from fence-run and double-gate panels.
83. On an exact 20′ 0″ run, entered a 4′ 0″ single gate after exactly 7′ 0″ of fence. The selected gate reported **Fence from previous post · 7′ 0″**, and Materials immediately reported 16′ 0″ of fence with four total panels: three fence panels plus one gate-fabrication panel. Browser warnings/errors remained empty.
84. Opened **Review panel and post decisions** for that layout and confirmed the visual audit listed 7′ 0″ before-gate fence, 8′ 0″ + 1′ 0″ after-gate fence, one gate fabrication panel with a 4′ 0″ single-gate cut and 3′ 0″ waste, plus two open-end posts, two gate-side end posts, and one standard panel-boundary post.
85. Tested the expanded three-section cut-plan audit at 390 × 844. It collapsed to one 283 px column inside a 313 px card, the document remained below the 390 px viewport, and browser warnings/errors remained empty.
86. Opened Materials on an empty design, selected **Treated pine privacy**, and confirmed the complete no-pricing material summary replaced the aluminum presentation without changing the measurement document.
87. Confirmed the treated-pine summary exposes purchased 1×6×6 pickets, combined 2×4×8 rails/gate frames, treated 4×4 posts, 50 lb concrete, installed fence/gate pickets, picket screws, and two-hinges-per-leaf gate hardware with the 10% lumber-waste rule visible.
88. Uploaded a harmless local reference image and confirmed **Trace 4 house corners** appeared inside the existing local-reference workflow.
89. Marked four corners in order. The first traced wall produced a -12.16° reference correction, a 37′ 2″ × 38′ 4″ axis-aligned house footprint, one undoable design revision, and no fence point or fence length change.
90. At 390 × 844, the house-trace control remained visible and the document stayed within the viewport with no horizontal overflow.
91. Opened Materials before drawing and confirmed the fence-type selector and calculations were absent; the panel instructed the user to use the same drawing tools for every material.
92. Drew one shared measured line, confirmed the layout revision, and verified the material selector appeared only afterward.
93. Measured the first visible point marker before and after two zoom-in actions. Its screen radius remained exactly 6.862 px at both zoom levels instead of growing with the plan.
94. Undid the measured line after confirmation and verified the material selector disappeared and **Confirm layout for takeoff** returned. Browser warnings and errors remained empty.
95. Treated Pine Privacy now displays separate picket, rail-to-post structural, and gate-frame structural screw quantities plus an explicit included-hardware-fastener assumption; deterministic tests cover fence-only, single-gate, and double-gate totals.
96. Opened focused Site Walk at 390 × 844 and confirmed only plan zoom, Finish Walk, the GPS workflow, and the plan remained visible. The header, footer, unrelated toolbar actions, Materials/Property panels, and empty inspector were removed from the field view without changing design state.
97. At 375 × 667, the primary mark action remained visible at 52 px high and 320 px wide, the plan retained a 374 px-high viewport, document width stayed inside the phone viewport, and browser warnings/errors remained empty.
98. At 844 × 390 landscape, the three walk actions shared one compact row above a 500 px-high plan, the header/footer remained hidden, the document had no horizontal overflow, and the later field-test revision removed the redundant toolbar finish action.
99. Reproduced the one-point iPhone field-test presentation at 390 × 844 and revised focused Site Walk so the toolbar contains only zoom, the panel contains one **End site walk** action, the active GPS status remains visible at 335 px wide, and a GPS mark no longer opens the point inspector. Browser warnings/errors remained empty.
100. Deterministic GPS coverage confirms later marks ignore an identical cached coordinate, accept the next watched fix after real movement, clear the active watch, and return an explicit previous-position message when only one-shot geolocation is available.
101. The rectangular-patio field result exposed accumulated-origin drift: a corrected 20′ leg followed by later absolute-origin GPS projections could produce a false 77′ 5″ return. Site Walk now projects every new raw GPS delta from the latest corrected plan endpoint; deterministic coverage verifies a corrected endpoint translates the next projected leg exactly.
102. Site Walk now exposes **90° corners** beside the mark control. In this mode GPS chooses only the rough turn direction, continuing legs snap in 90° increments relative to the previous segment, and **Mark next fence point** remains disabled until **Use exact length** confirms the current leg.
103. Deterministic acquisition coverage confirms Site Walk retains the best watched fix, reports improving accuracy, accepts an early fix at 5 meters or better, uses a best rough fix within the 15-meter ceiling only at timeout, and rejects the observed ±112-foot class of fix without changing geometry.
104. The Safari field retry exposed a non-recovering disabled acquisition control despite Precise Location being enabled. The mark action now stays tappable as a 20-second **Cancel GPS lock** countdown, canceling clears the active position watch deterministically, and ending Site Walk or loading a design aborts any outstanding request without adding geometry.
105. The next Safari field screenshot exposed its native-receiver requirement: calling a detached `Geolocation.watchPosition` produced “Can only call Geolocation.watchPosition on instances of Geolocation.” GPS watch and clear operations now preserve the provider receiver, with a deterministic regression test that fails when either method is detached.
106. Real phone testing established that even the repaired consumer-GPS workflow is not trustworthy for 20–40-foot residential layouts. Site Walk was removed from the primary toolbar while its isolated research implementation and tests were retained; no measurement schema or provider boundary changed.
107. Opened **Quick layout** at 390 × 844 and confirmed it identifies the selected/latest open endpoint, exposes deterministic examples, remains horizontally contained, and makes no network or provider request.
108. Started an empty layout from Quick Layout, chose **Eyeball next point**, and confirmed the command card cleared the plan for one tap, returned after the tap with the new endpoint selected, and did not accidentally apply a command beneath the tap.
109. Entered `south 20 ft`, `right 90, 40 ft`, and `right 90, 20 ft`. Each instruction rendered a dashed exact preview before application, produced 20′ 0″, 40′ 0″, and 20′ 0″ segments, and yielded the exact combined 80′ 0″ total in the shared drawing.
110. Switched from those exact commands back to **Eyeball next point**, placed an arbitrary angle, and confirmed Quick Layout immediately resumed from that graphical endpoint with the same selection and undo history.
111. At 390 × 844, the compact bottom command card kept its input, add action, horizontal examples/history, status, and graphical/gate/closure actions usable without horizontal overflow. Browser warnings and errors remained empty.
112. Reproduced the released Quick Layout gate detour at 390 × 844: after an exact 24′ 0″ run, the gate shortcut was disabled because the selected item was the endpoint even though the entering fence run was unambiguous.
113. Updated the shortcut to **Gate on last run** and confirmed it opened the existing exact gate editor directly from that endpoint. The editor defaulted to the 12′ midpoint of the 24′ run and retained all existing single/double, width, and fence-before-gate controls.
114. Placed a 4′ 0″ single gate after exactly 8′ 0″ of fence. The plan remained collinear at 8′ fence + 4′ gate + 12′ fence, the combined total stayed 24′ 0″, and the selected gate reported 8′ 0″ from the previous post.
115. Undid and redid that gate insertion. Undo restored the original 24′ fence run; redo restored the exact gate. Confirmed Black Aluminum takeoff then reported 20′ fence, three fence panels, one gate-fabrication panel, four end posts, one run post, two hinges, and one latch.
116. At 390 × 844, the direct gate flow remained horizontally contained (`scrollWidth` 375 within a 390-pixel viewport) with no browser warnings or errors. Escape closed Quick Layout and cleared an unfinished command without changing geometry.

## Gate measurement-origin QA — 2026-08-26

117. Created an exact 24′ 0″ Quick Layout run and opened **Gate on last run** at 390 × 844. The selected run displayed matched **A** and **B** endpoint markers on the plan and the editor exposed native **Post A** / **Post B** pressed-state buttons.
118. Selected Post B and confirmed the heading changed to **Distance from Post B to nearest gate edge** while the design remained at revision 2. Switching back and forth changed only transient editor state and did not move or revise the fence.
119. Entered a 4′ 0″ single gate exactly 3′ 0″ from Post B. The committed plan remained collinear at 17′ 0″ fence + 4′ 0″ gate + 3′ 0″ fence, retained the exact 24′ 0″ total, and advanced exactly once to revision 3.
120. Undid and redid the gate insertion, then saved it locally, undid it, and loaded the saved design. Each path restored the same canonical gate geometry without persisting a Post A/Post B editor choice.
121. At 390 × 844, both reference buttons measured 145 × 46 px, both endpoint markers remained visible, document width stayed at 375 px with no horizontal overflow, and browser warnings/errors remained empty. The selector is a native fieldset with native buttons, visible pressed state, explicit input labels, and normal keyboard semantics.
