/* Site behaviour. Vanilla JS, no dependencies, loaded with `defer`.
   Every feature is progressive enhancement: pages are complete without this file. */
(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasIO = "IntersectionObserver" in window;

  /* ---------- Attack-path diagram: mark the step whose section is in view ---------- */
  (function attackPath() {
    var nav = document.querySelector("[data-attack-path]");
    var prose = document.querySelector(".post .prose");
    if (!nav || !prose || !hasIO) return;

    var nodes = Array.prototype.slice.call(nav.querySelectorAll("a.ap-node"));
    var stepIds = {};
    nodes.forEach(function (a) {
      stepIds[a.getAttribute("href").slice(1)] = true;
    });
    var headings = Array.prototype.slice.call(prose.querySelectorAll("h2[id], h3[id]"));
    if (!headings.length) return;

    function currentStep() {
      // The reading line sits a third of the way down the viewport.
      var line = window.innerHeight * 0.35;
      var idx = -1;
      for (var i = 0; i < headings.length; i++) {
        if (headings[i].getBoundingClientRect().top <= line) idx = i;
      }
      // Walk back to the step heading that owns this position. A non-step h2
      // (e.g. "References") ends the previous step's section.
      for (var j = idx; j >= 0; j--) {
        if (stepIds[headings[j].id]) return headings[j].id;
        if (headings[j].tagName === "H2") return null;
      }
      return null;
    }

    function update() {
      var id = currentStep();
      nodes.forEach(function (a) {
        if (id && a.getAttribute("href").slice(1) === id) a.setAttribute("aria-current", "step");
        else a.removeAttribute("aria-current");
      });
    }

    // Fires whenever a heading crosses the reading line or a viewport edge.
    var io = new IntersectionObserver(update, { rootMargin: "0px 0px -65% 0px", threshold: [0, 1] });
    headings.forEach(function (h) { io.observe(h); });
    update();
  })();
})();
