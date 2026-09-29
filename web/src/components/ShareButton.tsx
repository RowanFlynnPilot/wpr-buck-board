// Share one deer. Phones open their own share sheet (inside WordPress the iframe needs
// allow="web-share"; README). Where there's no sheet, or it's blocked, Share offers Facebook and
// the link instead. Every option shares the share page, so the preview shows the deer.
import { useEffect, useRef, useState } from "react";
import { track } from "../analytics";
import { facebookShareUrl, shareTitle, shareUrl } from "../share";
import type { EntryFields } from "../types";

export function ShareButton({ entry }: { entry: EntryFields }) {
  const [options, setOptions] = useState(false);
  const [copy, setCopy] = useState<"idle" | "copied" | "blocked">("idle");
  const facebookRef = useRef<HTMLAnchorElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const url = shareUrl(entry.id);

  // The Share button gives way to the options; keep keyboard focus on the card.
  useEffect(() => {
    if (options) facebookRef.current?.focus();
  }, [options]);

  // Select the link, ready for Ctrl+C or a long press.
  useEffect(() => {
    if (copy !== "blocked") return;
    linkRef.current?.focus();
    linkRef.current?.select();
  }, [copy]);

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle(entry), url });
        track("Entry Shared", { method: "share sheet" });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    setOptions(true);
  };

  // Without allow="clipboard-write" the copy fails; then the link is shown to copy by hand.
  const copyLink = () => {
    track("Entry Shared", { method: "copy link" });
    const copied = navigator.clipboard?.writeText(url) ?? Promise.reject(new Error("No clipboard"));
    copied.then(
      () => setCopy("copied"),
      () => setCopy("blocked"),
    );
  };

  if (!options) {
    return (
      <button type="button" className="link-button share-button" onClick={share}>
        Share
      </button>
    );
  }

  return (
    <div className="share-options">
      <a
        ref={facebookRef}
        href={facebookShareUrl(entry.id)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track("Entry Shared", { method: "facebook" })}
      >
        Share on Facebook
      </a>
      {copy === "blocked" ? (
        <input ref={linkRef} readOnly aria-label="Link to this deer" value={url} onFocus={(e) => e.currentTarget.select()} />
      ) : (
        <button type="button" className="link-button" onClick={copyLink} aria-live="polite">
          {copy === "copied" ? "✓ Link copied" : "Copy link"}
        </button>
      )}
    </div>
  );
}
