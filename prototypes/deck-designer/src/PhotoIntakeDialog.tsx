import { useEffect, useMemo, useRef, useState } from "react";
import type { HouseAttachment } from "./model";
import { normalizeConfirmedPhotoFacts, reviewConfirmedPhotoFacts, reviewPhotoCoverage, type ConfirmedPhotoFacts, type GuidedPhotoRole, type PhotoIntakeReview } from "./photoIntake";
import { isRectangleTrace, PhotoOutlineTracer, rectangleTrace, validatePhotoTrace } from "./PhotoOutlineTracer";
import { deriveGeometricPolygonEdges, type PolygonPoint } from "./polygon";

type LocalPhoto = Readonly<{ name: string; url: string }>;
type Props = Readonly<{
  initialFacts: ConfirmedPhotoFacts;
  fallbackSurfaceElevation: number;
  gradeElevation: number;
  onCancel: () => void;
  onStartDesign: (facts: ConfirmedPhotoFacts, review: PhotoIntakeReview, photoCount: number, confirmedOuter?: readonly PolygonPoint[], stairEdgeId?: string | null, stairOffset?: number | null) => void;
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
const parseOptionalInches = (value: string): number | null => value.trim() ? Number(value) : null;

export function PhotoIntake({ initialFacts, fallbackSurfaceElevation, gradeElevation, onCancel, onStartDesign }: Props) {
  const [photos, setPhotos] = useState<Partial<Record<GuidedPhotoRole, LocalPhoto>>>({});
  const [additionalPhotos, setAdditionalPhotos] = useState<readonly LocalPhoto[]>([]);
  const urls = useRef(new Set<string>());
  const [designName, setDesignName] = useState(initialFacts.designName);
  const [layoutIntent, setLayoutIntent] = useState<ConfirmedPhotoFacts["layoutIntent"]>(initialFacts.layoutIntent);
  const [width, setWidth] = useState(feet(initialFacts.width));
  const [projection, setProjection] = useState(feet(initialFacts.projection));
  const [surfaceElevation, setSurfaceElevation] = useState(initialFacts.surfaceElevation === null ? "" : String(initialFacts.surfaceElevation));
  const [doorWidth, setDoorWidth] = useState(initialFacts.doorWidth === null ? "" : feet(initialFacts.doorWidth));
  const [attachment, setAttachment] = useState<HouseAttachment>(initialFacts.attachment);
  const [traceOuter, setTraceOuter] = useState<readonly PolygonPoint[]>(() => rectangleTrace(initialFacts.width, initialFacts.projection));
  const [traceStairEdgeId, setTraceStairEdgeId] = useState<string | null>(null);
  const [traceStairOffset, setTraceStairOffset] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => () => { for (const url of urls.current) URL.revokeObjectURL(url); }, []);

  const draft = useMemo<ConfirmedPhotoFacts>(() => ({
    designName,
    layoutIntent,
    width: parseFeet(width),
    projection: parseFeet(projection),
    surfaceElevation: parseOptionalInches(surfaceElevation),
    doorWidth: doorWidth.trim() ? parseFeet(doorWidth) : null,
    attachment,
  }), [attachment, designName, doorWidth, layoutIntent, projection, surfaceElevation, width]);
  let review: PhotoIntakeReview | null = null;
  try { review = reviewConfirmedPhotoFacts(draft); } catch { /* show validation only when submitted */ }
  const guidedRoles = Object.keys(photos) as GuidedPhotoRole[];
  const coverage = reviewPhotoCoverage(layoutIntent, guidedRoles, additionalPhotos.length);
  const numericWidth = parseFeet(width);
  const numericProjection = parseFeet(projection);
  const allPhotos = [...Object.values(photos), ...additionalPhotos].filter((photo): photo is LocalPhoto => Boolean(photo));
  const traced = layoutIntent === "non-standard" && Number.isFinite(numericWidth) && Number.isFinite(numericProjection) && !isRectangleTrace(traceOuter, numericWidth, numericProjection);

  useEffect(() => {
    if (Number.isFinite(numericWidth) && Number.isFinite(numericProjection) && numericWidth >= 48 && numericProjection >= 48) {
      setTraceOuter(rectangleTrace(numericWidth, numericProjection));
      setTraceStairEdgeId(null);
      setTraceStairOffset(null);
    }
  }, [numericProjection, numericWidth]);
  useEffect(() => {
    if (traceStairEdgeId && !deriveGeometricPolygonEdges(traceOuter).some((edge) => edge.id === traceStairEdgeId)) { setTraceStairEdgeId(null); setTraceStairOffset(null); }
  }, [traceOuter, traceStairEdgeId]);

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
      const normalized = normalizeConfirmedPhotoFacts(draft);
      const confirmedOuter = normalized.layoutIntent === "non-standard" ? validatePhotoTrace(traceOuter) : undefined;
      if (normalized.layoutIntent === "non-standard" && (!confirmedOuter || isRectangleTrace(confirmedOuter, normalized.width, normalized.projection))) {
        throw new RangeError("Add and adjust at least one offset before starting a non-standard design.");
      }
      onStartDesign(normalized, reviewConfirmedPhotoFacts(normalized, Boolean(confirmedOuter)), coverage.addedCount, confirmedOuter, traceStairEdgeId, traceStairOffset);
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
        <label className="field"><span>Deck width (feet)</span><input inputMode="decimal" type="number" min="4" step="0.25" value={width} onChange={(event) => setWidth(event.target.value)} /></label>
        <label className="field"><span>Distance from house (feet)</span><input inputMode="decimal" type="number" min="4" step="0.25" value={projection} onChange={(event) => setProjection(event.target.value)} /></label>
        <label className="field"><span>Deck height (inches, verify)</span><input inputMode="decimal" type="number" min="6" step="0.25" placeholder="Unknown" value={surfaceElevation} onChange={(event) => setSurfaceElevation(event.target.value)} /></label>
        <label className="field"><span>Door width (feet)</span><input inputMode="decimal" type="number" min="1" step="0.25" placeholder="Optional reference" value={doorWidth} onChange={(event) => setDoorWidth(event.target.value)} /></label>
        <label className="field full"><span>Connection to house</span><select value={attachment} onChange={(event) => setAttachment(event.target.value as HouseAttachment)}><option value="unknown">Unknown / field verify</option><option value="ledger">Ledger attached</option><option value="non-ledger">Freestanding / non-ledger</option></select></label>
      </div></section>
      <section id="photo-step-review"><div className="photo-step"><span>3</span><div><strong>Review before creating geometry</strong><small>No photo-derived measurement is applied automatically.</small></div></div>{review ? <div className="photo-review"><div><strong>Confirmed</strong>{review.confirmed.map((item) => <p key={item}>✓ {item}</p>)}</div><div><strong>Still verify</strong>{review.fieldVerification.map((item) => <p key={item}>• {item}</p>)}</div></div> : <p className="photo-review-error">Enter a valid deck width and distance from the house.</p>}</section>
      {layoutIntent === "non-standard" && Number.isFinite(numericWidth) && Number.isFinite(numericProjection) && <section id="photo-step-outline"><div className="photo-step"><span>4</span><div><strong>Trace and confirm the real outline</strong><small>Use the photos beside the measured plan. This step—not the photo pixels—creates geometry.</small></div></div><PhotoOutlineTracer width={numericWidth} projection={numericProjection} photos={allPhotos} outer={traceOuter} stairEdgeId={traceStairEdgeId} stairOffset={traceStairOffset} surfaceElevation={draft.surfaceElevation ?? fallbackSurfaceElevation} gradeElevation={gradeElevation} onChange={setTraceOuter} onStairPlacementChange={(edgeId, offset) => { setTraceStairEdgeId(edgeId); setTraceStairOffset(offset); }} onError={setError} /><div className={`trace-status${traced ? " ready" : ""}`} role="status"><strong>{traced ? `Outline ready · ${traceOuter.length} confirmed corners${traceStairEdgeId ? " · stairs selected" : ""}` : "The outline is still a rectangle"}</strong><span>{traced ? "Start the design when the corners match the job." : "Tap a non-house edge to add an offset, then drag its handles into position."}</span></div></section>}
    </div>
    <footer><div><strong>{coverage.addedCount} photo{coverage.addedCount === 1 ? "" : "s"} added</strong><small>{layoutIntent === "non-standard" ? "A changed outline is required before starting." : "You can start with zero photos and enter dimensions manually."}</small></div><div><button onClick={onCancel}>Keep current design</button><button className="primary" disabled={layoutIntent === "non-standard" && !traced} onClick={start}>{layoutIntent === "non-standard" ? "Start from confirmed outline" : "Start rectangle design"}</button></div></footer>
    {error && <p className="photo-error" role="alert">{error}</p>}
  </section></div>;
}
