export const MISSION_CONTROL_V0_RULE_KEYS = [
  "communication.customer_reply_unanswered",
  "estimating.proposal_follow_up_opportunity",
  "estimating.proposal_expiring_soon",
  "estimating.proposal_pricing_review_required",
] as const;

export const MISSION_CONTROL_SIGNAL_SEVERITIES = [
  "critical",
  "urgent",
  "warning",
  "info",
] as const;

export const MISSION_CONTROL_ACTIONABLE_STATUSES = [
  "open",
  "acknowledged",
  "snoozed",
] as const;

export type MissionControlSignalSeverity =
  (typeof MISSION_CONTROL_SIGNAL_SEVERITIES)[number];

export type MissionControlSignalRow = {
  id: string;
  rule_key: string;
  rule_version: number;
  subject_type: string;
  subject_id: string;
  status: string;
  severity: MissionControlSignalSeverity;
  first_detected_at: string;
  last_evaluated_at: string;
  due_at: string | null;
  assigned_to_id: string | null;
  acknowledged_at: string | null;
  snoozed_until: string | null;
  evidence: Record<string, unknown>;
  rule_output: Record<string, unknown>;
  updated_at: string;
};

const DEFAULT_FEED_LIMIT = 50;
const MAX_FEED_LIMIT = 100;

export function parseMissionControlFeedLimit(
  value: string | null,
) {
  if (value === null || value.trim() === "") {
    return DEFAULT_FEED_LIMIT;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > MAX_FEED_LIMIT
  ) {
    return null;
  }

  return parsed;
}

function timestampValue(value: string | null) {
  if (value === null) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed)
    ? Number.POSITIVE_INFINITY
    : parsed;
}

export function compareMissionControlSignals(
  left: MissionControlSignalRow,
  right: MissionControlSignalRow,
) {
  const severityDifference =
    MISSION_CONTROL_SIGNAL_SEVERITIES.indexOf(
      left.severity,
    ) -
    MISSION_CONTROL_SIGNAL_SEVERITIES.indexOf(
      right.severity,
    );

  if (severityDifference !== 0) {
    return severityDifference;
  }

  const dueDifference =
    timestampValue(left.due_at) -
    timestampValue(right.due_at);

  if (dueDifference !== 0) {
    return dueDifference;
  }

  const detectedDifference =
    timestampValue(left.first_detected_at) -
    timestampValue(right.first_detected_at);

  if (detectedDifference !== 0) {
    return detectedDifference;
  }

  return left.id.localeCompare(right.id);
}

export function toMissionControlSignalResponse(
  signal: MissionControlSignalRow,
) {
  return {
    id: signal.id,
    ruleKey: signal.rule_key,
    ruleVersion: signal.rule_version,
    subjectType: signal.subject_type,
    subjectId: signal.subject_id,
    status: signal.status,
    severity: signal.severity,
    firstDetectedAt:
      signal.first_detected_at,
    lastEvaluatedAt:
      signal.last_evaluated_at,
    dueAt: signal.due_at,
    assignedToId:
      signal.assigned_to_id,
    acknowledgedAt:
      signal.acknowledged_at,
    snoozedUntil:
      signal.snoozed_until,
    evidence: signal.evidence,
    ruleOutput: signal.rule_output,
    updatedAt: signal.updated_at,
  };
}
