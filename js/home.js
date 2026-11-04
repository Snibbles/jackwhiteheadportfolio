/* ============================================================
   Home page sections: hero, marquee, crew badge, facts, work stack, toolbox, testimonial and the contact headline.
   (The toolbox's solar system is drawn by js/scene3d.js.) Uses the shared helpers from js/main.js (window.JW).
   Every effect sleeps while its section is off screen, and stays still when motion is reduced.
   ============================================================ */
(() => {
  "use strict";
  const JW = window.JW;
  if (!JW) return;
  const { reduce, finePointer, clamp, run, onScroll, onMeasure, onReveal } = JW;

  /* Runs `tick(dt)` every frame, but only while `el` is on screen. tick returns false to sleep early. */
  function whileVisible(el, tick) {
    let on = false, raf = 0, last = 0;
    const loop = (t) => {
      const dt = Math.min((t - last) / 1000 || 0, 0.05);
      last = t;
      raf = on && tick(dt) !== false ? requestAnimationFrame(loop) : 0;
    };
    const wake = () => { if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } };
    new IntersectionObserver(([e]) => { on = e.isIntersecting; wake(); }).observe(el);
    return wake;
  }

  /* ----------------------------------------------------------
     Hero: the word masks come off once the name has risen; on wide screens the copy drifts back as you scroll away
  ---------------------------------------------------------- */
  run("hero", () => {
    const hero = document.querySelector(".hero");
    if (!hero) return;
    let settled = false;
    const settle = () => { if (settled) return; settled = true; setTimeout(() => hero.classList.add("hero-settled"), reduce ? 0 : 1700); };
    const root = document.documentElement;
    if (root.classList.contains("skip-intro") || root.classList.contains("no-3d") || !hero.classList.contains("hero-wait")) settle();
    else addEventListener("hero:landed", settle, { once: true });

    const copy = hero.querySelector(".hero-copy");
    const wide = matchMedia("(min-width: 760px) and (min-aspect-ratio: 21/20)");
    if (!copy || reduce) return;
    onScroll((y, vh) => {
      if (!wide.matches || y > vh * 1.1) { copy.style.opacity = ""; copy.style.transform = ""; return; }   // off screen: back to its real colours
      const p = clamp((y - vh * 0.06) / (vh * 0.6), 0, 1);
      copy.style.opacity = p ? (1 - p * 0.92).toFixed(3) : "";
      copy.style.transform = p ? `translate3d(0, ${(-p * 46).toFixed(1)}px, 0)` : "";
    });
  });

  /* ----------------------------------------------------------
     Marquee: drifts on its own, speeds up and leans with your scroll, and turns with its direction
  ---------------------------------------------------------- */
  run("marquee", () => {
    const band = document.querySelector(".marquee");
    if (!band) return;
    const track = band.querySelector(".marquee-track");
    const group = track.firstElementChild;
    for (let i = 0; i < 3; i++) track.append(group.cloneNode(true));   // enough copies to loop on very wide screens
    if (reduce) return;
    let x = 0, w = 0, lastY = scrollY, vel = 0, dir = -1;
    onMeasure(() => { w = group.getBoundingClientRect().width; });
    whileVisible(band, (dt) => {
      const y = scrollY, dy = y - lastY;
      lastY = y;
      vel += (dy / Math.max(dt, 1 / 120) - vel) * Math.min(1, dt * 5);
      if (Math.abs(dy) > 0.5) dir = dy > 0 ? -1 : 1;
      x += dir * (38 + Math.min(Math.abs(vel) * 0.4, 1100)) * dt;
      if (w) { x %= w; if (x > 0) x -= w; }
      track.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0) skewX(${clamp(vel * 0.0022, -8, 8).toFixed(2)}deg)`;
    });
  });

  /* ----------------------------------------------------------
     Crew badge: tilts toward a mouse over it; otherwise (and on every touch screen) it leans gently as it
     travels up the screen. The tilt eases toward its target and goes to sleep once it's there.
  ---------------------------------------------------------- */
  run("crew", () => {
    const crew = document.querySelector(".crew");
    if (!crew) return;
    new IntersectionObserver(([e]) => crew.classList.toggle("is-away", !e.isIntersecting)).observe(crew);
    if (reduce) return;
    const card = crew.querySelector(".crew-card");
    let h = 1, top = 0, pointer = null;
    const now = { rx: 0, ry: 0 }, goal = { ...now };                          // the tilt, in degrees
    onMeasure(() => { const r = card.getBoundingClientRect(); h = r.height; top = r.top + scrollY; });
    const aim = () => {
      if (pointer) Object.assign(goal, { rx: (0.5 - pointer.y) * 12, ry: (pointer.x - 0.5) * 16 });
      else {
        const p = clamp((scrollY + innerHeight - top) / (innerHeight + h), 0, 1);   // 0: just in at the bottom, 1: about to leave at the top
        Object.assign(goal, { rx: (0.5 - p) * 14, ry: (p - 0.5) * 9 });
      }
    };
    const wake = whileVisible(crew, (dt) => {
      aim();
      const ease = 1 - Math.exp(-dt * 8);
      let moving = false;
      for (const key in now) { const d = goal[key] - now[key]; now[key] += d * ease; if (Math.abs(d) > 0.002) moving = true; }
      card.style.transform = `rotateX(${now.rx.toFixed(2)}deg) rotateY(${now.ry.toFixed(2)}deg)`;
      return moving;
    });
    onScroll(() => wake());
    if (finePointer) {
      crew.addEventListener("pointermove", (e) => {
        const r = crew.getBoundingClientRect();
        pointer = { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) };
        wake();
      });
      crew.addEventListener("pointerleave", () => { pointer = null; wake(); });
    }
  });

  /* ----------------------------------------------------------
     Facts: the numbers roll into place like an odometer (the digits are hidden from screen readers;
     each fact carries its own plain-text version)
  ---------------------------------------------------------- */
  run("odometer", () => {
    const LH = 1.05;
    document.querySelectorAll("[data-odo]").forEach((num) => {
      const digits = num.textContent.trim();
      num.textContent = "";
      const strips = Array.from(digits).map((d, k) => {
        const box = document.createElement("span"), strip = document.createElement("span");
        box.className = "odo";
        strip.className = "odo-strip";
        const target = (k === digits.length - 1 ? 10 : 0) + Number(d);   // the last digit spins a full turn first
        for (let n = 0; n <= target; n++) { const s = document.createElement("span"); s.textContent = String(n % 10); strip.append(s); }
        box.append(strip);
        num.append(box);
        return { strip, target, k };
      });
      num.roll = (delay) => strips.forEach(({ strip, target, k }) => {
        if (reduce) strip.style.transition = "none";
        strip.style.transitionDelay = `${(delay + k * 0.08).toFixed(2)}s`;
        strip.style.transform = `translateY(${(-target * LH).toFixed(2)}em)`;
      });
    });
    onReveal((el) => {
      const delay = (parseFloat(el.style.getPropertyValue("--reveal-delay")) || 0) + 0.2;
      if (el.querySelectorAll) el.querySelectorAll("[data-odo]").forEach((num, k) => num.roll && num.roll(delay + k * 0.12));
    });
  });

  /* ----------------------------------------------------------
     Work: as each project pins, the one beneath it shrinks back and sinks into the dark
  ---------------------------------------------------------- */
  run("stack", () => {
    const stack = document.querySelector(".stack");
    const items = Array.from(document.querySelectorAll(".stack-item"));
    if (!stack || items.length < 2) return;
    const panels = items.map((it) => it.querySelector(".panel"));
    const pinned = matchMedia("(min-width: 900px) and (min-height: 620px)");
    // keyboard: a focused project that is covered by the ones after it comes back to the front
    stack.addEventListener("focusin", (e) => {
      const i = items.findIndex((it) => it.contains(e.target));
      if (!pinned.matches || i < 0 || i === items.length - 1) return;
      if (items[i + 1].getBoundingClientRect().top >= items[i].getBoundingClientRect().bottom - 2) return;
      const gap = parseFloat(getComputedStyle(stack).rowGap) || 0;
      let top = stack.getBoundingClientRect().top + scrollY;
      for (let j = 0; j < i; j++) top += items[j].offsetHeight + gap;
      const y = top - (parseFloat(getComputedStyle(items[i]).top) || 0);
      if (JW.lenis) JW.lenis.scrollTo(y, { immediate: true }); else scrollTo({ top: y, behavior: "instant" });
    });
    if (reduce) return;
    let from = 0, to = 0;                                          // the stretch of scrolling where the stack is on screen
    onMeasure(() => { const r = stack.getBoundingClientRect(); from = r.top + scrollY - innerHeight; to = r.bottom + scrollY; });
    onScroll((y) => {
      if (!pinned.matches) { panels.forEach((p) => p.style.removeProperty("--cover")); return; }
      if (y < from || y > to) return;
      const r = items.map((it) => it.getBoundingClientRect());     // all the reads first, then the writes: one layout per frame
      for (let i = 0; i < items.length - 1; i++) {
        const cover = r[i + 1].top > innerHeight ? 0 : clamp((r[i].bottom - r[i + 1].top) / Math.max(1, r[i].height - 14), 0, 1);
        panels[i].style.setProperty("--cover", cover.toFixed(3));
      }
    });
  });

  /* ----------------------------------------------------------
     Toolbox: a small solar system, one planet per group of tools. Pick a group (a tab, the arrows, a swipe across the
     system, or the planet itself) and the system turns to bring it forward while its tools show alongside.
     This part owns the choice; js/scene3d.js draws the system and reports taps on planets ("orrery:pick").
  ---------------------------------------------------------- */
  run("orrery", () => {
    const orrery = document.querySelector("[data-orrery]");
    if (!orrery) return;
    const view = orrery.querySelector(".orrery-view"), stage = orrery.querySelector(".orrery-stage");
    const groups = orrery.querySelector(".orrery-groups"), panels = Array.from(groups.querySelectorAll(".orbit"));
    const n = panels.length, two = (v) => String(v).padStart(2, "0");
    let cur = 0;

    // a tab per group, in its planet's colour
    const tablist = document.createElement("div");
    tablist.className = "orrery-tabs";
    tablist.setAttribute("role", "tablist");
    tablist.setAttribute("aria-label", "Tool groups");
    const tabs = panels.map((panel, i) => {
      const tab = document.createElement("button"), tools = panel.querySelectorAll(".orbit-tools li");
      tab.type = "button";
      tab.className = "orrery-tab";
      tab.id = `tab-${panel.dataset.planet}`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", panel.id);
      tab.style.setProperty("--c", panel.style.getPropertyValue("--c"));
      tab.append(panel.querySelector(".orbit-name").firstChild.textContent.trim());
      const count = document.createElement("span");
      count.className = "orrery-tab-n";
      count.setAttribute("aria-hidden", "true");
      count.textContent = two(tools.length);
      tab.append(count);
      tab.addEventListener("click", () => select(i));
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      panel.tabIndex = 0;
      tools.forEach((li, k) => li.style.setProperty("--i", k));
      tablist.append(tab);
      return tab;
    });
    groups.prepend(tablist);

    // stepping through: arrows and the position, under the system
    const live = document.createElement("p");
    live.className = "sr-only";
    live.setAttribute("aria-live", "polite");
    const pos = document.createElement("span");
    pos.className = "orrery-pos";
    pos.setAttribute("aria-hidden", "true");
    const arrow = (dir, label) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "orrery-step";
      b.dataset.step = dir;
      b.setAttribute("aria-label", label);
      b.innerHTML = `<span aria-hidden="true">${dir < 0 ? "←" : "→"}</span>`;
      b.addEventListener("click", () => step(dir));
      return b;
    };
    view.append(arrow(-1, "Previous group"), pos, arrow(1, "Next group"), live);
    const step = (dir) => select((cur + dir + n) % n, { announce: true });

    function select(i, { focus = false, announce = false } = {}) {
      cur = i;
      tabs.forEach((t, k) => { t.setAttribute("aria-selected", String(k === i)); t.tabIndex = k === i ? 0 : -1; });
      panels.forEach((p, k) => { p.hidden = k !== i; });
      pos.textContent = `${two(i + 1)} / ${two(n)}`;
      stage.dataset.active = i;
      stage.dispatchEvent(new CustomEvent("orrery:select", { detail: { index: i } }));
      if (focus) tabs[i].focus();
      // the arrows, a swipe or a planet change the group without moving focus, so say what's showing now
      if (announce) live.textContent = `${tabs[i].firstChild.textContent}: ${Array.from(panels[i].querySelectorAll("li"), (li) => li.textContent).join(", ")}`;
    }

    // keyboard, as in any tab list: left and right move between groups, Home and End jump to the ends
    tablist.addEventListener("keydown", (e) => {
      const to = { ArrowRight: cur + 1, ArrowLeft: cur - 1, Home: 0, End: n - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      select((to + n) % n, { focus: true });
    });

    // a sideways swipe across the system steps to the next or previous group (up and down still scroll the page)
    let start = null;
    view.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") start = [e.clientX, e.clientY]; });
    view.addEventListener("pointercancel", () => { start = null; });
    view.addEventListener("pointerup", (e) => {
      if (!start) return;
      const dx = e.clientX - start[0], dy = e.clientY - start[1];
      start = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
    });
    stage.addEventListener("orrery:pick", (e) => { if (e.detail.index !== cur) select(e.detail.index, { announce: true }); });

    orrery.classList.add("is-ready");
    select(0);
  });

  /* ----------------------------------------------------------
     Testimonial: the quote lights up word by word as it scrolls into the reading zone
  ---------------------------------------------------------- */
  run("testimonial", () => {
    const q = document.querySelector(".testimonial-quote p");
    if (!q || reduce) return;
    const sentence = q.textContent.replace(/\s+/g, " ").trim();
    const visual = document.createElement("span");
    visual.setAttribute("aria-hidden", "true");
    let i = 0;
    const walk = (from, into) => from.childNodes.forEach((n) => {
      if (n.nodeType === 3) {
        n.nodeValue.split(/(\s+)/).forEach((part) => {
          if (part && /^\s+$/.test(part)) into.append(" ");
          else if (part) { const w = document.createElement("span"); w.className = "tq-w"; w.style.setProperty("--wi", i++); w.textContent = part; into.append(w); }
        });
      } else if (n.nodeType === 1) { const shell = n.cloneNode(false); into.append(shell); walk(n, shell); }
    });
    walk(q, visual);
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = sentence;
    q.replaceChildren(sr, visual);
    q.style.setProperty("--tn", i);
    let top = 0, h = 0;
    onMeasure(() => { const r = q.getBoundingClientRect(); top = r.top + scrollY; h = r.height; });
    onScroll((y, vh) => {
      const t = top - y, start = vh * 0.94, end = vh * 0.62 - h * 0.5;
      q.style.setProperty("--tp", clamp((start - t) / Math.max(1, start - end), 0, 1).toFixed(3));
    });
  });

  /* ----------------------------------------------------------
     Contact headline: gravity. Letters near the pointer get heavier and wider, the rest go light.
     Mouse and wide screens only; the gradient line becomes per-letter colour so it survives the split.
  ---------------------------------------------------------- */
  run("gravity", () => {
    const title = document.querySelector("[data-gravity]");
    if (!title || reduce || !matchMedia("(min-width: 1000px) and (hover: hover) and (pointer: fine)").matches) return;
    const stops = [[245, 196, 67], [255, 122, 87], [255, 122, 176]];   // the brand gradient: sun, coral, pink
    const tint = (t) => {
      const s = t < 0.5 ? 0 : 1, f = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      return `rgb(${stops[s].map((c, j) => Math.round(c + (stops[s + 1][j] - c) * f)).join(",")})`;
    };
    const sentence = title.textContent.replace(/\s+/g, " ").trim();
    const letters = [];
    title.querySelectorAll(".contact-line").forEach((line) => {
      const graded = line.classList.contains("grad");
      const chars = Array.from(line.textContent.trim());
      line.textContent = "";
      line.classList.remove("grad");
      chars.forEach((ch, i) => {
        if (ch === " ") { line.append(" "); return; }
        const l = document.createElement("span");
        l.className = "gl";
        l.textContent = ch;
        if (graded) l.style.color = tint(i / Math.max(1, chars.length - 1));
        line.append(l);
        letters.push(l);
      });
      line.setAttribute("aria-hidden", "true");
    });
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = sentence;
    title.prepend(sr);
    title.classList.add("gravity-on");

    let centers = [], px = 0, py = 0, near = false;
    const weight = letters.map(() => 700), stretch = letters.map(() => 100);
    onMeasure(() => { centers = letters.map((l) => { const r = l.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2 + scrollY]; }); });
    const section = title.closest("section") || title;
    let settling = false;
    const wake = whileVisible(section, () => {
      settling = false;
      letters.forEach((l, i) => {
        let tw = 700, ts = 100;
        if (near && centers[i]) {
          const d = Math.hypot(centers[i][0] - px, centers[i][1] - scrollY - py);
          const g = Math.exp(-(d * d) / (2 * 190 * 190));
          tw = 540 + 260 * g;
          ts = 88 + 12 * g;
        }
        weight[i] += (tw - weight[i]) * 0.16;
        stretch[i] += (ts - stretch[i]) * 0.16;
        if (Math.abs(tw - weight[i]) > 0.6) settling = true;
        l.style.fontWeight = weight[i].toFixed(0);
        l.style.fontStretch = `${stretch[i].toFixed(1)}%`;
      });
      return settling;
    });
    section.addEventListener("pointermove", (e) => { px = e.clientX; py = e.clientY; near = true; wake(); });
    section.addEventListener("pointerleave", () => { near = false; wake(); });
  });

  JW.measure();
})();
