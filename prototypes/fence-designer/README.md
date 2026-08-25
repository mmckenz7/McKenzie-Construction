# Fence Visual Measure

An isolated, local-only 2D fence measurement prototype.

```sh
npm install
npm run validate
npm run dev
```

Open the local URL, add the measured house when needed, choose **Draw**, then tap or click to place connected points. Draw continues from the last point by default. Choose **Separate line** to start a divider or secondary fence anywhere. **Site walk** provides large mobile controls that request a fresh high-accuracy browser location only when **Mark** is tapped. The first fix establishes a transient local origin, later fixes add plan points, and the latest GPS-shaped run can immediately be replaced with an exact tape, wheel, or laser measurement. Latitude and longitude are never serialized.

While drawing, the changing run length stays in a fixed on-canvas measurement box so it does not cover the target or reference image. After placement, completed dimensions render beside their fence runs with leaders, automatically separate from nearby labels, stay inside the visible plan, avoid unrelated runs when space allows, and remain a stable visual size while zooming. A selected span provides **Flip dimension side** for tight layouts plus **Auto-position dimension** to return it to automatic placement.

**Property** provides free/manual reference links for Acres, KGIS, and Google Maps. On desktop, open the permitted Acres or KGIS view and use **Capture map tab**, or copy a screenshot and use **Paste image**; no screenshot file needs to be managed. PNG, JPEG, and WebP upload remains a fallback. The captured image is compressed to a maximum 2,000-pixel edge, can be positioned, rotated, faded, locked, and scaled by entering a known distance and tapping its two endpoints. Reference image, grid, house, and dimension visibility are independent. **Save local** stores the reference separately from the fence design in this browser only. It is excluded from fence history and totals and never replaces field measurements. Google Maps remains a separate viewer.

Free angle is the default, optional 45°/90° assistance remains available, and the displayed total combines every perimeter, divider, and gate run. Saving uses only this browser's local storage.

**Materials** opens the first derived takeoff: **Black Aluminum**. It uses 8-foot panels, separate end/corner/run posts, two hinges and one latch per single gate, and four hinges, one latch, and one center drop pole per double gate. Both sides of a gate receive a post; a corner post satisfies the gate-side post when the gate begins directly at that corner. A divider connected partway along a perimeter shares a run post when it lands on a natural panel boundary measured from either end of the run; otherwise the divider receives another end post without changing the perimeter panel layout. Panels round up per uninterrupted straight fence run and cutoffs are not silently reused. **Show takeoff on plan** displays the derived panel spans, cut panels, and end/corner/run post decisions directly over the editable layout; run-numbered markers correspond to a collapsible audit list that spells out panel lengths and why each post was counted. **Copy takeoff** places the same deterministic preliminary counts and decision breakdown into plain text for comparison or field notes. This audit layer is session-only and never changes or saves measurement geometry. Takeoffs contain no products, SKUs, costs, markup, labor, or pricing and are not persisted into measurement geometry.
