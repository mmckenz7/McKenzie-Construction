import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type BusinessEventDraft,
  validateBusinessEventDraft,
} from "@/lib/mission-control/event-contracts";

export type RecordedBusinessEvent = {
  id: string;
  companyId: string;
  created: boolean;
  recordedAt: string;
};

type RecordBusinessEventRpcResult = {
  id?: unknown;
  company_id?: unknown;
  created?: unknown;
  recorded_at?: unknown;
};

function isNonemptyString(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

export async function recordBusinessEvent(
  supabase: SupabaseClient,
  draft: BusinessEventDraft,
): Promise<RecordedBusinessEvent> {
  const event =
    validateBusinessEventDraft(draft);

  const { data, error } = await supabase.rpc(
    "record_business_event",
    {
      requested_event_name:
        event.eventName,
      requested_event_version:
        event.eventVersion,
      requested_occurred_at:
        event.occurredAt,
      requested_actor_type:
        event.actorType,
      requested_actor_id:
        event.actorId ?? null,
      requested_actor_auth_user_id:
        event.actorAuthUserId ?? null,
      requested_subject_type:
        event.subjectType,
      requested_subject_id:
        event.subjectId,
      requested_project_id:
        event.projectId ?? null,
      requested_lead_id:
        event.leadId ?? null,
      requested_customer_id:
        event.customerId ?? null,
      requested_source:
        event.source,
      requested_source_event_id:
        event.sourceEventId ?? null,
      requested_idempotency_key:
        event.idempotencyKey,
      requested_correlation_id:
        event.correlationId ?? null,
      requested_causation_event_id:
        event.causationEventId ?? null,
      requested_metadata:
        event.metadata,
      requested_classification:
        event.classification,
    },
  );

  if (error) {
    throw new Error(
      "The business event could not be recorded.",
    );
  }

  const result =
    data as RecordBusinessEventRpcResult | null;

  if (
    !result ||
    !isNonemptyString(result.id) ||
    !isNonemptyString(result.company_id) ||
    typeof result.created !== "boolean" ||
    !isNonemptyString(result.recorded_at)
  ) {
    throw new Error(
      "The business event emitter returned an invalid response.",
    );
  }

  return {
    id: result.id,
    companyId: result.company_id,
    created: result.created,
    recordedAt: result.recorded_at,
  };
}
