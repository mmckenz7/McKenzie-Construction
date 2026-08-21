export type ConsultationHours = {
  start: string;
  end: string;
};

export const DEFAULT_CONSULTATION_HOURS: ConsultationHours = {
  start: "08:00",
  end: "17:00",
};

export const BUSINESS_TIME_ZONE = "America/New_York";

function timeZoneOffsetMilliseconds(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  ) - date.getTime();
}

export function consultationDateTimeToDate(value: string) {
  const localMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);

  if (!localMatch) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const [, year, month, day, hour, minute] = localMatch;
  const wallClockUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  let instant = wallClockUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = wallClockUtc - timeZoneOffsetMilliseconds(new Date(instant));
    if (next === instant) break;
    instant = next;
  }

  const parsed = new Date(instant);
  const confirmation = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed);
  const confirmed = Object.fromEntries(
    confirmation
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return confirmed.year === year &&
    confirmed.month === month &&
    confirmed.day === day &&
    confirmed.hour === hour &&
    confirmed.minute === minute
    ? parsed
    : null;
}

function minutes(value: string) {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]);
  return total >= 0 && total <= 24 * 60 ? total : null;
}

export function consultationTimeOptions(
  hours: Partial<ConsultationHours> = {},
) {
  const start = minutes(hours.start ?? DEFAULT_CONSULTATION_HOURS.start) ?? 480;
  const end = minutes(hours.end ?? DEFAULT_CONSULTATION_HOURS.end) ?? 1020;
  if (start >= end) return [];

  const first = Math.ceil(start / 30) * 30;
  const options: Array<{ value: string; label: string }> = [];
  for (let value = first; value <= end; value += 30) {
    const hour = Math.floor(value / 60);
    const minute = value % 60;
    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    options.push({
      value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      label: `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`,
    });
  }
  return options;
}

export function isConsultationTimeAllowed(
  value: string,
  hours: Partial<ConsultationHours> = {},
) {
  return consultationTimeOptions(hours).some((option) => option.value === value.slice(0, 5));
}

export function consultationTimeFromDateTime(value: string) {
  const match = /T(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}` : "";
}

export function isConsultationDateTimeAllowed(
  value: string,
  hours: Partial<ConsultationHours> = {},
) {
  const time = consultationTimeFromDateTime(value);
  return Boolean(time) && isConsultationTimeAllowed(time, hours);
}
