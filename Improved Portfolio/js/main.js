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

  /* ----------------------------------------------------------
     Project modal
  ---------------------------------------------------------- */
  const projects = [
    {
      tag: "UX/UI · Website · Project for client",
      title: "Axventures",
      desc: "Designed and coded a modern mental health coaching website, brought to life with expressive micro-interactions.",
      role: "Duo team — research, UX, UI",
      tools: "Figma, HTML/CSS, Illustrator",
      learned: "The landscape of design is changing so fast, I think at that at the moment there are many tools that can make wonderful animations and save a lot of time.",
    },
    {
      tag: "Product Design · UI / Data visualisation · Project for client",
      title: "Bolscout",
      desc: "A financial management interface designed to make complex information clear. Sellers on Bol.com get one dashboard for revenue, costs, profit, and per-product performance instead of digging through spreadsheets.",
      role: "Duo team — product design, data viz",
      tools: "Lots of Figma, illustrator for graphics",
      learned: "I'd research more ways to simplify complex financial information without losing depth.",
    },
    {
      tag: "Branding · Digital Design · Project for client",
      title: "Qualiko Recipe Book",
      desc: "A 50-recipe publication for a large-scale chicken manufacturer, balancing clear information with an engaging editorial style.",
      role: "Duo team — Digital design, Brand identity",
      tools: "Illustrator",
      learned: "More ways to create variation within the visual system, while still sticking to the design norms when it comes to the format of a recipe book.",
    },
    {
      tag: "Interaction · Prototype · Self-directed project",
      title: "Walkwise",
      desc: "Designed and directed Walkwise, a multi-device walking app connecting movement and mental wellbeing through daily goals, a playful mascot and clear branding.",
      role: "Solo — UX / UI, interaction design, prototyping",
      tools: "Figma",
      learned: "How the experience could become more personalised to different motivations for walking.",
    },
  ];

  const modalBackdrop = document.getElementById("modal-backdrop");
  const modalCloseBtn = document.getElementById("modal-close");
  const modalTag = document.getElementById("modal-tag");
  const modalTitle = document.getElementById("modal-title");
  const modalDesc = document.getElementById("modal-desc");
  const modalRole = document.getElementById("modal-role");
  const modalTools = document.getElementById("modal-tools");
  const modalLearned = document.getElementById("modal-learned");

  let lastFocusedEl = null;

  function openModal(index) {
    const p = projects[index];
    if (!p) return;
    modalTag.textContent = p.tag;
    modalTitle.textContent = p.title;
    modalDesc.textContent = p.desc;
    modalRole.textContent = p.role;
    modalTools.textContent = p.tools;
    modalLearned.textContent = p.learned;

    lastFocusedEl = document.activeElement;
    modalBackdrop.hidden = false;
    requestAnimationFrame(() => modalBackdrop.classList.add("open"));
    document.body.style.overflow = "hidden";
    modalCloseBtn.focus();
  }

  function closeModal() {
    modalBackdrop.classList.remove("open");
    document.body.style.overflow = "";
    setTimeout(() => {
      modalBackdrop.hidden = true;
    }, 300);
    if (lastFocusedEl) lastFocusedEl.focus();
  }

  document.querySelectorAll(".work-card-trigger").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const index = Number(trigger.getAttribute("data-project"));
      openModal(index);
    });
  });

  modalCloseBtn.addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modalBackdrop.hidden) closeModal();
  });

  /* ----------------------------------------------------------
     Work card video preview
     Idle state is frozen on the last frame. Short single-keyframe
     clips often can't be seeked directly to the end, so instead we
     silently play the clip through once (muted, hidden) on load —
     it naturally comes to rest on the last frame — then reveal it.
  ---------------------------------------------------------- */
  document.querySelectorAll(".work-card-play").forEach((playBtn) => {
    const visual = playBtn.closest(".work-card-visual");
    const video = visual.querySelector(".work-card-video-el");
    if (!video) return;

    let revealed = false;
    const reveal = () => {
      revealed = true;
      visual.classList.add("is-ready");
    };

    // Some short clips stall just shy of their reported duration and
    // never fire `ended` — settle the idle/playing state on a timer too.
    const settle = () => {
      video.pause();
      reveal();
      if (visual.classList.contains("is-playing")) {
        video.removeAttribute("controls");
        visual.classList.remove("is-playing");
      }
    };
    const armSettleFallback = () => {
      const ms = (Number.isFinite(video.duration) ? video.duration : 5) * 1000 + 700;
      setTimeout(() => {
        if (!video.ended && (!revealed || visual.classList.contains("is-playing"))) settle();
      }, ms);
    };

    const primeThumbnail = () => {
      video.muted = true;
      const playPromise = video.play();
      if (playPromise && playPromise.catch) playPromise.catch(reveal);
      armSettleFallback();
    };

    if (video.readyState >= 3) {
      primeThumbnail();
    } else {
      video.addEventListener("canplay", primeThumbnail, { once: true });
    }

    video.addEventListener("ended", settle);

    playBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      reveal();
      video.muted = false;
      video.currentTime = 0;
      video.play();
      visual.classList.add("is-playing");
      video.setAttribute("controls", "");
      armSettleFallback();
    });
  });

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
