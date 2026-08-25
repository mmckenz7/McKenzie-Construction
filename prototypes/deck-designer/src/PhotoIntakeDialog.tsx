import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import type { HouseAttachment } from "./model";
import { normalizeConfirmedPhotoFacts, reviewConfirmedPhotoFacts, reviewPhotoCoverage, type ConfirmedPhotoFacts, type GuidedPhotoRole, type PhotoIntakeReview } from "./photoIntake";
export { createDesignFromConfirmedPhotoFacts } from "./photoIntake";
import { isRectangleTrace, PhotoOutlineTracer, rectangleTrace, validatePhotoTrace } from "./PhotoOutlineTracer";
import { deriveGeometricPolygonEdges, type PolygonPoint } from "./polygon";
import { resolvePhotoTraceEnvelopeCommit, samePhotoTraceEnvelope, validPhotoTraceEnvelope, type PhotoTraceEnvelope } from "./photoTraceEnvelope";

type LocalPhoto = Readonly<{ name: string; url: string }>;
type Props = Readonly<{
  initialFacts: ConfirmedPhotoFacts;
  fallbackSurfaceElevation: number;
  gradeElevation: number;
  onCancel: () => void;
  onStartDesign: (facts: ConfirmedPhotoFacts, review: PhotoIntakeReview, photoCount: number, confirmedOuter?: readonly PolygonPoint[], stairEdgeId?: string | null, stairOffset?: number | null, stairWidth?: number) => void;
}>;

const PHOTO_SLOTS: readonly Readonly<{ role: GuidedPhotoRole; title: string; help: string }>[] = [
  { role: "wide-site", title: "Wide site", help: "Show the house wall and the full work area." },
  { role: "house-connection", title: "House connection", help: "Show where the deck meets—or will meet—the house." },
  { role: "left-corner", title: "Left corner", help: "Capture every turn and offset along the left side." },
  { role: "right-corner", title: "Right corner", help: "Capture every turn and offset along the right side." },
  { role: "stairs-grade", title: "Stairs and grade", help: "Show the stair location and ground-height changes." },
  { role: "elevated-overview", title: "Elevated overview", help: "From a doorway or safe higher view, show the deck outline." },
];

const ROLE_LABELS: Readonly<Record<GuidedPhotoRole, string>> = Object.freeze(Object.fromEntries(PHOTO_SLOTS.map((slot) => [slot.role, slot.title])) as Record<GuidedPhotoRole, string>);

const feet = (inches: number): string => String(Math.round(inches / 12 * 100) / 100);
const parseFeet = (value: string): number => Number(value) * 12;
const parseOptionalFeet = (value: string): number | null => value.trim() ? parseFeet(value) : null;

export function PhotoIntake({ initialFacts, fallbackSurfaceElevation, gradeElevation, onCancel, onStartDesign }: Props) {
  const [photos, setPhotos] = useState<Partial<Record<GuidedPhotoRole, LocalPhoto>>>({});
  const [additionalPhotos, setAdditionalPhotos] = useState<readonly LocalPhoto[]>([]);
  const urls = useRef(new Set<string>());
  const [designName, setDesignName] = useState(initialFacts.designName);
  const [layoutIntent, setLayoutIntent] = useState<ConfirmedPhotoFacts["layoutIntent"]>(initialFacts.layoutIntent);
  const [width, setWidth] = useState(feet(initialFacts.width));
  const [projection, setProjection] = useState(feet(initialFacts.projection));
  const [surfaceElevation, setSurfaceElevation] = useState(initialFacts.surfaceElevation === null ? "" : feet(initialFacts.surfaceElevation));
  const [levelCount, setLevelCount] = useState(1 + (initialFacts.additionalLevelElevations?.length ?? 0));
  const [additionalLevelHeights, setAdditionalLevelHeights] = useState<readonly string[]>(() => (initialFacts.additionalLevelElevations ?? []).map(feet));
  const [doorWidth, setDoorWidth] = useState(initialFacts.doorWidth === null ? "" : feet(initialFacts.doorWidth));
  const [attachment, setAttachment] = useState<HouseAttachment>(initialFacts.attachment);
  const [traceOuter, setTraceOuter] = useState<readonly PolygonPoint[]>(() => rectangleTrace(initialFacts.width, initialFacts.projection));
  const [traceStairEdgeId, setTraceStairEdgeId] = useState<string | null>(null);
  const [traceStairOffset, setTraceStairOffset] = useState<number | null>(null);
  const [traceStairWidth, setTraceStairWidth] = useState(48);
  const [traceEnvelope, setTraceEnvelope] = useState<PhotoTraceEnvelope>(() => Object.freeze({ width: initialFacts.width, projection: initialFacts.projection }));
  const [pendingEnvelope, setPendingEnvelope] = useState<PhotoTraceEnvelope | null>(null);
  const [traceResetKey, setTraceResetKey] = useState(0);
  const dimensionEditStart = useRef<Readonly<{ width: string; projection: string }> | null>(null);
  const dimensionCancelPending = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => () => { for (const url of urls.current) URL.revokeObjectURL(url); }, []);

  const draft = useMemo<ConfirmedPhotoFacts>(() => ({
    designName,
    layoutIntent,
    width: parseFeet(width),
    projection: parseFeet(projection),
    surfaceElevation: parseOptionalFeet(surfaceElevation),
    doorWidth: doorWidth.trim() ? parseFeet(doorWidth) : null,
    attachment,
    additionalLevelElevations: additionalLevelHeights.slice(0, levelCount - 1).map((value) => value.trim() ? parseFeet(value) : Number.NaN),
  }), [additionalLevelHeights, attachment, designName, doorWidth, layoutIntent, levelCount, projection, surfaceElevation, width]);
  let review: PhotoIntakeReview | null = null;
  try { review = reviewConfirmedPhotoFacts(draft); } catch { /* show validation only when submitted */ }
  const guidedRoles = Object.keys(photos) as GuidedPhotoRole[];
  const coverage = reviewPhotoCoverage(layoutIntent, guidedRoles, additionalPhotos.length);
  const numericWidth = parseFeet(width);
  const numericProjection = parseFeet(projection);
  const draftEnvelope = validPhotoTraceEnvelope(numericWidth, numericProjection);
  const envelopeMatchesDraft = Boolean(draftEnvelope && samePhotoTraceEnvelope(traceEnvelope, draftEnvelope));
  const allPhotos = [...Object.values(photos), ...additionalPhotos].filter((photo): photo is LocalPhoto => Boolean(photo));
  const traced = layoutIntent === "non-standard" && !isRectangleTrace(traceOuter, traceEnvelope.width, traceEnvelope.projection);

  useEffect(() => {
    if (traceStairEdgeId && !deriveGeometricPolygonEdges(traceOuter).some((edge) => edge.id === traceStairEdgeId)) { setTraceStairEdgeId(null); setTraceStairOffset(null); }
  }, [traceOuter, traceStairEdgeId]);

  const applyEnvelope = (next: PhotoTraceEnvelope) => {
    setTraceEnvelope(next);
    setTraceOuter(rectangleTrace(next.width, next.projection));
    setTraceStairEdgeId(null);
    setTraceStairOffset(null);
    setPendingEnvelope(null);
    setTraceResetKey((current) => current + 1);
    setError("");
  };
  const commitEnvelopeDraft = () => {
    const resolution = resolvePhotoTraceEnvelopeCommit(traceEnvelope, draftEnvelope, traceOuter, traceStairEdgeId);
    if (resolution.kind === "auto-resize") applyEnvelope(resolution.envelope);
    else if (resolution.kind === "stage") setPendingEnvelope(resolution.envelope);
    else if (resolution.kind === "unchanged") setPendingEnvelope(null);
  };
  const beginDimensionEdit = () => { if (!dimensionEditStart.current) dimensionEditStart.current = Object.freeze({ width, projection }); };
  const finishDimensionEdit = (event: FocusEvent<HTMLInputElement>) => {
    if (dimensionCancelPending.current) { dimensionCancelPending.current = false; return; }
    if (event.relatedTarget instanceof HTMLElement && event.relatedTarget.dataset.photoEnvelopeField === "true") return;
    dimensionEditStart.current = null;
    commitEnvelopeDraft();
  };
  const cancelDimensionEdit = () => {
    const start = dimensionEditStart.current;
    dimensionEditStart.current = null;
    if (!start) return;
    dimensionCancelPending.current = true;
    setWidth(start.width);
    setProjection(start.projection);
  };
  const dimensionKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
    if (event.key === "Escape") { event.preventDefault(); cancelDimensionEdit(); event.currentTarget.blur(); }
  };
  const keepCurrentOutline = () => {
    setWidth(feet(traceEnvelope.width));
    setProjection(feet(traceEnvelope.projection));
    setPendingEnvelope(null);
    setError("");
  };

  const choosePhoto = (role: GuidedPhotoRole, file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) {
      setError("Choose a JPG, PNG, or WebP image no larger than 20 MB.");
      return;
    }
    const previous = photos[role];
    if (previous) { URL.revokeObjectURL(previous.url); urls.current.delete(previous.url); }
    const url = URL.createObjectURL(file);
    urls.current.add(url);
    setPhotos((current) => ({ ...current, [role]: Object.freeze({ name: file.name, url }) }));
    setError("");
  };
  const removePhoto = (role: GuidedPhotoRole) => {
    const previous = photos[role];
    if (previous) { URL.revokeObjectURL(previous.url); urls.current.delete(previous.url); }
    setPhotos((current) => { const next = { ...current }; delete next[role]; return next; });
  };
  const chooseAdditionalPhotos = (files: FileList | null) => {
    if (!files?.length) return;
    const chosen = Array.from(files);
    if (chosen.some((file) => !file.type.startsWith("image/") || file.size > 20 * 1024 * 1024)) {
      setError("Choose JPG, PNG, or WebP images no larger than 20 MB each.");
      return;
    }
    const remaining = 6 - additionalPhotos.length;
    if (remaining <= 0) { setError("Remove an additional photo before adding another."); return; }
    const nextPhotos = chosen.slice(0, remaining).map((file) => {
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      return Object.freeze({ name: file.name, url });
    });
    setAdditionalPhotos((current) => Object.freeze([...current, ...nextPhotos]));
    setError(chosen.length > remaining ? `Added ${remaining} photos; the additional-angle limit is six.` : "");
  };
  const removeAdditionalPhoto = (url: string) => {
    URL.revokeObjectURL(url);
    urls.current.delete(url);
    setAdditionalPhotos((current) => Object.freeze(current.filter((photo) => photo.url !== url)));
  };
  const start = () => {
    try {
      if (!envelopeMatchesDraft || pendingEnvelope) throw new RangeError("Apply the pending overall size or keep the current outline before starting.");
      const normalized = normalizeConfirmedPhotoFacts(draft);
      const confirmedOuter = normalized.layoutIntent === "non-standard" ? validatePhotoTrace(traceOuter) : undefined;
      if (normalized.layoutIntent === "non-standard" && (!confirmedOuter || isRectangleTrace(confirmedOuter, normalized.width, normalized.projection))) {
        throw new RangeError("Add and adjust at least one offset before starting a non-standard design.");
      }
      onStartDesign(normalized, reviewConfirmedPhotoFacts(normalized, Boolean(confirmedOuter)), coverage.addedCount, confirmedOuter, traceStairEdgeId, traceStairOffset, traceStairWidth);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Review the confirmed dimensions before starting.");
    }
  };

  return <div className="photo-intake-backdrop" role="presentation"><section className="photo-intake" role="dialog" aria-modal="true" aria-labelledby="photo-intake-title">
    <header><div><p className="eyebrow">Optional job-photo start</p><h2 id="photo-intake-title">Start with what you know</h2><p>Photos stay on this device. Only confirmed entries create the deck.</p></div><button className="photo-close" onClick={onCancel} aria-label="Close photo start">Close</button><nav className="photo-step-nav" aria-label="Photo design steps"><a href="#photo-step-photos">Photos</a><a href="#photo-step-details">Measurements</a><a href="#photo-step-review">Review</a>{layoutIntent === "non-standard" && <a href="#photo-step-outline">Outline</a>}</nav></header>
    <div className="photo-intake-content">
      <section id="photo-step-photos"><div className="photo-step"><span>1</span><div><strong>Add useful photos</strong><small>Any photo can be skipped or replaced.</small></div></div><label className="field photo-layout-intent"><span>Deck shape you expect</span><select value={layoutIntent} onChange={(event) => setLayoutIntent(event.target.value as ConfirmedPhotoFacts["layoutIntent"])}><option value="rectangle">Simple rectangle</option><option value="non-standard">Non-standard · offsets or multiple corners</option></select></label><div className="photo-slot-grid">{PHOTO_SLOTS.map((slot) => {
        const photo = photos[slot.role];
        return <article className="photo-slot" key={slot.role}>{photo ? <img src={photo.url} alt={`${slot.title} preview`} /> : <div className="photo-placeholder">Optional</div>}<strong>{slot.title}</strong><p>{slot.help}</p><div><label className="photo-file-button">{photo ? "Replace photo" : "Take or choose photo"}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => { choosePhoto(slot.role, event.target.files?.[0]); event.target.value = ""; }} /></label>{photo && <button onClick={() => removePhoto(slot.role)}>Remove</button>}</div>{photo && <small title={photo.name}>{photo.name}</small>}</article>;
      })}</div><div className="additional-photo-card"><div><strong>More angles</strong><p>Add up to six closeups, interior corners, lower framing views, or obstacles.</p></div><label className="photo-file-button">Add several photos<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => { chooseAdditionalPhotos(event.target.files); event.target.value = ""; }} /></label>{additionalPhotos.length > 0 && <div className="additional-photo-list">{additionalPhotos.map((photo) => <span key={photo.url}>{photo.name}<button aria-label={`Remove additional photo ${photo.name}`} onClick={() => removeAdditionalPhoto(photo.url)}>×</button></span>)}</div>}</div><div className={`photo-coverage${coverage.missingRecommendedRoles.length === 0 && coverage.addedCount > 0 ? " ready" : ""}`}><strong>{coverage.message}</strong>{coverage.missingRecommendedRoles.length > 0 && <small>Recommended next: {coverage.missingRecommendedRoles.map((role) => ROLE_LABELS[role]).join(", ")}.</small>}<small>This guidance never blocks manual design.</small></div><p className="photo-privacy">Local preview only—photos are not saved in design JSON, browser storage, or the repository.</p></section>
      <section id="photo-step-details"><div className="photo-step"><span>2</span><div><strong>Confirm the design facts</strong><small>Leave unknown details blank; they will be marked for field verification.</small></div></div><div className="photo-facts-grid">
        <label className="field full"><span>Design name</span><input value={designName} onChange={(event) => setDesignName(event.target.value)} /></label>
        <label className="field"><span>Deck width (feet)</span><input inputMode="decimal" type="number" min="4" step="0.25" data-photo-envelope-field="true" value={width} onFocus={beginDimensionEdit} onKeyDown={dimensionKeyDown} onBlur={finishDimensionEdit} onChange={(event) => setWidth(event.target.value)} /></label>
        <label className="field"><span>Distance from house (feet)</span><input inputMode="decimal" type="number" min="4" step="0.25" data-photo-envelope-field="true" value={projection} onFocus={beginDimensionEdit} onKeyDown={dimensionKeyDown} onBlur={finishDimensionEdit} onChange={(event) => setProjection(event.target.value)} /></label>
        {pendingEnvelope && <div className="photo-envelope-pending full" role="status"><div><strong>Overall size changed</strong><span>Current traced envelope: {feet(traceEnvelope.width)}′ × {feet(traceEnvelope.projection)}′</span><span>Pending envelope: {feet(pendingEnvelope.width)}′ × {feet(pendingEnvelope.projection)}′</span><small>Applying resets temporary corners, segments, stairs, and tracer Undo history. Your local reference photos stay in place.</small></div><div><button onClick={keepCurrentOutline}>Keep current outline</button><button className="danger" onClick={() => applyEnvelope(pendingEnvelope)}>Apply size and reset outline</button></div></div>}
        <label className="field"><span>Level 1 height above grade (feet)</span><input inputMode="decimal" type="number" min="0.5" max="30" step="0.25" placeholder="Unknown" value={surfaceElevation} onChange={(event) => setSurfaceElevation(event.target.value)} /></label>
        <label className="field"><span>How many deck levels?</span><select value={levelCount} onChange={(event) => { const count = Number(event.target.value); setLevelCount(count); setAdditionalLevelHeights((current) => Array.from({ length: count - 1 }, (_, index) => current[index] ?? "")); }}>{[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
        {Array.from({ length: levelCount - 1 }, (_, index) => <label className="field" key={index}><span>Level {index + 2} height above grade (feet)</span><input inputMode="decimal" type="number" min="0.5" max="30" step="0.25" placeholder="Enter measured height" value={additionalLevelHeights[index] ?? ""} onChange={(event) => setAdditionalLevelHeights((current) => Array.from({ length: levelCount - 1 }, (_, itemIndex) => itemIndex === index ? event.target.value : current[itemIndex] ?? ""))} /></label>)}
        <label className="field"><span>Door width (feet)</span><input inputMode="decimal" type="number" min="1" step="0.25" placeholder="Optional reference" value={doorWidth} onChange={(event) => setDoorWidth(event.target.value)} /></label>
        <label className="field full"><span>Connection to house</span><select value={attachment} onChange={(event) => setAttachment(event.target.value as HouseAttachment)}><option value="unknown">Unknown / field verify</option><option value="ledger">Ledger attached</option><option value="non-ledger">Freestanding / non-ledger</option></select></label>
      </div></section>
      <section id="photo-step-review"><div className="photo-step"><span>3</span><div><strong>Review before creating geometry</strong><small>No photo-derived measurement is applied automatically.</small></div></div>{review ? <div className="photo-review"><div><strong>Confirmed</strong>{review.confirmed.map((item) => <p key={item}>✓ {item}</p>)}</div><div><strong>Still verify</strong>{review.fieldVerification.map((item) => <p key={item}>• {item}</p>)}</div></div> : <p className="photo-review-error">Enter a valid deck width and distance from the house.</p>}</section>
      {layoutIntent === "non-standard" && <section id="photo-step-outline"><div className="photo-step"><span>4</span><div><strong>Trace and confirm the real outline</strong><small>Use the photos beside the measured plan. This step—not the photo pixels—creates geometry.</small></div></div><PhotoOutlineTracer key={`${traceEnvelope.width}:${traceEnvelope.projection}:${traceResetKey}`} width={traceEnvelope.width} projection={traceEnvelope.projection} photos={allPhotos} outer={traceOuter} stairEdgeId={traceStairEdgeId} stairOffset={traceStairOffset} stairWidth={traceStairWidth} surfaceElevation={draft.surfaceElevation ?? fallbackSurfaceElevation} gradeElevation={gradeElevation} onChange={setTraceOuter} onStairPlacementChange={(edgeId, offset) => { setTraceStairEdgeId(edgeId); setTraceStairOffset(offset); }} onStairWidthChange={setTraceStairWidth} onError={setError} /><div className={`trace-status${traced && !pendingEnvelope ? " ready" : ""}`} role="status"><strong>{pendingEnvelope ? "Overall size is waiting for your choice" : traced ? `Outline ready · ${traceOuter.length} confirmed corners${traceStairEdgeId ? " · stairs selected" : ""}` : "The outline is still a rectangle"}</strong><span>{pendingEnvelope ? "Apply the new size or keep the current outline before starting." : traced ? "Start the design when the corners match the job." : "Tap a non-house edge to add an offset, then drag its handles into position."}</span></div></section>}
    </div>
    <footer><div><strong>{coverage.addedCount} photo{coverage.addedCount === 1 ? "" : "s"} added</strong><small>{pendingEnvelope ? "Resolve the pending overall size before starting." : layoutIntent === "non-standard" ? "A changed outline is required before starting." : "You can start with zero photos and enter dimensions manually."}</small></div><div><button onClick={onCancel}>Keep current design</button><button className="primary" disabled={!envelopeMatchesDraft || Boolean(pendingEnvelope) || (layoutIntent === "non-standard" && !traced)} onClick={start}>{layoutIntent === "non-standard" ? "Start from confirmed outline" : "Start rectangle design"}</button></div></footer>
    {error && <p className="photo-error" role="alert">{error}</p>}
  </section></div>;
}
