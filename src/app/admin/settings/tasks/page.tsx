import Link from "next/link";
import { redirect } from "next/navigation";

import TaskTypeManager from "@/components/task-type-manager";
import {
  getAuthenticatedAccess,
  hasManagementAccess,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export const dynamic = "force-dynamic";

type TaskType = {
  id: string;
  name: string;
  task_key: string;
  description: string | null;
  category: string;
  default_priority: string;
  due_mode: string;
  due_offset: number;
  assignment_strategy: string;
  default_assignee_id: string | null;
  is_system_type: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type TeamMember = {
  id: string;
  name: string;
  job_title: string | null;
  status: string;
};

type CompanySettings = {
  id: string;
  manual_task_due_mode: string;
  manual_task_due_offset: number;
  end_of_business_time: string;
};

export default async function TaskSettingsPage() {
  const access =
    await getAuthenticatedAccess();

  if (
    !access ||
    !hasManagementAccess(
      access.teamMember.roles,
    )
  ) {
    redirect("/admin");
  }

  const supabase =
    createAdminServerClient();

  const [
    taskTypesResult,
    teamResult,
    settingsResult,
  ] = await Promise.all([
    supabase
      .from("task_types")
      .select(
        `
          id,
          name,
          task_key,
          description,
          category,
          default_priority,
          due_mode,
          due_offset,
          assignment_strategy,
          default_assignee_id,
          is_system_type,
          is_active,
          created_at,
          updated_at
        `,
      )
      .order("is_system_type", {
        ascending: false,
      })
      .order("name", {
        ascending: true,
      }),

    supabase
      .from("team_members")
      .select(
        `
          id,
          name,
          job_title,
          status
        `,
      )
      .order("status", {
        ascending: true,
      })
      .order("name", {
        ascending: true,
      }),

    supabase
      .from("company_settings")
      .select(
        `
          id,
          manual_task_due_mode,
          manual_task_due_offset,
          end_of_business_time
        `,
      )
      .limit(1)
      .maybeSingle(),
  ]);

  const taskTypes =
    (taskTypesResult.data ?? []) as TaskType[];

  const teamMembers =
    (teamResult.data ?? []) as TeamMember[];

  const companySettings =
    settingsResult.data as CompanySettings | null;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <Link
            href="/admin/tasks"
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-slate-950"
          >
            <span aria-hidden="true">←</span>
            Back to Daily Action List
          </Link>

          <Link
            href="/admin/team"
            className="text-sm font-bold text-slate-600 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-950"
          >
            Manage Team
          </Link>
        </div>

        <header className="rounded-2xl bg-slate-950 px-6 py-7 text-white shadow-sm sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
            Company Settings
          </p>

          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
            Task Types & Timing Rules
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Control when tasks are due, which category they belong
            to, their default priority, and who should be responsible
            without changing application code.
          </p>
        </header>

        {taskTypesResult.error ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">
            <h2 className="font-bold text-red-800">
              Unable to load task types
            </h2>

            <p className="mt-2 text-sm text-red-700">
              {taskTypesResult.error.message}
            </p>
          </section>
        ) : null}

        {teamResult.error ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">
            <h2 className="font-bold text-red-800">
              Unable to load team members
            </h2>

            <p className="mt-2 text-sm text-red-700">
              {teamResult.error.message}
            </p>
          </section>
        ) : null}

        {settingsResult.error ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">
            <h2 className="font-bold text-red-800">
              Unable to load manual task defaults
            </h2>

            <p className="mt-2 text-sm text-red-700">
              {settingsResult.error.message}
            </p>
          </section>
        ) : null}

        {!taskTypesResult.error &&
        !teamResult.error &&
        !settingsResult.error ? (
          <div className="mt-6">
            <TaskTypeManager
              initialTaskTypes={taskTypes}
              teamMembers={teamMembers}
              initialCompanySettings={companySettings}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}