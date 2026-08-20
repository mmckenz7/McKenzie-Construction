# McKenzie Deck Designer — isolated R&D prototype

This browser-only prototype is intentionally isolated from McKenzie OS. It has no database, network, production route, shared-library, catalog, estimating, or authentication dependency.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL Vite prints. Use `npm run validate` for the complete deterministic, isolation, bundle-budget, and golden-fixture validation sequence.

## Current isolated prototype boundary

- Authoritative DeckDesign v3 JSON in inches with deterministic migration from local v1/v2 files
- Exact width, projection, and deck-surface elevation inputs
- Deterministic 2D plan, procedural 3D, and basic quantities
- Simple decking, joists, beam, posts, and railings
- Any-free-edge conceptual stairs with an explicit railing opening
- Deterministic conceptual stair side-stringer paths in 2D, 3D, and quantities
- Recorded grade, multiple editable house walls/attachment intent, and multiple selectable conceptual door/window openings per wall
- Optional top or midway landing with exact independent width/depth, deterministic two-flight orientation, and area
- Conceptual landing side rails, stair rails, rail posts, and outer support locations
- Command-based undo and redo
- Direct plan handles for width, projection, and L-cutout dimensions with selectable 1, 6, or 12 inch snapping
- Flexible polygon corner handles, exact corner coordinates, and repeatable rectangular offsets
- Click-to-add rectangular bumpouts with parallel outer segments, magnetic corner-axis alignment, and draggable segment handles that move both attached endpoints
- Direct stair movement along exact geometric edges with bounds and grid snapping
- Keyboard/click edge selection with contextual railing and stair actions
- Deterministic, explainable conceptual review notices
- Three generic geometry templates plus a local duplicate-design command
- Versioned rectangle, L-shape, and multi-wall/opening golden fixtures for deterministic regression checks
- Seeded generative corpus that replays 250 valid projections and 120 invalid-input rejection cases
- Orbit, pan, zoom, and camera presets
- Lazy-loaded 3D runtime with enforced initial, largest-chunk, and total JavaScript budgets
- Economy, balanced, and detailed local 3D quality tiers that never alter design facts
- Build-time isolation guard against imports outside the prototype, network calls, and environment access
- Browser local save plus JSON download/upload
- Optional six-angle plus additional-photo local intake with non-blocking coverage guidance and confirmed dimension/attachment review
- Side-by-side local photo reference and touch-capable outline tracing; only the explicitly confirmed polygon enters DeckDesign v3, while images remain session-only and never enter design JSON
- Conceptual output only; not structural engineering or construction documents

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/MASTER_SCOPE.md](docs/MASTER_SCOPE.md).
Responsive browser evidence is recorded in [docs/BROWSER_QA.md](docs/BROWSER_QA.md).
The custom-outline semantics and rejection behavior are recorded in [docs/CUSTOM_POLYGON_SPIKE.md](docs/CUSTOM_POLYGON_SPIKE.md).
The isolated v3 browser/local-state activation was controller-approved and implemented under [`docs/V3_APPLICATION_ACTIVATION_CONTRACT.md`](docs/V3_APPLICATION_ACTIVATION_CONTRACT.md). The previous v2 local value remains an untouched fallback; no shared or remote persistence was introduced.
