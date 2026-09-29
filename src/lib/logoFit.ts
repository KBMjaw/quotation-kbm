/**
 * Logo preparation for headers: trims transparent / white margins so the visible artwork
 * fills the space, and reports the trimmed aspect ratio (width ÷ height). Browser only.
 */
export interface PreparedLogo {
  src: string;
  aspect: number;
}

const cache = new Map<string, Promise<PreparedLogo>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load logo"));
    img.src = src;
  });
}

/** Bounding box of pixels that are neither (near-)transparent nor (near-)white. */
export function contentBounds(data: Uint8ClampedArray, w: number, h: number) {
  let top = h, left = w, right = -1, bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      const nearWhite = data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245;
      if (a > 16 && !nearWhite) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** Draws `img` trimmed to its content onto a canvas (with a 1% margin). */
export function trimToCanvas(img: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement | null {
  const w = "naturalWidth" in img ? img.naturalWidth : img.width;
  const h = "naturalHeight" in img ? img.naturalHeight : img.height;
  if (!w || !h) return null;
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const ctx = src.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const box = contentBounds(ctx.getImageData(0, 0, w, h).data, w, h);
  if (!box) return null;
  const pad = Math.round(Math.max(box.width, box.height) * 0.01);
  const x = Math.max(0, box.left - pad);
  const y = Math.max(0, box.top - pad);
  const out = document.createElement("canvas");
  out.width = Math.min(w - x, box.width + pad * 2);
  out.height = Math.min(h - y, box.height + pad * 2);
  out.getContext("2d")!.drawImage(src, x, y, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

export function prepareLogo(url: string): Promise<PreparedLogo> {
  let p = cache.get(url);
  if (!p) {
    p = (async () => {
      const img = await loadImage(url);
      const fallback = { src: url, aspect: img.naturalWidth / img.naturalHeight || 1 };
      try {
        const c = trimToCanvas(img);
        return c ? { src: c.toDataURL("image/png"), aspect: c.width / c.height } : fallback;
      } catch {
        return fallback; // e.g. cross-origin image without CORS: use it untrimmed
      }
    })().catch(() => ({ src: url, aspect: 1 }));
    cache.set(url, p);
  }
  return p;
}
