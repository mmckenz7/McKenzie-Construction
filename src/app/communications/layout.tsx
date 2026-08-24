import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { InternalPlatformShell } from "@/components/internal-platform-shell";
import { createAuthenticatedServerClient } from "@/lib/supabase/server";
import { canAccessWorkspace, getWorkspaceAccess } from "@/lib/workspace-access";

function requestedPath(pathname: string | null, search: string | null) {
  if (!pathname?.startsWith("/")) return "/communications";
  return search ? `${pathname}?${search}` : pathname;
}

export default async function CommunicationsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createAuthenticatedServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const requestHeaders = await headers();
    redirect(`/login?next=${encodeURIComponent(requestedPath(requestHeaders.get("x-pathname"), requestHeaders.get("x-search-params")))}`);
  }
  const workspace = await getWorkspaceAccess();
  const canOpenInbox = canAccessWorkspace(workspace.access, "sales");
  if (!canOpenInbox) redirect("/portal");
  return <InternalPlatformShell
    workspaceName="Company Inbox"
    homeHref="/communications"
    portalAccess={workspace.access?.portal_access ?? {}}
    permissions={workspace.access?.permissions ?? {}}
    userName={workspace.access?.display_name || user.email || "Team member"}
    userEmail={user.email || ""}
  >{children}</InternalPlatformShell>;
}
