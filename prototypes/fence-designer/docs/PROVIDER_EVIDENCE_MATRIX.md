# Fence renderer provider evidence matrix

Status: blank evaluation template; no provider selected

Use this only after the Controller authorizes a time-boxed provider spike, restricted non-Production credentials, billing limits, and a deidentified evaluation set. Do not record customer names, full addresses, credentials, or unlicensed screenshots here.

Google-candidate planning ceiling, not authorization: maximum 2,000 map loads and 500 geocodes in one month; $10 gross monthly spend cap if eligible; alerts at 50%, 80%, and 100% of both usage ceilings and the $10 cap; spike-only rate quotas of 10 map loads and 10 geocodes per minute where supported. Stop at either 100% usage ceiling even if current monthly no-cost allowances have not been exhausted.

## Spike identity

| Field | Evidence |
| --- | --- |
| Candidate/provider version | |
| Renderer adapter version | |
| Evaluation dates | |
| Technical reviewer | |
| Business reviewer | |
| Approved Cloud/billing owner | |
| Credential restrictions verified | |
| Monthly quota, budget alert, and hard-stop plan | |
| Terms/licensing version reviewed | |

## Required pass/fail gates

| Gate | Pass/fail | Evidence or blocker |
| --- | --- | --- |
| Provider classes absent from saved Fence geometry | | |
| Existing layout opens and remains editable when provider is offline | | |
| Renderer can be destroyed/replaced without losing geometry | | |
| Address result requires explicit confirmation | | |
| Geocoder storage mode and retained fields are approved | | |
| Attribution remains visible in all supported layouts | | |
| Aerial/parcel input stays preliminary | | |
| Phone GPS stays field-captured and does not auto-verify | | |
| Live GPS marker and accuracy circle never snap/mutate Fence geometry | | |
| Moasure source and explicit verification remain distinct | | |
| No DrawingManager/deprecated drawing dependency | | |
| Parcel visibility changes leave stable Fence JSON unchanged | | |
| GeoJSON/KML export is explicit, local, provider-neutral, and fails without WGS84 registration | | |

## Deidentified property evidence

Use opaque case IDs only.

| Case ID | Property pattern | Imagery resolution/usefulness | Observable imagery vintage | Building/parcel alignment | Tree/obstruction visibility | Address match quality | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | dense residential | | | | | | |
| | suburban | | | | | | |
| | wooded/tree line | | | | | | |
| | large/rural | | | | | | |
| | corner lot | | | | | | |
| | ambiguous address/driveway | | | | | | |
| | recent development | | | | | | |

## Interaction and accessibility

| Test | Desktop | Mobile/touch | Keyboard/screen reader | Evidence |
| --- | --- | --- | --- | --- |
| Initial load and fit | | | | |
| Place, move, and delete node | | | | |
| Draw and edit free-angle run | | | | |
| Pan/zoom without page scroll | | | | |
| Switch base imagery | | | | |
| Stack parcel/GPS/Moasure/LiDAR/CAD overlays | | | | |
| Offline/recovery behavior | | | | |
| Provider replacement/remount | | | | |
| Focus order and visible focus | | | | |
| Accessible labels/instructions | | | | |
| Live-location Start/Stop, stale state, accuracy tiers, and five-minute stop | | | | |

## Cost and operations

| Measure | Result | Source |
| --- | --- | --- |
| Billable map-load trigger | | Provider documentation/dashboard |
| Billable address-search trigger | | Provider documentation/dashboard |
| Free monthly allowance | | Provider pricing page |
| Observed usage per completed layout | | Provider dashboard export |
| Projected low/expected/high monthly cost | | Approved usage assumptions |
| Quota and alert behavior tested | | Cloud console evidence |
| Rate limit/outage error behavior | | Test record |
| Support/SLA required | | Business decision |

## Replacement decision

| Criterion | Weight | Score | Evidence |
| --- | ---: | ---: | --- |
| Target-area imagery usefulness | 25 | | |
| Geometry interaction/mobile quality | 20 | | |
| Accessibility | 10 | | |
| Terms, storage, and attribution fit | 15 | | |
| Cost predictability | 10 | | |
| Offline/recovery behavior | 10 | | |
| Provider replacement effort | 10 | | |
| **Total** | **100** | | |

Final recommendation must name approvers, unresolved risks, the approved storage mode, and why the provider can be replaced without rewriting Fence geometry or takeoff rules.
