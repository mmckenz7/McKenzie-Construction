# Copeland AI Estimator V0 Benchmark Readiness

Status: benchmark protocol only; Copeland source packet not yet present

Repository checkpoint: `codex/ai-estimator-next` at `316a1ca`

## Purpose

Use one real Copeland project to measure whether AI Estimator can turn a
consented private job record into a cited, reviewable scope and quantity draft
without granting the model pricing, contract, project, or lifecycle authority.

This benchmark is not permission to upload customer media, select or call a
model provider, spend API credits, enable the feature, apply migrations, or
write into a canonical estimate.

## Current repository capability

The repository already contains:

- a default-off, Sales-only AI Estimator case intake API;
- consent acknowledgement and private, bounded video-upload contracts;
- company-scoped shadow tables and append-only provenance/review entities;
- a versioned extraction schema and strict validator;
- provider-neutral transcription/extraction interfaces that fail closed when
  no provider is configured; and
- tests that reject monetary fields, unsupported evidence, model-asserted
  verification, canonical estimate writes, and lifecycle side effects.

The current implementation does **not** contain:

- a selected transcription or extraction provider;
- a media-validation/transcription/extraction worker;
- a route that starts a processing run;
- a reviewer UI, correction workflow, import preview, or canonical import;
- an enabled AI Estimator feature; or
- a Copeland-labeled source or truth packet in the inspected workspace.

Upload completion intentionally stops before declaring media available because
the isolated worker has not yet verified the content signature and SHA-256.

## Required Copeland packet

Keep the source packet and the comparison packet separate so the benchmark is
blind and auditable.

### Source packet shown to the estimator

Provide only source material that an estimator would legitimately have at the
start of the job:

1. the original consented walkthrough video, or the original narrated photos
   and notes if no video exists;
2. drawings, sketches, measurements, customer messages, and scope notes that
   existed at that time;
3. the project/trade type and the date each source was captured; and
4. an explicit list of sources the AI is permitted to process.

Do not include final prices, markups, customer totals, signed contracts, or the
answer key in the model-visible packet.

### Frozen comparison packet hidden from the estimator

Provide Michael's or another qualified estimator's reviewed truth set:

1. included scope and exclusions;
2. known measurements with units and their authoritative source;
3. final reviewed sections and work items;
4. final reviewed quantities, including which remained unknown at intake;
5. clarifying questions that truly had to be answered;
6. later customer changes, clearly separated from original-intake facts; and
7. when available, as-built quantities and actual material/labor records with
   reviewed mappings rather than description matching.

Costs may be retained for later business-variance evaluation, but they are not
model inputs and are not scored as AI-generated facts.

## Smallest valid benchmark run

### Gate 0 — packet acceptance

- Recording consent and permitted-source list are explicit.
- Every source has a stable local identifier and capture date.
- The hidden truth set is frozen before model output is reviewed.
- Critical truth facts identify their evidence source.
- Later changes are not mislabeled as original-intake omissions.

If any item is missing, report the missing evidence and stop rather than filling
it with assumptions.

### Gate 1 — deterministic dry run, no provider

Represent the source inventory, transcript segments when supplied, and the
human truth set without calling a model. Validate that the current extraction
schema can express the project scope, measurements, exclusions, unknowns, and
questions. Record schema gaps as benchmark findings; do not change the schema
silently to make the case pass.

### Gate 2 — one frozen provider run

Only after separate provider, privacy/retention, and spend approval:

- use one named provider, immutable model snapshot when available, prompt
  version, schema version, and policy version;
- process the frozen source packet once;
- preserve normalized provider usage, latency, and request identifiers without
  storing secrets or public media URLs; and
- do not retry or switch models merely because the first output scores poorly.

A second run is a separately identified reproducibility run, never a silent
replacement.

### Gate 3 — blind human review

The reviewer sees each proposed fact and item with its source citation before
seeing the comparison score. Record accept, modify, reject, merge, split, and
question-resolution decisions. Measure active review time. No benchmark action
writes into a canonical estimate.

### Gate 4 — deterministic scoring

Score exact reviewed mappings, not fuzzy description matches:

- transcription word error rate for the reviewed transcript subset;
- scope/fact precision and recall;
- unsupported-fact and missing-evidence counts;
- measurement absolute and relative error after unit normalization;
- correct unknown detection and unnecessary-question counts;
- item split/merge differences;
- accepted, modified, and rejected output counts;
- active review time and estimated manual baseline time; and
- provider cost, latency, retries, and failures.

Safety results are hard gates:

- zero monetary fields or monetary influence in model output;
- zero model-originated `verified` facts;
- zero facts without resolvable evidence where evidence is required;
- zero canonical estimate, proposal, contract, order, project, or lead-state
  mutations; and
- zero customer-safe projection of media, transcript, provider metadata, or
  internal confidence.

The first Copeland run establishes a measured baseline. Do not invent an
accuracy percentage that has not been calibrated against real McKenzie review.
After the baseline, Michael may approve field-specific release thresholds.

## Benchmark outputs

Produce a compact, redacted report containing:

- hashes/IDs and dates for the frozen source and truth manifests;
- model, prompt, schema, and policy versions;
- the scoring metrics above;
- a list of critical misses, unsupported claims, and schema gaps;
- reviewer time and corrections;
- a recommendation: reject, revise and rerun, or advance to a second real job;
  and
- no customer address, private media URL, transcript body, provider secret, or
  unredacted personal data.

## Decision after Copeland

Copeland alone can prove workflow usefulness and expose contract gaps; it
cannot establish general accuracy. If the safety gates pass and review time is
materially reduced without an uncorrected critical scope/measurement miss, run
a second materially different real job before enabling any import path.

## Exact owner inputs still missing

Michael needs to supply or identify:

- the Copeland project record or a safe local folder for its source packet;
- recording/media-processing consent status;
- original job intake media and documents;
- the frozen reviewed scope/measurement/quantity truth set;
- which estimator owns the truth review and manual-time baseline; and
- later, a separate choice of provider/privacy policy and a small explicit spend
  ceiling if a live model run is approved.

No Copeland-named asset was found in the repository outputs, temporary remote
attachments, or indexed Documents workspace during this audit.
