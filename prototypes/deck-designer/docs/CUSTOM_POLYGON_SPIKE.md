# Custom polygon contract spike

Status: isolated kernel research only. This does not change `DeckDesign v2`, production code, persistence, APIs, quantities, or the future estimating adapter.

## Proposed future authoritative facts

A future design version may replace shape-specific dimensions with one open outer ring of 3–24 `{ x, z }` vertices in inches. The closing vertex is omitted. Normalization rounds to hundredths of an inch, enforces positive winding, and rotates the ring to a stable lowest-`z`/lowest-`x` start vertex. Adjacent duplicates, redundant collinear vertices, self-intersections, out-of-bounds coordinates, and areas below four square feet fail closed.

The ring—not generated meshes or quantities—would be authoritative. Stable ordered edge IDs, area, outward normals, and horizontal/vertical scanline intervals are deterministic projections. The scanline intervals are the candidate foundation for board and joist segmentation through concave shapes.

## Migration and integration direction

- Rectangle and L-shape facts can migrate deterministically into canonical rings.
- No v3 migration should ship until dimension-edit commands and backward JSON compatibility are defined.
- Holes/cutouts should be separate normalized rings, not sentinel vertices in the outer ring.
- Multi-level platforms should compose independent rings with explicit elevations and connections; they should not overload one polygon.
- The future takeoff adapter should receive traceable normalized measurements and stable edge identities. Product selection, price, labor, waste, margin, structural conclusions, and field verification remain outside this kernel.

## Open decisions before model integration

- Whether user-facing semantic edge labels survive arbitrary edits or are command metadata.
- Whether the first UI permits arbitrary angles or begins with orthogonal-only editing.
- Minimum edge length, snapping policy, and tolerance rules for imported designs.
- Versioned treatment of edge-attached stairs and railings when vertices are inserted, removed, or reordered.
