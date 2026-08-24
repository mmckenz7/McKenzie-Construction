# Fence Visual Measure MVP

## Scope

This isolated browser prototype turns an explicitly drawn connected fence path into deterministic plan-view measurements. It supports point placement, point movement and deletion, exact segment-length edits, whole-run gate labels, undo/redo, and local browser save/load. It does not create estimates, quantities, products, labor, prices, customers, or cloud records.

Everything under `prototypes/fence-designer/` is prototype-owned. Source cannot import outside this directory, access Supabase, read environment variables, or use browser network primitives. No migration or shared domain model is introduced.

## Measurement model

The authoritative document is a single ordered connected path:

- points store integer local-plan `xMm` and `yMm` coordinates;
- segments reference adjacent points and carry only `fence` or `gate` intent;
- geometric segment length is Euclidean distance rounded once to the nearest millimeter;
- total length is the sum of those rounded integer segment lengths;
- feet/inches are presentation conversions, rounded to the nearest inch;
- exact-length editing keeps a segment's start fixed and moves its end along the existing bearing. If the moved point also begins the next segment, that following segment changes visibly and deterministically.

The first and last points are open endpoints. Interior points are corners when their path deflection exceeds two degrees. A gate label means only that the selected entire measured span is intended as a gate opening; it carries no product, assembly, post, hardware, or pricing rules.

Undo/redo stores validated whole-document snapshots. Stable JSON is schema-versioned and saved only to browser local storage after an explicit Save action. Loading validates and normalizes the document before it becomes active.

## Explicit boundary and next slice

The Deck Designer was reviewed only as a read-only interaction reference. Its local-photo flow treats photos as unmeasured visual evidence and provides no reusable two-point pixel calibration. This MVP therefore does not include photo/map upload or calibration. A next slice can add a local image layer, two calibration anchors, an explicitly entered real-world calibration distance, and a versioned pixel-to-millimeter transform—with tests for invalid, zero-length, and round-trip calibration—without changing this document model.
