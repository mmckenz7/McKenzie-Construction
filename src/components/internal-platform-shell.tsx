import Link from "next/link";

import { logout } from "@/app/login/actions";
import { PlatformSidebarNavigation } from "@/components/platform-sidebar-navigation";
import { companyBrandingStyle, getCompanyBranding } from "@/lib/company-branding";

export type PlatformNavigationItem = Readonly<{ label: string; href: string }>;

type InternalPlatformShellProps = Readonly<{
  children: React.ReactNode;
  workspaceName: string;
  homeHref: string;
  portalAccess: Partial<Record<"sales" | "operations" | "admin" | "subcontractor", boolean>>;
  permissions: Record<string, boolean>;
  userName: string;
  userEmail: string;
}>;

export async function InternalPlatformShell({
  children,
  workspaceName,
  homeHref,
  portalAccess,
  permissions,
  userName,
  userEmail,
}: InternalPlatformShellProps) {
  const branding = await getCompanyBranding();
  return <div className="platform-shell" style={companyBrandingStyle(branding)}>
    <aside className="platform-sidebar">
      <Link href={homeHref} className="platform-brand" aria-label={`${branding.companyName} ${workspaceName}`}>
        {/* Company administrators control this URL; fallback branding is local and always available. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={branding.logoUrl} alt={branding.companyName} className="platform-brand-logo" />
        <span className="platform-workspace-name">{workspaceName}</span>
      </Link>
      <PlatformSidebarNavigation portalAccess={portalAccess} permissions={permissions} />
      <div className="platform-sidebar-footer">
        <p className="platform-company-name">{branding.companyName}</p>
        <p>Business operating system</p>
      </div>
    </aside>
    <div className="platform-main">
      <header className="platform-topbar">
        <div className="platform-context">
          <span className="platform-context-mark"><PlatformIcon name="spark" /></span>
          <div><p>Workspace</p><strong>{workspaceName}</strong></div>
        </div>
        <div className="platform-account">
          <div className="platform-avatar" aria-hidden="true">{userName.trim().charAt(0).toUpperCase() || "U"}</div>
          <div className="platform-user"><strong>{userName}</strong><span>{userEmail}</span></div>
          <form action={logout}><button type="submit" className="platform-signout">Sign out</button></form>
        </div>
      </header>
      <div className="platform-content">{children}</div>
    </div>
  </div>;
}

type IconName = "calendar" | "customers" | "dashboard" | "document" | "financial" | "projects" | "settings" | "spark" | "tasks";

function PlatformIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></>,
    customers: <><circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 2-6 6-6s6 2 6 6M16 7h5M18.5 4.5v5"/></>,
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    document: <><path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></>,
    financial: <><path d="M4 20V10M10 20V4M16 20v-7M22 20V7"/></>,
    projects: <><path d="M3 7h7l2 2h9v11H3z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    spark: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2Z"/><path d="m5 14 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8Z"/></>,
    tasks: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 9 1.5 1.5L12 8M14 9h3M8 15h9"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
