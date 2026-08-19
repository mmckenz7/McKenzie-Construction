# Custom polygon contract spike

Status: isolated kernel research only. This does not change `DeckDesign v2`, production code, persistence, APIs, quantities, or the future estimating adapter.

An isolated `modelV3` migration spike now exercises the proposed contract without switching the application or local-storage format. It migrates v1/v2 rectangle and L-shape designs into `platforms[]`, canonical outer/hole rings, geometric edge conditions, and edge-referenced rail/stair intent. The former L cutout becomes a concave outer ring; no redundant width/projection/cutout facts survive inside the v3 platform.

A non-mutating region-replacement planner compares a proposed ring with the recorded v3 platform. It lists automatic one-to-one remaps, new edges, and blocking impacts. Ambiguous or missing edges block only when they carry house-attachment, active-railing, or enabled-stair intent; otherwise new free geometry can proceed without inventing an attachment decision.

## Proposed future authoritative facts

A future design version may replace shape-specific dimensions with one open outer ring of 3–24 `{ x, z }` vertices in inches. The closing vertex is omitted. Normalization rounds to hundredths of an inch, enforces positive winding, and rotates the ring to a stable lowest-`z`/lowest-`x` start vertex. Adjacent duplicates, redundant collinear vertices, self-intersections, out-of-bounds coordinates, and areas below four square feet fail closed.

The ring—not generated meshes or quantities—would be authoritative. Stable ordered edge IDs, area, outward normals, and horizontal/vertical scanline intervals are deterministic projections. The scanline intervals are the candidate foundation for board and joist segmentation through concave shapes.

An isolated region kernel also proves up to eight strictly contained, non-touching, non-overlapping hole rings. Region area subtracts normalized hole areas, and horizontal/vertical member intervals split deterministically around voids. These are still kernel semantics only, not DeckDesign facts.

The projection spike now triangulates simple concave outer rings with stable triangle IDs and area preservation. It also generates deterministic board and joist segments across a polygon region, splitting members around holes and recording reproducible total lengths. Hole-aware surface triangulation remains intentionally separate and unproven.

A neutral report spike packages net/gross/hole measurements, stable geometry references, and generic quantity lines. Area, perimeter, and decking intent are labeled `takeoff_candidate`; conceptual joist length/count remain `visualization`. Every report carries conceptual, field-verification, and non-structural warnings. It deliberately excludes products, catalogs, suppliers, prices, labor, waste, margin, and estimate calculations.

## Migration and integration direction

- Rectangle and L-shape facts can migrate deterministically into canonical rings.
- No v3 migration should ship until dimension-edit commands and backward JSON compatibility are defined.
- Holes/cutouts should be separate normalized rings, not sentinel vertices in the outer ring; containment and overlap rejection are now proven in the isolated kernel.
- Multi-level platforms should compose independent rings with explicit elevations and connections; they should not overload one polygon.
- The future takeoff adapter should receive traceable normalized measurements and stable edge identities. Product selection, price, labor, waste, margin, structural conclusions, and field verification remain outside this kernel.

## Open decisions before model integration

- Whether user-facing semantic edge labels survive arbitrary edits or are command metadata.
- Whether the first UI permits arbitrary angles or begins with orthogonal-only editing.
- Minimum edge length, snapping policy, and tolerance rules for imported designs.
- Versioned treatment of edge-attached stairs and railings when vertices are inserted, removed, or reordered.
- Hole-aware triangulation and 3D extrusion strategy without making render triangles authoritative.

## Edge identity experiment

The kernel now exposes coordinate-derived edge IDs alongside sequential projection IDs. Canonical-equivalent rings produce identical IDs, and inserting a localized notch preserves every untouched edge ID. A resolver classifies references as `preserved`, `remapped`, `review_required`, or `missing`: one collinear successor is an unambiguous remap, while a split edge yields multiple review candidates. This is useful for deterministic diffing, but moving or splitting an attached edge necessarily changes its geometric identity. Recommendation: do not silently treat a coordinate ID as permanent attachment identity. A future edit command should preserve explicit attachment records when unambiguous and require review when an edge moves, splits, merges, or disappears.
