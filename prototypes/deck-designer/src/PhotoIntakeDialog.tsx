import { useEffect, useMemo, useRef, useState } from "react";
import type { HouseAttachment } from "./model";
import { normalizeConfirmedPhotoFacts, reviewConfirmedPhotoFacts, type ConfirmedPhotoFacts, type PhotoIntakeReview } from "./photoIntake";

type PhotoRole = "wide-site" | "house-connection" | "stairs-grade";
type LocalPhoto = Readonly<{ name: string; url: string }>;
type Props = Readonly<{
  initialFacts: ConfirmedPhotoFacts;
  onCancel: () => void;
  onStartDesign: (facts: ConfirmedPhotoFacts, review: PhotoIntakeReview, photoCount: number) => void;
}>;

const PHOTO_SLOTS: readonly Readonly<{ role: PhotoRole; title: string; help: string }>[] = [
  { role: "wide-site", title: "Wide site", help: "Show the house wall and the full work area." },
  { role: "house-connection", title: "House connection", help: "Show where the deck meets—or will meet—the house." },
  { role: "stairs-grade", title: "Stairs and grade", help: "Show the stair location and ground-height changes." },
];

const feet = (inches: number): string => String(Math.round(inches / 12 * 100) / 100);
const parseFeet = (value: string): number => Number(value) * 12;
const parseOptionalInches = (value: string): number | null => value.trim() ? Number(value) : null;

export function PhotoIntake({ initialFacts, onCancel, onStartDesign }: Props) {
  const [photos, setPhotos] = useState<Partial<Record<PhotoRole, LocalPhoto>>>({});
  const urls = useRef(new Set<string>());
  const [designName, setDesignName] = useState(initialFacts.designName);
  const [width, setWidth] = useState(feet(initialFacts.width));
  const [projection, setProjection] = useState(feet(initialFacts.projection));
  const [surfaceElevation, setSurfaceElevation] = useState(initialFacts.surfaceElevation === null ? "" : String(initialFacts.surfaceElevation));
  const [doorWidth, setDoorWidth] = useState(initialFacts.doorWidth === null ? "" : feet(initialFacts.doorWidth));
  const [attachment, setAttachment] = useState<HouseAttachment>(initialFacts.attachment);
  const [error, setError] = useState("");
  useEffect(() => () => { for (const url of urls.current) URL.revokeObjectURL(url); }, []);

  const draft = useMemo<ConfirmedPhotoFacts>(() => ({
    designName,
    width: parseFeet(width),
    projection: parseFeet(projection),
    surfaceElevation: parseOptionalInches(surfaceElevation),
    doorWidth: doorWidth.trim() ? parseFeet(doorWidth) : null,
    attachment,
  }), [attachment, designName, doorWidth, projection, surfaceElevation, width]);
  let review: PhotoIntakeReview | null = null;
  try { review = reviewConfirmedPhotoFacts(draft); } catch { /* show validation only when submitted */ }

  const choosePhoto = (role: PhotoRole, file: File | undefined) => {
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
  const removePhoto = (role: PhotoRole) => {
    const previous = photos[role];
    if (previous) { URL.revokeObjectURL(previous.url); urls.current.delete(previous.url); }
    setPhotos((current) => { const next = { ...current }; delete next[role]; return next; });
  };
  const start = () => {
    try {
      const normalized = normalizeConfirmedPhotoFacts(draft);
      onStartDesign(normalized, reviewConfirmedPhotoFacts(normalized), Object.keys(photos).length);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Review the confirmed dimensions before starting.");
    }
  };

  return <div className="photo-intake-backdrop" role="presentation"><section className="photo-intake" role="dialog" aria-modal="true" aria-labelledby="photo-intake-title">
    <header><div><p className="eyebrow">Optional job-photo start</p><h2 id="photo-intake-title">Start with what you know</h2><p>Photos stay on this device. Only confirmed entries create the deck.</p></div><button className="photo-close" onClick={onCancel} aria-label="Close photo start">Close</button></header>
    <div className="photo-intake-content">
      <section><div className="photo-step"><span>1</span><div><strong>Add useful photos</strong><small>Any photo can be skipped or replaced.</small></div></div><div className="photo-slot-grid">{PHOTO_SLOTS.map((slot) => {
        const photo = photos[slot.role];
        return <article className="photo-slot" key={slot.role}>{photo ? <img src={photo.url} alt={`${slot.title} preview`} /> : <div className="photo-placeholder">Optional</div>}<strong>{slot.title}</strong><p>{slot.help}</p><div><label className="photo-file-button">{photo ? "Replace" : "Choose photo"}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => { choosePhoto(slot.role, event.target.files?.[0]); event.target.value = ""; }} /></label>{photo && <button onClick={() => removePhoto(slot.role)}>Remove</button>}</div>{photo && <small title={photo.name}>{photo.name}</small>}</article>;
      })}</div><p className="photo-privacy">Local preview only—photos are not saved in design JSON, browser storage, or the repository.</p></section>
      <section><div className="photo-step"><span>2</span><div><strong>Confirm the design facts</strong><small>Leave unknown details blank; they will be marked for field verification.</small></div></div><div className="photo-facts-grid">
        <label className="field full"><span>Design name</span><input value={designName} onChange={(event) => setDesignName(event.target.value)} /></label>
        <label className="field"><span>Deck width (feet)</span><input inputMode="decimal" type="number" min="4" step="0.25" value={width} onChange={(event) => setWidth(event.target.value)} /></label>
        <label className="field"><span>Distance from house (feet)</span><input inputMode="decimal" type="number" min="4" step="0.25" value={projection} onChange={(event) => setProjection(event.target.value)} /></label>
        <label className="field"><span>Deck height (inches, verify)</span><input inputMode="decimal" type="number" min="6" step="0.25" placeholder="Unknown" value={surfaceElevation} onChange={(event) => setSurfaceElevation(event.target.value)} /></label>
        <label className="field"><span>Door width (feet)</span><input inputMode="decimal" type="number" min="1" step="0.25" placeholder="Optional reference" value={doorWidth} onChange={(event) => setDoorWidth(event.target.value)} /></label>
        <label className="field full"><span>Connection to house</span><select value={attachment} onChange={(event) => setAttachment(event.target.value as HouseAttachment)}><option value="unknown">Unknown / field verify</option><option value="ledger">Ledger attached</option><option value="non-ledger">Freestanding / non-ledger</option></select></label>
      </div></section>
      <section><div className="photo-step"><span>3</span><div><strong>Review before creating geometry</strong><small>No photo-derived measurement is applied automatically.</small></div></div>{review ? <div className="photo-review"><div><strong>Confirmed</strong>{review.confirmed.map((item) => <p key={item}>✓ {item}</p>)}</div><div><strong>Still verify</strong>{review.fieldVerification.map((item) => <p key={item}>• {item}</p>)}</div></div> : <p className="photo-review-error">Enter a valid deck width and distance from the house.</p>}</section>
    </div>
    <footer><div><strong>{Object.keys(photos).length} of 3 photos added</strong><small>You can start with zero photos and enter dimensions manually.</small></div><div><button onClick={onCancel}>Keep current design</button><button className="primary" onClick={start}>Start rectangle design</button></div></footer>
    {error && <p className="photo-error" role="alert">{error}</p>}
  </section></div>;
}
