export type MicrosoftAttachmentInput = {
  id?: unknown;
  name?: unknown;
  contentType?: unknown;
  size?: unknown;
  isInline?: unknown;
  "@odata.type"?: unknown;
};

export type AttachmentSummary = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
  kind: "file" | "item" | "reference" | "unknown";
  canDownload: boolean;
};

function attachmentKind(value: unknown): AttachmentSummary["kind"] {
  if (value === "#microsoft.graph.fileAttachment") return "file";
  if (value === "#microsoft.graph.itemAttachment") return "item";
  if (value === "#microsoft.graph.referenceAttachment") return "reference";
  return "unknown";
}

export function safeAttachmentFilename(value: unknown) {
  const clean = typeof value === "string"
    ? value.replace(/[\r\n\0]/g, "").replace(/[\\/]/g, "_").trim()
    : "";
  return clean.slice(0, 180) || "email-attachment";
}

function safeContentType(value: unknown) {
  const baseType = typeof value === "string" ? value.split(";", 1)[0].trim().toLowerCase() : "";
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(baseType)
    ? baseType
    : "application/octet-stream";
}

export function normalizeAttachment(value: MicrosoftAttachmentInput): AttachmentSummary | null {
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!id) return null;
  const kind = attachmentKind(value["@odata.type"]);
  return {
    id,
    name: safeAttachmentFilename(value.name),
    contentType: safeContentType(value.contentType),
    size: typeof value.size === "number" && Number.isSafeInteger(value.size) && value.size >= 0
      ? value.size
      : 0,
    isInline: value.isInline === true,
    kind,
    canDownload: kind === "file" || kind === "item",
  };
}
