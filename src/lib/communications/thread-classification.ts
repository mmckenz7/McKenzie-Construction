export type InternalParticipant = {
  id: string;
  name: string;
  email: string;
};

export type VendorParticipant = {
  id: string;
  name: string;
  emails: string[];
};

type ThreadMessageParticipant = {
  direction: string;
  sender: string;
  recipient: string;
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

export function findVendorThreadParticipant(
  participantAddresses: string[],
  vendors: VendorParticipant[],
) {
  const vendorByEmail = new Map(
    vendors.flatMap((vendor) => vendor.emails.flatMap((value) => {
      const email = normalizedEmail(value);
      return email ? [[email, vendor] as const] : [];
    })),
  );

  for (const address of participantAddresses) {
    const email = normalizedEmail(address);
    if (email && vendorByEmail.has(email)) return vendorByEmail.get(email) ?? null;
  }

  return null;
}

export function automatedConversationLabel(message: ThreadMessageParticipant & { subject?: string | null; body?: string } | null | undefined) {
  if (!message) return null;
  const counterpart = message.direction === "inbound" ? message.sender : message.recipient;
  const email = normalizedEmail(counterpart);
  const localPart = email?.split("@", 1)[0] ?? "";
  if (/^(?:no-?reply|do-?not-?reply|notifications?|mailer-daemon)$/.test(localPart)) return "Automated notification";
  if (/\bunsubscribe\b/i.test(`${message.subject ?? ""}\n${message.body ?? ""}`)) return "Newsletter";
  return null;
}

export function threadCounterpartyAddresses(message: ThreadMessageParticipant | null | undefined) {
  if (!message) return [];
  const address = message.direction === "inbound" ? message.sender : message.recipient;
  return normalizedEmail(address) ? [address] : [];
}
