import { describe, expect, it } from "vitest";
import { LIVE_LOCATION_MAX_SESSION_MS, LIVE_LOCATION_NO_FIX_STOP_MS, ObservationalLocationSession, locationAccuracyTier, type ObservationalLocationState } from "../src/live-location";

type Success = PositionCallback;
type Failure = PositionErrorCallback;

function position(accuracy: number, timestamp = 10_000): GeolocationPosition {
  return { coords: { latitude: 35.96, longitude: -83.92, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}) }, timestamp, toJSON: () => ({}) };
}

describe("observational browser location", () => {
  it("uses explicit accuracy tiers that never imply verification", () => {
    expect(locationAccuracyTier(5)).toBe("best-observational");
    expect(locationAccuracyTier(15)).toBe("caution");
    expect(locationAccuracyTier(15.01)).toBe("rejected");
  });

  it("accepts synchronous browser fixes, reports stale/rejected facts, and clears the watch", () => {
    const states: ObservationalLocationState[] = [];
    const cleared: number[] = []; const clearWatch = (id: number) => { cleared.push(id); };
    const geo = { watchPosition(success: Success) { success(position(18)); return 41; }, clearWatch } as unknown as Pick<Geolocation, "watchPosition" | "clearWatch">;
    const session = new ObservationalLocationSession(geo, () => 10_000);
    session.start((state) => states.push(state));
    expect(states.at(-1)).toMatchObject({ status: "fix", accuracyTier: "rejected" });
    expect(states.at(-1)?.reason).toContain("rejected");
    session.stop();
    expect(cleared).toContain(41);
  });

  it("stops after the no-fix and maximum-session limits", () => {
      const callbacks = new Map<number, () => void>(); let nextTimer = 1;
      const timer = { set(callback: () => void) { const id = nextTimer++; callbacks.set(id, callback); return id as unknown as ReturnType<typeof setTimeout>; }, clear(handle: ReturnType<typeof setTimeout>) { callbacks.delete(handle as unknown as number); } };
      let success: Success | null = null; let failure: Failure | null = null;
      const cleared: number[] = []; const clearWatch = (id: number) => { cleared.push(id); };
      const geo = { watchPosition(next: Success, fail: Failure) { success = next; failure = fail; return 9; }, clearWatch } as unknown as Pick<Geolocation, "watchPosition" | "clearWatch">;
      const states: ObservationalLocationState[] = [];
      const session = new ObservationalLocationSession(geo, Date.now, timer);
      session.start((state) => states.push(state));
      expect(success).not.toBeNull(); expect(failure).not.toBeNull();
      expect(LIVE_LOCATION_NO_FIX_STOP_MS).toBe(30_000);
      callbacks.get(1)?.();
      expect(states.at(-1)?.status).toBe("stopped"); expect(states.at(-1)?.reason).toContain("30 seconds");
      expect(cleared).toContain(9);

      const second = new ObservationalLocationSession({ watchPosition(next: Success) { next(position(3, Date.now())); return 10; }, clearWatch } as unknown as Pick<Geolocation, "watchPosition" | "clearWatch">, Date.now, timer);
      second.start((state) => states.push(state));
      expect(LIVE_LOCATION_MAX_SESSION_MS).toBe(300_000);
      callbacks.get(4)?.();
      expect(states.at(-1)?.status).toBe("stopped"); expect(states.at(-1)?.reason).toContain("five-minute");
  });
});
