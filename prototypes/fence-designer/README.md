# Fence Visual Measure

An isolated, local-only 2D fence measurement prototype.

```sh
npm install
npm run validate
npm run dev
```

Open the local URL, add the measured house when needed, choose **Draw**, then tap or click to place connected points. Draw continues from the last point by default. Choose **Separate line** to start a divider or secondary fence anywhere. **Site walk** provides large mobile controls that request a fresh high-accuracy browser location only when **Mark** is tapped. The first fix establishes a transient local origin, later fixes add plan points, and the latest GPS-shaped run can immediately be replaced with an exact tape, wheel, or laser measurement. Latitude and longitude are never serialized.

While drawing, the changing run length stays in a fixed on-canvas measurement box so it does not cover the target or reference image. After placement, completed dimensions render beside their fence runs with leaders, automatically separate from nearby labels, and remain a stable visual size while zooming. A selected span also provides **Flip dimension side** for tight layouts that need manual presentation control.

**Property** provides free/manual reference links for Acres, KGIS, and Google Maps. On desktop, open the permitted Acres or KGIS view and use **Capture map tab**, or copy a screenshot and use **Paste image**; no screenshot file needs to be managed. PNG, JPEG, and WebP upload remains a fallback. The captured image is compressed to a maximum 2,000-pixel edge, can be positioned, rotated, faded, locked, and scaled by entering a known distance and tapping its two endpoints. Reference image, grid, house, and dimension visibility are independent. **Save local** stores the reference separately from the fence design in this browser only. It is excluded from fence history and totals and never replaces field measurements. Google Maps remains a separate viewer.

Free angle is the default, optional 45°/90° assistance remains available, and the displayed total combines every perimeter, divider, and gate run. Saving uses only this browser's local storage.
