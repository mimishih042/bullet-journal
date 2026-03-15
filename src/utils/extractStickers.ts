/**
 * Extracts individual stickers from a sticker-sheet photo.
 *
 * Algorithm:
 *  1. Scale image to ≤ MAX_DIM for performance.
 *  2. Edge-seeded flood-fill to find the background (near-white pixels
 *     connected to the image border).  This keeps white areas *inside*
 *     stickers intact, unlike a global threshold approach.
 *  3. Make background pixels transparent.
 *  4. BFS connected-component labeling on the remaining pixels.
 *  5. Filter tiny components (noise), pad bounding boxes, export as PNG.
 */

const MAX_DIM = 1800;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

export async function extractStickersFromSheet(
  file: File,
  options: {
    /** RGB threshold — pixels with all channels ≥ this are treated as
     *  candidate background. Default 228. Lower = stricter (keeps more). */
    bgThreshold?: number;
    /** Minimum pixel area to keep a component (filters dust/noise). */
    minArea?: number;
    /** Transparent padding around each extracted sticker in pixels. */
    padding?: number;
  } = {},
): Promise<string[]> {
  const {
    bgThreshold = 228,
    minArea     = 500,
    padding     = 8,
  } = options;

  const img   = await loadImage(file);
  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
  const W     = Math.round(img.width  * scale);
  const H     = Math.round(img.height * scale);

  // ── Draw to working canvas ────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, W, H);

  const imageData = ctx.getImageData(0, 0, W, H);
  const px = imageData.data; // RGBA flat array

  // ── Step 1: Edge-seeded flood fill to find background ────────────────────
  const isBgCandidate = (p: number) => {
    const i = p << 2;
    return px[i] >= bgThreshold && px[i+1] >= bgThreshold && px[i+2] >= bgThreshold;
  };

  const bg = new Uint8Array(W * H);
  const q: number[] = [];

  const seed = (x: number, y: number) => {
    const p = y * W + x;
    if (!bg[p] && isBgCandidate(p)) { bg[p] = 1; q.push(p); }
  };

  for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
  for (let y = 1; y < H - 1; y++) { seed(0, y); seed(W - 1, y); }

  for (let qi = 0; qi < q.length; qi++) {
    const p = q[qi];
    const x = p % W;
    const y = (p / W) | 0;
    if (x > 0)   { const n = p - 1; if (!bg[n] && isBgCandidate(n)) { bg[n] = 1; q.push(n); } }
    if (x < W-1) { const n = p + 1; if (!bg[n] && isBgCandidate(n)) { bg[n] = 1; q.push(n); } }
    if (y > 0)   { const n = p - W; if (!bg[n] && isBgCandidate(n)) { bg[n] = 1; q.push(n); } }
    if (y < H-1) { const n = p + W; if (!bg[n] && isBgCandidate(n)) { bg[n] = 1; q.push(n); } }
  }

  // Erase background pixels (set alpha = 0)
  for (let p = 0; p < W * H; p++) {
    if (bg[p]) px[(p << 2) | 3] = 0;
  }

  // ── Step 2: Connected-component labeling ─────────────────────────────────
  type Bounds = { x0: number; y0: number; x1: number; y1: number; area: number };
  const label  = new Int32Array(W * H);
  const bounds: Bounds[] = [];

  for (let start = 0; start < W * H; start++) {
    if (label[start] || bg[start] || px[(start << 2) | 3] === 0) continue;

    const id  = bounds.length + 1;
    const cq  = [start];
    label[start] = id;

    let x0 = W, y0 = H, x1 = 0, y1 = 0, area = 0;

    for (let ci = 0; ci < cq.length; ci++) {
      const p  = cq[ci];
      const cx = p % W;
      const cy = (p / W) | 0;
      area++;
      if (cx < x0) x0 = cx;
      if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy;
      if (cy > y1) y1 = cy;

      const push = (n: number) => {
        if (!label[n] && !bg[n] && px[(n << 2) | 3] > 0) { label[n] = id; cq.push(n); }
      };
      if (cx > 0)   push(p - 1);
      if (cx < W-1) push(p + 1);
      if (cy > 0)   push(p - W);
      if (cy < H-1) push(p + W);
    }

    bounds.push({ x0, y0, x1, y1, area });
  }

  // ── Step 3: Write back transparency and export each sticker ──────────────
  ctx.putImageData(imageData, 0, 0);

  return bounds
    .filter(b => b.area >= minArea)
    .map(b => {
      const sx = Math.max(0, b.x0 - padding);
      const sy = Math.max(0, b.y0 - padding);
      const sw = Math.min(W, b.x1 + padding + 1) - sx;
      const sh = Math.min(H, b.y1 + padding + 1) - sy;

      const out = document.createElement('canvas');
      out.width  = sw;
      out.height = sh;
      out.getContext('2d')!.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      return out.toDataURL('image/png');
    });
}
