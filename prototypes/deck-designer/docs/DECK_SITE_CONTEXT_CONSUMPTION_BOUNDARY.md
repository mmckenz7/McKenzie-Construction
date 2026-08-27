# Deck site-context consumption boundary

## Purpose

Deck Designer may eventually display the same address/site map, satellite or hybrid base layer, parcel reference, and observational browser location used by Fence. Those sources are contextual only. `DeckDesign` remains the sole authority for house walls, deck polygons, holes, elevations, stairs, railings, framing intent, finishes, history, JSON, warnings, and quantities.

This preparation slice contains no Google SDK, key, billing setup, provider request, map UI, persistence, or shared code. Fence remains the first adopter and owner of the provider adapter.

## Existing compatibility boundary

The Fence prototype currently owns two related concepts:

- a Fence-specific renderer interface that accepts `FenceMapDisplayProjection` and emits Fence draft edits; and
- a provider-neutral `MCKENZIE_LOCAL_MM` registered ground plane.

Deck must not import the Fence prototype, copy its renderer, or create another Google abstraction. `MCKENZIE_LOCAL_MM` is mirrored here only as an explicit compatibility identifier pending a later Controller-owned shared-contract promotion. It is not a new shared constant or model.

`deriveDeckSiteContextProjectionV5` converts normalized Deck plan coordinates with the exact factor `25.4 mm/in`, rounding only the resulting contextual coordinates to the integer millimeters required by the existing ground-plane contract. Deck `x` maps to ground-plane `xMm`; Deck `z` maps to ground-plane `yMm`. Existing platform and house-wall IDs remain the traceable source IDs, while ring-point IDs are deterministic derived presentation IDs. The recursively frozen output cannot write back to Deck.

The provider-free `DeckLocalSiteContextFixtureAdapterV5` exists only to validate consumption. It has no mount lifecycle, network behavior, draft events, provider objects, storage, or map calculations. Satellite/hybrid choice, local parcel fixtures, and observational GPS fixtures can vary without changing authoritative Deck outputs.

## Future adapter consumption

After Fence proves and the Controller promotes a stable provider-neutral renderer core:

1. Deck dynamically imports that same core only after the user opens site context.
2. Address search remains adapter-owned and requires explicit user confirmation; a provider label is not a field measurement.
3. Satellite/hybrid, parcel, and GPS are rendered under or beside the Deck projection.
4. House/deck placement uses an explicit local-plane registration supplied by the shared adapter; no provider pixel or lat/lng is written into `DeckDesign`.
5. Browser location is an observational marker with its reported accuracy, never a snap or geometry edit source.
6. Turning context layers on/off or losing provider availability leaves the measured plan, 3D model, JSON, history, warnings, and quantities byte-for-byte unchanged.

Any editable site-placement workflow requires a separate reviewed command contract. This slice provides no such command.

## Lazy-loading and bundle strategy

- Keep the existing plan/editor entry and Three.js chunk boundaries unchanged.
- Load the future Fence-owned map adapter only from a user-opened site-context surface.
- Do not bundle a second provider SDK or a Deck-specific loader.
- Keep provider configuration outside Deck source and reuse the same non-Production key/billing controls established by Fence.
- Measure the initial, largest-chunk, and total gzip results before activation. The current enforced ceilings remain 90 KiB initial, 130 KiB largest, and 245 KiB total; they must not be raised merely to add mapping.
- If the shared adapter cannot fit, prefer an exclusive map/3D view on constrained devices and further shared lazy chunks before proposing a budget change.

## Integration order

1. Fence validates provider lifecycle, base-layer switching, attribution, offline behavior, parcel overlay, and observational geolocation.
2. The Controller promotes the reusable core and owns its shared contract.
3. Deck replaces the local fixture seam with a read-only consumer of that same core.
4. Deck validates one canvas/map surface at a time, desktop and 390 px behavior, provider failure recovery, and unchanged authoritative outputs.
5. Only a later owner/controller decision may authorize address persistence, editable site registration, production integration, or a shared API.
