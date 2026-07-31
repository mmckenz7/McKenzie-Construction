"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

type Installer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  roles: string[];
};

type TeamApiResponse = {
  success?: boolean;
  team?: unknown[];
  teamMembers?: unknown[];
  members?: unknown[];
  data?: unknown[];
  error?: string;
};

function normalizeInstaller(
  value: unknown,
): Installer | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const record =
    value as Record<string, unknown>;

  const id = String(
    record.id ?? "",
  );

  if (!id) {
    return null;
  }

  const rawRoles =
    record.roles ??
    record.role ??
    [];

  const roles = Array.isArray(rawRoles)
    ? rawRoles.map(String)
    : typeof rawRoles === "string"
      ? [rawRoles]
      : [];

  return {
    id,
    name: String(
      record.name ??
        record.display_name ??
        record.full_name ??
        "Unnamed installer",
    ),
    email:
      typeof record.email === "string"
        ? record.email
        : null,
    phone:
      typeof record.phone === "string"
        ? record.phone
        : null,
    roles,
  };
}

function isInstaller(
  member: Installer,
) {
  return member.roles.some((role) => {
    const normalized =
      role.toLowerCase();

    return (
      normalized === "installer" ||
      normalized === "subcontractor" ||
      normalized.includes("installer") ||
      normalized.includes(
        "subcontractor",
      )
    );
  });
}

export default function InstallersPage() {
  const [members, setMembers] =
    useState<Installer[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  async function loadInstallers() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/team",
        {
          credentials: "include",
          cache: "no-store",
        },
      );

      const result =
        (await response.json()) as TeamApiResponse;

      if (!response.ok) {
        setError(
          result.error ??
            "Could not load installers.",
        );
        return;
      }

      const rawMembers =
        result.teamMembers ??
        result.team ??
        result.members ??
        result.data ??
        [];

      setMembers(
        rawMembers
          .map(normalizeInstaller)
          .filter(
            (
              member,
            ): member is Installer =>
              member !== null,
          ),
      );
    } catch {
      setError(
        "Could not load installers.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInstallers();
  }, []);

  const installers = useMemo(
    () => members.filter(isInstaller),
    [members],
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
            Operations
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">
            Installers
          </h1>

          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            Review installers and subcontractors,
            then create schedule requests for
            assigned projects.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() =>
              void loadInstallers()
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800"
          >
            Refresh
          </button>

          <Link
            href="/operations/schedule-requests"
            className="rounded-xl bg-blue-950 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-blue-900"
          >
            New Schedule Request
          </Link>
        </div>
      </div>

      {error && (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-slate-600">
          Loading installers...
        </p>
      ) : installers.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-xl font-bold text-slate-950">
            No installers added yet
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            Add a team member with the installer
            or subcontractor role from
            Administration.
          </p>

          <Link
            href="/admin/team"
            className="mt-5 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white"
          >
            Open Team Settings
          </Link>
        </section>
      ) : (
        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {installers.map(
            (installer) => (
              <article
                key={installer.id}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-blue-700">
                  Installer
                </p>

                <h2 className="mt-2 text-xl font-bold text-slate-950">
                  {installer.name}
                </h2>

                <dl className="mt-5 space-y-4">
                  <Info
                    label="Phone"
                    value={
                      installer.phone ??
                      "Not added"
                    }
                  />

                  <Info
                    label="Email"
                    value={
                      installer.email ??
                      "Not added"
                    }
                  />

                  <Info
                    label="Roles"
                    value={
                      installer.roles.join(
                        ", ",
                      ) || "Installer"
                    }
                  />
                </dl>

                <Link
                  href="/operations/schedule-requests"
                  className="mt-6 inline-flex w-full justify-center rounded-xl bg-blue-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-900"
                >
                  Create Schedule Request
                </Link>
              </article>
            ),
          )}
        </section>
      )}
    </main>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </dt>

      <dd className="mt-1 break-words text-sm font-semibold text-slate-800">
        {value}
      </dd>
    </div>
  );
}
