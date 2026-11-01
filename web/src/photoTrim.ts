// A screenshot of a photo (from a phone's gallery, or saved off Facebook) brings solid bands above
// and below it, or beside it, that the board's crops would show as black bars. Find the photo
// inside them: edge rows and columns that are nearly all flat near-black or near-white (a status
// bar's few icons allowed) are left out, as long as at least half the picture remains each way, so a
// night photo's dark sky stays. Photos are stored as sent; every crop (useTrimmedCrop) and every
// drawn image (shareCard.ts) keeps to the box.
//
// Under a top band the picture starts where whoever posted it framed it, often at the hunter's
// head, so crops of a banded photo hang from its top rather than 30% down (Nov. 1: the first real
// entry, cropped 30% down inside its box, lost the hunter's eyes).
export type Box = { x: number; y: number; w: number; h: number };

export const cropBias = (box: Box) => (box.y > 0 ? 0 : 0.3);

const SAMPLE = 200; // the long edge it's measured at
const FLAT_SHARE = 0.94;

export function contentBox(source: CanvasImageSource, width: number, height: number): Box {
  const whole = { x: 0, y: 0, w: width, h: height };
  const scale = Math.min(1, SAMPLE / Math.max(width, height));
  const sw = Math.max(1, Math.round(width * scale));
  const sh = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return whole;
  ctx.drawImage(source, 0, 0, sw, sh);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, sw, sh).data;
  } catch {
    return whole; // a cross-origin image the canvas can't read: draw it as it is
  }
  const flat = (x: number, y: number) => {
    const i = (y * sw + x) * 4;
    const hi = Math.max(data[i], data[i + 1], data[i + 2]);
    const lo = Math.min(data[i], data[i + 1], data[i + 2]);
    return hi <= 24 || lo >= 236;
  };
  const rowFlat = (y: number) => {
    let n = 0;
    for (let x = 0; x < sw; x++) if (flat(x, y)) n++;
    return n >= sw * FLAT_SHARE;
  };
  const columnFlat = (x: number, top: number, bottom: number) => {
    let n = 0;
    for (let y = top; y < bottom; y++) if (flat(x, y)) n++;
    return n >= (bottom - top) * FLAT_SHARE;
  };

  let top = 0;
  while (top < sh && rowFlat(top)) top++;
  let bottom = sh;
  while (bottom > top && rowFlat(bottom - 1)) bottom--;
  if (bottom - top < sh / 2) [top, bottom] = [0, sh];
  let left = 0;
  while (left < sw && columnFlat(left, top, bottom)) left++;
  let right = sw;
  while (right > left && columnFlat(right - 1, top, bottom)) right--;
  if (right - left < sw / 2) [left, right] = [0, sw];
  if (top === 0 && bottom === sh && left === 0 && right === sw) return whole;

  // One sample in from each cut edge, so the band's soft last row doesn't show.
  if (top > 0) top++;
  if (bottom < sh) bottom--;
  if (left > 0) left++;
  if (right < sw) right--;
  return {
    x: Math.round(left / scale),
    y: Math.round(top / scale),
    w: Math.round((right - left) / scale),
    h: Math.round((bottom - top) / scale),
  };
}
