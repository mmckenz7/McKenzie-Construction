import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const form = readFileSync("src/components/project-request-form.tsx", "utf8");
const route = readFileSync("src/app/api/leads/route.ts", "utf8");

test("public lead intake requires email in the browser and on the server", () => {
  assert.match(
    form,
    /Email \*[\s\S]*?<input[\s\S]*?required[\s\S]*?type="email"/,
  );
  assert.match(
    route,
    /const email = requiredText\([\s\S]*formData\.get\("email"\)[\s\S]*"Email"/,
  );
  assert.match(route, /A valid email is required/);
});
