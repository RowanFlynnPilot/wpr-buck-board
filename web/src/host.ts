import { useEffect } from "react";
import { env } from "./env";
import { DEMO } from "./sales";

// Messages to the WordPress page that embeds us, for the site-wide host script, embed.js
// (README "WordPress embed"). The pages themselves carry only our iframe, since WPR's firewall
// refuses a page save with script in it, so nothing may depend on anyone listening: without
// embed.js the frame keeps its own height and scrolls inside itself.
function tellHost(message: { height: number } | { scrollToTop: true } | { scrollTo: number }) {
  window.parent.postMessage({ source: "wpr-buck-board", ...message }, "*");
}

// In a frame on WPR's WordPress pages, which already carry WPR's header and footer.
export const embedded = window.parent !== window;

// Report our content height so embed.js can size the iframe. The root element's box is its
// content height, so the frame shrinks as well as grows. embed.js asks again once it's
// listening, in case it loaded after our first report.
export function useAutoHeight() {
  useEffect(() => {
    if (!embedded) return;
    const report = () => tellHost({ height: Math.ceil(document.documentElement.getBoundingClientRect().height) });
    const observer = new ResizeObserver(report);
    observer.observe(document.documentElement);
    const asked = (event: MessageEvent) => {
      if (event.source === window.parent && event.data?.source === "wpr-buck-board-host" && event.data.measure) report();
    };
    window.addEventListener("message", asked);
    report();
    return () => {
      observer.disconnect();
      window.removeEventListener("message", asked);
    };
  }, []);
}

// A link to the board or the form from the other. Inside a frame it switches views in place,
// so it works with no script on the WordPress page, and the `?demo` preview stays in the
// preview; opened on its own, the board sends readers to WPR's page.
export function viewLink(view: "gallery" | "enter"): { href: string; target?: string; onClick?: () => void } {
  if (embedded || DEMO) return { href: `#/${view}`, onClick: scrollToTop };
  return { href: view === "enter" ? env.enterPageUrl : env.galleryPageUrl, target: "_top" };
}

// After a long form collapses into a short confirmation, bring its top back into view: the
// page scrolls if embed.js is there to do it, and a frame at its own height scrolls itself.
export function scrollToTop() {
  if (embedded) tellHost({ scrollToTop: true });
  window.scrollTo(0, 0);
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
  window.scrollTo(0, top);
}
