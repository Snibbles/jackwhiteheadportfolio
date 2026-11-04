/* ============================================================
   Site-wide behaviour, on every page.
   Small independent parts: if one fails the rest still runs, and without JavaScript every page is
   complete and readable (see "Reduced motion & no-script" in css/site.css).
   Home-page sections live in js/home.js, the 3D layer in js/scene3d.js.
   ============================================================ */
(() => {
  "use strict";

  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const onScreen = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; };
  const run = (name, fn) => { try { fn(); } catch (e) { console.warn(`[${name}]`, e); } };

  /* Scroll-linked effects share one animation frame. Positions are measured on load and resize, never per frame. */
  const fx = [], measures = [], revealHooks = [];
  let queued = false;
  const frame = () => { queued = false; const y = scrollY, vh = innerHeight; fx.forEach((f) => f(y, vh)); };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
  const measure = () => { measures.forEach((m) => m()); queue(); };

  /* Run a callback once, the first time an element scrolls into view. */
  const onceVisible = (() => {
    const callbacks = new Map();
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      (callbacks.get(e.target) || []).forEach((cb) => cb(e.target));
      callbacks.delete(e.target);
    }), { rootMargin: "0px 0px -40px 0px" });
    return (el, cb) => { callbacks.set(el, (callbacks.get(el) || []).concat(cb)); io.observe(el); };
  })();

  /* Shared with js/home.js */
  const JW = (window.JW = {
    reduce, finePointer, clamp, onScreen, run, onceVisible, measure,
    onScroll: (f) => fx.push(f), onMeasure: (f) => measures.push(f), onReveal: (f) => revealHooks.push(f),
    lenis: null,
  });

  /* ----------------------------------------------------------
     Headings rise word by word out of a mask. Screen readers get the plain sentence.
  ---------------------------------------------------------- */
  run("split", () => {
    document.querySelectorAll("[data-split]").forEach((h) => {
      const sentence = h.textContent.replace(/\s+/g, " ").trim();
      const visual = document.createElement("span");
      visual.setAttribute("aria-hidden", "true");
      let i = 0;
      const word = (content) => {
        const outer = document.createElement("span"), inner = document.createElement("span");
        outer.className = "sw";
        inner.style.setProperty("--wi", i++);
        inner.append(content);
        outer.append(inner);
        return outer;
      };
      h.childNodes.forEach((n) => {
        if (n.nodeType === 3) {
          n.nodeValue.split(/(\s+)/).forEach((part) => {
            if (part && /^\s+$/.test(part)) visual.append(" ");
            else if (part) visual.append(word(part));
          });
        } else if (n.nodeName === "BR") visual.append(document.createElement("br"));
        else if (n.nodeType === 1) visual.append(word(n.cloneNode(true)));   // an inline phrase (like the gradient one) rises as one piece
      });
      const sr = document.createElement("span");
      sr.className = "sr-only";
      sr.textContent = sentence;
      h.replaceChildren(sr, visual);
      if (reduce) h.classList.add("split-in");
      else onceVisible(h, () => h.classList.add("split-in"));
    });
  });

  /* ----------------------------------------------------------
     Reveal on scroll (staggered inside groups). The hero never waits for a scroll.
  ---------------------------------------------------------- */
  run("reveal", () => {
    document.querySelectorAll("[data-reveal]").forEach((el) => {
      const group = el.parentElement && el.parentElement.closest(".about-grid, .stats, .gallery, .shot-pair, .project-duo");
      const index = group ? Array.from(group.querySelectorAll("[data-reveal]")).indexOf(el) : 0;
      el.style.setProperty("--reveal-delay", reduce ? "0s" : `${Math.min(index, 5) * 0.09}s`);
      const show = () => { el.classList.add("is-visible"); revealHooks.forEach((h) => h(el)); };
      if (el.closest(".hero")) show();
      else onceVisible(el, show);
    });
  });

  /* ----------------------------------------------------------
     Header: a glass bar once you leave the hero, and a reading-progress hairline
  ---------------------------------------------------------- */
  run("header", () => {
    const header = document.getElementById("site-header");
    const hero = document.querySelector(".hero");
    if (!header) return;
    if (hero) new IntersectionObserver(([e]) => header.classList.toggle("scrolled", !e.isIntersecting || e.intersectionRatio < 0.6), { threshold: [0, 0.6] }).observe(hero);
    else header.classList.add("scrolled");
    const bar = document.createElement("span");
    bar.className = "scroll-progress";
    bar.setAttribute("aria-hidden", "true");
    header.append(bar);
    let max = 1;
    measures.push(() => { max = Math.max(1, root.scrollHeight - innerHeight); });
    fx.push((y) => header.style.setProperty("--sp", clamp(y / max, 0, 1).toFixed(4)));
  });

  /* ----------------------------------------------------------
     Nav: one pill glides between the links (pointer, focus, and the section you're reading)
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

    // the home page links point at #ids: follow the section in the middle of the screen
    const byId = new Map();
    links.concat(mobileLinks).forEach((l) => {
      const h = l.getAttribute("href") || "";
      if (h.startsWith("#") && h.length > 1) byId.set(h.slice(1), (byId.get(h.slice(1)) || []).concat(l));
    });
    if (byId.size) {
      const spy = new IntersectionObserver((entries) => entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const match = byId.get(entry.target.id) || [];
        links.concat(mobileLinks).forEach((l) => l.classList.toggle("active", match.includes(l)));
        current = match.find((l) => links.includes(l)) || null;
        if (!pointing) place(current);
      }), { rootMargin: "-45% 0px -50% 0px" });
      document.querySelectorAll("#main > section[id]").forEach((s) => spy.observe(s));
    }
    const settle = () => place(pointing ? null : current, true);
    addEventListener("resize", settle);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle);
    settle();
  });

  /* ----------------------------------------------------------
     Mobile menu: hidden means unfocusable, Esc closes it, the page behind is inert while it's open
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
      if (JW.lenis) JW.lenis[open ? "stop" : "start"]();
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
     Smooth scrolling (Lenis) for wheel and trackpad. Touch, keyboard and scrollbars stay native.
     In-page links keep moving focus to where they lead. Off when motion is reduced.
  ---------------------------------------------------------- */
  run("smooth-scroll", () => {
    if (reduce) return;
    import("https://cdn.jsdelivr.net/npm/lenis@1.3.19/dist/lenis.mjs").then(({ default: Lenis }) => {
      JW.lenis = new Lenis({ lerp: 0.1, autoRaf: true, allowNestedScroll: true, prevent: (node) => !!(node.closest && node.closest(".lightbox, .mobile-menu")) });
    }).catch(() => {});

    document.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || !JW.lenis || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const id = decodeURIComponent(a.getAttribute("href").slice(1));
      const target = id && id !== "top" ? document.getElementById(id) : null;
      e.preventDefault();
      if (target) {
        JW.lenis.scrollTo(target, { offset: -(parseFloat(getComputedStyle(target).scrollMarginTop) || 0) });
        history.pushState(null, "", `#${id}`);
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      } else {
        JW.lenis.scrollTo(0);
        history.pushState(null, "", location.pathname + location.search);
        const logo = document.querySelector(".site-header .logo");
        if (logo) logo.focus({ preventScroll: true });
      }
    });
  });

  /* ----------------------------------------------------------
     A small "View" label follows the pointer over projects (mouse only)
  ---------------------------------------------------------- */
  run("cursor", () => {
    if (!finePointer || reduce || !document.querySelector("[data-cursor]")) return;
    const el = document.createElement("div");
    el.className = "cursor";
    el.setAttribute("aria-hidden", "true");
    document.body.append(el);
    let x = 0, y = 0, tx = 0, ty = 0, s = 0, ts = 0, raf = 0, label = "";
    const tick = () => {
      x += (tx - x) * 0.22; y += (ty - y) * 0.22; s += (ts - s) * 0.2;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(ts - s) > 0.05 ? requestAnimationFrame(tick) : 0;
    };
    const update = (target) => {
      const host = target && target.closest && target.closest("[data-cursor]");
      if (host && s < 0.05) { x = tx; y = ty; }            // appear where the pointer is, don't fly in
      ts = host ? 1 : 0;
      if (host && host.dataset.cursor !== label) { label = host.dataset.cursor; el.textContent = label; }
      if (!raf) raf = requestAnimationFrame(tick);
    };
    addEventListener("pointermove", (e) => { tx = e.clientX; ty = e.clientY; update(e.target); }, { passive: true });
    document.addEventListener("pointerleave", () => update(null));
    fx.push(() => { if (ts || s > 0.05) update(document.elementFromPoint(tx, ty)); });   // the page moved under a still pointer
  });

  /* ----------------------------------------------------------
     Magnetic buttons lean toward the pointer
  ---------------------------------------------------------- */
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
     Parallax: pictures drift inside their frames ([data-parallax]); the case-study cover opens up
  ---------------------------------------------------------- */
  run("parallax", () => {
    if (reduce) return;
    const els = Array.from(document.querySelectorAll("[data-parallax]"));
    let boxes = [];
    if (els.length) {
      measures.push(() => { boxes = els.map((el) => { const r = el.getBoundingClientRect(); return { el, top: r.top + scrollY, h: r.height }; }); });
      fx.push((y, vh) => boxes.forEach((b) => {
        const c = (b.top + b.h / 2 - y - vh / 2) / (vh / 2 + b.h / 2);
        if (c > -1.3 && c < 1.3) b.el.style.setProperty("--py", clamp(c, -1, 1).toFixed(3));
      }));
    }
    const cover = document.querySelector(".project-cover");
    if (cover) {
      let top = 0;
      measures.push(() => { top = cover.getBoundingClientRect().top + scrollY; });
      fx.push((y, vh) => cover.style.setProperty("--open", clamp(1 - (top - y - vh * 0.25) / (vh * 0.55), 0, 1).toFixed(3)));
    }
  });

  /* ----------------------------------------------------------
     Footer: the planet rises as you reach the end, the wordmark letters come up, and Amsterdam's local time
  ---------------------------------------------------------- */
  run("footer", () => {
    const footer = document.querySelector(".site-footer");
    if (!footer) return;
    if (!reduce) {
      let top = 0, h = 1;
      measures.push(() => { const r = footer.getBoundingClientRect(); top = r.top + scrollY; h = Math.max(1, r.height); });
      fx.push((y, vh) => footer.style.setProperty("--rise", clamp((vh - (top - y)) / h, 0, 1).toFixed(3)));
      const mark = footer.querySelector(".wordmark");
      if (mark) {
        const text = mark.textContent;
        mark.textContent = "";
        Array.from(text).forEach((ch, i) => {
          if (ch === " ") { mark.append(" "); return; }
          const l = document.createElement("span");
          l.className = "wl";
          l.style.setProperty("--li", i);
          l.textContent = ch;
          mark.append(l);
        });
        mark.classList.add("is-split");
        onceVisible(mark, () => mark.classList.add("split-in"));
      }
    }
    const clocks = footer.querySelectorAll(".footer-clock");
    if (clocks.length && window.Intl) {
      const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hour12: false });
      const tick = () => {
        const text = fmt.format(new Date()), hour = parseInt(text, 10);
        clocks.forEach((c) => {
          const t = c.querySelector("time");
          if (t) { t.textContent = text; t.dateTime = text; }
          c.classList.toggle("is-night", hour < 7 || hour >= 21);
          c.hidden = false;
        });
      };
      tick();
      setInterval(tick, 15000);
    }
  });

  /* ----------------------------------------------------------
     Copy the e-mail address, with a confirmation that screen readers hear too
  ---------------------------------------------------------- */
  run("copy", () => {
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

  /* ----------------------------------------------------------
     Case studies: open any picture large (Esc, arrow keys, swipe), with a morph where supported
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
      const go = () => { show(i); dlg.showModal(); root.classList.add("lb-open"); if (JW.lenis) JW.lenis.stop(); };
      if (!canMorph) { dlg.classList.add("no-vt"); go(); return; }
      it.img.style.viewTransitionName = "lb-img";
      const t = document.startViewTransition(() => { it.img.style.viewTransitionName = ""; lbImg.style.viewTransitionName = "lb-img"; go(); });
      t.finished.finally(() => { lbImg.style.viewTransitionName = ""; });
    }
    function close() {
      if (!dlg.open) return;
      const it = items[cur];
      if (!onScreen(it.btn)) it.btn.scrollIntoView({ block: "center", behavior: "instant" });   // paged further down: land where that picture lives
      const done = () => { dlg.close(); root.classList.remove("lb-open"); live.textContent = ""; if (JW.lenis) JW.lenis.start(); it.btn.focus({ preventScroll: true }); };
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
      const dx = e.clientX - sx;
      sx = null;
      if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    });
  });

  /* ----------------------------------------------------------
     Between pages: the project picture you click grows into the case study's cover.
     Only pictures that are on screen take part, and the card holding one is shown at once so it lands somewhere visible.
  ---------------------------------------------------------- */
  run("page-transitions", () => {
    const named = () => document.querySelectorAll("[data-vt]");
    const nameOnScreen = () => named().forEach((el) => { el.style.viewTransitionName = onScreen(el) ? `vt-${el.dataset.vt}` : ""; });
    const clear = () => named().forEach((el) => { el.style.viewTransitionName = ""; });
    addEventListener("pageswap", (e) => { if (e.viewTransition) nameOnScreen(); });
    addEventListener("pageshow", (e) => { if (e.persisted) clear(); });
    addEventListener("pagereveal", (e) => {
      if (!e.viewTransition) return;
      nameOnScreen();
      const shown = [];
      document.querySelectorAll("[data-reveal]:not(.is-visible)").forEach((el) => {
        if (el.querySelector("[data-vt]") && onScreen(el)) { el.classList.add("reveal-instant", "is-visible"); shown.push(el); }
      });
      e.viewTransition.finished.finally(() => { clear(); shown.forEach((el) => el.classList.remove("reveal-instant")); });
    });
  });

  /* ----------------------------------------------------------
     Looping demo clips play while on screen. With reduced motion they stay paused and show controls.
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

  /* ---------- start ---------- */
  addEventListener("scroll", queue, { passive: true });
  addEventListener("resize", measure);
  addEventListener("load", measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  if (window.ResizeObserver) new ResizeObserver(measure).observe(document.body);
  measure();
})();
