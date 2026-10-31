// Hunting Brag Board, on WPR's WordPress pages. Installed once, site-wide, from the site's header
// or footer code (README "WordPress embed"):
//   <script src="https://rowanflynnpilot.github.io/wpr-buck-board/embed.js" defer data-no-optimize="1"></script>
// The pages themselves carry only the board's iframe, because WPR's firewall refuses a page save
// with script in it. This sizes the board's frame to the board (no inner scrollbar), scrolls the
// page when the board asks, and on the Brag Board page opens the form at #enter and a shared deer
// at #entry=<id>. The front-page strip fills whatever height its own iframe sets, so it's left at
// that height. Without this script the frames still work, at their own height with a scrollbar
// inside, and those links open the board at the top.
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
  // The board's frame as pasted (#/gallery). The front-page strip (#/embed) fills its own height,
  // and a `?demo` preview stays as pasted.
  function isBoard(frame) {
    if (!frame.dataset.bragView) {
      var pasted = address(frame);
      frame.dataset.bragView = /#\/gallery/.test(pasted) && !/[?&]demo/.test(pasted) ? "gallery" : "other";
    }
    return frame.dataset.bragView === "gallery";
  }
  // Only these addresses ask the board for something; any other anchor (#comments, a skip link)
  // leaves the frame where the reader took it, a half-filled form included.
  function wanted() {
    var deer = /^#(entry=[0-9a-f-]{36}(&from=[a-z-]+)?)$/i.exec(location.hash);
    if (deer) return app + "?" + deer[1] + "#/gallery";
    return location.hash === "#enter" ? app + "#/enter" : null;
  }
  function measure(frame) {
    if (frame.contentWindow) frame.contentWindow.postMessage({ source: "wpr-buck-board-host", measure: true }, origin);
  }
  function route() {
    frames().forEach(function (frame) {
      if (!isBoard(frame)) return;
      if (!frame.dataset.bragHost) {
        frame.dataset.bragHost = "1";
        frame.addEventListener("load", function () { measure(frame); });
        measure(frame);
      }
      var target = wanted();
      if (!target) return;
      // A lazy frame whose loader still swaps in data-src gets the same address.
      if (frame.hasAttribute("data-src")) frame.setAttribute("data-src", target);
      if (frame.src !== target) frame.src = target;
      if (location.hash === "#enter") frame.scrollIntoView({ block: "start" });
    });
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== origin || !event.data || event.data.source !== "wpr-buck-board") return;
    var frame = frames().filter(function (f) { return f.contentWindow === event.source && isBoard(f); })[0];
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
