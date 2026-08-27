import { describe, expect, it } from "vitest";
import { fenceGeoJson, fenceKml, projectFenceDesignToMap, registrationAtDesignOrigin } from "../src/fence-geo-interchange";
import { localGroundToMap, mapToLocalGround } from "../src/ground-registration";
import { normalizeParcelGeoJson, parseLocalParcelFile } from "../src/local-reference-interchange";
import { addPoint, EMPTY_DESIGN, stableDesignJson } from "../src/model";
import { normalizedMapCoordinate } from "../src/map-contract";

function measuredDesign() {
  let design = addPoint(EMPTY_DESIGN, { id: "point-a", xMm: 1_000, yMm: 2_000 });
  design = addPoint(design, { id: "point-b", xMm: 7_096, yMm: 2_000 }, "run-1");
  return addPoint(design, { id: "point-c", xMm: 7_096, yMm: 5_048 }, "run-2");
}

describe("provider-neutral ground/map interchange", () => {
  const design = measuredDesign();
  const registration = registrationAtDesignOrigin(design, normalizedMapCoordinate("-83.9200000", "35.9600000"), 37);

  it("round-trips integer-millimeter geometry without making the renderer authoritative", () => {
    const before = stableDesignJson(design);
    for (const point of design.points) {
      const roundTrip = mapToLocalGround(localGroundToMap(point, registration), registration);
      expect(Math.abs(roundTrip.xMm - point.xMm)).toBeLessThanOrEqual(7);
      expect(Math.abs(roundTrip.yMm - point.yMm)).toBeLessThanOrEqual(7);
    }
    expect(projectFenceDesignToMap(design, registration).runs).toHaveLength(2);
    expect(stableDesignJson(design)).toBe(before);
  });

  it("exports local GeoJSON and KML with explicit non-verification metadata", () => {
    const geoJson = fenceGeoJson(design, registration);
    expect(geoJson.properties).toEqual({ authority: "mckenzie-integer-mm", provenance: "not-attached", verification: "not-asserted" });
    expect(geoJson.features).toHaveLength(2);
    const kml = fenceKml(design, registration);
    expect(kml).toContain("mckenzie-integer-mm");
    expect(kml).toContain("verification");
    expect(stableDesignJson(design)).toBe(stableDesignJson(measuredDesign()));
  });

  it("sanitizes permitted parcel geometry and rejects unsafe or invalid input", () => {
    const parcel = normalizeParcelGeoJson({ type: "FeatureCollection", features: [{ type: "Feature", properties: { customer: "must-not-survive" }, geometry: { type: "LineString", coordinates: [[-83.92, 35.96], [-83.919, 35.961]] } }] });
    expect(parcel.features[0].properties).toEqual({ layer: "parcel-reference" });
    expect(() => normalizeParcelGeoJson({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-83.92, 35.96] } }] })).toThrow(/unsupported/i);
    expect(() => normalizeParcelGeoJson({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[181, 35], [-83, 35]] } }] })).toThrow(/WGS84/i);
  });

  it("parses local KML without network or entity expansion", () => {
    const parcel = parseLocalParcelFile("parcel.kml", `<?xml version="1.0"?><kml><LineString><coordinates>-83.92,35.96,0 -83.919,35.961,0</coordinates></LineString></kml>`);
    expect(parcel.features[0].geometry.type).toBe("LineString");
    expect(() => parseLocalParcelFile("parcel.kml", `<!DOCTYPE kml [<!ENTITY x SYSTEM "file:///etc/passwd">]><kml/>`)).toThrow(/entities/i);
    expect(() => parseLocalParcelFile("parcel.csv", "x,y")).toThrow(/GeoJSON, JSON, or KML/i);
  });
});
