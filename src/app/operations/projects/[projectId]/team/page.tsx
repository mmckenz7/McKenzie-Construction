import Link from "next/link";
import { ProjectPartyManager } from "@/components/project-party-manager";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export default async function ProjectTeamPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params; const supabase = createAdminServerClient();
  const [project, parties, suppliers] = await Promise.all([
    supabase.from("projects").select("id,project_name").eq("id", projectId).single(),
    supabase.from("project_parties").select("*").eq("project_id", projectId).eq("is_active", true).order("name"),
    supabase.from("suppliers").select("id,name").eq("is_active", true).order("name"),
  ]);
  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><Link href={`/operations/projects/${projectId}`} className="text-sm font-bold text-slate-600">← Project workspace</Link><h1 className="mt-5 text-3xl font-bold">Project Team</h1><p className="mt-2 text-slate-600">{project.data?.project_name ?? "Project"}: internal employees and external partners have distinct responsibilities.</p><div className="mt-6"><ProjectPartyManager projectId={projectId} initialParties={parties.data ?? []} suppliers={suppliers.data ?? []} /></div></main>;
}
