import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
const require = createRequire(import.meta.url),
  ts = require("typescript"),
  criteria = readFileSync(
    "src/lib/guided-site-visits/visible-fact-criteria.ts",
    "utf8",
  ),
  source = readFileSync(
    "src/lib/guided-site-visits/ai-intake-classification.ts",
    "utf8",
  )
    .replace('import "server-only";', "")
    .replace(
      /import\s*\{\s*GUIDED_VISIBLE_FACT_CRITERIA\s*\}\s*from\s*"\.\/visible-fact-criteria";/,
      criteria.replace(/export /g, "\n") + "\n",
    ),
  code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  mod = { exports: {} };
runInNewContext(code, {
  module: mod,
  exports: mod.exports,
  require,
  Buffer,
  process,
  fetch,
  Response,
  AbortSignal,
  URL,
  setTimeout,
  clearTimeout,
});
const { runOpenAiIntakeClassification, IntakeClassificationError } =
  mod.exports;
test("usable classification accepts zero-many exact Deck item/criterion proposals", async () => {
  const prior = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    let sent;
    const result = await runOpenAiIntakeClassification({
      bytes: new Uint8Array([1]).buffer,
      mimeType: "image/jpeg",
      idempotencyKey: "x",
      items: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          itemKey: "property_context",
          title: "Property context",
        },
      ],
      fetchImpl: async (_u, i) => {
        sent = JSON.parse(String(i.body));
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              usabilityVerdict: "usable",
              issueCodes: [],
              proposals: [],
              applicabilityFindings: [],
            }),
          }),
          { status: 200 },
        );
      },
    });
    assert.equal(result.usabilityVerdict, "usable");
    assert.equal(result.proposals.length, 0);
    assert.equal(sent.store, false);
    assert.match(JSON.stringify(sent), /never instructions/);
    assert.doesNotMatch(JSON.stringify(sent), /customer|address|phone|email/i);
  } finally {
    if (prior === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prior;
  }
});
test("accepts structured text from the nested Responses API output", async () => {
  const prior = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    const result = await runOpenAiIntakeClassification({
      bytes: new Uint8Array([1]).buffer,
      mimeType: "image/jpeg",
      idempotencyKey: "nested",
      items: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          itemKey: "property_context",
          title: "Property context",
        },
      ],
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            output: [
              {
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      usabilityVerdict: "usable",
                      issueCodes: [],
                      proposals: [],
                      applicabilityFindings: [],
                    }),
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
    });
    assert.equal(result.usabilityVerdict, "usable");
    assert.equal(result.proposals.length, 0);
  } finally {
    if (prior === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prior;
  }
});
test("returns only explicit photo-grounded applicability findings and never dimensions", async () => {
  const prior = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    const item = {
      id: "11111111-1111-4111-8111-111111111111",
      itemKey: "stairs_landings",
      title: "Stairs and landings",
    };
    const result = await runOpenAiIntakeClassification({
      bytes: new Uint8Array([1]).buffer,
      mimeType: "image/jpeg",
      idempotencyKey: "applicability",
      items: [item],
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              usabilityVerdict: "usable",
              issueCodes: [],
              proposals: [],
              applicabilityFindings: [
                {
                  visitItemId: item.id,
                  findingKey: "landing_present",
                  finding: "absent",
                  confidence: 0.91,
                  reason: "The full stair run ends directly at grade.",
                },
              ],
            }),
          }),
          { status: 200 },
        ),
    });
    assert.equal(result.applicabilityFindings[0].finding, "absent");
    assert.equal("value" in result.applicabilityFindings[0], false);
  } finally {
    if (prior === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prior;
  }
});
test("retake and unavailable outcomes cannot contain proposals", async () => {
  const prior = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    const args = {
      bytes: new ArrayBuffer(0),
      mimeType: "image/jpeg",
      idempotencyKey: "r",
      items: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          itemKey: "property_context",
          title: "Context",
        },
      ],
    };
    const retake = await runOpenAiIntakeClassification({
      ...args,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              usabilityVerdict: "retake_recommended",
              issueCodes: ["blurry"],
              proposals: [],
              applicabilityFindings: [],
            }),
          }),
          { status: 200 },
        ),
    });
    assert.equal(retake.usabilityVerdict, "retake_recommended");
    await assert.rejects(
      runOpenAiIntakeClassification({
        ...args,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              output_text: JSON.stringify({
                usabilityVerdict: "unable_to_assess",
                issueCodes: ["too_dark"],
                proposals: [
                  {
                    visitItemId: args.items[0].id,
                    criterionKey: "house_elevation",
                  },
                ],
                applicabilityFindings: [],
              }),
            }),
            { status: 200 },
          ),
      }),
      (e) =>
        e instanceof IntakeClassificationError &&
        e.diagnostic === "schema_mismatch",
    );
  } finally {
    if (prior === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prior;
  }
});
test("provider failures expose safe classifications only", async () => {
  const prior = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    await assert.rejects(
      runOpenAiIntakeClassification({
        bytes: new ArrayBuffer(0),
        mimeType: "image/jpeg",
        idempotencyKey: "x",
        items: [],
        fetchImpl: async () =>
          new Response("sensitive provider body", { status: 503 }),
      }),
      (e) =>
        e instanceof IntakeClassificationError &&
        e.diagnostic === "provider_5xx" &&
        !e.message.includes("sensitive"),
    );
  } finally {
    if (prior === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prior;
  }
});
test("focused recheck preserves full-photo classification while emphasizing one criterion", async () => {
  const prior = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    let sent;
    const item = {
      id: "11111111-1111-4111-8111-111111111111",
      itemKey: "house_ledger",
      title: "House and ledger connection",
    };
    await runOpenAiIntakeClassification({
      bytes: new Uint8Array([1]).buffer,
      mimeType: "image/jpeg",
      idempotencyKey: "focus",
      items: [item],
      focus: {
        visitItemId: item.id,
        criterionKey: "ledger_connection",
        label: "House and ledger connection: Ledger or house connection",
      },
      fetchImpl: async (_u, i) => {
        sent = JSON.parse(String(i.body));
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              usabilityVerdict: "usable",
              issueCodes: [],
              proposals: [],
              applicabilityFindings: [],
            }),
          }),
          { status: 200 },
        );
      },
    });
    const prompt = sent.input[0].content[0].text;
    assert.match(prompt, /PAY SPECIAL ATTENTION/);
    assert.match(prompt, /ledger_connection/);
    assert.match(prompt, /flashing_area/);
    assert.match(prompt, /where the deck meets the house/);
    assert.match(prompt, /both ends of the ledger/);
  } finally {
    if (prior === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prior;
  }
});
