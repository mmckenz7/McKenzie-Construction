# Provider-neutral map-core compatibility handoff

Status: isolated prototype contract proven; not shared production code and not a Deck dependency.

## Neutral read-only boundary

The following files contain no `FenceDesign`, Fence draft event, takeoff, product, or Deck concept:

- `src/map-presentation.ts` — normalized WGS84 coordinates; viewport and satellite/hybrid selection; renderer lifecycle/offline events; immutable generic point, polyline, and polygon scenes; independent reference GeoJSON and observational-location display; separate generic map-press/point-move interaction source; deterministic contract harness.
- `src/ground-registration.ts` — integer-millimeter local-ground coordinate, local-ground↔WGS84 registration, normalization, and deterministic forward/reverse projection.
- `src/google-map-renderer.ts` — candidate implementation of the read-only presentation and generic interaction contracts using only Maps JavaScript runtime primitives. It stores only `MapPresentationScene`, never a domain design.
- `src/local-reference-interchange.ts` — sanitized, local-only GeoJSON/KML reference parsing. It discards source properties and performs no upload or provider request.
- `src/live-location.ts` — observational browser-location lifecycle and accuracy presentation; it cannot mutate a domain model.

`ReadOnlyMapPresentationAdapter` is the consumption surface for a future shared package. `MapPresentationInteractionSource` is deliberately separate: a consumer that only needs display does not receive editing authority. Interaction events contain only a normalized coordinate or generic point ID and cannot mutate a scene. The owning domain decides whether and how to convert them into edits.

## Fence-owned wrapper boundary

- `src/fence-map-renderer.ts` converts `FenceMapDisplayProjection` to generic immutable overlays, chooses Fence presentation styles, and translates generic map interactions into `FenceDraftEditEvent`.
- `src/fence-geo-interchange.ts` converts `FenceDesign` integer-mm geometry to a read-only map projection, creates Fence-specific GeoJSON/KML exports, and chooses the Fence design anchor.
- `src/map-contract.ts` retains the pre-existing Fence projection/draft wrapper, address candidate contract, layer registry, and prototype provenance/registration scene. Its generic coordinate and viewport primitives are re-exported from `map-presentation.ts` only for Fence compatibility.
- `src/GoogleMapSpike.tsx` composes the Fence wrappers with the existing Fence editor commands.

Dependency direction is one way:

`FenceDesign → Fence projection/export/wrapper → neutral presentation/registration → Google runtime`

The neutral files do not import the Fence wrapper or model. The isolation check enforces that rule.

## Deck compatibility decision

Deck should not import any file from `prototypes/fence-designer`. After the Controller approves a real shared-package location and ownership, copy/adapt only the neutral contracts and their neutral tests into that reviewed location. Deck should then own its own `DeckDesign → MapPresentationScene` projection and its own optional interaction translation, parallel to the Fence wrapper. No Fence ID, role, segment kind, history command, export metadata, or takeoff rule belongs in the shared core.

## Deterministic evidence

- Generic scenes normalize and deeply freeze point/polyline/polygon overlays and reject duplicate IDs, provider instances, malformed coordinates/styles, and malformed polygons.
- Lifecycle, viewport, base selection, reference visibility, observations, offline state, and destruction do not mutate the immutable scene.
- Generic interactions do not mutate the scene; the Fence wrapper alone translates them into Fence draft events.
- Local-ground↔WGS84 round trips retain integer-mm geometry within the documented seven-decimal WGS84 quantization tolerance.
- Google mount/destroy/offline behavior, generic overlay rendering, reference visibility, observational accuracy circle, and Fence-wrapper translation have deterministic fake-runtime tests.

No migration, shared model, provider key, environment value, billing, cloud resource, geocoder, persistence, Production change, or Deck import is introduced by this extraction.
