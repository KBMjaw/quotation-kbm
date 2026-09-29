export const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/**
 * Normalises an uploaded logo to a PNG no larger than `maxSide` px.
 * PNG keeps transparency and is supported by both browsers and the PDF renderer
 * (SVG/WebP are not supported by the PDF engine, so everything is converted).
 */
export async function logoToPng(file: File, maxSide = 600): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file (PNG, JPG, SVG or WebP).");
  if (file.size > MAX_LOGO_BYTES) throw new Error("Logo must be smaller than 5 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Could not read this image."));
      i.src = url;
    });
    const w0 = img.naturalWidth || 600;
    const h0 = img.naturalHeight || 600;
    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing is not supported in this browser.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not convert image."))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
