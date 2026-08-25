export type RasterizedReferenceImage = Readonly<{ src: string; widthPx: number; heightPx: number }>;

const MAX_IMAGE_EDGE_PX = 2_000;
const JPEG_QUALITY = 0.84;

function canvasFor(widthPx: number, heightPx: number): Readonly<{ canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }> {
  if (!Number.isFinite(widthPx) || widthPx <= 0 || !Number.isFinite(heightPx) || heightPx <= 0) throw new RangeError("The captured reference needs valid dimensions.");
  const scale = Math.min(1, MAX_IMAGE_EDGE_PX / Math.max(widthPx, heightPx));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(widthPx * scale));
  canvas.height = Math.max(1, Math.round(heightPx * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the captured image.");
  return Object.freeze({ canvas, context });
}

function rasterizeDrawable(drawable: CanvasImageSource, widthPx: number, heightPx: number): RasterizedReferenceImage {
  const { canvas, context } = canvasFor(widthPx, heightPx);
  context.drawImage(drawable, 0, 0, canvas.width, canvas.height);
  return Object.freeze({ src: canvas.toDataURL("image/jpeg", JPEG_QUALITY), widthPx: canvas.width, heightPx: canvas.height });
}

export async function rasterizeReferenceBlob(blob: Blob): Promise<RasterizedReferenceImage> {
  if (!blob.type.startsWith("image/")) throw new TypeError("Choose an image from the clipboard or device.");
  const bitmap = await createImageBitmap(blob);
  try { return rasterizeDrawable(bitmap, bitmap.width, bitmap.height); }
  finally { bitmap.close(); }
}

export async function readReferenceImageFromClipboard(clipboard: Pick<Clipboard, "read">): Promise<RasterizedReferenceImage> {
  if (!clipboard?.read) throw new RangeError("This browser does not support pasting images. Use Capture map tab or Upload file instead.");
  const items = await clipboard.read();
  for (const item of items) {
    const type = item.types.find((candidate) => candidate.startsWith("image/"));
    if (type) return rasterizeReferenceBlob(await item.getType(type));
  }
  throw new RangeError("No image was found on the clipboard. Copy a screenshot, then try again.");
}

export async function captureReferenceDisplay(mediaDevices: Pick<MediaDevices, "getDisplayMedia">): Promise<RasterizedReferenceImage> {
  if (!mediaDevices?.getDisplayMedia) throw new RangeError("This browser does not support tab capture. Use Paste image or Upload file instead.");
  const stream = await mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement("video");
    video.muted = true; video.playsInline = true; video.srcObject = stream;
    await video.play();
    if (!video.videoWidth || !video.videoHeight) await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("The selected tab did not provide a visible frame."));
    });
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return rasterizeDrawable(video, video.videoWidth, video.videoHeight);
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

export function referenceImageErrorMessage(error: unknown, action: "capture" | "paste" | "upload"): string {
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError")) {
    return action === "capture" ? "Map-tab capture was canceled. Nothing was saved." : "Clipboard image access was not allowed. Nothing was saved.";
  }
  if (error instanceof Error) return error.message;
  return action === "capture" ? "The selected map tab could not be captured." : action === "paste" ? "The clipboard image could not be pasted." : "The local reference image could not be read.";
}
