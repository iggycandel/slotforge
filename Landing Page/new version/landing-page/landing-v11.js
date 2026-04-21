// Spinative landing v11 — interactions

(function () {
  'use strict';

  // --- 1. Reveal on scroll ---
  const revealables = document.querySelectorAll(
    '.metrics-head, .metric, .section-head, .different-card, .interactive-head, .interactive-card, .pull-panel, .cta-panel'
  );
  revealables.forEach(el => el.classList.add('reveal'));

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
  revealables.forEach(el => revealObserver.observe(el));

  // --- 2. Metric counters ---
  const counters = document.querySelectorAll('[data-counter]');
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseFloat(el.dataset.counter);
      const duration = 1400;
      const start = performance.now();
      function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        // easeOutCubic
        const eased = 1 - Math.pow(1 - t, 3);
        const value = target * eased;
        el.textContent = target < 10
          ? value.toFixed(value >= target ? 0 : 1).replace(/\.0$/, '')
          : Math.round(value);
        if (t < 1) requestAnimationFrame(tick);
        else el.textContent = target;
      }
      requestAnimationFrame(tick);
      counterObserver.unobserve(el);
    });
  }, { threshold: 0.4 });
  counters.forEach(c => counterObserver.observe(c));

  // --- 3. Sticky showcase: cross-fade shot as each chapter comes into view ---
  const chapters = Array.from(document.querySelectorAll('.chapter'));
  const shots = Array.from(document.querySelectorAll('.showcase-shot'));
  const steps = Array.from(document.querySelectorAll('.progress-step'));

  function setActive(idx) {
    chapters.forEach((c, i) => c.classList.toggle('active', i === idx));
    shots.forEach((s, i) => s.classList.toggle('active', i === idx));
    steps.forEach((s, i) => s.classList.toggle('active', i === idx));
  }
  setActive(0);

  const chapterObserver = new IntersectionObserver((entries) => {
    // Pick the entry closest to the vertical midpoint of the viewport
    let best = null, bestDist = Infinity;
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const rect = entry.boundingClientRect;
      const mid = rect.top + rect.height / 2;
      const dist = Math.abs(mid - window.innerHeight / 2);
      if (dist < bestDist) { bestDist = dist; best = entry.target; }
    });
    if (best) {
      const idx = parseInt(best.dataset.chapter, 10);
      setActive(idx);
    }
  }, {
    threshold: [0.3, 0.55, 0.8],
    rootMargin: '-30% 0px -30% 0px'
  });
  chapters.forEach(c => chapterObserver.observe(c));

  // Fallback: scroll-driven nearest-chapter detection
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const mid = window.innerHeight / 2;
      let bestIdx = 0, bestDist = Infinity;
      chapters.forEach((c, i) => {
        const rect = c.getBoundingClientRect();
        const cMid = rect.top + rect.height / 2;
        const dist = Math.abs(cMid - mid);
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      });
      setActive(bestIdx);
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  // Progress step clicks scroll to chapter
  steps.forEach(step => {
    step.addEventListener('click', () => {
      const idx = parseInt(step.dataset.step, 10);
      const target = chapters[idx];
      if (target) {
        const y = target.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.35;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    });
  });

  // --- 4. Interactive moment: feature switcher ---
  const FEATURES = {
    'free-spins': {
      title: 'Free Spins',
      color: '#59d7a3',
      triggerActive: 0,
      hitRate: '1 in 124 spins',
      canvas: ['FS_INTRO', 'FS_SUMMARY', 'FS_GAMEPLAY', 'FS_TRIGGER'],
      flow: ['BASE_GAME → FS_TRIGGER', 'FS_TRIGGER → FREE_SPINS', 'FREE_SPINS → BASE_GAME'],
    },
    'hold-spin': {
      title: 'Hold & Spin',
      color: '#f1cb7b',
      triggerActive: 0,
      hitRate: '1 in 210 spins',
      canvas: ['HS_INTRO', 'HS_BOARD', 'HS_RESPIN', 'HS_SUMMARY'],
      flow: ['BASE_GAME → HS_TRIGGER', 'HS_TRIGGER → HOLD_SPIN', 'HOLD_SPIN → BASE_GAME'],
    },
    'pick-game': {
      title: 'Bonus Pick Game',
      color: '#ec7a6e',
      triggerActive: 2,
      hitRate: '1 in 340 spins',
      canvas: ['PICK_INTRO', 'PICK_BOARD', 'PICK_REVEAL'],
      flow: ['BASE_GAME → PICK_TRIGGER', 'PICK_TRIGGER → BONUS_PICK', 'BONUS_PICK → BASE_GAME'],
    },
    'wheel': {
      title: 'Wheel Bonus',
      color: '#7d77ff',
      triggerActive: 3,
      hitRate: '1 in 280 spins',
      canvas: ['WHEEL_INTRO', 'WHEEL_SPIN', 'WHEEL_RESOLVE'],
      flow: ['BASE_GAME → WHEEL_TRIGGER', 'WHEEL_TRIGGER → WHEEL_BONUS', 'WHEEL_BONUS → BASE_GAME'],
    },
    'ladder': {
      title: 'Ladder Bonus',
      color: '#d9ab53',
      triggerActive: 0,
      hitRate: '1 in 195 spins',
      canvas: ['LADDER_INTRO', 'LADDER_CLIMB', 'LADDER_RESOLVE'],
      flow: ['BASE_GAME → LADDER_TRIGGER', 'LADDER_TRIGGER → LADDER', 'LADDER → BASE_GAME'],
    },
  };

  const featBtns = document.querySelectorAll('.ia-feat');
  const triggerBtns = document.querySelectorAll('.ia-trigger');
  const titleEl = document.getElementById('iaTitle');
  const calloutEm = document.querySelector('.ia-callout em');
  const canvasList = document.querySelector('.ia-impact-group:nth-child(2) ul');
  const flowList = document.querySelector('.ia-impact-group:nth-child(3) ul');
  const canvasCount = document.querySelector('.ia-impact-group:nth-child(2) .ia-impact-group-head span');
  const flowCount = document.querySelector('.ia-impact-group:nth-child(3) .ia-impact-group-head span');
  const chipDot = document.querySelector('.ia-main-chip span');

  function applyFeature(key) {
    const f = FEATURES[key];
    if (!f) return;
    titleEl.textContent = f.title;
    if (chipDot) chipDot.style.background = f.color;
    if (calloutEm) calloutEm.textContent = f.hitRate;
    triggerBtns.forEach((b, i) => b.classList.toggle('active', i === f.triggerActive));
    canvasList.innerHTML = f.canvas.map(x => `<li>${x}</li>`).join('');
    flowList.innerHTML = f.flow.map(x => `<li>${x}</li>`).join('');
    canvasCount.textContent = f.canvas.length + ' SCREENS';
    flowCount.textContent = f.flow.length + ' NODES';
  }

  featBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      featBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFeature(btn.dataset.feat);
    });
  });

  // Tab switching (cosmetic)
  document.querySelectorAll('.ia-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ia-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  // Trigger buttons
  triggerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      triggerBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

})();
