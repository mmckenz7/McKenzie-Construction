"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type PortalName = "sales" | "operations" | "admin" | "subcontractor";

type PlatformSidebarNavigationProps = {
  portalAccess: Partial<Record<PortalName, boolean>>;
  permissions: Record<string, boolean>;
};

const groups = [
  {
    id: "sales" as const,
    label: "Sales",
    href: "/sales",
    items: [
      ["Dashboard", "/sales"], ["Leads", "/sales/leads"], ["Customers", "/sales/customers"], ["Estimates", "/sales/estimates"], ["Communications", "/sales/communications"],
    ],
  },
  {
    id: "operations" as const,
    label: "Operations",
    href: "/operations",
    items: [
      ["Dashboard", "/operations"], ["Inbox", "/operations/inbox"], ["Projects", "/operations/projects"], ["Tasks", "/operations/tasks"], ["Schedule", "/operations/schedule"], ["Materials", "/operations/materials"], ["Material Reviews", "/operations/material-reviews"], ["Installers", "/operations/installers"], ["Messages", "/operations/messages"], ["Schedule Requests", "/operations/schedule-requests"],
    ],
  },
  {
    id: "admin" as const,
    label: "Administration",
    href: "/admin",
    items: [
      ["Dashboard", "/admin"], ["Tasks", "/admin/tasks"], ["Customers", "/admin/customers"], ["Financials", "/admin/financials", "view_profit"], ["Team", "/admin/team", "manage_users"], ["Settings", "/admin/settings", "manage_company_settings"],
    ],
  },
] as const;

export function PlatformSidebarNavigation({ portalAccess, permissions }: PlatformSidebarNavigationProps) {
  const pathname = usePathname();
  const availableGroups = groups.filter((group) => portalAccess[group.id] === true);
  return <nav aria-label="Application navigation" className="platform-nav">
    {availableGroups.length > 1 ? <SidebarLink href="/all-work" label="Mission Control" active={pathname.startsWith("/all-work")} /> : null}
    {availableGroups.map((group) => {
      const activeGroup = pathname === group.href || pathname.startsWith(`${group.href}/`);
      const visibleItems = group.items.filter((item) => item[2] === undefined || permissions[item[2]] === true);
      return <details key={group.id} className="platform-nav-group" open={activeGroup || availableGroups.length === 1}>
        <summary className={activeGroup ? "platform-nav-group-summary platform-nav-group-active" : "platform-nav-group-summary"}><span>{group.label}</span><span className="platform-nav-chevron" aria-hidden="true">›</span></summary>
        <div className="platform-nav-children">{visibleItems.map(([label, href]) => <SidebarLink key={href} href={href} label={label} active={pathname === href || href !== group.href && pathname.startsWith(`${href}/`)} nested />)}</div>
      </details>;
    })}
  </nav>;
}

function SidebarLink({ href, label, active, nested = false }: { href: string; label: string; active: boolean; nested?: boolean }) {
  return <Link href={href} className={`platform-nav-link${active ? " platform-nav-link-active" : ""}${nested ? " platform-nav-link-nested" : ""}`}><NavigationIcon /><span>{label}</span></Link>;
}

function NavigationIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="7"/><path d="m10 9 4 3-4 3"/></svg>;
}
