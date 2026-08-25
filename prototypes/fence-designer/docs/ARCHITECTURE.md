# Fence Visual Measure MVP

## Scope

This isolated browser prototype turns explicitly drawn or field-marked perimeter and divider fence lines into deterministic plan-view measurements and a derived Black Aluminum material takeoff. It supports an optional exact-length-and-width house footprint, multiple independent ordered lines, midpoint connections to existing runs, tap-to-mark Site Walk GPS shape capture, immediate exact field-length correction, a local reference image with two-point scale calibration, locked-length movement or free point movement, point deletion, measured single/double gate openings, undo/redo, angle assistance on/off, and local browser save/load. It does not create estimates, product/SKU selections, labor, prices, customers, or cloud records.

Everything under `prototypes/fence-designer/` is prototype-owned. Source cannot import outside this directory, access Supabase, read environment variables, or use browser network primitives. No migration or shared domain model is introduced.

## Provider-neutral map prerequisite

`map-contract.ts` freezes the provider-independent seam required before any renderer spike. `FenceMapRendererAdapter` exchanges only exact seven-decimal WGS84 strings, validated viewport values, read-only display projections, and normalized place/move/delete draft events. Provider classes and other non-plain objects are rejected. The included contract harness defines mount-once, destroy, ready/offline recovery, listener cleanup, and last-projection retention while imagery is unavailable. A future provider renderer is disposable display infrastructure; it never becomes `FenceDesign`, geometry history, or takeoff state.

`AddressSearchAdapter` is separate from rendering. An address candidate carries provider ID, terms version, attribution, storage policy, retrieval time, and normalized coordinate. The application must create a pending selection and receive an explicit matching-result confirmation before using it to position a map. No candidate automatically creates or verifies fence geometry.

The layer registry selects exactly one base imagery layer while allowing parcel, phone GPS, Moasure, LiDAR, and CAD overlays to be shown independently and simultaneously. Provider metadata is required for provider-backed bases and overlays, while local field-capture overlays may have no provider. Layer visibility, provider metadata, and attribution remain outside the measurement calculation.

`measurement-provenance.ts` freezes a prototype-owned source/capture/verification matrix without extending persisted schema v3. Aerial and parcel sources are remote references; phone GPS and Moasure are field-captured; manual and laser values require field-verification or correction evidence. Moasure is an explicit source. Reported accuracy is retained independently and never selects a verification state. Every verification value is supplied explicitly, observations are required for non-derived sources, and manually corrected values require a correction record. Formal attachment of this provenance to a future accepted layout remains a shared-domain review rather than a prototype schema change.

## Measurement model

The authoritative document is a validated forest of separate ordered open paths:

- points store integer local-plan `xMm` and `yMm` coordinates;
- an optional rectangular house footprint stores integer origin, length, and width values, remains visual context only, and is excluded from fence totals;
- each point has at most one incoming and one outgoing segment; branching and cycles are rejected, while disconnected ordered lines are valid;
- segments reference their line's adjacent points and carry `fence` or `gate` intent; gate segments additionally record `single` or `double` opening intent;
- geometric segment length is Euclidean distance rounded once to the nearest millimeter;
- total length is the sum of those rounded integer segment lengths;
- feet/inches are presentation conversions, rounded to the nearest inch;
- exact-length editing normally keeps a segment's start fixed and moves its end along the existing bearing;
- when a segment ends on the house, that endpoint stays fixed. With length lock enabled, the editor solves the nearest circle intersection that preserves the preceding run and changes only the connecting angles; impossible locked geometry is reported instead of moving the house connection or changing a measured length.

Each line's first and last points are endpoints. An endpoint coincident with the house or a different fence run is identified as connected; interior points are corners when their path deflection exceeds two degrees. Adding a gate at a point consumes the entered total width from the following span and splits that span, or extends that line along the preceding bearing when the selected point is its final endpoint. A lone point cannot supply a direction. Single/double is opening intent only; it carries no leaf-sizing formula, product, assembly, post, hardware, or pricing rules.

Undo/redo stores validated whole-document snapshots. Stable JSON schema v3 is saved only to browser local storage after an explicit Save action. Loading validates and normalizes the document before it becomes active; schema-v1 and schema-v2 local layouts migrate deterministically to v3 without inventing lines or measurements.

Angle assistance is UI editing state rather than a design fact and defaults off. Free-angle placement rounds only to the nearest millimeter and treats exact lengths as authoritative. House-edge and existing-run anchoring are separate and remain active within a 460-millimeter pointer tolerance regardless of angle assistance. When optional 45°/90° assistance is enabled, unconnected pointer placement also uses the nearest 305-millimeter grid interval. Exact numeric edits bypass pointer snapping.

Length lock is also UI editing state. When enabled, dragging a line's first point translates only that line. Dragging any later point preserves the incoming segment length, moves that point around the preceding point, and translates only the following points on the same line. Other perimeter/divider lines remain unchanged. Disabling length lock restores free single-point movement and allows adjacent dimensions to change.

**Separate line** adds an isolated start point and makes that new line the active Draw continuation. Draw otherwise continues from the most recently added endpoint. A start or end placed within tolerance of another run projects to the nearest point on that segment, allowing a divider to connect any measured distance back from a corner without splitting, shortening, or moving the perimeter. Coincident endpoints remain separate graph points so every line can be edited independently; totals sum every segment exactly once. If both endpoints of a multi-run divider are connected, exact-length edits re-solve only that divider and keep both connections plus all other run lengths fixed.

Interaction state is cancelable with Escape. A non-passive canvas wheel handler prevents plan zoom from scrolling the surrounding OS page. Dedicated Pan mode remains available, while Command-drag temporarily pans from any tool and two simultaneous touch pointers pan/pinch without placing a drawing point.

Live length presentation is screen-space UI state: while a prospective run follows the pointer, its feet/inches value appears in a fixed canvas card rather than over the geometry. Completed dimensions are derived from authoritative segment length, offset perpendicular to their run, and connected by a visual leader. A deterministic placement pass tests each label's bounding box, tries both sides of its run, increases the offset until nearby labels no longer collide, keeps the box within the visible plan, and prefers candidates whose box and leader do not cross an unrelated fence run. A session-only manual side override forces a selected label to its opposite side while still allowing greater offset on that side; **Auto-position dimension** removes that override. Label size and offset scale with the plan view so zooming does not turn a short-run label into an oversized obstruction. Label placement never affects geometry, totals, history, or serialization.

## Black Aluminum takeoff boundary

`takeoff.ts` is a pure derived calculator over the validated `FenceDesign`; it does not extend schema v3 or introduce persisted material state. Eight-foot panel counts use the same nearest-inch field precision shown in the editor. Collinear fence segments form one uninterrupted straight run, while corners and gates break runs. Each run rounds panels up independently, and the engine assumes no cutoff reuse. Run posts are the natural internal panel boundaries; open line ends and non-corner gate sides use end posts; geometric turns use one corner post. A corner post also satisfies an adjacent gate-side post. A divider endpoint attached partway along another run shares a run post only when a feasible panel arrangement places a natural boundary there, measured from either end without increasing that run's panel count. Otherwise the divider adds an end post and leaves the perimeter panel layout unchanged. Single gates add two hinges and one latch. Double gates add four hinges, one latch, and one center drop pole, with no center post.

Gate opening quantities remain grouped by single/double intent and exact measured width. Product IDs, panel heights/styles, reinforced gate-post SKUs, brackets, concrete, caps, screws, waste percentage, pricing, labor, and supplier behavior are deliberately absent until owner rules or catalog records are supplied.

## Site Walk boundary

Site Walk requests browser geolocation only after a user taps a mark button. Each request asks for a fresh high-accuracy fix with a 20-second timeout. The first fix defines an in-memory latitude/longitude origin mapped to a local integer-millimeter plan point. Later fixes use a deterministic local tangent-plane projection: longitude produces east/west X and latitude produces north/south Y. The absolute origin and raw fixes remain transient UI state and are excluded from the schema, JSON, local storage, and notices.

The phone-reported accuracy radius is displayed. GPS supplies approximate shape only. A last-run editor puts the tape, wheel, or laser value into the exact-length solver so field measurement overrides GPS distance. Optional angle assistance may rotate an unconnected GPS run to 45°/90°. House and existing-run connections take priority within a capped tolerance derived from reported accuracy. **Separate line next** starts a disconnected Site Walk path; later endpoints can attach geometrically to existing runs.

## KGIS boundary

The official KGIS viewer supports address parameters and publishes Knox County parcel, address, building-footprint, and aerial context. This slice builds only an encoded link to `https://www.kgis.org/kgismaps/Map.htm` and opens it after an explicit user action. McKenzie OS sends no background request and imports no KGIS geometry or attributes. Parcel and building lines are labeled reference-only and cannot affect the measured house, fence geometry, or totals.

Direct geometry import is intentionally deferred. The documented ArcGIS service returned HTTP 401 during an external compatibility check, so adding a client fetch, credential workaround, or unreviewed server proxy would break this prototype's isolation and access boundary. A future adapter needs KGIS-approved access, licensing/attribution review, server-side reliability controls, and explicit conversion from Tennessee State Plane (WKID 2915). Parcel lines must remain non-survey context and building dimensions must be field-confirmed.

## Manual property-reference boundary

The Property panel creates validated external links for Acres, KGIS, and Google Maps only after the user enters an address and chooses a provider. Acres opens its official map for the user to search because Acres Plus provides no supported geometry export or API. Google Maps opens through its official no-key search URL and remains a separate viewer; Google Earth imagery is not accepted as a commercial upload source.

A user may explicitly capture a visible desktop browser tab, paste an image from the browser clipboard, or load one local PNG, JPEG, or WebP reference image that they are permitted to use. Capture uses the browser's user-initiated display picker; the tool cannot silently select or inspect a tab. Clipboard and display pixels are rasterized locally to JPEG with a maximum 2,000-pixel edge. The image is rendered below plan geometry without upload, database, server, or provider request. Its transform stores local-plan position, scale, rotation, opacity, and lock state separately from `FenceDesign`. Two tapped plan positions and an exact entered distance produce a deterministic uniform scale about the first point. Image calibration, movement, visibility, and removal never mutate `FenceDesign`, history, totals, gates, or house measurements.

Reference image, grid, house, and dimension labels can be independently shown or hidden. Fence runs and points stay visible and authoritative. Locking the image disables calibration, rotation, fitting, and positional nudges while leaving plan navigation and fence editing available. An explicit **Save local** action stores the compressed image and transform under a versioned reference key separate from design JSON. **Load local** validates both records before use. Removing the image immediately removes only that reference record. Browser quota remains a possible limit, so failure is reported without modifying the fence design.

**Close to house** requires the path's first point to be anchored to a house edge and at least two measured runs. The user taps the intended second house connection, which is projected to the nearest footprint edge. A deterministic forward/backward reaching solver keeps the first and last connections fixed, preserves the measured length of every fence and gate run within two millimeters of integer-coordinate rounding, and distributes correction across every available interior angle. Reachability is checked before solving; impossible geometry is reported without changing the design. After closure, changing any exact run length re-solves the whole anchored chain while preserving both house connections and every other measured run.

## Explicit boundary and next slice

The Deck Designer was reviewed only as a read-only interaction reference. Its local-photo flow treats photos as unmeasured visual evidence, so this prototype implements its own isolated transform rather than importing Deck code. Automatic address search, aerial imagery, and parcel/lot geometry still require approved geocoding, imagery, and parcel-provider adapters plus explicit accuracy and legal-boundary warnings. A future adapter may replace the manual reference image, but it must remain visually and structurally separate from authoritative field measurements.

Google is approved only as a third candidate in a later time-boxed renderer spike after this neutral boundary, not as the selected provider. No SDK, dependency, API key, environment variable, billing account, map ID, geocoder, or cloud resource is present. Before that spike, the owner must authorize one restricted non-Production browser key, a named billing cap and alerts, and an approved deidentified Knoxville-area evaluation set. The blank scoring and pass/fail record is `docs/PROVIDER_EVIDENCE_MATRIX.md`.
