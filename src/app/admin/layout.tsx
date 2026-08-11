import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { logout } from "@/app/login/actions";
import { InternalPlatformShell } from "@/components/internal-platform-shell";
import { getAuthenticatedAccess } from "@/lib/api-auth";
import { createAuthenticatedServerClient } from "@/lib/supabase/server";
import { canAccessWorkspace, getWorkspaceAccess } from "@/lib/workspace-access";

function requestedPath(pathname: string | null, search: string | null) {
  if (!pathname?.startsWith("/")) return "/admin";
  return search ? `${pathname}?${search}` : pathname;
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createAuthenticatedServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const requestHeaders = await headers();
    redirect(`/login?next=${encodeURIComponent(requestedPath(requestHeaders.get("x-pathname"), requestHeaders.get("x-search-params")))}`);
  }
  const workspace = await getWorkspaceAccess();
  if (!canAccessWorkspace(workspace.access, "admin")) redirect("/portal");
  const access = await getAuthenticatedAccess();
  if (!access) return <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6"><div className="w-full max-w-lg rounded-2xl border border-red-900 bg-slate-900 p-8 text-center text-white"><p className="text-xs font-bold uppercase tracking-[.2em] text-red-400">Access denied</p><h1 className="mt-3 text-2xl font-bold">This login is not connected to an active employee account.</h1><p className="mt-4 text-sm text-slate-400">Ask an owner or administrator to link this login to an active team member.</p><form action={logout} className="mt-6"><button type="submit" className="rounded-lg bg-white px-5 py-3 text-sm font-bold text-slate-950">Sign out</button></form></div></div>;
  return <InternalPlatformShell
    workspaceName="Administration"
    homeHref="/admin"
    portalAccess={workspace.access?.portal_access ?? {}}
    permissions={workspace.access?.permissions ?? {}}
    userName={access.teamMember.name}
    userEmail={user.email || ""}
  >{children}</InternalPlatformShell>;
}
