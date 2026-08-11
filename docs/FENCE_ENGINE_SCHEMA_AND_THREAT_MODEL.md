# Fence Engine Schema and Threat Model

Status: design proposal only; no migration or production code applied

Repository: `mmckenz7/McKenzie-Construction`

Branch audited: `beta/estimating-core`

Design date: 2026-08-10

Related documents:

- `docs/FENCE_MAPPING_ENGINE_ARCHITECTURE.md`
- `docs/FENCE_MAPPING_ENGINE_V0_PLAN.md`
- `docs/FENCE_ENGINE_DOMAIN_CONTRACT.md`
- `docs/FENCE_SYSTEM_V0_RULE_INTAKE.md`
- `docs/FENCE_MAPPING_PROVIDER_SPIKE.md`

## Executive decision

Use an additive, server-only, immutable-revision schema beside the existing
estimate tables. Normalize topology and trace rows for relational integrity,
while retaining canonical hash-bound JSON snapshots that exactly correspond to
the domain contract.

The first fence migration should create no public/customer access, no GPS media
bucket, no parcel cache, no pricing logic, and no estimate import RPC. Those
belong to later reviewed migrations after the internal layout/takeoff foundation
is proven.

The current repository has no committed universal company/tenant root. A
concurrent untracked AI foundation proposes `company_settings(id)` as a
singleton company root and enforces composite company/object relationships.
Fence Engine should align with that approach only if the tenant foundation is
approved first. The fence migration must audit its exact prerequisite rather
than silently invent another tenant model.

## Current database constraints

- `estimates` links optionally to `leads`, `customers`, and `projects`, but does
  not carry `company_id`.
- `company_settings` is currently operationally singleton.
- structured estimates are draft-only for mutation and use
  `calculation_revision` optimistic fencing.
- estimate domain tables are server-only through service-role-backed routes.
- current structured item mutation writes `material_catalog_id` and
  `labor_catalog_id` as null even though the legacy columns exist.
- a read-only staging check on 2026-08-10 found exactly one
  `company_settings` row, no `fence_mapping` feature-setting row, and zero
  `material_catalog` and `labor_catalog` rows. `units_of_measure` and
  `material_categories` were unavailable through the staging API
  (`PGRST205`), so the proposed canonical-unit/catalog foundation is not yet a
  staging dependency Fence Engine can consume. Production was not queried.
- a concurrent material-catalog foundation proposes canonical products,
  normalized units, verified unit conversions, company-scoped supplier
  accounts, and immutable price observations. Fence component mappings should
  depend on its approved canonical identity/unit boundary, not supplier SKUs.
- no PostGIS declaration was found in checked-in migrations. V0 schema uses
  exact numeric WGS84 coordinates and integer millimeters without requiring
  PostGIS.

## Migration sequencing

Proposed migrations are separate approval units:

1. **Fence feature/permission foundation** — feature key and role defaults only
   after permission policy approval.
2. **Fence layout and rule foundation** — internal layouts, immutable revisions,
   topology, observations, rules, mappings, and server-only grants.
3. **Fence takeoff foundation** — immutable takeoff results, items, trace, and
   review events after the pure engine/golden tests exist.
4. **Fence estimate application** — atomic import preview/application after
   estimating-core catalog links and bulk mutation contract are approved.
5. **Fence field assets** — private bucket/assets only when GPS/photo/voice flow
   is authorized after V0.
6. **Fence public/customer flow** — separate tokens, projections, rate limits,
   and provider terms only after internal validation.

Do not combine all six into one migration. A migration file existing in the
repository is not approval to run it on staging or production.

## Common schema conventions

### Company and object consistency

Every fence table carries `company_id`. Child tables use composite foreign keys
that include company and parent IDs.

Example pattern:

```text
unique (id, company_id)
foreign key (layout_id, company_id)
  references fence_layouts(id, company_id)
```

Until canonical business tables carry `company_id`, a server trigger validates:

- exactly one approved `company_settings` row exists;
- the supplied fence `company_id` is that row;
- linked estimate exists;
- estimate lead/customer/project relationships remain internally consistent;
- optional duplicated business-context IDs match the estimate.

The trigger is transitional. A later multi-company migration must add real
company relationships to business objects and replace singleton enforcement.

### IDs and dimensions

- IDs: `uuid default gen_random_uuid()`.
- accepted longitude: `numeric(10,7)` with range check.
- accepted latitude: `numeric(9,7)` with range check.
- integer millimeters/count units: `bigint` with nonnegative/positive checks.
- fixed physical quantities: `numeric(24,8)` or approved unit scale.
- hashes: text matching `^sha256:[0-9a-f]{64}$`.
- schema/policy versions: bounded nonempty text with exact supported checks.
- JSON objects/arrays: `jsonb_typeof` checks plus server/domain correspondence
  validation; JSON does not replace relational constraints.

### Delete behavior

- Operational fence objects are archived, not hard deleted.
- Immutable revisions, observations, rules used by takeoffs, takeoffs, reviews,
  and applications use `on delete restrict`.
- Ephemeral draft-only child rows may use cascade only inside one controlled
  revision-save transaction before publication.
- Applied takeoffs and their source revisions are permanent business evidence
  subject to retention policy.

### Time and actors

- `created_at`, `updated_at`, `captured_at`, `approved_at`, and `applied_at` are
  `timestamptz`.
- internal actors reference `app_users(id)` where repository conventions allow;
  authentication correlation may also snapshot `auth.users.id` in established
  fields.
- system-generated rows identify a server process/policy version rather than
  fabricating a human actor.

## Proposed layout tables

### `fence_layouts`

Purpose: stable internal fence workspace attached to one estimate.

Proposed columns:

| Column | Contract |
| --- | --- |
| `id` | Primary key. |
| `company_id` | Required provisional tenant root. |
| `estimate_id` | Required; `estimates(id)` on delete restrict. |
| `lead_id`, `customer_id`, `project_id` | Optional context snapshots that must match estimate context. |
| `title` | Required bounded internal name. |
| `status` | `draft`, `review_ready`, `verified`, `applied`, `archived`. |
| `current_revision_id` | Nullable pointer added after revision table; same layout/company composite FK. |
| `selected_address_label` | Internal display value, bounded; provider storage terms apply. |
| `geocode_provider`, `geocode_result_id`, `geocode_storage_mode` | Licensed selected-result metadata, no provider token. |
| `geocode_longitude`, `geocode_latitude` | Nullable normalized selected coordinate when retention is licensed. |
| `created_by`, `created_at`, `updated_at` | Audit. |

Constraints:

- unique `(id, company_id)` and `(id, estimate_id, company_id)`;
- at most one non-archived V0 layout per estimate/company through a partial
  unique index unless alternate layouts are later approved;
- geocode coordinates are both null or both present;
- provider result/coordinate persistence requires a non-temporary storage mode;
- `applied` requires at least one successful application in a later migration;
- archive does not delete revisions/takeoffs.

### `fence_layout_revisions`

Purpose: immutable normalized geometry snapshot.

Proposed columns:

| Column | Contract |
| --- | --- |
| `id`, `company_id`, `layout_id` | Composite parent identity. |
| `revision_number` | Positive, unique per layout. |
| `parent_revision_id` | Nullable same-layout/company composite FK. |
| `revision_reason` | Required bounded enum plus optional bounded explanation outside calculation hash. |
| `layout_schema_version` | Exact supported version. |
| `coordinate_policy_id` | Exact supported coordinate policy. |
| `geodesic_policy_id` | Exact supported length policy. |
| `canonicalization_version` | Exact supported hashing policy. |
| `content_hash` | Unique with layout; domain-separated SHA-256. |
| `canonical_layout` | Exact normalized calculation projection JSON. |
| `installed_fence_length_mm` | Derived aggregate. |
| `gate_opening_length_mm` | Derived aggregate. |
| `alignment_length_mm` | Exact sum of prior two. |
| `minimum_verification_state` | Derived/review summary, not a substitute for per-value provenance. |
| `created_by`, `created_at` | Immutable audit. |

Constraints/triggers:

- unique `(layout_id, revision_number)` and `(id, layout_id, company_id)`;
- parent revision belongs to same layout/company and has lower revision number;
- canonical JSON is an object and schema/policy fields match columns;
- content hash matches canonical bytes through server validation before insert;
- aggregate lengths equal reconstructed normalized child rows;
- update/delete rejected after insert;
- inserting a revision and all children occurs through one transaction/RPC,
  never independent browser inserts.

### `fence_nodes`

Purpose: meaningful topology nodes for one immutable revision.

Key columns:

- `id`, `company_id`, `layout_id`, `revision_id`;
- stable `logical_node_id` for diffing across revisions;
- `node_kind` from the domain contract;
- `longitude numeric(10,7)`, `latitude numeric(9,7)`;
- source and verification enums;
- nullable accepted observation/correction IDs;
- stable `sort_order` only for display where needed.

Unique `(revision_id, logical_node_id)` and composite keys support run/opening
references within the exact same revision/layout/company.

### `fence_runs`

Purpose: installed fence between meaningful nodes under one system version.

Key columns:

- `id`, company/layout/revision identity, stable `logical_run_id`, `sort_order`;
- composite from/to node references including revision/layout/company;
- `fence_system_version_id`;
- `slope_mode`;
- `geometry_length_mm`, nullable `manual_length_mm`, `effective_length_mm`, and
  effective source;
- nullable manual observation/correction and required override reason.

Constraints:

- from and to nodes differ;
- all lengths positive;
- manual length/source/provenance fields are present or absent together;
- effective length equals geometry or validated manual value according to
  source;
- unique logical run within revision;
- topology validated in the revision-save service, not inferred from row count
  alone.

### `fence_run_vertices`

Purpose: ordered accepted path geometry.

Key columns:

- company/layout/revision/run identity;
- stable `logical_vertex_id`;
- `ordinal` starting at zero;
- exact normalized coordinate;
- source/verification and observation/correction links.

Constraints:

- unique `(run_id, ordinal)` and `(revision_id, logical_vertex_id)`;
- at least two vertices enforced by revision finalization;
- first/last coordinates match referenced nodes;
- consecutive coordinates differ;
- no update/delete after revision insert completes.

### `fence_openings`

Purpose: explicit gate opening that is not installed fence.

Key columns:

- company/layout/revision identity, stable `logical_opening_id`, order;
- start/end node composite FKs;
- positive `clear_width_mm`;
- source/verification and observation/correction links;
- gate kind and approved `gate_assembly_version_id`.

Constraints:

- endpoints differ and have gate node kinds;
- same endpoint pair cannot also form a run;
- assembly compatible with adjacent system versions;
- unique logical opening within revision;
- no arbitrary hardware/material JSON on the opening.

## Measurement evidence tables

### `fence_measurement_observations`

Purpose: immutable source evidence for accepted geometry/dimensions.

Proposed fields:

- identity and company/layout association;
- observation kind: `coordinate`, `length`, `opening_width`, or later
  explicitly approved kind;
- source enum from domain contract;
- raw value in typed columns where practical;
- for coordinate: raw longitude/latitude strings, reported accuracy meters,
  optional altitude/accuracy/heading/speed;
- for dimension: value/unit and normalized millimeter result;
- provider/reference ID and provider data vintage where licensed;
- `captured_at`, `recorded_by`, `created_at`;
- bounded device/client metadata JSON without secrets or fingerprinting fields.

Use distinct nullable typed fields with a check enforcing the shape for each
observation kind. Do not accept an unrestricted raw-value object as the sole
authority.

Observations are append-only and never become verified merely because their
reported accuracy is small.

### `fence_measurement_corrections`

Purpose: append-only human selection/correction of an observation.

Fields:

- identity/company/layout;
- required observation ID;
- nullable superseded correction in same observation chain;
- corrected typed coordinate/dimension;
- correction reason code and bounded explanation;
- resulting verification state;
- actor and time.

Checks require exactly one corrected value shape and prohibit correction loops.
Geometry rows may reference a correction only when it belongs to their accepted
observation/layout/company.

### Future `fence_measurement_assets`

Defer from V0. When authorized, store private object metadata and paths for
photos/voice, hashes, MIME/size, retention state, uploader, and parent
observation. Never store permanent public URLs.

## Proposed fence-system tables

### `fence_systems`

Purpose: stable business identity independent of version and supplier.

Fields:

- ID; stable lowercase code; approved display name; lifecycle status;
- system family/category reference when canonical category foundation exists;
- created/updated audit.

No price, supplier SKU, or behavior-changing metadata.

### `fence_system_versions`

Purpose: immutable approved physical behavior.

Fields:

- ID/system ID/version;
- status `draft`, `approved`, `retired`;
- `rule_schema_version`, `takeoff_policy_version`, content hash;
- canonical typed rule document;
- author/reviewer/approval/effective metadata.

Rules:

- draft may be replaced only before approval through a controlled review flow;
  safer implementation creates a new draft revision rather than in-place edits;
- approved/retired content is update/delete protected;
- takeoff references only approved/retired versions valid for historical use;
- approval requires a complete Gate 0 packet/golden set reference;
- recursive monetary-key validation rejects cost/price fields.

### `fence_gate_assembly_versions`

Purpose: immutable typed leaf/post/hardware/clearance/footing rules.

Fields mirror system-version approval/hash conventions plus gate kind,
compatible system-version IDs through a join table, and canonical typed rule
document.

Double-drive assemblies require an explicit `center_post_policy`; missing is a
blocker. `none` is a real reviewed policy, not null.

### `fence_system_component_mappings`

Purpose: map semantic physical requirements to canonical products/labor.

Fields:

- system or gate assembly version;
- unique semantic component key;
- classification material/labor/demo;
- exactly one canonical material or labor catalog ID;
- canonical unit ID/code and required verified unit conversion;
- physical waste rule reference;
- pack/order rounding rule and aggregation point;
- condition enum/typed parameters;
- mapping verification/approval fields.

Do not map directly to supplier offer/SKU or current price. If the material
catalog foundation changes identity/unit tables, this table design must be
reconciled before migration.

## Proposed takeoff tables

### `fence_takeoff_revisions`

Purpose: immutable price-free engine result.

Fields:

- company/layout/revision identity;
- engine/rule/canonicalization versions;
- layout content hash, rule-bundle hash, calculation-input hash, result hash;
- status `blocked`, `valid`, `approved`, `applied`, `superseded`;
- canonical result JSON;
- blocker/warning JSON arrays constrained to arrays of stable codes/paths;
- generation actor/process and time;
- approval actor/time/hash.

Constraints:

- unique calculation input hash per layout revision/rule bundle/policy;
- valid/approved/applied has no blockers;
- approved requires actor/time and unchanged result hash;
- applied requires successful application in later migration;
- immutable calculation fields after insert; status transitions only through
  controlled RPCs that verify hashes.

### `fence_takeoff_items`

Purpose: normalized aggregate physical quantities.

Fields:

- takeoff/company/layout/revision identity;
- deterministic local item ID and semantic component key;
- classification;
- exactly one material/labor catalog mapping as required;
- raw, waste, and rounded purchase quantities;
- canonical unit;
- stable order.

The database checks nonnegative quantities and valid catalog/classification
shape. The server validates correspondence with canonical result JSON.

### `fence_takeoff_traces`

Purpose: explain every quantity.

Fields:

- deterministic trace ID and takeoff context;
- source type/ID;
- rule version/path and formula ID;
- typed exact input JSON, raw result, rounding policy, rounded result, unit;
- stable order.

Join table `fence_takeoff_item_traces` maps every item to one or more traces.
Finalization fails if an item lacks a trace or a trace references unknown
geometry/result subjects.

### `fence_takeoff_review_events`

Purpose: append-only review ledger.

Actions:

- `review_started`, `blocker_acknowledged`, `warning_reviewed`,
  `takeoff_approved`, `takeoff_rejected`, `approval_invalidated`,
  `import_previewed`, `import_applied`.

Store target/result hash, actor, reason, and time. Approval cannot target a
different current hash.

## Future estimate application tables

### `fence_estimate_applications`

Fields:

- company/layout/takeoff/target estimate;
- unique idempotency key per takeoff/estimate;
- approved takeoff hash and import-preview hash;
- expected and resulting `calculation_revision`;
- status `previewed`, `applying`, `applied`, `failed`, `stale`, `cancelled`;
- actor and timestamps;
- sanitized failure code.

### `fence_estimate_application_items`

Maps takeoff items/traces to created/superseded estimate sections/items. It
stores physical mapping and import policy IDs, not a second price calculation.

The import transaction must:

1. lock/reload the draft estimate and exact calculation revision;
2. verify approved takeoff and preview hashes;
3. verify current catalog/unit/price-basis records through approved services;
4. replace only prior Fence Engine-owned estimate items explicitly shown in the
   preview;
5. preserve unrelated estimator-authored items;
6. calculate the complete estimate once through existing code/policy;
7. persist the complete verified calculation bundle;
8. increment revision and application mapping atomically;
9. return the normal permission-aware estimate projection.

Do not design the database RPC until estimating core approves persistent
catalog links and a server-verifiable bulk calculation bundle.

## Immutability and state transitions

| Object | Mutable fields | Immutable boundary |
| --- | --- | --- |
| Layout | title, current-revision pointer, workflow status, archive metadata | Business parent/company never changes. |
| Layout revision | none | Immutable immediately after transactional insert. |
| Node/run/vertex/opening | none | Immutable with revision. |
| Observation/correction | none | Append-only immediately. |
| Fence system | display/lifecycle metadata | Stable identity never changes. |
| Rule/gate version | draft review metadata only | Behavior immutable once approved. |
| Takeoff | controlled status/approval only | Calculation result immutable immediately. |
| Review event | none | Append-only. |
| Application | controlled attempt/status fields | Hash/revision/mapping immutable after applied. |

Database triggers reject unauthorized update/delete even for service-role table
access. SECURITY DEFINER functions use fixed `search_path`, exact signatures,
input validation, and least privilege.

## Index plan

Initial indexes:

- layout by company/estimate/status and created time;
- revision by layout/revision number and content hash;
- child geometry by revision/order/logical ID;
- observation/correction by layout/time and observation chain;
- approved system/gate versions by stable system/version/status;
- component mapping by version/semantic key and catalog identity;
- takeoff by layout/revision/status/time and input/result hashes;
- trace/item by takeoff/stable order;
- reviews/applications by takeoff/time and idempotency.

Do not add PostGIS spatial indexes in V0. Revisit only for actual spatial query
requirements, not merely because coordinates exist.

## Grants and RLS

For every fence table:

1. enable row-level security;
2. revoke all from `public`, `anon`, `authenticated`, and initially
   `service_role`;
3. grant only the exact select/insert/update operations required by server
   services to `service_role`;
4. grant no direct client table access;
5. expose no generic public RPC.

Suggested operation split:

- mutable layout header: service role select/insert/update, no hard delete;
- immutable revisions/geometry/observations/corrections/rules/takeoffs/traces:
  service role select/insert only plus exact controlled state RPCs;
- review events: select/insert;
- applications: exact RPC-managed transitions.

The Next.js server authorizes users before using the admin client. Service role
is transport privilege, not business authorization.

## Feature and permission model

Feature key: `fence_mapping`, default off until controlled V0 rollout.

Suggested permissions:

- `view_fence_layouts`;
- `edit_fence_layouts`;
- `verify_fence_measurements`;
- `manage_fence_systems`;
- `approve_fence_takeoffs`;
- `apply_fence_takeoffs`.

Existing permissions still apply:

- Sales workspace access for estimate-linked internal layout;
- `view_costs` only for import preview cost projection;
- `edit_prices` plus `apply_fence_takeoffs` for estimate mutation;
- no permission allows bypassing draft, hash, relationship, or revision guards.

Role defaults require a separate business approval. Do not automatically grant
new permissions to every role with `edit_prices`.

## Threat model scope

### Assets

- exact customer address and coordinates;
- fence geometry, gates, access points, and field annotations;
- GPS accuracy/raw samples and later media;
- provider result IDs, usage, and credentials;
- approved installation rules and takeoff quantities;
- catalog mappings and future price-basis references;
- estimate relationship, revisions, and imported items;
- actor, review, and correction history.

### Actors

- authorized estimator;
- operational reviewer/rule steward;
- project/field employee in a later flow;
- unauthorized or unrelated authenticated employee;
- public/customer user in a later flow;
- compromised browser/session;
- malicious provider response;
- buggy/compromised server process;
- service-role or credential holder;
- external attacker.

### Trust zones

- browser/UI;
- map/geocode/parcel/GPS adapters;
- Next.js authenticated server boundary;
- service-role database/storage boundary;
- pure Fence Engine;
- existing estimate/catalog pricing boundary;
- future public token boundary.

## Threats and controls

| Threat | Failure | Required control |
| --- | --- | --- |
| IDOR across estimates/layouts | Employee reads or edits unrelated geometry. | Server object authorization; same-estimate/company composite FKs; not-found projection. |
| Service-role bypass | Route trusts admin client without user policy. | Central fence authorization service before every admin query; dependency tests. |
| Cross-company link | Layout child references another company's parent. | `company_id` on every table and composite FKs/triggers. |
| Inconsistent estimate context | Layout lead/customer/project does not match estimate. | Transactional context trigger mirroring estimate relationship validation. |
| Geometry tampering | Client changes normalized values/hash/derived lengths. | Server normalization, topology, geodesic recomputation, canonical hash verification. |
| Provider-object injection | Malicious SDK/GeoJSON object enters persisted engine input. | Exact schemas, unknown-key rejection, normalized scalar adapter boundary. |
| Oversized/adversarial geometry | Candidate solver or JSON exhausts CPU/memory. | Request/entity/segment/candidate limits; bounded algorithms; timeout and stable failure. |
| Floating-point drift | Client/server generate different quantities. | Integer millimeters, fixed geodesic policy, golden byte vectors, server authority. |
| Gate undercount | Gate treated as LF deduction; posts/hardware omitted. | Explicit opening/assembly schema and gate golden tests. |
| Double-gate center-post error | Incorrect extra/missing center post. | Non-null explicit policy; default no center; trace/golden test. |
| Endpoint post duplication | Materials overcounted. | Node-owned demand resolver and post-instance trace/invariants. |
| Rule downgrade/substitution | Takeoff uses draft/changed rule silently. | Approved immutable version ID/hash; status and content re-check. |
| Catalog spoofing | Rule maps to inactive/wrong product or supplier SKU. | Canonical ID and verified unit conversion; no supplier SKU mapping. |
| Monetary contamination | Fence rule/result supplies price/tax/markup. | Recursive monetary-key firewall and module dependency tests. |
| Physical/pricing waste duplication | Quantity and cost both inflate waste. | Separate fields/policies and import correspondence tests. |
| Stale approval replay | Changed takeoff imported using old approval. | Approval/result/preview hashes; expected estimate revision; idempotency. |
| Partial import | Some items persist before failure. | One atomic transaction and full bundle correspondence. |
| Manual override abuse | User replaces geometry without evidence. | Required observation/correction/reason/permission; diff and audit. |
| False verification | GPS/parcel source marked verified automatically. | Source independent from verification; explicit reviewer permission/event. |
| Parcel/survey misrepresentation | Approximate line presented as legal boundary. | Persistent source/vintage/disclaimer; no auto-run; parcel out of V0. |
| Imagery staleness/misalignment | Fence drawn at wrong physical location. | Provider evidence, source state, field/manual verification, no accuracy claim. |
| Provider key theft/abuse | Billable usage or account access. | Scoped non-production/production public tokens, origin restrictions, quotas, no secret scopes/logging. |
| Temporary geocode retention | Contract violation. | Storage-mode field/check; persist only permanent/licensed selected results. |
| Sensitive log leakage | Addresses/coordinates/media/notes exposed. | IDs/stable codes only; structured redaction; log tests. |
| Public proposal leakage | Internal geometry/trace reaches customer projection. | Existing customer document allowlist; regression tests for forbidden fields. |
| Malicious future upload | Photo/audio malware or oversized payload. | Private direct upload, MIME/signature/size validation, quarantine, signed reads. |
| Raw asset public URL | Long-lived access to field media. | Private bucket/object path only; short signed URLs after authorization. |
| Deletion erases evidence | Applied takeoff loses provenance. | Restrict deletes, archive workflow, retention policy, immutable triggers. |
| Race in revision save | Mixed child rows or incorrect current pointer. | One revision-save transaction with expected prior revision. |
| Race in rule approval | Two conflicting approved versions. | Locked status transition, unique version/effective constraints, hash re-check. |
| Derived JSON/row divergence | Hash snapshot differs from normalized rows. | Transactional correspondence validator and reconstruction tests. |
| Feature disabled bypass | Direct route still operates. | Feature check in central authorization service and tests for every route. |

## Authorization decisions

### Read projections

- layout readers receive geometry and nonfinancial takeoff only when they can
  access the linked estimate and have `view_fence_layouts`;
- cost/price projections are never joined into fence reads;
- rule documents may expose physical internal standards only to approved
  internal roles;
- exact observation/device/provider metadata is more restricted than normalized
  layout display;
- future customer projection is a separate allowlist, not a filtered internal
  response.

### Mutations

| Mutation | Required checks |
| --- | --- |
| Create layout | feature, Sales workspace, linked draft estimate, edit permission, one-active-layout constraint. |
| Save revision | layout edit permission, expected current revision, exact schema/topology/hash, no takeoff/price side effect. |
| Correct measurement | verification permission, observation ownership, reason, expected accepted value. |
| Create rule draft | manage-system permission and real Gate 0 source references. |
| Approve rule | independent approver, unchanged hash, complete golden evidence. |
| Generate takeoff | view/edit permission, exact revision and approved rule hashes, bounded engine. |
| Approve takeoff | approval permission, no blockers, unchanged result hash, reviewer identity. |
| Preview import | apply permission, existing cost permissions, draft estimate, approved takeoff. |
| Apply import | apply + `edit_prices`, expected estimate revision, preview hash, idempotency, atomic calculation. |

An actor SHOULD NOT approve the same rule packet they authored when operational
staffing permits separation. Rule/takeoff approver independence is recorded and
can become mandatory policy later.

## Privacy and retention

V0 stores only the minimum:

- selected licensed address/geocode coordinate;
- normalized aerial-drawn geometry;
- revision/review/takeoff evidence;
- no GPS samples, photos, voice, parcel owner data, or customer public input.

Retention decisions required before field/public flows:

- raw GPS sample duration versus accepted point history;
- rejected/corrected observation retention;
- photo/voice retention and deletion after project completion;
- provider payload/result retention rights;
- user export/deletion handling versus required estimate/contract evidence;
- backup/log deletion lag;
- whether as-built geometry becomes a project record.

Exact coordinates should be classified as sensitive customer/jobsite data even
when an address is already present on a lead or estimate.

## Security test plan

### Static/schema contract tests

- every fence table has RLS and no anon/authenticated grants;
- service role receives only specified operations;
- every child includes company in a composite FK;
- identifier names fit PostgreSQL limits;
- immutable tables have update/delete trigger protection;
- hash/version/enums/JSON types and nonnegative dimensions are constrained;
- no price/tax/markup/profit columns in layout/rule/takeoff tables;
- no PostGIS or public-storage dependency in V0 foundation.

### Authorization route tests

- unauthenticated, inactive user, no Sales access, feature disabled, and missing
  permission outcomes;
- unrelated/missing estimate or layout returns safe not-found/forbidden result;
- owner/admin cannot bypass draft/hash/revision/object guards;
- observation metadata requires stronger permission than basic layout read;
- every route calls central fence authorization before admin-client mutation.

### Tampering/concurrency tests

- mismatched canonical JSON/hash/relational rows rejected;
- duplicate IDs, cross-revision node refs, wrong company, and wrong estimate
  rejected;
- stale current revision produces conflict without rows;
- concurrent rule approval selects one outcome;
- changed rule/takeoff invalidates approval/preview;
- repeated idempotency key returns prior application without duplicates;
- injected monetary/provider/unknown keys rejected recursively;
- over-limit geometry fails before expensive candidate generation.

### Leakage tests

- public proposal and customer document contain no fence coordinates, provider
  IDs, observations, traces, internal rules, or catalog IDs;
- activities/logs/errors contain stable IDs/codes, not raw address/coordinate;
- API responses omit costs/profit according to existing permissions;
- no provider credential is stored in database, client error, fixture, or log;
- future signed media URLs expire and cannot cross layout/company access.

## Audit questions before migration authoring

1. Is `company_settings(id)` approved as the current singleton company root?
2. Will the AI/material foundations that establish company and canonical unit
   patterns be committed before Fence Engine depends on them?
3. Are alternate active layouts per estimate required, or is one enough for V0?
4. Which actor table is canonical for created/reviewed/applied references?
5. Which new fence permissions map to which roles by default?
6. Does rule approval require separation of author and approver in V0?
7. Which exact structured estimate mutation will preserve catalog IDs?
8. How are physical takeoff waste and estimate pricing waste represented after
   catalog foundation work lands?
9. What selected geocoding fields may be stored under the chosen provider plan?
10. What location retention policy applies to archived/lost estimates?

## First migration boundary after approval

The smallest safe first migration should include only:

- approved company-root prerequisite audit;
- `fence_layouts` and immutable layout revisions;
- normalized nodes, runs, vertices, and openings;
- measurement observations/corrections without media;
- system/gate version identities and approved physical rule snapshots;
- component mappings only if canonical catalog/unit foundation is committed;
- exact constraints, immutability triggers, indexes, RLS, and least grants;
- no takeoff result, estimate application, storage, parcel, GPS walk, or public
  token tables unless separately approved.

Its tests should be authored alongside the migration and fail closed against
the audited repository/database contract. Staging dry-run and read-only catalog
verification come before any remote DDL. Production remains read-only until the
user approves the exact modifying command.

## Current human gates

Schema authoring still requires human approval of:

- the tenant/company root;
- the real Gate 0 fence system/golden jobs/catalog identities;
- permission/role defaults;
- selected geocoding retention terms;
- whether catalog/unit foundation dependencies will land first.

Until then, this is the complete schema/security design target, not permission
to create migration SQL.
