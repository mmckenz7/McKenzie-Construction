# Beta Preparation Audit

Date: 2026-08-09
Branch: `beta/estimating-core`
Scope: local working copy only; no commit, push, deployment, secret operation, or database write.

## Locally ready

- The estimate builder accepts separate material, labor, subcontractor,
  equipment, and other direct-cost lines with independent quantity, unit, and
  unit cost.
- Raw cost and OH&P previews react to unsaved line input. OH&P supports a
  slider, exact percentage, and exact dollar override.
- Customer presentation supports lump sum, section summary, and itemized line
  totals, with distributed or separate-line OH&P where applicable.
- A saved customer presentation can be opened as a branded printable estimate
  and printed or saved as PDF.
- The customer-document projection excludes raw costs, private descriptions,
  markup percentages, profit, and margin, and refuses unsupported snapshots.
- Internal navigation uses permission-aware expandable sidebar groups rather
  than the detached workspace selector. Expanded groups scroll independently
  inside the fixed desktop sidebar, while compact layouts retain horizontal
  navigation scrolling.
- Financial reports now require both Administration workspace access and the
  effective `view_profit` permission at the API, page, and navigation layers.
- Calculation and presentation tests cover exact-cent reconciliation and a
  100-line itemized customer estimate.

## Validation result

- Node test suite: passed, 292 tests including the 100-line and sidebar-overflow
  regression tests.
- ESLint: passed with 0 errors and 23 pre-existing warnings.
- TypeScript: passed with `npx tsc --noEmit`.
- Production build: passed with Next.js 16.3.0; all routes compiled.
- Whitespace validation: passed with `git diff --check`.

The final focused/full checks should be rerun immediately before any approved
commit because this audit describes an uncommitted working tree.

## Known blockers and follow-ups

1. The printable estimate is an authenticated internal review/PDF flow. The
   existing lead email route is not yet connected to a frozen structured
   estimate document, revocable public proposal token, acceptance lifecycle,
   or automated email delivery.
2. Itemized estimates currently have one public heading and one private
   internal description. A separate long public description requires an
   additive schema and mutation-contract change.
3. Unit-price visibility is not yet a snapshotted template choice. Itemized
   customer output intentionally shows quantity/unit and line total only.
4. A broader legacy API audit found other service-role-backed endpoints that
   authenticate an active employee but do not consistently enforce effective
   workspace/permission checks. High-value examples include procurement
   settings, material catalog, suppliers, project costs, projects, schedules,
   and task routes. Their correct mutation permissions require a product-level
   role matrix before hardening them without breaking field workflows.
5. A signed-in local-sandbox browser smoke test passed for the estimate queue,
   estimate builder, saved material and labor rows, live OH&P controls, exact
   dollar override, customer-display selection, and printable lump-sum preview.
   The preview showed the public description and customer total without exposing
   raw costs, markup, profit, or margin.
6. The repository still reports 23 non-blocking lint warnings in older files,
   primarily missing React hook dependencies and existing unused/`any` values.
7. The uncommitted project-creation route currently derives contract value from
   an accepted estimate and immediately marks that estimate converted. That
   behavior conflicts with the approved nonbinding estimate-acceptance boundary
   and must remain outside the ready commit group until contract preparation,
   signature, and preconstruction release are implemented atomically.

## Required stop point

Do not commit, push, deploy, modify Vercel, or modify either Supabase project
without the owner's next explicit approval.
