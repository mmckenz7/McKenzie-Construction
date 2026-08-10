export const MAX_OUTBOUND_ATTACHMENTS = 4;
export const MAX_OUTBOUND_ATTACHMENT_BYTES = 3 * 1024 * 1024;

export const ALLOWED_OUTBOUND_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type OutboundAttachmentCandidate = {
  name: string;
  type: string;
  size: number;
};

export function outboundAttachmentError(
  attachments: readonly OutboundAttachmentCandidate[],
) {
  if (attachments.length > MAX_OUTBOUND_ATTACHMENTS) {
    return `Attach no more than ${MAX_OUTBOUND_ATTACHMENTS} files.`;
  }
  const totalBytes = attachments.reduce((total, attachment) => total + attachment.size, 0);
  if (totalBytes > MAX_OUTBOUND_ATTACHMENT_BYTES) {
    return "Attachments must total 3 MB or less.";
  }
  if (attachments.some((attachment) => attachment.size <= 0)) {
    return "Remove empty attachment files before sending.";
  }
  if (attachments.some((attachment) => !ALLOWED_OUTBOUND_ATTACHMENT_TYPES.has(attachment.type.toLowerCase()))) {
    return "Attach only PDF, JPEG, PNG, WebP, HEIC, or HEIF files.";
  }
  return null;
}
