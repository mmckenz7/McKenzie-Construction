import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const serviceRoleKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("Local sandbox URL and service credential are required.");
const parsed = new URL(url);
if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.port !== "54321") {
  throw new Error("Sandbox verification is locked to the local Supabase API on port 54321.");
}

const supabase = createClient(parsed.origin, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const expected = {
  team_members: 1,
  customers: 8,
  projects: 8,
  project_costs: 40,
  leads: 14,
  tasks: 18,
};

for (const [table, minimum] of Object.entries(expected)) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  if (count === null || count < minimum) throw new Error(`${table}: expected at least ${minimum}, received ${count ?? "unknown"}.`);
  console.log(`${table}: ${count}`);
}

const { data: owner, error: ownerError } = await supabase
  .from("team_members")
  .select("id,auth_user_id,status")
  .eq("email", "owner@mckenzie-sandbox.test")
  .maybeSingle();
if (ownerError || !owner?.auth_user_id || owner.status !== "active") {
  throw new Error(`sandbox owner: ${ownerError?.message ?? "active auth linkage is missing"}`);
}
console.log("sandbox owner: active and linked");
