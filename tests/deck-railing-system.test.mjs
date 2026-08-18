import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const source = readFileSync("src/lib/deck-railing-system.ts", "utf8");
const transformed = typescript.transpileModule(source, {
  compilerOptions: {
    module: typescript.ModuleKind.CommonJS,
    target: typescript.ScriptTarget.ES2022,
  },
}).outputText;
const testModule = { exports: {} };
runInNewContext(transformed, {
  module: testModule,
  exports: testModule.exports,
  require,
  URL,
  Math,
});
const { buildDefaultAluminumRailingPackage } = testModule.exports;

const product = (kind, unitCost, stockLengthFeet = null) => ({
  kind,
  description: kind,
  unitCost,
  sourceUrl: `https://www.lowes.com/pd/${kind}/1`,
  stockLengthFeet,
  manufacturer: "Deckorators",
  productLine: "Contemporary",
});

test("builds a complete same-line aluminum package instead of one rail section", () => {
  const system = buildDefaultAluminumRailingPackage({
    products: [
      product("railing_level_kit", 300, 8),
      product("railing_level_post", 100),
      product("railing_stair_kit", 250, 6),
      product("railing_stair_lower_post", 115),
    ],
    railingLengthFeet: 35,
    stairsPresent: true,
    stairProjectionFeet: 5,
  });
  assert.deepEqual(
    Array.from(system.lines, (line) => [line.role, line.quantity]),
    [
      ["railing_level_kit", 5],
      ["railing_level_post", 7],
      ["railing_stair_kit", 1],
      ["railing_stair_lower_post", 1],
    ],
  );
  assert.equal(system.totalCost, 2565);
  assert.equal(system.unresolved.length, 0);
  assert.ok(system.lines[0].includedComponents.includes("mounting brackets and bracket hardware"));
  assert.ok(system.lines[1].includedComponents.includes("post cap"));
});

test("keeps the package incomplete when any required compatible component is missing", () => {
  const system = buildDefaultAluminumRailingPackage({
    products: [product("railing_level_kit", 300, 8)],
    railingLengthFeet: 16,
    stairsPresent: false,
  });
  assert.equal(system.totalCost, null);
  assert.deepEqual(Array.from(system.unresolved, (line) => line.role), [
    "railing_level_post",
  ]);
});

test("does not mix another manufacturer or product line into the default system", () => {
  const wrongLine = {
    ...product("railing_level_post", 50),
    manufacturer: "Other",
    productLine: "Similar Looking Rail",
  };
  const system = buildDefaultAluminumRailingPackage({
    products: [product("railing_level_kit", 300, 8), wrongLine],
    railingLengthFeet: 8,
    stairsPresent: false,
  });
  assert.equal(system.totalCost, null);
  assert.equal(system.unresolved[0].role, "railing_level_post");
});

test("the default recipe exposes every required component when lookup returns nothing", () => {
  const system = buildDefaultAluminumRailingPackage({
    products: [],
    railingLengthFeet: 35,
    stairsPresent: true,
    stairProjectionFeet: 6,
  });

  assert.deepEqual(
    Array.from(system.lines, (line) => line.role),
    [
      "railing_level_kit",
      "railing_level_post",
      "railing_stair_kit",
      "railing_stair_lower_post",
    ],
  );
  assert.equal(system.unresolved.length, 4);
  assert.equal(system.totalCost, null);
  assert.ok(
    system.lines.every((line) =>
      line.product?.sourceUrl.startsWith("https://www.lowes.com/pd/"),
    ),
  );
});
