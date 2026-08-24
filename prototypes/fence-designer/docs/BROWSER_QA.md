# Browser QA

Date: 2026-08-24

Environment: local Vite development server in the Codex in-app browser.

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

Repository validation note: the default Turbopack build could not bind an internal CSS-worker port in the managed environment. The supported webpack production build completed successfully, including TypeScript and all 76 static pages.
