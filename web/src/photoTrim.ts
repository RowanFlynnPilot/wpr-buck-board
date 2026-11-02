// A screenshot of a photo (from a phone's gallery, or saved off Facebook) brings solid bands above
// and below it, or beside it, that the board's crops would show as black bars. Find the photo
// inside them: edge rows and columns that are nearly all flat near-black or near-white (a status
// bar's few icons allowed) are left out, as long as at least half the picture remains each way, so a
// night photo's dark sky stays; between bands of about equal size, as a phone's viewer centres a
// photo, a quarter will do, since a landscape screenshotted on a phone is about a third of the
// screen. Photos are stored as sent; every crop (useTrimmedCrop) and every drawn image
// (shareCard.ts) keeps to the box.
//
// Under a top band the picture starts where whoever posted it framed it, often at the hunter's
// head, so crops of a banded photo hang from its top rather than 30% down (Nov. 1: the first real
// entry, cropped 30% down inside its box, lost the hunter's eyes).
export type Box = { x: number; y: number; w: number; h: number };

export const cropBias = (box: Box) => (box.y > 0 ? 0 : 0.3);

const SAMPLE = 200; // the long edge the bands are looked for at
const FLAT_SHARE = 0.94;

// Pixels of part of the image, drawn at the given size; null where the canvas can't read them (a
// cross-origin image without permission).
function pixels(source: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
  try {
    return ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
}

// Whether a line of pixels (`count` of them, `step` apart from index `start`) is band, not picture.
function flatLine(data: Uint8ClampedArray, start: number, step: number, count: number) {
  let flat = 0;
  for (let k = 0, i = start * 4; k < count; k++, i += step * 4) {
    const hi = Math.max(data[i], data[i + 1], data[i + 2]);
    const lo = Math.min(data[i], data[i + 1], data[i + 2]);
    if (hi <= 24 || lo >= 236) flat++;
  }
  return flat >= count * FLAT_SHARE;
}

export function contentBox(source: CanvasImageSource, width: number, height: number): Box {
  const whole = { x: 0, y: 0, w: width, h: height };
  const scale = Math.min(1, SAMPLE / Math.max(width, height));
  const sw = Math.max(1, Math.round(width * scale));
  const sh = Math.max(1, Math.round(height * scale));
  const data = pixels(source, 0, 0, width, height, sw, sh);
  if (!data) return whole; // can't read it: draw it as it is

  // A first look at the small copy.
  const rowFlat = (y: number) => flatLine(data, y * sw, 1, sw);
  const columnFlat = (x: number, from: number, to: number) => flatLine(data, from * sw + x, sw, to - from);
  const kept = (start: number, end: number, size: number) =>
    end - start >= size * (Math.abs(start - (size - end)) <= size * 0.08 ? 0.25 : 0.5);
  let top = 0;
  while (top < sh && rowFlat(top)) top++;
  let bottom = sh;
  while (bottom > top && rowFlat(bottom - 1)) bottom--;
  if (!kept(top, bottom, sh)) [top, bottom] = [0, sh];
  let left = 0;
  while (left < sw && columnFlat(left, top, bottom)) left++;
  let right = sw;
  while (right > left && columnFlat(right - 1, top, bottom)) right--;
  if (!kept(left, right, sw)) [left, right] = [0, sw];
  if (top === 0 && bottom === sh && left === 0 && right === sw) return whole;

  // That finds each band's edge to within a sample (8px of a 1600px photo). Look again there at
  // full resolution and keep every line of the picture, less the one the JPEG blends with the band.
  const span = (edge: number, size: number) => [Math.max(0, Math.floor((edge - 1) / scale)), Math.min(size, Math.ceil((edge + 1) / scale))];
  let y0 = 0;
  let y1 = height;
  if (top > 0) {
    const [from, to] = span(top, height);
    const strip = pixels(source, 0, from, width, to - from, sw, to - from);
    let r = 0;
    while (strip && r < to - from && flatLine(strip, r * sw, 1, sw)) r++;
    y0 = strip ? Math.min(from + r + 1, height) : Math.round((top + 1) / scale);
  }
  if (bottom < sh) {
    const [from, to] = span(bottom, height);
    const strip = pixels(source, 0, from, width, to - from, sw, to - from);
    let r = to - from;
    while (strip && r > 0 && flatLine(strip, (r - 1) * sw, 1, sw)) r--;
    y1 = strip ? Math.max(from + r - 1, y0 + 1) : Math.round((bottom - 1) / scale);
  }
  let x0 = 0;
  let x1 = width;
  const rows = Math.max(1, Math.min(sh, y1 - y0));
  if (left > 0) {
    const [from, to] = span(left, width);
    const strip = pixels(source, from, y0, to - from, y1 - y0, to - from, rows);
    let c = 0;
    while (strip && c < to - from && flatLine(strip, c, to - from, rows)) c++;
    x0 = strip ? Math.min(from + c + 1, width) : Math.round((left + 1) / scale);
  }
  if (right < sw) {
    const [from, to] = span(right, width);
    const strip = pixels(source, from, y0, to - from, y1 - y0, to - from, rows);
    let c = to - from;
    while (strip && c > 0 && flatLine(strip, c - 1, to - from, rows)) c--;
    x1 = strip ? Math.max(from + c - 1, x0 + 1) : Math.round((right - 1) / scale);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
