import { useEffect, useRef } from "react";
import { contentBox, cropBias, type Box } from "./photoTrim";

// Keeps a cropped photo's window on the picture, not a screenshot's solid bands. Once the photo
// loads, its content box is measured (photoTrim.ts) and object-position set so the crop, centred
// and hung from the picture's top (cropBias), falls inside it; remeasured as the frame changes size.
// A crop taller or wider than the picture centres on it. A photo without bands is left to the
// stylesheet. The image needs crossOrigin="anonymous" so its pixels can be read; storage serves
// photos to any origin.
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
      const scale = Math.max(w / W, h / H);
      const at = (size: number, view: number, start: number, length: number, bias: number) => {
        if (size - view < 1) return 50;
        const from = Math.min(Math.max(start + (length - view) * (view > length ? 0.5 : bias), 0), size - view);
        return (from / (size - view)) * 100;
      };
      const x = at(W, w / scale, box.x, box.w, 0.5);
      const y = at(H, h / scale, box.y, box.h, cropBias(box));
      img.style.objectPosition = `${x.toFixed(1)}% ${y.toFixed(1)}%`;
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
    };
  }, [src]);
  return ref;
}
