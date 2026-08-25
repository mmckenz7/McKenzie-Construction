# Controller handoff — Fence Visual Measure MVP

## Outcome

Created a usable, isolated 2D fence measurement prototype under `prototypes/fence-designer/`. It draws independently editable perimeter and divider lines around an optional exact measured house footprint. Draw continues from the last point by default, while **Separate line** starts a secondary fence anywhere and snaps its endpoints partway along existing runs without forcing a corner connection. Free angles remain the default; house and fence-run connections stay authoritative. **Close to house** redistributes correction across odd-angle corners while preserving measured fence/gate runs. The combined total includes every line exactly once. The prototype also supports locked-length line-local dragging or free point editing, optional 45°/90° assistance, exact-width single/double gates, contained wheel zoom plus dedicated/two-finger/Command-drag panning, undo/redo, and validated local JSON.

## Files and ownership

- `src/model.ts`: prototype-owned integer-millimeter document, validation, geometry, classification, and feet/inches presentation.
- `src/history.ts`: whole-document undo/redo snapshots.
- `src/storage.ts`: explicit browser-local persistence.
- `src/view.ts`: deterministic bounded focal-point zoom and viewport-to-plan pan conversion shared by buttons, wheel/trackpad, mouse drag, and touch pinch interactions.
- `src/parent-build-tooling.d.ts`: type-only declarations that let the parent Next.js check this nested package without installing prototype tooling at the repository root.
- `src/App.tsx` and `src/styles.css`: touch-friendly SVG editor and inspector.
- `src/app/sales/fence-designer/page.tsx` (repository root): thin OS route adapter that renders the prototype inside the existing protected Sales layout.
- `src/components/platform-sidebar-navigation.tsx` (repository root): adds the **Fence Measure** entry to Sales navigation.
- `tests/`: deterministic geometry, edits, totals, topology, history, serialization, and storage coverage.
- `scripts/check-isolation.mjs`: prevents source imports outside the prototype, Supabase references, environment access, and network primitives.
- `docs/ARCHITECTURE.md`: scope, measurement contract, boundary, and deferred calibration slice.
- `docs/BROWSER_QA.md`: validated interaction record.

## Migrations and shared concepts

- Migrations: none.
- Database, cloud state, environment variables, or APIs: none.
- Shared domain models: none.
- New shared architecture: none.
- Prototype document schema: local-only `FenceDesign` schema v3 with deterministic schema-v1 and schema-v2 local-storage migration. It is not proposed as an application integration contract.

## Dependencies

- Deck Designer: read-only interaction reference only; no import, copy, runtime dependency, or shared persistence.
- Estimating Core: none.
- Material Catalog: none.
- Mission Control: no data or workflow dependency. The tool uses only the existing authenticated Sales shell and shared sidebar navigation.
- Runtime packages: React and Vite within the isolated prototype; Vitest and TypeScript for validation.

## Validation

- 35 deterministic tests passed.
- Strict TypeScript passed.
- Prototype isolation guard passed.
- Prototype production build passed.
- Browser QA passed for a four-run perimeter plus two interior dividers, midpoint existing-run connections, independent line editing and totals, free-angle defaults with house/fence anchoring, multi-angle full-chain closure, exact-length solving between fixed connections, optional 45°/90° assistance, native single/double gates, Escape cancellation, contained wheel zoom, dedicated/two-finger/Command-drag pan, delete, undo/redo, local save/load, visual states, mobile layout, and console cleanliness.
- The protected OS route redirects signed-out visitors to login with the exact fence-route return path, and its designer styles are scoped to prevent changes elsewhere in OS.
- Repository lint passed with no errors (pre-existing warnings remain), and the production build passed with the supported webpack builder, including the `/sales/fence-designer` route.

## Risks and limits

- The house is a user-measured rectangular context footprint, not a building record. Non-rectangular footprints remain a later extension.
- Local-plan geometry is not a survey, legal boundary, aerial measurement, or field verification.
- On an unanchored open line, exact segment editing moves the end point along the existing bearing, so a following connected span changes visibly. When both line endpoints connect to the house or another fence run, only that line is re-solved instead.
- Mid-run divider connections are geometric anchors, not graph branches: the perimeter and divider retain separate coincident endpoint records so either line can be edited without silently changing the other's measured topology.
- House-connected exact edits preserve the house endpoint and solve the nearest angle when locked geometry can reach it. When it cannot, the editor requires an unlock or another corner adjustment rather than silently changing measurements.
- Full-chain closure requires the first fence point on the house and at least two measured runs. It preserves displayed run measurements with at most two millimeters of integer-coordinate rounding; impossible target/length combinations are rejected.
- A gate records an exact total opening width and single/double intent. “Double” does not calculate individual leaf sizes and carries no gate assembly, post, hardware, product, quantity, labor, or price rules.
- Local storage is device/browser specific and has no multi-user or cloud durability.
- The Deck photo workflow contains no reusable two-point scale calibration. Adding a background image without a trustworthy transform would weaken the measurement boundary, so it is deferred.

## Owner decisions needed later

No decision blocks the local MVP. The address/aerial/lot-line slice requires an approved imagery/geocoder provider and parcel provider, licensed credentials, and an explicit rule that parcel geometry is context rather than survey truth. Product lists and pricing should remain a later, separate work package.

## Recommended next action

Have the owner use one real farm/HOA layout to validate the naming and placement flow for perimeter versus divider lines, including a cross-fence attached a measured distance back from a corner. For the next provider-backed slice, evaluate Mapbox Standard Satellite/Search for address and imagery plus Regrid Parcel API/Tileserver for lot context, behind reviewed server-side credential handling. Keep parcel lines visibly labeled as non-survey context and require measured confirmation before they influence fence dimensions.
