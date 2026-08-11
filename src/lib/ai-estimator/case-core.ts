export const AI_ESTIMATOR_RETENTION_POLICY_VERSION =
  "raw-media-30-days-after-apply-or-cancel-v0";

export const AI_ESTIMATOR_CASE_SELECT =
  "id,lead_id,status,title,retention_policy_version,recording_permission_acknowledged_at,created_at,updated_at";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CREATE_FIELDS = new Set([
  "leadId",
  "title",
  "recordingPermissionAcknowledged",
]);

export type AiEstimatorCaseCreateInput = {
  leadId: string;
  title: string;
  recordingPermissionAcknowledged: true;
};

export function parseAiEstimatorCaseCreateInput(
  value: unknown,
): AiEstimatorCaseCreateInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("A JSON object is required.");
  }

  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !CREATE_FIELDS.has(key))) {
    throw new TypeError("The request contains unsupported fields.");
  }

  if (typeof record.leadId !== "string" || !UUID.test(record.leadId)) {
    throw new TypeError("leadId must be a UUID.");
  }

  if (typeof record.title !== "string") {
    throw new TypeError("title is required.");
  }
  const title = record.title.trim();
  if (title.length < 1 || title.length > 500) {
    throw new TypeError("title must contain between 1 and 500 characters.");
  }

  if (record.recordingPermissionAcknowledged !== true) {
    throw new TypeError(
      "Recording permission must be acknowledged before creating an AI Estimator case.",
    );
  }

  return {
    leadId: record.leadId,
    title,
    recordingPermissionAcknowledged: true,
  };
}

export function isUuid(value: string) {
  return UUID.test(value);
}

export function projectAiEstimatorCase(value: Record<string, unknown>) {
  return {
    id: String(value.id),
    leadId: String(value.lead_id),
    status: String(value.status),
    title: String(value.title),
    retentionPolicyVersion: String(value.retention_policy_version),
    recordingPermissionAcknowledgedAt:
      typeof value.recording_permission_acknowledged_at === "string"
        ? value.recording_permission_acknowledged_at
        : null,
    createdAt: String(value.created_at),
    updatedAt: String(value.updated_at),
  };
}
