/* =============================================================
   Spinative landing v12 — interactions
   ============================================================= */

(function () {
  'use strict';

  // 0. Hero word stagger
  document.querySelectorAll('.hero-title .word').forEach(function (w, i) {
    w.style.animationDelay = (0.05 + i * 0.08) + 's';
  });

  // 1. Nav scroll state
  var navWrap = document.querySelector('.nav-wrap');
  function onScrollNav() {
    if (window.scrollY > 24) navWrap.classList.add('scrolled');
    else navWrap.classList.remove('scrolled');
  }
  window.addEventListener('scroll', onScrollNav, { passive: true });
  onScrollNav();

  // 2. Reveal-on-scroll
  var reveals = document.querySelectorAll('.reveal');
  var revObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        revObs.unobserve(e.target);
      }
    });
  }, { threshold: 0.18 });
  reveals.forEach(function (r) { revObs.observe(r); });

  // 3. Pinned 3-act showcase
  var actsPin = document.querySelector('.acts-pin');
  var actsItems = Array.prototype.slice.call(document.querySelectorAll('.acts-rail-item'));
  var actsShots = Array.prototype.slice.call(document.querySelectorAll('.acts-shot'));
  var actsAnnots = Array.prototype.slice.call(document.querySelectorAll('.acts-annot-group'));
  var actsProg = document.querySelectorAll('.acts-progress span');

  function setAct(idx) {
    actsItems.forEach(function (el, i) {
      el.classList.toggle('active', i === idx);
      el.classList.toggle('passed', i < idx);
    });
    actsShots.forEach(function (el, i) {
      el.classList.toggle('active', i === idx);
      el.classList.toggle('passed', i < idx);
    });
    actsAnnots.forEach(function (group, i) {
      group.querySelectorAll('.acts-annot').forEach(function (a) {
        a.classList.toggle('show', i === idx);
      });
    });
    actsProg.forEach(function (el, i) { el.classList.toggle('active', i === idx); });
  }

  if (actsPin) {
    function onScrollActs() {
      var rect = actsPin.getBoundingClientRect();
      var total = actsPin.offsetHeight - window.innerHeight;
      var scrolled = Math.min(Math.max(-rect.top, 0), total);
      var pct = total > 0 ? scrolled / total : 0;
      var idx = pct < 0.34 ? 0 : pct < 0.68 ? 1 : 2;
      if (idx !== setAct.last) {
        setAct(idx);
        setAct.last = idx;
      }
    }
    setAct(0); setAct.last = 0;
    window.addEventListener('scroll', onScrollActs, { passive: true });

    actsItems.forEach(function (item, i) {
      item.addEventListener('click', function () {
        var total = actsPin.offsetHeight - window.innerHeight;
        var targetTop = actsPin.offsetTop + (total * (i / actsItems.length)) + 20;
        window.scrollTo({ top: targetTop, behavior: 'smooth' });
      });
    });
  }

  // 4. Subtle parallax on hero canvas
  var heroCanvas = document.querySelector('.hero-canvas-inner');
  if (heroCanvas) {
    var raf;
    window.addEventListener('scroll', function () {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        var y = window.scrollY;
        if (y < 1200) {
          var t = y * 0.05;
          var r = 8 - Math.min(y * 0.005, 4);
          heroCanvas.style.transform = 'rotateX(' + r + 'deg) translateY(' + (2 - t * 0.05) + '%)';
        }
        raf = null;
      });
    }, { passive: true });
  }

})();
