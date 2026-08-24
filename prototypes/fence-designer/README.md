# Fence Visual Measure

An isolated, local-only 2D fence measurement prototype.

```sh
npm install
npm run validate
npm run dev
```

Open the local URL, choose **Draw**, then tap or click to place connected points. After the first point, a dashed live run shows its feet/inches before placement. **Snap on** uses the one-foot grid, house edges, and 45-degree run bearings; turn it off for free angles. With **Lengths** locked, dragging a point adjusts the angle while preserving its incoming run and moving every following point with it; unlock lengths for free reshaping. Select a point and choose **Add gate** to insert a single or double gate with an exact total opening width. Select any point or span to edit it. Saving uses only this browser's local storage.
