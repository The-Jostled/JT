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

  /* ---------- Header tools: theme toggle ----------
     The saved choice is applied before first paint by the inline script in
     base.njk; this only wires up the button. With no saved choice the site
     follows the system setting. */
  (function theme() {
    var tools = document.querySelector("[data-site-tools]");
    var btn = document.querySelector("[data-theme-toggle]");
    if (!tools || !btn) return;
    var root = document.documentElement;
    var system = window.matchMedia("(prefers-color-scheme: dark)");

    function current() {
      return root.getAttribute("data-theme") || (system.matches ? "dark" : "light");
    }
    function label() {
      var next = current() === "dark" ? "light" : "dark";
      btn.textContent = next === "dark" ? "Dark" : "Light";
      btn.setAttribute("aria-label", "Switch to " + next + " theme");
    }
    btn.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) { /* private mode: lasts for this page only */ }
      label();
    });
    if (system.addEventListener) system.addEventListener("change", label);
    label();
    tools.hidden = false;
  })();

  /* ---------- Search: "/" or the header button ----------
     The index (/search.json) is fetched the first time search is opened. */
  (function search() {
    var opener = document.querySelector("[data-search-open]");
    var link = document.querySelector("[data-search-index]");
    if (!opener || !link || !window.HTMLDialogElement) { if (opener) opener.hidden = true; return; }

    var dialog, input, status, results, index = null;

    function build() {
      dialog = document.createElement("dialog");
      dialog.className = "search";
      dialog.setAttribute("aria-label", "Search the site");
      var form = document.createElement("form");
      form.method = "dialog";
      form.className = "search-box";
      input = document.createElement("input");
      input.type = "search";
      input.placeholder = "Search writeups, projects and posts";
      input.setAttribute("aria-label", "Search writeups, projects and posts");
      input.autocomplete = "off";
      var close = document.createElement("button");
      close.className = "chip";
      close.textContent = "Close";
      form.appendChild(input); form.appendChild(close);
      status = document.createElement("p");
      status.className = "search-status";
      status.setAttribute("role", "status");
      results = document.createElement("ul");
      results.className = "search-results";
      dialog.appendChild(form); dialog.appendChild(status); dialog.appendChild(results);
      document.body.appendChild(dialog);

      input.addEventListener("input", render);
      // Enter in the box opens the top result instead of closing the dialog
      form.addEventListener("submit", function (e) {
        var first = results.querySelector("a");
        if (document.activeElement === input && first) { e.preventDefault(); first.click(); }
      });
      // Arrow keys walk between the box and the results
      dialog.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        var stops = [input].concat(all(results, "a"));
        var at = stops.indexOf(document.activeElement);
        var next = at + (e.key === "ArrowDown" ? 1 : -1);
        if (at === -1 || next < 0 || next >= stops.length) return;
        e.preventDefault();
        stops[next].focus();
      });
      // A click on the backdrop closes it
      dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });
    }

    function render() {
      results.textContent = "";
      if (!index) { status.textContent = "Loading…"; return; }
      var words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      var hits = index.filter(function (item) {
        return words.every(function (w) { return item.hay.indexOf(w) !== -1; });
      });
      // Title matches first; the index is already newest-first
      if (words.length) {
        hits.sort(function (a, b) {
          var ta = words.every(function (w) { return a.title.toLowerCase().indexOf(w) !== -1; });
          var tb = words.every(function (w) { return b.title.toLowerCase().indexOf(w) !== -1; });
          return (tb ? 1 : 0) - (ta ? 1 : 0);
        });
      }
      status.textContent = !words.length ? "Everything, newest first. Try a tool, a CVE or a technique ID."
        : hits.length ? hits.length + (hits.length === 1 ? " result" : " results")
        : "Nothing matches “" + input.value + "”.";
      hits.forEach(function (item) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = item.url;
        if (item.category) a.className = "cat-" + item.category.toLowerCase();
        var title = document.createElement("strong");
        var pill = document.createElement("span");
        pill.className = "cat-pill";
        pill.textContent = item.category || item.section.replace(/s$/, "");
        title.appendChild(pill);
        title.appendChild(document.createTextNode(item.title));
        var summary = document.createElement("small");
        summary.textContent = item.summary;
        a.appendChild(title); a.appendChild(summary);
        li.appendChild(a);
        results.appendChild(li);
      });
    }

    function open() {
      if (!dialog) build();
      if (dialog.open) return;
      input.value = "";
      dialog.showModal();
      render();
      if (index) return;
      fetch(link.href).then(function (r) { return r.json(); }).then(function (items) {
        index = items.map(function (item) {
          item.hay = [item.title, item.summary, item.keywords, item.section, item.category].join(" ").toLowerCase();
          return item;
        });
        render();
      }).catch(function () { status.textContent = "Search could not load."; });
    }

    opener.addEventListener("click", open);
    document.addEventListener("keydown", function (e) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.preventDefault();
      open();
    });
  })();

  /* ---------- Copy button on code blocks ---------- */
  (function copyButtons() {
    if (!navigator.clipboard) return;
    all(document, ".prose pre").forEach(function (pre) {
      var wrap = document.createElement("div");
      wrap.className = "code-wrap";
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-btn";
      btn.textContent = "Copy";
      btn.setAttribute("aria-label", "Copy code to clipboard");
      btn.addEventListener("click", function () {
        function flash(text) {
          btn.textContent = text;
          btn.classList.add("is-done");
          setTimeout(function () { btn.textContent = "Copy"; btn.classList.remove("is-done"); }, 1600);
        }
        navigator.clipboard.writeText(pre.textContent.replace(/\n$/, ""))
          .then(function () { flash("Copied"); }, function () { flash("Copy failed"); });
      });
      wrap.appendChild(btn);
    });
  })();

  /* ---------- Homelab diagram: replay an exercise ----------
     Lights the path an exercise takes, edge by edge, then says what it raised
     in Wazuh. With reduced motion the whole path lights at once. */
  (function homelab() {
    var box = document.querySelector("[data-homelab-play]");
    if (!box) return;
    var fig = box.closest("figure");
    var svg = fig.querySelector("svg");
    var readout = fig.querySelector("[data-homelab-readout]");
    var buttons = all(box, "button");
    var timers = [];
    var STEP = reducedMotion ? 0 : 1200;

    function reset() {
      timers.forEach(clearTimeout);
      timers = [];
      all(svg, ".is-lit").forEach(function (el) { el.classList.remove("is-lit"); });
      buttons.forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
      readout.textContent = "";
    }
    function light(edgeId) {
      var edge = svg.querySelector('[data-edge="' + edgeId + '"]');
      if (edge) edge.classList.add("is-lit");
      edgeId.split("-").forEach(function (n) {
        var node = svg.querySelector('[data-node="' + n + '"]');
        if (node) node.classList.add("is-lit");
      });
    }
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var wasOn = btn.getAttribute("aria-pressed") === "true";
        reset();
        if (wasOn) return; // pressing the active exercise clears it
        btn.setAttribute("aria-pressed", "true");
        var seq = btn.getAttribute("data-seq").split(" ");
        seq.forEach(function (edgeId, k) {
          timers.push(setTimeout(function () { light(edgeId); }, k * STEP));
        });
        timers.push(setTimeout(function () {
          readout.textContent = btn.getAttribute("data-result");
        }, seq.length * STEP));
      });
    });
    box.hidden = false;
  })();

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
        a.addEventListener("click", function (e) { e.preventDefault(); select(i); reveal(i); });
        a.addEventListener("keydown", function (e) { arrowKeys(e, i, count, select); });
      });
    });

    // On a phone the panel can sit below the fold, so a tap on a node would
    // appear to do nothing. Bring the panel into view when it is not.
    function reveal(i) {
      var r = steps[i].getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) steps[i].scrollIntoView({ block: "nearest" });
    }

    // Previous / Next buttons in each panel: touch screens have no arrow keys
    function navButton(text, target) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = text;
      b.disabled = target < 0 || target >= count;
      b.addEventListener("click", function () {
        select(target);
        reveal(target);
        // Keep focus on the same control in the new panel so it can be pressed again
        var again = all(steps[target], ".ap-nav button").filter(function (x) {
          return x.textContent === text && !x.disabled;
        })[0] || steps[target].querySelector(".ap-nav button:not([disabled])");
        if (again) again.focus({ preventScroll: true });
      });
      return b;
    }
    steps.forEach(function (li, i) {
      li.setAttribute("role", "tabpanel");
      li.setAttribute("aria-label", li.getAttribute("data-label"));
      var navBox = document.createElement("span");
      navBox.className = "ap-nav";
      navBox.appendChild(navButton("← Previous", i - 1));
      navBox.appendChild(navButton("Next →", i + 1));
      li.querySelector(".ap-step-foot").appendChild(navBox);
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
      // The bar takes over once the diagram and its panel have scrolled away
      var show = i >= 0 && list.getBoundingClientRect().bottom < 0;
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
    navIO.observe(list);
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
