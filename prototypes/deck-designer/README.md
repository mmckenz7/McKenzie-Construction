# McKenzie Deck Designer — isolated R&D prototype

This browser-only prototype is intentionally isolated from McKenzie OS. It has no database, network, production route, shared-library, catalog, estimating, or authentication dependency.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL Vite prints. Use `npm run validate` for the complete deterministic, isolation, bundle-budget, and golden-fixture validation sequence.

## Current Phase A boundary

- Authoritative DeckDesign v2 JSON in inches with deterministic migration from local v1 files
- Exact width, projection, and deck-surface elevation inputs
- Deterministic 2D plan, procedural 3D, and basic quantities
- Simple decking, joists, beam, posts, and railings
- Any-free-edge conceptual stairs with an explicit railing opening
- Deterministic conceptual stair side-stringer paths in 2D, 3D, and quantities
- Recorded grade, multiple editable house walls/attachment intent, and multiple selectable conceptual door/window openings per wall
- Optional top landing with deterministic orientation and area
- Conceptual landing side rails, rail posts, and outer support locations
- Command-based undo and redo
- Direct plan handles for width, projection, and L-cutout dimensions with selectable 1, 6, or 12 inch snapping
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
- Conceptual output only; not structural engineering or construction documents

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/MASTER_SCOPE.md](docs/MASTER_SCOPE.md).
The future custom-outline semantics are being proven separately in [docs/CUSTOM_POLYGON_SPIKE.md](docs/CUSTOM_POLYGON_SPIKE.md) before any DeckDesign version change.
