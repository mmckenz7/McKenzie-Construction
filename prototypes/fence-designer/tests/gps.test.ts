import { describe, expect, it } from "vitest";
import { formatGpsAccuracy, gpsOriginAt, projectGpsFix, readCurrentGps, type GpsProvider } from "../src/gps";

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
});
