"use client";

import { useMemo, useState } from "react";
import {
  buildPrescriptiveDeckPlan,
  KNOXVILLE_2024_DECK_PROFILE,
  recommendedPrescriptiveDraft,
  type DeckPrescriptiveDraft,
  type DeckPrescriptivePlan,
} from "@/lib/deck-prescriptive-plan";

const control =
  "mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100";
const button =
  "min-h-11 rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";
const STEPS = [
  "Confirm facts",
  "Framing draft",
  "Supports & footings",
  "Exceptions",
  "Review plan",
] as const;
function Field({
  label,
  children,
  help,
}: {
  label: string;
  children: React.ReactNode;
  help?: string;
}) {
  return (
    <label className="block text-sm font-bold text-slate-900">
      <span>{label}</span>
      {children}
      {help ? (
        <span className="mt-1 block text-xs font-normal leading-5 text-slate-600">
          {help}
        </span>
      ) : null}
    </label>
  );
}

export function DeckPrescriptivePlanGenerator({
  lengthFeet,
  widthFeet,
  blueprintAttachment,
  blueprintStairs,
  blueprintRailings,
  stairEdge = "yard",
  stairPosition = "center",
  disabled,
  onApprove,
}: {
  lengthFeet: number;
  widthFeet: number;
  blueprintAttachment: "ledger" | "freestanding";
  blueprintStairs: boolean;
  blueprintRailings: boolean;
  stairEdge?: "left" | "right" | "yard" | "top";
  stairPosition?: "start" | "center" | "end";
  disabled: boolean;
  onApprove: (plan: DeckPrescriptivePlan) => void;
}) {
  const [draft, setDraft] = useState<DeckPrescriptiveDraft>(() =>
    recommendedPrescriptiveDraft(
      blueprintAttachment,
      blueprintStairs,
      lengthFeet,
      widthFeet,
      blueprintRailings,
    ),
  );
  const [step, setStep] = useState(0);
  const [approved, setApproved] = useState(false);
  const plan = useMemo(
    () => buildPrescriptiveDeckPlan({ lengthFeet, widthFeet, draft }),
    [lengthFeet, widthFeet, draft],
  );
  const set = <K extends keyof DeckPrescriptiveDraft>(
    key: K,
    value: DeckPrescriptiveDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setApproved(false);
  };
  const joists =
    plan.quantities?.joists ??
    Math.max(
      2,
      Math.ceil((lengthFeet * 12) / Number(draft.joistSpacingInches || 16)) + 1,
    );
  const beamLines = Math.max(1, Number(draft.beamLineCount || 1));
  const posts = Math.max(1, Number(draft.postCount || 1));
  const stairX =
    stairPosition === "start" ? 55 : stairPosition === "end" ? 235 : 145;
  return (
    <section className="mt-5 rounded-xl border-2 border-violet-600 bg-white p-4">
      <p className="text-xs font-black uppercase tracking-[.16em] text-violet-800">
        Required framing source for a full rebuild
      </p>
      <h4 className="mt-1 text-lg font-black text-slate-950">
        Create or import the framing plan
      </h4>
      <p className="mt-2 rounded-md bg-violet-50 p-3 text-sm font-bold leading-6 text-violet-950">
        Prescriptive estimating and permit-preparation plan — not stamped.
        Subject to field verification and City building-department approval. An
        engineer/AHJ-approved plan may be used instead.
      </p>
      <div
        className="mt-3 grid grid-cols-5 gap-1"
        aria-label={`Step ${step + 1} of ${STEPS.length}`}
      >
        {STEPS.map((label, index) => (
          <button
            type="button"
            key={label}
            aria-label={label}
            className={`min-h-11 rounded px-1 text-xs font-bold ${index === step ? "bg-violet-700 text-white" : "bg-slate-100 text-slate-700"}`}
            onClick={() => setStep(index)}
          >
            {index + 1}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm font-black">{STEPS[step]}</p>
      {step === 0 ? (
        <div className="mt-3 space-y-3">
          <Field label="Verified authority having jurisdiction">
            <select
              className={control}
              value={draft.jurisdiction}
              onChange={(e) =>
                set(
                  "jurisdiction",
                  e.target.value as DeckPrescriptiveDraft["jurisdiction"],
                )
              }
            >
              <option value="">Choose after verification</option>
              <option value="city_knoxville_verified">
                City of Knoxville verified
              </option>
              <option value="other_or_uncertain">Other or uncertain</option>
            </select>
          </Field>
          <p className="text-xs text-slate-600">
            A Knoxville mailing address does not prove City jurisdiction.
          </p>
          <div className="rounded-md border p-3 text-xs">
            <a
              className="block text-blue-800 underline"
              href={KNOXVILLE_2024_DECK_PROFILE.controllingCodeUrl}
            >
              City adoption · 2024 IRC
            </a>
            <a
              className="block text-blue-800 underline"
              href={KNOXVILLE_2024_DECK_PROFILE.codeSourceUrl}
            >
              IRC 2024 R507 rule source
            </a>
            <a
              className="block text-blue-800 underline"
              href={KNOXVILLE_2024_DECK_PROFILE.formatReferenceUrl}
            >
              City 2018 deck guide · format reference only
            </a>
          </div>
          <p className="rounded-md bg-slate-50 p-3 text-sm">
            Approved blueprint says:{" "}
            <strong>
              {blueprintAttachment === "ledger"
                ? "attached at house"
                : "freestanding"}
            </strong>
            ;{" "}
            <strong>{blueprintStairs ? "stairs included" : "no stairs"}</strong>
            .
          </p>
          <label className="flex min-h-11 gap-3 rounded border p-3 text-sm font-bold">
            <input
              type="checkbox"
              checked={draft.attachmentConfirmed}
              onChange={(e) => set("attachmentConfirmed", e.target.checked)}
            />
            I confirmed the attachment fact.
          </label>
          <label className="flex min-h-11 gap-3 rounded border p-3 text-sm font-bold">
            <input
              type="checkbox"
              checked={draft.stairsConfirmed}
              onChange={(e) => set("stairsConfirmed", e.target.checked)}
            />
            I confirmed the stair fact.
          </label>
          {draft.attachment === "ledger" ? (
            <Field label="House attachment substrate">
              <select
                className={control}
                value={draft.ledgerSubstrate}
                onChange={(e) =>
                  set(
                    "ledgerSubstrate",
                    e.target.value as DeckPrescriptiveDraft["ledgerSubstrate"],
                  )
                }
              >
                <option value="">Choose after field check</option>
                <option value="verified_band_rim">
                  Verified wood band/rim joist
                </option>
                <option value="masonry_veneer">Brick/stone veneer</option>
                <option value="concrete_or_other">Concrete or other</option>
                <option value="unknown">Unknown/concealed</option>
              </select>
            </Field>
          ) : null}
        </div>
      ) : null}
      {step === 1 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Lumber species and grade">
            <select
              className={control}
              value={draft.speciesGrade}
              onChange={(e) =>
                set(
                  "speciesGrade",
                  e.target.value as DeckPrescriptiveDraft["speciesGrade"],
                )
              }
            >
              <option value="">Choose</option>
              <option value="southern_pine_no2">Southern Pine No. 2</option>
            </select>
          </Field>
          <Field label="Treatment / service">
            <select
              className={control}
              value={draft.treatmentService}
              onChange={(e) =>
                set(
                  "treatmentService",
                  e.target.value as DeckPrescriptiveDraft["treatmentService"],
                )
              }
            >
              <option value="">Choose</option>
              <option value="pressure_treated_wet_service">
                Pressure-treated · wet service
              </option>
            </select>
          </Field>
          <Field label="Design load profile">
            <select
              className={control}
              value={draft.designLoad}
              onChange={(e) =>
                set(
                  "designLoad",
                  e.target.value as DeckPrescriptiveDraft["designLoad"],
                )
              }
            >
              <option value="">Choose</option>
              <option value="40_live_10_dead">40 psf live + 10 psf dead</option>
            </select>
          </Field>
          <Field label="Joist spacing (inches on center)">
            <select
              className={control}
              value={draft.joistSpacingInches}
              onChange={(e) =>
                set(
                  "joistSpacingInches",
                  e.target.value as DeckPrescriptiveDraft["joistSpacingInches"],
                )
              }
            >
              {["12", "16", "24"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Joist size">
            <select
              className={control}
              value={draft.joistSize}
              onChange={(e) =>
                set(
                  "joistSize",
                  e.target.value as DeckPrescriptiveDraft["joistSize"],
                )
              }
            >
              {["2x6", "2x8", "2x10", "2x12"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Beam size">
            <select
              className={control}
              value={draft.beamSize}
              onChange={(e) =>
                set(
                  "beamSize",
                  e.target.value as DeckPrescriptiveDraft["beamSize"],
                )
              }
            >
              {["2x6", "2x8", "2x10", "2x12"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Beam plies">
            <select
              className={control}
              value={draft.beamPlies}
              onChange={(e) =>
                set(
                  "beamPlies",
                  e.target.value as DeckPrescriptiveDraft["beamPlies"],
                )
              }
            >
              {["1", "2", "3"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Support/beam lines">
            <input
              className={control}
              inputMode="numeric"
              value={draft.beamLineCount}
              onChange={(e) => set("beamLineCount", e.target.value)}
            />
          </Field>
        </div>
      ) : null}
      {step === 2 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <p className="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-950 sm:col-span-2">
            <strong>Profile recommendation:</strong> the current geometry
            prefilled the smallest encoded passing beam and footing-pad values.
            Review them; every change is checked again.
          </p>
          <Field label="Post count">
            <input
              className={control}
              inputMode="numeric"
              value={draft.postCount}
              onChange={(e) => set("postCount", e.target.value)}
            />
          </Field>
          <Field label="Post size">
            <select
              className={control}
              value={draft.postSize}
              onChange={(e) =>
                set(
                  "postSize",
                  e.target.value as DeckPrescriptiveDraft["postSize"],
                )
              }
            >
              <option value="">Choose</option>
              {["4x4", "6x6"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Maximum exposed post height (feet)">
            <input
              className={control}
              inputMode="decimal"
              value={draft.postHeightFeet}
              onChange={(e) => set("postHeightFeet", e.target.value)}
            />
          </Field>
          <Field label="Footing count">
            <input
              className={control}
              inputMode="numeric"
              value={draft.footingCount}
              onChange={(e) => set("footingCount", e.target.value)}
            />
          </Field>
          <Field label="Round footing diameter (inches)">
            <input
              className={control}
              inputMode="decimal"
              value={draft.footingDiameterInches}
              onChange={(e) => set("footingDiameterInches", e.target.value)}
            />
          </Field>
          <Field label="Concrete footing thickness (inches)">
            <input
              className={control}
              inputMode="decimal"
              value={draft.footingThicknessInches}
              onChange={(e) => set("footingThicknessInches", e.target.value)}
            />
          </Field>
          <Field label="Bottom of footing depth below grade (inches)">
            <input
              className={control}
              inputMode="decimal"
              value={draft.footingDepthInches}
              onChange={(e) => set("footingDepthInches", e.target.value)}
            />
          </Field>
          <Field label="Verified frost-depth basis">
            <input
              className={control}
              maxLength={160}
              value={draft.frostBasis}
              onChange={(e) => set("frostBasis", e.target.value)}
            />
          </Field>
          <Field
            label="Extra reviewed blocking rows"
            help="Zero is allowed. Add only blocking/bracing shown by a reviewed plan or required detail."
          >
            <input
              className={control}
              inputMode="numeric"
              value={draft.extraBlockingRows}
              onChange={(e) => set("extraBlockingRows", e.target.value)}
            />
          </Field>
          <Field
            label="Connector/fastener notes (not proof of a complete schedule)"
            help="These notes do not complete the connector work package. Supply the actual reviewed schedule and cost source in the takeoff checklist."
          >
            <input
              className={control}
              maxLength={160}
              value={draft.hardwareBasis}
              onChange={(e) => set("hardwareBasis", e.target.value)}
            />
          </Field>
        </div>
      ) : null}
      {step === 3 ? (
        <div className="mt-3 space-y-2">
          {(
            [
              ["unusualGeometry", "Nonrectangular/unusual geometry"],
              ["cantilever", "Cantilever/overhang"],
              ["roofOrSpecialLoad", "Roof, hot tub, or special load"],
              ["soilOrFootingUncertain", "Soil or frost basis uncertain"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex min-h-11 gap-3 rounded border p-3 text-sm font-bold"
            >
              <input
                type="checkbox"
                checked={draft[key]}
                onChange={(e) => set(key, e.target.checked)}
              />
              {label}
            </label>
          ))}
          <p className="text-sm text-slate-700">
            Any checked condition stops this bounded profile for engineer/AHJ
            review.
          </p>
        </div>
      ) : null}
      {step === 4 ? (
        <div className="mt-3">
          <svg
            viewBox="0 0 320 210"
            role="img"
            aria-label="Framing plan showing joists, beams, posts, footings, attachment edge, and stair opening"
            className="w-full rounded border bg-slate-50"
          >
            <rect
              x="30"
              y="20"
              width="260"
              height="150"
              fill="white"
              stroke="#334155"
              strokeWidth="2"
            />
            {Array.from({ length: Math.min(joists, 30) }, (_, i) => (
              <line
                data-plan-member="joist"
                key={`j${i}`}
                x1={30 + (i * 260) / (Math.min(joists, 30) - 1)}
                x2={30 + (i * 260) / (Math.min(joists, 30) - 1)}
                y1="20"
                y2="170"
                stroke="#94a3b8"
              />
            ))}
            {Array.from({ length: beamLines }, (_, i) => (
              <line
                data-plan-member="beam"
                key={`b${i}`}
                x1="30"
                x2="290"
                y1={20 + ((i + 1) * 150) / (beamLines + 1)}
                y2={20 + ((i + 1) * 150) / (beamLines + 1)}
                stroke="#7c3aed"
                strokeWidth="4"
              />
            ))}
            {Array.from({ length: posts }, (_, i) => (
              <g key={`p${i}`}>
                <circle
                  data-plan-member="footing"
                  cx={45 + (i * 230) / Math.max(1, posts - 1)}
                  cy="120"
                  r="7"
                  fill="#c4b5fd"
                />
                <rect
                  data-plan-member="post"
                  x={41 + (i * 230) / Math.max(1, posts - 1)}
                  y="116"
                  width="8"
                  height="8"
                  fill="#4c1d95"
                />
              </g>
            ))}
            <line
              data-plan-member={
                draft.attachment === "ledger" ? "ledger" : "freestanding-edge"
              }
              x1="30"
              x2="290"
              y1="20"
              y2="20"
              stroke="#0f172a"
              strokeWidth="6"
            />
            {blueprintStairs ? (
              <g>
                <rect
                  data-plan-member="stair-opening"
                  x={stairX}
                  y={stairEdge === "top" ? 20 : 145}
                  width="40"
                  height="25"
                  fill="#fef3c7"
                  stroke="#92400e"
                  strokeWidth="2"
                />
                <text x={stairX + 20} y={stairEdge === "top" ? 35 : 160} textAnchor="middle" fontSize="7" fill="#78350f">detail required</text>
              </g>
            ) : null}
            <text x="160" y="198" textAnchor="middle" fontSize="10">
              Plan geometry changes with framing inputs · not stamped
            </text>
          </svg>
          {plan.exceptions.length ? (
            <div
              role="alert"
              className="mt-3 rounded border border-amber-400 bg-amber-50 p-3"
            >
              <p className="font-black">Exception review required</p>
              <ul className="list-disc pl-5 text-sm">
                {plan.exceptions.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {plan.bom.length ? (
            <div className="mt-3 rounded border border-emerald-400 bg-emerald-50 p-3">
              <p className="font-black">Main deck framing ready</p>
              <p className="mt-1 text-sm">{plan.unresolvedPackages.includes("stairs") ? "Stair detail and connector schedule still needed." : "Connector schedule still needed."}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {plan.bom.map((x) => (
                  <li key={x.key}>
                    {x.quantity} {x.unit} · {x.description}
                  </li>
                ))}
              </ul>
              <div className="mt-3 border-t border-emerald-300 pt-3">
                <p className="font-black">Hardware requirements — products and prices still required</p>
                <ul className="mt-2 space-y-2 text-sm">
                  {plan.hardwareSchedule.map((item) => (
                    <li key={item.key} className="rounded bg-white p-2">
                      <strong>{item.quantity} {item.unit}</strong> · {item.specification}
                      <span className="mt-1 block text-xs text-slate-600">Basis: {item.sourceId}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
          <label className="mt-3 flex min-h-11 gap-3 rounded border p-3 text-sm font-bold">
            <input
              type="checkbox"
              disabled={!plan.quantities}
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
            />
            I reviewed the field facts, rule checks, drawing, and material
            quantities. This is not stamped engineering or permit approval.
          </label>
          <button
            type="button"
            className={`mt-3 w-full ${button}`}
            disabled={disabled || !approved || !plan.quantities}
            onClick={() => onApprove(plan)}
          >
            Use approved main-deck framing in takeoff
          </button>
        </div>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          className={button}
          disabled={step === 0}
          onClick={() => setStep((x) => x - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className={button}
          disabled={step === STEPS.length - 1}
          onClick={() => setStep((x) => x + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}
