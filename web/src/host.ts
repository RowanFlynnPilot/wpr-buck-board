import { useEffect } from "react";

// Messages to the WordPress page that embeds us. The listener snippet is in README.md.
function tellHost(message: { height: number } | { scrollToTop: true }) {
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
