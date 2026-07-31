import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  canAccessWorkspace,
  getWorkspaceAccess,
} from "@/lib/workspace-access";

type SubcontractorLayoutProps = {
  children: React.ReactNode;
};

function getRequestedPath(
  pathname: string | null,
  search: string | null,
) {
  if (!pathname || !pathname.startsWith("/")) {
    return "/subcontractor";
  }

  return search
    ? `${pathname}?${search}`
    : pathname;
}

export default async function SubcontractorLayout({
  children,
}: SubcontractorLayoutProps) {
  const result = await getWorkspaceAccess();

  if (!result.user) {
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

  if (
    !canAccessWorkspace(
      result.access,
      "subcontractor",
    )
  ) {
    redirect("/portal");
  }

  return children;
}
