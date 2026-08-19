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
