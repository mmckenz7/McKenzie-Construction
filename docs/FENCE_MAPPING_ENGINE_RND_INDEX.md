# Fence Mapping + Fence Engine R&D Index

Status: architecture package complete; implementation intentionally blocked on
the human gates below

Repository: `mmckenz7/McKenzie-Construction`

Branch audited: `beta/estimating-core`

Last reviewed: 2026-08-10

## Start here

This page is the short operational index for the Fence Mapping + Fence Engine
track. The design package is complete enough to begin implementation once the
business-rule, catalog, provider, tenancy, and permission decisions below are
approved. No fence schema, production code, remote write, commit, push, or
deployment has been performed.

## Document map

| Document | Purpose | Read when |
| --- | --- | --- |
| `FENCE_MAPPING_ENGINE_ARCHITECTURE.md` | End-to-end product and system architecture | Deciding product scope or reviewing the V0 shape |
| `FENCE_MAPPING_ENGINE_V0_PLAN.md` | Ordered implementation gates and acceptance criteria | Planning delivery and sequencing work |
| `FENCE_ENGINE_DOMAIN_CONTRACT.md` | Normative geometry, topology, precision, hashing, takeoff, trace, and error contract | Implementing or reviewing the pure domain package |
| `FENCE_SYSTEM_V0_RULE_INTAKE.md` | Fillable rule-source and golden-job packet | Supplying real fence-system business rules |
| `FENCE_SYSTEM_V0_LOWES_EMBLEM_WORKING_PACKET.md` | Source-backed Lowe's Emblem working system with explicit unresolved rules | Reviewing the first test fence system |
| `FENCE_MAPPING_PROVIDER_SPIKE.md` | Map-provider comparison protocol and evidence sheet | Running the Mapbox versus MapLibre/MapTiler spike |
| `FENCE_ENGINE_SCHEMA_AND_THREAT_MODEL.md` | Proposed additive schema boundaries, authorization model, privacy controls, and threats | Reviewing the first migration and security posture |

## Fixed V0 direction

- Internal staff workflow first; no customer self-service or public layout
  links in V0.
- Desktop aerial drawing first. Browser GPS capture remains a later assisted
  verification input, never an unqualified survey-grade source.
- Runs, nodes, openings, transitions, observations, and corrections are
  explicit domain objects. A gate is an assembly, not merely deducted linear
  footage.
- The takeoff engine is a pure deterministic package. Accepted geometry,
  rule-set version, catalog mapping version, and engine version bind each
  immutable result.
- The engine produces physical requirements and canonical component demands.
  Existing estimating logic owns prices, taxes, markups, overhead, and totals.
- Provider SDK objects, display rounding, supplier SKUs, and mutable catalog
  prices cannot enter the deterministic core.
- Parcel boundaries are reference overlays with source, retrieval time,
  provenance, and disclaimer; they are not represented as surveyed truth.
- Immutable revisions and complete calculation traces are prerequisites for
  estimate application.

## Verified repository and staging facts

The repository built successfully before the architecture work began using the
installed dependency set. The fence work itself changes documentation only.

A read-only staging check on 2026-08-10 found:

- exactly one `company_settings` row;
- no `fence_mapping` feature-setting row;
- zero `material_catalog` rows;
- zero `labor_catalog` rows; and
- no API-visible `units_of_measure` or `material_categories` tables
  (`PGRST205`).

Production was not queried. Concurrent, unrelated work in the repository
proposes a material/catalog foundation, but uncommitted files and proposed
migrations are not an approved dependency.

## Human gates required before implementation

### 1. Fence-system rule packet

Complete `FENCE_SYSTEM_V0_RULE_INTAKE.md` for the first real fence system and
attach authoritative manufacturer/installer sources plus approved golden jobs.
At minimum, this must settle:

- panel/module width and fit convention;
- terminal, corner, line, transition, and gate-post rules;
- single- and double-gate assemblies, including whether a removable center
  post is required;
- hardware, rail, cap, fastener, concrete, waste, and rounding rules; and
- the canonical component identity expected for each output.

Without this packet, implementing formulas would turn guesses into product
behavior and violate the no-fake-data constraint.

### 2. Catalog dependency

Approve the canonical catalog/unit foundation Fence Engine should depend on and
provide the real material and labor identities for the first fence system.
Fence mappings must target canonical items and normalized units, not
free-typed descriptions or supplier-specific SKUs.

### 3. Map-provider spike inputs

Authorize the provider candidates, credentials, billing limits, and a small
deidentified address set that McKenzie is permitted to use. Then run the
protocol in `FENCE_MAPPING_PROVIDER_SPIKE.md`. Provider selection must include
legal confirmation for geocoding retention, imagery/attribution, parcel data,
and caching.

### 4. Tenancy and authorization decisions

Approve:

- whether `company_settings(id)` is the interim singleton tenant root;
- who may create/edit layouts, accept corrections, approve takeoffs, and apply
  them to estimates;
- the default state of the new `fence_mapping` feature and permission; and
- whether a future field role should be separate from estimator/admin roles.

### 5. First migration review

After Gates 1–4 are satisfied, approve the exact first additive migration. The
recommended first migration contains only the internal feature/permission and
layout/rule foundation. It excludes public access, storage buckets, parcel
caches, pricing, and estimate mutation.

Database application to staging or production remains a distinct approval;
production must stay read-only absent approval for the exact modifying command.

## Implementation sequence after approval

1. Freeze the first system rule packet, golden jobs, and catalog mappings.
2. Run and record the provider spike; approve one adapter for V0.
3. Implement the pure domain types, canonicalization, validation, and golden
   tests without UI or database dependencies.
4. Review and create the first additive migration, server-only grants, and
   authorization tests.
5. Build the internal drawing editor behind a disabled-by-default feature flag.
6. Persist immutable accepted revisions and deterministic takeoffs.
7. Add estimate-import preview and atomic application only after catalog-linked
   estimate mutation is approved.
8. Validate with real internal jobs before considering GPS, parcel enrichment,
   field media, or customer workflows.

Each step must meet the gate and acceptance criteria in
`FENCE_MAPPING_ENGINE_V0_PLAN.md`; later steps do not retroactively waive an
earlier gate.

## Deliberately untouched

- No SQL migration or database write.
- No production query or modification.
- No map, geocoding, parcel, or GPS credential creation or retrieval.
- No feature flag, permission, storage bucket, or public route.
- No fence calculation formula populated with inferred values.
- No estimate mutation, catalog seed, fake job, or fake pricing.
- No commit, push, pull request, deployment, or environment-variable change.

## Resume instruction

When the required inputs are ready, resume from this index and name the
approved first fence system. The first implementation task is the pure domain
package and its source-backed golden tests unless the approved dependency order
requires the catalog/tenant foundation first.
