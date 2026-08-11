"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { logout } from "@/app/login/actions";

type PortalName =
  | "sales"
  | "operations"
  | "admin"
  | "subcontractor";

type AccessResponse = {
  success: boolean;
  access?: {
    default_portal?: PortalName;
    portal_access?: Partial<
      Record<PortalName, boolean>
    >;
  };
  error?: string;
  needsProfile?: boolean;
};

const PORTAL_ROUTES: Record<
  PortalName,
  string
> = {
  sales: "/sales",
  operations: "/operations",
  admin: "/admin",
  subcontractor: "/subcontractor",
};

export default function PortalRouterPage() {
  const router = useRouter();

  const [message, setMessage] = useState(
    "Opening your workspace...",
  );
  const [canSignOut, setCanSignOut] =
    useState(false);

  useEffect(() => {
    let isMounted = true;

    async function routeUser() {
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

        if (!response.ok || !result.success) {
          if (!isMounted) {
            return;
          }

          if (response.status === 401) {
            router.replace("/login");
            return;
          }

          setCanSignOut(
            response.status === 403 &&
              result.needsProfile === true,
          );
          setMessage(
            result.error ??
              "We could not determine which workspace to open.",
          );
          return;
        }

        const access =
          result.access?.portal_access ?? {};

        const internalPortals = (
          [
            "sales",
            "operations",
            "admin",
          ] as PortalName[]
        ).filter(
          (portal) => access[portal] === true,
        );

        const subcontractorOnly =
          access.subcontractor === true &&
          internalPortals.length === 0;

        if (subcontractorOnly) {
          router.replace("/subcontractor");
          return;
        }

        if (internalPortals.length > 1) {
          router.replace("/workspace");
          return;
        }

        if (internalPortals.length === 1) {
          router.replace(
            PORTAL_ROUTES[internalPortals[0]],
          );
          return;
        }

        const defaultPortal =
          result.access?.default_portal;

        if (
          defaultPortal &&
          access[defaultPortal] === true
        ) {
          router.replace(
            PORTAL_ROUTES[defaultPortal],
          );
          return;
        }

        if (isMounted) {
          setMessage(
            "Your account does not currently have access to a workspace.",
          );
        }
      } catch {
        if (isMounted) {
          setMessage(
            "Something went wrong while opening your workspace.",
          );
        }
      }
    }

    void routeUser();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            marginBottom: "12px",
            fontSize: "24px",
          }}
        >
          McKenzie Construction
        </h1>

        <p
          style={{
            margin: 0,
            opacity: 0.75,
          }}
        >
          {message}
        </p>

        {canSignOut ? (
          <form action={logout}>
            <button
              type="submit"
              style={{
                marginTop: "24px",
                border: 0,
                borderRadius: "8px",
                padding: "12px 20px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
