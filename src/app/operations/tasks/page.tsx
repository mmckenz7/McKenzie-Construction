import Link from "next/link";

import TaskDashboard from "@/components/task-dashboard";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export const dynamic = "force-dynamic";

type Task = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  task_type: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  completion_note: string | null;
  assigned_to_id: string | null;
  assigned_at: string | null;
  lead_id: string | null;
  project_id: string | null;
  customer_id: string | null;
  recurrence_rule: string | null;
  source_type: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  roles: string[] | null;
  status: string;
};

type Lead = {
  id: string | number;
  name: string | null;
  project_type: string | null;
  property_address: string | null;
  lead_status: string | null;
};

type Project = {
  id: string;
  project_name: string;
  customer_id: string | null;
};

type Customer = {
  id: string;
  customer_name: string;
};

export default async function TasksPage() {
  const supabase = createAdminServerClient();

  const [
    tasksResult,
    teamResult,
    leadsResult,
    projectsResult,
    customersResult,
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        `
          id,
          title,
          description,
          category,
          task_type,
          status,
          priority,
          due_at,
          started_at,
          completed_at,
          canceled_at,
          completion_note,
          assigned_to_id,
          assigned_at,
          lead_id,
          project_id,
          customer_id,
          recurrence_rule,
          source_type,
          metadata,
          created_at,
          updated_at
        `,
      )
      .order("due_at", {
        ascending: true,
        nullsFirst: false,
      })
      .order("created_at", {
        ascending: false,
      }),

    supabase
      .from("team_members")
      .select(
        `
          id,
          name,
          email,
          phone,
          job_title,
          roles,
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
      .from("leads")
      .select(
        `
          id,
          name,
          project_type,
          property_address,
          lead_status
        `,
      )
      .order("created_at", {
        ascending: false,
      }),

    supabase
      .from("projects")
      .select("id, project_name, customer_id")
      .order("created_at", {
        ascending: false,
      }),

    supabase
      .from("customers")
      .select("id, customer_name")
      .order("customer_name", {
        ascending: true,
      }),
  ]);

  const tasks =
    (tasksResult.data ?? []) as Task[];

  const teamMembers =
    (teamResult.data ?? []) as TeamMember[];

  const leads =
    (leadsResult.data ?? []) as Lead[];

  const projects =
    (projectsResult.data ?? []) as Project[];

  const customers =
    (customersResult.data ?? []) as Customer[];

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <Link
            href="/operations"
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-slate-950"
          >
            <span aria-hidden="true">←</span>
            Back to Operations
          </Link>

          <Link
            href="/all-work"
            className="text-sm font-bold text-slate-600 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-950"
          >
            Mission Control
          </Link>
        </div>

        <header className="rounded-2xl bg-slate-950 px-6 py-7 text-white shadow-sm sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
            McKenzie Construction
          </p>

          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
            Daily Action List
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            One checklist for sales follow-ups, active projects,
            marketing, accounting, operations, customer service,
            and administrative work.
          </p>
        </header>

        {tasksResult.error ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">
            <h2 className="font-bold text-red-800">
              Unable to load tasks
            </h2>

            <p className="mt-2 text-sm text-red-700">
              {tasksResult.error.message}
            </p>
          </section>
        ) : null}

        {teamResult.error ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">
            <h2 className="font-bold text-red-800">
              Unable to load employees
            </h2>

            <p className="mt-2 text-sm text-red-700">
              {teamResult.error.message}
            </p>
          </section>
        ) : null}

        {leadsResult.error ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">
            <h2 className="font-bold text-red-800">
              Unable to load related leads
            </h2>

            <p className="mt-2 text-sm text-red-700">
              {leadsResult.error.message}
            </p>
          </section>
        ) : null}

        {projectsResult.error ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">
            <h2 className="font-bold text-red-800">
              Unable to load related projects
            </h2>

            <p className="mt-2 text-sm text-red-700">
              {projectsResult.error.message}
            </p>
          </section>
        ) : null}

        {customersResult.error ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">
            <h2 className="font-bold text-red-800">
              Unable to load related customers
            </h2>

            <p className="mt-2 text-sm text-red-700">
              {customersResult.error.message}
            </p>
          </section>
        ) : null}

        {!tasksResult.error &&
        !teamResult.error &&
        !leadsResult.error &&
        !projectsResult.error &&
        !customersResult.error ? (
          <div className="mt-6">
            <TaskDashboard
              initialTasks={tasks}
              teamMembers={teamMembers}
              leads={leads}
              projects={projects}
              customers={customers}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
