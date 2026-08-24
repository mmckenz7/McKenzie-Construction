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

Repository validation note: the supported webpack production build completed successfully, including TypeScript and the protected `/sales/fence-designer` route.
