import { normalizedMapCoordinate, type NormalizedMapCoordinate } from "./map-presentation";

export const LIVE_LOCATION_STALE_AFTER_MS = 10_000;
export const LIVE_LOCATION_NO_FIX_STOP_MS = 30_000;
export const LIVE_LOCATION_MAX_SESSION_MS = 300_000;

export type LocationAccuracyTier = "best-observational" | "caution" | "rejected";
export type ObservationalLocationState = Readonly<{
  status: "idle" | "watching" | "fix" | "stale" | "stopped" | "error";
  coordinate: NormalizedMapCoordinate | null;
  accuracyMeters: number | null;
  accuracyTier: LocationAccuracyTier | null;
  observedAtMs: number | null;
  reason: string | null;
}>;

export const IDLE_LOCATION_STATE: ObservationalLocationState = Object.freeze({ status: "idle", coordinate: null, accuracyMeters: null, accuracyTier: null, observedAtMs: null, reason: null });

type GeolocationLike = Pick<Geolocation, "watchPosition" | "clearWatch">;
type TimerHandle = ReturnType<typeof setTimeout>;
type TimerApi = Readonly<{ set(callback: () => void, milliseconds: number): TimerHandle; clear(handle: TimerHandle): void }>;

const defaultTimer: TimerApi = Object.freeze({ set: (callback, milliseconds) => setTimeout(callback, milliseconds), clear: (handle) => clearTimeout(handle) });

export function locationAccuracyTier(accuracyMeters: number): LocationAccuracyTier {
  if (!Number.isFinite(accuracyMeters) || accuracyMeters < 0) throw new TypeError("Location accuracy must be a nonnegative meter value.");
  return accuracyMeters <= 5 ? "best-observational" : accuracyMeters <= 15 ? "caution" : "rejected";
}

export class ObservationalLocationSession {
  private watchId: number | null = null;
  private noFixTimer: TimerHandle | null = null;
  private sessionTimer: TimerHandle | null = null;
  private listener: ((state: ObservationalLocationState) => void) | null = null;

  constructor(private readonly geolocation: GeolocationLike, private readonly now: () => number = Date.now, private readonly timer: TimerApi = defaultTimer) {}

  start(listener: (state: ObservationalLocationState) => void) {
    if (this.watchId !== null) throw new TypeError("Live location is already active.");
    this.listener = listener;
    this.emit({ ...IDLE_LOCATION_STATE, status: "watching", reason: "Waiting for an observational browser location." });
    this.noFixTimer = this.timer.set(() => this.stop("No browser location arrived within 30 seconds."), LIVE_LOCATION_NO_FIX_STOP_MS);
    this.sessionTimer = this.timer.set(() => this.stop("The five-minute live-location limit was reached."), LIVE_LOCATION_MAX_SESSION_MS);
    this.watchId = -1;
    const watchId = this.geolocation.watchPosition(
      (position) => this.accept(position),
      (error) => this.fail(error.message || "Browser location failed."),
      { enableHighAccuracy: true, maximumAge: 0, timeout: LIVE_LOCATION_NO_FIX_STOP_MS },
    );
    if (this.watchId === -1) this.watchId = watchId;
    else this.geolocation.clearWatch(watchId);
  }

  stop(reason = "Live location stopped.") {
    if (this.watchId !== null) this.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    this.clearTimers();
    this.emit({ ...IDLE_LOCATION_STATE, status: "stopped", reason });
    this.listener = null;
  }

  active() { return this.watchId !== null; }

  private accept(position: GeolocationPosition) {
    if (this.watchId === null) return;
    if (this.noFixTimer !== null) { this.timer.clear(this.noFixTimer); this.noFixTimer = null; }
    const observedAtMs = Number.isFinite(position.timestamp) ? position.timestamp : this.now();
    const stale = this.now() - observedAtMs > LIVE_LOCATION_STALE_AFTER_MS;
    const accuracyMeters = position.coords.accuracy;
    const accuracyTier = locationAccuracyTier(accuracyMeters);
    this.emit(Object.freeze({
      status: stale ? "stale" : "fix",
      coordinate: normalizedMapCoordinate(position.coords.longitude.toFixed(7), position.coords.latitude.toFixed(7)),
      accuracyMeters,
      accuracyTier,
      observedAtMs,
      reason: stale ? "Location is more than 10 seconds old." : accuracyTier === "rejected" ? "Accuracy is worse than 15 meters; observation rejected for capture." : "Observational location only—never snapped or verified.",
    }));
  }

  private fail(reason: string) {
    if (this.watchId !== null) this.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    this.clearTimers();
    this.emit({ ...IDLE_LOCATION_STATE, status: "error", reason });
    this.listener = null;
  }

  private clearTimers() {
    if (this.noFixTimer !== null) this.timer.clear(this.noFixTimer);
    if (this.sessionTimer !== null) this.timer.clear(this.sessionTimer);
    this.noFixTimer = null; this.sessionTimer = null;
  }

  private emit(state: ObservationalLocationState) { this.listener?.(Object.freeze(state)); }
}
