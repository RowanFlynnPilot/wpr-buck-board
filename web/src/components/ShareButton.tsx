// Share one deer. Phones open their own share sheet (inside WordPress the iframe needs
// allow="web-share"; README). Where there's no sheet, or it's blocked, Share offers Facebook and
// the link instead. Every link option shares the share page, so the preview shows the deer.
//
// On the board, a Story image goes beside it: the deer at 1080x1920, drawn in the reader's own
// browser (shareCard.ts). A phone that can share files hands it to its share sheet, which offers
// Facebook and Instagram Stories; anywhere else it downloads.
import { useEffect, useRef, useState } from "react";
import { track } from "../analytics";
import type { CardFacts } from "../data";
import { facebookShareUrl, shareTitle, shareUrl } from "../share";
import type { EntryFields } from "../types";

// Whether this browser can hand an image to the share sheet (iOS Safari, Android Chrome).
const CAN_SHARE_FILES = (() => {
  try {
    return navigator.canShare?.({ files: [new File([""], "deer.jpg", { type: "image/jpeg" })] }) ?? false;
  } catch {
    return false;
  }
})();

type StoryState = "idle" | "making" | "ready" | "failed";

export function ShareButton({ entry, story }: { entry: EntryFields; story?: CardFacts }) {
  const [options, setOptions] = useState(false);
  const [copy, setCopy] = useState<"idle" | "copied" | "blocked">("idle");
  const [storyState, setStoryState] = useState<StoryState>("idle");
  const storyFile = useRef<File | null>(null);
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

  const sendStory = async (file: File) => {
    if (CAN_SHARE_FILES) {
      try {
        await navigator.share({ files: [file], title: shareTitle(entry) });
        track("Entry Shared", { method: "story image" });
        setStoryState("idle");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setStoryState("idle");
          return;
        }
        // Drawing took longer than the browser lets a tap count: the next tap shares what's drawn.
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          setStoryState("ready");
          return;
        }
      }
    }
    download(file);
    track("Entry Shared", { method: "story image" });
    setStoryState("idle");
  };

  const shareStory = async () => {
    if (!story) return;
    if (storyState === "ready" && storyFile.current) return sendStory(storyFile.current);
    setStoryState("making");
    try {
      // The painter is only needed here, so it's fetched on the first tap rather than with the page.
      const { drawStoryCard } = await import("../shareCard");
      const blob = await drawStoryCard(story);
      storyFile.current = new File([blob], `${slug(entry.hunter_name)}-hunting-brag-board.jpg`, { type: "image/jpeg" });
      await sendStory(storyFile.current);
    } catch (error) {
      console.error("Story image:", error);
      setStoryState("failed");
    }
  };

  const storyButton = story && (
    <button type="button" className="link-button" onClick={shareStory} disabled={storyState === "making"} aria-live="polite">
      {storyState === "making"
        ? "Making the image…"
        : storyState === "ready"
          ? "Tap to share the image"
          : storyState === "failed"
            ? "The image didn't work. Try again"
            : CAN_SHARE_FILES
              ? "Share to your story"
              : "Story image"}
    </button>
  );

  if (!options) {
    return (
      <span className="share-actions">
        <button type="button" className="link-button share-button" onClick={share}>
          Share
        </button>
        {storyButton}
      </span>
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
          {copy === "copied" ? "Link copied" : "Copy link"}
        </button>
      )}
      {storyButton}
    </div>
  );
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "deer"
  );
}

function download(file: File) {
  const href = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = href;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
