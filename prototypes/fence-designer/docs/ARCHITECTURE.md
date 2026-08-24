# Fence Visual Measure MVP

## Scope

This isolated browser prototype turns an explicitly drawn connected fence path into deterministic plan-view measurements. It supports an optional exact-length-and-width house footprint, point placement, locked-length chain movement or free point movement, point deletion, exact segment-length edits, measured single/double gate openings anchored at a selected point, undo/redo, snap on/off, and local browser save/load. It does not create estimates, quantities, products, labor, prices, customers, or cloud records.

Everything under `prototypes/fence-designer/` is prototype-owned. Source cannot import outside this directory, access Supabase, read environment variables, or use browser network primitives. No migration or shared domain model is introduced.

## Measurement model

The authoritative document is a single ordered connected path:

- points store integer local-plan `xMm` and `yMm` coordinates;
- an optional rectangular house footprint stores integer origin, length, and width values, remains visual context only, and is excluded from fence totals;
- segments reference adjacent points and carry `fence` or `gate` intent; gate segments additionally record `single` or `double` opening intent;
- geometric segment length is Euclidean distance rounded once to the nearest millimeter;
- total length is the sum of those rounded integer segment lengths;
- feet/inches are presentation conversions, rounded to the nearest inch;
- exact-length editing keeps a segment's start fixed and moves its end along the existing bearing. If the moved point also begins the next segment, that following segment changes visibly and deterministically.

The first and last points are open endpoints. Interior points are corners when their path deflection exceeds two degrees. Adding a gate at a point consumes the entered total width from the following span and splits that span, or extends the path along the preceding bearing when the selected point is the final endpoint. A lone point cannot supply a direction. Single/double is opening intent only; it carries no leaf-sizing formula, product, assembly, post, hardware, or pricing rules.

Undo/redo stores validated whole-document snapshots. Stable JSON is schema-versioned and saved only to browser local storage after an explicit Save action. Loading validates and normalizes the document before it becomes active.

Snap is UI editing state rather than a design fact. When enabled, pointer placement rounds to the nearest 305 millimeters (approximately one foot), and a point within 460 millimeters of any house edge lands exactly on that edge so a fence may connect midway along the house. When disabled, pointer placement rounds only to the nearest millimeter and does not magnetize to the house. Exact numeric edits bypass pointer snapping.

Length lock is also UI editing state. When enabled, dragging the first point translates the whole path. Dragging any later point preserves the incoming segment length, moves that point around the preceding point, and translates every following point by the same delta. This preserves all segment and gate widths while angles change. Disabling length lock restores free single-point movement and allows adjacent dimensions to change.

## Explicit boundary and next slice

The Deck Designer was reviewed only as a read-only interaction reference. Its local-photo flow treats photos as unmeasured visual evidence and provides no reusable two-point pixel calibration. This MVP therefore does not include photo/map upload or calibration. Address search, aerial imagery, and parcel/lot context require approved geocoding, imagery, and parcel-provider adapters plus explicit accuracy and legal-boundary warnings; they must not be fabricated or treated as survey truth. A next slice can add those provider-backed context layers or a local image layer with two calibration anchors, an explicitly entered real-world calibration distance, and a versioned pixel-to-millimeter transform.
