import Link from "next/link";
import { redirect } from "next/navigation";

import TeamManager from "@/components/team-manager";
import {
  getAuthenticatedAccess,
  hasManagementAccess,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export const dynamic = "force-dynamic";

type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  roles: string[] | null;
  status: string;
  is_default_lead_owner: boolean;
  is_default_estimator: boolean;
  is_default_project_manager: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type CompanySettings = {
  id: string;
  company_name: string;
  require_responsible_person: boolean;
  require_task_assignee: boolean;
  require_project_manager: boolean;
  allow_unassigned_leads: boolean;
  allow_unassigned_tasks: boolean;
  automatically_assign_new_leads: boolean;
  automatically_assign_new_tasks: boolean;
  automatically_assign_converted_projects: boolean;
  default_lead_owner_id: string | null;
  default_estimator_id: string | null;
  default_project_manager_id: string | null;
};

export default async function TeamPage() {
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

  const [teamResult, settingsResult] = await Promise.all([
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
          status,
          is_default_lead_owner,
          is_default_estimator,
          is_default_project_manager,
          notes,
          created_at,
          updated_at
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
          company_name,
          require_responsible_person,
          require_task_assignee,
          require_project_manager,
          allow_unassigned_leads,
          allow_unassigned_tasks,
          automatically_assign_new_leads,
          automatically_assign_new_tasks,
          automatically_assign_converted_projects,
          default_lead_owner_id,
          default_estimator_id,
          default_project_manager_id
        `,
      )
      .limit(1)
      .maybeSingle(),
  ]);

  const teamMembers =
    (teamResult.data ?? []) as TeamMember[];

  const companySettings =
    settingsResult.data as CompanySettings | null;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-slate-950"
          >
            <span aria-hidden="true">←</span>
            Back to Lead Dashboard
          </Link>
        </div>

        <header className="rounded-2xl bg-slate-950 px-6 py-7 text-white shadow-sm sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
            McKenzie Construction
          </p>

          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
            Team Members
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Add employees, assign multiple roles, choose default
            responsible people, and prepare the CRM for sales and
            project-management teams.
          </p>
        </header>

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
              Unable to load company settings
            </h2>

            <p className="mt-2 text-sm text-red-700">
              {settingsResult.error.message}
            </p>
          </section>
        ) : null}

        {!teamResult.error && !settingsResult.error ? (
          <div className="mt-6">
            <TeamManager
              initialTeamMembers={teamMembers}
              initialCompanySettings={companySettings}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}