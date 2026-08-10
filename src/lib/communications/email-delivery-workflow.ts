import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  resolveTaskAssignee,
  type CompanyAssignmentSettings,
  type TaskAssignmentStrategy,
} from "@/lib/crm/assignment";

type TaskRule = {
  id: string;
  task_key: string;
  description: string | null;
  category: string;
  default_priority: string;
  due_mode: string;
  due_offset: number;
  assignment_strategy: string;
  default_assignee_id: string | null;
};

type Settings = CompanyAssignmentSettings & { end_of_business_time: string | null };

const assignmentStrategies = new Set<TaskAssignmentStrategy>([
  "specific_employee", "lead_owner", "default_lead_owner", "default_estimator",
  "default_project_manager", "unassigned",
]);

function strategy(value: string | null | undefined): TaskAssignmentStrategy {
  return value && assignmentStrategies.has(value as TaskAssignmentStrategy)
    ? value as TaskAssignmentStrategy
    : "lead_owner";
}

function endOfBusiness(date: Date, value: string | null) {
  const [hoursText = "17", minutesText = "0"] = (value || "17:00").split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  const result = new Date(date);
  result.setHours(Number.isInteger(hours) && hours >= 0 && hours <= 23 ? hours : 17,
    Number.isInteger(minutes) && minutes >= 0 && minutes <= 59 ? minutes : 0, 0, 0);
  return result;
}

function addBusinessDays(date: Date, count: number) {
  const result = new Date(date);
  for (let added = 0; added < count;) {
    result.setDate(result.getDate() + 1);
    if (result.getDay() !== 0 && result.getDay() !== 6) added += 1;
  }
  return result;
}

function dueAt(rule: TaskRule | null, settings: Settings, now: Date, fallback: number) {
  if (rule?.due_mode === "no_due_date") return null;
  if (rule?.due_mode === "same_day") return endOfBusiness(now, settings.end_of_business_time).toISOString();
  if (rule?.due_mode === "calendar_days") {
    const date = new Date(now);
    date.setDate(date.getDate() + Math.max(rule.due_offset, 0));
    return endOfBusiness(date, settings.end_of_business_time).toISOString();
  }
  const days = rule?.due_mode === "business_days" ? Math.max(rule.due_offset, 0) : fallback;
  return endOfBusiness(addBusinessDays(now, days), settings.end_of_business_time).toISOString();
}

export async function finalizeAutomatedEmailDelivery(
  supabase: SupabaseClient,
  input: { draftId: string; leadId: string; providerMessageId: string; sentAt: string },
) {
  const [draftResult, leadResult, ruleResult, settingsResult] = await Promise.all([
    supabase.from("email_drafts").select("id, subject, template_key, metadata").eq("id", input.draftId).single(),
    supabase.from("leads").select("id, name, phone, project_type, responsible_person_id").eq("id", input.leadId).single(),
    supabase.from("task_types").select("id, task_key, description, category, default_priority, due_mode, due_offset, assignment_strategy, default_assignee_id").eq("task_key", "proposal_follow_up").eq("is_active", true).maybeSingle(),
    supabase.from("company_settings").select("automatically_assign_new_leads, automatically_assign_new_tasks, automatically_assign_converted_projects, allow_unassigned_leads, allow_unassigned_tasks, require_responsible_person, require_task_assignee, require_project_manager, default_lead_owner_id, default_estimator_id, default_project_manager_id, end_of_business_time").limit(1).single(),
  ]);
  if (draftResult.error || !draftResult.data) throw new Error("Delivered email draft could not be loaded.");
  if (leadResult.error || !leadResult.data) throw new Error("Delivered email lead could not be loaded.");
  if (ruleResult.error || settingsResult.error || !settingsResult.data) throw new Error("Follow-up rules could not be loaded.");

  const draft = draftResult.data;
  const lead = leadResult.data;
  const rule = (ruleResult.data ?? null) as TaskRule | null;
  const settings = settingsResult.data as Settings;
  const metadata = draft.metadata && typeof draft.metadata === "object" && !Array.isArray(draft.metadata)
    ? draft.metadata as Record<string, unknown>
    : {};

  const draftUpdate = await supabase.from("email_drafts").update({
    status: "sent", sent_at: input.sentAt, external_message_id: input.providerMessageId, error_message: null,
  }).eq("id", input.draftId);
  if (draftUpdate.error) throw new Error("Delivered email draft could not be finalized.");

  const completion = { status: "completed", completed_at: input.sentAt, completion_note: "The approved email was delivered by the configured provider." };
  await Promise.all([
    supabase.from("lead_tasks").update(completion).eq("lead_id", input.leadId).eq("task_type", "review_follow_up_email").in("status", ["open", "in_progress"]),
    supabase.from("tasks").update(completion).eq("lead_id", input.leadId).eq("task_type", "review_follow_up_email").in("status", ["open", "in_progress"]),
  ]);

  let nextFollowUpAt: string | null = null;
  if (metadata.next_phone_follow_up_after_send === true) {
    const existing = await supabase.from("tasks").select("id, due_at").eq("lead_id", input.leadId)
      .eq("source_type", "email_provider_delivery").contains("metadata", { email_draft_id: input.draftId }).maybeSingle();
    if (existing.error) throw new Error("Existing automated follow-up could not be checked.");
    if (existing.data) return { nextFollowUpAt: existing.data.due_at as string | null, followUpCreated: false };

    const businessDays = typeof metadata.next_phone_follow_up_business_days === "number"
      ? Math.max(Math.trunc(metadata.next_phone_follow_up_business_days), 0)
      : 3;
    nextFollowUpAt = dueAt(rule, settings, new Date(input.sentAt), businessDays);
    const assignmentStrategy = strategy(rule?.assignment_strategy);
    const assignedToId = await resolveTaskAssignee(supabase, {
      settings, assignmentStrategy, defaultAssigneeId: rule?.default_assignee_id, leadOwnerId: lead.responsible_person_id,
    });
    const title = `Follow up with ${lead.name ?? "Customer"}`;
    const description = rule?.description ?? "Call the customer after the estimate follow-up email was delivered.";
    const taskMetadata = {
      created_by: "email_provider_delivery", email_draft_id: input.draftId,
      provider_message_id: input.providerMessageId, phone: lead.phone,
      project_type: lead.project_type, task_rule_key: rule?.task_key ?? "proposal_follow_up",
      assignment_strategy: assignmentStrategy, assigned_to_id: assignedToId,
    };
    await Promise.all([
      supabase.from("lead_tasks").update({ status: "canceled", canceled_at: input.sentAt, completion_note: "Replaced by the provider-confirmed follow-up call." }).eq("lead_id", input.leadId).in("task_type", ["first_phone_follow_up", "phone_follow_up"]).in("status", ["open", "in_progress"]),
      supabase.from("tasks").update({ status: "canceled", canceled_at: input.sentAt, completion_note: "Replaced by the provider-confirmed follow-up call." }).eq("lead_id", input.leadId).in("task_type", ["first_phone_follow_up", "phone_follow_up"]).in("status", ["open", "in_progress"]),
    ]);
    const legacy = await supabase.from("lead_tasks").insert({
      lead_id: input.leadId, task_type: "phone_follow_up", title, description,
      status: "open", priority: rule?.default_priority ?? "high", due_at: nextFollowUpAt,
      assigned_to_id: assignedToId, assigned_at: assignedToId ? input.sentAt : null, metadata: taskMetadata,
    }).select("id").single();
    if (legacy.error || !legacy.data) throw new Error("Lead phone follow-up could not be created.");
    const company = await supabase.from("tasks").insert({
      lead_id: input.leadId, task_type: "phone_follow_up", task_type_id: rule?.id ?? null,
      title, description, category: rule?.category ?? "sales", status: "open",
      priority: rule?.default_priority ?? "high", due_at: nextFollowUpAt,
      assigned_to_id: assignedToId, assigned_at: assignedToId ? input.sentAt : null,
      source_type: "email_provider_delivery", metadata: { ...taskMetadata, legacy_lead_task_id: legacy.data.id },
    }).select("id").single();
    if (company.error || !company.data) {
      await supabase.from("lead_tasks").delete().eq("id", legacy.data.id);
      throw new Error("Company phone follow-up could not be created.");
    }
    await supabase.from("leads").update({ follow_up_at: nextFollowUpAt, lead_status: "customer_reviewing" }).eq("id", input.leadId);
    await supabase.from("lead_activities").insert({
      lead_id: input.leadId, activity_type: "phone_follow_up_scheduled", channel: "task", direction: "internal",
      summary: "Next phone follow-up scheduled", details: nextFollowUpAt,
      metadata: { email_draft_id: input.draftId, company_task_id: company.data.id, legacy_task_id: legacy.data.id, due_at: nextFollowUpAt },
    });
  }

  await supabase.from("lead_activities").insert({
    lead_id: input.leadId, activity_type: "email_sent", channel: "email", direction: "outbound",
    summary: "Email delivered", details: draft.subject,
    metadata: { email_draft_id: input.draftId, template_key: draft.template_key, provider_message_id: input.providerMessageId, sent_at: input.sentAt, delivery_method: "provider" },
  });
  return { nextFollowUpAt, followUpCreated: Boolean(nextFollowUpAt) };
}
