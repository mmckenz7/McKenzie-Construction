export const AI_ESTIMATOR_STORAGE_BUCKET = "ai-estimator-private";
export const AI_ESTIMATOR_MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const AI_ESTIMATOR_SIGNED_UPLOAD_TTL_SECONDS = 2 * 60 * 60;

export const AI_ESTIMATOR_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export const AI_ESTIMATOR_ASSET_SELECT =
  "id,case_id,asset_kind,origin,storage_bucket,storage_path,original_filename,mime_type,declared_byte_size,declared_sha256,byte_size,sha256,storage_reported_mime_type,status,created_at,updated_at";

const SHA256 = /^[0-9a-f]{64}$/;
const CREATE_FIELDS = new Set([
  "originalFilename",
  "mimeType",
  "byteSize",
  "sha256",
]);

export type AiEstimatorVideoUploadInput = {
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
};

function safeOriginalFilename(value: unknown) {
  if (typeof value !== "string") {
    throw new TypeError("originalFilename is required.");
  }
  const filename = value.normalize("NFKC").trim();
  if (
    filename.length < 1 ||
    filename.length > 240 ||
    /[\\/\u0000-\u001f\u007f]/.test(filename)
  ) {
    throw new TypeError("originalFilename is invalid.");
  }
  return filename;
}

export function parseVideoUploadInput(value: unknown): AiEstimatorVideoUploadInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("A JSON object is required.");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !CREATE_FIELDS.has(key))) {
    throw new TypeError("The request contains unsupported fields.");
  }

  const originalFilename = safeOriginalFilename(record.originalFilename);
  if (
    typeof record.mimeType !== "string" ||
    !AI_ESTIMATOR_VIDEO_MIME_TYPES.has(record.mimeType)
  ) {
    throw new TypeError("mimeType must be an allowed V0 video type.");
  }
  if (
    typeof record.byteSize !== "number" ||
    !Number.isSafeInteger(record.byteSize) ||
    record.byteSize < 1 ||
    record.byteSize > AI_ESTIMATOR_MAX_VIDEO_BYTES
  ) {
    throw new TypeError("byteSize must be between 1 byte and 50 MB.");
  }
  if (typeof record.sha256 !== "string" || !SHA256.test(record.sha256)) {
    throw new TypeError("sha256 must be a lowercase hexadecimal SHA-256 digest.");
  }

  return {
    originalFilename,
    mimeType: record.mimeType,
    byteSize: record.byteSize,
    sha256: record.sha256,
  };
}

export function storageObjectFilename(filename: string) {
  const safe = filename
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
  return safe || "jobsite-video";
}

export function aiEstimatorAssetPath(
  companyId: string,
  caseId: string,
  assetId: string,
  filename: string,
) {
  return `${companyId}/${caseId}/${assetId}/${storageObjectFilename(filename)}`;
}

export function normalizeStorageContentType(value: string | undefined) {
  return value?.split(";", 1)[0].trim().toLowerCase() ?? "";
}

export function projectAiEstimatorAsset(value: Record<string, unknown>) {
  return {
    id: String(value.id),
    caseId: String(value.case_id),
    kind: String(value.asset_kind),
    originalFilename: String(value.original_filename),
    mimeType: String(value.mime_type),
    declaredByteSize: Number(value.declared_byte_size),
    byteSize: typeof value.byte_size === "number" ? value.byte_size : null,
    status: String(value.status),
    createdAt: String(value.created_at),
    updatedAt: String(value.updated_at),
  };
}
