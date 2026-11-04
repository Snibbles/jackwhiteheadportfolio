/* ============================================================
   Home page sections: hero, marquee, crew badge, stats, work stack, skill orbits, testimonial
   and the contact headline. Uses the shared helpers from js/main.js (window.JW).
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
     Crew badge: tilts toward the pointer, and the holographic foil follows the light
  ---------------------------------------------------------- */
  run("crew", () => {
    const crew = document.querySelector(".crew");
    if (!crew || reduce || !finePointer) return;
    const card = crew.querySelector(".crew-card");
    crew.addEventListener("pointermove", (e) => {
      const r = crew.getBoundingClientRect();
      const x = clamp((e.clientX - r.left) / r.width, 0, 1), y = clamp((e.clientY - r.top) / r.height, 0, 1);
      card.style.setProperty("--ry", `${((x - 0.5) * 16).toFixed(2)}deg`);
      card.style.setProperty("--rx", `${((0.5 - y) * 12).toFixed(2)}deg`);
      card.style.setProperty("--px", (x * 100).toFixed(1));
      card.style.setProperty("--py", (y * 100).toFixed(1));
    });
    crew.addEventListener("pointerleave", () => { card.style.setProperty("--rx", "0deg"); card.style.setProperty("--ry", "0deg"); });
  });

  /* ----------------------------------------------------------
     Stats: each number rolls into place like an odometer (the visible digits are hidden from screen readers;
     each stat carries its own plain-text version)
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
      const num = el.querySelector && el.querySelector("[data-odo]");
      if (num && num.roll) num.roll((parseFloat(el.style.getPropertyValue("--reveal-delay")) || 0) + 0.15);
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
    onScroll(() => {
      if (!pinned.matches) { panels.forEach((p) => p.style.removeProperty("--cover")); return; }
      for (let i = 0; i < items.length - 1; i++) {
        const a = items[i].getBoundingClientRect(), b = items[i + 1].getBoundingClientRect();
        if (b.top > innerHeight) { panels[i].style.setProperty("--cover", "0"); continue; }
        const cover = clamp((a.bottom - b.top) / Math.max(1, a.height - 14), 0, 1);
        panels[i].style.setProperty("--cover", cover.toFixed(3));
      }
    });
  });

  /* ----------------------------------------------------------
     Skills: four rings turn at their own pace and slow almost to a stop while you read them.
     The legend (and pointing at a ring) brings one group forward.
  ---------------------------------------------------------- */
  run("orbits", () => {
    const sys = document.querySelector(".orbits");
    if (!sys) return;
    const rings = Array.from(sys.querySelectorAll(".ring"));
    const buttons = Array.from(sys.querySelectorAll(".orbits-legend button"));
    let pinned = null;
    const focus = (key) => {
      if (key) sys.dataset.focus = key; else delete sys.dataset.focus;
      rings.forEach((r) => r.classList.toggle("is-focus", r.dataset.group === key));
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.group === pinned)));
    };
    buttons.forEach((b) => {
      b.addEventListener("click", () => { pinned = pinned === b.dataset.group ? null : b.dataset.group; focus(pinned); });
      b.addEventListener("pointerenter", () => focus(b.dataset.group));
      b.addEventListener("pointerleave", () => focus(pinned));
    });
    rings.forEach((r) => {
      r.addEventListener("pointerenter", () => { if (!pinned) focus(r.dataset.group); });
      r.addEventListener("pointerleave", () => { if (!pinned) focus(null); });
    });

    const angles = rings.map((_, i) => i * 53);
    rings.forEach((r, i) => r.style.setProperty("--spin", `${angles[i]}deg`));
    const wide = matchMedia("(min-width: 1000px)");
    if (reduce) return;
    const speeds = rings.map((r) => (360 / (parseFloat(r.style.getPropertyValue("--dur")) || 80)) * (r.style.getPropertyValue("--dir").trim() === "reverse" ? -1 : 1));
    let k = 1, target = 1;
    sys.addEventListener("pointerenter", () => { target = 0.1; });
    sys.addEventListener("pointerleave", () => { target = 1; });
    whileVisible(sys, (dt) => {
      if (!wide.matches) return false;
      k += (target - k) * Math.min(1, dt * 3);
      rings.forEach((r, i) => {
        angles[i] = (angles[i] + speeds[i] * k * dt) % 360;
        r.style.setProperty("--spin", `${angles[i].toFixed(2)}deg`);
      });
    });
  });

  /* ----------------------------------------------------------
     Testimonial: the quote lights up word by word as it scrolls into the reading zone,
     and the signal waveform under it moves while it's on screen
  ---------------------------------------------------------- */
  run("testimonial", () => {
    const q = document.querySelector(".testimonial-quote p");
    const wave = document.querySelector(".wave");
    if (wave) {
      for (let i = 0; i < 30; i++) {
        const bar = document.createElement("i");
        bar.style.setProperty("--k", i);
        bar.style.setProperty("--amp", (0.3 + 0.7 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.45))).toFixed(2));
        wave.append(bar);
      }
      if (!reduce) new IntersectionObserver(([e]) => wave.classList.toggle("is-live", e.isIntersecting)).observe(wave);
    }
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
