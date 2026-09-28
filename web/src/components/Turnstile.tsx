// Cloudflare Turnstile on the entry form. The submit-entry function verifies the token
// before it touches the photos. Mount once per attempt; remount (change its key) to get a
// fresh token after a failed submission, since tokens are single-use.
import { useEffect, useRef } from "react";
import { env } from "../env";

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "light";
      size: "flexible";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let script: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  script ??= new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    tag.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not start.")));
    tag.onerror = () => reject(new Error("The spam check couldn't load. Reload the page and try again."));
    document.head.append(tag);
  });
  return script;
}

export function Turnstile({ onToken, onError }: { onToken: (token: string | null) => void; onError: (message: string) => void }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let widgetId: string | undefined;
    let mounted = true;
    loadTurnstile().then(
      (turnstile) => {
        if (!mounted || !container.current) return;
        widgetId = turnstile.render(container.current, {
          sitekey: env.turnstileSiteKey,
          action: "submit-entry",
          theme: "light",
          size: "flexible",
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
      },
      (error: Error) => onError(error.message),
    );
    return () => {
      mounted = false;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
    // Setters from the parent are stable; the widget is reset by remounting, not by props.
  }, []);

  return <div ref={container} className="turnstile" />;
}
