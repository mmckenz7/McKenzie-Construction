import { describe, expect, it } from "vitest";
import { parseRunCommand, runEndpoint } from "../src/run-command";

describe("precision run commands", () => {
  it("parses absolute first runs with feet and inches", () => {
    const command = parseRunCommand("south 20 ft 6 in", null);
    expect(command).toMatchObject({ direction: "south", lengthMm: 6_248, turnDegrees: null });
    expect(runEndpoint({ xMm: 1_000, yMm: 2_000 }, command)).toEqual({ xMm: 1_000, yMm: 8_248 });
  });

  it("parses relative right and left turns from the incoming visual bearing", () => {
    const right = parseRunCommand("90 right 40 ft", -Math.PI / 2);
    expect(right).toMatchObject({ direction: "right", lengthMm: 12_192, turnDegrees: 90 });
    expect(runEndpoint({ xMm: 0, yMm: 0 }, right)).toEqual({ xMm: 12_192, yMm: 0 });
    const left = parseRunCommand("left 45, 10", 0);
    expect(left.turnDegrees).toBe(45);
    expect(runEndpoint({ xMm: 0, yMm: 0 }, left)).toEqual({ xMm: 2_155, yMm: -2_155 });
    expect(parseRunCommand("left 45° 10 ft", 0).turnDegrees).toBe(45);
  });

  it("continues straight when only a length is entered", () => {
    const command = parseRunCommand("12' 3\"", Math.PI);
    expect(command).toMatchObject({ direction: "straight", lengthMm: 3_734 });
    expect(runEndpoint({ xMm: 5_000, yMm: 2_000 }, command)).toEqual({ xMm: 1_266, yMm: 2_000 });
  });

  it("requires an absolute direction when no incoming run exists", () => {
    expect(() => parseRunCommand("right 90 20 ft", null)).toThrow(/first precise run needs/i);
    expect(() => parseRunCommand("20 ft", null)).toThrow(/first precise run needs/i);
  });

  it("rejects missing and out-of-range lengths", () => {
    expect(() => parseRunCommand("south", null)).toThrow(/include a run length/i);
    expect(() => parseRunCommand("south 0 ft", null)).toThrow(/1 inch through 1,000 feet/i);
  });
});
