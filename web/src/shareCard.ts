// The image a shared deer previews with, 1200x630 (Facebook's size), in the board's counter-wall
// look: on the dark band, the photo as a print (white border, a strip of tape, a little off true)
// on the left; on the right WPR's flag, the board's title, the presenting sponsor with its logo on
// a white card, and the hunter's name and deer, in cream. Staff browsers draw it (#/admin: posting a deer, editing a posted one,
// Remake all), since only staff may store it (migration 0008). The fonts and WPR badge are the
// app's own; the photo and logo come from public storage, which allows cross-origin reads, so
// the canvas can still be exported.
import { loadCardFacts, saveShareCard, type CardFacts } from "./data";
import { apDay, describeDeer, WEAPON_LABELS } from "./format";
import { contentBox, cropBias, type Box } from "./photoTrim";
import { logoUrl, photoUrl } from "./storage";

export const CARD = { width: 1200, height: 630 };

const PHOTO_WIDTH = 600;
const PAD = 52;
const TEXT_X = PHOTO_WIDTH + PAD;
const TEXT_WIDTH = CARD.width - PHOTO_WIDTH - 2 * PAD;
const FOOT = CARD.height - PAD;
const COLOR = {
  ink: "#1e2622",
  blaze: "#f26a1b",
  print: "#fffdf8",
  tape: "rgba(240, 232, 214, 0.88)",
  cream: "#f6f2e9",
  // The band's quieter lines, as on the board: cream at 72 and 86 percent.
  quiet: "rgba(246, 242, 233, 0.72)",
  soft: "rgba(246, 242, 233, 0.86)",
};
const DISPLAY = "Fraunces, Georgia, serif";
const BODY = '"Public Sans", system-ui, sans-serif';

// Draw a deer's card from what the database says now, store it, and make it the one its share
// link uses.
export async function makeShareCard(entryId: string): Promise<void> {
  const card = await drawShareCard(await loadCardFacts(entryId));
  await saveShareCard(entryId, card);
}

export async function drawShareCard(facts: CardFacts): Promise<Blob> {
  const [photo, badge, logo] = await Promise.all([
    loadImage(photoUrl(facts.entry.photo_id, "full")),
    loadImage(`${import.meta.env.BASE_URL}wpr-typewriter-badge.png`),
    // A card without the logo still names the sponsor.
    facts.presenting?.logo_path ? loadImage(logoUrl(facts.presenting.logo_path)).catch(() => null) : null,
    document.fonts.load(`700 50px ${DISPLAY}`),
    document.fonts.load(`500 27px ${DISPLAY}`),
    document.fonts.load(`400 24px ${BODY}`),
    document.fonts.load(`700 24px ${BODY}`),
  ]);
  try {
    return await toJpeg(paint(facts, photo, badge, logo));
  } catch (error) {
    // Some browsers refuse to export a canvas with an SVG drawn on it; try once without the logo.
    if (!logo || !(error instanceof DOMException && error.name === "SecurityError")) throw error;
    return toJpeg(paint(facts, photo, badge, null));
  }
}

function paint({ entry, year, presenting }: CardFacts, photo: HTMLImageElement, badge: HTMLImageElement, logo: HTMLImageElement | null) {
  const canvas = document.createElement("canvas");
  canvas.width = CARD.width;
  canvas.height = CARD.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw share images. Try another browser.");

  ctx.fillStyle = COLOR.ink;
  ctx.fillRect(0, 0, CARD.width, CARD.height);
  // The blaze band that runs along the top of the board.
  ctx.fillStyle = COLOR.blaze;
  ctx.fillRect(0, 0, CARD.width, 10);
  // The print fills its room, unless the photo is a landscape: then it's 4:3, centred there.
  const print = fitPrint(photo, { x: 50, y: 52, w: 500, h: 540 }, 14, 24, null);
  drawPrint(ctx, photo, { ...print, border: 14, foot: 24, angle: -2, firstDeer: entry.first_deer, scale: 1 });

  // The flag: WPR's badge and name over the thick-over-thin rule.
  let y = 48;
  // The badge file is a circle on a white square; clip to the circle so no white shows on paper.
  ctx.save();
  ctx.beginPath();
  ctx.arc(TEXT_X + 30, y + 30, 30, 0, 2 * Math.PI);
  ctx.clip();
  ctx.drawImage(badge, TEXT_X, y, 60, 60);
  ctx.restore();
  ctx.fillStyle = COLOR.soft;
  ctx.font = `700 17px ${BODY}`;
  ctx.textBaseline = "middle";
  ctx.letterSpacing = "2.5px";
  ctx.fillText("WAUSAU PILOT & REVIEW", TEXT_X + 76, y + 31);
  ctx.letterSpacing = "0px";
  ctx.textBaseline = "alphabetic";
  y += 84;
  ctx.fillStyle = COLOR.cream;
  ctx.fillRect(TEXT_X, y, TEXT_WIDTH, 4);
  ctx.fillRect(TEXT_X, y + 8, TEXT_WIDTH, 1.5);

  // The board's title and who presents it.
  y += 30;
  const title = fit(ctx, "Hunting Brag Board", (size) => `700 ${size}px ${DISPLAY}`, 1, 50, 36);
  y += title.size;
  ctx.fillText(title.lines[0], TEXT_X, y);
  ctx.fillStyle = COLOR.quiet;
  const presents = fit(ctx, presenting ? `presented by ${presenting.name}` : `${year} season`, (size) => `500 ${size}px ${DISPLAY}`, 2, 27, 20);
  for (const line of presents.lines) {
    y += Math.round(presents.size * 1.3);
    ctx.fillText(line, TEXT_X, y);
  }
  if (logo) {
    y += 16;
    y += drawLogoCard(ctx, logo, TEXT_X, y, 200, 56, 6);
  }
  const topEnd = y;

  // The deer, from the foot up: where and when, what, the hometown, then the name in whatever
  // room is left (a youth hunter is a first name; an adult can be up to 60 characters).
  const record = [
    { text: `${entry.county} County, ${apDay(entry.harvest_date).replace(" ", " ")}`, color: COLOR.quiet, weight: 400 },
    { text: `${describeDeer(entry.deer_type, entry.points)}, ${WEAPON_LABELS[entry.weapon].toLowerCase()}`, color: COLOR.cream, weight: 700 },
    { text: entry.hometown, color: COLOR.quiet, weight: 400 },
  ];
  let base = FOOT;
  for (const { text, color, weight } of record) {
    const line = fit(ctx, text, (size) => `${weight} ${size}px ${BODY}`, 1, 24, 18);
    ctx.fillStyle = color;
    ctx.fillText(line.lines[0], TEXT_X, base);
    base -= 36;
  }
  base -= 10;
  const room = base - topEnd - 24;
  const name = fitName(ctx, entry.hunter_name, room);
  ctx.fillStyle = COLOR.cream;
  name.lines.forEach((line, i) => {
    ctx.font = `700 ${name.size}px ${DISPLAY}`;
    ctx.fillText(line, TEXT_X, base - (name.lines.length - 1 - i) * name.leading);
  });

  return canvas;
}

// Portrait images, drawn from what the board shows and never stored: the Story image
// (1080x1920, for Facebook and Instagram Stories, with the top and bottom 230 px or so left clear
// for Stories' own buttons) and the feed image (1080x1350, Instagram's tallest feed size, which
// Facebook posts take too; staff make one per deer for the Friday pack). The same drawing, with
// different room: readers' browsers draw the first from a card's Share, staff the second.
export const STORY = { width: 1080, height: 1920 };
export const FEED = { width: 1080, height: 1350 };

// `top`: where the flag starts. `foot`: the baseline of the last line about the deer. `scale`:
// the type, against the Story image's sizes.
type Portrait = { width: number; height: number; top: number; foot: number; scale: number };
const STORY_LAYOUT: Portrait = { ...STORY, top: 236, foot: 1560, scale: 1 };
const FEED_LAYOUT: Portrait = { ...FEED, top: 72, foot: 1190, scale: 0.875 };

export function drawStoryCard(facts: CardFacts): Promise<Blob> {
  return drawPortrait(facts, STORY_LAYOUT);
}

export function drawFeedCard(facts: CardFacts): Promise<Blob> {
  return drawPortrait(facts, FEED_LAYOUT);
}

async function drawPortrait(facts: CardFacts, layout: Portrait): Promise<Blob> {
  const [photo, badge, logo] = await Promise.all([
    loadImage(photoUrl(facts.entry.photo_id, "full")),
    loadImage(`${import.meta.env.BASE_URL}wpr-typewriter-badge.png`),
    // A card without the logo (a `?demo` placeholder has none) still names the sponsor.
    facts.presenting?.logo_path ? loadImage(logoUrl(facts.presenting.logo_path)).catch(() => null) : null,
    document.fonts.load(`700 96px ${DISPLAY}`),
    document.fonts.load(`500 46px ${DISPLAY}`),
    document.fonts.load(`400 40px ${BODY}`),
    document.fonts.load(`700 40px ${BODY}`),
  ]);
  try {
    return await toJpeg(paintPortrait(facts, layout, photo, badge, logo));
  } catch (error) {
    if (!logo || !(error instanceof DOMException && error.name === "SecurityError")) throw error;
    return toJpeg(paintPortrait(facts, layout, photo, badge, null));
  }
}

function paintPortrait(
  { entry, year, presenting }: CardFacts,
  L: Portrait,
  photo: HTMLImageElement,
  badge: HTMLImageElement,
  logo: HTMLImageElement | null,
) {
  const { width: W, height: H, scale: s } = L;
  const M = 96;
  const WIDE = W - 2 * M;
  const px = (n: number) => Math.round(n * s);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw share images. Try another browser.");

  ctx.fillStyle = COLOR.ink;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = COLOR.blaze;
  ctx.fillRect(0, 0, W, 16);

  // The flag over the thick-over-thin rule, as on the share card.
  let y = L.top;
  const badgeSize = px(88);
  ctx.save();
  ctx.beginPath();
  ctx.arc(M + badgeSize / 2, y + badgeSize / 2, badgeSize / 2, 0, 2 * Math.PI);
  ctx.clip();
  ctx.drawImage(badge, M, y, badgeSize, badgeSize);
  ctx.restore();
  ctx.fillStyle = COLOR.soft;
  ctx.font = `700 ${px(26)}px ${BODY}`;
  ctx.textBaseline = "middle";
  ctx.letterSpacing = `${px(4)}px`;
  ctx.fillText("WAUSAU PILOT & REVIEW", M + badgeSize + px(24), y + badgeSize / 2 + 2);
  ctx.letterSpacing = "0px";
  ctx.textBaseline = "alphabetic";
  y += badgeSize + px(28);
  ctx.fillStyle = COLOR.cream;
  ctx.fillRect(M, y, WIDE, px(6));
  ctx.fillRect(M, y + px(12), WIDE, 2);

  // The board's title and who presents it.
  y += px(30);
  const title = fit(ctx, "Hunting Brag Board", (size) => `700 ${size}px ${DISPLAY}`, 1, px(96), px(64), WIDE);
  y += title.size;
  ctx.fillText(title.lines[0], M, y);
  ctx.fillStyle = COLOR.quiet;
  const presents = fit(ctx, presenting ? `presented by ${presenting.name}` : `${year} season`, (size) => `500 ${size}px ${DISPLAY}`, 2, px(46), px(32), WIDE);
  for (const line of presents.lines) {
    y += Math.round(presents.size * 1.3);
    ctx.fillText(line, M, y);
  }
  if (logo) {
    y += px(24);
    y += drawLogoCard(ctx, logo, M, y, px(320), px(90), px(10));
  }
  const photoTop = y + px(40);

  // The deer, from the foot up, then the name; the photo takes the room between.
  const FOOT = L.foot;
  const record = [
    { text: `${entry.county} County, ${apDay(entry.harvest_date)}`, color: COLOR.quiet, weight: 400, size: 40 },
    { text: `${describeDeer(entry.deer_type, entry.points)}, ${WEAPON_LABELS[entry.weapon].toLowerCase()}`, color: COLOR.cream, weight: 700, size: 44 },
    { text: entry.hometown, color: COLOR.quiet, weight: 400, size: 40 },
  ];
  let base = FOOT;
  for (const { text, color, weight, size } of record) {
    const line = fit(ctx, text, (n) => `${weight} ${n}px ${BODY}`, 1, px(size), px(size - 12), WIDE);
    ctx.fillStyle = color;
    ctx.fillText(line.lines[0], M, base);
    base -= px(60);
  }
  base -= px(14);
  const name = fitName(ctx, entry.hunter_name, px(230), WIDE, px(96), px(48));
  ctx.fillStyle = COLOR.cream;
  name.lines.forEach((line, i) => {
    ctx.font = `700 ${name.size}px ${DISPLAY}`;
    ctx.fillText(line, M, base - (name.lines.length - 1 - i) * name.leading);
  });
  const photoBottom = base - (name.lines.length - 1) * name.leading - Math.round(name.size * 0.8) - px(40);

  // The print, a little inside the margins so its tilted corners stay on the page, in the photo's
  // own shape (fitPrint): a landscape at 4:3, an upright photo square, as the board's wide-screen
  // lead shows it, rather than a band across the room that cuts off the deer.
  const inset = px(16);
  const border = px(20);
  const foot = px(32);
  drawPrint(ctx, photo, {
    ...fitPrint(photo, { x: M + inset, y: photoTop, w: WIDE - 2 * inset, h: photoBottom - photoTop }, border, foot, 1),
    border,
    foot,
    angle: -1.5,
    firstDeer: entry.first_deer,
    scale: 1.6 * s,
  });

  // Where to find it: an image can't carry a link itself.
  const where = "See the board at wausaupilotandreview.com";
  ctx.font = `700 ${px(34)}px ${BODY}`;
  const pill = ctx.measureText(where).width + px(72);
  ctx.fillStyle = COLOR.blaze;
  ctx.beginPath();
  ctx.roundRect((W - pill) / 2, FOOT + px(46), pill, px(80), px(40));
  ctx.fill();
  ctx.fillStyle = COLOR.ink;
  ctx.textAlign = "center";
  ctx.fillText(where, W / 2, FOOT + px(98));
  ctx.textAlign = "left";

  return canvas;
}

// The name at the largest size, on one line or two, that fits the width and the room left.
function fitName(ctx: CanvasRenderingContext2D, name: string, room: number, width = TEXT_WIDTH, max = 56, min = 26) {
  for (let size = max; size >= min; size -= 2) {
    ctx.font = `700 ${size}px ${DISPLAY}`;
    const lines = wrap(ctx, name, width);
    const leading = Math.round(size * 1.08);
    const height = size * 0.75 + (lines.length - 1) * leading;
    if (lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= width) && height <= room) {
      return { size, lines, leading };
    }
  }
  const last = fit(ctx, name, (size) => `700 ${size}px ${DISPLAY}`, 1, min, min, width);
  return { size: last.size, lines: last.lines, leading: 0 };
}

// Words on at most `maxLines` lines at the largest size from `size` down to `min` that fits the
// text column. If nothing fits, the smallest size, cut short with an ellipsis.
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (size: number) => string,
  maxLines: number,
  size: number,
  min: number,
  width = TEXT_WIDTH,
) {
  for (let s = size; s >= min; s -= 1) {
    ctx.font = font(s);
    const lines = wrap(ctx, text, width);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= width)) return { size: s, lines };
  }
  ctx.font = font(min);
  const lines = wrap(ctx, text, width).slice(0, maxLines);
  let last = lines[lines.length - 1];
  while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
  lines[lines.length - 1] = `${last.trimEnd()}…`;
  return { size: min, lines };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width = TEXT_WIDTH): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  return line ? [...lines, line] : lines;
}

// A print in the photo's own shape, as large as the room allows and centred in it: the picture
// (inside any screenshot bands) at 4:3 for a landscape, at `upright` (width over height) for an
// upright photo, or filling the room where that's null.
function fitPrint(photo: HTMLImageElement, room: Box, border: number, foot: number, upright: number | null): Box {
  const picture = contentBox(photo, photo.naturalWidth, photo.naturalHeight);
  const aspect = picture.w > picture.h ? 4 / 3 : upright;
  if (aspect === null) return room;
  const width = Math.min(room.w - 2 * border, (room.h - border - foot) * aspect);
  const w = Math.round(width + 2 * border);
  const h = Math.round(width / aspect + border + foot);
  return { x: room.x + Math.round((room.w - w) / 2), y: room.y + Math.round((room.h - h) / 2), w, h };
}

// Fill the box like the board's cropped thumbnails: centred side to side, and 30% of the way
// down a tall photo (object-position: 50% 30%), so a phone's portrait keeps the hunter's head. A
// screenshot's solid bands are left out, and a banded photo hangs from its top (photoTrim.ts).
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const box = contentBox(img, img.naturalWidth, img.naturalHeight);
  const scale = Math.max(w / box.w, h / box.h);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, box.x + (box.w - sw) / 2, box.y + Math.max(0, box.h - sh) * cropBias(box), sw, sh, x, y, w, h);
}

// The photo as a print: a white border with a deeper foot, a soft shadow, a strip of tape across
// the top and a slight tilt, like a snapshot pinned to the wall. The "First deer" tag sits at the
// photo's foot, tilted with it.
function drawPrint(
  ctx: CanvasRenderingContext2D,
  photo: HTMLImageElement,
  p: { x: number; y: number; w: number; h: number; border: number; foot: number; angle: number; firstDeer: boolean; scale: number },
) {
  ctx.save();
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
  ctx.rotate((p.angle * Math.PI) / 180);
  const left = -p.w / 2;
  const top = -p.h / 2;
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 28 * p.scale;
  ctx.shadowOffsetY = 10 * p.scale;
  ctx.fillStyle = COLOR.print;
  ctx.fillRect(left, top, p.w, p.h);
  ctx.shadowColor = "transparent";
  const photoH = p.h - p.border - p.foot;
  drawCover(ctx, photo, left + p.border, top + p.border, p.w - 2 * p.border, photoH);
  if (p.firstDeer) drawTag(ctx, "First deer", left + p.border + 16 * p.scale, top + p.border + photoH - 16 * p.scale, p.scale);
  // The tape, itself a little off true.
  ctx.rotate((-3 * Math.PI) / 180);
  ctx.fillStyle = COLOR.tape;
  const tapeW = 96 * p.scale;
  const tapeH = 28 * p.scale;
  ctx.fillRect(-tapeW / 2, top - tapeH / 2, tapeW, tapeH);
  ctx.restore();
}

// A sponsor's logo on a white card, so a dark logo still reads on the band; returns the height
// drawn. An SVG without its own size fills the box.
function drawLogoCard(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, pad: number) {
  const iw = img.naturalWidth || w;
  const ih = img.naturalHeight || h;
  const scale = Math.min(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(x, y, dw + 2 * pad, dh + 2 * pad, 6);
  ctx.fill();
  ctx.drawImage(img, x + pad, y + pad, dw, dh);
  return dh + 2 * pad;
}

// The board's "First deer" tag, anchored at its bottom-left corner.
function drawTag(ctx: CanvasRenderingContext2D, text: string, x: number, bottom: number, scale = 1) {
  ctx.font = `700 ${24 * scale}px ${BODY}`;
  const width = ctx.measureText(text).width + 32 * scale;
  ctx.fillStyle = COLOR.blaze;
  ctx.beginPath();
  ctx.roundRect(x, bottom - 44 * scale, width, 44 * scale, 5 * scale);
  ctx.fill();
  ctx.fillStyle = COLOR.ink;
  ctx.fillText(text, x + 16 * scale, bottom - 14 * scale);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${src} for the share image.`));
    img.src = src;
  });
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("This browser couldn't save the share image."))),
      "image/jpeg",
      0.86,
    );
  });
}
