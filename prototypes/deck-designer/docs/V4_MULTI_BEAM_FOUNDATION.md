# DeckDesign v4 multi-beam foundation

Status: isolated prototype model/projection foundation; not active in the browser editor yet.

DeckDesign v4 replaces each platform's legacy single `beamInset` and `maxPostSpacing` pair with one to six stable conceptual beam-line facts:

```json
{
  "framing": {
    "joistSpacing": 16,
    "beamLines": [
      { "id": "beam-line-1", "offsetFromOutside": 24, "maxSupportSpacing": 72 }
    ]
  }
}
```

The offset is measured perpendicular to the beam from the outside axis bound selected by deck-board direction. Normalization requires stable lowercase IDs, distinct offsets, six inches of axis clearance, and recorded conceptual support spacing between 24 and 120 inches. Lines sort deterministically by offset and then ID.

V1, v2, and v3 imports create exactly one `beam-line-1` while preserving the recorded legacy inset and spacing. V4 JSON round-trips through normalization and fingerprinting. The v4 geometry projection clips every line around the authoritative polygon and holes, assigns stable line-derived segment/support IDs, and distributes supports independently for each recorded line.

This model records conceptual framing intent only. It does not select beam size, ply count, species, footing, attachment, hardware, span table, soil capacity, code compliance, or structural adequacy. Browser activation requires deterministic warning and quantity projections, history/storage migration tests, dual v3/v4 equivalence gates, and validated editing controls before the v4 local key becomes authoritative.

Controller compatibility: approved for isolated development. Review is required again before any future OS integration.
