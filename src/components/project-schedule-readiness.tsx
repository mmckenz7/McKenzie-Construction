"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

type Readiness = {
  hasDemo: boolean;
  customerReady: boolean;
  permitReady: boolean;
  dumpsterReady: boolean;
  siteAccessReady: boolean;
  installerEarliestDemoStart: string | null;
  installerEarliestConstructionStart: string | null;
  expectedDemoDurationDays: number | null;
  expectedTotalDurationDays: number | null;
  materialsNotRequired: boolean;
  confirmedMaterialDeliveryDate: string | null;
  deliveryBufferWorkdays: number;
  calculatedMaterialSafeStart: string | null;
  calculatedDemoStart: string | null;
  calculatedConstructionStart: string | null;
  confirmedDemoStart: string | null;
  confirmedConstructionStart: string | null;
  scheduleStatus: string;
  schedulingNotes: string | null;
};

type ApiResponse = {
  success: boolean;
  readiness?: Readiness;
  error?: string;
};

function emptyToNull(value: string) {
  return value.trim() === ""
    ? null
    : value;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  ).format(
    new Date(`${value}T12:00:00`),
  );
}

export function ProjectScheduleReadiness({
  projectId,
}: {
  projectId: string;
}) {
  const [readiness, setReadiness] =
    useState<Readiness | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  async function loadReadiness() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/schedule-readiness`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );

      const result =
        (await response.json()) as ApiResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.readiness
      ) {
        setMessage(
          result.error ??
            "Could not load schedule readiness.",
        );
        return;
      }

      setReadiness(result.readiness);
    } catch {
      setMessage(
        "Could not load schedule readiness.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReadiness();
  }, [projectId]);

  async function saveReadiness(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!readiness) {
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/schedule-readiness`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            hasDemo: readiness.hasDemo,
            customerReady:
              readiness.customerReady,
            permitReady:
              readiness.permitReady,
            dumpsterReady:
              readiness.dumpsterReady,
            siteAccessReady:
              readiness.siteAccessReady,
            installerEarliestDemoStart:
              readiness.installerEarliestDemoStart,
            installerEarliestConstructionStart:
              readiness.installerEarliestConstructionStart,
            expectedDemoDurationDays:
              readiness.expectedDemoDurationDays,
            expectedTotalDurationDays:
              readiness.expectedTotalDurationDays,
            materialsNotRequired:
              readiness.materialsNotRequired,
            confirmedMaterialDeliveryDate:
              readiness.confirmedMaterialDeliveryDate,
            deliveryBufferWorkdays:
              readiness.deliveryBufferWorkdays,
            confirmedDemoStart:
              readiness.confirmedDemoStart,
            confirmedConstructionStart:
              readiness.confirmedConstructionStart,
            scheduleStatus:
              readiness.scheduleStatus,
            schedulingNotes:
              readiness.schedulingNotes,
          }),
        },
      );

      const result =
        (await response.json()) as ApiResponse;

      if (!response.ok || !result.success) {
        setMessage(
          result.error ??
            "Could not save schedule readiness.",
        );
        return;
      }

      setMessage("Schedule updated.");
      await loadReadiness();
    } catch {
      setMessage(
        "Could not save schedule readiness.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">
          Loading schedule readiness...
        </p>
      </section>
    );
  }

  if (!readiness) {
    return (
      <section className="mt-8 rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-red-700">
          {message ||
            "Schedule readiness is unavailable."}
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
            Scheduling
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-950">
            Project Readiness
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Demo can begin before materials arrive.
            Construction starts when the installer,
            site, permit, customer, and required
            materials are ready.
          </p>
        </div>

        <span className="self-start rounded-full bg-slate-100 px-4 py-2 text-sm font-bold capitalize text-slate-700">
          {readiness.scheduleStatus.replaceAll(
            "_",
            " ",
          )}
        </span>
      </div>

      <div className="mt-6 grid gap-4 rounded-2xl bg-slate-950 p-5 text-white md:grid-cols-3">
        <Summary
          label="Calculated demo start"
          value={formatDate(
            readiness.calculatedDemoStart,
          )}
        />

        <Summary
          label="Material-safe start"
          value={
            readiness.materialsNotRequired
              ? "Not required"
              : formatDate(
                  readiness.calculatedMaterialSafeStart,
                )
          }
        />

        <Summary
          label="Calculated construction start"
          value={formatDate(
            readiness.calculatedConstructionStart,
          )}
        />
      </div>

      <form
        onSubmit={saveReadiness}
        className="mt-6 space-y-7"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <CheckField
            label="Demo included"
            checked={readiness.hasDemo}
            onChange={(checked) =>
              setReadiness({
                ...readiness,
                hasDemo: checked,
              })
            }
          />

          <CheckField
            label="Customer ready"
            checked={
              readiness.customerReady
            }
            onChange={(checked) =>
              setReadiness({
                ...readiness,
                customerReady: checked,
              })
            }
          />

          <CheckField
            label="Permit ready"
            checked={readiness.permitReady}
            onChange={(checked) =>
              setReadiness({
                ...readiness,
                permitReady: checked,
              })
            }
          />

          <CheckField
            label="Dumpster ready"
            checked={
              readiness.dumpsterReady
            }
            onChange={(checked) =>
              setReadiness({
                ...readiness,
                dumpsterReady: checked,
              })
            }
          />

          <CheckField
            label="Site access ready"
            checked={
              readiness.siteAccessReady
            }
            onChange={(checked) =>
              setReadiness({
                ...readiness,
                siteAccessReady: checked,
              })
            }
          />
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <input
            type="checkbox"
            checked={
              readiness.materialsNotRequired
            }
            onChange={(event) =>
              setReadiness({
                ...readiness,
                materialsNotRequired:
                  event.target.checked,
                confirmedMaterialDeliveryDate:
                  event.target.checked
                    ? null
                    : readiness.confirmedMaterialDeliveryDate,
              })
            }
            className="mt-0.5 h-5 w-5"
          />

          <span>
            <span className="block text-sm font-bold text-slate-950">
              No material delivery required before
              construction
            </span>

            <span className="mt-1 block text-sm leading-6 text-slate-700">
              Use this only when the project can truly
              start without waiting for a material
              delivery. It does not remove materials or
              costs from the estimate.
            </span>
          </span>
        </label>

        <div className="grid gap-5 md:grid-cols-2">
          <DateField
            label="Installer earliest demo start"
            value={
              readiness.installerEarliestDemoStart ??
              ""
            }
            disabled={!readiness.hasDemo}
            onChange={(value) =>
              setReadiness({
                ...readiness,
                installerEarliestDemoStart:
                  emptyToNull(value),
              })
            }
          />

          <DateField
            label="Installer earliest construction start"
            value={
              readiness.installerEarliestConstructionStart ??
              ""
            }
            onChange={(value) =>
              setReadiness({
                ...readiness,
                installerEarliestConstructionStart:
                  emptyToNull(value),
              })
            }
          />

          <SelectField
            label="Expected demo duration"
            value={
              readiness.expectedDemoDurationDays ===
              null
                ? ""
                : String(
                    readiness.expectedDemoDurationDays,
                  )
            }
            disabled={!readiness.hasDemo}
            options={[
              ["", "Select"],
              ["0", "Less than 1 day"],
              ["1", "1 day"],
              ["2", "2 days"],
              ["3", "3 days"],
              ["4", "4 days"],
              ["5", "5 days"],
            ]}
            onChange={(value) =>
              setReadiness({
                ...readiness,
                expectedDemoDurationDays:
                  value === ""
                    ? null
                    : Number(value),
              })
            }
          />

          <SelectField
            label="Expected total duration"
            value={
              readiness.expectedTotalDurationDays ===
              null
                ? ""
                : String(
                    readiness.expectedTotalDurationDays,
                  )
            }
            options={[
              ["", "Select"],
              ["1", "1 day"],
              ["2", "2 days"],
              ["3", "3 days"],
              ["4", "4 days"],
              ["5", "5 days"],
              ["6", "6 days"],
              ["7", "7 days"],
              ["10", "10 days"],
              ["15", "15 days"],
              ["20", "20 days"],
              ["30", "30 days"],
            ]}
            onChange={(value) =>
              setReadiness({
                ...readiness,
                expectedTotalDurationDays:
                  value === ""
                    ? null
                    : Number(value),
              })
            }
          />

          <DateField
            label="Confirmed material delivery"
            value={
              readiness.confirmedMaterialDeliveryDate ??
              ""
            }
            disabled={
              readiness.materialsNotRequired
            }
            onChange={(value) =>
              setReadiness({
                ...readiness,
                confirmedMaterialDeliveryDate:
                  emptyToNull(value),
              })
            }
          />

          <SelectField
            label="Delivery buffer"
            value={String(
              readiness.deliveryBufferWorkdays,
            )}
            options={[
              ["0", "No buffer"],
              ["1", "1 working day"],
              ["2", "2 working days"],
              ["3", "3 working days"],
            ]}
            disabled={
              readiness.materialsNotRequired
            }
            onChange={(value) =>
              setReadiness({
                ...readiness,
                deliveryBufferWorkdays:
                  Number(value),
              })
            }
          />

          <DateField
            label="Confirmed demo start"
            value={
              readiness.confirmedDemoStart ??
              ""
            }
            disabled={!readiness.hasDemo}
            onChange={(value) =>
              setReadiness({
                ...readiness,
                confirmedDemoStart:
                  emptyToNull(value),
              })
            }
          />

          <DateField
            label="Confirmed construction start"
            value={
              readiness.confirmedConstructionStart ??
              ""
            }
            onChange={(value) =>
              setReadiness({
                ...readiness,
                confirmedConstructionStart:
                  emptyToNull(value),
              })
            }
          />
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-800">
            Scheduling notes
          </span>

          <textarea
            rows={4}
            value={
              readiness.schedulingNotes ?? ""
            }
            onChange={(event) =>
              setReadiness({
                ...readiness,
                schedulingNotes:
                  emptyToNull(
                    event.target.value,
                  ),
              })
            }
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-950 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </label>

        {message && (
          <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-blue-950 px-5 py-4 text-base font-bold text-white transition hover:bg-blue-900 disabled:opacity-60"
        >
          {saving
            ? "Saving..."
            : "Save and recalculate schedule"}
        </button>
      </form>
    </section>
  );
}

function Summary({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-blue-300">
        {label}
      </p>

      <p className="mt-2 text-base font-bold">
        {value}
      </p>
    </div>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) =>
          onChange(event.target.checked)
        }
        className="h-5 w-5"
      />

      <span className="text-sm font-bold text-slate-800">
        {label}
      </span>
    </label>
  );
}

function DateField({
  label,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="mb-2 block text-sm font-bold text-slate-800">
        {label}
      </span>

      <input
        type="date"
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="mb-2 block text-sm font-bold text-slate-800">
        {label}
      </span>

      <select
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        {options.map(
          ([optionValue, labelText]) => (
            <option
              key={`${optionValue}-${labelText}`}
              value={optionValue}
            >
              {labelText}
            </option>
          ),
        )}
      </select>
    </label>
  );
}
