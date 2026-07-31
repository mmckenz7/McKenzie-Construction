"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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

  useEffect(() => {
    let isMounted = true;

    async function routeUser() {
      try {
        const response = await fetch(
          "/api/me/access",
          {
            method: "GET",
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
            setMessage(
              "Your session has expired. Redirecting to sign in...",
            );

            router.replace("/login");
            return;
          }

          if (result.needsProfile) {
            setMessage(
              "This login has not been assigned an application profile.",
            );
            return;
          }

          setMessage(
            result.error ??
              "We could not determine which workspace to open.",
          );
          return;
        }

        const defaultPortal =
          result.access?.default_portal;

        if (
          defaultPortal &&
          result.access?.portal_access?.[
            defaultPortal
          ] !== false
        ) {
          router.replace(
            PORTAL_ROUTES[defaultPortal],
          );
          return;
        }

        const firstAvailablePortal = (
          Object.keys(
            PORTAL_ROUTES,
          ) as PortalName[]
        ).find(
          (portal) =>
            result.access?.portal_access?.[
              portal
            ] === true,
        );

        if (firstAvailablePortal) {
          router.replace(
            PORTAL_ROUTES[
              firstAvailablePortal
            ],
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
      </div>
    </main>
  );
}
