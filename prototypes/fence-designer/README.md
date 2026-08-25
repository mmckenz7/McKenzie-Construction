# Fence Visual Measure

An isolated, local-only 2D fence measurement prototype.

```sh
npm install
npm run validate
npm run dev
```

Open the local URL, add the measured house when needed, choose **Draw**, then tap or click to place connected points. Draw continues from the last point by default. Choose **Separate line** to start a divider or secondary fence anywhere. **Site walk** provides large mobile controls that request a fresh high-accuracy browser location only when **Mark** is tapped. The first fix establishes a transient local origin, later fixes add plan points, and the latest GPS-shaped run can immediately be replaced with an exact tape, wheel, or laser measurement. Latitude and longitude are never serialized. **KGIS** opens the official Knox County aerial/property viewer by street address in a separate tab; its building and parcel lines remain reference-only and are never counted as fence measurements. Free angle is the default, optional 45°/90° assistance remains available, and the displayed total combines every perimeter, divider, and gate run. Saving uses only this browser's local storage.
