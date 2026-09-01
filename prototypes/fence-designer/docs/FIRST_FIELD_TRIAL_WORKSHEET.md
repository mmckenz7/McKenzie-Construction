# Fence Visual Measure — first supervised field trial

Use this worksheet for the immediate real user's actual fence system. Keep an independent field record beside the prototype. The prototype is a preliminary measurement and takeoff aid; it is not a survey, legal boundary, product order, price, or construction approval.

## Trial record

- Trial date/time:
- Operator:
- Independent verifier:
- Job reference (no customer secrets in screenshots):
- Device:
- Browser/version:
- Preview deployment and commit shown for the trial:
- Minimum validated application source: `1005a688748480b78a1c14e43c763a0c27ee546a` (or a reviewed descendant)
- Measurement tool: tape / wheel / laser / other reviewed hardware
- Reference photos or screenshots approved for deidentified QA: yes / no

Do not use consumer-phone GPS as the measurement source. Parcel, aerial, reference-image, and rectangular-house layers are context only. Confirm every construction measurement independently in the field.

## Actual fence system

- Manufacturer:
- Product family/system:
- Material:
- Style:
- Height:
- Color/finish:
- Source of system rules (manufacturer document, installer standard, supplier packet):
- Rule source date/version:
- Profile ID:
- Profile version:
- Profile content hash:
- Profile state: draft/unvalidated / reviewed sample / activated for bounded beta
- Profile author:
- Independent profile reviewer:

Record the applicable rules before comparing takeoff:

- Standard panel, bay, or stock width:
- Cut-panel or cutoff-reuse rule:
- Line/end/corner/T posts:
- Gate-post or reinforced-post rule:
- Single/double gate fabrication rule:
- Gate hardware:
- Footing/hole/concrete rule:
- Caps, trim, fasteners, waste, or other required accessories:
- Slope handling: level / stepped / racked / unresolved

If these rules are incomplete, run a geometry-only trial and label the takeoff comparison **not evaluated**. Do not substitute Black Aluminum or Treated Pine assumptions for a different system.

Activation requires the exact profile hash above to match the reviewed draft, a separately completed human takeoff for this sample, and an independent reviewer. A rule change creates a new version; it never silently replaces this record.

## Field geometry

Sketch and label every physical run before entering it. Identify each as perimeter, house-connected, divider/T, or independent line.

| Run | From → to | Verified length | Turn/direction | Connection/end condition | Slope/obstruction | Prototype result | Match? |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| R1 |  |  |  |  |  |  |  |
| R2 |  |  |  |  |  |  |  |
| R3 |  |  |  |  |  |  |  |
| R4 |  |  |  |  |  |  |  |
| R5 |  |  |  |  |  |  |  |

- Independent field total:
- Prototype displayed total:
- Missing or extra runs:
- Unknown-angle method and verification:
- Property-line or setback questions kept outside the prototype:

## Gates

Mark the same physical ends as **Post A** and **Post B** on the field sketch and in the editor.

| Gate | Run | Single/double | Opening width | Measured from A/B | Distance to nearest gate edge | Fence before | Fence after | Match? |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | --- |
| G1 |  |  |  |  |  |  |  |  |
| G2 |  |  |  |  |  |  |  |  |

For at least one gate, verify that an equivalent Post A and Post B entry produces the same location and surrounding fence lengths.

## Supervised workflow

1. Retain the independent paper or digital field measurements.
2. Open the exact protected Fence Preview and confirm the expected commit.
3. Use **Quick layout** for exact cardinal/relative runs. Use **Draw** only to establish an unknown direction, then replace the rough length with the field measurement.
4. Add dividers or independent lines explicitly; do not force them into the perimeter.
5. Add each gate using the visibly marked Post A or Post B and its exact field distance.
6. Compare every run, gate, connection, and total before confirming the layout.
7. Use **Save local** on the same device. Capture a deidentified plan screenshot and copy the preliminary takeoff text if takeoff rules are eligible for comparison.
8. Undo/redo one real edit, then reload the locally saved design and verify the exact layout returns.
9. Compare any takeoff against an independent human calculation using the documented fence-system rules.
10. Do not place an order, set a price, or create an estimate solely from this prototype.

## Pass criteria

- Every run and gate matches the independent field record at the displayed nearest-inch precision.
- The topology has no missing, extra, joined, or separated runs.
- Gate width and location match, including the Post A/Post B equivalence check.
- Total length reconciles with the authoritative field record and documented rounding.
- Undo/redo and local save/load restore the same design.
- The phone/tablet layout remains usable without horizontal overflow or hidden required controls.
- There is no crash, blank state, unexplained revision, or lost local design.
- If evaluated, every takeoff difference maps to a written system rule rather than an unexplained engine result.

## Stop criteria

Stop the trial and preserve evidence without guessing if any of these occur:

- a measurement source is unreliable or unverified;
- a run, gate, connection, or total cannot be reconciled;
- local state is lost or reload changes the design;
- the prototype needs an unsupported fence-system rule to calculate takeoff;
- a slope, legal boundary, footing, structural, or product decision is being inferred;
- the UI crashes, blanks, overflows, or prevents safe field entry;
- an unexplained takeoff mismatch appears.

## Outcome and evidence

- Trial result: pass / pass with contained correction / stop
- Geometry-only or geometry + takeoff:
- Time to enter and verify:
- Number of corrections:
- Measurement discrepancies:
- Takeoff discrepancies and governing rules:
- Screenshots retained (deidentified):
- Copied takeoff retained:
- Browser console errors/warnings:
- Required engine correction:
- Required system rule clarification:
- Independent reviewer decision: pass / revise / stop
- Exact activated profile hash, if approved:
- Estimate handoff allowed: yes / no
- Recommended internal-beta decision:

## Second-system follow-up

After the first trial, choose a materially different system—for example wood privacy after aluminum panels, or a rackable/stepped system after a level rigid-panel system. Reuse this worksheet unchanged.

- Second system selected:
- What makes it materially different:
- Same geometry/provenance model sufficient: yes / no
- Engine/schema change required: yes / no
- Rule-pack-only differences:
- Second trial date:

If two materially different systems pass without engine or schema changes, recommend that further fence systems enter through reviewed configuration/data rule packs rather than separate feature development.
