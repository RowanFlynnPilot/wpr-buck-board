import { useEffect, useRef } from "react";
import { contentBox, cropBias, type Box } from "./photoTrim";

// Keeps a cropped photo's window on the picture, not a screenshot's solid bands. Once the photo
// loads, its content box is measured (photoTrim.ts) and object-position set so the crop, centred
// and hung from the picture's top (cropBias), falls inside it; where the frame is still taller or
// wider than the picture (an upright 4:5 frame round a squarer picture), the photo is zoomed in
// just enough that the picture fills it, clipped by CropPhoto's wrapper. Remeasured as the frame
// changes size. A photo without bands is left to the stylesheet. The image needs
// crossOrigin="anonymous" so its pixels can be read; storage serves photos to any origin.
export function useTrimmedCrop(src: string) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = ref.current;
    if (!img) return;
    let box: Box | null = null;
    const place = () => {
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const w = img.clientWidth;
      const h = img.clientHeight;
      if (!box || !W || !w || !h) return;
      const bias = cropBias(box);
      // object-fit: cover shows a window of the photo; place it on the picture.
      const s = Math.max(w / W, h / H);
      const vw = w / s;
      const vh = h / s;
      const offset = (size: number, view: number, start: number, length: number, b: number) =>
        Math.min(Math.max(start + (length - view) * (view > length ? 0.5 : b), 0), Math.max(0, size - view));
      const ox = offset(W, vw, box.x, box.w, 0.5);
      const oy = offset(H, vh, box.y, box.h, bias);
      const percent = (o: number, size: number, view: number) => (size - view < 1 ? 50 : (o / (size - view)) * 100);
      img.style.objectPosition = `${percent(ox, W, vw).toFixed(1)}% ${percent(oy, H, vh).toFixed(1)}%`;

      // Zoom in where the window is bigger than the picture, about the point that keeps the
      // picture's top (or centre, side to side) where the crop wants it.
      const k = Math.max(1, vw / box.w, vh / box.h);
      if (k < 1.005) {
        img.style.transform = "";
        return;
      }
      const cw = box.w * s;
      const ch = box.h * s;
      const cx0 = (box.x - ox) * s;
      const cy0 = (box.y - oy) * s;
      const px = ((cw * k - w) * 0.5 + cx0 * k) / (k - 1);
      const py = ((ch * k - h) * bias + cy0 * k) / (k - 1);
      img.style.transformOrigin = `${px.toFixed(1)}px ${py.toFixed(1)}px`;
      img.style.transform = `scale(${k.toFixed(4)})`;
    };
    const measure = () => {
      const found = contentBox(img, img.naturalWidth, img.naturalHeight);
      if (found.w >= img.naturalWidth && found.h >= img.naturalHeight) return;
      box = found;
      place();
    };
    if (img.complete && img.naturalWidth) measure();
    else img.addEventListener("load", measure, { once: true });
    const observer = new ResizeObserver(place);
    observer.observe(img);
    return () => {
      observer.disconnect();
      img.removeEventListener("load", measure);
      img.style.objectPosition = "";
      img.style.transform = "";
      img.style.transformOrigin = "";
    };
  }, [src]);
  return ref;
}
