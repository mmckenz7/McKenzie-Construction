import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { logout } from "@/app/login/actions";
import { getAuthenticatedAccess } from "@/lib/api-auth";
import { createAuthenticatedServerClient } from "@/lib/supabase/server";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";

type AdminLayoutProps = {
  children: React.ReactNode;
};

const standardNavigationItems = [
  {
    label: "Leads",
    href: "/admin",
  },
  {
    label: "Tasks",
    href: "/admin/tasks",
  },
  {
    label: "Customers",
    href: "/admin/customers",
  },
];

const managementNavigationItems = [
  {
    label: "Team",
    href: "/admin/team",
  },
  {
    label: "Task Settings",
    href: "/admin/settings/tasks",
  },
];

const futureNavigationItems = [
  "Projects",
  "Estimates",
];

function getRequestedPath(
  pathname: string | null,
  search: string | null,
) {
  if (
    !pathname ||
    !pathname.startsWith("/")
  ) {
    return "/admin";
  }

  return search
    ? `${pathname}?${search}`
    : pathname;
}

export default async function AdminLayout({
  children,
}: AdminLayoutProps) {
  const supabase =
    await createAuthenticatedServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const requestHeaders =
      await headers();

    const requestedPath =
      getRequestedPath(
        requestHeaders.get(
          "x-pathname",
        ),
        requestHeaders.get(
          "x-search-params",
        ),
      );

    redirect(
      `/login?next=${encodeURIComponent(
        requestedPath,
      )}`,
    );
  }

  const access =
    await getAuthenticatedAccess();

  if (!access) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
        <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-600">
            Access denied
          </p>

          <h1 className="mt-3 text-2xl font-bold text-slate-950">
            This login is not connected to an active employee account.
          </h1>

          <p className="mt-4 text-sm leading-6 text-slate-600">
            Ask an owner or administrator to link this login to an active team member.
          </p>

          <p className="mt-3 text-sm font-semibold text-slate-700">
            {user.email}
          </p>

          <form
            action={logout}
            className="mt-6"
          >
            <button
              type="submit"
              className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              Sign Out
            </button>
          </form>
        </div>
      </div>
    );
  }

  const roles =
    access.teamMember.roles;

  const canManageCompany =
    roles.includes("owner") ||
    roles.includes("admin");

  const navigationItems =
    canManageCompany
      ? [
          ...standardNavigationItems,
          ...managementNavigationItems,
        ]
      : standardNavigationItems;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950 text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <Link
            href="/admin"
            className="shrink-0"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
              McKenzie Construction
            </p>

            <p className="mt-1 text-lg font-bold text-white">
              Company Dashboard
            </p>
          </Link>

          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap items-center gap-3">
              <WorkspaceSwitcher />
            </div>

            <nav
              aria-label="Admin navigation"
              className="flex flex-wrap items-center gap-2"
            >
              {navigationItems.map(
                (item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-lg px-3 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-800 hover:text-white"
                  >
                    {item.label}
                  </Link>
                ),
              )}

              {futureNavigationItems.map(
                (label) => (
                  <span
                    key={label}
                    title="Coming soon"
                    className="cursor-not-allowed rounded-lg px-3 py-2 text-sm font-bold text-slate-500"
                  >
                    {label}

                    <span className="ml-1 text-[9px] uppercase tracking-wide text-slate-600">
                      Soon
                    </span>
                  </span>
                ),
              )}

              <form action={logout}>
                <button
                  type="submit"
                  className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200 transition hover:border-red-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  Sign Out
                </button>
              </form>
            </nav>

            <p className="text-xs text-slate-400">
              {access.teamMember.name}
              {" · "}
              {user.email}
            </p>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
