# Fence Visual Measure MVP

## Scope

This isolated browser prototype turns explicitly drawn perimeter and divider fence lines into deterministic plan-view measurements. It supports an optional exact-length-and-width house footprint, multiple independent ordered lines, midpoint connections to existing runs, locked-length movement or free point movement, point deletion, exact segment-length edits, measured single/double gate openings, undo/redo, angle assistance on/off, and local browser save/load. It does not create estimates, quantities, products, labor, prices, customers, or cloud records.

Everything under `prototypes/fence-designer/` is prototype-owned. Source cannot import outside this directory, access Supabase, read environment variables, or use browser network primitives. No migration or shared domain model is introduced.

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

**Close to house** requires the path's first point to be anchored to a house edge and at least two measured runs. The user taps the intended second house connection, which is projected to the nearest footprint edge. A deterministic forward/backward reaching solver keeps the first and last connections fixed, preserves the measured length of every fence and gate run within two millimeters of integer-coordinate rounding, and distributes correction across every available interior angle. Reachability is checked before solving; impossible geometry is reported without changing the design. After closure, changing any exact run length re-solves the whole anchored chain while preserving both house connections and every other measured run.

## Explicit boundary and next slice

The Deck Designer was reviewed only as a read-only interaction reference. Its local-photo flow treats photos as unmeasured visual evidence and provides no reusable two-point pixel calibration. This MVP therefore does not include photo/map upload or calibration. Address search, aerial imagery, and parcel/lot context require approved geocoding, imagery, and parcel-provider adapters plus explicit accuracy and legal-boundary warnings; they must not be fabricated or treated as survey truth. A next slice can add those provider-backed context layers or a local image layer with two calibration anchors, an explicitly entered real-world calibration distance, and a versioned pixel-to-millimeter transform.
