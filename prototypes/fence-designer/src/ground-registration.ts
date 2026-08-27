import { normalizedMapCoordinate, type NormalizedMapCoordinate } from "./map-presentation";

const EARTH_RADIUS_METERS = 6_378_137;

export type LocalGroundCoordinate = Readonly<{ xMm: number; yMm: number }>;
export type LocalGroundToWgs84Registration = Readonly<{
  localAnchor: LocalGroundCoordinate;
  mapAnchor: NormalizedMapCoordinate;
  xAxisBearingDegrees: number;
}>;

function wholeMillimeter(value: number, label: string) {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must use integer millimeters.`);
  return value;
}

function bearing(value: number) {
  if (!Number.isFinite(value)) throw new TypeError("Registration bearing must be finite.");
  return ((value % 360) + 360) % 360;
}

function coordinateString(value: number) {
  const rounded = Math.round(value * 10_000_000) / 10_000_000;
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(7);
}

export function normalizeGroundRegistration(input: LocalGroundToWgs84Registration): LocalGroundToWgs84Registration {
  return Object.freeze({ localAnchor: Object.freeze({ xMm: wholeMillimeter(input.localAnchor.xMm, "Local anchor X"), yMm: wholeMillimeter(input.localAnchor.yMm, "Local anchor Y") }), mapAnchor: normalizedMapCoordinate(input.mapAnchor.longitude, input.mapAnchor.latitude), xAxisBearingDegrees: bearing(input.xAxisBearingDegrees) });
}

export function localGroundToMap(point: LocalGroundCoordinate, input: LocalGroundToWgs84Registration): NormalizedMapCoordinate {
  const registration = normalizeGroundRegistration(input);
  const dxMeters = (wholeMillimeter(point.xMm, "Point X") - registration.localAnchor.xMm) / 1_000;
  const dyMeters = (wholeMillimeter(point.yMm, "Point Y") - registration.localAnchor.yMm) / 1_000;
  const bearingRadians = registration.xAxisBearingDegrees * Math.PI / 180;
  const eastMeters = Math.sin(bearingRadians) * dxMeters + Math.sin(bearingRadians + Math.PI / 2) * dyMeters;
  const northMeters = Math.cos(bearingRadians) * dxMeters + Math.cos(bearingRadians + Math.PI / 2) * dyMeters;
  const anchorLatitude = Number(registration.mapAnchor.latitude) * Math.PI / 180;
  const latitude = Number(registration.mapAnchor.latitude) + northMeters / EARTH_RADIUS_METERS * 180 / Math.PI;
  const longitude = Number(registration.mapAnchor.longitude) + eastMeters / (EARTH_RADIUS_METERS * Math.cos(anchorLatitude)) * 180 / Math.PI;
  return normalizedMapCoordinate(coordinateString(longitude), coordinateString(latitude));
}

export function mapToLocalGround(coordinate: NormalizedMapCoordinate, input: LocalGroundToWgs84Registration): LocalGroundCoordinate {
  const registration = normalizeGroundRegistration(input);
  const normalized = normalizedMapCoordinate(coordinate.longitude, coordinate.latitude);
  const anchorLatitude = Number(registration.mapAnchor.latitude) * Math.PI / 180;
  const eastMeters = (Number(normalized.longitude) - Number(registration.mapAnchor.longitude)) * Math.PI / 180 * EARTH_RADIUS_METERS * Math.cos(anchorLatitude);
  const northMeters = (Number(normalized.latitude) - Number(registration.mapAnchor.latitude)) * Math.PI / 180 * EARTH_RADIUS_METERS;
  const bearingRadians = registration.xAxisBearingDegrees * Math.PI / 180;
  const dxMeters = Math.sin(bearingRadians) * eastMeters + Math.cos(bearingRadians) * northMeters;
  const dyMeters = Math.sin(bearingRadians + Math.PI / 2) * eastMeters + Math.cos(bearingRadians + Math.PI / 2) * northMeters;
  return Object.freeze({ xMm: registration.localAnchor.xMm + Math.round(dxMeters * 1_000), yMm: registration.localAnchor.yMm + Math.round(dyMeters * 1_000) });
}
