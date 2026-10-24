// An entrance for the board's parts as they scroll into view: each `[data-reveal]` element rises
// and fades in once, staggered among its neighbours. Elements are marked pending only here, after
// React has rendered them, so without script everything is simply visible; with reduced motion
// nothing is marked and nothing moves. Inside the WordPress page the frame is sized to its content,
// but an IntersectionObserver with no root measures against the top-level viewport even across
// origins, so the reveal still follows the reader's scroll there.
import { useEffect } from "react";

export function useReveal(deps: unknown[]) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // A bare `data-reveal` in JSX renders as "true"; either spelling is an element not yet marked.
    const fresh = [...document.querySelectorAll<HTMLElement>("[data-reveal]")].filter(
      (el) => el.dataset.reveal === "" || el.dataset.reveal === "true",
    );
    if (fresh.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.reveal = "in";
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px" },
    );
    fresh.forEach((el, i) => {
      el.style.setProperty("--reveal-i", String(i % 6));
      el.dataset.reveal = "pending";
      observer.observe(el);
    });
    // Nothing stays hidden for want of a scroll: whatever hasn't entered after a few seconds (a
    // full-page capture, print, an observer that never fires) simply appears.
    const fallback = window.setTimeout(() => {
      for (const el of fresh) if (el.dataset.reveal === "pending") el.dataset.reveal = "in";
    }, 4000);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
    // Re-run when the list of elements changes (more deer shown, a filter picked).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
