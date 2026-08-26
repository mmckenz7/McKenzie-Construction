import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  consultationTimeOptions,
  isConsultationTimeAllowed,
} from "../src/lib/consultation-hours.ts";

const contactPage = readFileSync("src/app/contact/page.tsx", "utf8");
const requestForm = readFileSync(
  "src/components/project-request-form.tsx",
  "utf8",
);
const leadRoute = readFileSync("src/app/api/leads/route.ts", "utf8");

test("public consultation choices use bounded half-hour increments", () => {
  const options = consultationTimeOptions({ start: "08:00", end: "10:00" });

  assert.deepEqual(
    options.map((option) => option.value),
    ["08:00", "08:30", "09:00", "09:30", "10:00"],
  );
  assert.equal(
    isConsultationTimeAllowed("09:30", { start: "08:00", end: "10:00" }),
    true,
  );
  assert.equal(
    isConsultationTimeAllowed("09:15", { start: "08:00", end: "10:00" }),
    false,
  );
});

test("public form and server enforce the same existing-schema hours", () => {
  assert.match(contactPage, /\.select\("end_of_business_time"\)/);
  assert.match(contactPage, /start: "08:00"/);
  assert.match(requestForm, /consultationTimeOptions\(consultationHours\)/);
  assert.equal((requestForm.match(/timeOptions\.map/g) ?? []).length, 2);
  assert.match(leadRoute, /isConsultationTimeAllowed\(requestedTime/);
  assert.match(leadRoute, /isConsultationTimeAllowed\(alternateTime/);
  assert.doesNotMatch(
    contactPage + leadRoute,
    /consultation_start_time|consultation_end_time/,
  );
});

test("rejected or failed submissions explain the recovery path", () => {
  assert.match(contactPage, /params\.error === "consultation-time"/);
  assert.match(contactPage, /params\.error === "submission"/);
  assert.match(contactPage, /role="alert"/);
  assert.match(leadRoute, /contact\?error=consultation-time/);
});
