# DeckDesign v5 edge-finish foundation

Status: isolated model and projection foundation; not yet the active browser authority.

DeckDesign v5 adds a sparse `edgeFinishes[]` collection to every platform. Each entry references one exact geometric free-edge ID and records explicit `fasciaEnabled` and `skirtingEnabled` facts. Entries with neither finish are omitted. House-attached, duplicate, stale, or non-current edge references fail normalization.

V1, v2, v3, and v4 imports create no finish entries. This preserves prior geometry and quantities without inventing user intent. V5 stable JSON and fingerprints include finish selection only after it is explicitly recorded.

The deterministic finish projection subtracts every stair opening on the selected edge. It emits stable `fascia-<edge>-span-*` and `skirting-<edge>-span-*` geometry IDs. Fascia reports generic visualization linear feet. Skirting reports generic visualization area between recorded grade and deck elevation. Neither projection chooses products, spacing, ventilation, access panels, waste, labor, prices, fastening, code compliance, or structural adequacy.

Polygon edits reuse the reviewed geometric edge-resolution plan. Preserved or uniquely remapped finish edges may update automatically. Split, ambiguous, or missing selected edges produce explicit `review_required` impacts for fascia and/or skirting and cannot silently move.

Browser activation remains a later slice. It must preserve the current v4 local-storage fallback, pass v1–v5 migration/round-trip and v4/v5 equivalence gates, add undo/redo and local JSON coverage, render the same spans in 2D and 3D, and pass desktop/mobile touch QA before v5 becomes authoritative.
