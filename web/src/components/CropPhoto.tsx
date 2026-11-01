import type { ImgHTMLAttributes } from "react";
import { useTrimmedCrop } from "../useTrimmedCrop";

// A deer photo shown cropped (object-fit: cover): its crop keeps clear of a screenshot's solid
// bands (useTrimmedCrop). crossOrigin lets the page read its pixels; storage allows any origin.
export function CropPhoto({ src, ...rest }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const ref = useTrimmedCrop(src);
  return <img ref={ref} src={src} crossOrigin="anonymous" {...rest} />;
}
