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

export function readCurrentGps(provider: GpsProvider | null | undefined): Promise<GpsFix> {
  if (!provider) return Promise.reject(new Error("GPS is not available in this browser."));
  return new Promise((resolve, reject) => provider.getCurrentPosition(
    ({ coords }) => {
      try {
        const latitude = finite(coords.latitude, "Latitude");
        const longitude = finite(coords.longitude, "Longitude");
        const accuracyMeters = finite(coords.accuracy, "GPS accuracy");
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || accuracyMeters < 0) throw new RangeError("The phone returned an invalid GPS position.");
        resolve(Object.freeze({ latitude, longitude, accuracyMeters }));
      } catch (error) { reject(error); }
    },
    ({ code }) => {
      if (code === 1) reject(new Error("Location permission was denied. Allow location access, then try again."));
      else if (code === 2) reject(new Error("The phone could not determine a GPS position. Move to open sky and try again."));
      else reject(new Error("GPS timed out. Stand still and try marking the point again."));
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
  ));
}

export function formatGpsAccuracy(accuracyMeters: number): string {
  finite(accuracyMeters, "GPS accuracy");
  return `±${Math.max(1, Math.round(accuracyMeters / 0.3048))} ft`;
}
