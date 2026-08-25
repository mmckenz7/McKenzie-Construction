import { describe, expect, it } from "vitest";
import { acquireBestGps, formatGpsAccuracy, gpsFixDistanceMeters, gpsOriginAt, projectGpsFix, projectGpsLeg, readCurrentGps, readMovedGps, type GpsProvider } from "../src/gps";

describe("site walk GPS", () => {
  it("projects latitude and longitude into deterministic local millimeters", () => {
    const originFix = { latitude: 35, longitude: -84, accuracyMeters: 2 };
    const origin = gpsOriginAt(originFix, 2_000, 3_000);
    expect(projectGpsFix(origin, originFix)).toEqual({ xMm: 2_000, yMm: 3_000 });
    const projected = projectGpsFix(origin, { latitude: 35.0001, longitude: -83.9999, accuracyMeters: 2 });
    expect(projected.xMm).toBeGreaterThan(11_000);
    expect(projected.xMm).toBeLessThan(11_200);
    expect(projected.yMm).toBeGreaterThan(-8_200);
    expect(projected.yMm).toBeLessThan(-8_000);
  });

  it("projects each new leg from the latest corrected plan endpoint", () => {
    const previousFix = { latitude: 35, longitude: -84, accuracyMeters: 2 };
    const nextFix = { latitude: 35, longitude: -83.9999, accuracyMeters: 2 };
    const rawLeg = projectGpsLeg(previousFix, { xMm: 2_000, yMm: 3_000 }, nextFix);
    const correctedLeg = projectGpsLeg(previousFix, { xMm: 12_000, yMm: -7_000 }, nextFix);
    expect(correctedLeg.xMm - rawLeg.xMm).toBe(10_000);
    expect(correctedLeg.yMm - rawLeg.yMm).toBe(-10_000);
  });

  it("requests a fresh high-accuracy browser fix", async () => {
    let requestedOptions: PositionOptions | undefined;
    const provider: GpsProvider = { getCurrentPosition: (success, _error, options) => {
      requestedOptions = options;
      success({ coords: { latitude: 35.95, longitude: -83.92, accuracy: 3.2 } });
    } };
    await expect(readCurrentGps(provider)).resolves.toEqual({ latitude: 35.95, longitude: -83.92, accuracyMeters: 3.2 });
    expect(requestedOptions).toEqual({ enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 });
  });

  it("returns useful permission and timeout errors", async () => {
    const denied: GpsProvider = { getCurrentPosition: (_success, error) => error?.({ code: 1, message: "denied" }) };
    const timedOut: GpsProvider = { getCurrentPosition: (_success, error) => error?.({ code: 3, message: "timeout" }) };
    await expect(readCurrentGps(denied)).rejects.toThrow(/permission was denied/i);
    await expect(readCurrentGps(timedOut)).rejects.toThrow(/timed out/i);
    await expect(readCurrentGps(null)).rejects.toThrow(/not available/i);
  });

  it("formats phone accuracy as an honest rounded radius", () => {
    expect(formatGpsAccuracy(3)).toBe("±10 ft");
    expect(formatGpsAccuracy(0.1)).toBe("±1 ft");
  });

  it("waits past a repeated iPhone position until the watch reports movement", async () => {
    const previous = { latitude: 35.95, longitude: -83.92, accuracyMeters: 4 };
    const moved = { latitude: 35.95005, longitude: -83.92, accuracyMeters: 3 };
    let clearedWatch: number | null = null;
    const provider: GpsProvider = {
      getCurrentPosition: () => undefined,
      watchPosition: (success) => {
        success({ coords: { latitude: previous.latitude, longitude: previous.longitude, accuracy: previous.accuracyMeters } });
        success({ coords: { latitude: moved.latitude, longitude: moved.longitude, accuracy: moved.accuracyMeters } });
        return 17;
      },
      clearWatch: (id) => { clearedWatch = id; },
    };
    await expect(readMovedGps(provider, previous, 0.75, 100)).resolves.toEqual(moved);
    expect(gpsFixDistanceMeters(previous, moved)).toBeGreaterThan(5);
    expect(clearedWatch).toBe(17);
  });

  it("explains when a one-shot browser keeps returning the previous position", async () => {
    const previous = { latitude: 35.95, longitude: -83.92, accuracyMeters: 4 };
    const provider: GpsProvider = { getCurrentPosition: (success) => success({ coords: { latitude: previous.latitude, longitude: previous.longitude, accuracy: 3 } }) };
    await expect(readMovedGps(provider, previous)).rejects.toThrow(/previous GPS position/i);
  });

  it("keeps sampling until an early usable GPS lock arrives", async () => {
    let clearedWatch: number | null = null;
    const samples: number[] = [];
    const provider: GpsProvider = {
      getCurrentPosition: () => undefined,
      watchPosition: (success) => {
        success({ coords: { latitude: 35.95, longitude: -83.92, accuracy: 34 } });
        success({ coords: { latitude: 35.95, longitude: -83.92, accuracy: 4 } });
        return 22;
      },
      clearWatch: (id) => { clearedWatch = id; },
    };
    await expect(acquireBestGps(provider, { onSample: (fix) => samples.push(fix.accuracyMeters) })).resolves.toEqual({ latitude: 35.95, longitude: -83.92, accuracyMeters: 4 });
    expect(samples).toEqual([34, 4]);
    expect(clearedWatch).toBe(22);
  });

  it("uses the best rough fix at timeout and rejects an unusable one", async () => {
    const roughProvider: GpsProvider = {
      getCurrentPosition: () => undefined,
      watchPosition: (success) => { success({ coords: { latitude: 35.95, longitude: -83.92, accuracy: 12 } }); return 23; },
      clearWatch: () => undefined,
    };
    await expect(acquireBestGps(roughProvider, { timeoutMs: 1 })).resolves.toEqual({ latitude: 35.95, longitude: -83.92, accuracyMeters: 12 });

    const poorProvider: GpsProvider = {
      getCurrentPosition: () => undefined,
      watchPosition: (success) => { success({ coords: { latitude: 35.95, longitude: -83.92, accuracy: 34 } }); return 24; },
      clearWatch: () => undefined,
    };
    await expect(acquireBestGps(poorProvider, { timeoutMs: 1 })).rejects.toThrow(/GPS did not become usable.*±112 ft/i);
  });

  it("cancels and clears a Safari position watch without accepting a point", async () => {
    const controller = new AbortController();
    let clearedWatch: number | null = null;
    const provider: GpsProvider = {
      getCurrentPosition: () => undefined,
      watchPosition: () => 31,
      clearWatch: (id) => { clearedWatch = id; },
    };
    const pending = acquireBestGps(provider, { signal: controller.signal, timeoutMs: 100 });
    controller.abort();
    await expect(pending).rejects.toThrow(/GPS lock canceled/i);
    expect(clearedWatch).toBe(31);
  });
});
