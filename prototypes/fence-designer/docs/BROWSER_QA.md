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

## Pending takeoff visual QA

The Black Aluminum Materials panel has deterministic calculation and TypeScript coverage. A local browser visual-QA attempt on August 25, 2026 could not navigate back to the restarted local preview because the browser security policy blocked the local URL from its error page. No visual pass is claimed for the new panel. Required next checks are desktop and mobile layout, live recalculation after fence/gate edits, gate-opening grouping, natural-run-post versus added-end-post presentation, and console cleanliness.
