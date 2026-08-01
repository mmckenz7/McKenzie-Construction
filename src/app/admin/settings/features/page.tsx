"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type FeatureSetting = {
  featureKey: string;
  displayName: string;
  description: string | null;
  category: string;
  sortOrder: number;
  isEnabled: boolean;
  isOverridden: boolean;
};

type ScopeType =
  | "global"
  | "company"
  | "workspace";

function categoryLabel(
  value: string,
) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

export default function FeatureSettingsPage() {
  const [
    scopeType,
    setScopeType,
  ] = useState<ScopeType>(
    "global",
  );

  const [
    scopeId,
    setScopeId,
  ] = useState("default");

  const [
    features,
    setFeatures,
  ] = useState<
    FeatureSetting[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    savingFeatureKey,
    setSavingFeatureKey,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const [
    notice,
    setNotice,
  ] = useState("");

  const loadFeatures =
    useCallback(async () => {
      setLoading(true);
      setError("");

      try {
        const query =
          new URLSearchParams({
            scopeType,
            scopeId,
          });

        const response = await fetch(
          `/api/admin/feature-settings?${query.toString()}`,
          {
            credentials: "include",
            cache: "no-store",
          },
        );

        const result =
          (await response.json()) as {
            success?: boolean;
            error?: string;
            features?: FeatureSetting[];
          };

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.error ??
              "Could not load feature settings.",
          );
        }

        setFeatures(
          result.features ?? [],
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load feature settings.",
        );
      } finally {
        setLoading(false);
      }
    }, [
      scopeType,
      scopeId,
    ]);

  useEffect(() => {
    void loadFeatures();
  }, [loadFeatures]);

  const groupedFeatures =
    useMemo(() => {
      return features.reduce<
        Record<
          string,
          FeatureSetting[]
        >
      >(
        (
          groups,
          feature,
        ) => {
          groups[
            feature.category
          ] ??= [];

          groups[
            feature.category
          ].push(feature);

          return groups;
        },
        {},
      );
    }, [features]);

  async function toggleFeature(
    feature: FeatureSetting,
  ) {
    const nextEnabled =
      !feature.isEnabled;

    setSavingFeatureKey(
      feature.featureKey,
    );
    setError("");
    setNotice("");

    setFeatures((current) =>
      current.map((item) =>
        item.featureKey ===
        feature.featureKey
          ? {
              ...item,
              isEnabled:
                nextEnabled,
            }
          : item,
      ),
    );

    try {
      const response = await fetch(
        "/api/admin/feature-settings",
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            scopeType,
            scopeId,
            featureKey:
              feature.featureKey,
            isEnabled:
              nextEnabled,
          }),
        },
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
        };

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "Could not save feature setting.",
        );
      }

      setNotice(
        `${feature.displayName} ${
          nextEnabled
            ? "enabled"
            : "disabled"
        }.`,
      );

      setFeatures((current) =>
        current.map((item) =>
          item.featureKey ===
          feature.featureKey
            ? {
                ...item,
                isOverridden:
                  scopeType !==
                  "global",
              }
            : item,
        ),
      );
    } catch (saveError) {
      setFeatures((current) =>
        current.map((item) =>
          item.featureKey ===
          feature.featureKey
            ? {
                ...item,
                isEnabled:
                  feature.isEnabled,
              }
            : item,
        ),
      );

      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save feature setting.",
      );
    } finally {
      setSavingFeatureKey("");
    }
  }

  function changeScopeType(
    value: ScopeType,
  ) {
    setScopeType(value);

    setScopeId(
      value === "global"
        ? "default"
        : "",
    );

    setFeatures([]);
    setNotice("");
    setError("");
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            href="/admin/settings"
            className="text-sm font-bold text-blue-800"
          >
            ← Admin Settings
          </Link>

          <h1 className="mt-5 text-3xl font-black text-slate-950">
            Feature Settings
          </h1>

          <p className="mt-2 max-w-3xl text-slate-600">
            Turn advanced tools on or
            off so each company or
            workspace only sees the
            workflow it needs.
          </p>
        </div>
      </div>

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">
          Settings Scope
        </h2>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Scope

            <select
              value={scopeType}
              onChange={(event) =>
                changeScopeType(
                  event.target
                    .value as ScopeType,
                )
              }
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950"
            >
              <option value="global">
                Global Defaults
              </option>

              <option value="company">
                Company
              </option>

              <option value="workspace">
                Workspace
              </option>
            </select>
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Scope ID

            <input
              value={scopeId}
              onChange={(event) =>
                setScopeId(
                  event.target.value,
                )
              }
              disabled={
                scopeType ===
                "global"
              }
              placeholder={
                scopeType ===
                "company"
                  ? "Company ID"
                  : scopeType ===
                      "workspace"
                    ? "Workspace ID"
                    : "default"
              }
              className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950 disabled:bg-slate-100"
            />
          </label>
        </div>

        {scopeType !== "global" && (
          <p className="mt-4 text-sm text-slate-600">
            Features without a custom
            override inherit the global
            default.
          </p>
        )}
      </section>

      {notice && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {notice}
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </div>
      )}

      {scopeType !== "global" &&
      !scopeId.trim() ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          Enter a company or workspace
          ID to manage its features.
        </div>
      ) : loading ? (
        <div className="mt-6 grid gap-4">
          {Array.from({
            length: 5,
          }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-2xl bg-slate-100"
            />
          ))}
        </div>
      ) : (
        <div className="mt-7 grid gap-7">
          {Object.entries(
            groupedFeatures,
          ).map(
            ([
              category,
              categoryFeatures,
            ]) => (
              <section
                key={category}
                className="rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="border-b border-slate-200 px-6 py-5">
                  <h2 className="text-xl font-bold text-slate-950">
                    {categoryLabel(
                      category,
                    )}
                  </h2>
                </div>

                <div className="divide-y divide-slate-200">
                  {categoryFeatures.map(
                    (feature) => {
                      const saving =
                        savingFeatureKey ===
                        feature.featureKey;

                      return (
                        <article
                          key={
                            feature.featureKey
                          }
                          className="flex flex-col gap-5 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="max-w-3xl">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-bold text-slate-950">
                                {
                                  feature.displayName
                                }
                              </h3>

                              {feature.isOverridden && (
                                <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-800">
                                  Custom
                                </span>
                              )}
                            </div>

                            {feature.description && (
                              <p className="mt-2 text-sm leading-6 text-slate-600">
                                {
                                  feature.description
                                }
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            role="switch"
                            aria-checked={
                              feature.isEnabled
                            }
                            disabled={saving}
                            onClick={() =>
                              void toggleFeature(
                                feature,
                              )
                            }
                            className={`relative inline-flex h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50 ${
                              feature.isEnabled
                                ? "bg-emerald-700"
                                : "bg-slate-300"
                            }`}
                          >
                            <span
                              className={`mt-1 inline-block h-6 w-6 rounded-full bg-white shadow transition ${
                                feature.isEnabled
                                  ? "ml-7"
                                  : "ml-1"
                              }`}
                            />
                          </button>
                        </article>
                      );
                    },
                  )}
                </div>
              </section>
            ),
          )}
        </div>
      )}
    </main>
  );
}
