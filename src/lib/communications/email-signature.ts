export const EMAIL_SIGNATURE_LAYOUTS = [
  "off",
  "compact",
  "branded",
] as const;

export type EmailSignatureLayout =
  (typeof EMAIL_SIGNATURE_LAYOUTS)[number];

export const EMAIL_SIGNATURE_RENDERER_VERSION =
  "company-email-signature-v1";

export type EmailSignatureFacts = Readonly<{
  companyName?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  employeeName?: string | null;
  employeeTitle?: string | null;
  employeePhone?: string | null;
  employeeEmail?: string | null;
}>;

export type EmailSignaturePreview = Readonly<{
  layout: EmailSignatureLayout;
  label: string;
  lines: readonly string[];
  logoUrl: string | null;
}>;

type RenderedEmailSignature = Readonly<{
  layout: Exclude<EmailSignatureLayout, "off">;
  version: typeof EMAIL_SIGNATURE_RENDERER_VERSION;
  plainText: string;
  html: string;
  preview: EmailSignaturePreview;
}>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeEmail(value: unknown) {
  const candidate = text(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(candidate)
    ? candidate
    : "";
}

function safeHttpsUrl(value: unknown) {
  const candidate = text(value);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function safeColor(value: unknown, fallback: string) {
  const candidate = text(value);
  return /^#[0-9a-f]{6}$/iu.test(candidate)
    ? candidate.toUpperCase()
    : fallback;
}

function phoneHref(value: string) {
  const candidate = value.replace(/[^\d+]/gu, "");
  return /^\+?\d{7,15}$/u.test(candidate) ? `tel:${candidate}` : "";
}

function linkedLine(label: string, href: string) {
  const safeLabel = escapeHtml(label);
  if (!href) return safeLabel;
  return `<a href="${escapeHtml(href)}" style="color:inherit;text-decoration:none">${safeLabel}</a>`;
}

function contactHtml(phone: string, email: string) {
  return [
    phone ? linkedLine(phone, phoneHref(phone)) : "",
    email ? linkedLine(email, `mailto:${encodeURIComponent(email)}`) : "",
  ].filter(Boolean).join(" &middot; ");
}

export function parseEmailSignatureLayout(
  value: unknown,
): EmailSignatureLayout {
  return EMAIL_SIGNATURE_LAYOUTS.includes(
    value as EmailSignatureLayout,
  )
    ? value as EmailSignatureLayout
    : "off";
}

export function renderEmailSignature(
  layoutInput: unknown,
  facts: EmailSignatureFacts,
): RenderedEmailSignature | null {
  const layout = parseEmailSignatureLayout(layoutInput);
  if (layout === "off") return null;

  const employeeName = text(facts.employeeName);
  if (!employeeName) return null;

  const employeeTitle = text(facts.employeeTitle);
  const employeePhone = text(facts.employeePhone);
  const employeeEmail = safeEmail(facts.employeeEmail);
  const companyName = text(facts.companyName);
  const companyPhone = text(facts.companyPhone);
  const companyEmail = safeEmail(facts.companyEmail);
  const websiteUrl = safeHttpsUrl(facts.websiteUrl);
  const logoUrl = layout === "branded"
    ? safeHttpsUrl(facts.logoUrl)
    : "";
  const primaryColor = safeColor(
    facts.primaryColor,
    "#0F172A",
  );
  const accentColor = safeColor(
    facts.accentColor,
    "#D2A679",
  );

  const employeeContact = [employeePhone, employeeEmail]
    .filter(Boolean)
    .join(" · ");
  const companyContact = layout === "branded"
    ? [companyPhone, companyEmail, websiteUrl]
      .filter(Boolean)
      .join(" · ")
    : "";
  const lines = [
    employeeName,
    employeeTitle,
    employeeContact,
    companyName,
    companyContact,
  ].filter(Boolean);

  const logoHtml = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(companyName || "Company")} logo" width="180" style="display:block;max-width:180px;max-height:64px;margin:0 0 10px" />`
    : "";
  const companyContactParts = [
    companyPhone ? linkedLine(companyPhone, phoneHref(companyPhone)) : "",
    companyEmail ? linkedLine(companyEmail, `mailto:${encodeURIComponent(companyEmail)}`) : "",
    websiteUrl ? linkedLine(websiteUrl, websiteUrl) : "",
  ].filter(Boolean).join(" &middot; ");
  const html = [
    `<div data-company-email-signature="${EMAIL_SIGNATURE_RENDERER_VERSION}" style="margin-top:24px;padding-top:14px;border-top:2px solid ${accentColor};font-family:Arial,sans-serif;font-size:14px;line-height:1.45;color:${primaryColor}">`,
    logoHtml,
    `<strong>${escapeHtml(employeeName)}</strong>`,
    employeeTitle ? `<br />${escapeHtml(employeeTitle)}` : "",
    employeePhone || employeeEmail
      ? `<br />${contactHtml(employeePhone, employeeEmail)}`
      : "",
    companyName ? `<br /><span style="font-weight:600">${escapeHtml(companyName)}</span>` : "",
    companyContactParts ? `<br />${companyContactParts}` : "",
    "</div>",
  ].join("");

  return {
    layout,
    version: EMAIL_SIGNATURE_RENDERER_VERSION,
    plainText: lines.join("\n"),
    html,
    preview: {
      layout,
      label: layout === "branded"
        ? "Branded company signature"
        : "Compact company signature",
      lines,
      logoUrl: logoUrl || null,
    },
  };
}

function messageHtml(value: string) {
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#0F172A">${escapeHtml(value).replace(/\r?\n/gu, "<br />")}</div>`;
}

export function composeSignedEmail(
  authoredBody: string,
  layout: unknown,
  facts: EmailSignatureFacts,
) {
  const signature = renderEmailSignature(layout, facts);
  if (!signature) {
    return {
      text: authoredBody,
      html: messageHtml(authoredBody),
      signature: null,
    } as const;
  }

  const suffix = `\n\n${signature.plainText}`;
  const unsignedBody = authoredBody.endsWith(suffix)
    ? authoredBody.slice(0, -suffix.length)
    : authoredBody;
  return {
    text: `${unsignedBody}${suffix}`,
    html: `${messageHtml(unsignedBody)}${signature.html}`,
    signature: {
      layout: signature.layout,
      version: signature.version,
    },
  } as const;
}

export function plainTextEmailHtml(body: string) {
  return messageHtml(body);
}
