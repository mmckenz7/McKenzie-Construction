export type InternalParticipant = {
  id: string;
  name: string;
  email: string;
};

function normalizedEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function findInternalThreadParticipant(
  participantAddresses: string[],
  teamMembers: InternalParticipant[],
  excludedAddresses: Array<string | null | undefined> = [],
) {
  const excluded = new Set(excludedAddresses.map(normalizedEmail).filter((email): email is string => Boolean(email)));
  const teamByEmail = new Map(
    teamMembers.flatMap((member) => {
      const email = normalizedEmail(member.email);
      return email && !excluded.has(email) ? [[email, member] as const] : [];
    }),
  );

  for (const address of participantAddresses) {
    const email = normalizedEmail(address);
    if (email && teamByEmail.has(email)) return teamByEmail.get(email) ?? null;
  }

  return null;
}
