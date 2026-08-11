import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const serviceRoleKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.LOCAL_SANDBOX_PASSWORD;

function requireLocalSupabaseUrl(value) {
  if (!value) throw new Error("LOCAL_SUPABASE_URL is required.");
  const parsed = new URL(value);
  const localHost = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (parsed.protocol !== "http:" || !localHost || parsed.port !== "54321") {
    throw new Error("Sandbox seeding is locked to the local Supabase API at http://127.0.0.1:54321.");
  }
  return parsed.origin;
}

const localUrl = requireLocalSupabaseUrl(url);
if (!serviceRoleKey) throw new Error("LOCAL_SUPABASE_SERVICE_ROLE_KEY is required.");
if (!password || password.length < 10) throw new Error("LOCAL_SANDBOX_PASSWORD must contain at least 10 characters.");

const supabase = createClient(localUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function upsert(table, rows, options = {}) {
  const { error } = await supabase.from(table).upsert(rows, options);
  if (error) throw new Error(`${table}: ${error.message}`);
}

const ownerEmail = "owner@mckenzie-sandbox.test";
const { data: listedUsers, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw new Error(`auth.users: ${listError.message}`);
let owner = listedUsers.users.find((user) => user.email === ownerEmail);
if (!owner) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: ownerEmail,
    password,
    email_confirm: true,
    user_metadata: { name: "Michael McKenzie", sandbox_fixture: true },
  });
  if (error || !data.user) throw new Error(`auth.users: ${error?.message ?? "owner was not created"}`);
  owner = data.user;
}

const { data: companyRows, error: companyRowsError } = await supabase
  .from("company_settings")
  .select("id")
  .limit(2);
if (companyRowsError || !companyRows || companyRows.length !== 1) {
  throw new Error("company_settings: local sandbox requires exactly one company row.");
}
const companyId = companyRows[0].id;

const teamMemberId = "10000000-0000-4000-8000-000000000001";
await upsert("team_members", [{
  id: teamMemberId,
  auth_user_id: owner.id,
  name: "Michael McKenzie",
  email: ownerEmail,
  phone: "865-555-0100",
  job_title: "Owner",
  roles: ["owner", "administrator", "estimator", "project_manager"],
  status: "active",
  is_default_lead_owner: true,
  is_default_estimator: true,
  is_default_project_manager: true,
  notes: "LOCAL SANDBOX FIXTURE",
}], { onConflict: "id" });

await upsert("app_users", [{
  id: "11000000-0000-4000-8000-000000000001",
  auth_user_id: owner.id,
  company_id: companyId,
  team_member_id: teamMemberId,
  display_name: "Michael McKenzie",
  email: ownerEmail,
  role: "owner",
  default_portal: "admin",
  is_active: true,
  permissions: {},
  metadata: { sandbox_fixture: true },
}], { onConflict: "auth_user_id" });

const customerRows = [
  ["20000000-0000-4000-8000-000000000001", "Avery & Jordan Reed", "avery.reed@example.test", "865-555-0111", "128 River Bend Way", "Knoxville", "Deck"],
  ["20000000-0000-4000-8000-000000000002", "Olivia Carter", "olivia.carter@example.test", "865-555-0112", "44 Cherokee Ridge", "Knoxville", "Outdoor Kitchen"],
  ["20000000-0000-4000-8000-000000000003", "Noah Bennett", "noah.bennett@example.test", "865-555-0113", "901 Lakeview Point", "Vonore", "Deck"],
  ["20000000-0000-4000-8000-000000000004", "Emma Brooks", "emma.brooks@example.test", "865-555-0114", "72 Mountain Laurel Lane", "Farragut", "Covered Porch"],
  ["20000000-0000-4000-8000-000000000005", "Liam Foster", "liam.foster@example.test", "865-555-0115", "318 Walnut Grove Road", "Maryville", "Deck Repair"],
  ["20000000-0000-4000-8000-000000000006", "Sophia Hayes", "sophia.hayes@example.test", "865-555-0116", "16 Sunset Bluff", "Oak Ridge", "Pergola"],
  ["20000000-0000-4000-8000-000000000007", "Mason Turner", "mason.turner@example.test", "865-555-0117", "503 Cedar Creek Drive", "Lenoir City", "Screened Porch"],
  ["20000000-0000-4000-8000-000000000008", "Isabella Price", "isabella.price@example.test", "865-555-0118", "220 Dogwood Trail", "Knoxville", "Outdoor Living"],
].map(([id, customer_name, email, phone, address_line_1, city, project_type]) => ({
  id, customer_name, email, phone, address_line_1, city, state: "TN", postal_code: "37922",
  project_type, status: "active", assigned_to: teamMemberId, notes: "LOCAL SANDBOX FIXTURE",
}));
await upsert("customers", customerRows, { onConflict: "id" });

const projectRows = [
  ["30000000-0000-4000-8000-000000000001", customerRows[0], "Riverside Composite Deck", "in_progress", 78400, "2026-07-13", "2026-08-28"],
  ["30000000-0000-4000-8000-000000000002", customerRows[1], "Carter Outdoor Kitchen", "in_progress", 42000, "2026-07-27", "2026-09-04"],
  ["30000000-0000-4000-8000-000000000003", customerRows[2], "Lake House Deck", "completed", 93500, "2026-04-06", "2026-06-26"],
  ["30000000-0000-4000-8000-000000000004", customerRows[3], "Mountain View Covered Porch", "scheduled", 65200, "2026-08-17", "2026-10-02"],
  ["30000000-0000-4000-8000-000000000005", customerRows[4], "Walnut Grove Structural Repair", "on_hold", 18750, "2026-07-20", "2026-08-21"],
  ["30000000-0000-4000-8000-000000000006", customerRows[5], "Sunset Bluff Pergola", "planning", 24600, null, null],
  ["30000000-0000-4000-8000-000000000007", customerRows[6], "Cedar Creek Screened Porch", "in_progress", 116000, "2026-06-22", "2026-09-18"],
  ["30000000-0000-4000-8000-000000000008", customerRows[7], "Dogwood Outdoor Living", "completed", 138500, "2026-02-09", "2026-05-29"],
].map(([id, customer, project_name, status, contract_value, start_date, target_completion_date]) => ({
  id, customer_id: customer.id, project_name, project_type: customer.project_type,
  description: `${customer.project_type} project used to exercise the local beta sandbox.`,
  property_address: `${customer.address_line_1}, ${customer.city}, TN ${customer.postal_code}`,
  status, project_manager_id: teamMemberId, estimated_value: contract_value, contract_value,
  start_date, target_completion_date,
  completed_at: status === "completed" ? `${target_completion_date}T20:00:00Z` : null,
  notes: "LOCAL SANDBOX FIXTURE", metadata: { sandbox_fixture: true },
}));
await upsert("projects", projectRows, { onConflict: "id" });

const costs = [];
const costTemplates = [
  ["materials", "Lumber and building materials", "84 Lumber", 14250],
  ["labor", "Installation labor", "Sandbox Install Crew", 11800],
  ["subcontractor", "Footings and concrete", "Volunteer Concrete", 4800],
  ["permit", "Municipal permit", "Local Municipality", 725],
  ["delivery", "Material delivery", "84 Lumber", 450],
];
projectRows.forEach((project, projectIndex) => {
  costTemplates.forEach(([cost_type, description, vendor_name, baseAmount], costIndex) => {
    const amount = Math.round(Number(baseAmount) * (0.62 + projectIndex * 0.085));
    const payment_status = costIndex < 2 && projectIndex % 3 !== 1 ? "paid" : costIndex === 2 ? "partially_paid" : "unpaid";
    costs.push({
      id: `40000000-0000-4000-8000-${String(projectIndex * costTemplates.length + costIndex + 1).padStart(12, "0")}`,
      project_id: project.id, cost_type, description, vendor_name, amount,
      estimated_amount: Math.round(amount * 1.08), final_amount: amount,
      amount_paid: payment_status === "paid" ? amount : payment_status === "partially_paid" ? Math.round(amount / 2) : 0,
      payment_status, cost_date: `2026-0${Math.min(8, projectIndex + 1)}-${String(8 + costIndex).padStart(2, "0")}`,
      metadata: { sandbox_fixture: true },
    });
  });
});
await upsert("project_costs", costs, { onConflict: "id" });

const leadStatuses = ["new", "contacted", "appointment", "estimate", "follow_up", "sold", "lost"];
const leads = Array.from({ length: 14 }, (_, index) => ({
  id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  name: `Sandbox Lead ${String(index + 1).padStart(2, "0")}`,
  phone: `865-555-${String(2000 + index).padStart(4, "0")}`,
  email: `lead${index + 1}@mckenzie-sandbox.test`,
  project_type: ["Deck", "Pergola", "Outdoor Kitchen", "Screened Porch"][index % 4],
  description: "Local-only beta lead for workflow and dashboard stress testing.",
  source: ["Website", "Referral", "Google", "Repeat Customer"][index % 4],
  status: leadStatuses[index % leadStatuses.length],
  lead_status: leadStatuses[index % leadStatuses.length],
  consultation_status: index % 4 === 2 ? "scheduled" : "pending",
  property_address: `${700 + index} Sandbox Lane, Knoxville, TN 37922`,
  responsible_person_id: teamMemberId,
  estimated_project_value: 18000 + index * 5250,
  expected_close_date: `2026-${String(8 + Math.floor(index / 8)).padStart(2, "0")}-${String(10 + index % 15).padStart(2, "0")}`,
  win_probability: (index % 5) * 20,
  notes: "LOCAL SANDBOX FIXTURE",
}));
await upsert("leads", leads, { onConflict: "id" });

const tasks = Array.from({ length: 18 }, (_, index) => {
  const completed = index % 6 === 5;
  return {
    id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    title: ["Call new lead", "Review material quote", "Confirm inspection", "Send estimate follow-up", "Collect progress payment", "Close completed task"][index % 6],
    description: "Local-only task used to exercise workload, overdue, and completion states.",
    category: ["sales", "project", "operations", "accounting"][index % 4],
    status: completed ? "completed" : index % 4 === 1 ? "in_progress" : "open",
    priority: ["normal", "high", "urgent", "low"][index % 4],
    due_at: new Date(Date.UTC(2026, 7, 5 + index, 14, 0)).toISOString(),
    completed_at: completed ? new Date(Date.UTC(2026, 7, 5 + index, 15, 0)).toISOString() : null,
    assigned_to_id: teamMemberId,
    lead_id: index < leads.length ? leads[index].id : null,
    project_id: projectRows[index % projectRows.length].id,
    customer_id: projectRows[index % projectRows.length].customer_id,
    source_type: "local_sandbox",
    metadata: { sandbox_fixture: true },
  };
});
await upsert("tasks", tasks, { onConflict: "id" });

{
  const { error } = await supabase.from("company_settings").update({
    company_name: "McKenzie Construction — Local Sandbox",
    company_email: ownerEmail,
    company_phone: "865-555-0100",
    default_lead_owner_id: teamMemberId,
    default_estimator_id: teamMemberId,
    default_project_manager_id: teamMemberId,
  }).eq("id", companyId);
  if (error) throw new Error(`company_settings: ${error.message}`);
}

console.log("Local sandbox seeded successfully.");
console.log(`Login email: ${ownerEmail}`);
console.log("The password is the LOCAL_SANDBOX_PASSWORD value supplied to this command.");
