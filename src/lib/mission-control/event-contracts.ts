export const BUSINESS_ACTOR_TYPES = [
  "employee",
  "customer",
  "subcontractor",
  "vendor",
  "system",
  "integration",
] as const;

export const BUSINESS_EVENT_CLASSIFICATIONS = [
  "operational",
  "financial_restricted",
  "contract_restricted",
] as const;

export type BusinessActorType =
  (typeof BUSINESS_ACTOR_TYPES)[number];

export type BusinessEventClassification =
  (typeof BUSINESS_EVENT_CLASSIFICATIONS)[number];

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type EventContract = {
  version: 1;
  classification: BusinessEventClassification;
  allowedMetadataKeys: readonly string[];
};

export const BUSINESS_EVENT_CONTRACTS = {
  "estimating.proposal_issued": {
    version: 1,
    classification: "operational",
    allowedMetadataKeys: [
      "estimate_id",
      "proposal_generation",
      "expires_at",
    ],
  },
  "estimating.proposal_access_observed": {
    version: 1,
    classification: "operational",
    allowedMetadataKeys: [
      "proposal_generation",
      "access_id",
      "client_signal",
      "suspected_automated",
    ],
  },
  "estimating.proposal_accepted": {
    version: 1,
    classification: "operational",
    allowedMetadataKeys: [
      "proposal_generation",
      "response_id",
      "acknowledged_nonbinding",
    ],
  },
  "estimating.proposal_declined": {
    version: 1,
    classification: "operational",
    allowedMetadataKeys: [
      "proposal_generation",
      "response_id",
    ],
  },
  "estimating.proposal_expired": {
    version: 1,
    classification: "operational",
    allowedMetadataKeys: [
      "proposal_generation",
      "expires_at",
    ],
  },
  "estimating.proposal_revoked": {
    version: 1,
    classification: "operational",
    allowedMetadataKeys: [
      "proposal_generation",
      "revocation_reason_code",
    ],
  },
  "estimating.proposal_reissued": {
    version: 1,
    classification: "operational",
    allowedMetadataKeys: [
      "previous_proposal_generation",
      "proposal_generation",
      "expires_at",
    ],
  },
  "estimating.pricing_review_requested": {
    version: 1,
    classification: "operational",
    allowedMetadataKeys: [
      "proposal_generation",
      "task_id",
      "expired_at",
    ],
  },
  "estimating.pricing_review_completed": {
    version: 1,
    classification: "operational",
    allowedMetadataKeys: [
      "proposal_generation",
      "task_id",
      "completed_at",
    ],
  },
  "communication.customer_email_received": {
    version: 1,
    classification: "operational",
    allowedMetadataKeys: [
      "channel",
      "direction",
      "thread_id",
      "provider",
      "identity_matched",
    ],
  },
  "communication.employee_email_sent": {
    version: 1,
    classification: "operational",
    allowedMetadataKeys: [
      "channel",
      "direction",
      "thread_id",
      "outbox_id",
      "provider",
    ],
  },
  "communication.email_delivery_confirmed": {
    version: 1,
    classification: "operational",
    allowedMetadataKeys: [
      "channel",
      "thread_id",
      "provider",
      "provider_event_type",
    ],
  },
  "communication.email_bounced": {
    version: 1,
    classification: "operational",
    allowedMetadataKeys: [
      "channel",
      "thread_id",
      "provider",
      "provider_event_type",
      "bounce_type",
      "bounce_subtype",
    ],
  },
} as const satisfies Record<string, EventContract>;

export type BusinessEventName =
  keyof typeof BUSINESS_EVENT_CONTRACTS;

export type BusinessEventDraft = {
  eventName: BusinessEventName;
  eventVersion: number;
  occurredAt: string;
  actorType: BusinessActorType;
  actorId?: string | null;
  actorAuthUserId?: string | null;
  subjectType: string;
  subjectId: string;
  projectId?: string | null;
  leadId?: string | null;
  customerId?: string | null;
  source: string;
  sourceEventId?: string | null;
  idempotencyKey: string;
  correlationId?: string | null;
  causationEventId?: string | null;
  metadata: Record<string, JsonValue>;
  classification: BusinessEventClassification;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUBJECT_TYPE_PATTERN =
  /^[a-z][a-z0-9_]*$/;
const SOURCE_PATTERN =
  /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const MAX_METADATA_BYTES = 16_384;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function assertOptionalUuid(
  label: string,
  value: string | null | undefined,
) {
  if (value != null && !isUuid(value)) {
    throw new Error(`${label} must be a UUID.`);
  }
}

export function validateBusinessEventDraft(
  draft: BusinessEventDraft,
) {
  const contract =
    BUSINESS_EVENT_CONTRACTS[draft.eventName];

  if (!contract) {
    throw new Error("Unknown business event name.");
  }

  if (draft.eventVersion !== contract.version) {
    throw new Error(
      "Business event version does not match its registered contract.",
    );
  }

  if (draft.classification !== contract.classification) {
    throw new Error(
      "Business event classification does not match its registered contract.",
    );
  }

  if (!BUSINESS_ACTOR_TYPES.includes(draft.actorType)) {
    throw new Error("Invalid business event actor type.");
  }

  if (!SUBJECT_TYPE_PATTERN.test(draft.subjectType)) {
    throw new Error("Invalid business event subject type.");
  }

  if (!SOURCE_PATTERN.test(draft.source)) {
    throw new Error("Invalid business event source.");
  }

  if (
    draft.idempotencyKey.length < 1 ||
    draft.idempotencyKey.length > 512
  ) {
    throw new Error(
      "Business event idempotency key must contain 1 to 512 characters.",
    );
  }

  if (
    draft.sourceEventId != null &&
    (draft.sourceEventId.length < 1 ||
      draft.sourceEventId.length > 512)
  ) {
    throw new Error(
      "Business event source event ID must contain 1 to 512 characters.",
    );
  }

  if (Number.isNaN(Date.parse(draft.occurredAt))) {
    throw new Error(
      "Business event occurrence time must be an ISO-compatible timestamp.",
    );
  }

  if (!isUuid(draft.subjectId)) {
    throw new Error("Business event subject ID must be a UUID.");
  }

  assertOptionalUuid("Business event actor ID", draft.actorId);
  assertOptionalUuid(
    "Business event actor auth user ID",
    draft.actorAuthUserId,
  );
  assertOptionalUuid("Business event project ID", draft.projectId);
  assertOptionalUuid("Business event lead ID", draft.leadId);
  assertOptionalUuid("Business event customer ID", draft.customerId);
  assertOptionalUuid(
    "Business event correlation ID",
    draft.correlationId,
  );
  assertOptionalUuid(
    "Business event causation event ID",
    draft.causationEventId,
  );

  const allowedKeys = new Set<string>(
    contract.allowedMetadataKeys,
  );

  for (const key of Object.keys(draft.metadata)) {
    if (!allowedKeys.has(key)) {
      throw new Error(
        `Metadata key ${key} is not allowed for ${draft.eventName}.`,
      );
    }
  }

  const serializedMetadata = JSON.stringify(draft.metadata);
  const metadataBytes = new TextEncoder().encode(
    serializedMetadata,
  ).byteLength;

  if (metadataBytes > MAX_METADATA_BYTES) {
    throw new Error(
      "Business event metadata exceeds the 16 KiB contract limit.",
    );
  }

  return draft;
}
