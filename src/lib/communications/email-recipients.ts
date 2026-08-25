const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MAX_SECONDARY_EMAIL_RECIPIENTS = 20;

export type PreparedEmailRecipients = Readonly<{
  ccRecipients: string[];
  bccRecipients: string[];
  error: string | null;
}>;

function parseList(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return { recipients: [] as string[], error: null };
  const values = value.split(/[;,]/).map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  if (values.some((entry) => !EMAIL_PATTERN.test(entry))) {
    return { recipients: [] as string[], error: "Enter valid email addresses separated by commas." };
  }
  return { recipients: [...new Set(values)], error: null };
}

export function prepareSecondaryEmailRecipients(
  primaryRecipient: string,
  ccValue: unknown,
  bccValue: unknown,
): PreparedEmailRecipients {
  const cc = parseList(ccValue);
  if (cc.error) return { ccRecipients: [], bccRecipients: [], error: `Cc: ${cc.error}` };
  const bcc = parseList(bccValue);
  if (bcc.error) return { ccRecipients: [], bccRecipients: [], error: `Bcc: ${bcc.error}` };

  const primary = primaryRecipient.trim().toLowerCase();
  const seen = new Set(primary ? [primary] : []);
  const ccRecipients = cc.recipients.filter((recipient) => {
    if (seen.has(recipient)) return false;
    seen.add(recipient);
    return true;
  });
  const bccRecipients = bcc.recipients.filter((recipient) => {
    if (seen.has(recipient)) return false;
    seen.add(recipient);
    return true;
  });
  if (ccRecipients.length + bccRecipients.length > MAX_SECONDARY_EMAIL_RECIPIENTS) {
    return {
      ccRecipients: [],
      bccRecipients: [],
      error: `Use no more than ${MAX_SECONDARY_EMAIL_RECIPIENTS} Cc and Bcc recipients combined.`,
    };
  }
  return { ccRecipients, bccRecipients, error: null };
}

export function emailRecipientsFromMetadata(value: unknown, key: "cc_recipients" | "bcc_recipients") {
  if (!value || typeof value !== "object") return [];
  const recipients = (value as Record<string, unknown>)[key];
  if (!Array.isArray(recipients)) return [];
  return recipients.filter((recipient): recipient is string => typeof recipient === "string" && EMAIL_PATTERN.test(recipient));
}
