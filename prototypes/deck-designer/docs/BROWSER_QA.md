# Browser QA record

## 2026-08-19 responsive smoke check

Scope: isolated DeckDesign v2 browser application before any v3 activation.

- Desktop default viewport: measured plan and live 3D model render side by side; L-shape-with-landing template produces 270 sq ft and seven conceptual stair treads with no console errors.
- Tablet at 768 × 1024: 753 CSS-pixel content viewport, 753-pixel document width, two 530-pixel-high visual cards, no horizontal overflow, no console errors.
- Mobile at 390 × 844: 375 CSS-pixel content viewport, 375-pixel document width, two 438-pixel-high visual cards, equal-width header actions, no horizontal overflow, no console errors.
- Desktop visual mounts: measured plan and 3D mount are each 471 CSS pixels high; the WebGL canvas matches its mount dimensions exactly.
- Automatic Preview for commit `f003d71` reached READY and returned HTTP 200 before this layout slice.

The smoke check found and corrected a flex/grid feedback loop caused by percentage-height visual children inside intrinsically sized grid cards. Visual cards now have bounded responsive heights, and the high-density WebGL drawing buffer is scaled to its mount instead of expanding layout.

Remaining Phase A visual-quality gap: durable golden screenshot automation and checks in additional browser engines.

## 2026-08-19 v3 polygon and movable-stair check

- Existing v2 local state migrated to the new v3 key and loaded as a four-corner polygon; the prior v2 key remained untouched by automated tests.
- Explicit outline unlock cleared protected edge options before geometry edits.
- Added one rectangular offset and then a second offset on another edge, producing a valid 12-corner outline; 2D, 3D, and deterministic area updated together.
- Attached stairs to an exact geometric edge and changed the bounded stair position to 72 inches; the plan and 3D stair run updated without changing quantity semantics.
- Desktop visual inspection confirmed editable corner handles, the orange stair handle, the two-offset outline, and matching procedural 3D geometry.
- Existing responsive rules remain unchanged: the visual workspace is sticky only above 1050 pixels and returns to normal flow at tablet/mobile widths.

## 2026-08-19 sidebar clarity and sticky workspace check

- Replaced drafting jargon in the primary controls with plain-language deck width, distance-from-house, deck height, ground, railing, and stair labels.
- Added short explanations for plan orientation, drag steps, house-wall positions, and stair position.
- Desktop at 1060 CSS pixels: after 1,350 pixels of page scroll, the 2D/3D workspace remained pinned at viewport top with no console errors.
- Tablet at 768 × 1024: sticky behavior correctly disabled, content returned to normal flow, and 753-pixel content width matched document width with no horizontal overflow.
