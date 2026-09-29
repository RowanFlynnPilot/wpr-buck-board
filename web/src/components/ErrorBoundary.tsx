import { Component, type ReactNode } from "react";
import { track } from "../analytics";

// A view that throws while rendering shows a plain line instead of an empty frame on
// WPR's pages. App keys it by route, so moving to another view starts fresh.
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
    track("App Error", { message: String(error instanceof Error ? error.message : error).slice(0, 120) });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <p className="status">The Brag Board isn't loading right now. Try again in a few minutes.</p>;
  }
}
