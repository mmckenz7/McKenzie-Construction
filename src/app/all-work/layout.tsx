import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createAuthenticatedServerClient } from "@/lib/supabase/server";

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

  return children;
}
