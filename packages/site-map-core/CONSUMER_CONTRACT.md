# Consumer contract

## Shared ownership

McKenzie OS platform/controller owns this package. It is the only shared location for the map presentation lifecycle, `MCKENZIE_LOCAL_MM` registration, sanitized local parcel references, observational browser location, and the isolated Google read-only adapter.

## Fence boundary

Fence keeps its domain-to-scene projection and draft-event translation in Fence-owned files. A later Fence consumer change may replace the duplicated neutral modules with thin imports or compatibility re-exports from this package. Address search, measured runs, gates, takeoff, and saved Fence geometry remain outside this package.

## Deck boundary

Deck keeps its existing frozen v5 site-context projection and all design commands in Deck-owned files. A later Deck consumer change may use `SITE_MAP_GROUND_PLANE`, `MapPresentationScene`, registration, and the read-only adapter. This promotion does not activate a Deck map, transfer a key, or permit map interactions to mutate `DeckDesign`.

## Activation boundary

Consumers must lazy-load provider rendering, supply their own restricted runtime key, and preserve their authoritative geometry when the provider is unavailable. Enabling a provider, adding editable site placement, persisting registration, or promoting to Production requires a separate reviewed change.
