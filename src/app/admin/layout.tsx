import Link from "next/link";

type AdminLayoutProps = {
  children: React.ReactNode;
};

const navigationItems = [
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

export default function AdminLayout({
  children,
}: AdminLayoutProps) {
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

          <nav
            aria-label="Admin navigation"
            className="flex flex-wrap items-center gap-2"
          >
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-800 hover:text-white"
              >
                {item.label}
              </Link>
            ))}

            {futureNavigationItems.map((label) => (
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
            ))}
          </nav>
        </div>
      </header>

      {children}
    </div>
  );
}