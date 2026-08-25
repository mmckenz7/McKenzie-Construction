# Fence Visual Measure

An isolated, local-only 2D fence measurement prototype.

```sh
npm install
npm run validate
npm run dev
```

Open the local URL, add the measured house when needed, choose **Draw**, then tap or click to place connected points. Draw continues from the last point by default. Choose **Separate line** to start a divider or secondary fence anywhere; tapping near an existing run attaches the new endpoint partway along that run without forcing it to the corner. Free angle is the default, while house and fence-run connections remain active independently of optional 45°/90° assistance. Each line stays independently editable and the displayed total combines every perimeter, divider, and gate run. **Close to house** keeps both house connections and all measured runs fixed while redistributing flexible angles. Escape finishes the active tool, the wheel zooms only the plan, and two-finger or Command-drag pans. Saving uses only this browser's local storage, including automatic migration of prior local designs.
