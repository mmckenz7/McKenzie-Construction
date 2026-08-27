# Deck site-context consumption boundary

## Purpose

Deck Designer may eventually display the same address/site map, satellite or hybrid base layer, parcel reference, and observational browser location used by Fence. Those sources are contextual only. `DeckDesign` remains the sole authority for house walls, deck polygons, holes, elevations, stairs, railings, framing intent, finishes, history, JSON, warnings, and quantities.

This consumer slice contains no active Google SDK, key, billing setup, provider request, map UI, persistence, or design mutation. McKenzie OS platform/controller owns the shared read-only package; Fence and Deck retain separate domain-to-scene wrappers.

## Shared compatibility boundary

The released private package `@mckenzie/site-map-core` owns the provider-neutral presentation contracts, the `MCKENZIE_LOCAL_MM` registered ground plane, local-ground registration, sanitized local references, observational location, and the isolated read-only Google adapter.

Fence continues to own its renderer projection and draft-event translation. Deck does not import the Fence prototype, copy its renderer, or create another Google abstraction.

Deck imports `SITE_MAP_GROUND_PLANE`, the immutable presentation types, normalization, and local-ground registration from the shared package. `deriveDeckSiteContextMapSceneV5` is the Deck-owned, read-only domain-to-scene wrapper. The provider is not mounted and the registration supplied to that wrapper remains disposable presentation context outside `DeckDesign`.

`deriveDeckSiteContextProjectionV5` converts normalized Deck plan coordinates with the exact factor `25.4 mm/in`, rounding only the resulting contextual coordinates to the integer millimeters required by the existing ground-plane contract. Deck `x` maps to ground-plane `xMm`; Deck `z` maps to ground-plane `yMm`. Existing platform and house-wall IDs remain the traceable source IDs, while ring-point IDs are deterministic derived presentation IDs. The recursively frozen output cannot write back to Deck.

The provider-free `DeckLocalSiteContextFixtureAdapterV5` exists only to validate consumption. It has no mount lifecycle, network behavior, draft events, provider objects, storage, or map calculations. Satellite/hybrid choice, local parcel fixtures, and observational GPS fixtures can vary without changing authoritative Deck outputs.

`deriveDeckSiteContextPresentationV5` and the dormant `SiteContextReadinessV5` component turn only that immutable Deck projection into a local SVG overlay and honest readiness copy. They are not imported by the active app, add no current runtime bundle weight, cannot mount a renderer, and deliberately expose no address, provider, edit-event, key, billing, or persistence behavior.

## Future provider activation

The shared read-only contract is now consumed. Activating a provider still requires a separate reviewed slice:

1. Deck dynamically imports the provider renderer only after the user opens site context.
2. Address search remains adapter-owned and requires explicit user confirmation; a provider label is not a field measurement.
3. Satellite/hybrid, parcel, and GPS are rendered under or beside the Deck projection.
4. House/deck placement uses an explicit local-plane registration supplied by the shared adapter; no provider pixel or lat/lng is written into `DeckDesign`.
5. Browser location is an observational marker with its reported accuracy, never a snap or geometry edit source.
6. Turning context layers on/off or losing provider availability leaves the measured plan, 3D model, JSON, history, warnings, and quantities byte-for-byte unchanged.

Any editable site-placement workflow requires a separate reviewed command contract. This slice provides no such command.

## Lazy-loading and bundle strategy

- Keep the existing plan/editor entry and Three.js chunk boundaries unchanged.
- Load the shared provider adapter only from a user-opened site-context surface.
- Do not bundle a second provider SDK or a Deck-specific loader.
- Keep provider configuration outside Deck source and reuse the same non-Production key/billing controls established by Fence.
- Measure the initial, largest-chunk, and total gzip results before activation. The current enforced ceilings remain 90 KiB initial, 130 KiB largest, and 245 KiB total; they must not be raised merely to add mapping.
- If the shared adapter cannot fit, prefer an exclusive map/3D view on constrained devices and further shared lazy chunks before proposing a budget change.

## Integration order

1. Fence validated the provider and the Controller promoted the reusable core.
2. Deck consumes only the shared constant, immutable types, registration, and read-only scene contract while the provider UI remains dormant.
3. A later activation must validate one canvas/map surface at a time, desktop and 390 px behavior, provider failure recovery, and unchanged authoritative outputs.
4. Only a later owner/controller decision may authorize address persistence, editable site registration, production integration, or a shared API.

The dormant readiness presentation may be activated only after the promoted Fence contract is available and the combined map/3D bundle budget is revalidated. Its current “map connection not active” state must not be replaced with fixture address, parcel, aerial, GPS, or field-verification claims.
