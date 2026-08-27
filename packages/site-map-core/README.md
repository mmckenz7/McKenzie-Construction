# Site Map Core

Provider-neutral, read-only site-map presentation for McKenzie-owned geometry.

## Authority boundary

- Consumers supply immutable points, polylines, polygons, a viewport, optional sanitized parcel geometry, and optional observational location.
- `SITE_MAP_GROUND_PLANE` is the single exported `MCKENZIE_LOCAL_MM` identifier for the local integer-millimeter ground plane. A deliberate anchor and bearing register that plane to normalized seven-decimal WGS84 coordinates.
- Renderer events are untrusted presentation interactions. A trade-owned wrapper must validate and translate them before creating a draft or command.
- Provider maps, tiles, camera objects, SDK classes, raw geocoder results, parcel claims, and GPS observations are never calculation, takeoff, pricing, persistence, or verification authority.
- A provider outage or adapter replacement must not erase or mutate the consumer's domain geometry.

## Package boundary

The package contains:

- the generic read-only map scene and lifecycle contract;
- deterministic local-ground/WGS84 registration;
- an isolated Google Maps JavaScript read-only presentation adapter with an injectable runtime;
- local GeoJSON/KML parcel sanitization;
- bounded observational browser-location state.

It contains no Fence or Deck imports, schemas, rules, quantities, persistence, geocoder, billing, API key, environment access, or Production activation. Fence and Deck remain responsible for their own immutable projections and event translation. A browser key is supplied by the host at runtime and is never stored here.

## Validation

Run `npm run boundary`, `npm run typecheck`, `npm run build`, and `npm test` from this directory. The package uses the repository's TypeScript dependency and does not require a nested install. Tests use injected fake browser/provider runtimes and make no network requests.
