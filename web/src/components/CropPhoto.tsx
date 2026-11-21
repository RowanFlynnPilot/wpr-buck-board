import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { useTrimmedCrop } from "../useTrimmedCrop";

// A deer photo shown cropped (object-fit: cover): its crop keeps clear of a screenshot's solid
// bands, zooming in a touch where it must (useTrimmedCrop), inside a wrapper that clips the zoom.
// crossOrigin lets the page read its pixels; storage allows any origin.
//
// With a `preview` (the 640px thumbnail of the same photo), that shows first and the full photo
// takes its place once it has loaded (Nov. 20: the front's 1600px photo, often 700 KB or more, was
// the last thing a phone waited for). The browser keeps the shown image until the new one is
// ready, so the swap doesn't flash; the thumbnail is the same picture, so the crop doesn't move.
export function CropPhoto({ src, preview, ...rest }: ImgHTMLAttributes<HTMLImageElement> & { src: string; preview?: string }) {
  const [shown, setShown] = useState(preview ?? src);
  useEffect(() => {
    if (!preview) {
      setShown(src);
      return;
    }
    setShown(preview);
    let live = true;
    const full = new Image();
    full.crossOrigin = "anonymous";
    full.src = src;
    full.decode().then(
      () => live && setShown(src),
      () => live && setShown(src),
    );
    return () => {
      live = false;
    };
  }, [src, preview]);
  const ref = useTrimmedCrop(shown);
  return (
    <span className="crop">
      <img ref={ref} src={shown} crossOrigin="anonymous" {...rest} />
    </span>
  );
}
