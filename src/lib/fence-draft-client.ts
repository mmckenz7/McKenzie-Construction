const FENCE_LAYOUT_SCHEMA_VERSION = "fence-layout-v1" as const;
const FENCE_CONTEXT_SCHEMA_VERSION = "fence-context-v1" as const;

export type FenceContextAnswers = Readonly<{
  system?: "emblem_6x8_white" | "different_or_unsure";
  measurementBasis?: "post_centers" | "different_or_unsure";
  terrain?: "level" | "sloped_or_unsure";
  corners?: "exact_90" | "different_or_unsure";
  frostDepthInches?: string;
  conditions?: "none" | "single_gate_4ft" | "single_gate_5ft" | "pool" | "other_unsupported";
}>;

type PersistableFenceLayoutDraft = Readonly<{
  schemaVersion: typeof FENCE_LAYOUT_SCHEMA_VERSION;
  runLengthsInches: readonly number[];
  totalLengthInches: number;
  needsGate: boolean;
  contextAnswers?: FenceContextAnswers;
}>;

type StoredFenceLayoutDraft = PersistableFenceLayoutDraft & Readonly<{
  id: string;
  estimateId: string;
  revision: number;
  updatedAt: string;
  contextSchemaVersion: typeof FENCE_CONTEXT_SCHEMA_VERSION;
  contextAnswers: FenceContextAnswers;
}>;

type FetchLike = typeof fetch;

function requiredInteger(value: unknown, field: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${field} must be a nonnegative whole number.`);
  }
  return value as number;
}

function parseStoredDraft(value: unknown): StoredFenceLayoutDraft | null {
  if (value === null) return null;
  if (!value || typeof value !== "object") throw new TypeError("The saved Fence draft response is invalid.");
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.estimateId !== "string"
    || record.schemaVersion !== FENCE_LAYOUT_SCHEMA_VERSION || typeof record.updatedAt !== "string"
    || typeof record.needsGate !== "boolean" || !Array.isArray(record.runLengthsInches)
    || record.contextSchemaVersion !== FENCE_CONTEXT_SCHEMA_VERSION) {
    throw new TypeError("The saved Fence draft response is invalid.");
  }
  const runLengthsInches = record.runLengthsInches.map((length, index) => {
    const parsed = requiredInteger(length, `runLengthsInches[${index}]`);
    if (parsed < 1 || parsed > 12_000) throw new TypeError("The saved Fence draft contains an invalid run length.");
    return parsed;
  });
  const totalLengthInches = requiredInteger(record.totalLengthInches, "totalLengthInches");
  if (runLengthsInches.length < 1 || runLengthsInches.length > 50
    || runLengthsInches.reduce((sum, length) => sum + length, 0) !== totalLengthInches
    || totalLengthInches > 60_000) {
    throw new TypeError("The saved Fence draft totals are invalid.");
  }
  const contextAnswers = parseContextAnswers(record.contextAnswers, runLengthsInches.length, record.needsGate);
  return Object.freeze({
    id: record.id,
    estimateId: record.estimateId,
    schemaVersion: FENCE_LAYOUT_SCHEMA_VERSION,
    revision: requiredInteger(record.revision, "revision"),
    runLengthsInches: Object.freeze(runLengthsInches),
    totalLengthInches,
    needsGate: record.needsGate,
    contextSchemaVersion: FENCE_CONTEXT_SCHEMA_VERSION,
    contextAnswers,
    updatedAt: record.updatedAt,
  });
}

function parseContextAnswers(value: unknown, runCount: number, needsGate: boolean): FenceContextAnswers {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("The saved Fence context response is invalid.");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(["system", "measurementBasis", "terrain", "corners", "frostDepthInches", "conditions"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) throw new TypeError("The saved Fence context response is invalid.");
  const answer = <T extends string>(field: string, choices: readonly T[]): T | undefined => {
    const candidate = record[field];
    if (candidate === undefined) return undefined;
    if (typeof candidate !== "string" || !choices.includes(candidate as T)) throw new TypeError(`The saved Fence ${field} answer is invalid.`);
    return candidate as T;
  };
  const parsed: FenceContextAnswers = {
    system: answer("system", ["emblem_6x8_white", "different_or_unsure"]),
    measurementBasis: answer("measurementBasis", ["post_centers", "different_or_unsure"]),
    terrain: answer("terrain", ["level", "sloped_or_unsure"]),
    corners: answer("corners", ["exact_90", "different_or_unsure"]),
    conditions: answer("conditions", ["none", "single_gate_4ft", "single_gate_5ft", "pool", "other_unsupported"]),
    frostDepthInches: record.frostDepthInches === undefined ? undefined : String(requiredInteger(record.frostDepthInches, "frostDepthInches")),
  };
  if (parsed.frostDepthInches !== undefined && (+parsed.frostDepthInches < 1 || +parsed.frostDepthInches > 9999)) throw new TypeError("The saved Fence frost depth is invalid.");
  if (runCount === 1 && parsed.corners !== undefined) throw new TypeError("A one-run Fence draft cannot contain a corner answer.");
  if (needsGate && parsed.conditions === "none") throw new TypeError("A gate-requested Fence draft cannot contain a no-gate answer.");
  return Object.freeze(Object.fromEntries(Object.entries(parsed).filter(([, item]) => item !== undefined)) as FenceContextAnswers);
}

async function responseBody(response: Response) {
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok || body.success !== true) {
    const error = new Error(typeof body.error === "string" ? body.error : "The Fence draft request failed.");
    Object.assign(error, { status: response.status, code: body.code });
    throw error;
  }
  return body;
}

export async function loadFenceDraft(
  fetcher: FetchLike,
  estimateId: string,
): Promise<StoredFenceLayoutDraft | null> {
  const response = await fetcher(`/api/estimates/${encodeURIComponent(estimateId)}/fence-draft`, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const body = await responseBody(response);
  return parseStoredDraft(body.draft);
}

export async function saveFenceDraft(
  fetcher: FetchLike,
  estimateId: string,
  expectedRevision: number,
  draft: PersistableFenceLayoutDraft,
): Promise<StoredFenceLayoutDraft> {
  const response = await fetcher(`/api/estimates/${encodeURIComponent(estimateId)}/fence-draft`, {
    method: "PUT",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      expectedRevision,
      schemaVersion: draft.schemaVersion,
      runLengthsInches: draft.runLengthsInches,
      needsGate: draft.needsGate,
      contextSchemaVersion: FENCE_CONTEXT_SCHEMA_VERSION,
      contextAnswers: {
        ...(draft.contextAnswers ?? {}),
        ...(draft.contextAnswers?.frostDepthInches === undefined
          ? {}
          : { frostDepthInches: Number(draft.contextAnswers.frostDepthInches) }),
      },
    }),
  });
  const body = await responseBody(response);
  const saved = parseStoredDraft(body.draft);
  if (!saved) throw new TypeError("The saved Fence draft was not returned.");
  return saved;
}

export function isStaleFenceDraftError(error: unknown) {
  return error instanceof Error
    && (error as Error & { code?: unknown }).code === "stale_fence_revision";
}
