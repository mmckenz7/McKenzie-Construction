"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

type MaterialPhase = {
  id: string;
  projectId: string;
  phaseKey: string;
  phaseName: string;
  phaseOrder: number;
  requiredForStart: boolean;
  supplierName: string | null;
  deliveryStatus: string;
  estimatedDeliveryDate: string | null;
  confirmedDeliveryDate: string | null;
  deliveryBufferWorkdays: number;
  calculatedReadyDate: string | null;
  notes: string | null;
};

type ApiResponse = {
  success: boolean;
  materialPhases?: MaterialPhase[];
  materialPhase?: MaterialPhase;
  error?: string;
};

const statuses = [
  ["not_sent", "Not sent"],
  ["sent_for_quote", "Sent for quote"],
  ["quoted", "Quoted"],
  ["ordered", "Ordered"],
  ["scheduled", "Scheduled"],
  ["delivered", "Delivered"],
  ["delayed", "Delayed"],
  ["cancelled", "Cancelled"],
];

function formatDate(value: string | null) {
  if (!value) {
    return "Not ready";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export function ProjectMaterialPhases({
  projectId,
}: {
  projectId: string;
}) {
  const [phases, setPhases] = useState<
    MaterialPhase[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [savingId, setSavingId] =
    useState<string | null>(null);

  const [message, setMessage] =
    useState("");

  async function loadPhases() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/material-phases`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );

      const result =
        (await response.json()) as ApiResponse;

      if (!response.ok || !result.success) {
        setMessage(
          result.error ??
            "Could not load material phases.",
        );
        return;
      }

      setPhases(
        result.materialPhases ?? [],
      );
    } catch {
      setMessage(
        "Could not load material phases.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPhases();
  }, [projectId]);

  function updatePhase(
    id: string,
    changes: Partial<MaterialPhase>,
  ) {
    setPhases((current) =>
      current.map((phase) =>
        phase.id === id
          ? {
              ...phase,
              ...changes,
            }
          : phase,
      ),
    );
  }

  async function savePhase(
    event: FormEvent<HTMLFormElement>,
    phase: MaterialPhase,
  ) {
    event.preventDefault();
    setSavingId(phase.id);
    setMessage("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/material-phases`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            id: phase.id,
            phaseName: phase.phaseName,
            phaseOrder: phase.phaseOrder,
            requiredForStart:
              phase.requiredForStart,
            supplierName:
              phase.supplierName,
            deliveryStatus:
              phase.deliveryStatus,
            estimatedDeliveryDate:
              phase.estimatedDeliveryDate,
            confirmedDeliveryDate:
              phase.confirmedDeliveryDate,
            deliveryBufferWorkdays:
              phase.deliveryBufferWorkdays,
            notes: phase.notes,
          }),
        },
      );

      const result =
        (await response.json()) as ApiResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.materialPhase
      ) {
        setMessage(
          result.error ??
            "Could not save material phase.",
        );
        return;
      }

      updatePhase(
        phase.id,
        result.materialPhase,
      );

      setMessage(
        `${phase.phaseName} updated.`,
      );
    } catch {
      setMessage(
        "Could not save material phase.",
      );
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">
          Loading material phases...
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
          Materials
        </p>

        <h2 className="mt-2 text-2xl font-bold text-slate-950">
          Material Readiness by Phase
        </h2>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Track delivery status separately for
          framing, decking, railing, and punch-list
          materials. Only phases marked required
          for start control the calculated
          construction date.
        </p>
      </div>

      <div className="mt-6 grid gap-5">
        {phases.map((phase) => (
          <form
            key={phase.id}
            onSubmit={(event) =>
              void savePhase(event, phase)
            }
            className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-950">
                  {phase.phaseName}
                </h3>

                <p className="mt-1 text-sm text-slate-600">
                  Ready date:{" "}
                  <strong>
                    {formatDate(
                      phase.calculatedReadyDate,
                    )}
                  </strong>
                </p>
              </div>

              <label className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={
                    phase.requiredForStart
                  }
                  onChange={(event) =>
                    updatePhase(phase.id, {
                      requiredForStart:
                        event.target.checked,
                    })
                  }
                  className="h-4 w-4"
                />

                Required to start
              </label>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Delivery status">
                <select
                  value={
                    phase.deliveryStatus
                  }
                  onChange={(event) =>
                    updatePhase(phase.id, {
                      deliveryStatus:
                        event.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold"
                >
                  {statuses.map(
                    ([value, label]) => (
                      <option
                        key={value}
                        value={value}
                      >
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </Field>

              <Field label="Supplier">
                <input
                  type="text"
                  value={
                    phase.supplierName ?? ""
                  }
                  onChange={(event) =>
                    updatePhase(phase.id, {
                      supplierName:
                        event.target.value ||
                        null,
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                />
              </Field>

              <Field label="Estimated delivery">
                <input
                  type="date"
                  value={
                    phase.estimatedDeliveryDate ??
                    ""
                  }
                  onChange={(event) =>
                    updatePhase(phase.id, {
                      estimatedDeliveryDate:
                        event.target.value ||
                        null,
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold"
                />
              </Field>

              <Field label="Confirmed delivery">
                <input
                  type="date"
                  value={
                    phase.confirmedDeliveryDate ??
                    ""
                  }
                  onChange={(event) =>
                    updatePhase(phase.id, {
                      confirmedDeliveryDate:
                        event.target.value ||
                        null,
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold"
                />
              </Field>

              <Field label="Delivery buffer">
                <select
                  value={String(
                    phase.deliveryBufferWorkdays,
                  )}
                  onChange={(event) =>
                    updatePhase(phase.id, {
                      deliveryBufferWorkdays:
                        Number(
                          event.target.value,
                        ),
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold"
                >
                  <option value="0">
                    No buffer
                  </option>

                  <option value="1">
                    1 working day
                  </option>

                  <option value="2">
                    2 working days
                  </option>

                  <option value="3">
                    3 working days
                  </option>
                </select>
              </Field>

              <label className="md:col-span-2 xl:col-span-3">
                <span className="mb-2 block text-sm font-bold text-slate-800">
                  Notes
                </span>

                <input
                  type="text"
                  value={phase.notes ?? ""}
                  onChange={(event) =>
                    updatePhase(phase.id, {
                      notes:
                        event.target.value ||
                        null,
                    })
                  }
                  placeholder="Delivery details, shortages, substitutions, or supplier notes"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={
                savingId === phase.id
              }
              className="mt-5 w-full rounded-xl bg-blue-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-900 disabled:opacity-60"
            >
              {savingId === phase.id
                ? "Saving..."
                : `Save ${phase.phaseName}`}
            </button>
          </form>
        ))}
      </div>

      {message && (
        <p className="mt-5 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
          {message}
        </p>
      )}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="mb-2 block text-sm font-bold text-slate-800">
        {label}
      </span>

      {children}
    </label>
  );
}
