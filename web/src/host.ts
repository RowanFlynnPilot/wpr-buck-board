import { useEffect } from "react";

// Messages to the WordPress page that embeds us. The listener snippet is in README.md.
function tellHost(message: { height: number } | { scrollToTop: true } | { scrollTo: number }) {
  window.parent.postMessage({ source: "wpr-buck-board", ...message }, "*");
}

const embedded = window.parent !== window;

// Report our content height so the host can size the iframe. The root element's box is
// its content height, so the frame shrinks as well as grows.
export function useAutoHeight() {
  useEffect(() => {
    if (!embedded) return;
    const report = () => tellHost({ height: Math.ceil(document.documentElement.getBoundingClientRect().height) });
    const observer = new ResizeObserver(report);
    observer.observe(document.documentElement);
    report();
    return () => observer.disconnect();
  }, []);
}

// After a long form collapses into a short confirmation, bring its top back into view.
export function scrollToTop() {
  if (embedded) tellHost({ scrollToTop: true });
  else window.scrollTo(0, 0);
}

// Bring an element to the top of the reader's screen, on the host page if we're embedded. Waits
// (up to two seconds) for the web fonts and the images above it: on a first visit the fallback
// fonts wrap the title differently, and a late logo would push the element down after measuring.
// Not img.decode(): that never settles in a background tab.
export async function scrollIntoView(element: HTMLElement) {
  const above = [...document.images].filter(
    (img) => img.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
  const loaded = (img: HTMLImageElement) =>
    img.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        });
  await Promise.race([
    Promise.all([document.fonts.ready, ...above.map(loaded)]),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
  const top = Math.round(element.getBoundingClientRect().top + window.scrollY);
  if (embedded) tellHost({ scrollTo: top });
  else window.scrollTo(0, top);
}
