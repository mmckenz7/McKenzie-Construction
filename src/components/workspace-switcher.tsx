"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type PortalName =
  | "sales"
  | "operations"
  | "admin"
  | "subcontractor";

type AccessResponse = {
  success: boolean;
  access?: {
    portal_access?: Partial<
      Record<PortalName, boolean>
    >;
  };
};

type Workspace = {
  id: "all-work" | PortalName | "selector";
  label: string;
  href: string;
};

const INTERNAL_WORKSPACES: Workspace[] = [
  {
    id: "all-work",
    label: "All Work",
    href: "/all-work",
  },
  {
    id: "sales",
    label: "Sales",
    href: "/sales",
  },
  {
    id: "operations",
    label: "Operations",
    href: "/operations",
  },
  {
    id: "admin",
    label: "Administration",
    href: "/admin",
  },
];

function getCurrentWorkspace(
  pathname: string,
) {
  if (pathname.startsWith("/all-work")) {
    return "/all-work";
  }

  if (pathname.startsWith("/sales")) {
    return "/sales";
  }

  if (pathname.startsWith("/operations")) {
    return "/operations";
  }

  if (pathname.startsWith("/admin")) {
    return "/admin";
  }

  return "/workspace";
}

export function WorkspaceSwitcher() {
  const router = useRouter();
  const pathname = usePathname();

  const [portalAccess, setPortalAccess] =
    useState<
      Partial<Record<PortalName, boolean>>
    >({});

  const [isLoaded, setIsLoaded] =
    useState(false);

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

        if (
          isMounted &&
          response.ok &&
          result.success
        ) {
          setPortalAccess(
            result.access?.portal_access ?? {},
          );
        }
      } finally {
        if (isMounted) {
          setIsLoaded(true);
        }
      }
    }

    void loadAccess();

    return () => {
      isMounted = false;
    };
  }, []);

  const availableWorkspaces = useMemo(() => {
    const internal = INTERNAL_WORKSPACES.filter(
      (workspace) => {
        if (workspace.id === "all-work") {
          return false;
        }

        return (
          portalAccess[
            workspace.id as PortalName
          ] === true
        );
      },
    );

    if (internal.length > 1) {
      return [
        INTERNAL_WORKSPACES[0],
        ...internal,
        {
          id: "selector" as const,
          label: "Choose Workspace",
          href: "/workspace",
        },
      ];
    }

    return internal;
  }, [portalAccess]);

  if (
    !isLoaded ||
    availableWorkspaces.length <= 1
  ) {
    return null;
  }

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">
        Choose workspace
      </span>

      <select
        aria-label="Choose workspace"
        value={getCurrentWorkspace(pathname)}
        onChange={(event) =>
          router.push(event.target.value)
        }
        className="min-w-[190px] rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-bold text-white outline-none transition hover:border-amber-400 focus:border-amber-400"
      >
        {availableWorkspaces.map(
          (workspace) => (
            <option
              key={workspace.id}
              value={workspace.href}
            >
              {workspace.label}
            </option>
          ),
        )}
      </select>
    </label>
  );
}
