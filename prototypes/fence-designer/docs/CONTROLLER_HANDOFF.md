# Controller handoff — Fence Visual Measure MVP

## Outcome

Created a usable, isolated 2D fence measurement prototype under `prototypes/fence-designer/` with one synchronized graphical/exact-command layout workflow and selectable no-pricing **Black Aluminum** and **Treated Pine Privacy** takeoffs. The bounded Google candidate now adds a disposable Maps JavaScript satellite/hybrid renderer, local sanitized parcel GeoJSON/KML overlay, browser accuracy-circle observation, and local GeoJSON/KML export. Canonical integer-mm Fence geometry, gates, history, and takeoff remain unchanged and provider-free; provider failure preserves the local editor. No geocoding, Places, Street View, provider persistence, KGIS fetch, live third-party sync, key value, or billing resource is present.

Runtime activation is deliberately blocked. Current Google documentation provides Dynamic Maps per-minute quotas and states that Cloud Billing budgets are alerts, not spending caps, so the approved 2,000-load/$10 enforced-stop intent cannot be guaranteed with the native browser-key setup alone. The inactive adapter and missing-key state can release safely, but creating billing/key/environment state requires an owner choice between alert-only risk and a separately reviewed automated enforcement design.

The local-image calibration defect is now bounded explicitly. One known line sets uniform scale; a second independent known line must agree within the greater of 1% or six inches before aerial-based drawing unlocks. Failure leaves drawing locked, saved transforms require a fresh independent check, and fitting/replacing the image clears calibration. UI copy distinguishes scale from alignment and states that imagery/parcel context is neither a boundary survey nor measurement authority. A new provider-neutral ground-plane contract registers declared-CRS vectors or control-point imagery into `MCKENZIE_LOCAL_MM`, supports two-control similarity and three-non-collinear-control affine prerequisites, retains residual/uncertainty, keeps confidence separate from verification, and rejects parcel/aerial promotion to field-verified. The scene and observations remain read-only and unpersisted outside `FenceDesign`.

## Files and ownership

- `src/model.ts`: prototype-owned integer-millimeter document, validation, geometry, classification, and feet/inches presentation.
- `src/history.ts`: whole-document undo/redo snapshots.
- `src/storage.ts`: explicit browser-local design persistence plus separately validated compressed-reference persistence.
- `src/view.ts`: deterministic bounded focal-point zoom, viewport-to-plan pan conversion, and edge/run-aware dimension-label placement.
- `src/takeoff.ts`: pure derived Black Aluminum and Treated Pine Privacy takeoffs plus the shared read-only visual bay/post projection.
- `src/map-contract.ts`: plain normalized-coordinate renderer contract, lifecycle/offline harness, separately confirmed address selection, base/overlay layer registry, and read-only shared local-ground registration/observation contracts.
- `src/google-map-renderer.ts`: dependency-free Maps JavaScript candidate adapter with satellite/hybrid display, disposable fence projection, local parcel Data overlay, accuracy circle, draft events, and explicit lifecycle/offline behavior.
- `src/geo-interchange.ts`: provider-neutral local-ground/WGS84 registration plus sanitized local parcel GeoJSON/KML input and explicit local Fence GeoJSON/KML export.
- `src/live-location.ts`: bounded observational browser-location session with stale/no-fix/session stops and non-verifying accuracy tiers.
- `src/GoogleMapSpike.tsx`: inactive-until-key candidate panel and the only integration surface between the adapter and existing Fence editor commands.
- `src/measurement-provenance.ts`: explicit source, capture-context, verification, observation, correction, and reported-accuracy matrix including Moasure.
- `src/gps.ts`: deterministic local GPS projection, bounded 20-second best-fix acquisition, explicit high-accuracy browser request, poor-fix rejection, error mapping, and accuracy presentation.
- `src/kgis.ts`: validated official KGIS address-link builder.
- `src/property-reference.ts`: validated official Acres, KGIS, and Google reference destinations with no provider fetch.
- `src/background.ts`: deterministic reference-image fit, uniform calibration, independent-line residual verification, move, rotation, and four-corner house-straightening math.
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

- 146 deterministic tests passed, including authored first/middle/last-span edits, multiple downstream points, two downstream gates, separate-line isolation, reverse bearings, invalid and connected topology, no-op revisions, deterministic replay/save-load, independent-line scale residuals, saved-scale re-verification, ground-plane registration, layer/geometry isolation, provider mount/destroy/offline behavior, local GeoJSON/KML parsing/export, observational-location stops, and provenance non-promotion.
- Strict TypeScript passed.
- Prototype isolation guard passed.
- Prototype production build passed.
- Browser QA passed for the full measurement workflow and the Materials audit layer on desktop and phone viewports. At 390 × 844, the exact field-beta 20′ + 30′ + 19′11″ layout changed its middle run to 33′ while the last run stayed 19′11″ and the total became 72′11″. Undo/redo treated the correction as one step, the page stayed horizontally contained, primary controls were 48 px high, exact-entry controls remained at least 44 px high, and browser warnings/errors remained empty. Consumer GPS remains hidden from the primary workflow.
- Calibration browser QA confirmed that loading a new local reference disables Draw, Separate line, Exact input, house trace, and image lock; the verification button remains disabled until the first known line is committed; and an out-of-tolerance independent line reports measured residual and leaves drawing locked. At 390 px, the page remained horizontally contained with no browser warnings/errors.
- The protected OS route redirects signed-out visitors to login with the exact fence-route return path, and its designer styles are scoped to prevent changes elsewhere in OS.
- Repository lint passed with no errors (pre-existing warnings remain), and the production build passed with the supported webpack builder, including the `/sales/fence-designer` route.

## Risks and limits

- The house is a user-measured rectangular context footprint, not a building record. Non-rectangular footprints remain a later extension.
- Local-plan geometry is not a survey, legal boundary, aerial measurement, or field verification.
- Consumer phone GPS can drift by several feet or more, especially near buildings, trees, or poor sky view. Real field results were unusable for 20–40-foot residential runs, so Site Walk is no longer a primary toolbar action. Its retained experimental code does not make it an accepted measurement method. A future hardware capture tier must preserve explicit provenance and never promote its result over field-verified geometry.
- KGIS publishes useful parcel, address, building-footprint, and aerial context, but its raw ArcGIS endpoint returned HTTP 401 outside the KGIS viewer during compatibility testing. This slice links only to the official viewer. Automatic geometry import requires KGIS-approved access plus a reviewed server adapter; do not add credentials or a client-side bypass.
- On an open line, exact segment editing uses authored draw order as authority: it fixes the selected span's authored start and bearing, then translates the complete downstream chain so later lengths, bearings, gates, and relative geometry remain unchanged. This is intentionally not a general constraint solver.
- Mid-run divider connections are geometric anchors, not graph branches: the perimeter and divider retain separate coincident endpoint records so either line can be edited without silently changing the other's measured topology.
- Exact edits with any downstream point attached to the house or another fence run fail closed and require that connection to be opened or adjusted explicitly. The separate **Close to house** workflow retains its deliberate measured-chain solver; ordinary exact entry never invokes it silently.
- Full-chain closure requires the first fence point on the house and at least two measured runs. It preserves displayed run measurements with at most two millimeters of integer-coordinate rounding; impossible target/length combinations are rejected.
- A gate records an exact total opening width and single/double intent. The derived Black Aluminum takeoff uses that intent only for the owner-supplied post and basic hardware counts. “Double” does not calculate individual leaf sizes or select a gate assembly, reinforced post, product, labor, or price.
- Post A/Post B is deliberately presentation-only. The saved gate remains ordinary integer-mm fence/gate/fence geometry, so reversing the field reference cannot create a second measurement model or silently change provenance.
- Black Aluminum takeoff is preliminary and derived. A mid-run divider/T connection shares a run post when it lands on a feasible natural panel boundary measured from either end; otherwise it adds an end post without changing the perimeter panel count. Panel height/style, reinforced gate-post requirements, concrete, caps, fasteners, waste, product selection, and pricing are not yet defined.
- Treated Pine Privacy is also preliminary and derived. Its ballpark fastener defaults are six picket screws per installed picket, 12 rail-to-post structural screws per bay, and 12 gate-frame structural screws per leaf; hinge, latch, and drop-rod mounting fasteners are assumed included with those items. Board grade, post stock length, concrete engineering/yield, caps/trim, product selection, labor, and pricing are not yet defined.
- Manual house straightening assumes the marked footprint is adequately rectangular and uses averaged opposite edges. It must occur before fence points exist and remains reference geometry, not an automatic building record or survey.
- The provider-neutral contract is a tested prototype boundary, not a provider selection or persisted shared-domain implementation. Google remains a candidate even though the inactive adapter is now implemented. No provider package, key value, environment value, billing, map ID, geocoder, cloud resource, or provider object was added. Formal provenance attachment to accepted persistent geometry still requires Controller alignment with the shared Fence domain contract.
- A single captured image can now be scale-checked but is still only manually aligned. The frozen contract supports a future local KGIS-style parcel + satellite + Fence overlay demonstrator, but the UI does not yet import a second vector/control layer or solve similarity/affine coefficients. Licensed KGIS/provider access, CRS transformation code, attribution/storage review, and provider rendering remain separate later work.
- Local storage is device/browser specific and has no multi-user or cloud durability.
- The local reference is stored separately from design JSON and only after explicit **Save local**. Browser storage is device/profile specific and quota-limited; a large or storage-blocked capture can fail, in which case the fence design remains unchanged and the UI reports the failure.
- Tab capture requires a supporting desktop browser and a user choice in the browser's display picker. Clipboard paste requires browser clipboard permission. File upload remains the fallback; none of the three paths uploads imagery to McKenzie OS.
- Acres Plus provides visual parcel context but no supported KML/API geometry export. The prototype opens Acres for manual reference and does not scrape it.
- Google Earth imagery cannot be uploaded into this commercial web tool. The Maps JavaScript candidate stays inactive until a licensed, restricted runtime key and accepted spending boundary exist.

## Owner decisions needed later

The implementation is ready to activate only after one remaining owner choice. Google requires billing, but current Dynamic Maps quotas are per minute and Cloud Billing budgets do not enforce a spend cap. Michael must either accept a tightly restricted alert-only spike (2,000-load operating ceiling, $10 budget, alerts at 50/80/100, immediate manual disable at 100%) or authorize a separate automated billing-disable design with its delay and project-wide-impact risks. Only after that choice may a separate non-Production website-restricted key be created for approved Preview origins and API-restricted to Maps JavaScript API. No Geocoding or Places is needed. Sources: [usage and billing](https://developers.google.com/maps/documentation/javascript/usage-and-billing), [Cloud Billing budgets](https://cloud.google.com/billing/docs/how-to/budgets), and [API-key security](https://developers.google.com/maps/api-security-best-practices).

KGIS data access is a separate approval, not included in the Google key: approved endpoint/credentials if required, documented WKID/CRS and layer fields, update cadence, CORS or reviewed server access, attribution, storage/cache rights, and a deidentified parcel fixture permitted for the spike. Without that evidence, the spike may use only an approved local parcel GeoJSON fixture to prove the adapter boundary—not live KGIS data.

The mobile spike must show browser position and its reported accuracy Circle only after Start. Exact stop rules are: explicit Stop, adapter destruction, page hidden, permission/error, five minutes elapsed, or no fix for 30 seconds. Fixes older than 10 seconds are stale; ≤5 m is best-available observational, >5–15 m is caution, and >15 m is rejected for approximate capture. No tier creates, snaps, moves, or verifies Fence geometry. Exact field measurements remain authoritative.

Export is a later provider-neutral action, not synchronization: generate GeoJSON and KML from a reviewed local-plane-to-WGS84 projection, carry stable segment/provenance properties, and fail closed when registration is absent. The owner may manually import supported files into Acres where licensed. No real-time Acres API or LandGlide live/KML import is promised.

Recommended concrete Google-candidate guardrails are a one-month maximum of **2,000 Dynamic Map loads and 500 geocodes**, with an expected provider cost of **$0** because each is below the current 10,000-event monthly no-cost allowance. Set a **$10 gross monthly spend cap** if Maps Platform is eligible for the account's project/service spend-cap control; otherwise the spike must not begin until an equivalent enforced stop is approved. Set usage alerts at 50%, 80%, and 100% of each maximum (1,000/1,600/2,000 map loads and 250/400/500 geocodes), billing alerts at $5/$8/$10, and low spike-only rate quotas of 10 map loads and 10 geocodes per minute where the Cloud quota surface permits. The billing owner must stop the spike at either 100% usage threshold even if the free allowance remains. Reconfirm [current Maps pricing](https://developers.google.com/maps/billing-and-pricing/pricing), [quota controls](https://developers.google.com/maps/documentation/javascript/usage-and-billing), and [spend-cap eligibility](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps) immediately before authorization.

Black Aluminum reinforced gate-post requirements and cutoff-reuse policy still need owner confirmation before this takeoff can be called final. Automatic KGIS parcel/building overlay remains blocked on KGIS-approved programmatic access, licensing/attribution review, and a reviewed server-side integration boundary. Product lists and pricing remain a later, separate work package.

## Recommended next action

The neutral contract is accepted. Finish and release the current two-line local calibration gate, then request—not assume—the later Google candidate authorization: one Maps-JavaScript-only non-Production browser key restricted to approved Preview origins; the named $10 cap/equivalent enforced stop, 2,000-load maximum, rate quotas, usage/billing alerts, and billing owner; one approved deidentified Knoxville evaluation set; and KGIS-approved access evidence or an explicitly permitted local parcel fixture. The renderer spike then tests Google satellite/hybrid + parcel GeoJSON + read-only Fence + observational browser GPS in one coordinate view, with no geocoding and no provider persistence. GeoJSON/KML export remains a subsequent neutral pure-projection slice after local-plane-to-WGS84 registration is reviewed. Do not resume consumer-phone Site Walk as authoritative residential measurement.
