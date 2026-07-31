"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PortalName =
  | "sales"
  | "operations"
  | "admin"
  | "subcontractor";

type UserAccess = {
  display_name?: string | null;
  role?: string;
  default_portal?: PortalName;
  portal_access?: Partial<Record<PortalName, boolean>>;
};

type AccessResponse = {
  success: boolean;
  access?: UserAccess;
  error?: string;
};

type WorkspaceOption = {
  id: "all-work" | PortalName;
  title: string;
  description: string;
  route: string;
};

const WORKSPACES: WorkspaceOption[] = [
  {
    id: "sales",
    title: "Sales",
    description:
      "Leads, appointments, estimates, proposals, and follow-ups.",
    route: "/sales",
  },
  {
    id: "operations",
    title: "Operations",
    description:
      "Projects, schedules, crews, installers, materials, and job progress.",
    route: "/operations",
  },
  {
    id: "admin",
    title: "Administration",
    description:
      "Users, pricing, suppliers, permissions, integrations, and settings.",
    route: "/admin",
  },
];

export default function WorkspaceSelectorPage() {
  const router = useRouter();

  const [access, setAccess] =
    useState<UserAccess | null>(null);
  const [message, setMessage] = useState(
    "Loading your workspaces...",
  );

  useEffect(() => {
    let isMounted = true;

    async function loadAccess() {
      try {
        const response = await fetch(
          "/api/me/access",
          {
            credentials: "include",
            cache: "no-store",
          },
        );

        const result =
          (await response.json()) as AccessResponse;

        if (!isMounted) {
          return;
        }

        if (!response.ok || !result.success) {
          if (response.status === 401) {
            router.replace("/login");
            return;
          }

          setMessage(
            result.error ??
              "We could not load your workspaces.",
          );
          return;
        }

        setAccess(result.access ?? null);
      } catch {
        if (isMounted) {
          setMessage(
            "Something went wrong while loading your workspaces.",
          );
        }
      }
    }

    void loadAccess();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const availableWorkspaces = useMemo(
    () =>
      WORKSPACES.filter(
        (workspace) =>
          access?.portal_access?.[
            workspace.id as PortalName
          ] === true,
      ),
    [access],
  );

  if (!access) {
    return (
      <main style={styles.centeredPage}>
        <p style={styles.loadingText}>{message}</p>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <div style={styles.headingArea}>
          <p style={styles.eyebrow}>
            McKenzie Construction
          </p>

          <h1 style={styles.heading}>
            Where would you like to work?
          </h1>

          <p style={styles.subheading}>
            Choose a workspace. You will be able
            to switch again from the app menu.
          </p>
        </div>

        <div style={styles.grid}>
          {availableWorkspaces.length > 1 && (
            <button
              type="button"
              onClick={() =>
                router.push("/all-work")
              }
              style={{
                ...styles.card,
                ...styles.allWorkCard,
              }}
            >
              <span style={styles.cardTitle}>
                All Work
              </span>

              <span style={styles.cardDescription}>
                See company-wide priorities,
                schedule issues, follow-ups,
                messages, and financial activity
                in one place.
              </span>

              <span style={styles.openText}>
                Open company dashboard →
              </span>
            </button>
          )}

          {availableWorkspaces.map(
            (workspace) => (
              <button
                key={workspace.id}
                type="button"
                onClick={() =>
                  router.push(workspace.route)
                }
                style={styles.card}
              >
                <span style={styles.cardTitle}>
                  {workspace.title}
                </span>

                <span
                  style={styles.cardDescription}
                >
                  {workspace.description}
                </span>

                <span style={styles.openText}>
                  Open {workspace.title} →
                </span>
              </button>
            ),
          )}
        </div>
      </section>
    </main>
  );
}

const styles: Record<
  string,
  React.CSSProperties
> = {
  page: {
    minHeight: "100vh",
    background: "#f5f5f2",
    padding: "48px 24px",
  },
  centeredPage: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "24px",
  },
  container: {
    width: "100%",
    maxWidth: "1100px",
    margin: "0 auto",
  },
  headingArea: {
    marginBottom: "32px",
  },
  eyebrow: {
    margin: "0 0 8px",
    fontSize: "14px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    opacity: 0.65,
  },
  heading: {
    margin: "0 0 12px",
    fontSize: "clamp(32px, 5vw, 52px)",
    lineHeight: 1.05,
  },
  subheading: {
    maxWidth: "620px",
    margin: 0,
    fontSize: "18px",
    lineHeight: 1.5,
    opacity: 0.7,
  },
  grid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(250px, 1fr))",
    gap: "18px",
  },
  card: {
    minHeight: "220px",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    padding: "26px",
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: "18px",
    background: "#ffffff",
    textAlign: "left",
    cursor: "pointer",
    boxShadow:
      "0 10px 30px rgba(0,0,0,0.06)",
  },
  allWorkCard: {
    border: "2px solid #1d1d1b",
  },
  cardTitle: {
    marginBottom: "12px",
    fontSize: "24px",
    fontWeight: 750,
  },
  cardDescription: {
    flex: 1,
    fontSize: "16px",
    lineHeight: 1.5,
    opacity: 0.7,
  },
  openText: {
    marginTop: "24px",
    fontSize: "15px",
    fontWeight: 700,
  },
  loadingText: {
    fontSize: "17px",
    opacity: 0.7,
  },
};
