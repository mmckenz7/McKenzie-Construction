import "server-only";

import { createHash } from "node:crypto";

export const DECK_SHAPE_SUGGESTION_MODEL = "gpt-5.6-luna";
export const DECK_SHAPE_SUGGESTION_PROMPT_VERSION = "deck-shape-suggestion-v1";
export const DECK_SHAPE_SUGGESTION_SCHEMA_VERSION = "deck-shape-suggestion-v1";

export class DeckShapeSuggestionError extends Error {
  constructor(
    public readonly diagnostic:
      | "missing_config"
      | "timeout"
      | "provider_4xx"
      | "provider_5xx"
      | "invalid_json"
      | "schema_mismatch",
  ) {
    super("The photo-assisted Deck shape is unavailable.");
  }
}

function outputText(value: Record<string, unknown>) {
  if (typeof value.output_text === "string") return value.output_text;
  for (const item of Array.isArray(value.output) ? value.output : []) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    for (const part of Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : []) {
      if (!part || typeof part !== "object" || Array.isArray(part)) continue;
      if (typeof (part as Record<string, unknown>).text === "string")
        return (part as Record<string, unknown>).text as string;
    }
  }
  throw new DeckShapeSuggestionError("invalid_json");
}

export async function runOpenAiDeckShapeSuggestion(args: {
  photos: readonly { bytes: ArrayBuffer; mimeType: string }[];
  idempotencyKey: string;
  fetchImpl?: typeof fetch;
}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new DeckShapeSuggestionError("missing_config");
  const body = {
    model: DECK_SHAPE_SUGGESTION_MODEL,
    store: false,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "These are photos of one existing residential deck that may be replaced in the same footprint. Suggest only the visible bird's-eye footprint topology as an editable starting sketch. Return normalized corner coordinates from 0 to 1, in perimeter order, with the house side at y=0. Do not infer exact dimensions, structure, code compliance, framing, concealed conditions, products, quantities, or pricing. Use unable when the photos do not reliably show the footprint. This is only a human-reviewed sketch suggestion.",
          },
          ...args.photos.map((photo) => ({
            type: "input_image",
            image_url: `data:${photo.mimeType};base64,${Buffer.from(photo.bytes).toString("base64")}`,
            detail: "high",
          })),
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "deck_shape_suggestion",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            result: { type: "string", enum: ["suggested", "unable"] },
            shapeType: {
              type: "string",
              enum: ["rectangle", "l_shape", "stepped", "irregular", "unable"],
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            points: {
              type: "array",
              maxItems: 12,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  x: { type: "number", minimum: 0, maximum: 1 },
                  y: { type: "number", minimum: 0, maximum: 1 },
                },
                required: ["x", "y"],
              },
            },
            explanation: { type: "string", minLength: 1, maxLength: 500 },
          },
          required: ["result", "shapeType", "confidence", "points", "explanation"],
        },
      },
    },
  };
  const requestJson = JSON.stringify(body);
  let response: Response;
  try {
    response = await (args.fetchImpl ?? fetch)("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": args.idempotencyKey,
      },
      body: requestJson,
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    throw new DeckShapeSuggestionError("timeout");
  }
  const responseText = await response.text();
  if (!response.ok)
    throw new DeckShapeSuggestionError(response.status < 500 ? "provider_4xx" : "provider_5xx");
  let raw: unknown;
  try {
    raw = JSON.parse(outputText(JSON.parse(responseText) as Record<string, unknown>));
  } catch (error) {
    if (error instanceof DeckShapeSuggestionError) throw error;
    throw new DeckShapeSuggestionError("invalid_json");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length !== 5)
    throw new DeckShapeSuggestionError("schema_mismatch");
  const value = raw as Record<string, unknown>;
  const points = Array.isArray(value.points) ? value.points : [];
  if (
    !["suggested", "unable"].includes(String(value.result)) ||
    !["rectangle", "l_shape", "stepped", "irregular", "unable"].includes(String(value.shapeType)) ||
    typeof value.confidence !== "number" ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1 ||
    typeof value.explanation !== "string" ||
    !value.explanation.trim() ||
    value.explanation.length > 500 ||
    points.length > 12 ||
    points.some((point) => {
      if (!point || typeof point !== "object" || Array.isArray(point) || Object.keys(point).length !== 2) return true;
      const record = point as Record<string, unknown>;
      return typeof record.x !== "number" || typeof record.y !== "number" || !Number.isFinite(record.x) || !Number.isFinite(record.y) || record.x < 0 || record.x > 1 || record.y < 0 || record.y > 1;
    }) ||
    (value.result === "suggested" && points.length < 3) ||
    (value.result === "unable" && points.length !== 0)
  )
    throw new DeckShapeSuggestionError("schema_mismatch");
  return {
    result: value.result as "suggested" | "unable",
    shapeType: value.shapeType as "rectangle" | "l_shape" | "stepped" | "irregular" | "unable",
    confidence: value.confidence,
    points: points as { x: number; y: number }[],
    explanation: value.explanation.trim(),
    requestSha256: createHash("sha256").update(requestJson).digest("hex"),
    responseSha256: createHash("sha256").update(responseText).digest("hex"),
  };
}
