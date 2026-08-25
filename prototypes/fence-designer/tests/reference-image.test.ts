import { describe, expect, it } from "vitest";
import { captureReferenceDisplay, readReferenceImageFromClipboard, referenceImageErrorMessage } from "../src/reference-image";

describe("desktop reference image acquisition", () => {
  it("explains when clipboard support is unavailable", async () => {
    await expect(readReferenceImageFromClipboard({} as Clipboard)).rejects.toThrow("does not support pasting images");
  });

  it("rejects a clipboard that contains no image", async () => {
    const clipboard = { read: async () => [{ types: ["text/plain"], getType: async () => new Blob(["text"], { type: "text/plain" }) }] } as unknown as Clipboard;
    await expect(readReferenceImageFromClipboard(clipboard)).rejects.toThrow("No image was found");
  });

  it("explains when display capture is unavailable", async () => {
    await expect(captureReferenceDisplay({} as MediaDevices)).rejects.toThrow("does not support tab capture");
  });

  it("turns a canceled capture into a non-destructive status message", () => {
    expect(referenceImageErrorMessage(new DOMException("Canceled", "NotAllowedError"), "capture")).toBe("Map-tab capture was canceled. Nothing was saved.");
  });
});
