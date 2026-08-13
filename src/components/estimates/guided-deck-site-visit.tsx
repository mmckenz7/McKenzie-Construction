"use client";

import { useCallback, useEffect, useState } from "react";

type Requirement = { mode: "photo_only" | "required_measurements" | "conditional"; fields?: string[]; when?: string; otherwise?: string };
type VisitItem = { id: string; itemKey: string; ordinal: number; title: string; instructions: string; requirement: Requirement; state: "pending" | "confirmed" | "documented_follow_up"; observation: Record<string, unknown>; followUpReasonCode: string | null; followUpNotes: string | null };
type UsabilityVerdict = "usable" | "retake_recommended" | "unable_to_assess";
type UsabilityReview = { id: string; verdict: UsabilityVerdict; issueCodes: string[]; createdAt: string };
type PhotoAttempt = { id: string; visitItemId: string; retakeOfAttemptId: string | null; ordinal: number; state: "upload_pending" | "quarantined" | "confirmed" | "superseded" | "failed_validation"; usabilityReviews: UsabilityReview[] };
type Visit = { id: string; revision: number; status: "in_progress" | "completed"; completionOutcome: "all_passed" | "documented_with_office_follow_up" | null; items: VisitItem[]; photoAttempts: PhotoAttempt[] };

const INCLUDE: Record<string, string[]> = {
  property_context: ["House elevation and work area", "Entire deck or proposed area", "Surrounding yard, grade, and access direction"],
  full_deck_yard: ["Full deck width and surface edge", "Visible stairs and railings", "Grade below the deck"],
  house_ledger: ["Ledger or house connection", "Visible flashing area", "Exterior finish above and below", "Both end conditions when accessible"],
  underside_framing: ["Joists and framing direction", "Beam locations", "Visible blocking", "Ledger or bearing relationship"],
  supports_footings: ["Every visible support line", "Post-to-beam connections", "Post bases", "Exposed footing tops or ground entry"],
  stairs_landings: ["Complete stair flight", "Top connection and visible stringers", "Treads and risers", "Bottom landing and nearby grade"],
  guards_railings: ["Each different railing section", "Posts and attachments", "Corners and transitions", "Stair handrail when present"],
  access_demolition: ["Route from street or driveway", "Gates and narrow passages", "Slopes, soft ground, or landscaping", "Staging and debris route"],
  utilities_obstructions: ["Visible utilities and service equipment", "HVAC or mechanical equipment", "Downspouts and drainage", "Trees, fences, walls, concrete, or other obstacles"],
};
const FIELD_LABELS: Record<string, string> = {
  length: "Overall deck length", width: "Overall deck width", height_from_grade: "Height from grade to deck surface",
  ledger_length: "Ledger length", joist_spacing: "Visible joist spacing", joist_depth: "Visible joist depth", beam_depth: "Visible beam depth",
  post_dimensions: "Post dimensions", support_spacing: "Support-line spacing", exposed_footing_dimensions: "Exposed footing dimensions",
  stair_width: "Stair width", total_rise: "Total rise", tread_depth: "Tread depth", representative_riser: "Representative riser height", landing_dimensions: "Landing dimensions",
  guard_height: "Guard height", opening: "Representative opening", rail_lengths_by_area: "Railing lengths by area", handrail_height: "Stair handrail height",
  narrow_access_width: "Narrowest access width", gate_width: "Gate opening width", clearance: "Clearance height", obstruction_clearances: "Relevant obstruction clearance",
};
const CONDITIONS: Record<string, { prompt: string; yes: string; no: string }> = {
  attached: { prompt: "Is this deck attached to the house?", yes: "Attached", no: "Not attached" },
  visible: { prompt: "Is the underside framing safely visible?", yes: "Visible", no: "Not safely visible" },
  safely_visible: { prompt: "Are supports and exposed footings safely visible?", yes: "Safely visible", no: "Not safely visible" },
  stairs_present: { prompt: "Are stairs present?", yes: "Stairs present", no: "I inspected the area; no stairs are present" },
  rail_present: { prompt: "Are guards or railings present?", yes: "Guards or railings present", no: "I inspected the area; none are present" },
  narrow_access_present: { prompt: "Does access have a narrow gate or clearance?", yes: "Constraint present", no: "No narrow-access constraint observed" },
  utilities_or_obstructions_present: { prompt: "Are utilities or obstructions visible?", yes: "Visible", no: "I inspected the area; none are visible" },
};
const BLOCK_REASONS = [
  ["unsafe_access", "Unsafe to access"], ["inaccessible", "Area physically inaccessible"], ["concealed", "Condition concealed"],
  ["customer_declined", "Customer denied access"], ["site_condition", "Weather, lighting, or site condition"],
  ["office_verification_required", "Office verification required"],
] as const;
const REVIEW_REASONS: Record<string, string> = {
  blurry: "The photo looks blurry.", too_dark: "The photo looks too dark.", too_bright: "The photo looks too bright.", glare: "Glare is hiding part of the view.",
  obstructed: "Something is blocking the view.", wrong_subject: "The requested area may not be in the photo.", incomplete_view: "The full requested area is not visible.",
  too_distant: "The important details are too far away.", orientation_problem: "The photo orientation makes the view hard to check.", unsupported_media: "This photo format could not be reviewed.",
};
const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base text-slate-950 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100 disabled:bg-slate-100";
const primary = "w-full rounded-lg bg-slate-950 px-4 py-3 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto";
const secondary = "w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base font-bold text-slate-800 disabled:opacity-50 sm:w-auto";

export function GuidedDeckSiteVisit({ estimateId }: { estimateId: string }) {
  const [visit, setVisit] = useState<Visit | null>(null);
  const [permission, setPermission] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [measurements, setMeasurements] = useState<Record<string, { value: string; unit: string }>>({});
  const [condition, setCondition] = useState<"yes" | "no" | "">("");
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [blockNotes, setBlockNotes] = useState("");
  const [localPhoto, setLocalPhoto] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<{ id: string; revision: number } | null>(null);
  const [localReview, setLocalReview] = useState<{ photoId: string; status: "reviewing" } | { photoId: string; status: "complete"; verdict: UsabilityVerdict; issueCodes: string[] } | null>(null);
  const [humanAccepted, setHumanAccepted] = useState(false);

  const loadVisit = useCallback(async (visitId: string) => {
    const response = await fetch(`/api/guided-site-visits/${encodeURIComponent(visitId)}`, { cache: "no-store" });
    const body = await response.json() as { success?: boolean; error?: string; visit?: Record<string, unknown> };
    if (!response.ok || !body.visit) throw new Error(body.error ?? "Site visit could not be loaded.");
    setVisit(normalizeVisit(body.visit));
  }, []);

  async function start() {
    if (!permission || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/estimates/${encodeURIComponent(estimateId)}/guided-site-visits`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordingPermissionAcknowledged: true }) });
      const body = await response.json() as { success?: boolean; error?: string; visitId?: string };
      if (!response.ok || !body.visitId) throw new Error(body.error ?? "Site visit could not be started.");
      window.sessionStorage.setItem(`guided-deck-visit:${estimateId}`, body.visitId);
      await loadVisit(body.visitId);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Site visit could not be started."); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    const visitId = window.sessionStorage.getItem(`guided-deck-visit:${estimateId}`);
    if (!visitId) return;
    setBusy(true);
    void loadVisit(visitId).catch(() => window.sessionStorage.removeItem(`guided-deck-visit:${estimateId}`)).finally(() => setBusy(false));
  }, [estimateId, loadVisit]);
  useEffect(() => () => { if (localPhoto) URL.revokeObjectURL(localPhoto); }, [localPhoto]);

  const current = visit?.items.find((item) => item.state === "pending") ?? null;
  const attempts = current && visit ? visit.photoAttempts.filter((photo) => photo.visitItemId === current.id) : [];
  const storedPhoto = [...attempts].reverse().find((photo) => photo.state === "confirmed") ?? null;
  const incompletePhoto = [...attempts].reverse().find((photo) => photo.state === "upload_pending") ?? null;
  const activePhotoId = pendingPhoto?.id ?? storedPhoto?.id ?? null;
  const storedReview = latestUsabilityReview(storedPhoto?.usabilityReviews ?? []);
  const review = localReview?.photoId === activePhotoId ? localReview : storedReview ? { photoId: storedPhoto!.id, status: "complete" as const, verdict: storedReview.verdict, issueCodes: storedReview.issueCodes } : activePhotoId ? { photoId: activePhotoId, status: "complete" as const, verdict: "unable_to_assess" as const, issueCodes: [] } : null;
  const terminalCount = visit?.items.filter((item) => item.state !== "pending").length ?? 0;
  const blockedCount = visit?.items.filter((item) => item.state === "documented_follow_up").length ?? 0;
  const fieldNames = current?.requirement.fields ?? [];
  const requiresFields = current?.requirement.mode === "required_measurements" || current?.requirement.mode === "conditional" && condition === "yes";
  const reviewPhotoReady = Boolean(activePhotoId)
  const requirementSatisfied = reviewPhotoReady && humanAccepted
    && (current?.requirement.mode !== "conditional" || condition !== "")
    && (!requiresFields || fieldNames.every((field) => measurements[field]?.value.trim() && measurements[field]?.unit.trim()));

  async function uploadPhoto(file: File) {
    if (!visit || !current || busy) return;
    setBusy(true); setError(""); setProgress(0); setHumanAccepted(false); setLocalReview(null);
    try {
      if (!file.type.startsWith("image/")) throw new Error("Choose a supported image file.");
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      let expectedRevision = pendingPhoto?.revision ?? visit.revision;
      if (incompletePhoto) {
        const abandoned = await jsonRequest(`/api/guided-site-visits/${visit.id}/photos/${incompletePhoto.id}/abandon`, "POST", { expectedRevision });
        if (typeof abandoned.nextRevision !== "number") throw new Error("Incomplete photo recovery response was invalid.");
        expectedRevision = abandoned.nextRevision;
      }
      const reserve = await jsonRequest(`/api/guided-site-visits/${visit.id}/items/${current.id}/photos/upload-session`, "POST", { expectedRevision, originalFilename: file.name || `deck-capture-${current.ordinal}.jpg`, mimeType: file.type, byteSize: file.size, sha256, retakeOfAttemptId: pendingPhoto?.id ?? storedPhoto?.id ?? null });
      const upload = reserve.upload as { signedUrl?: string; requiredMimeType?: string };
      if (!upload?.signedUrl || typeof reserve.attemptId !== "string" || typeof reserve.nextRevision !== "number") throw new Error("Private upload session was incomplete.");
      await uploadWithProgress(upload.signedUrl, file, setProgress);
      if (localPhoto) URL.revokeObjectURL(localPhoto);
      setLocalPhoto(URL.createObjectURL(file));
      const completed = await jsonRequest(`/api/guided-site-visits/${visit.id}/photos/${reserve.attemptId}/complete`, "POST", { expectedRevision: reserve.nextRevision });
      if (typeof completed.nextRevision !== "number") throw new Error("Photo confirmation response was incomplete.");
      setPendingPhoto({ id: reserve.attemptId, revision: completed.nextRevision });
      setLocalReview({ photoId: reserve.attemptId, status: "reviewing" });
      await reviewPhoto(reserve.attemptId, initialReviewKey(reserve.attemptId));
    } catch (requestError) { try { await loadVisit(visit.id); } catch {} setError(requestError instanceof Error ? requestError.message : "Photo upload failed. Retry this capture."); }
    finally { setBusy(false); setProgress(null); }
  }

  async function reviewPhoto(photoId: string, idempotencyKey: string) {
    if (!visit) return;
    setLocalReview({ photoId, status: "reviewing" }); setError("");
    try {
      const result = await jsonRequest(`/api/guided-site-visits/${visit.id}/photos/${photoId}/usability-reviews`, "POST", { idempotencyKey });
      if (!isUsabilityVerdict(result.verdict) || !Array.isArray(result.issueCodes)) throw new Error("Photo review response was incomplete.");
      setLocalReview({ photoId, status: "complete", verdict: result.verdict, issueCodes: result.issueCodes.filter((code): code is string => typeof code === "string") });
    } catch {
      setLocalReview({ photoId, status: "complete", verdict: "unable_to_assess", issueCodes: [] });
    }
  }

  async function confirmItem() {
    if (!visit || !current || !requirementSatisfied || busy) return;
    setBusy(true); setError("");
    try {
      const expectedRevision = pendingPhoto?.revision ?? visit.revision;
      const observation = current.requirement.mode === "photo_only" ? {}
        : current.requirement.mode === "required_measurements" ? { measurements }
        : condition === "yes" ? { conditionStatus: "applies", measurements }
        : { conditionStatus: "not_applicable", ...(current.requirement.otherwise ? { confirmation: current.requirement.otherwise } : {}) };
      await jsonRequest(`/api/guided-site-visits/${visit.id}/items/${current.id}`, "PATCH", { expectedRevision, action: "confirm", observation });
      setMeasurements({}); setCondition(""); if (localPhoto) URL.revokeObjectURL(localPhoto); setLocalPhoto(null); setPendingPhoto(null); setLocalReview(null); setHumanAccepted(false); setBlockOpen(false);
      await loadVisit(visit.id);
    } catch (requestError) { try { await loadVisit(visit.id); } catch {} setError(requestError instanceof Error ? requestError.message : "Capture could not be confirmed."); }
    finally { setBusy(false); }
  }

  async function blockItem() {
    if (!visit || !current || !blockReason || !blockNotes.trim() || busy) return;
    setBusy(true); setError("");
    try {
      await jsonRequest(`/api/guided-site-visits/${visit.id}/items/${current.id}`, "PATCH", { expectedRevision: pendingPhoto?.revision ?? visit.revision, action: "document_follow_up", observation: {}, followUpReasonCode: blockReason, followUpNotes: blockNotes.trim() });
      setBlockReason(""); setBlockNotes(""); setBlockOpen(false); setMeasurements({}); setCondition(""); if (localPhoto) URL.revokeObjectURL(localPhoto); setLocalPhoto(null); setPendingPhoto(null); setLocalReview(null); setHumanAccepted(false);
      await loadVisit(visit.id);
    } catch (requestError) { try { await loadVisit(visit.id); } catch {} setError(requestError instanceof Error ? requestError.message : "Blocked reason could not be saved."); }
    finally { setBusy(false); }
  }

  async function completeVisit() {
    if (!visit || current || busy) return;
    setBusy(true); setError("");
    try { await jsonRequest(`/api/guided-site-visits/${visit.id}/complete`, "POST", { expectedRevision: visit.revision }); await loadVisit(visit.id); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Visit could not be completed."); }
    finally { setBusy(false); }
  }

  if (!visit) return <section id="deck-field-visit" className="overflow-hidden rounded-xl border-2 border-amber-500 bg-white shadow-sm">
    <BetaWarning />
    <div className="p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-amber-800">Deck guided site visit</p><h2 className="mt-1 text-2xl font-bold">Capture everything in one trip</h2><p className="mt-2 text-sm leading-6 text-slate-600">Nine required views, shown one at a time. Each photo requires your confirmation or a documented office follow-up reason.</p>
      <label className="mt-5 flex items-start gap-3 rounded-lg border border-slate-300 p-4 text-sm font-semibold"><input type="checkbox" className="mt-1 h-5 w-5" checked={permission} onChange={(event) => setPermission(event.target.checked)} />I have permission to capture and privately store jobsite photos for this estimate.</label>
      {error ? <ErrorMessage message={error} /> : null}<button type="button" onClick={() => void start()} disabled={!permission || busy} className={`mt-5 ${primary}`}>{busy ? "Opening visit…" : "Start or resume Deck visit"}</button>
    </div>
  </section>;

  if (visit.status === "completed") return <section id="deck-field-visit" className="overflow-hidden rounded-xl border-2 border-emerald-600 bg-white"><BetaWarning /><div className="p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-700">Visit submitted</p><h2 className="mt-2 text-2xl font-bold">{visit.completionOutcome === "all_passed" ? "Site visit documented: all 9 captures passed." : `Site visit documented with ${blockedCount} blocked ${blockedCount === 1 ? "capture" : "captures"}.`}</h2>{blockedCount ? <p className="mt-2 font-semibold text-amber-800">Office follow-up is required.</p> : null}<VisitSummary visit={visit} /></div></section>;

  if (!current) return <section id="deck-field-visit" className="overflow-hidden rounded-xl border-2 border-amber-500 bg-white"><BetaWarning /><div className="p-5 sm:p-6"><h2 className="text-2xl font-bold">All 9 capture items are documented</h2><p className="mt-2 text-sm text-slate-600">{blockedCount ? `${blockedCount} blocked capture${blockedCount === 1 ? " requires" : "s require"} office follow-up.` : "Every required capture passed human confirmation."}</p><VisitSummary visit={visit} /><button type="button" disabled={busy} onClick={() => void completeVisit()} className={`mt-5 ${primary}`}>{blockedCount ? "Submit documented visit with follow-up required" : "Finish site visit"}</button>{error ? <ErrorMessage message={error} /> : null}</div></section>;

  return <section id="deck-field-visit" className="overflow-hidden rounded-xl border-2 border-amber-500 bg-white shadow-sm">
    <BetaWarning />
    <div className="border-b border-slate-200 p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><p className="text-sm font-black">Capture {current.ordinal} of 9</p><p className="text-xs font-bold text-slate-600">{terminalCount} documented · {blockedCount} blocked</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-700" style={{ width: `${terminalCount / 9 * 100}%` }} /></div></div>
    <div className="p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-amber-800">Required capture</p><h2 className="mt-1 text-2xl font-bold">{current.title}</h2><p className="mt-2 text-sm leading-6 text-slate-700">{current.instructions}</p>
      <div className="mt-4 rounded-lg bg-slate-50 p-4"><p className="text-sm font-bold">Include in the photo</p><ul className="mt-2 space-y-2 text-sm text-slate-700">{(INCLUDE[current.itemKey] ?? []).map((criterion) => <li key={criterion}>✓ {criterion}</li>)}</ul></div>
      {/* Blob previews are local-only and cannot use the Next image optimizer. */}
      {localPhoto ? <img src={localPhoto} alt={`Current ${current.title} capture`} className="mt-4 max-h-96 w-full rounded-lg border border-slate-300 object-contain" /> : null} {/* eslint-disable-line @next/next/no-img-element */}
      {!reviewPhotoReady ? <PhotoSourceControls title="Add photo" busy={busy} uploadPhoto={uploadPhoto} busyLabel={progress === null ? "Preparing private upload…" : `Uploading ${progress}%…`} /> : null}
      {reviewPhotoReady ? <PhotoReviewStatus review={review} busy={busy} onAccept={() => setHumanAccepted(true)} onRetry={() => activePhotoId && void reviewPhoto(activePhotoId, initialReviewKey(activePhotoId))} onRetake={() => setHumanAccepted(false)} uploadPhoto={uploadPhoto} /> : null}
      {humanAccepted ? <><div role="status" className="mt-4 rounded-lg border border-blue-300 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><strong>Your check is required.</strong> The photo review is only a visibility check. Confirm the requested area yourself; all measurements must come from the field.</div><ManualConfirmation current={current} condition={condition} setCondition={setCondition} measurements={measurements} setMeasurements={setMeasurements} /></> : null}
      {progress !== null ? <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-blue-700" style={{ width: `${progress}%` }} /></div> : null}
      {error ? <ErrorMessage message={error} /> : null}
      {humanAccepted ? <div className="mt-5"><button type="button" disabled={!requirementSatisfied || busy} onClick={() => void confirmItem()} className={primary}>I confirm this capture</button></div> : null}
      <button type="button" disabled={busy} onClick={() => setBlockOpen(!blockOpen)} className="mt-4 text-sm font-bold text-amber-900 underline">Cannot capture this</button>
      {blockOpen ? <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4"><p className="font-bold text-amber-950">Document office follow-up</p><p className="mt-1 text-sm text-amber-900">This item will remain blocked. Record why it could not be completed.</p><label className="mt-3 block text-sm font-bold">Reason<select className={input} value={blockReason} onChange={(event) => setBlockReason(event.target.value)}><option value="">Choose reason</option>{BLOCK_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="mt-3 block text-sm font-bold">What the office needs to know<textarea className={`${input} min-h-24`} value={blockNotes} onChange={(event) => setBlockNotes(event.target.value)} /></label><button type="button" disabled={!blockReason || !blockNotes.trim() || busy} onClick={() => void blockItem()} className={`mt-4 ${primary}`}>Save blocked reason</button></div> : null}
    </div>
  </section>;
}

function PhotoReviewStatus({ review, busy, onAccept, onRetry, onRetake, uploadPhoto }: { review: { status: "reviewing" } | { status: "complete"; verdict: UsabilityVerdict; issueCodes: string[] } | null; busy: boolean; onAccept: () => void; onRetry: () => void; onRetake: () => void; uploadPhoto: (file: File) => Promise<void> }) {
  if (!review || review.status === "reviewing") return <div role="status" className="mt-4 rounded-lg border border-blue-300 bg-blue-50 p-4 text-blue-950"><p className="font-bold">Reviewing photo…</p><p className="mt-1 text-sm">Checking whether the requested area is clear enough to inspect.</p></div>;
  if (review.verdict === "usable") return <div role="status" className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-950"><p className="text-lg font-bold">Good</p><p className="mt-1 text-sm">The requested area appears clear enough to inspect. You still need to verify it.</p><button type="button" disabled={busy} onClick={onAccept} className={`mt-4 ${primary}`}>Use this photo</button><PhotoSourceControls title="Retake photo" busy={busy} uploadPhoto={uploadPhoto} onSelect={onRetake} /></div>;
  if (review.verdict === "retake_recommended") return <div role="status" className="mt-4 rounded-lg border border-amber-400 bg-amber-50 p-4 text-amber-950"><p className="text-lg font-bold">Retake recommended</p><p className="mt-1 text-sm">{REVIEW_REASONS[review.issueCodes[0]] ?? "The requested area is not clear enough to check."}</p><PhotoSourceControls title="Retake photo" busy={busy} uploadPhoto={uploadPhoto} onSelect={onRetake} cameraPrimary /><button type="button" disabled={busy} onClick={onAccept} className={`mt-3 ${secondary}`}>Use anyway — I checked it</button></div>;
  return <div role="status" className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-4 text-slate-950"><p className="text-lg font-bold">Couldn’t review</p><p className="mt-1 text-sm">{REVIEW_REASONS[review.issueCodes[0]] ?? "The automatic check did not finish. You can retry, retake the photo, or inspect it yourself."}</p><button type="button" disabled={busy} onClick={onRetry} className={`mt-4 ${primary}`}>Retry review</button><PhotoSourceControls title="Retake photo" busy={busy} uploadPhoto={uploadPhoto} onSelect={onRetake} /><button type="button" disabled={busy} onClick={onAccept} className={`mt-3 ${secondary}`}>Review photo myself</button></div>;
}

function PhotoSourceControls({ title, busy, uploadPhoto, onSelect, cameraPrimary = true, busyLabel }: { title: string; busy: boolean; uploadPhoto: (file: File) => Promise<void>; onSelect?: () => void; cameraPrimary?: boolean; busyLabel?: string }) {
  const choose = (file: File | undefined) => { if (file) { onSelect?.(); void uploadPhoto(file); } };
  const busyStyle = busy ? "cursor-not-allowed opacity-50" : "cursor-pointer";
  return <fieldset disabled={busy} aria-busy={busy} className="mt-4"><legend className="text-sm font-bold">{title}</legend>{busy ? <p role="status" className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">{busyLabel ?? "Uploading photo…"} Photo choices are unavailable until this finishes.</p> : null}<div className="mt-2 flex flex-col gap-3 sm:flex-row"><label className={`${cameraPrimary ? primary : secondary} ${busyStyle} text-center`}><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" className="sr-only" disabled={busy} onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ""; }} />Take photo</label><label className={`${secondary} ${busyStyle} text-center`}><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" disabled={busy} onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ""; }} />Choose existing photo</label></div></fieldset>;
}

function ManualConfirmation({ current, condition, setCondition, measurements, setMeasurements }: { current: VisitItem; condition: string; setCondition: (value: "yes" | "no" | "") => void; measurements: Record<string, { value: string; unit: string }>; setMeasurements: (value: Record<string, { value: string; unit: string }>) => void }) {
  const conditional = current.requirement.mode === "conditional";
  const showFields = current.requirement.mode === "required_measurements" || conditional && condition === "yes";
  return <div className="mt-4 rounded-lg border border-slate-300 p-4"><h3 className="font-bold">Check photo and field facts</h3>{conditional ? <fieldset className="mt-3"><legend className="text-sm font-bold">{CONDITIONS[current.requirement.when ?? ""]?.prompt ?? "Does this condition apply?"}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{(["yes", "no"] as const).map((value) => <label key={value} className="flex items-center gap-2 rounded-lg border border-slate-300 p-3 text-sm font-semibold"><input type="radio" name={`condition-${current.id}`} checked={condition === value} onChange={() => setCondition(value)} />{value === "yes" ? CONDITIONS[current.requirement.when ?? ""]?.yes ?? "Yes" : CONDITIONS[current.requirement.when ?? ""]?.no ?? "No"}</label>)}</div></fieldset> : null}{showFields ? <div className="mt-4 grid gap-4">{(current.requirement.fields ?? []).map((field) => <fieldset key={field}><legend className="text-sm font-bold">{FIELD_LABELS[field] ?? field}</legend><div className="grid grid-cols-[1fr_7rem] gap-2"><input aria-label={`${FIELD_LABELS[field] ?? field} value`} inputMode="decimal" className={input} value={measurements[field]?.value ?? ""} onChange={(event) => setMeasurements({ ...measurements, [field]: { value: event.target.value, unit: measurements[field]?.unit ?? "" } })} placeholder="Value" /><input aria-label={`${FIELD_LABELS[field] ?? field} unit`} className={input} value={measurements[field]?.unit ?? ""} onChange={(event) => setMeasurements({ ...measurements, [field]: { value: measurements[field]?.value ?? "", unit: event.target.value } })} placeholder="Unit" /></div><span className="mt-1 block text-xs text-slate-500">Enter a field measurement and its unit.</span></fieldset>)}</div> : null}</div>;
}

function VisitSummary({ visit }: { visit: Visit }) { return <ol className="mt-5 divide-y divide-slate-200 rounded-lg border border-slate-200">{visit.items.map((item) => { const measurementCount = item.observation?.measurements && typeof item.observation.measurements === "object" ? Object.keys(item.observation.measurements).length : 0; return <li key={item.id} className="p-3 text-sm"><div className="flex items-center gap-3"><span className="font-bold">{item.ordinal}</span><span className="min-w-0 flex-1 font-semibold">{item.title}</span><span className={`rounded-full px-2 py-1 text-xs font-bold ${item.state === "confirmed" ? "bg-emerald-100 text-emerald-900" : item.state === "documented_follow_up" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{item.state === "confirmed" ? "Passed" : item.state === "documented_follow_up" ? "Blocked" : "Incomplete"}</span></div>{measurementCount ? <p className="mt-1 pl-7 text-xs text-slate-600">{measurementCount} field {measurementCount === 1 ? "measurement" : "measurements"} recorded</p> : null}{item.state === "documented_follow_up" ? <p className="mt-1 pl-7 text-xs font-semibold text-amber-900">{blockReasonLabel(item.followUpReasonCode)}: {item.followUpNotes}</p> : null}</li>; })}</ol>; }
function BetaWarning() { return <div role="alert" className="border-b-2 border-amber-500 bg-amber-100 p-4 text-sm leading-6 text-amber-950"><strong className="block uppercase tracking-[.14em]">Field beta limitations</strong>Photos document visible conditions only. No automatic engineering, code, load, material, labor, measurement, or pricing decision is made. Michael must verify every field fact.</div>; }
function ErrorMessage({ message }: { message: string }) { return <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800">{message} Retry or document why this capture is blocked.</p>; }
function blockReasonLabel(value: string | null) { return BLOCK_REASONS.find(([key]) => key === value)?.[1] ?? "Office follow-up"; }
function isUsabilityVerdict(value: unknown): value is UsabilityVerdict { return value === "usable" || value === "retake_recommended" || value === "unable_to_assess"; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []; }
function initialReviewKey(photoId: string) { return `guided-photo-usability:${photoId}:initial`; }
function latestUsabilityReview(reviews: UsabilityReview[]) { return reviews.reduce<UsabilityReview | null>((latest, review) => !latest || review.createdAt > latest.createdAt || review.createdAt === latest.createdAt && review.id > latest.id ? review : latest, null); }

async function jsonRequest(path: string, method: "POST" | "PATCH", body: Record<string, unknown>) { const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json() as Record<string, unknown>; if (!response.ok || result.success !== true) throw new Error(typeof result.error === "string" ? result.error : `Request failed (${String(result.resultCode ?? response.status)}). Reload and retry.`); return result; }
function uploadWithProgress(url: string, file: File, onProgress: (value: number) => void) { return new Promise<void>((resolve, reject) => { const request = new XMLHttpRequest(); const body = new FormData(); body.append("cacheControl", "3600"); body.append("", file); request.open("PUT", url); request.setRequestHeader("x-upsert", "false"); request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); }; request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error("Private photo upload failed.")); request.onerror = () => reject(new Error("Network error during private photo upload.")); request.send(body); }); }
function normalizeVisit(raw: Record<string, unknown>): Visit { const rawItems = raw.items as Record<string, unknown>[] ?? []; const items = rawItems.map((item) => ({ id: String(item.id), itemKey: String(item.itemKey ?? item.item_key), ordinal: Number(item.ordinal), title: String(item.title), instructions: String(item.instructions), requirement: item.requirement as Requirement, state: String(item.state) as VisitItem["state"], observation: item.observation as Record<string, unknown> ?? {}, followUpReasonCode: (item.followUpReasonCode ?? item.follow_up_reason_code ?? null) as string | null, followUpNotes: (item.followUpNotes ?? item.follow_up_notes ?? null) as string | null })); const visitPhotos = (raw.photoAttempts ?? raw.photo_attempts ?? []) as Record<string, unknown>[]; const itemPhotos = rawItems.flatMap((item) => (item.photoAttempts ?? item.photo_attempts ?? []) as Record<string, unknown>[]); const photoAttempts = visitPhotos.length ? visitPhotos : itemPhotos; return { id: String(raw.id), revision: Number(raw.revision), status: String(raw.status) as Visit["status"], completionOutcome: (raw.completionOutcome ?? raw.completion_outcome ?? null) as Visit["completionOutcome"], items, photoAttempts: photoAttempts.map((photo) => { const reviews = (photo.usabilityReviews ?? photo.usability_reviews ?? []) as Record<string, unknown>[]; return { id: String(photo.id), visitItemId: String(photo.visitItemId ?? photo.visit_item_id), retakeOfAttemptId: (photo.retakeOfAttemptId ?? photo.retake_of_attempt_id ?? null) as string | null, ordinal: Number(photo.ordinal), state: String(photo.state) as PhotoAttempt["state"], usabilityReviews: reviews.flatMap((review) => isUsabilityVerdict(review.verdict) ? [{ id: String(review.id), verdict: review.verdict, issueCodes: stringArray(review.issueCodes ?? review.issue_codes), createdAt: String(review.createdAt ?? review.created_at ?? "") }] : []) }; }) }; }
