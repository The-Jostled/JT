/* Site behaviour. Vanilla JS, no dependencies, loaded with `defer`.
   Every feature is progressive enhancement: pages are complete without this file. */
(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasIO = "IntersectionObserver" in window;
  function all(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  /* Arrow-key movement for a row of tabs. `pick(i, true)` selects and focuses. */
  function arrowKeys(e, i, count, pick) {
    var next = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % count;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + count) % count;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = count - 1;
    if (next === null) return;
    e.preventDefault();
    pick(next, true);
  }

  /* ---------- Attack path: stepper + reading-position bar ----------
     Without JS every step panel is listed and the nodes are plain links.
     With JS the nodes select a step, one panel shows at a time, and the
     selection follows the section you are reading. */
  (function attackPath() {
    var nav = document.querySelector("[data-attack-path]");
    var list = nav && nav.querySelector("[data-ap-steps]");
    var prose = document.querySelector(".post .prose");
    if (!nav || !list || !prose) return;

    var steps = Array.prototype.slice.call(list.children);
    var svgs = all(nav, "svg.ap");
    var bar = nav.querySelector("[data-ap-progress]");
    var barLabel = nav.querySelector("[data-ap-progress-label]");
    var barSegs = bar ? all(bar, "li") : [];
    var count = steps.length;

    function select(i, focus) {
      if (i < 0 || i >= count) return;
      steps.forEach(function (li, k) { li.classList.toggle("is-active", k === i); });
      svgs.forEach(function (svg) {
        all(svg, "a.ap-node").forEach(function (a) {
          var on = Number(a.getAttribute("data-step")) === i;
          a.setAttribute("aria-selected", String(on));
          a.setAttribute("tabindex", on ? "0" : "-1");
          // Only the SVG that is actually displayed can take focus
          if (on && focus && svg.getClientRects().length) a.focus();
        });
        // Connectors before the selected step are drawn as travelled
        all(svg, "[data-after]").forEach(function (p) {
          p.classList.toggle("is-done", Number(p.getAttribute("data-after")) < i);
        });
      });
    }

    nav.classList.add("is-stepper");
    svgs.forEach(function (svg) {
      svg.setAttribute("role", "tablist");
      svg.setAttribute("aria-label", nav.getAttribute("aria-label") + " steps");
      all(svg, "a.ap-node").forEach(function (a) {
        var i = Number(a.getAttribute("data-step"));
        a.setAttribute("role", "tab");
        a.setAttribute("aria-controls", "ap-step-" + (i + 1));
        a.addEventListener("click", function (e) { e.preventDefault(); select(i); });
        a.addEventListener("keydown", function (e) { arrowKeys(e, i, count, select); });
      });
    });
    steps.forEach(function (li) {
      li.setAttribute("role", "tabpanel");
      li.setAttribute("aria-label", li.getAttribute("data-label"));
    });
    select(0);

    if (!hasIO) return;

    // Map each step anchor to the first step that uses it
    var stepByAnchor = {};
    all(svgs[0], "a.ap-node").forEach(function (a) {
      var id = a.getAttribute("href").slice(1);
      if (!(id in stepByAnchor)) stepByAnchor[id] = Number(a.getAttribute("data-step"));
    });
    var headings = all(prose, "h2[id], h3[id]");
    if (!headings.length) return;
    var lastRead = null;

    function readingStep() {
      // The reading line sits a third of the way down the viewport.
      var line = window.innerHeight * 0.35;
      var idx = -1;
      for (var i = 0; i < headings.length; i++) {
        if (headings[i].getBoundingClientRect().top <= line) idx = i;
      }
      // Walk back to the step heading that owns this position. A non-step h2
      // (e.g. "References") ends the previous step's section.
      for (var j = idx; j >= 0; j--) {
        if (headings[j].id in stepByAnchor) return stepByAnchor[headings[j].id];
        if (headings[j].tagName === "H2") return -1;
      }
      return -1;
    }

    function update() {
      var i = readingStep();
      if (i !== lastRead) {
        lastRead = i;
        if (i >= 0) select(i); // a manual pick stays until you read into another step
      }
      if (!bar) return;
      // The bar takes over once the diagram itself has scrolled away
      var show = i >= 0 && nav.querySelector(".ap-scroll").getBoundingClientRect().bottom < 0;
      bar.hidden = !show;
      if (!show) return;
      barSegs.forEach(function (li, k) {
        li.classList.toggle("is-done", k < i);
        if (k === i) li.firstElementChild.setAttribute("aria-current", "step");
        else li.firstElementChild.removeAttribute("aria-current");
      });
      var access = steps[i].getAttribute("data-access");
      barLabel.textContent = "";
      var strong = document.createElement("strong");
      strong.textContent = "Step " + (i + 1) + " of " + count;
      barLabel.appendChild(strong);
      barLabel.appendChild(document.createTextNode(
        " · " + steps[i].getAttribute("data-label") + (access ? " · Access: " + access : "")
      ));
    }

    // Fires whenever a heading crosses the reading line or a viewport edge,
    // and when the diagram enters or leaves the viewport.
    var io = new IntersectionObserver(update, { rootMargin: "0px 0px -65% 0px", threshold: [0, 1] });
    headings.forEach(function (h) { io.observe(h); });
    var navIO = new IntersectionObserver(update, { threshold: 0 });
    navIO.observe(nav.querySelector(".ap-scroll"));
    update();
  })();

  /* ---------- Home: "both chairs" tabs ----------
     Without JS all scenarios are listed one after another. */
  (function chairs() {
    var root = document.querySelector("[data-chairs]");
    var tablist = root && root.querySelector("[data-chairs-tabs]");
    if (!tablist) return;
    var tabs = all(tablist, "[role=tab]");
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute("aria-controls")); });

    function pick(i, focus) {
      tabs.forEach(function (t, k) {
        t.setAttribute("aria-selected", String(k === i));
        t.tabIndex = k === i ? 0 : -1;
        panels[k].hidden = k !== i;
      });
      if (focus) tabs[i].focus();
    }
    tabs.forEach(function (t, i) {
      panels[i].setAttribute("role", "tabpanel");
      panels[i].setAttribute("aria-labelledby", t.id);
      t.addEventListener("click", function () { pick(i); });
      t.addEventListener("keydown", function (e) { arrowKeys(e, i, tabs.length, pick); });
    });
    root.classList.add("is-tabbed");
    tablist.hidden = false;
    pick(0);
  })();

  /* ---------- Writeups index: ATT&CK matrix, chips, cross-highlighting ----------
     Without JS the bar stays hidden and every card is listed. */
  (function filters() {
    var bar = document.querySelector("[data-filter-bar]");
    if (!bar) return;

    var groups = all(document, "[data-filter-group]");
    var cards = all(document, "[data-filter-group] .card");
    var techs = all(document, ".tech[data-technique]");
    var chips = all(bar, "[data-filter-key]");
    var status = bar.querySelector("[data-filter-status]");
    var clear = bar.querySelector("[data-filter-clear]");
    var empty = document.querySelector("[data-filter-empty]");
    var readout = document.querySelector("[data-matrix-readout]");
    var matrix = document.querySelector("[data-attack-matrix]");
    var readoutDefault = "Hover or focus a cell to see which writeups use it. Select a cell to filter the list below.";

    var technique = null; // one ATT&CK technique at a time
    var selected = {};    // chip row key -> array of selected values

    function attackOf(card) { return (card.getAttribute("data-attack") || "").split(" "); }
    function shortTitle(card) {
      // "HTB Garfield — from a logon script…" -> "HTB Garfield"
      return card.querySelector("h3").textContent.split(" — ")[0];
    }
    function describe(btn) {
      var id = btn.getAttribute("data-technique");
      var names = cards.filter(function (c) { return attackOf(c).indexOf(id) !== -1; }).map(shortTitle);
      return id + " — " + btn.getAttribute("data-name") + " · " + names.join(", ");
    }

    function matches(card) {
      if (technique && attackOf(card).indexOf(technique) === -1) return false;
      for (var key in selected) {
        // OR within a row, AND across rows
        if (selected[key].length && selected[key].indexOf(card.getAttribute("data-" + key)) === -1) return false;
      }
      return true;
    }

    /* Hovering a cell lights the cards that use it (and the tag on each card);
       hovering a card lights its cells. Dimming plus a ring, not colour alone. */
    function lightTechnique(id) {
      cards.forEach(function (c) {
        var has = !!id && attackOf(c).indexOf(id) !== -1;
        c.classList.toggle("is-match", has);
        c.classList.toggle("is-dim", !!id && !has);
        all(c, ".card-tech").forEach(function (tag) {
          tag.classList.toggle("is-lit", !!id && tag.getAttribute("data-technique") === id);
        });
      });
    }
    function lightCard(card) {
      var ids = card ? attackOf(card) : null;
      techs.forEach(function (b) {
        var has = !!ids && ids.indexOf(b.getAttribute("data-technique")) !== -1;
        b.classList.toggle("is-lit", has);
        b.classList.toggle("is-dim", !!ids && !has);
      });
    }

    function restoreReadout() {
      if (!readout) return;
      var pressed = techs.filter(function (b) { return b.getAttribute("aria-pressed") === "true"; })[0];
      readout.textContent = pressed ? "Filtering by " + describe(pressed) : readoutDefault;
    }

    function apply(animate) {
      // Remember where each visible card is, so the ones that stay can slide
      var before = animate && !reducedMotion
        ? cards.map(function (c) { return c.hidden ? null : c.getBoundingClientRect().top; })
        : null;
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

      if (before) {
        cards.forEach(function (c, i) {
          if (c.hidden || !c.animate) return;
          if (before[i] === null) {
            c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
          } else {
            var dy = before[i] - c.getBoundingClientRect().top;
            if (dy) c.animate([{ transform: "translateY(" + dy + "px)" }, { transform: "none" }], { duration: 220, easing: "ease-out" });
          }
        });
      }
    }

    techs.forEach(function (btn) {
      var id = btn.getAttribute("data-technique");
      btn.addEventListener("click", function () {
        technique = technique === id ? null : id;
        techs.forEach(function (b) {
          b.setAttribute("aria-pressed", String(b.getAttribute("data-technique") === technique));
        });
        apply(true);
      });
      function show() {
        if (readout) readout.textContent = describe(btn);
        lightTechnique(id);
      }
      btn.addEventListener("mouseenter", show);
      btn.addEventListener("focus", show);
    });
    function leaveMatrix() { lightTechnique(null); restoreReadout(); }
    if (matrix) {
      matrix.addEventListener("mouseleave", leaveMatrix);
      matrix.addEventListener("focusout", function (e) {
        if (!matrix.contains(e.relatedTarget)) leaveMatrix();
      });
    }

    cards.forEach(function (card) {
      function show() {
        lightCard(card);
        if (readout) readout.textContent = shortTitle(card) + " · " + attackOf(card).length + " techniques, outlined above";
      }
      function hide() { lightCard(null); restoreReadout(); }
      card.addEventListener("mouseenter", show);
      card.addEventListener("mouseleave", hide);
      card.addEventListener("focusin", show);
      card.addEventListener("focusout", hide);
    });

    chips.forEach(function (chip) {
      var key = chip.getAttribute("data-filter-key");
      var value = chip.getAttribute("data-filter-value");
      selected[key] = selected[key] || [];
      chip.addEventListener("click", function () {
        var i = selected[key].indexOf(value);
        if (i === -1) selected[key].push(value);
        else selected[key].splice(i, 1);
        chip.setAttribute("aria-pressed", String(i === -1));
        apply(true);
      });
    });

    clear.addEventListener("click", function () {
      technique = null;
      Object.keys(selected).forEach(function (k) { selected[k] = []; });
      techs.concat(chips).forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
      apply(true);
    });

    bar.hidden = false;
    apply(false);
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
