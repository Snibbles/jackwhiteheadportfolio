/* ============================================================
   Page behaviour, in small independent parts. Each part is wrapped, so if one fails the rest still runs,
   and without JavaScript the page is complete and readable (see the scripting media queries in v2.css).
   ============================================================ */
(() => {
  "use strict";

  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const onScreen = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; };
  const run = (name, fn) => { try { fn(); } catch (e) { console.warn(`[${name}]`, e); } };

  /* scroll-linked effects share one rAF; positions are measured once (and again on resize), never on every frame */
  const fx = [], measures = [];
  let queued = false;
  const frame = () => { queued = false; const y = scrollY, vh = innerHeight; fx.forEach((f) => f(y, vh)); };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
  const measure = () => { measures.forEach((m) => m()); queue(); };

  /* things that should happen when an element is revealed (odometers...) */
  const revealHooks = [];

  /* ----------------------------------------------------------
     Reveal on scroll
  ---------------------------------------------------------- */
  run("reveal", () => {
    const els = document.querySelectorAll("[data-reveal]");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.classList.add("is-visible");
        revealHooks.forEach((h) => h(el));
        io.unobserve(el);
      });
    }, { threshold: 0, rootMargin: "0px 0px -40px 0px" });

    els.forEach((el) => {
      const group = el.closest(".about-grid, .work-grid, .skills-grid, .stat-grid, .shot-pair, .project-duo");
      let delay = 0;
      if (group) delay = Math.min(Array.from(group.querySelectorAll("[data-reveal]")).indexOf(el), 5) * 0.08;
      el.style.setProperty("--reveal-delay", reduce ? "0s" : `${delay}s`);
      // the hero is the first screen by definition: it never waits for a scroll (on short screens its buttons sit right at the fold)
      if (el.closest(".hero")) el.classList.add("is-visible");
      else io.observe(el);
    });

    // chips pop in one after another inside their group
    document.querySelectorAll(".skills-group").forEach((g) => g.querySelectorAll(".chip").forEach((c, i) => c.style.setProperty("--ci", i)));
  });

  /* ----------------------------------------------------------
     Header: glass bar once you leave the hero, and a reading-progress hairline
  ---------------------------------------------------------- */
  run("header", () => {
    const header = document.getElementById("site-header");
    const hero = document.querySelector(".hero");
    if (!header) return;
    if (hero) {
      new IntersectionObserver(([e]) => header.classList.toggle("scrolled", !e.isIntersecting || e.intersectionRatio < 0.6), { threshold: [0, 0.6] }).observe(hero);
    } else header.classList.add("scrolled");

    const bar = document.createElement("span");
    bar.className = "scroll-progress";
    bar.setAttribute("aria-hidden", "true");
    header.append(bar);
    let max = 1;
    measures.push(() => { max = Math.max(1, root.scrollHeight - innerHeight); });
    fx.push((y) => header.style.setProperty("--sp", clamp(y / max, 0, 1).toFixed(4)));
  });

  /* ----------------------------------------------------------
     Nav: one pill glides between the links (hover, focus and the section you're reading)
  ---------------------------------------------------------- */
  run("nav", () => {
    const nav = document.getElementById("nav");
    const glider = document.getElementById("nav-indicator");
    if (!nav || !glider) return;
    const links = Array.from(nav.querySelectorAll(".nav-link"));
    const mobileLinks = Array.from(document.querySelectorAll(".mobile-link"));
    let current = nav.querySelector(".nav-link.active");
    let pointing = false;

    function place(link, instant) {
      if (!link || !link.offsetParent) { glider.classList.remove("visible"); return; }
      const nr = nav.getBoundingClientRect(), lr = link.getBoundingClientRect();
      const jump = instant || !glider.classList.contains("visible");
      if (jump) glider.classList.add("instant");
      glider.style.width = `${lr.width}px`;
      glider.style.height = `${lr.height}px`;
      glider.style.transform = `translate(${lr.left - nr.left}px, ${lr.top - nr.top}px)`;
      glider.classList.add("visible");
      if (jump) { void glider.offsetWidth; glider.classList.remove("instant"); }
    }

    links.forEach((l) => {
      l.addEventListener("pointerenter", () => { pointing = true; place(l); });
      l.addEventListener("focus", () => place(l));
    });
    nav.addEventListener("pointerleave", () => { pointing = false; place(current); });
    nav.addEventListener("focusout", (e) => { if (!nav.contains(e.relatedTarget)) place(current); });

    // which section is in the middle of the screen (home page only: its links point at #ids)
    const byId = new Map();
    links.concat(mobileLinks).forEach((l) => {
      const h = l.getAttribute("href") || "";
      if (h.startsWith("#") && h.length > 1) byId.set(h.slice(1), (byId.get(h.slice(1)) || []).concat(l));
    });
    if (byId.size) {
      const sections = Array.from(document.querySelectorAll("#main > section[id]"));
      const spy = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const match = byId.get(entry.target.id) || [];
          links.concat(mobileLinks).forEach((l) => l.classList.toggle("active", match.includes(l)));
          current = match.find((l) => links.includes(l)) || null;
          if (!pointing) place(current);
        });
      }, { rootMargin: "-45% 0px -50% 0px" });
      sections.forEach((s) => spy.observe(s));
    }

    const settle = () => place(pointing ? null : current, true);
    addEventListener("resize", settle);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle);
    settle();
  });

  /* ----------------------------------------------------------
     Mobile menu: hidden means unfocusable, Esc closes, the page behind is inert while it's open
  ---------------------------------------------------------- */
  run("menu", () => {
    const toggle = document.getElementById("menu-toggle");
    const menu = document.getElementById("mobile-menu");
    if (!toggle || !menu) return;
    const behind = [document.getElementById("main"), document.querySelector(".site-footer"), document.querySelector(".site-header .logo"), document.querySelector(".skip-link")].filter(Boolean);
    menu.inert = true;

    function setOpen(open, moveFocus = true) {
      menu.classList.toggle("open", open);
      root.classList.toggle("menu-open", open);
      menu.inert = !open;
      behind.forEach((el) => { el.inert = open; });
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      if (!moveFocus) return;
      if (open) setTimeout(() => { const first = menu.querySelector("a"); if (first) first.focus({ preventScroll: true }); }, 60);
      else toggle.focus({ preventScroll: true });
    }

    toggle.addEventListener("click", () => setOpen(!menu.classList.contains("open")));
    menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setOpen(false, false)));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.classList.contains("open")) setOpen(false); });
    matchMedia("(min-width: 720px)").addEventListener("change", (m) => { if (m.matches && menu.classList.contains("open")) setOpen(false, false); });
  });

  /* ----------------------------------------------------------
     Hero: masks come off once the words have risen; the copy drifts back as you scroll away (wide screens)
  ---------------------------------------------------------- */
  run("hero", () => {
    const hero = document.querySelector(".hero");
    if (!hero) return;
    let settled = false;
    const settle = () => { if (settled) return; settled = true; setTimeout(() => hero.classList.add("hero-settled"), reduce ? 0 : 1700); };
    if (root.classList.contains("skip-intro") || root.classList.contains("no-3d") || !hero.classList.contains("hero-wait")) settle();
    else addEventListener("hero:landed", settle, { once: true });

    const copy = hero.querySelector(".hero-copy");
    const wide = matchMedia("(min-width: 760px) and (min-aspect-ratio: 21/20)");
    if (!copy || reduce) return;
    fx.push((y, vh) => {
      if (!wide.matches) { copy.style.opacity = ""; copy.style.transform = ""; return; }
      const p = clamp((y - vh * 0.06) / (vh * 0.6), 0, 1);
      copy.style.opacity = p ? (1 - p * 0.92).toFixed(3) : "";
      copy.style.transform = p ? `translate3d(0, ${(-p * 46).toFixed(1)}px, 0)` : "";
    });
  });

  /* ----------------------------------------------------------
     Stats: numbers roll into place like an odometer (screen readers get the plain number)
  ---------------------------------------------------------- */
  run("odometer", () => {
    const LH = 1.05;
    document.querySelectorAll(".stat-number").forEach((num) => {
      const first = num.firstChild;
      if (!first || first.nodeType !== 3) return;
      const m = first.nodeValue.match(/^(\s*)(\d+)([\s\S]*)$/);
      if (!m) return;
      const digits = m[2];
      const sr = document.createElement("span");
      sr.className = "sr-only";
      sr.textContent = digits;
      const odo = document.createElement("span");
      odo.setAttribute("aria-hidden", "true");
      odo.style.display = "inline-flex";
      const strips = Array.from(digits).map((d, k) => {
        const box = document.createElement("span");
        box.className = "odo";
        const strip = document.createElement("span");
        strip.className = "odo-strip";
        const laps = k === digits.length - 1 ? 1 : 0;          // the last digit spins a full turn first
        const target = laps * 10 + Number(d);
        for (let n = 0; n <= target; n++) { const s = document.createElement("span"); s.textContent = String(n % 10); strip.append(s); }
        box.append(strip);
        odo.append(box);
        return { strip, target };
      });
      first.nodeValue = m[3];
      num.insertBefore(odo, first);
      num.insertBefore(sr, odo);
      num._roll = (delay) => strips.forEach(({ strip, target }) => {
        if (reduce) strip.style.transition = "none";
        strip.style.transitionDelay = `${delay}s`;
        strip.style.transform = `translateY(${-target * LH}em)`;
      });
    });
    revealHooks.push((el) => {
      if (!el.matches(".stat-card")) return;
      const delay = parseFloat(el.style.getPropertyValue("--reveal-delay")) || 0;
      el.querySelectorAll(".stat-number").forEach((n) => n._roll && n._roll(delay + 0.15));
    });
  });

  /* ----------------------------------------------------------
     Testimonial: lights up word by word as it scrolls into the reading zone
  ---------------------------------------------------------- */
  run("testimonial", () => {
    const q = document.querySelector(".testimonial-quote");
    if (!q || reduce) return;
    const full = q.textContent.replace(/\s+/g, " ").trim();
    const visual = document.createElement("span");
    visual.setAttribute("aria-hidden", "true");
    let i = 0;
    const walk = (from, into) => {
      from.childNodes.forEach((n) => {
        if (n.nodeType === 3) {
          n.nodeValue.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { into.append(" "); return; }
            const w = document.createElement("span");
            w.className = "tq-w";
            w.style.setProperty("--wi", i++);
            w.textContent = part;
            into.append(w);
          });
        } else if (n.nodeType === 1) {
          const shell = n.cloneNode(false);
          into.append(shell);
          walk(n, shell);
        }
      });
    };
    walk(q, visual);
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = full;
    q.replaceChildren(sr, visual);
    q.style.setProperty("--tn", i);

    let top = 0, h = 0;
    measures.push(() => { const r = q.getBoundingClientRect(); top = r.top + scrollY; h = r.height; });
    fx.push((y, vh) => {
      const t = top - y, start = vh * 0.94, end = vh * 0.62 - h * 0.5;
      q.style.setProperty("--tp", clamp((start - t) / Math.max(1, start - end), 0, 1).toFixed(3));
    });
  });

  /* ----------------------------------------------------------
     Contact: the planet rises over the panel's edge; copy-the-address button; magnetic call to action
  ---------------------------------------------------------- */
  run("contact", () => {
    const panel = document.querySelector(".contact-inner");
    if (panel && !reduce) {
      let top = 0;
      measures.push(() => { top = panel.getBoundingClientRect().top + scrollY; });
      fx.push((y, vh) => panel.style.setProperty("--rise", clamp((vh - (top - y)) / (vh * 0.75), 0, 1).toFixed(3)));
    }

    const status = document.getElementById("copy-status");
    document.querySelectorAll("[data-copy]").forEach((btn) => {
      const label = btn.querySelector(".btn-copy-label");
      const original = label ? label.textContent : "";
      let timer;
      btn.hidden = false;
      btn.addEventListener("click", async () => {
        const text = btn.dataset.copy;
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
          const ta = document.createElement("textarea");
          ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.append(ta); ta.select();
          try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
          ta.remove();
        }
        btn.classList.toggle("copied", ok);
        if (label) label.textContent = ok ? "Copied" : "Copy failed";
        if (status) status.textContent = ok ? `Email address ${text} copied to the clipboard.` : `Couldn't copy. The address is ${text}.`;
        clearTimeout(timer);
        timer = setTimeout(() => { btn.classList.remove("copied"); if (label) label.textContent = original; if (status) status.textContent = ""; }, 2400);
      });
    });
  });

  run("magnetic", () => {
    if (!finePointer || reduce) return;
    document.querySelectorAll("[data-magnetic]").forEach((el) => {
      let ox = 0, oy = 0;
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const cx = r.left - ox + r.width / 2, cy = r.top - oy + r.height / 2;
        ox = clamp((e.clientX - cx) * 0.22, -9, 9);
        oy = clamp((e.clientY - cy) * 0.32, -7, 7);
        el.classList.add("is-magnet");
        el.style.translate = `${ox.toFixed(1)}px ${oy.toFixed(1)}px`;
      });
      el.addEventListener("pointerleave", () => { ox = oy = 0; el.classList.remove("is-magnet"); el.style.translate = ""; });
    });
  });

  /* ----------------------------------------------------------
     Cards: a soft light follows the pointer and the edge catches it
  ---------------------------------------------------------- */
  run("spotlight", () => {
    if (!finePointer) return;
    document.querySelectorAll(".work-card, .stat-card").forEach((card) => {
      card.classList.add("spot");
      const ring = document.createElement("span");
      ring.className = "glow-ring";
      ring.setAttribute("aria-hidden", "true");
      card.append(ring);
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${(e.clientX - r.left).toFixed(0)}px`);
        card.style.setProperty("--my", `${(e.clientY - r.top).toFixed(0)}px`);
      });
    });
  });

  /* ----------------------------------------------------------
     Footer: what time it is in Amsterdam right now
  ---------------------------------------------------------- */
  run("clock", () => {
    const clocks = document.querySelectorAll(".footer-clock");
    if (!clocks.length || !window.Intl) return;
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hour12: false });
    const tick = () => {
      const now = new Date(), text = fmt.format(now), hour = parseInt(text, 10);
      clocks.forEach((c) => {
        const t = c.querySelector("time");
        if (t) { t.textContent = text; t.dateTime = text; }
        c.classList.toggle("is-night", hour < 7 || hour >= 21);
        c.hidden = false;
      });
    };
    tick();
    setInterval(tick, 15000);
  });

  /* ----------------------------------------------------------
     Case studies: open any picture large (keyboard, swipe, Esc), with a morph from the page where supported
  ---------------------------------------------------------- */
  run("lightbox", () => {
    const imgs = Array.from(document.querySelectorAll(".project-cover > img, .shot-media > img"));
    if (!imgs.length) return;
    const icon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
    const items = imgs.map((img) => {
      const fig = img.closest("figure");
      const cap = fig && fig.querySelector("figcaption");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "zoom";
      btn.setAttribute("aria-label", `Enlarge image: ${img.alt}`);
      img.replaceWith(btn);
      btn.append(img);
      return { img, btn, caption: cap ? cap.textContent.trim() : "" };
    });

    const dlg = document.createElement("dialog");
    dlg.className = "lightbox";
    dlg.setAttribute("aria-label", "Image viewer");
    dlg.innerHTML = `
      <p class="lb-count" aria-hidden="true"></p>
      <figure class="lb-figure"><img class="lb-img" alt=""><figcaption class="lb-cap"></figcaption></figure>
      <button type="button" class="lb-btn lb-prev" aria-label="Previous image">${icon("M15 18l-6-6 6-6")}</button>
      <button type="button" class="lb-btn lb-next" aria-label="Next image">${icon("M9 18l6-6-6-6")}</button>
      <button type="button" class="lb-btn lb-close" aria-label="Close image viewer" autofocus>${icon("M18 6 6 18M6 6l12 12")}</button>
      <p class="sr-only" aria-live="polite"></p>`;
    document.body.append(dlg);
    const lbImg = dlg.querySelector(".lb-img"), lbCap = dlg.querySelector(".lb-cap"), count = dlg.querySelector(".lb-count");
    const prev = dlg.querySelector(".lb-prev"), next = dlg.querySelector(".lb-next"), live = dlg.querySelector("[aria-live]");
    const canMorph = !!document.startViewTransition && !reduce;
    let cur = 0;

    function show(i, announce) {
      cur = (i + items.length) % items.length;
      const it = items[cur];
      lbImg.src = it.img.currentSrc || it.img.src;
      lbImg.alt = it.img.alt;
      lbCap.textContent = it.caption;
      lbCap.hidden = !it.caption;
      count.textContent = `${String(cur + 1).padStart(2, "0")} / ${String(items.length).padStart(2, "0")}`;
      prev.hidden = next.hidden = items.length < 2;
      if (announce) live.textContent = `Image ${cur + 1} of ${items.length}: ${it.img.alt}`;
    }
    function open(i) {
      const it = items[i];
      const go = () => { show(i); dlg.showModal(); root.classList.add("lb-open"); };
      if (!canMorph) { dlg.classList.add("no-vt"); go(); return; }
      it.img.style.viewTransitionName = "lb-img";
      const t = document.startViewTransition(() => { it.img.style.viewTransitionName = "none"; lbImg.style.viewTransitionName = "lb-img"; go(); });
      t.finished.finally(() => { lbImg.style.viewTransitionName = ""; it.img.style.viewTransitionName = ""; });
    }
    function close() {
      if (!dlg.open) return;
      const it = items[cur];
      // paged to a picture further down? bring it into view behind the backdrop, so you land where it lives (and so does focus)
      if (!onScreen(it.btn)) it.btn.scrollIntoView({ block: "center", behavior: "instant" });
      const done = () => { dlg.close(); root.classList.remove("lb-open"); live.textContent = ""; it.btn.focus({ preventScroll: true }); };
      if (!canMorph) { done(); return; }
      lbImg.style.viewTransitionName = "lb-img";
      const t = document.startViewTransition(() => { lbImg.style.viewTransitionName = ""; it.img.style.viewTransitionName = "lb-img"; done(); });
      t.finished.finally(() => { it.img.style.viewTransitionName = ""; });
    }
    function step(d) {
      show(cur + d, true);
      dlg.classList.remove("is-swapping");
      void dlg.offsetWidth;
      dlg.classList.add("is-swapping");
    }

    items.forEach((it, i) => it.btn.addEventListener("click", () => open(i)));
    prev.addEventListener("click", () => step(-1));
    next.addEventListener("click", () => step(1));
    dlg.querySelector(".lb-close").addEventListener("click", close);
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target === lbImg || e.target.classList.contains("lb-figure")) close(); });
    dlg.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    });
    let sx = null;
    dlg.addEventListener("pointerdown", (e) => { sx = e.pointerType === "mouse" ? null : e.clientX; });
    dlg.addEventListener("pointerup", (e) => {
      if (sx === null || items.length < 2) return;
      const dx = e.clientX - sx; sx = null;
      if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    });
  });

  /* ----------------------------------------------------------
     Between pages: only pictures that are actually on screen morph, and cards already in view
     appear at once, so the picture always lands somewhere visible.
  ---------------------------------------------------------- */
  run("page-transitions", () => {
    const targets = () => document.querySelectorAll(".work-card-visual-img, .project-cover img, .next-thumb img");
    const prune = () => targets().forEach((el) => { if (!onScreen(el)) el.style.viewTransitionName = "none"; });
    const restore = () => targets().forEach((el) => { el.style.viewTransitionName = ""; });
    addEventListener("pageswap", (e) => { if (e.viewTransition) prune(); });
    addEventListener("pageshow", (e) => { if (e.persisted) restore(); });
    addEventListener("pagereveal", (e) => {
      if (!e.viewTransition) return;
      prune();
      const shown = [];
      document.querySelectorAll("[data-reveal]:not(.is-visible)").forEach((el) => {
        if (onScreen(el)) { el.classList.add("reveal-instant", "is-visible"); shown.push(el); }
      });
      e.viewTransition.finished.finally(() => { restore(); shown.forEach((el) => el.classList.remove("reveal-instant")); });
    });
  });

  /* ----------------------------------------------------------
     Looping demo clips: play while on screen, pause when not. With reduced motion they stay paused and show controls.
  ---------------------------------------------------------- */
  run("videos", () => {
    const vids = document.querySelectorAll("video[data-loop]");
    if (!vids.length) return;
    if (reduce) { vids.forEach((v) => v.setAttribute("controls", "")); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      const v = e.target;
      if (e.isIntersecting) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause();
    }), { threshold: 0.4 });
    vids.forEach((v) => { v.preload = "metadata"; io.observe(v); });
  });

  /* ----------------------------------------------------------
     About: the crew card tilts toward the pointer (skipped for touch and reduced motion)
  ---------------------------------------------------------- */
  run("crew-tilt", () => {
    const crew = document.querySelector(".crew");
    if (!crew || reduce || !finePointer) return;
    const card = crew.querySelector(".crew-card");
    crew.addEventListener("pointermove", (e) => {
      const r = crew.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty("--ry", `${(x * 9).toFixed(2)}deg`);
      card.style.setProperty("--rx", `${(-y * 7).toFixed(2)}deg`);
    });
    crew.addEventListener("pointerleave", () => { card.style.setProperty("--rx", "0deg"); card.style.setProperty("--ry", "0deg"); });
  });

  /* ---------- start the scroll-linked effects ---------- */
  addEventListener("scroll", queue, { passive: true });
  addEventListener("resize", measure);
  addEventListener("load", measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  if (window.ResizeObserver) new ResizeObserver(measure).observe(document.body);
  measure();
})();
