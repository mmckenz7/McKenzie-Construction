# AI Estimator Architecture Proposal

Status: architecture proposal only  
Repository: `mmckenz7/McKenzie-Construction`  
Branch audited: `beta/estimating-core`  
Audit date: 2026-08-10  
Implementation status: no schema migration or production-code change proposed here has been applied

## Executive recommendation

Build AI Estimator as an isolated, provenance-rich intake and review system in
front of the existing structured estimate builder.

The safe boundary is:

```text
private media -> asynchronous transcription/extraction -> immutable AI shadow draft
-> human fact and scope review -> explicit import preview -> atomic import into a draft estimate
-> existing deterministic calculation engine -> existing proposal/contract boundaries
```

The AI layer should never calculate or submit money. It should produce only:

- cited project facts;
- candidate scope sections and work items;
- candidate measurements and quantities with sources;
- contradictions, unknowns, and clarifying questions; and
- optional catalog-match search terms, never catalog prices.

The existing calculation code remains the only authority for direct cost,
material tax, waste application, markup, overhead, discount, customer price,
profit, and margin. A later import service must ignore any monetary fields that
appear in a model response, fetch pricing inputs from approved McKenzie OS
sources, and run the same deterministic calculation and transactional mutation
path used by the current estimate builder.

The smallest useful V0 is narrated-video intake for an existing lead:

1. Upload a private video directly to object storage.
2. Extract and transcribe its audio with timestamps.
3. Extract cited scope, spoken measurements, exclusions, unknowns, and
   clarifying questions into a versioned schema.
4. Review every proposed section, item, and quantity next to its transcript
   evidence.
5. Explicitly import approved fields into an existing or deliberately created
   draft estimate.
6. Continue in the existing estimate builder for cost completion, deterministic
   pricing, presentation, and proposal review.

V0 should not infer dimensions from pixels, analyze structural sufficiency,
read construction drawings, create projects, issue proposals, order materials,
or write directly into canonical estimate items while processing.

## Repository audit

The repository was clean and on `beta/estimating-core` at the start of this
pass. `npm install --package-lock=false` completed with no reported
vulnerabilities, and `npm run build` completed successfully under Node
`v24.19.0`, npm `11.17.0`, and Next.js `16.3.0`.

### Existing entities to reuse

| Existing entity | Reuse in AI Estimator | Important boundary |
| --- | --- | --- |
| `leads` | Required V0 intake context; supplies project type, address, description, owner, and lifecycle context. | Do not mutate lead lifecycle as a side effect of processing. `photo_urls` is not a sufficient secure media model. |
| `customers` | Optional context after lead conversion. | Relationship must remain consistent with `source_lead_id`. |
| `projects` | Future context for revisions, change-scope capture, and actual-cost comparison. | AI Estimator must never create or activate a project. |
| `estimates` | Canonical reviewed estimate header and deterministic calculation state. | Only draft estimates may receive an approved import; preserve `calculation_revision`. |
| `estimate_sections` | Canonical ordered scope sections after human approval. | AI sections remain shadow data until import. |
| `estimate_line_items` | Canonical reviewed quantities, descriptions, cost components, and calculation outputs. | AI cannot populate authoritative pricing fields. Null means unknown; known non-applicable cost components are explicit zeroes. |
| `estimate_options` | Future alternate-scope support. | Options are explicitly inactive in the current structured estimate core and should not be activated by this track. |
| `material_catalog` | Approved material identities, units, current base costs, and waste defaults. | Catalog matching is deterministic/search-assisted and reviewed; the model never copies catalog cost into its output. |
| `labor_catalog` | Approved labor identities, units, costs, crew size, and production rate. | Same catalog and pricing boundary as materials. |
| `estimate_material_price_snapshots` | Historical material-price evidence after canonical pricing. | These are price snapshots, not AI extraction provenance. Do not overload them with media facts. |
| `project_costs` | Current source for estimated, final, and paid project expenses. | It is project/category level and is not presently traceable to an estimate item or physical quantity. A mapping layer is needed for item-level accuracy evaluation. |
| `lead_activities` / `project_activity` | Optional user-visible audit summaries after explicit actions. | Do not use these as the detailed provenance ledger. Never log private transcripts or media URLs in activity text. |
| `feature_settings` and role permissions | Feature gating and existing Sales/cost permissions. | Add a distinct AI Estimator feature flag later; import still requires estimate edit permission. |
| `project_inspection_documents` and findings | Architectural precedent for file metadata, extraction states, findings, and contractor review. | Do not reuse inspection-specific tables. Their domain, enums, and application semantics are too narrow. |

### Existing APIs and services to reuse

| Existing code | Recommended reuse |
| --- | --- |
| `src/lib/estimate-calculations.ts` | Remains the sole money-calculation implementation. Its fixed-point arithmetic, completeness semantics, and policy versioning are the pricing firewall. |
| `src/lib/estimate-types.ts` | Reuse canonical decimal-string and projection conventions at the approved-import boundary. Do not expose these monetary types to the model schema. |
| `src/lib/estimate-persistence.ts` | Reuse canonical persistence/projection rules after import. |
| `src/lib/estimate-mutations.ts` | Reuse validation, calculation-bundle correspondence, optimistic revision fencing, and post-mutation projection. Add a dedicated bulk-import transaction later rather than issuing many browser mutations. |
| `/api/estimates` | Reuse the relationship checks and deliberate structured-draft creation behavior. If a lead already has its single structured draft, import into it only after user confirmation. |
| `/api/estimates/[estimateId]`, `/sections`, and `/items` | Reuse authorization and input conventions. Do not call item endpoints one by one from a worker because that can leave a partial import. |
| `src/lib/estimate-access.ts` | Reuse Sales-workspace authentication, `estimates` feature gating, and cost/profit/edit permissions. A later case read policy should mirror these checks. |
| `src/lib/supabase/admin-server.ts` | Reuse only behind an authenticated server authorization boundary. AI-provider workers must not become a general service-role bypass. |
| `src/lib/features/*` | Add `ai_estimator` as a default-off beta feature later. More granular future flags can cover drawings and spatial capture. |
| `src/lib/estimate-customer-document.ts` and estimate presentation/proposal services | Preserve unchanged. AI provenance and private evidence must never cross the customer-safe projection. |
| Communication provider abstraction | Reuse its server-only configuration style and explicit provider selection as a pattern, not its transport types. |

### Important current constraints

- Structured estimate mutations are draft-only and protected by
  `calculation_revision`; AI import must honor both constraints.
- The current standard line item requires an item markup input even when direct
  costs are incomplete. Any default markup used during import must come from
  approved company/estimate settings and be recorded as a deterministic policy
  source, never from the AI response.
- An estimate can be connected to a lead, customer, or project, and the current
  create route validates those relationships. AI cases need equivalent checks.
- Current estimate acceptance is explicitly nonbinding and cannot create a
  project or authorize work. AI Estimator must not weaken this boundary.
- The application currently appears designed around a global/default feature
  scope rather than a pervasive `company_id` on business tables. Before a
  multi-company launch, every proposed AI table, bucket path, worker query, and
  provider credential must have an explicit tenant key and tenant-isolation
  test.
- Vercel request handlers are not an appropriate transport or execution host
  for large video bodies, audio conversion, or long-running multimodal calls.

## Architectural principles

1. **Interpretation and pricing are separate trust domains.** Model output has
   no monetary authority.
2. **Shadow before canonical.** Processing writes only to AI Estimator tables.
   Canonical estimate writes require an authenticated human action.
3. **Facts are immutable observations.** Corrections append a new value; they
   never replace the AI value.
4. **Every value has evidence.** A fact without a resolvable source locator is
   invalid model output, not merely low confidence.
5. **Confidence is not verification.** A model confidence score does not turn
   an observation into verified data.
6. **Unknown is a valid result.** Missing dimensions, ambiguous scope, and
   contradictions must remain explicit blockers.
7. **Derived quantities are deterministic.** Store the formula, input fact IDs,
   unit conversions, and derivation version.
8. **No side effects from processing.** A completed run cannot send, contract,
   order, schedule, convert, or create a project.
9. **Provider responses are untrusted input.** Validate exact schemas, sizes,
   enums, source locators, and prohibited fields before persistence.
10. **Model and prompt versions are data.** Every output records provider,
    model snapshot, schema version, prompt version, and invocation usage.

## Proposed system shape

```mermaid
flowchart LR
    U["Estimator uploads narrated video"] --> S["Private object storage"]
    U --> C["AI Estimator case linked to lead"]
    S --> Q["Async processing queue"]
    Q --> T["Transcription adapter"]
    T --> X["Structured extraction adapter"]
    X --> V["Schema and evidence validator"]
    V --> D["Immutable shadow draft and facts"]
    D --> H["Human review and corrections"]
    H --> P["Import preview"]
    P --> A["Atomic approved import"]
    A --> E["Existing draft estimate entities"]
    E --> M["Existing deterministic pricing engine"]
    M --> R["Existing human proposal review"]
    R --> F["Frozen final estimate snapshot"]
    F --> O["Later actual-cost comparison"]
```

### Runtime placement

- **Next.js application:** authenticated case creation, signed upload
  initiation, status, review UI, correction recording, import preview, and
  explicit import.
- **Private object storage:** original media, derived audio, selected frames,
  drawing files, and optionally bulky provider response artifacts. The database
  stores metadata and object paths, not public URLs.
- **Asynchronous worker:** malware/media validation, FFmpeg audio extraction,
  transcription, frame sampling when enabled, provider calls, schema validation,
  retries, and usage recording. It claims work with a lease and idempotency key.
- **Postgres:** relationships, workflow state, immutable structured output,
  atomic facts/values, human decisions, canonical mappings, and evaluation
  outcomes.
- **AI providers:** receive only the minimum media or derived content needed for
  the configured task. Provider-hosted files are deleted after processing when
  the provider supports deletion.

Do not perform the pipeline inline in an upload or review request. A route may
enqueue a job and return `202`, but the job should continue independently of the
browser and have explicit retry/cancel state.

## New entities

Names are proposals; the migration should be additive and separately reviewed.

### `ai_estimator_cases`

One intake/review workspace. V0 requires `lead_id`; later it may also retain
consistent `customer_id`, `project_id`, and `target_estimate_id` links as the
business object evolves.

Key fields:

- `id`, tenant/scope key, `lead_id`, nullable `customer_id`, `project_id`, and
  `target_estimate_id`;
- `status`: `intake`, `processing`, `review_ready`, `in_review`, `approved`,
  `applied`, `archived`, or `cancelled`;
- title, project-type hint, retention-policy version;
- `created_by`, `created_at`, and `updated_at`.

Constraints should require a lead in V0, validate all cross-object
relationships, and prevent `applied` unless a successful application record
exists. An AI case status must not update the linked lead or estimate status.

### `ai_estimator_assets`

Metadata for an original or derived asset. One physical object belongs to one
case and can be referenced by many facts.

Key fields:

- asset kind: `video`, `audio`, `photo`, `drawing_pdf`, `drawing_page`,
  `lidar_capture`, `matterport_model`, `point_cloud`, or `other`;
- origin: `user_upload`, `derived`, or `external_reference`;
- private bucket/path or external provider/model reference;
- original filename, MIME type, byte size, SHA-256, capture time, duration,
  page count, pixel dimensions, and spatial metadata where applicable;
- parent asset for derived audio, frames, or pages;
- lifecycle state: `upload_pending`, `available`, `quarantined`, `deleted`, or
  `failed_validation`;
- retention deadline and deletion timestamp.

Never store a permanent public URL. Signed reads are short-lived, authorized,
and generated server-side. Video upload should be direct/resumable to storage,
not proxied through a Next.js body.

### `ai_estimator_processing_runs`

One versioned attempt to transform selected assets into a shadow draft.

Key fields:

- case ID, run number, selected asset IDs, and idempotency key;
- pipeline/schema/prompt versions;
- stage and status: `queued`, `preparing`, `transcribing`, `extracting`,
  `validating`, `completed`, `failed`, or `cancelled`;
- lease owner/expiry, attempt count, timestamps, and sanitized failure code;
- resulting draft-revision ID.

Retry creates a new run or attempt record; it must not overwrite a completed
output.

### `ai_estimator_model_calls`

Provider-neutral operational and cost ledger for each transcription,
extraction, vision, or embedding call.

Key fields:

- processing run and purpose;
- provider, model alias, immutable model snapshot when available, region, and
  adapter version;
- request/response hashes and provider request ID;
- prompt/schema version, latency, retry count, status, and finish reason;
- input/output/cached tokens, audio seconds/tokens, video seconds/frames,
  images/pages, provider-reported cost, and internally estimated cost;
- data-retention mode and provider-file deletion time.

Do not store secrets. Raw prompts/responses should be retained only if the
privacy policy explicitly allows them; schema-valid normalized output plus
hashes is the safer default.

### `ai_estimator_transcripts` and `ai_estimator_transcript_segments`

Versioned transcript output linked to the audio/video asset and processing run.
Segments contain start/end milliseconds, speaker label when available, text,
language, and provider confidence/log-probability metadata. Word timestamps are
optional because they increase volume and are not always available.

Evidence locators point to segment IDs plus exact time ranges. A corrected
transcript is a new version or appended correction, never an overwrite.

### `ai_estimator_facts`

A stable identity for one claim, such as `deck.length`,
`existing_surface.material`, or `scope.demolition.include`.

Key fields:

- case, processing run, fact kind, semantic key, and subject key;
- original AI value and unit;
- measurement source: `manual`, `spoken`, `drawing`, `LiDAR`, `Matterport`,
  `visual_estimate`, or `derived`;
- verification state: `verified`, `high_confidence`, `estimated`, or
  `unverified`;
- normalized confidence from 0 to 1 plus provider-native confidence metadata;
- source asset and locator JSON: transcript segment/time range, drawing
  page/bounding box, image region, Matterport measurement ID, or LiDAR object;
- optional derivation formula/version and input fact IDs;
- contradiction group and blocking flag.

The original fields are immutable. The current reviewed value is a projection
over the value ledger below, not an update to this row.

### `ai_estimator_fact_values`

Append-only values used by the accuracy loop.

`value_stage` is one of:

- `ai_original`;
- `human_corrected`;
- `final_estimate`;
- `final_actual`.

Each row stores typed value JSON, unit, verification state, source/reference,
actor or run, timestamp, and optional `supersedes_value_id`. This supports the
required AI-versus-human-versus-final-versus-actual comparison without erasing
history.

### `ai_estimator_draft_revisions`

Immutable, schema-validated extraction documents. Store the complete normalized
JSON, schema version, processing run, content hash, generated time, and summary
counts. A human edit does not rewrite this JSON; review events and reviewed
projections represent the change.

### `ai_estimator_review_events`

Append-only actions such as `fact_accepted`, `fact_modified`, `fact_rejected`,
`question_answered`, `question_waived`, `section_approved`, `item_approved`, and
`draft_approved`. Store actor, reason, old/current value IDs, source, and time.
Questions can be normalized into a child table if reporting requires it; in V0
they can be addressed by stable IDs in the draft plus review events.

### `ai_estimator_applications`

One explicit import attempt. Store target estimate ID, expected and resulting
calculation revision, approved draft/review hash, actor, preview hash, outcome,
and a mapping from AI section/item/fact IDs to canonical section/item IDs.

The later application RPC must be all-or-nothing, service-role only, draft-only,
revision-fenced, and idempotent. It must reject changed review state between
preview and apply.

### `ai_estimator_outcome_links`

Future many-to-many mappings from fact/canonical estimate item to final
estimate snapshot, `project_costs`, material usage, labor time, or another
actual record. Include allocated amount/quantity, unit conversion, mapping
method, confidence, and human reviewer.

This table should be additive. Do not change `project_costs` in this track until
the main application's cost model and activation workflow are coordinated.

## Media attachment and lifecycle

### Ownership model

Assets attach to an AI Estimator case, and the case carries explicit foreign
keys to its business context. This is preferable to a generic unvalidated
`entity_type/entity_id` attachment because database foreign keys and
relationship checks remain possible.

V0 sequence:

1. User starts a case from a lead.
2. Case stores `lead_id`; its assets inherit access through the case.
3. User may select an existing structured draft as `target_estimate_id`, or
   deliberately create one using the existing estimate-create workflow.
4. Later customer/project links may be added only by explicit lifecycle actions
   after those records already exist.
5. The original object is not copied as context changes. Provenance retains the
   case and original lead, while validated links record the later objects.

### Storage layout

Use a private bucket such as `ai-estimator-private` with a non-guessable path:

```text
<tenant-or-scope-id>/<case-id>/<asset-id>/original/<safe-filename>
<tenant-or-scope-id>/<case-id>/<asset-id>/derived/audio.<ext>
<tenant-or-scope-id>/<case-id>/<asset-id>/derived/frames/<frame-id>.jpg
```

Policies should deny direct anonymous/browser listing. Upload sessions should
constrain bucket, object prefix, size, content type, expiration, and checksum.
On completion the server verifies object metadata before marking it available.

### Upload controls

- Allowlist MIME type and verify file signatures; do not trust extensions.
- Apply configurable size/duration/page-count limits before provider calls.
- Sanitize filenames and never use them as object identity.
- Scan or quarantine unsupported/unsafe files.
- Strip location/device EXIF from provider-bound derivatives when not needed,
  while retaining an authorized original only under the selected evidence and
  retention policy.
- Never place signed URLs, transcript text, or customer PII in activity logs or
  client analytics.

## Transcription and multimodal processing

### V0 pipeline

1. Validate the uploaded video.
2. Derive a normalized mono audio track in the asynchronous worker.
3. Transcribe with timestamps; optionally diarize estimator/customer speakers.
4. Validate transcript duration and coverage. Surface unintelligible spans.
5. Send transcript segments plus minimal lead context to the structured
   extraction adapter.
6. Validate the exact output schema, all source references, numeric strings,
   units, and prohibited keys.
7. Run deterministic normalization: unit aliases, duplicate facts,
   contradictions, and derived formula checks.
8. Persist an immutable draft revision, facts, and questions transactionally.

V0 should not send the full video to a multimodal model. Retain the video so a
future opt-in run can sample frames or use a video-capable provider. If a user
says “this wall” or “that corner,” the transcript-only extractor must create a
clarifying question rather than invent the referent.

### Later multimodal stages

- **Photos/frames:** identify visible components and conditions, never infer
  scale without a calibrated reference. Observations default to
  `visual_estimate` + `unverified`.
- **Drawing PDFs:** rasterize pages for vision/OCR while separately parsing
  vector text and geometry when available. Evidence uses page and bounding box.
- **LiDAR/Matterport:** import provider-produced measurements as sensor facts;
  the LLM can label or organize them but does not alter their numeric value.
- **Cross-modal reconciliation:** preserve contradictions instead of choosing a
  winner. Example: spoken 12 ft and drawing 11 ft 8 in become two facts in one
  contradiction group requiring review.

## Structured extraction schema

The production contract should be a checked-in JSON Schema with
`additionalProperties: false` at every object level. The following is the
semantic V0 shape. IDs are run-local stable strings; all decimals are strings.

```json
{
  "schemaVersion": "ai-estimator-extraction-v0",
  "sourceAssetIds": ["asset_uuid"],
  "summary": {
    "projectTypeCandidate": "deck_repair",
    "plainLanguageScope": "Replace damaged deck boards and one stair section.",
    "overallConfidence": "high_confidence"
  },
  "facts": [
    {
      "id": "fact-001",
      "kind": "measurement",
      "semanticKey": "deck.main.width",
      "label": "Main deck width",
      "value": "12",
      "unit": "ft",
      "dimension": "length",
      "sourceType": "spoken",
      "verificationState": "high_confidence",
      "confidence": "0.94",
      "evidence": [
        {
          "assetId": "asset_uuid",
          "transcriptSegmentId": "segment_uuid",
          "startMs": 41820,
          "endMs": 44750,
          "excerpt": "the main section is twelve feet wide"
        }
      ],
      "contradictionGroupId": null,
      "derivation": null
    }
  ],
  "sections": [
    {
      "id": "section-001",
      "name": "Deck surface",
      "customerDescriptionCandidate": "Repair the main deck walking surface.",
      "evidenceFactIds": ["fact-010"],
      "items": [
        {
          "id": "item-001",
          "itemTypeCandidate": "standard",
          "categoryCandidate": "material",
          "customerDescriptionCandidate": "Replace damaged deck boards.",
          "internalDescriptionCandidate": "Species and board profile not confirmed.",
          "quantityCandidate": {
            "value": null,
            "unit": "sq_ft",
            "sourceFactIds": [],
            "verificationState": "unverified"
          },
          "scopeFactIds": ["fact-010"],
          "measurementFactIds": ["fact-001"],
          "unknownIds": ["unknown-001"]
        }
      ]
    }
  ],
  "unknowns": [
    {
      "id": "unknown-001",
      "semanticKey": "deck.board.profile",
      "description": "Deck board species and profile were not stated.",
      "blocksQuantity": false,
      "blocksPricing": true,
      "evidence": []
    }
  ],
  "clarifyingQuestions": [
    {
      "id": "question-001",
      "question": "What species and dimensions are the replacement deck boards?",
      "reason": "Material selection is required before catalog matching and pricing.",
      "resolvesUnknownIds": ["unknown-001"],
      "priority": "blocking"
    }
  ],
  "warnings": [
    {
      "code": "DEICTIC_REFERENCE_UNRESOLVED",
      "message": "The phrase 'this corner' has no transcript-only visual reference.",
      "evidenceSegmentIds": ["segment_uuid"]
    }
  ]
}
```

### Allowed vocabulary

Measurement sources:

```text
manual | spoken | drawing | LiDAR | Matterport | visual_estimate | derived
```

Verification states:

```text
verified | high_confidence | estimated | unverified
```

Suggested dimensions:

```text
count | length | area | volume | weight | angle | duration | rate | other
```

Important semantics:

- `verified` requires an explicit human review event or a configured trusted
  deterministic source; the model cannot assign it to its own observation.
- `high_confidence` means strong extraction confidence, not field verification.
- `derived` requires a formula/version and referenced input fact IDs.
- `visual_estimate` cannot be promoted above `estimated` without a calibrated
  measurement source or human verification.
- A candidate item can have no quantity. Do not substitute `1` merely because
  the canonical database has a historical default.
- Evidence excerpts are short convenience copies. The source asset, segment,
  timestamps, page, bounding box, or sensor measurement ID is authoritative.

### Prohibited output

Reject the entire provider result if it contains a prohibited monetary or
authority-bearing field, including:

```text
unit_cost, cost, price, markup, margin, overhead, tax, discount,
contract_value, supplier_price, labor_rate, customer_total,
structural_approval, code_compliance, engineering_determination
```

Do not silently strip these fields: rejection makes prompt/schema regressions
visible and testable.

## Human review workflow

### Review sequence

1. **Media and transcript:** play the source at the cited time; correct material
   transcript errors that affect scope or measurements.
2. **Facts:** accept, modify, reject, or mark each blocking fact for
   verification. Low-confidence and contradictory facts appear first.
3. **Unknowns/questions:** answer, waive with reason, or leave blocking. Answers
   become manual/human fact values with their own provenance.
4. **Scope:** approve candidate sections and items; merge/split/reorder without
   losing mappings back to original candidates.
5. **Quantities:** approve the reviewed quantity source and unit. Derived
   quantities show their formula and inputs.
6. **Import preview:** show exactly what will be created/changed in the target
   draft estimate and separately show what remains unknown for pricing.
7. **Apply:** require a deliberate confirmation; write atomically with the
   expected estimate revision.
8. **Canonical pricing review:** open the existing estimate builder. Complete
   catalogs/cost buckets, company-sourced markup/OH&P/tax, presentation, and
   proposal review using existing rules.

### Review interface requirements

- Two-pane evidence and draft review with “jump to time/page/region.”
- Filters for blocking, contradictory, low confidence, and modified facts.
- Clear badges for source type and verification state; never show confidence as
  a false percentage of correctness without explanation.
- Original AI value and current human value visible together.
- Undo by appending another event, not deleting history.
- A final checklist requiring all blocking unknowns to be resolved or
  deliberately waived.
- Separate capabilities: reviewing scope does not imply permission to view
  costs/profit or edit prices.

### Import contract

The browser sends only:

- approved draft/review hash;
- selected target estimate ID;
- expected `calculation_revision`;
- explicit section/item selections and reviewed fact-value IDs.

The server reconstructs the import from stored reviewed data. It does not trust
browser-supplied descriptions or quantities that are absent from the approved
review projection. It also fetches all pricing policy/defaults independently.

The transaction must:

- verify user, feature, Sales access, and estimate edit permission;
- verify the case/lead/customer/project relationship;
- require target estimate `status = 'draft'`;
- compare revision and preview hash;
- create/update sections and items as one unit;
- run the existing deterministic calculation and correspondence validation;
- record canonical mappings and the resulting revision; and
- return the existing permission-filtered builder projection.

No endpoint in this flow may issue a proposal, accept a contract, order a
material, change lead state, or create a project.

## Accuracy and correction logging

### Value lineage

For each semantic fact, retain this chain when stages exist:

```text
AI original observation
  -> human accepted/corrected observation
  -> frozen final-estimate observation
  -> mapped final-actual observation
```

Each arrow is an append-only value or mapping record. “Accepted without change”
is still an event because it distinguishes reviewed correctness from untouched
output.

When a proposal/customer document is frozen, record `final_estimate` values
from the canonical snapshot rather than the live mutable draft. When actuals
arrive, map them to canonical items/facts without editing either source.

### Current actual-data limitation

`project_costs` supports category-level estimated/final expense and payment
tracking, but has no canonical estimate-line ID, material quantity, labor hours,
or unit. It can support coarse cost variance now. Accurate material/labor
quantity evaluation later requires either:

- an additive reviewed allocation/mapping table; or
- authoritative material-usage and labor-time entities introduced by the core
  application.

Do not infer item actuals by description matching and call them authoritative.
Automated matching may create review candidates only.

### Evaluation metrics

Report by project type, source type, model/prompt/schema version, and field:

- transcription word error rate on a consented benchmark subset;
- fact extraction precision/recall;
- unsupported-fact rate and missing-evidence rate;
- human accept/modify/reject rate;
- measurement absolute error and relative error after unit normalization;
- section/item split/merge rate;
- blocking-question resolution and unnecessary-question rate;
- draft-to-final quantity delta;
- estimate-to-actual material/labor/cost variance where mappings are valid;
- average human review time and time saved; and
- cost, latency, retry, and failure rates per completed draft.

Never optimize only for “few corrections.” A model that omits uncertain scope
can appear accurate while being useless. Precision, recall, unknown detection,
and downstream variance must be considered together.

## Model/provider abstraction

Create a server-only package later under a boundary such as
`src/lib/ai-estimator/providers/`.

```ts
type ProviderCapabilities = {
  transcription: boolean;
  diarization: boolean;
  structuredTextExtraction: boolean;
  imageUnderstanding: boolean;
  videoUnderstanding: boolean;
  pdfUnderstanding: boolean;
  zeroRetentionEligible: boolean;
};

interface TranscriptionProvider {
  transcribe(input: NormalizedAudioInput, policy: TranscriptionPolicy):
    Promise<NormalizedTranscript>;
}

interface ExtractionProvider {
  extract(input: ExtractionInput, schema: VersionedExtractionSchema,
    policy: ExtractionPolicy): Promise<UntrustedStructuredResponse>;
}

interface MultimodalProvider {
  inspect(input: NormalizedMediaInput, task: MultimodalTask,
    schema: VersionedExtractionSchema): Promise<UntrustedStructuredResponse>;
}
```

The orchestrator selects adapters from versioned configuration by capability,
data region, retention eligibility, quality tier, and cost ceiling. Application
code consumes only normalized responses.

Required provider-neutral behaviors:

- immutable model snapshots where supported;
- timeouts, bounded retries, idempotency, and cancellation;
- exact structured-output validation in McKenzie OS;
- normalized token/media usage and provider request IDs;
- provider-file upload/deletion lifecycle;
- redacted error handling;
- replay from retained normalized inputs for controlled evaluation; and
- a deterministic “provider unavailable” failure rather than silent fallback
  to a model with weaker privacy or capabilities.

Avoid provider-specific file IDs, citation formats, confidence scales, and
finish reasons in domain tables. Preserve them inside bounded provider metadata
alongside normalized fields.

## Approximate API cost considerations

Prices change and must be read from configuration, not hard-coded in business
logic. The numbers below are planning examples as of 2026-08-10, before storage,
egress, worker compute, retries, logging, and taxes.

- OpenAI lists Whisper transcription at **$0.006/minute**, so a 10-minute V0
  recording is about **$0.06** for transcription. The newer transcription
  models use token pricing and should be estimated from provider-reported usage.
  [OpenAI Whisper pricing](https://developers.openai.com/api/docs/models/whisper-1)
- A focused structured extraction with 10,000 text input tokens and 2,000 output
  tokens on the currently listed GPT-4o mini rates ($0.15/M input and $0.60/M
  output) is about **$0.0027**. Model output should remain compact.
  [OpenAI GPT-4o mini pricing](https://developers.openai.com/api/docs/models/gpt-4o-mini)
- A higher-quality review pass at current GPT-5.4 rates with the same token
  counts is about **$0.055**. It should be reserved for difficult/low-confidence
  cases or evaluation, not invoked automatically for every stage.
  [OpenAI GPT-5.4 pricing](https://developers.openai.com/api/docs/models/gpt-5.4)
- Google currently prices Gemini 2.5 Flash text/image/video input at $0.30/M
  tokens, audio input at $1.00/M, and output at $2.50/M. Its direct video and PDF
  capabilities make it a useful provider-abstraction test, but modality token
  accounting must be measured with real files.
  [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)

For a transcript-only 10-minute V0, a practical model-API planning envelope is
roughly **$0.10-$0.50 per successful intake** with headroom for retry and a
selective second pass. This is an engineering budget, not a quoted vendor
price. Full-video analysis, dense frame sampling, large drawing sets, premium
models, or multiple adversarial/self-check passes can move a job into the
multi-dollar range.

Cost controls:

- record estimated cost before dispatch and actual usage after completion;
- configure per-case and per-stage ceilings;
- transcribe once and reuse versioned transcripts;
- sample only task-relevant frames, never every frame;
- render only selected drawing pages at the required resolution;
- use a low-cost extractor first and escalate only on schema failure,
  contradictions, or low confidence;
- cap retries and make manual retry explicit after the cap;
- use batch APIs only where latency permits and retention terms are acceptable;
- add dashboard alerts for cost per completed reviewed draft, not merely per API
  call.

## Privacy, consent, and retention

Narrated jobsite media can contain customer voices, faces, addresses, license
plates, family information, security layouts, valuables, and geolocation. Treat
all media, transcripts, frames, drawings, and extracted facts as private
customer/project data.

Required policy decisions before beta:

- Define who may record, whose consent is required, and the in-app recording
  notice. Tennessee and jobs in other jurisdictions may have different consent
  requirements; obtain legal review rather than encoding an AI conclusion.
- Select vendors and regions under an approved DPA and confirm whether API data
  is used for training, retained for abuse monitoring, eligible for zero-data
  retention, or copied into provider file storage. OpenAI documents endpoint-
  specific retention controls rather than one universal rule.
  [OpenAI API data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)
- Define separate retention periods for originals, derived media, transcripts,
  normalized facts, model-call metadata, and accuracy outcomes. A reasonable
  starting proposal is short raw-media retention after review, with longer
  retention only where job records, warranty, dispute, or consent policy
  requires it; legal/accounting approval is needed before selecting exact days.
- Support deletion and legal hold. Deleting raw media may preserve a checksum,
  deletion audit, fact/value lineage, and non-reversible aggregate metrics when
  policy permits, but the UI must disclose that evidence playback is no longer
  available.
- Do not use recordings for voice identification, face recognition, employee
  surveillance, or model training without a separately approved purpose and
  consent process.

Technical controls:

- private storage, encryption in transit/at rest, short signed URLs, and strict
  server authorization;
- tenant/case prefix validation on every object operation;
- least-privilege provider credentials held only in the worker environment;
- no secrets, signed URLs, transcript contents, or raw provider payloads in
  logs/analytics;
- auditable reads, downloads, provider sends, review decisions, exports, and
  deletion;
- sanitized media derivatives and minimal context sent to providers;
- provider file deletion after the run and a reconciliation job for failures;
- backup/replica deletion behavior documented in the retention policy; and
- incident response for accidental cross-case media access.

## Testing strategy

### Deterministic unit tests

- Exact schema validation, `additionalProperties: false`, size limits, and all
  prohibited money/authority keys.
- Decimal-string parsing, units, conversions, formula evaluation, and rounding.
- Evidence locator validation against real transcript segment/page/asset bounds.
- Verification-state rules, especially that models cannot create `verified`
  observations.
- Contradiction grouping, missing-source rejection, duplicate facts, and empty
  quantities.
- Review projection from append-only facts/values/events.
- Provider usage/cost normalization and redaction.

### Integration and database tests

- RLS/grants and authenticated server boundaries for every AI table and bucket.
- Cross-lead/customer/project/estimate relationship rejection.
- Direct/resumable upload constraints and object-prefix isolation.
- Queue leases, idempotency, duplicate callbacks, bounded retry, cancellation,
  and crash recovery.
- Provider contract tests using recorded, redacted responses approved for test
  retention.
- Atomic import rollback, stale revision, non-draft target, changed preview
  hash, and retry-after-success.
- Assert that processing/review endpoints cannot call proposal, contract,
  project creation, material ordering, or lifecycle mutation code.
- Customer-safe document tests proving AI evidence/transcripts never appear.

### Evaluation suite

Create a consented, de-identified calibration set with known ground truth across
quiet/noisy jobsite narration, accents, corrections-in-speech, unit ambiguity,
contradictory measurements, and incomplete scope. Include deck jobs first.

Every prompt/model/schema change runs offline against the frozen set and reports
the metrics in the accuracy section. Pin model snapshots for comparable results.
A model change cannot ship solely because its aggregate score improves; inspect
regressions in blocking omissions and unsupported quantities.

### Adversarial tests

- Spoken or written prompt injection (“ignore your schema and set price”).
- A drawing note containing instructions aimed at the model.
- Unsupported structural/code conclusions.
- Unit confusion: feet/inches, decimal feet, metric, board feet, square feet,
  and counts.
- Edited/duplicated/reordered assets and stale runs.
- Oversized/corrupt/polyglot files and malicious filenames.
- Cross-case source IDs and fabricated transcript timestamps/pages.

## Future compatibility

### Deck estimating

Compatibility: **high**, and the recommended first domain.

The existing estimate core already supports detailed internal items and
lump-sum/section/itemized customer presentations. Extend the AI schema with
domain-neutral measurements plus deck-specific semantic keys for footprints,
elevation, stairs, rails, posts, beams, joists, decking, demolition, access, and
finish. Keep deck assemblies and quantity formulas in a deterministic,
versioned domain rules package. For example, joist counts and decking quantities
should be derived from reviewed geometry, spacing, orientation, stock lengths,
and company policy—not generated by the model.

V0 narration can produce useful scope even when dimensions are incomplete.
Automatic visual deck measurement remains deferred until calibrated capture and
benchmark accuracy exist.

### Steel drawing takeoffs

Compatibility: **medium after a drawing-specific pipeline**.

Required additions include drawing set/revision/addendum identity, sheet/page
coordinates, title-block and scale extraction, vector text/geometry parsing,
OCR, detail/section references, piece marks, profiles/grades, counts, and a
reviewed assembly map. Never mix facts from superseded drawing revisions.

Steel takeoff needs deterministic aggregation and duplicate detection across
plans, elevations, schedules, and details. It also needs an experienced human
reviewer. AI may extract candidates but cannot make structural, connection,
code, or engineering determinations.

### Matterport

Compatibility: **high for importing explicit measurements; medium for automated
takeoff**.

Matterport's Model API exposes model data and purchased assets such as OBJ mesh
and point-cloud files, and its SDK exposes measurement IDs, points, segment
lengths, and total length. Enterprise Property Intelligence can expose estimated
room dimensions. Store Matterport model/version, measurement ID, coordinate
system, unit, capture time, provider metadata, and access entitlement as the
source—not as `visual_estimate`.
[Matterport Model API](https://matterport.github.io/developer-docs/api/model/overview/)
[Matterport measurement data](https://matterport.github.io/showcase-sdk/docs/reference/current/interfaces/measurements.measurementmodedata.html)
[Matterport dimension estimates](https://matterport.github.io/showcase-sdk/modelapi_pi_dimension_estimates.html)

The Model API uses server-side credentials, and Matterport warns that tokens can
carry broad account authority. Put credentials in a dedicated connector and
never expose them to the browser. Coordinate-system transformations must be
explicitly versioned and tested.

### iPad/LiDAR

Compatibility: **high for a later native capture companion, primarily for
interiors**.

Apple RoomPlan produces a parametric room/structure representation with walls,
doors, openings, objects, and dimensions, and can export USD/USDZ plus metadata.
Import that structured metadata as `LiDAR` facts and retain the source asset.
An iOS/iPadOS capture app or carefully specified third-party export is required;
the current web application alone cannot provide the same RoomPlan capture
experience.
[Apple RoomPlan](https://developer.apple.com/documentation/roomplan)

RoomPlan should not be assumed accurate or complete for exterior decks,
occluded framing, grade changes, or fine construction tolerances. Calibrate by
device/capture mode and keep human verification.

### Material optimization

Compatibility: **high downstream of reviewed quantities**.

Material optimization should be a deterministic service that consumes reviewed
geometry/quantities, approved catalog stock sizes, kerf, lap, splice, waste,
grain/orientation, and company constraints. It returns a versioned cut/packing
plan plus waste and assumption report. The AI may explain results or flag
missing constraints; it must not own the optimizer or automatically order its
output.

Keep three separate values:

```text
reviewed design quantity -> optimized purchase quantity -> actual used quantity
```

That separation makes both estimator and optimizer error measurable.

### Build Books / BuildBook

Compatibility: **medium through an export adapter; API availability must be
confirmed**.

This proposal assumes “Build Books” refers to BuildBook. Its current public
help describes estimates attached to opportunities, versioned estimates,
price-book imports, proposal attachments, and manual share/PDF workflows. This
maps conceptually to McKenzie leads, estimate revisions, catalogs, and customer
documents, but a stable public developer API was not identified in this pass.
[BuildBook estimate overview](https://help.buildbook.co/en/articles/10029979-estimate-and-proposal-overview)

Define a provider-neutral `EstimateExport` DTO from the frozen, reviewed
canonical estimate—not from AI shadow data. A later BuildBook adapter can target
a documented API, an approved CSV/import format, or a human-reviewed PDF. Do not
screen-scrape, duplicate price authority, or establish bidirectional sync until
BuildBook identifiers, versioning, permissions, and API terms are confirmed.

## Smallest useful V0 implementation

### Included

- Default-off `ai_estimator` feature flag.
- AI case linked to an existing lead.
- Private direct upload of one narrated video within configured size/duration
  limits.
- Asynchronous audio extraction and timestamped transcription.
- Transcript-only scope/measurement/unknown/question extraction.
- Versioned exact schema with monetary-field rejection.
- Immutable facts, AI values, draft revision, model-call usage, and human review
  events.
- Review UI for transcript evidence, accept/modify/reject, unknown resolution,
  section/item editing, and quantity verification.
- Import preview and one atomic approved import into a selected structured draft
  estimate.
- Canonical mapping and first accuracy metrics.
- Existing estimate builder as the only pricing and proposal path.

### Explicitly deferred

- Automatic visual measurement or full-video model calls.
- Photo inference beyond later manual attachment/evidence.
- Drawing/PDF extraction and scale interpretation.
- LiDAR, Matterport, point-cloud, BIM, or native iPad capture.
- Estimate options, alternatives, or value engineering generation.
- Structural/code/engineering determinations.
- Material optimization and ordering.
- BuildBook synchronization.
- Automatic lead transitions, estimate sending, customer communication,
  contract value, contract creation, or project activation.

### Suggested implementation order after approval

1. Freeze the extraction JSON Schema, review vocabulary, privacy policy, and V0
   accuracy metrics.
2. Design the additive tables, grants/RLS, private bucket, and deletion policy;
   review them separately with the core-application thread.
3. Implement provider interfaces and a local deterministic fake-free contract
   harness using consented/redacted recorded fixtures.
4. Implement case/upload/queue/transcription with no canonical estimate writes.
5. Implement transcript extraction and shadow review.
6. Run an internal deck-narration pilot and establish baseline accuracy/cost.
7. Implement import preview and atomic application only after the shadow path is
   stable and the main estimating workflow owner approves the integration.
8. Keep the feature default-off until authorization, retention, deletion,
   failure recovery, and end-to-end safety tests pass.

## Recommended decisions before schema work

1. Confirm V0 begins from a lead and uses transcript-only interpretation.
2. Approve the shadow-draft boundary and prohibit direct worker writes to
   canonical estimates.
3. Select the first transcription/extraction provider pair and a second adapter
   for portability testing.
4. Approve recording consent language, vendor data terms, region, and retention
   policy.
5. Decide the asynchronous execution host and queue/lease mechanism.
6. Decide whether AI review requires a new permission in addition to Sales
   access, and confirm that import retains `edit_prices` permission.
7. Coordinate the future bulk-import RPC with the active estimating-core thread
   before any migration or production-code change.
8. Choose a small, consented deck-job benchmark and define acceptable precision,
   recall, unsupported-fact rate, and review-time targets.

The recommended next artifact is a schema-and-threat-model design review, not a
migration. It should finalize table contracts, RLS/storage policies, provider
data flow, queue failure semantics, and the exact V0 extraction JSON Schema
before implementation begins.
