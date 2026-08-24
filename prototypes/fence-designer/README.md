# Fence Visual Measure

An isolated, local-only 2D fence measurement prototype.

```sh
npm install
npm run validate
npm run dev
```

Open the local URL, choose **Draw**, then tap or click to place connected points. Free angle is the default and a dashed live run shows feet/inches before placement; optional 45°/90° assistance is available when useful. Exact lengths and house connections take priority. With **Lengths** locked, dragging a point adjusts the angle while preserving its incoming run and moving every following point with it; unlock lengths for free reshaping. Select a point and choose **Add gate** to insert a single or double gate with an exact total opening width. Escape cancels the current tool, the wheel zooms only the plan, and two-finger or Command-drag pans without changing tools. Saving uses only this browser's local storage.
