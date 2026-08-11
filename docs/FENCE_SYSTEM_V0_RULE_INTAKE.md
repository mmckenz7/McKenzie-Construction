# Fence System V0 Rule Intake

Status: business-rule intake worksheet

Purpose: collect the real McKenzie installation rules and independently
calculated acceptance jobs required before Fence Engine production code or
schema work begins.

Related documents:

- `docs/FENCE_MAPPING_ENGINE_ARCHITECTURE.md`
- `docs/FENCE_MAPPING_ENGINE_V0_PLAN.md`

## Instructions

- Complete this worksheet with actual McKenzie standards. Do not enter nominal
  industry assumptions unless McKenzie explicitly adopts them as its standard.
- Use one physical fence system/version per worksheet. Copy the worksheet for a
  different height, construction method, product family, or materially different
  rule set.
- Leave an unknown blank and mark it as a blocker. Do not use zero to mean
  unknown.
- Reference canonical catalog IDs where available. If an item does not yet
  exist, describe the required physical variant and mark the mapping missing.
- Do not include customer names, addresses, prices, supplier credentials, or
  private job media.
- Every completed worksheet requires an operational author and a separate
  reviewer.

## Approval record

| Field | Value |
| --- | --- |
| Rule packet ID | |
| Fence system stable name | |
| Proposed version | |
| Status | Draft |
| Effective date | |
| Prepared by | |
| Prepared at | |
| Reviewed by | |
| Reviewed at | |
| Approved by | |
| Approved at | |
| Source documents | |
| Notes | |

## Scope declaration

| Question | Answer |
| --- | --- |
| Physical construction method | |
| Fence family/type | |
| Nominal height | |
| Actual height if different | |
| Manufactured panel or stick-built | |
| Residential/commercial/agricultural scope | |
| Included gate families | |
| Included slope modes | |
| Included demolition rules | |
| Included labor rules | |
| Explicit V0 exclusions | |

## Units and rounding

| Rule | Approved value |
| --- | --- |
| Source measurement unit | |
| Display unit | |
| Construction dimension precision | |
| Segment-length rounding | |
| Bay-width rounding | |
| Component quantity precision | |
| Package rounding rule | |
| Concrete conversion unit | |
| Concrete aggregation point | Per post / role / run / layout / other: |
| Waste aggregation point | |
| Deterministic tie-break direction | |

If a rounding rule differs by component, document it in the component mapping
table rather than applying one global rule.

## Panel or bay layout

| Rule | Approved value | Source/reason |
| --- | --- | --- |
| Nominal panel/bay width | | |
| Maximum post spacing | | |
| Minimum shortened panel/bay | | |
| Maximum shortened panel/bay if applicable | | |
| Manufactured panels may be cut | | |
| Stick-built bays may vary | | |
| Remainder policy | End / start / distribute / custom: | |
| Too-small remainder policy | | |
| Additional-bay policy | | |
| Preferred number of cut/custom panels | | |
| Width-variance preference | | |
| Left/right symmetry requirement | | |
| Unsupported remainder condition | | |

Describe the complete candidate-layout tie-break order:

| Priority | Approved criterion |
| --- | --- |
| 1 | |
| 2 | |
| 3 | |
| 4 | |

## Posts

Complete one row for every post role used by this system.

| Post role | Required conditions | Physical product/catalog ID | Dimensions | Footing rule | Cap/component | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Line | | | | | | |
| Terminal/end | | | | | | |
| Corner | | | | | | |
| Transition | | | | | | |
| Gate hinge | | | | | | |
| Gate latch | | | | | | |
| Gate center, if ever allowed | | | | | | |
| Other | | | | | | |

Post-resolution rules:

| Question | Approved answer |
| --- | --- |
| Can two connected runs share an endpoint post? | |
| Can two different fence systems share a transition post? | |
| Which role wins at a corner plus terminal condition? | |
| Which role wins at a corner next to a gate? | |
| When are two post instances required at one transition? | |
| Are offsets required between incompatible posts? | |
| What site conditions require an upgraded post? | |
| What unknown conditions must block takeoff? | |

## Footings and concrete

Complete one row per distinct approved footing rule.

| Footing rule ID | Post roles/conditions | Shape | Diameter/width | Depth | Bell/extra dimensions | Concrete product/catalog ID | Waste | Package rounding |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | |

Additional concrete rules:

| Question | Approved answer |
| --- | --- |
| Is volume calculated per post or after grouping? | |
| Are dry-pack/bag yield factors approved? | |
| Is over-excavation included? | |
| Is frost depth location-dependent? | |
| Which conditions require engineering/manual review? | |

## Rails, pickets, panels, wire, and fasteners

Complete only the component families applicable to this system.

| Semantic component | Required quantity rule | Canonical catalog ID | Catalog unit | Pack/coverage conversion | Waste rule | Rounding rule | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Panel/bay | | | | | | | |
| Top rail | | | | | | | |
| Middle rail | | | | | | | |
| Bottom rail | | | | | | | |
| Picket | | | | | | | |
| Wire/fabric | | | | | | | |
| Tension component | | | | | | | |
| Bracket | | | | | | | |
| Fastener | | | | | | | |
| Post cap | | | | | | | |
| Trim/board | | | | | | | |
| Other | | | | | | | |

For spacing-based components, document whether edge gaps, overlap, kerf,
installed coverage, or stock length changes the formula.

## Slope and grade

| Slope mode or condition | Supported in V0 | Approved rule | Required input | Blocker condition |
| --- | --- | --- | --- | --- |
| Level | | | | |
| Rack | | | | |
| Step | | | | |
| Grade break | | | | |
| Unknown slope | | | | |

Document any maximum rack angle, step increment, extra post, panel, rail,
clearance, or labor rule with its source.

## Gate assembly worksheet

Complete this section once per approved gate assembly version.

### Gate identity

| Field | Value |
| --- | --- |
| Gate assembly stable name | |
| Proposed version | |
| Gate kind | Walk / single / double drive / custom: |
| Compatible fence-system versions | |
| Minimum clear opening | |
| Maximum clear opening | |
| Allowed custom widths | |
| Leaf count | |
| Leaf-width rule | |
| Swing direction options | |
| Hinge-side options | |
| Grade/clearance requirements | |
| Automation supported | |
| Unsupported conditions | |

### Gate posts

| Side/role | Post product/catalog ID | Dimensions | Footing rule | Clearance/offset rule | Notes |
| --- | --- | --- | --- | --- | --- |
| Hinge | | | | | |
| Latch | | | | | |
| Center, only if approved | | | | | |

Double-gate center-post decision:

| Question | Approved answer |
| --- | --- |
| Does this assembly require a center post? | |
| If yes, under exactly which condition? | |
| If no, reviewer confirmation | |

An unanswered center-post decision blocks approval. Fence Engine will otherwise
default double gates to no center post.

### Gate leaves and hardware

| Component | Quantity rule | Canonical catalog ID | Unit/pack conversion | Required condition | Notes |
| --- | --- | --- | --- | --- | --- |
| Gate leaf/frame | | | | | |
| Hinge set | | | | | |
| Latch | | | | | |
| Stop | | | | | |
| Drop rod/cane bolt | | | | | |
| Receiver/socket | | | | | |
| Wheel | | | | | |
| Holdback | | | | | |
| Locking hardware | | | | | |
| Automation equipment | | | | | |
| Other | | | | | |

### Gate labor

| Labor activity | Quantity/production rule | Labor catalog ID | Unit | Adjustment condition |
| --- | --- | --- | --- | --- |
| Layout | | | | |
| Posts/footings | | | | |
| Leaf installation | | | | |
| Hardware | | | | |
| Adjustment/testing | | | | |
| Automation | | | | |

## Demolition

| Existing condition | Measurement unit | Quantity rule | Labor catalog ID | Disposal component | Waste/rounding | Blocker |
| --- | --- | --- | --- | --- | --- | --- |
| Fence removal | | | | | | |
| Post removal | | | | | | |
| Gate removal | | | | | | |
| Concrete removal | | | | | | |
| Haul/disposal | | | | | | |
| Other | | | | | | |

## Labor rules

| Activity | Driver | Production/quantity rule | Labor catalog ID | Unit | Crew assumptions | Adjustment/blocker |
| --- | --- | --- | --- | --- | --- | --- |
| Layout | | | | | | |
| Mobilization | | | | | | |
| Line posts | | | | | | |
| Terminal/corner posts | | | | | | |
| Panels/bays | | | | | | |
| Rails/pickets/wire | | | | | | |
| Gates | | | | | | |
| Cleanup | | | | | | |
| Other | | | | | | |

## Physical waste versus estimate pricing waste

| Component/category | Physical takeoff waste | Where applied | Estimate pricing waste | How double application is prevented |
| --- | --- | --- | --- | --- |
| | | | | |

If McKenzie has no separate physical waste for a component, state that
explicitly. Do not infer that a catalog waste percentage is a physical takeoff
rule.

## Catalog mapping exceptions

List every required component that lacks an approved canonical product/labor
identity or unit conversion.

| Semantic component | Required physical variant | Missing catalog entity/conversion | Owner | Resolution status |
| --- | --- | --- | --- | --- |
| | | | | |

Any required unresolved row blocks importable takeoff approval.

## Unsupported and blocking conditions

| Stable blocker name | Field condition | Required user action | Can a manual reviewed override resolve it? |
| --- | --- | --- | --- |
| | | | |

Examples should come from actual McKenzie policy. Do not add hypothetical
conditions to the approved rule packet without operational review.

## Golden acceptance job template

Copy this section for every golden job. The minimum set is defined in
`docs/FENCE_MAPPING_ENGINE_V0_PLAN.md`.

### Job identification

| Field | Value |
| --- | --- |
| Golden job ID | |
| Scenario type | |
| Fence-system version | |
| Gate assembly versions | |
| Prepared by | |
| Independently checked by | |
| Source measurement method | Tape / laser / other: |
| Notes | |

### Normalized geometry

| Run/opening ID | Type | Length/clear width | From node role | To node role | System/assembly version | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

No customer address or coordinates are required for a takeoff golden case.

### Expected bay/panel schedule

| Run ID | Ordered bay/panel widths | Cut/custom count | Remainder decision | Explanation |
| --- | --- | --- | --- | --- |
| | | | | |

### Expected post schedule

| Post sequence | Anchor run/node/opening | Role | Product/catalog ID | Footing rule | Why this post exists |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

### Expected gate schedule

| Opening ID | Leaf(s) | Hinge post | Latch post | Center post | Hardware | Footing/concrete notes |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

For double gates, explicitly write `none` in the center-post column when that is
the approved result.

### Expected material takeoff

| Semantic component | Catalog ID | Raw quantity | Waste | Pack conversion | Purchase quantity | Unit | Source/formula explanation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

### Expected labor takeoff

| Activity | Labor catalog ID | Raw quantity | Adjustment | Final quantity | Unit | Source/formula explanation |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

### Expected blockers and warnings

| Type | Stable code | Trigger | Expected user action |
| --- | --- | --- | --- |
| | | | |

### Independent calculation sign-off

| Question | Answer |
| --- | --- |
| Were quantities calculated independently of Fence Engine? | |
| Do integer bay widths sum exactly to every run? | |
| Are gate spans excluded from installed fence length? | |
| Are shared endpoint posts deduplicated? | |
| Are gate posts, hardware, and concrete complete? | |
| Is a double-gate center-post result explicit? | |
| Is waste/package rounding shown exactly once? | |
| Are all catalog mappings real and approved? | |
| Reviewer name/date | |

## Final packet completeness checklist

- [ ] Stable system identity and version supplied.
- [ ] Scope and exclusions are explicit.
- [ ] Units and every rounding point are explicit.
- [ ] Bay/panel remainder behavior is deterministic.
- [ ] Every post role and shared/transition rule is defined.
- [ ] Footing and concrete rules are defined.
- [ ] Applicable rails/pickets/panels/wire/fasteners are mapped.
- [ ] Slope behavior is supported or blocked explicitly.
- [ ] Required gate assemblies are complete.
- [ ] Double-gate center-post policy is explicit.
- [ ] Demolition and labor rules are complete or outside V0.
- [ ] Physical and pricing waste are distinguished.
- [ ] Catalog exceptions have owners.
- [ ] Unsupported conditions have stable blocker behavior.
- [ ] Minimum golden-job set is complete.
- [ ] Every golden job was independently calculated and reviewed.
- [ ] No customer/private/price/credential data is included.
- [ ] Operational approval record is complete.

When every applicable item is complete, the packet is ready for Gate 1 schema
typing and golden-test implementation. Completion of this worksheet does not by
itself authorize a database migration, production deployment, commit, or push.
