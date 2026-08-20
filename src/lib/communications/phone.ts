export function normalizedPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function e164UsPhone(value: string) {
  const normalized = normalizedPhone(value);
  return normalized.length === 10 ? `+1${normalized}` : null;
}

export function comparableDestination(value: string) {
  const trimmed = value.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : normalizedPhone(trimmed);
}
