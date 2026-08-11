import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { InternalPlatformShell } from "@/components/internal-platform-shell";
import { createAuthenticatedServerClient } from "@/lib/supabase/server";
import {
  countInternalWorkspaces,
  getWorkspaceAccess,
} from "@/lib/workspace-access";

type AllWorkLayoutProps = {
  children: React.ReactNode;
};

function getRequestedPath(
  pathname: string | null,
  search: string | null,
) {
  if (!pathname || !pathname.startsWith("/")) {
    return "/all-work";
  }

  return search
    ? `${pathname}?${search}`
    : pathname;
}

export default async function AllWorkLayout({
  children,
}: AllWorkLayoutProps) {
  const supabase =
    await createAuthenticatedServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const requestHeaders = await headers();

    const requestedPath = getRequestedPath(
      requestHeaders.get("x-pathname"),
      requestHeaders.get("x-search-params"),
    );

    redirect(
      `/login?next=${encodeURIComponent(
        requestedPath,
      )}`,
    );
  }

  const workspaceResult =
    await getWorkspaceAccess();

  if (
    countInternalWorkspaces(
      workspaceResult.access,
    ) < 2
  ) {
    redirect("/portal");
  }

  return <InternalPlatformShell
    workspaceName="Mission Control"
    homeHref="/all-work"
    portalAccess={workspaceResult.access?.portal_access ?? {}}
    permissions={workspaceResult.access?.permissions ?? {}}
    userName={workspaceResult.access?.display_name || user.email || "Team member"}
    userEmail={user.email || ""}
  >{children}</InternalPlatformShell>;
}
