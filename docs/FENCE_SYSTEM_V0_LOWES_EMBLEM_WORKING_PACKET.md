# Fence System V0 Working Packet — Lowe's Emblem White Vinyl Privacy

Status: source-backed working test packet; not an approved McKenzie production
standard

Prepared: 2026-08-11

## Purpose

This packet supplies a concrete first system for Fence Engine development and
golden-test preparation. It uses the Lowe's CATALYST/Freedom Emblem white vinyl
privacy collection requested by McKenzie as a working example.

The packet distinguishes facts stated by Lowe's or the manufacturer from rules
derived from those facts. Unresolved installation choices remain blockers; they
must not be converted into silent defaults.

Live retail price is intentionally excluded. Pricing, availability, tax, and
markup belong to the estimating/catalog boundary and vary by location and time.

## System identity

| Field | Working value | Confidence |
| --- | --- | --- |
| System key | `lowes_emblem_white_privacy_6x8_working_v0` | Working identifier |
| Brand shown by current listing | CATALYST; legacy/support material also uses Freedom | Confirmed |
| Collection | Emblem | Confirmed |
| Style | White vinyl, full privacy, flat top | Confirmed |
| Common panel size | 6 ft high × 8 ft wide | Confirmed |
| Panel model | `73014714` | Confirmed |
| Lowe's item | `667016` | Confirmed |
| Actual panel dimensions | 72 in high × 94 in wide | Confirmed |
| Panel contents | Top rail, bottom rail, and infill boards | Confirmed |
| Panel hardware | No separate panel hardware required with coordinating routed posts | Confirmed |

Primary product source:

- [Lowe's Emblem panel listing](https://www.lowes.com/pd/Freedom-Emblem-6-ft-H-x-8-ft-W-White-Vinyl-Flat-top-Standard-Fence-Panel/50374104)
- [Manufacturer Emblem system page](https://freedomproduct.com/product/emblem-vinyl-fencing-6-x-8-white/)

## Compatible post family

| Role | Size | Model | Lowe's item | Source status |
| --- | --- | --- | --- | --- |
| Line post | 5 in × 5 in × 108 in | `73045783` | `1944652` | Confirmed by panel listing/collection |
| Corner post | 5 in × 5 in × 108 in | `73045784` | `1944653` | Confirmed by panel listing/collection |
| End post | 5 in × 5 in × 108 in | `73045785` | `1944654` | Confirmed by panel listing/collection |

The posts are pre-routed, so bracket counts for ordinary full panels are zero.
Posts and post tops are sold separately from the panel kit.

Post sources:

- [Lowe's Emblem collection](https://www.lowes.com/collections/CATALYST-6x8-Emblem-Fencing-Collection/GR_11140)
- [Lowe's corner-post listing](https://www.lowes.com/pd/Freedom-5-in-x-5-in-x-108-in-CORNER-POST-WHITE/1002750254)
- [Lowe's end-post listing](https://www.lowes.com/pd/Freedom-Emblem-9-ft-H-x-5-in-W-White-Vinyl-End-Fence-Post-Cap/1002750264)

## Panel geometry rules

### Confirmed

- The physical panel width is 94 inches; the common/merchandising width is 8
  feet.
- The panel may rack up to 1 inch per foot, equivalently 8 inches over an
  8-foot section.
- The product-specific installation instructions locate post holes using panel
  width `X` plus post width `Y` as the common center-to-center measurement,
  except for a cut-down panel.
- For a 5-inch post and an uncut 94-inch panel, that instruction derives a
  nominal 99-inch post-center pitch.
- The installation instructions call for sequential `post, panel, post`
  installation rather than setting an entire run of posts without panels.
- The panel should finish 2 inches above grade according to the product
  installation instructions.

Installation source:

- [Manufacturer ready-to-assemble privacy installation instructions](https://www.freedomproduct.com/wp-content/uploads/2022/10/FREEDOM-WEB-PrivacyKit.pdf)

### Approved working-test deterministic rule

For a straight, level, gate-free run whose mapped endpoints represent post
centers:

1. Use a maximum full-section pitch of 99 inches.
2. Compute `section_count = ceil(run_centerline_inches / 99)`.
3. Create `section_count + 1` posts before topology deduplication.
4. Use end posts at free endpoints and line posts at straight internal joints.
5. When the run is not an exact multiple of 99 inches, shorten only the final
   panel in the run's declared direction.

McKenzie approved the 99-inch pitch and final-panel cut policy on 2026-08-11
for this non-production working test. This remains a source-derived test rule,
not yet a McKenzie production installation rule. A measured example is still
required because the common 8-foot name, the 94-inch physical panel, and other
general manufacturer planning content can be misread as different spacing
conventions.

### Blocking uncertainties

- Minimum permitted cut-panel width is not established.
- Whether McKenzie centers or balances shortened panels across a run is not
  established.
- Angle thresholds for line versus corner posts are not stated by the product
  source.
- T-junctions and non-90-degree corners require an approved field method.
- The rack limit is documented, but rules for slope beyond that limit are not
  established.

## Post-hole, gravel, and concrete rules

### Confirmed

- The product installation instructions specify a 10-inch-diameter hole for a
  5-inch × 5-inch post.
- Hole depth is tied to the applicable frost line.
- Gravel/filler is placed at the bottom before concrete.
- The instructions provide an example with a 36-inch frost line, 12 inches of
  gravel/filler, and 24 inches of post surrounded by concrete.
- The instructions elsewhere call for 6 inches of gravel/filler. Because those
  statements are context-dependent, Fence Engine must not select one globally.
- Concrete mix and yield depend on the separately selected concrete product.

### Candidate physical calculation

Once an approved hole depth and gravel depth are supplied, theoretical wet
concrete volume per ordinary post is:

```text
concrete_volume =
  cylinder(hole_diameter, hole_depth - gravel_depth)
  - embedded_post_displacement
```

Purchased bags are then the ceiling of theoretical volume divided by the
verified yield of the selected concrete SKU, with any separately approved
physical waste rule. The engine must preserve theoretical volume and purchased
bag count as distinct trace values.

For the working test only, use the manufacturer's explicit 36-inch-frost-line
example:

- 10-inch-diameter cylindrical hole;
- 12 inches of gravel/filler;
- 24 inches of post surrounded by concrete;
- QUIKRETE Concrete Mix No. 1101, 80-pound bag, verified yield 0.60 cubic feet;
- Sakrete All-Purpose Gravel model/item `853183`, 0.50-cubic-foot bag; and
- round aggregate job demand up to whole bags only after summing theoretical
  volume across all applicable posts.

The ordinary-post test calculation deducts the embedded 5-inch-square post
displacement from wet concrete volume. It emits a warning that field yield and
uneven excavation can increase purchased quantity. There is no added waste
percentage in the working rule.

Concrete and gravel sources:

- [QUIKRETE Concrete Mix technical data](https://www.quikrete.com/pdfs/spec_data-concretemix.pdf)
- [Lowe's Sakrete 0.5-cubic-foot all-purpose gravel](https://www.lowes.com/pd/Sakrete-0-5-cu-ft-Gray-All-purpose-Gravel/1000489233)

### Blocking uncertainties

- Local frost depth and code requirements for the job location.
- McKenzie's normal ordinary-post and gate-post embedment depths.
- Gravel depth to use for McKenzie jobs.
- Whether post displacement is deducted in McKenzie's field estimating method.
- Concrete product, bag size, verified yield, and physical waste rule.

## Single-gate assemblies

### Supported working options

| Opening | Gate model | Lowe's item | Assembly |
| --- | --- | --- | --- |
| 4 ft | `73024873` | `779516` | Unassembled Emblem gate kit |
| 5 ft | `73024874` | `779517` | Unassembled Emblem gate kit |

The listings state that each kit contains top and bottom rails, uprights,
infill boards, U-channels, and a hardware kit. Wrap hinges, latch plate, and
gate stop are included; the latch itself is sold separately. Each opening is
designed to fit its named 4-foot or 5-foot gate opening when installed with the
included hardware.

Every weight-bearing vinyl gate post requires an internal stiffener. Lowe's
identifies aluminum insert model `73041348` for this gate family. The working
assembly therefore requires one insert for each of the two gate posts, subject
to confirmation against the chosen post and current instruction sheet.

Gate sources:

- [Lowe's 4-foot gate listing](https://www.lowes.com/pd/Freedom-Emblem-6-ft-H-x-4-ft-W-White-Privacy-Vinyl-Flat-top-Fence-gate-kit-Unassembled/1000042003)
- [Lowe's 5-foot gate listing](https://www.lowes.com/pd/Freedom-Emblem-6-ft-H-x-5-ft-W-White-Vinyl-Fence-Gate-Kit-Unassembled/1000042005)
- [Manufacturer vinyl privacy gate instructions](https://barretteoutdoorliving.com/wp-content/uploads/2021/07/VF-Privacy-Gate-Install.pdf)
- [Lowe's aluminum insert listing](https://www.lowes.com/pd/Freedom-Aluminum-Metal-Fence-Post-Insert-Vinyl-Fence/1000522373)

### Candidate single-gate takeoff

One isolated single gate contributes:

- one gate kit of the chosen width;
- two routed end/gate posts, deduplicated with adjoining run endpoints only
  when topology and post function permit;
- one aluminum stiffener per gate post;
- one separately selected compatible latch;
- one cap per physical post;
- gate-post concrete calculated with the approved gate-hole rule; and
- no ordinary fence panel across the gate opening.

### Blocking uncertainties

- Exact latch SKU and whether McKenzie uses a lockable or pool-compliant latch.
- Gate swing direction and clearance policy.
- Gate-post hole depth/diameter and extra concrete rule.
- Whether the latch-side post always receives an insert in McKenzie practice.
- Double-drive gates, drop rods, center stops, removable center posts, and
  paired-leaf hardware are unsupported until separately sourced.
- The manufacturer's gate instructions warn that the gate itself is not pool
  code approved; a pool enclosure requires a separate approved system and code
  review.

## Caps and adhesive

A simple white 5-inch pyramid cap is available as model `73003093`, Lowe's item
`385320`. The listing states that it installs with vinyl cement.

Working count rule:

- one post cap per physical post, including gate posts;
- cap style is a selectable component, not hard-coded into geometry; and
- adhesive quantity remains unresolved until the adhesive SKU and coverage are
  verified.

Source:

- [Lowe's 5-inch white pyramid cap](https://www.lowes.com/pd/Freedom-5-0-Inches-W-x-5-0-Inches-L-White-Vinyl-fence-Post-cap-Fits-Common-Post-Measurement-5-in-x-5-in/3601816)

## Working component demands

The deterministic engine may emit these unpriced demands after the remaining
rules are approved:

| Demand key | Unit | Mapping target |
| --- | --- | --- |
| `emblem_panel_6x8_white` | each | Model `73014714` |
| `emblem_post_line_5x5x108_white` | each | Model `73045783` |
| `emblem_post_corner_5x5x108_white` | each | Model `73045784` |
| `emblem_post_end_5x5x108_white` | each | Model `73045785` |
| `emblem_gate_4ft_white` | each | Model `73024873` |
| `emblem_gate_5ft_white` | each | Model `73024874` |
| `vinyl_gate_post_insert_5x5` | each | Model `73041348`, pending final compatibility confirmation |
| `vinyl_post_cap_5x5_white_pyramid` | each | Model `73003093` |
| `gate_latch_compatible` | each | Unresolved SKU |
| `vinyl_adhesive` | package | Unresolved SKU and coverage |
| `post_gravel` | approved volume unit | Unresolved canonical item |
| `post_concrete` | approved volume/package unit | Unresolved canonical item and yield |

These are external-source identities for a working packet, not staging catalog
records. No catalog row should be created until McKenzie approves the canonical
item and unit foundation.

## Explicitly unsupported in this packet

- Double gates and driveway gates.
- Pool-gate compliance.
- Surface-mounted posts.
- Transition panels or mixed heights.
- T-junctions and arbitrary-angle routed posts.
- Slope beyond the documented rack limit.
- Wind-load engineering or mandatory reinforcement outside gate posts.
- Demolition, haul-off, labor hours, equipment, permit, utility-locate, and
  mobilization rules.
- Retail pricing or availability guarantees.

## Source-derived acceptance examples

These are dimensional contract examples, not customer jobs. They exist to make
the approved working rule unambiguous before code is written.

All straight-run examples use post-center measurements, level ground, no gate,
no slope, no corner, no demolition, and the approved 99-inch maximum pitch.

| Case | Run length | Panels | Final panel physical width | End posts | Line posts | Caps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| One full section | 99 in | 1 | 94 in | 2 | 0 | 2 |
| Two full sections | 198 in | 2 | 94 in | 2 | 1 | 3 |
| Final cut section | 250 in | 3 | 47 in | 2 | 2 | 4 |

The 250-inch derivation is `99 + 99 + 52` inches center-to-center. Subtracting
the 5-inch final post width from the 52-inch final pitch produces a 47-inch
physical cut-panel width. Because a minimum allowed cut width is not sourced,
the engine must attach an `UNVERIFIED_CUT_WIDTH` warning until McKenzie validates
that result in the field.

A level 90-degree L consisting of two 99-inch runs shares one corner node and
therefore yields:

- two panel kits;
- two end posts;
- one corner post;
- three caps; and
- no line post at the corner.

Using the working ordinary-post foundation profile, theoretical demand per post
is approximately:

- 0.7436 cubic feet of concrete after embedded-post displacement; and
- 0.5454 cubic feet of gravel/filler.

After job-level package rounding, the one-section/two-post example yields three
80-pound concrete bags and three 0.5-cubic-foot gravel bags. The
two-section/three-post example yields four concrete bags and four gravel bags.
The L example has the same ordinary-post foundation package counts as the
three-post straight example. These figures are calculation fixtures only; gate
foundations remain blocked on a separate gate-hole rule.

## Minimum golden tests still needed

The product sources establish a working component family, but they do not prove
McKenzie's takeoff behavior. Before this packet becomes an approved production
rule set, provide or approve measured expected results for:

1. one straight run shorter than one full section;
2. one run requiring multiple full sections and a cut panel;
3. two connected runs with a 90-degree corner;
4. one run containing a 4-foot single gate;
5. one run containing a 5-foot single gate; and
6. one sloped run near the documented rack limit.

Each golden test must state expected panels, each post type, caps, gate kit,
inserts, latch, concrete, gravel, and any blocker/warning. Prices are optional
and remain outside the physical-rule result.

## Approval record

McKenzie approved the 99-inch post-center pitch and final-panel cut policy in
the Fence Mapping R&D task on 2026-08-11. The packet may therefore be used as a
non-production development fixture for straight runs.

This approval does not make the packet a production installation standard.
Production approval additionally requires every blocking uncertainty used by
the selected job types to be resolved and verified against a real completed
job.
