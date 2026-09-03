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

export type PhoneCandidate = {
  phone?: unknown;
};

export function unassignedSmsCounterpartyPhone(
  participantAddresses: unknown,
  companyPhone: unknown,
) {
  if (!Array.isArray(participantAddresses)) return null;

  const sender = typeof companyPhone === "string"
    ? e164UsPhone(companyPhone)
    : null;
  const counterparties = participantAddresses.flatMap((value) => {
    const phone = typeof value === "string" ? e164UsPhone(value) : null;
    return phone && phone !== sender ? [phone] : [];
  });

  return [...new Set(counterparties)].length === 1
    ? counterparties[0]
    : null;
}

export function phoneCandidatesContain(
  phone: string,
  candidates: PhoneCandidate[],
) {
  const wanted = normalizedPhone(phone);
  return candidates.some((candidate) =>
    typeof candidate.phone === "string" &&
    normalizedPhone(candidate.phone) === wanted,
  );
}
