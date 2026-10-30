(() => {
  "use strict";

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ----------------------------------------------------------
     Header: solid background after scrolling past hero
  ---------------------------------------------------------- */
  const header = document.getElementById("site-header");
  const hero = document.getElementById("top");

  const headerObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        header.classList.toggle("scrolled", !entry.isIntersecting || entry.intersectionRatio < 0.6);
      });
    },
    { threshold: [0, 0.6] }
  );
  if (hero) headerObserver.observe(hero);
  else header.classList.add("scrolled");

  /* ----------------------------------------------------------
     Mobile menu toggle
  ---------------------------------------------------------- */
  const menuToggle = document.getElementById("menu-toggle");
  const mobileMenu = document.getElementById("mobile-menu");

  function closeMobileMenu() {
    mobileMenu.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open menu");
  }

  if (menuToggle) {
    menuToggle.addEventListener("click", () => {
      const isOpen = mobileMenu.classList.toggle("open");
      menuToggle.setAttribute("aria-expanded", String(isOpen));
      menuToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
    });
    mobileMenu.querySelectorAll(".mobile-link").forEach((link) => {
      link.addEventListener("click", closeMobileMenu);
    });
  }

  /* ----------------------------------------------------------
     Scroll reveal (fade/slide in)
  ---------------------------------------------------------- */
  const revealEls = document.querySelectorAll("[data-reveal]");
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
  );

  revealEls.forEach((el, i) => {
    const group = el.closest(".about-grid, .work-grid, .skills-grid, .stat-grid");
    let delay = 0;
    if (group) {
      const siblings = Array.from(group.querySelectorAll("[data-reveal]"));
      delay = Math.min(siblings.indexOf(el), 5) * 0.08;
    }
    el.style.setProperty("--reveal-delay", prefersReducedMotion ? "0s" : `${delay}s`);
    revealObserver.observe(el);
  });

  /* ----------------------------------------------------------
     Hand-drawn "draw on" doodles (stroke animation)
  ---------------------------------------------------------- */
  const sketchPaths = document.querySelectorAll(".sketch-draw path, .sketch-draw use");

  function primeSketchPath(el) {
    try {
      let len;
      if (el.tagName.toLowerCase() === "use") {
        const id = el.getAttribute("href") || el.getAttribute("xlink:href");
        const ref = document.querySelector(id);
        len = ref ? ref.getTotalLength() : 200;
      } else {
        len = el.getTotalLength();
      }
      el.style.strokeDasharray = `${len}`;
      el.style.strokeDashoffset = `${len}`;
      el.style.transition = prefersReducedMotion
        ? "stroke-dashoffset 0.01s linear"
        : "stroke-dashoffset 1.1s cubic-bezier(0.65,0,0.35,1)";
      return true;
    } catch (e) {
      return false;
    }
  }

  sketchPaths.forEach(primeSketchPath);

  const sketchObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const paths = entry.target.querySelectorAll("path, use");
          paths.forEach((p, i) => {
            setTimeout(() => {
              p.style.strokeDashoffset = "0";
            }, i * 120);
          });
          sketchObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.4 }
  );

  document.querySelectorAll(".sketch-draw").forEach((svg) => sketchObserver.observe(svg));

  /* ----------------------------------------------------------
     Nav active state + animated marker underline
  ---------------------------------------------------------- */
  const navLinks = Array.from(document.querySelectorAll(".nav-link"));
  const navIndicator = document.getElementById("nav-indicator");
  const sectionIds = ["about", "work", "skills", "contact"];
  const sections = sectionIds
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  function moveIndicatorTo(link) {
    if (!link || !navIndicator) return;
    const navRect = link.closest(".nav").getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    navIndicator.style.left = `${linkRect.left - navRect.left}px`;
    navIndicator.style.width = `${linkRect.width}px`;
    navIndicator.classList.add("visible");
  }

  function setActiveLink(id) {
    let matched = null;
    navLinks.forEach((link) => {
      const isActive = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("active", isActive);
      if (isActive) matched = link;
    });
    if (matched) moveIndicatorTo(matched);
  }

  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveLink(entry.target.id);
        }
      });
    },
    { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
  );
  sections.forEach((s) => sectionObserver.observe(s));

  window.addEventListener("resize", () => {
    const active = document.querySelector(".nav-link.active");
    if (active) moveIndicatorTo(active);
  });

  // pages that mark their own link (Work) as active: place the marker once fonts have loaded
  const preActive = document.querySelector(".nav-link.active");
  if (preActive) {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => moveIndicatorTo(preActive));
    else moveIndicatorTo(preActive);
  }

  /* ----------------------------------------------------------
     Looping demo clips: play while on screen, pause when not.
     With reduced motion they stay paused and show controls.
  ---------------------------------------------------------- */
  const loopVideos = document.querySelectorAll("video[data-loop]");
  if (loopVideos.length) {
    if (prefersReducedMotion) {
      loopVideos.forEach((v) => v.setAttribute("controls", ""));
    } else {
      const loopObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const v = entry.target;
            if (entry.isIntersecting) {
              const playing = v.play();
              if (playing && playing.catch) playing.catch(() => {});
            } else {
              v.pause();
            }
          });
        },
        { threshold: 0.4 }
      );
      loopVideos.forEach((v) => {
        v.preload = "metadata";
        loopObserver.observe(v);
      });
    }
  }

  /* ----------------------------------------------------------
     Smooth anchor scroll with header offset
  ---------------------------------------------------------- */
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      const targetId = anchor.getAttribute("href");
      if (targetId.length < 2) return;
      const target = document.querySelector(targetId);
      if (!target) return;
      e.preventDefault();
      const offset = 76;
      const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top, behavior: prefersReducedMotion ? "auto" : "smooth" });
      history.pushState(null, "", targetId);
    });
  });
})();

/* ----------------------------------------------------------
   About: the crew card tilts toward the pointer (skipped for touch and reduced motion)
---------------------------------------------------------- */
(() => {
  const crew = document.querySelector(".crew");
  if (!crew) return;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (still) return;
  if (!window.matchMedia("(hover: hover)").matches) return;
  const card = crew.querySelector(".crew-card");
  crew.addEventListener("pointermove", (e) => {
    const r = crew.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    card.style.setProperty("--ry", (x * 9).toFixed(2) + "deg");
    card.style.setProperty("--rx", (-y * 7).toFixed(2) + "deg");
  });
  crew.addEventListener("pointerleave", () => { card.style.setProperty("--rx", "0deg"); card.style.setProperty("--ry", "0deg"); });
})();
