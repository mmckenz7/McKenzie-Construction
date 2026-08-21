export function hasValidScheduleRequestDurations(
  demoDurationDays: unknown,
  totalDurationDays: unknown,
) {
  return (
    typeof demoDurationDays === "number" &&
    typeof totalDurationDays === "number" &&
    Number.isInteger(demoDurationDays) &&
    Number.isInteger(totalDurationDays) &&
    demoDurationDays >= 0 &&
    demoDurationDays <= 30 &&
    totalDurationDays >= 1 &&
    totalDurationDays >= demoDurationDays &&
    totalDurationDays <= 120
  );
}
