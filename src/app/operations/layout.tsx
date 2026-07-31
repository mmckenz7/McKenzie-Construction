import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { logout } from "@/app/login/actions";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { createAuthenticatedServerClient } from "@/lib/supabase/server";
import {
  canAccessWorkspace,
  getWorkspaceAccess,
} from "@/lib/workspace-access";

type OperationsLayoutProps = {
  children: React.ReactNode;
};

function getRequestedPath(
  pathname: string | null,
  search: string | null,
) {
  if (!pathname || !pathname.startsWith("/")) {
    return "/operations";
  }

  return search
    ? `${pathname}?${search}`
    : pathname;
}

const navigationItems = [
  {
    label: "Dashboard",
    href: "/operations",
  },
  {
    label: "Projects",
    href: "/operations/projects",
  },
  {
    label: "Tasks",
    href: "/operations/tasks",
  },
  {
    label: "Schedule",
    href: "/operations/schedule",
  },
  {
    label: "Schedule Requests",
    href: "/operations/schedule-requests",
  },
];

const futureItems = [
  "Calendar",
  "Installers",
  "Materials",
  "Messages",
];

export default async function OperationsLayout({
  children,
}: OperationsLayoutProps) {
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
    !canAccessWorkspace(
      workspaceResult.access,
      "operations",
    )
  ) {
    redirect("/portal");
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-50 border-b border-blue-900 bg-blue-950 text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <Link
            href="/operations"
            className="shrink-0"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300">
              McKenzie Construction
            </p>

            <p className="mt-1 text-lg font-bold text-white">
              Operations
            </p>
          </Link>

          <div className="flex flex-col gap-3 lg:items-end">
            <WorkspaceSwitcher />

            <nav
              aria-label="Operations navigation"
              className="flex flex-wrap items-center gap-2"
            >
              {navigationItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-sm font-bold text-blue-50 transition hover:bg-blue-900"
                >
                  {item.label}
                </Link>
              ))}

              {futureItems.map((label) => (
                <span
                  key={label}
                  title="Coming soon"
                  className="cursor-not-allowed rounded-lg px-3 py-2 text-sm font-bold text-blue-700"
                >
                  {label}

                  <span className="ml-1 text-[9px] uppercase tracking-wide">
                    Soon
                  </span>
                </span>
              ))}

              <form action={logout}>
                <button
                  type="submit"
                  className="rounded-lg border border-blue-800 px-3 py-2 text-sm font-bold text-blue-50 transition hover:border-red-400 hover:bg-red-500/10 hover:text-red-200"
                >
                  Sign Out
                </button>
              </form>
            </nav>

            <p className="text-xs text-blue-300">
              {user.email}
            </p>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
