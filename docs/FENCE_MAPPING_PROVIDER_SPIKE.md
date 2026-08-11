# Fence Mapping Provider Spike Protocol

Status: ready for credential and address authorization; spike not executed

Repository: `mmckenz7/McKenzie-Construction`

Protocol date: 2026-08-10

Related documents:

- `docs/FENCE_MAPPING_ENGINE_ARCHITECTURE.md`
- `docs/FENCE_MAPPING_ENGINE_V0_PLAN.md`
- `docs/FENCE_ENGINE_DOMAIN_CONTRACT.md`

## Objective

Select the V0 web map, satellite imagery, and address-geocoding combination
using the real McKenzie service area and the exact Fence Engine interaction
contract.

The spike compares:

1. Mapbox GL JS + Mapbox Standard Satellite + Mapbox Geocoding;
2. MapLibre GL JS + MapTiler satellite/hybrid tiles + MapTiler Geocoding.

The comparison is not a general map demo. It must prove that McKenzie can draw,
edit, review, and retain estimating geometry at actual fence properties while
meeting provider licensing, attribution, credential, storage, and cost
requirements.

## Current readiness

The repository currently contains:

- no Mapbox, MapLibre, MapTiler, Google Maps, ArcGIS, Turf, or geodesic package;
- no configured Mapbox, MapTiler, Google Maps, or ArcGIS credential;
- no approved non-sensitive evaluation address set;
- no authorization to create provider accounts, keys, billable requests, or
  store geocoding results.

Therefore this protocol is ready, but a live spike must not begin yet. Do not
install dependencies or create credentials merely to render a generic map.

## Decision boundary

The provider decision owns:

- browser renderer and supported browser/device behavior;
- satellite/hybrid imagery and labels;
- address search and selected-result terms;
- attribution and provider logo requirements;
- public browser credential restrictions;
- map/geocoding usage measurement and cost;
- future customer-facing use rights.

The provider decision does not own:

- normalized WGS84 Fence Engine coordinates;
- authoritative geodesic length;
- nodes, runs, gates, transitions, or topology;
- undo/redo semantics;
- fence-system rules or takeoff;
- parcel data;
- estimate pricing or import.

## Required authorization and inputs

Before live work, provide:

### Provider credentials

- one dedicated non-production public browser token/key per candidate;
- minimum read-only scopes/services;
- localhost and exact preview-origin restrictions where supported;
- a usage quota/budget and owner;
- approved storage mode for selected geocoding results;
- confirmation that secret account-management scopes are absent.

Credentials stay in local/preview environment configuration and never in the
repository, screenshots, fixtures, logs, or this document.

### Address evaluation set

Provide an internal list of McKenzie-authorized properties representing:

- dense residential lot;
- suburban lot;
- wooded/tree-covered boundary;
- large/rural lot;
- corner lot;
- property with long driveway or ambiguous street match;
- property near a building edge where imagery alignment matters;
- known recent development where imagery freshness can be observed.

The evidence report uses opaque case IDs. It must not publish customer names,
full addresses, coordinates, or screenshots outside approved private storage.

### Reference evidence

For cases where measurement quality is scored, provide tape/laser verified
dimensions or an approved non-customer test site. Provider imagery is compared
to that reference; it is not treated as truth.

## Official capability baseline

Verified on 2026-08-10:

### Mapbox candidate

- [Mapbox Standard Satellite](https://docs.mapbox.com/map-styles/reference/standard-satellite/)
  is the maintained satellite style recommended for new projects. The older
  classic Satellite style remains available but is no longer actively
  maintained.
- [Mapbox Geocoding](https://docs.mapbox.com/api/search/geocoding/) supports
  temporary and permanent result modes. Temporary results cannot be cached;
  persistent Fence Engine address/coordinate use requires the permanent mode
  and its account/billing requirements.
- [Mapbox token management](https://docs.mapbox.com/accounts/guides/tokens/)
  supports distinct tokens, public scopes, and URL restrictions. Localhost
  needs its own allowed entry/token and restrictions are a best-effort
  mitigation.
- [Mapbox GL JS security/testing](https://docs.mapbox.com/mapbox-gl-js/guides/security-and-testing/)
  documents CSP/referrer requirements and a test mode for token-free map
  interaction tests.

### MapLibre + MapTiler candidate

- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) is an open-source
  TypeScript/WebGL renderer and does not itself supply imagery or geocoding.
- [MapTiler API](https://docs.maptiler.com/cloud/api/open-api/) exposes map
  styles, raster/vector tiles, static maps, search services, and a read-only
  public API-key surface.
- [MapTiler satellite](https://docs.maptiler.com/schema-raster/satellite/)
  documents satellite/aerial coverage with resolution varying by location; the
  actual McKenzie service area must be inspected rather than relying on global
  marketing ranges.
- [MapTiler geocoding with MapLibre](https://docs.maptiler.com/maplibre/examples/geocoding-control/)
  provides an official integration path through the MapTiler geocoding control.

Provider pricing, coverage, imagery date, storage rights, screenshots/exports,
and customer-facing rights must be verified against the account plan and terms
used for the spike. Documentation capability is not commercial approval.

## Shared spike harness

Both candidates must use the same McKenzie-owned interaction controller and
the same domain draft shape. Provider-specific marker/polyline classes cannot
be the saved source of truth.

```text
pointer/touch/keyboard event
-> renderer adapter returns longitude/latitude
-> Fence interaction controller normalizes domain draft
-> domain validator produces preview
-> renderer adapter receives a read-only display projection
```

### Minimal renderer adapter

Design-level interface:

```ts
type MapCoordinate = {
  longitude: string;
  latitude: string;
};

type MapViewport = {
  center: MapCoordinate;
  zoom: string;
  bearing: string;
  pitch: string;
};

interface FenceMapRendererAdapter {
  mount(container: HTMLElement): Promise<void>;
  destroy(): void;
  setViewport(viewport: MapViewport): void;
  showDomainProjection(projection: FenceMapDisplayProjection): void;
  onPrimaryAction(listener: (coordinate: MapCoordinate) => void): () => void;
  onDrag(listener: (subjectId: string, coordinate: MapCoordinate) => void): () => void;
  screenPointToCoordinate(point: { x: number; y: number }): MapCoordinate;
}
```

This is spike pseudocode, not permission to add production types. The final
contract must align with `FENCE_ENGINE_DOMAIN_CONTRACT.md` coordinate
normalization.

### Minimal geocoder adapter

```ts
type AddressCandidate = {
  providerResultId: string;
  displayLabel: string;
  coordinate: MapCoordinate;
  storageMode: "temporary" | "permanent" | "provider_specific";
  attribution: string;
};

interface FenceAddressSearchAdapter {
  search(query: string, signal: AbortSignal): Promise<readonly AddressCandidate[]>;
  select(candidate: AddressCandidate): Promise<AddressSelection>;
}
```

The domain layout does not retain the raw provider result. The persistence
adapter stores only licensed selected fields and provider/vintage/storage-mode
metadata.

## Required interaction scenarios

Each candidate must complete the same scripted scenarios.

### Address and viewport

- enter a complete address and select the correct result;
- handle ambiguous/multiple results without silently choosing one;
- center at a useful property zoom;
- switch satellite and hybrid/label context if supported;
- preserve attribution during every state;
- handle no result, timeout, rate limit, forbidden key, and provider outage.

### Fence drawing

- create a run from two points;
- append vertices and complete the run;
- start a disconnected fence component;
- insert and drag a corner;
- split and join allowed run operations;
- create gate-start and gate-end nodes plus an explicit opening;
- split a run at a system transition;
- select and edit overlapping visual handles at high zoom;
- delete with confirmation where topology changes;
- undo and redo every mutation;
- show segment/run/fence/opening/alignment lengths from the shared domain
  service, not the map SDK;
- show source/verification and estimating/not-a-survey state.

### Input modes

- mouse;
- trackpad;
- keyboard-only editing path where feasible;
- touch on the supported field/tablet viewport;
- high-DPI display;
- browser zoom and responsive layout.

### Failure and lifecycle

- route navigation with unsaved draft;
- browser refresh/reload recovery using non-provider draft state;
- token/key rejected;
- imagery tiles unavailable while geometry remains editable/recoverable;
- geocoding unavailable after an existing layout is opened;
- provider adapter destroyed/remounted without duplicate listeners;
- no credential or full address in logs/errors.

## Evidence collection

For every candidate and case, record:

| Field | Evidence |
| --- | --- |
| Case ID | Opaque internal identifier. |
| Browser/device | Approved test matrix value. |
| Address result | Correct / ambiguous / incorrect / unavailable. |
| Imagery usable | Yes/no with reason. |
| Observable imagery age | Provider-reported or unknown; never guessed. |
| Fence feature visibility | Strong / usable / weak / unusable. |
| Building/parcel visual offset | Observation only; parcel not in V0. |
| Draw/edit completion | Pass/fail by scripted scenario. |
| Touch target/usability | Pass/fail plus issue code. |
| Initial map latency | Measured distribution, not one anecdote. |
| Geocode latency | Measured distribution. |
| Provider errors | Stable sanitized codes/counts. |
| Attribution compliant | Reviewed yes/no. |
| Storage mode compliant | Reviewed yes/no. |
| Usage units consumed | From provider dashboard/export. |
| Projected monthly cost | Based on recorded units and stated volume assumptions. |

Private screenshots may support review but must follow provider and customer
privacy rules. Public architecture docs store only summarized, de-identified
results.

## Scoring model

Use a 0–5 score only after the raw evidence is complete.

| Dimension | Weight | Automatic failure |
| --- | ---: | --- |
| Target-area imagery usefulness | 25 | Core evaluation properties are unusable. |
| Address match quality | 15 | Frequent silent wrong-property selection. |
| Custom fence editing | 20 | Domain interactions cannot be implemented accessibly. |
| Licensing and retention fit | 15 | Required selected-result/layout retention is not permitted. |
| Security and credential controls | 10 | No acceptable scoped browser credential/quota control. |
| Performance/reliability | 5 | Geometry becomes unavailable when tiles fail. |
| Cost at expected volume | 5 | Exceeds approved budget or cannot be forecast. |
| Portability/maintenance | 5 | Provider types leak into saved domain contract. |

Weights total 100. An automatic failure cannot be offset by a high aggregate
score.

Score calculation:

```text
weighted score = sum((dimension score / 5) * dimension weight)
```

Tie-break order:

1. target-area imagery usefulness;
2. licensing/retention fit;
3. custom editing/accessibility;
4. address quality;
5. security controls;
6. measured cost.

## Evaluation matrix

Do not fill scores before running the evidence protocol.

| Dimension | Mapbox evidence | Mapbox score | MapLibre + MapTiler evidence | MapLibre + MapTiler score |
| --- | --- | ---: | --- | ---: |
| Target-area imagery | | | | |
| Address search | | | | |
| Fence interactions | | | | |
| Touch/accessibility | | | | |
| Licensing/retention | | | | |
| Attribution/export | | | | |
| Token/key security | | | | |
| Performance/reliability | | | | |
| Usage/cost | | | | |
| Portability/maintenance | | | | |
| Automatic failure | | N/A | | N/A |
| Weighted total | | | | |

## Credential checklist

### Mapbox spike token

- [ ] Separate non-production token.
- [ ] Public read-only scopes only.
- [ ] Localhost and exact preview origins configured deliberately.
- [ ] Referrer/CSP behavior verified.
- [ ] Usage dashboard owner identified.
- [ ] Quota/budget alert configured where available.
- [ ] Permanent geocoding eligibility and intent approved before storing result.
- [ ] Token value absent from repository and logs.

### MapTiler spike key

- [ ] Separate non-production key.
- [ ] Allowed-origin/restriction options configured and tested.
- [ ] Only required read services enabled/used.
- [ ] Usage dashboard owner identified.
- [ ] Quota/budget alert configured where available.
- [ ] Geocoding storage/retention terms approved before persistence.
- [ ] Key value absent from repository and logs.

## Dependency rules

- Do not add both provider SDK stacks to production dependencies merely for the
  comparison.
- Prefer disposable isolated spike work until selection.
- If a branch/worktree spike is authorized, install exact versions with a lock
  file and record bundle size/license data.
- Do not copy provider example measurement code into Fence Engine.
- Remove the losing spike dependency/artifacts before production integration.
- Production map code receives the selected adapter only; domain contract tests
  remain provider-independent.

## Exit criteria

The provider gate is complete only when:

- both candidates ran on the same authorized address and device matrices;
- all required interactions and failure cases have evidence;
- selected-result storage and screenshot/export rights are approved;
- token/key restriction and quota behavior is verified;
- measured usage supports a documented volume/cost forecast;
- accessibility/touch review passes;
- provider types do not enter saved Fence Engine domain data;
- one provider is selected with named business and technical approvers;
- fallback/exit implications are documented;
- production dependency, schema, credential, and deployment changes return for
  separate review and approval.

## Current recommendation

Mapbox remains the first candidate because it offers a cohesive maintained
satellite style, geocoding, token restrictions, and mature web renderer.
MapLibre + MapTiler is the required portability comparison because it separates
the open renderer from imagery/search services while still offering an
integrated satellite and geocoding path.

This recommendation is provisional. The selected provider must be determined
by the authorized target-area evidence matrix, not documentation alone.

No live spike can proceed until scoped non-production credentials, usage
limits, storage terms, and the de-identified address case set are supplied.
