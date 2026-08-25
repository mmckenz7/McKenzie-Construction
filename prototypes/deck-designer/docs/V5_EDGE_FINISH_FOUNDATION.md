# DeckDesign v5 edge-finish foundation

Status: active isolated browser authority after v4/v5 equivalence and desktop/mobile gates.

DeckDesign v5 adds a sparse `edgeFinishes[]` collection to every platform. Each entry references one exact geometric free-edge ID and records explicit `fasciaEnabled` and `skirtingEnabled` facts. Entries with neither finish are omitted. House-attached, duplicate, stale, or non-current edge references fail normalization.

V1, v2, v3, and v4 imports create no finish entries. This preserves prior geometry and quantities without inventing user intent. V5 stable JSON and fingerprints include finish selection only after it is explicitly recorded.

The deterministic finish projection subtracts every stair opening on the selected edge. It emits stable `fascia-<edge>-span-*` and `skirting-<edge>-span-*` geometry IDs. Fascia reports generic visualization linear feet. Skirting reports generic visualization area between recorded grade and deck elevation. Neither projection chooses products, spacing, ventilation, access panels, waste, labor, prices, fastening, code compliance, or structural adequacy.

Polygon edits reuse the reviewed geometric edge-resolution plan. Preserved or uniquely remapped finish edges may update automatically. Split, ambiguous, or missing selected edges produce explicit `review_required` impacts for fascia and/or skirting and cannot silently move.

Browser activation preserves the current v4 local-storage fallback and writes only the prototype-owned v5 key. V1–v5 migration/round-trip, v4/v5 rectangle and L-shape equivalence, undo/redo, stale-storage recovery, local JSON, exact 2D/3D span, quantity, and desktop/mobile touch gates passed before v5 became authoritative. Skirting height is shown as a recorded grade-to-deck panel height; sloped grade, openings, ventilation, access, product selection, waste, labor, price, and code compliance remain explicitly outside this conceptual projection.
