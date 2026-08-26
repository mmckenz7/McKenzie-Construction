export type ConsultationHours = {
  start: string;
  end: string;
};

export const DEFAULT_CONSULTATION_HOURS: ConsultationHours = {
  start: "08:00",
  end: "17:00",
};

function minutes(value: string) {
  const match = /^(\d{2}):(\d{2})/.exec(value);

  if (!match) {
    return null;
  }

  const total = Number(match[1]) * 60 + Number(match[2]);

  return total >= 0 && total <= 24 * 60 ? total : null;
}

export function consultationTimeOptions(
  hours: Partial<ConsultationHours> = {},
) {
  const start =
    minutes(hours.start ?? DEFAULT_CONSULTATION_HOURS.start) ?? 480;
  const end =
    minutes(hours.end ?? DEFAULT_CONSULTATION_HOURS.end) ?? 1020;

  if (start >= end) {
    return [];
  }

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
  return consultationTimeOptions(hours).some(
    (option) => option.value === value.slice(0, 5),
  );
}
