# McKenzie Deck Designer — isolated R&D prototype

This browser-only prototype is intentionally isolated from McKenzie OS. It has no database, network, production route, shared-library, catalog, estimating, or authentication dependency.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL Vite prints. Use `npm test` and `npm run build` for validation.

## Current Phase A boundary

- Authoritative, versioned rectangle or parametric L-shape design JSON in inches
- Exact width, projection, and deck-surface elevation inputs
- Deterministic 2D plan, procedural 3D, and basic quantities
- Simple decking, joists, beam, posts, and railings
- Any-free-edge conceptual stairs with an explicit railing opening
- Optional top landing with deterministic orientation and area
- Conceptual landing side rails, rail posts, and outer support locations
- Command-based undo and redo
- Direct plan handles for width, projection, and L-cutout dimensions with selectable 1, 6, or 12 inch snapping
- Keyboard/click edge selection with contextual railing and stair actions
- Deterministic, explainable conceptual review notices
- Three generic geometry templates plus a local duplicate-design command
- Versioned rectangle and L-shape golden fixtures for deterministic regression checks
- Orbit, pan, zoom, and camera presets
- Lazy-loaded 3D runtime with enforced initial, largest-chunk, and total JavaScript budgets
- Browser local save plus JSON download/upload
- Conceptual output only; not structural engineering or construction documents

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/MASTER_SCOPE.md](docs/MASTER_SCOPE.md).
