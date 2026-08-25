# Controller handoff — Fence Visual Measure MVP

## Outcome

Created a usable, isolated 2D fence measurement prototype under `prototypes/fence-designer/`. It draws independently editable perimeter and divider lines around an optional exact measured house footprint. Live drawing length stays in a dedicated canvas card; completed dimensions sit beside their runs with leaders, deterministic collision avoidance, optional manual side flipping, and a zoom-stable visual size. **Site walk** converts explicit tap-to-mark phone GPS fixes into a private local plan, supports a separate-line-next field action, reports phone accuracy, and lets the user immediately replace the latest GPS-shaped distance with an authoritative tape/wheel/laser length. Raw latitude/longitude never enters the design or storage. **Property** provides explicit Acres, KGIS, and Google reference launches plus desktop tab capture, direct clipboard-image paste, and file-upload fallback. Captured images are compressed locally, can be calibrated, positioned, faded, and locked, and persist only through the explicit browser-local save action. Reference context stays outside measured geometry. Existing Draw, closure, gate, navigation, history, and local-save workflows remain intact.

## Files and ownership

- `src/model.ts`: prototype-owned integer-millimeter document, validation, geometry, classification, and feet/inches presentation.
- `src/history.ts`: whole-document undo/redo snapshots.
- `src/storage.ts`: explicit browser-local design persistence plus separately validated compressed-reference persistence.
- `src/view.ts`: deterministic bounded focal-point zoom and viewport-to-plan pan conversion shared by buttons, wheel/trackpad, mouse drag, and touch pinch interactions.
- `src/gps.ts`: deterministic local GPS projection, explicit high-accuracy browser request, error mapping, and accuracy presentation.
- `src/kgis.ts`: validated official KGIS address-link builder.
- `src/property-reference.ts`: validated official Acres, KGIS, and Google reference destinations with no provider fetch.
- `src/background.ts`: deterministic reference-image fit, calibration, move, and rotation math.
- `src/reference-image.ts`: browser-local display capture, clipboard reading, image compression, and permission/error messages.
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

- 59 deterministic tests passed.
- Strict TypeScript passed.
- Prototype isolation guard passed.
- Prototype production build passed.
- Browser QA passed for automatic dimension collision avoidance, manual side flipping, the dedicated live measurement card, offset completed dimensions, zoom-stable labels, desktop tab-capture controls, direct clipboard-image paste, same-device reference save/load, file-upload fallback, 40-foot two-point calibration, independent layers, opacity/rotation/movement/locking, mobile layout, drawing over a locked reference, Site Walk panel behavior and permission failure handling, KGIS reference lookup, a four-run perimeter plus two interior dividers, midpoint connections, independent line editing and totals, free-angle defaults, full-chain closure, exact-length solving, optional angle assistance, native gates, Escape cancellation, contained zoom/pan, local save/load, and console cleanliness.
- The protected OS route redirects signed-out visitors to login with the exact fence-route return path, and its designer styles are scoped to prevent changes elsewhere in OS.
- Repository lint passed with no errors (pre-existing warnings remain), and the production build passed with the supported webpack builder, including the `/sales/fence-designer` route.

## Risks and limits

- The house is a user-measured rectangular context footprint, not a building record. Non-rectangular footprints remain a later extension.
- Local-plan geometry is not a survey, legal boundary, aerial measurement, or field verification.
- Consumer phone GPS can drift by several feet or more, especially near buildings, trees, or poor sky view. The UI displays the phone's accuracy estimate and never promotes GPS-derived run length over an entered field measurement.
- KGIS publishes useful parcel, address, building-footprint, and aerial context, but its raw ArcGIS endpoint returned HTTP 401 outside the KGIS viewer during compatibility testing. This slice links only to the official viewer. Automatic geometry import requires KGIS-approved access plus a reviewed server adapter; do not add credentials or a client-side bypass.
- On an unanchored open line, exact segment editing moves the end point along the existing bearing, so a following connected span changes visibly. When both line endpoints connect to the house or another fence run, only that line is re-solved instead.
- Mid-run divider connections are geometric anchors, not graph branches: the perimeter and divider retain separate coincident endpoint records so either line can be edited without silently changing the other's measured topology.
- House-connected exact edits preserve the house endpoint and solve the nearest angle when locked geometry can reach it. When it cannot, the editor requires an unlock or another corner adjustment rather than silently changing measurements.
- Full-chain closure requires the first fence point on the house and at least two measured runs. It preserves displayed run measurements with at most two millimeters of integer-coordinate rounding; impossible target/length combinations are rejected.
- A gate records an exact total opening width and single/double intent. “Double” does not calculate individual leaf sizes and carries no gate assembly, post, hardware, product, quantity, labor, or price rules.
- Local storage is device/browser specific and has no multi-user or cloud durability.
- The local reference is stored separately from design JSON and only after explicit **Save local**. Browser storage is device/profile specific and quota-limited; a large or storage-blocked capture can fail, in which case the fence design remains unchanged and the UI reports the failure.
- Tab capture requires a supporting desktop browser and a user choice in the browser's display picker. Clipboard paste requires browser clipboard permission. File upload remains the fallback; none of the three paths uploads imagery to McKenzie OS.
- Acres Plus provides visual parcel context but no supported KML/API geometry export. The prototype opens Acres for manual reference and does not scrape it.
- Google Earth imagery cannot be uploaded into this commercial web tool. Google Maps remains an external visual reference until a licensed Google Maps Platform integration is approved.

## Owner decisions needed later

No decision blocks Site Walk or the official KGIS reference launch. Automatic KGIS parcel/building overlay remains blocked on KGIS-approved programmatic access, licensing/attribution review, and a reviewed server-side integration boundary. Product lists and pricing remain a later, separate work package.

## Recommended next action

Walk one real property with Site Walk, recording the phone-reported accuracy and the difference between every GPS distance and field measurement. In parallel, contact KGIS for approved service access and terms covering address, parcel polygon, building footprint, and imagery use. Only after that answer should the Controller choose direct KGIS integration or a reviewed Mapbox/Regrid fallback. Any imported parcel/building layer must remain reference-only until measured confirmation.
