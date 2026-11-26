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

  /* ---------- Writeups index: ATT&CK cell filter + chip filters ----------
     Without JS the bar stays hidden and every card is listed. */
  (function filters() {
    var bar = document.querySelector("[data-filter-bar]");
    if (!bar) return;

    var groups = Array.prototype.slice.call(document.querySelectorAll("[data-filter-group]"));
    var cards = Array.prototype.slice.call(document.querySelectorAll("[data-filter-group] .card"));
    var techs = Array.prototype.slice.call(document.querySelectorAll(".tech[data-technique]"));
    var chips = Array.prototype.slice.call(bar.querySelectorAll("[data-filter-key]"));
    var status = bar.querySelector("[data-filter-status]");
    var clear = bar.querySelector("[data-filter-clear]");
    var empty = document.querySelector("[data-filter-empty]");
    var readout = document.querySelector("[data-matrix-readout]");
    var matrix = document.querySelector("[data-attack-matrix]");
    var readoutDefault = "Hover or focus a cell for the technique name. Select a cell to filter the list below.";

    var technique = null; // one ATT&CK technique at a time
    var selected = {};    // chip row key -> array of selected values

    function describe(btn) {
      var n = btn.getAttribute("data-count");
      return btn.getAttribute("data-technique") + " — " + btn.getAttribute("data-name") +
        " · " + n + (n === "1" ? " writeup" : " writeups");
    }

    function matches(card) {
      if (technique && (card.getAttribute("data-attack") || "").split(" ").indexOf(technique) === -1) return false;
      for (var key in selected) {
        // OR within a row, AND across rows
        if (selected[key].length && selected[key].indexOf(card.getAttribute("data-" + key)) === -1) return false;
      }
      return true;
    }

    function restoreReadout() {
      if (!readout) return;
      var pressed = techs.filter(function (b) { return b.getAttribute("aria-pressed") === "true"; })[0];
      readout.textContent = pressed ? "Filtering by " + describe(pressed) : readoutDefault;
    }

    function apply() {
      var shown = 0;
      cards.forEach(function (card) {
        var ok = matches(card);
        card.hidden = !ok;
        if (ok) shown++;
      });
      groups.forEach(function (g) {
        g.hidden = !g.querySelector(".card:not([hidden])");
      });
      var active = !!technique || Object.keys(selected).some(function (k) { return selected[k].length; });
      status.textContent = active
        ? "Showing " + shown + " of " + cards.length + " writeups"
        : "Showing all " + cards.length + " writeups";
      clear.hidden = !active;
      if (empty) empty.hidden = shown !== 0;
      restoreReadout();
    }

    techs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-technique");
        technique = technique === id ? null : id;
        techs.forEach(function (b) {
          b.setAttribute("aria-pressed", String(b.getAttribute("data-technique") === technique));
        });
        apply();
      });
      function show() { if (readout) readout.textContent = describe(btn); }
      btn.addEventListener("mouseenter", show);
      btn.addEventListener("focus", show);
    });
    if (matrix) {
      matrix.addEventListener("mouseleave", restoreReadout);
      matrix.addEventListener("focusout", function (e) {
        if (!matrix.contains(e.relatedTarget)) restoreReadout();
      });
    }

    chips.forEach(function (chip) {
      var key = chip.getAttribute("data-filter-key");
      var value = chip.getAttribute("data-filter-value");
      selected[key] = selected[key] || [];
      chip.addEventListener("click", function () {
        var i = selected[key].indexOf(value);
        if (i === -1) selected[key].push(value);
        else selected[key].splice(i, 1);
        chip.setAttribute("aria-pressed", String(i === -1));
        apply();
      });
    });

    clear.addEventListener("click", function () {
      technique = null;
      Object.keys(selected).forEach(function (k) { selected[k] = []; });
      techs.concat(chips).forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
      apply();
    });

    bar.hidden = false;
    apply();
  })();

  /* ---------- About timeline: line draws, entries fade in, once ---------- */
  (function timeline() {
    var list = document.querySelector("[data-timeline]");
    if (!list || reducedMotion || !hasIO) return; // stays in its final, fully visible state

    list.classList.add("is-armed");
    var lineIO = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) {
        list.classList.add("is-drawn");
        lineIO.disconnect();
      }
    }, { threshold: 0.05 });
    lineIO.observe(list);

    var itemIO = new IntersectionObserver(function (entries) {
      var n = 0;
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        // Entries that arrive together fade in top to bottom
        e.target.style.transitionDelay = (n++ * 140) + "ms";
        e.target.classList.add("is-in");
        itemIO.unobserve(e.target);
      });
    }, { threshold: 0.4 });
    Array.prototype.forEach.call(list.children, function (li) { itemIO.observe(li); });
  })();

  /* ---------- Home tagline: types once on load, then the cursor goes away ----------
     The only typing effect on the site. Screen readers get the full sentence from
     the start; the untyped remainder is laid out invisibly so nothing reflows. */
  (function tagline() {
    var p = document.querySelector("[data-typed]");
    if (!p || reducedMotion) return;

    var text = p.textContent;
    var MS_PER_CHAR = 40;
    function span(cls, hidden) {
      var s = document.createElement("span");
      s.className = cls;
      if (hidden) s.setAttribute("aria-hidden", "true");
      return s;
    }
    var full = span("sr-only");
    var typed = span("type-done", true);
    var cursor = span("type-cursor", true);
    var rest = span("type-rest", true);
    full.textContent = text;
    rest.textContent = text;
    p.textContent = "";
    p.appendChild(full); p.appendChild(typed); p.appendChild(cursor); p.appendChild(rest);

    var start = performance.now();
    var timer = setInterval(function () {
      // Position comes from elapsed time, so a throttled background tab catches up
      var i = Math.min(text.length, Math.floor((performance.now() - start) / MS_PER_CHAR));
      typed.textContent = text.slice(0, i);
      rest.textContent = text.slice(i);
      if (i >= text.length) {
        clearInterval(timer);
        p.textContent = text; // back to plain text, cursor gone
      }
    }, MS_PER_CHAR);
  })();

  /* ---------- Run-once figures (e.g. the Helix gauge) ----------
     CSS shows the final state by default. `is-armed` rewinds to the start,
     `is-run` plays the animation a single time when the figure scrolls into view. */
  (function runOnce() {
    var figs = document.querySelectorAll("[data-run-once]");
    if (!figs.length || reducedMotion || !hasIO) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-run");
        io.unobserve(e.target);
      });
    }, { threshold: 0.6 });
    Array.prototype.forEach.call(figs, function (f) {
      f.classList.add("is-armed");
      io.observe(f);
    });
  })();
})();
