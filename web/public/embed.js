// Hunting Brag Board, on WPR's WordPress pages. Installed once, site-wide, from the site's header
// or footer code (README "WordPress embed"):
//   <script src="https://rowanflynnpilot.github.io/wpr-buck-board/embed.js" defer data-no-optimize="1"></script>
// The pages themselves carry only the board's iframe, because WPR's firewall refuses a page save
// with script in it. For every Brag Board frame on a page this sizes the frame to the board (no
// inner scrollbar) and scrolls the page when the board asks. On the Brag Board page it also opens
// the form at #enter and a shared deer at #entry=<id>. Without it the frames still work, at their
// own height with a scrollbar inside, and those links open the board at the top.
(function () {
  if (window.wprBuckBoardHost) return;
  window.wprBuckBoardHost = true;

  // The app's address, from this script's own; a cache plugin that bundles scripts loses it.
  var self = document.currentScript && document.currentScript.src;
  var app = self && /\/embed\.js(\?.*)?$/.test(self) ? self.replace(/embed\.js(\?.*)?$/, "") : "https://rowanflynnpilot.github.io/wpr-buck-board/";
  var origin = new URL(app).origin;

  // LiteSpeed's lazy loading moves a frame's address to data-src until it scrolls into view.
  function address(frame) {
    var src = frame.getAttribute("src") || "";
    return src && src !== "about:blank" ? src : frame.getAttribute("data-src") || "";
  }
  function frames() {
    return Array.prototype.filter.call(document.querySelectorAll("iframe"), function (frame) {
      return address(frame).indexOf(app) === 0;
    });
  }
  // The board's frame as pasted (#/gallery); the front-page strip (#/embed) is only sized.
  function isBoard(frame) {
    if (!frame.dataset.bragView) frame.dataset.bragView = /#\/gallery/.test(address(frame)) ? "gallery" : "other";
    return frame.dataset.bragView === "gallery";
  }
  function target() {
    var deer = /^#(entry=[0-9a-f-]{36}(&from=[a-z-]+)?)$/i.exec(location.hash);
    var view = location.hash === "#enter" ? "#/enter" : "#/gallery";
    return deer ? app + "?" + deer[1] + view : app + view;
  }
  function measure(frame) {
    if (frame.contentWindow) frame.contentWindow.postMessage({ source: "wpr-buck-board-host", measure: true }, origin);
  }
  function route() {
    frames().forEach(function (frame) {
      if (!frame.dataset.bragHost) {
        frame.dataset.bragHost = "1";
        frame.addEventListener("load", function () { measure(frame); });
        measure(frame);
      }
      if (!isBoard(frame)) return;
      // The frame's src stays as last set, not where the reader has since gone inside it, so an
      // unrelated anchor (#comments) leaves the board alone.
      if (frame.src !== target()) frame.src = target();
      if (location.hash === "#enter") frame.scrollIntoView({ block: "start" });
    });
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== origin || !event.data || event.data.source !== "wpr-buck-board") return;
    var frame = frames().filter(function (f) { return f.contentWindow === event.source; })[0];
    if (!frame) return;
    if (event.data.height) frame.style.height = event.data.height + "px";
    if (event.data.scrollToTop) frame.scrollIntoView({ block: "start" });
    if (typeof event.data.scrollTo === "number") {
      window.scrollTo(0, frame.getBoundingClientRect().top + window.scrollY + event.data.scrollTo);
    }
  });
  window.addEventListener("hashchange", route);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", route);
  else route();
})();
