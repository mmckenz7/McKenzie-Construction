const EARTH_RADIUS_METERS = 6_371_008.8;

export type GpsFix = Readonly<{
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}>;

export type GpsOrigin = Readonly<{
  latitude: number;
  longitude: number;
  planXmm: number;
  planYmm: number;
}>;

export type GpsProvider = Readonly<{
  getCurrentPosition: (
    success: (position: Readonly<{ coords: Readonly<{ latitude: number; longitude: number; accuracy: number }> }>) => void,
    error?: (error: Readonly<{ code: number; message: string }>) => void,
    options?: PositionOptions,
  ) => void;
  watchPosition?: (
    success: (position: Readonly<{ coords: Readonly<{ latitude: number; longitude: number; accuracy: number }> }>) => void,
    error?: (error: Readonly<{ code: number; message: string }>) => void,
    options?: PositionOptions,
  ) => number;
  clearWatch?: (watchId: number) => void;
}>;

export type GpsAcquisitionOptions = Readonly<{
  previousFix?: GpsFix | null;
  targetAccuracyMeters?: number;
  maximumAccuracyMeters?: number;
  minimumMovementMeters?: number;
  timeoutMs?: number;
  onSample?: (bestFix: GpsFix) => void;
  signal?: AbortSignal;
}>;

const finite = (value: number, label: string): number => {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
  return value;
};

export function gpsOriginAt(fix: GpsFix, planXmm: number, planYmm: number): GpsOrigin {
  finite(fix.latitude, "Latitude"); finite(fix.longitude, "Longitude");
  if (!Number.isSafeInteger(planXmm) || !Number.isSafeInteger(planYmm)) throw new TypeError("GPS plan origin must use integer millimeters.");
  return Object.freeze({ latitude: fix.latitude, longitude: fix.longitude, planXmm, planYmm });
}

export function projectGpsFix(origin: GpsOrigin, fix: GpsFix): Readonly<{ xMm: number; yMm: number }> {
  const latitude = finite(fix.latitude, "Latitude");
  const longitude = finite(fix.longitude, "Longitude");
  const meanLatitudeRadians = (origin.latitude + latitude) / 2 * Math.PI / 180;
  const eastMeters = (longitude - origin.longitude) * Math.PI / 180 * EARTH_RADIUS_METERS * Math.cos(meanLatitudeRadians);
  const northMeters = (latitude - origin.latitude) * Math.PI / 180 * EARTH_RADIUS_METERS;
  return Object.freeze({
    xMm: origin.planXmm + Math.round(eastMeters * 1_000),
    yMm: origin.planYmm - Math.round(northMeters * 1_000),
  });
}

export function projectGpsLeg(previousFix: GpsFix, planStart: Readonly<{ xMm: number; yMm: number }>, nextFix: GpsFix): Readonly<{ xMm: number; yMm: number }> {
  return projectGpsFix(gpsOriginAt(previousFix, planStart.xMm, planStart.yMm), nextFix);
}

export function gpsFixDistanceMeters(first: Pick<GpsFix, "latitude" | "longitude">, second: Pick<GpsFix, "latitude" | "longitude">): number {
  const meanLatitudeRadians = (finite(first.latitude, "First latitude") + finite(second.latitude, "Second latitude")) / 2 * Math.PI / 180;
  const eastMeters = (finite(second.longitude, "Second longitude") - finite(first.longitude, "First longitude")) * Math.PI / 180 * EARTH_RADIUS_METERS * Math.cos(meanLatitudeRadians);
  const northMeters = (second.latitude - first.latitude) * Math.PI / 180 * EARTH_RADIUS_METERS;
  return Math.hypot(eastMeters, northMeters);
}

const gpsError = (code: number): Error => {
  if (code === 1) return new Error("Location permission was denied. Allow location access, then try again.");
  if (code === 2) return new Error("The phone could not determine a GPS position. Move to open sky and try again.");
  return new Error("GPS timed out. Stand still and try marking the point again.");
};

const gpsFixFromPosition = ({ coords }: Readonly<{ coords: Readonly<{ latitude: number; longitude: number; accuracy: number }> }>): GpsFix => {
  const latitude = finite(coords.latitude, "Latitude");
  const longitude = finite(coords.longitude, "Longitude");
  const accuracyMeters = finite(coords.accuracy, "GPS accuracy");
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || accuracyMeters < 0) throw new RangeError("The phone returned an invalid GPS position.");
  return Object.freeze({ latitude, longitude, accuracyMeters });
};

export function readCurrentGps(provider: GpsProvider | null | undefined): Promise<GpsFix> {
  if (!provider) return Promise.reject(new Error("GPS is not available in this browser."));
  return new Promise((resolve, reject) => provider.getCurrentPosition(
    ({ coords }) => {
      try { resolve(gpsFixFromPosition({ coords })); } catch (error) { reject(error); }
    },
    ({ code }) => reject(gpsError(code)),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
  ));
}

export function readMovedGps(provider: GpsProvider | null | undefined, previous: GpsFix, minimumMovementMeters = 0.75, timeoutMs = 20_000): Promise<GpsFix> {
  if (!provider) return Promise.reject(new Error("GPS is not available in this browser."));
  const watchPosition = provider.watchPosition?.bind(provider);
  const clearWatch = provider.clearWatch?.bind(provider);
  if (!watchPosition || !clearWatch) return readCurrentGps(provider).then((fix) => {
    if (gpsFixDistanceMeters(previous, fix) < minimumMovementMeters) throw new Error("The phone is still returning the previous GPS position. Wait for the GPS accuracy to update, then mark this point again.");
    return fix;
  });
  return new Promise((resolve, reject) => {
    const watchState: { id?: number } = {};
    let settled = false;
    const finish = (result: { fix: GpsFix } | { error: Error }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (watchState.id !== undefined) clearWatch(watchState.id);
      if ("fix" in result) resolve(result.fix); else reject(result.error);
    };
    const timer = setTimeout(() => finish({ error: new Error("The phone kept returning the previous GPS position. Stay at the new point with open sky, then try again.") }), timeoutMs);
    watchState.id = watchPosition(
      (position) => {
        try {
          const fix = gpsFixFromPosition(position);
          if (gpsFixDistanceMeters(previous, fix) >= minimumMovementMeters) finish({ fix });
        } catch (error) { finish({ error: error instanceof Error ? error : new Error("The phone returned an invalid GPS position.") }); }
      },
      ({ code }) => finish({ error: gpsError(code) }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    );
    if (settled && watchState.id !== undefined) clearWatch(watchState.id);
  });
}

export function acquireBestGps(provider: GpsProvider | null | undefined, options: GpsAcquisitionOptions = {}): Promise<GpsFix> {
  if (!provider) return Promise.reject(new Error("GPS is not available in this browser."));
  if (options.signal?.aborted) return Promise.reject(new Error("GPS lock canceled. Tap again to retry."));
  const targetAccuracyMeters = options.targetAccuracyMeters ?? 5;
  const maximumAccuracyMeters = options.maximumAccuracyMeters ?? 15;
  const minimumMovementMeters = options.minimumMovementMeters ?? 0.75;
  const timeoutMs = options.timeoutMs ?? 20_000;
  if (targetAccuracyMeters <= 0 || maximumAccuracyMeters < targetAccuracyMeters || minimumMovementMeters < 0 || timeoutMs <= 0) {
    return Promise.reject(new RangeError("GPS acquisition settings are invalid."));
  }

  const isNewLocation = (fix: GpsFix) => !options.previousFix || gpsFixDistanceMeters(options.previousFix, fix) >= minimumMovementMeters;
  // Safari requires Geolocation methods to retain their native receiver.
  const watchPosition = provider.watchPosition?.bind(provider);
  const clearWatch = provider.clearWatch?.bind(provider);
  if (!watchPosition || !clearWatch) return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (result: { fix: GpsFix } | { error: Error }) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      if ("fix" in result) resolve(result.fix); else reject(result.error);
    };
    const onAbort = () => finish({ error: new Error("GPS lock canceled. Tap again to retry.") });
    options.signal?.addEventListener("abort", onAbort, { once: true });
    readCurrentGps(provider).then((fix) => {
      if (!isNewLocation(fix)) throw new Error("The phone is still returning the previous GPS position. Wait for the GPS accuracy to update, then mark this point again.");
      options.onSample?.(fix);
      if (fix.accuracyMeters > maximumAccuracyMeters) throw new Error(`GPS did not become usable. Best reported accuracy was ${formatGpsAccuracy(fix.accuracyMeters)}. Move to open sky, confirm Precise Location is enabled, and try again.`);
      finish({ fix });
    }).catch((error: unknown) => finish({ error: error instanceof Error ? error : new Error("The phone returned an invalid GPS position.") }));
  });

  return new Promise((resolve, reject) => {
    const watchState: { id?: number } = {};
    let settled = false;
    let bestFix: GpsFix | null = null;
    const finish = (result: { fix: GpsFix } | { error: Error }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (watchState.id !== undefined) clearWatch(watchState.id);
      if ("fix" in result) resolve(result.fix); else reject(result.error);
    };
    const timer = setTimeout(() => {
      if (bestFix && bestFix.accuracyMeters <= maximumAccuracyMeters) finish({ fix: bestFix });
      else if (bestFix) finish({ error: new Error(`GPS did not become usable after ${Math.round(timeoutMs / 1_000)} seconds. Best reported accuracy was ${formatGpsAccuracy(bestFix.accuracyMeters)}. Move to open sky, confirm Precise Location is enabled, and try again.`) });
      else finish({ error: new Error(options.previousFix
        ? "The phone kept returning the previous GPS position. Stay at the new point with open sky, then try again."
        : "The phone did not return a fresh GPS position. Move to open sky and try again.") });
    }, timeoutMs);
    const onAbort = () => finish({ error: new Error("GPS lock canceled. Tap again to retry.") });
    options.signal?.addEventListener("abort", onAbort, { once: true });
    watchState.id = watchPosition(
      (position) => {
        try {
          const fix = gpsFixFromPosition(position);
          if (!isNewLocation(fix)) return;
          if (!bestFix || fix.accuracyMeters < bestFix.accuracyMeters) {
            bestFix = fix;
            options.onSample?.(fix);
          }
          if (fix.accuracyMeters <= targetAccuracyMeters) finish({ fix });
        } catch (error) { finish({ error: error instanceof Error ? error : new Error("The phone returned an invalid GPS position.") }); }
      },
      ({ code }) => finish({ error: gpsError(code) }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    );
    if (settled && watchState.id !== undefined) clearWatch(watchState.id);
  });
}

export function formatGpsAccuracy(accuracyMeters: number): string {
  finite(accuracyMeters, "GPS accuracy");
  return `±${Math.max(1, Math.round(accuracyMeters / 0.3048))} ft`;
}
