# Controller handoff — Fence Visual Measure MVP

## Outcome

Created a usable, isolated 2D fence measurement prototype under `prototypes/fence-designer/` with one synchronized graphical/exact-command layout workflow and selectable no-pricing **Black Aluminum** and **Treated Pine Privacy** takeoffs. **Quick layout** accepts one deterministic run at a time, previews it on the plan, and applies it from the selected/latest open endpoint through the same geometry and undo history as Draw. Unknown angles can be tapped visually, after which command input resumes from that new point. This adds no AI, CAD import, network, provider, or parallel geometry model. Consumer-phone Site Walk was removed from the primary toolbar after real-world short residential tests proved its direction/distance unreliable; its isolated research code remains without promotion into the recommended workflow. All materials continue to use the same authoritative material-agnostic drawing.

## Files and ownership

- `src/model.ts`: prototype-owned integer-millimeter document, validation, geometry, classification, and feet/inches presentation.
- `src/history.ts`: whole-document undo/redo snapshots.
- `src/storage.ts`: explicit browser-local design persistence plus separately validated compressed-reference persistence.
- `src/view.ts`: deterministic bounded focal-point zoom, viewport-to-plan pan conversion, and edge/run-aware dimension-label placement.
- `src/takeoff.ts`: pure derived Black Aluminum and Treated Pine Privacy takeoffs plus the shared read-only visual bay/post projection.
- `src/map-contract.ts`: plain normalized-coordinate renderer contract, lifecycle/offline harness, separately confirmed address selection, and base/overlay layer registry.
- `src/measurement-provenance.ts`: explicit source, capture-context, verification, observation, correction, and reported-accuracy matrix including Moasure.
- `src/gps.ts`: deterministic local GPS projection, bounded 20-second best-fix acquisition, explicit high-accuracy browser request, poor-fix rejection, error mapping, and accuracy presentation.
- `src/kgis.ts`: validated official KGIS address-link builder.
- `src/property-reference.ts`: validated official Acres, KGIS, and Google reference destinations with no provider fetch.
- `src/background.ts`: deterministic reference-image fit, calibration, move, rotation, and four-corner house-straightening math.
- `src/reference-image.ts`: browser-local display capture, clipboard reading, image compression, and permission/error messages.
- `src/run-command.ts`: deterministic one-run cardinal/relative-turn parsing and integer-millimeter endpoint projection.
- `src/parent-build-tooling.d.ts`: type-only declarations that let the parent Next.js check this nested package without installing prototype tooling at the repository root.
- `src/App.tsx` and `src/styles.css`: touch-friendly SVG editor and inspector.
- `src/app/sales/fence-designer/page.tsx` (repository root): thin OS route adapter that renders the prototype inside the existing protected Sales layout.
- `src/components/platform-sidebar-navigation.tsx` (repository root): adds the **Fence Measure** entry to Sales navigation.
- `tests/`: deterministic geometry, edits, totals, topology, history, serialization, and storage coverage.
- `scripts/check-isolation.mjs`: prevents source imports outside the prototype, Supabase references, environment access, and network primitives.
- `docs/ARCHITECTURE.md`: scope, measurement contract, boundary, and deferred calibration slice.
- `docs/BROWSER_QA.md`: validated interaction record.
- `docs/PROVIDER_EVIDENCE_MATRIX.md`: blank pass/fail, imagery, interaction, accessibility, terms, cost, and replacement/offline spike template.

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

- 111 deterministic tests passed, including five exact-command parser/projection tests, fifteen Black Aluminum tests, five Treated Pine/shared-drawing tests, eleven GPS tests, five local-reference transform tests, twenty-nine geometry/model tests, and thirteen renderer/address/layer/provenance contract tests.
- Strict TypeScript passed.
- Prototype isolation guard passed.
- Prototype production build passed.
- Browser QA passed for the full measurement workflow and the Materials audit layer on desktop and phone viewports. At 390 × 844, Quick Layout created an exact 20′–40′–20′ three-run shape, previewed every run, switched to a one-tap graphical angle and back without losing the endpoint, and stayed horizontally contained. Focused Site Walk was previously verified at 375 × 667, 390 × 844, and 844 × 390, but real-world phone testing established that consumer GPS is not adequate for the short-run residential workflow and it is now hidden from the primary toolbar. Previous-segment-relative angle assistance, inline gate placement, the independent grid toggle, live takeoff recalculation, overlay/revision isolation, accessible summary/markers, and console cleanliness were also confirmed.
- The protected OS route redirects signed-out visitors to login with the exact fence-route return path, and its designer styles are scoped to prevent changes elsewhere in OS.
- Repository lint passed with no errors (pre-existing warnings remain), and the production build passed with the supported webpack builder, including the `/sales/fence-designer` route.

## Risks and limits

- The house is a user-measured rectangular context footprint, not a building record. Non-rectangular footprints remain a later extension.
- Local-plan geometry is not a survey, legal boundary, aerial measurement, or field verification.
- Consumer phone GPS can drift by several feet or more, especially near buildings, trees, or poor sky view. Real field results were unusable for 20–40-foot residential runs, so Site Walk is no longer a primary toolbar action. Its retained experimental code does not make it an accepted measurement method. A future hardware capture tier must preserve explicit provenance and never promote its result over field-verified geometry.
- KGIS publishes useful parcel, address, building-footprint, and aerial context, but its raw ArcGIS endpoint returned HTTP 401 outside the KGIS viewer during compatibility testing. This slice links only to the official viewer. Automatic geometry import requires KGIS-approved access plus a reviewed server adapter; do not add credentials or a client-side bypass.
- On an unanchored open line, exact segment editing moves the end point along the existing bearing, so a following connected span changes visibly. When both line endpoints connect to the house or another fence run, only that line is re-solved instead.
- Mid-run divider connections are geometric anchors, not graph branches: the perimeter and divider retain separate coincident endpoint records so either line can be edited without silently changing the other's measured topology.
- House-connected exact edits preserve the house endpoint and solve the nearest angle when locked geometry can reach it. When it cannot, the editor requires an unlock or another corner adjustment rather than silently changing measurements.
- Full-chain closure requires the first fence point on the house and at least two measured runs. It preserves displayed run measurements with at most two millimeters of integer-coordinate rounding; impossible target/length combinations are rejected.
- A gate records an exact total opening width and single/double intent. The derived Black Aluminum takeoff uses that intent only for the owner-supplied post and basic hardware counts. “Double” does not calculate individual leaf sizes or select a gate assembly, reinforced post, product, labor, or price.
- Black Aluminum takeoff is preliminary and derived. A mid-run divider/T connection shares a run post when it lands on a feasible natural panel boundary measured from either end; otherwise it adds an end post without changing the perimeter panel count. Panel height/style, reinforced gate-post requirements, concrete, caps, fasteners, waste, product selection, and pricing are not yet defined.
- Treated Pine Privacy is also preliminary and derived. Its ballpark fastener defaults are six picket screws per installed picket, 12 rail-to-post structural screws per bay, and 12 gate-frame structural screws per leaf; hinge, latch, and drop-rod mounting fasteners are assumed included with those items. Board grade, post stock length, concrete engineering/yield, caps/trim, product selection, labor, and pricing are not yet defined.
- Manual house straightening assumes the marked footprint is adequately rectangular and uses averaged opposite edges. It must occur before fence points exist and remains reference geometry, not an automatic building record or survey.
- The provider-neutral contract is a tested prototype boundary, not a provider selection or persisted shared-domain implementation. Google is only a later third spike candidate. No provider SDK, key, environment variable, billing, map ID, geocoder, cloud resource, or provider object was added. Formal provenance attachment to accepted persistent geometry still requires Controller alignment with the shared Fence domain contract.
- Local storage is device/browser specific and has no multi-user or cloud durability.
- The local reference is stored separately from design JSON and only after explicit **Save local**. Browser storage is device/profile specific and quota-limited; a large or storage-blocked capture can fail, in which case the fence design remains unchanged and the UI reports the failure.
- Tab capture requires a supporting desktop browser and a user choice in the browser's display picker. Clipboard paste requires browser clipboard permission. File upload remains the fallback; none of the three paths uploads imagery to McKenzie OS.
- Acres Plus provides visual parcel context but no supported KML/API geometry export. The prototype opens Acres for manual reference and does not scrape it.
- Google Earth imagery cannot be uploaded into this commercial web tool. Google Maps remains an external visual reference until a licensed Google Maps Platform integration is approved.

## Owner decisions needed later

For the later renderer spike, the owner must explicitly authorize one restricted non-Production browser key; a named monthly cap, quotas, alerts, and billing owner; and an approved deidentified Knoxville-area evaluation set. This does not select Google.

Recommended concrete Google-candidate guardrails are a one-month maximum of **2,000 Dynamic Map loads and 500 geocodes**, with an expected provider cost of **$0** because each is below the current 10,000-event monthly no-cost allowance. Set a **$10 gross monthly spend cap** if Maps Platform is eligible for the account's project/service spend-cap control; otherwise the spike must not begin until an equivalent enforced stop is approved. Set usage alerts at 50%, 80%, and 100% of each maximum (1,000/1,600/2,000 map loads and 250/400/500 geocodes), billing alerts at $5/$8/$10, and low spike-only rate quotas of 10 map loads and 10 geocodes per minute where the Cloud quota surface permits. The billing owner must stop the spike at either 100% usage threshold even if the free allowance remains. Reconfirm [current Maps pricing](https://developers.google.com/maps/billing-and-pricing/pricing), [quota controls](https://developers.google.com/maps/documentation/javascript/usage-and-billing), and [spend-cap eligibility](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps) immediately before authorization.

Black Aluminum reinforced gate-post requirements and cutoff-reuse policy still need owner confirmation before this takeoff can be called final. Automatic KGIS parcel/building overlay remains blocked on KGIS-approved programmatic access, licensing/attribution review, and a reviewed server-side integration boundary. Product lists and pricing remain a later, separate work package.

## Recommended next action

The neutral contract is accepted. The later owner request is queued—not active—for one restricted non-Production browser key; the named $10 cap, rate quotas, usage/billing alerts, and billing owner above; and an approved deidentified Knoxville evaluation set for a time-boxed three-candidate renderer spike. In parallel, compare both material takeoffs against the upcoming real job. Use Quick Layout for exact cardinal/relative runs, Draw for an unknown angle, and the existing selected-run gate editor for openings. The next treated-pine input is actual post stock length; the structural-fastener defaults should be compared against one completed job before being treated as final. Do not resume consumer-phone Site Walk as a residential measurement path; evaluate reviewed higher-accuracy hardware only after the manual/command workflow proves customer value.
