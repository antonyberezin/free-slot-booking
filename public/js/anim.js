// Site-wide animations and micro-interactions
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // ----- Scroll progress bar + navbar shadow + back-to-top (no motion needed) -----
  const progress = document.createElement('div');
  progress.id = 'scrollProgress';
  document.body.appendChild(progress);

  const toTop = document.createElement('button');
  toTop.id = 'toTop';
  toTop.setAttribute('aria-label', 'Back to top');
  toTop.innerHTML = '&#8593;';
  toTop.onclick = () => window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  document.body.appendChild(toTop);

  const nav = document.getElementById('nav');
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    if (nav) nav.classList.toggle('scrolled', scrollY > 10);
    toTop.classList.toggle('show', scrollY > 600);
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (reduce) return;

  // ----- Smooth page transitions between pages -----
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || a.target || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !url.pathname.endsWith('.html') || url.href === location.href) return;
    e.preventDefault();
    document.body.classList.add('leaving');
    setTimeout(() => (location.href = url.href), 220);
  });
  addEventListener('pageshow', (e) => e.persisted && document.body.classList.remove('leaving'));

  // ----- Scroll reveal for static sections and cards -----
  const targets = document.querySelectorAll('main .card, .section-title, .page-head, footer .container');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      el.classList.add('in');
      io.unobserve(el);
      // Hand the element back to its normal hover styles once it has appeared
      setTimeout(() => {
        el.classList.remove('reveal', 'in');
        el.style.transitionDelay = '';
      }, 700 + parseInt(el.style.transitionDelay || 0, 10));
    });
  }, { threshold: 0.12 });
  targets.forEach((el) => {
    if (el.closest('.hero') || el.closest('.auth-split') || el.closest('.modal')) return;
    const siblings = [...el.parentElement.children];
    el.style.transitionDelay = `${(siblings.indexOf(el) % 6) * 80}ms`;
    el.classList.add('reveal');
    io.observe(el);
  });

  // ----- Count-up for numbers that pages fill in (stats) -----
  const fmtNum = (n) => Math.round(n).toLocaleString('en-IN');
  function countUp(el) {
    new MutationObserver(() => {
      if (el._anim) return;
      const m = el.textContent.trim().match(/^(\D*)([\d,]+)(\D*)$/);
      if (!m) return;
      const target = Number(m[2].replace(/,/g, ''));
      const from = el._last || 0;
      el._last = target;
      if (from === target) return;
      const start = performance.now();
      const dur = 900;
      el._anim = true;
      el.classList.add('bump');
      const step = (t) => {
        const p = Math.min(1, (t - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = m[1] + fmtNum(from + (target - from) * eased) + m[3];
        if (p < 1) requestAnimationFrame(step);
        else { el._anim = false; el.classList.remove('bump'); }
      };
      requestAnimationFrame(step);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  }
  document.querySelectorAll('.stat .value').forEach(countUp);

  // Hero numbers count up once on load
  document.querySelectorAll('.hero-stats b').forEach((el) => {
    const n = Number(el.textContent);
    if (!n) return;
    countUp(el);
    el._anim = true;
    el.textContent = '0';
    el._last = 0;
    setTimeout(() => { el._anim = false; el.textContent = String(n); }, 600);
  });

  // ----- Stagger items rendered by the pages (first render only) -----
  const ITEMS = '.slot, .free-item, tbody tr, .tl-row';
  const seen = new WeakSet();
  new MutationObserver((muts) => {
    const groups = new Map();
    muts.forEach((m) => m.addedNodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      const items = n.matches(ITEMS) ? [n] : [...n.querySelectorAll(ITEMS)];
      items.forEach((it) => {
        const box = it.closest('#slotMap, #results, #timeline, .table-wrap') || it.parentElement;
        if (!groups.has(box)) groups.set(box, []);
        groups.get(box).push(it);
      });
    }));
    groups.forEach((items, box) => {
      if (seen.has(box)) return; // auto-refreshes do not replay the animation
      seen.add(box);
      items.forEach((it, i) => {
        it.style.setProperty('--i', Math.min(i, 24));
        it.classList.add('anim-item');
      });
    });
  }).observe(document.body, { childList: true, subtree: true });

  // Replay the list animation for a new search, a new date or a new filter tab
  const replay = [['searchForm', 'submit', 'results'], ['day', 'change', 'timeline']];
  replay.forEach(([trigger, evt, boxId]) => {
    const t = document.getElementById(trigger);
    const box = document.getElementById(boxId);
    if (t && box) t.addEventListener(evt, () => seen.delete(box), true);
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('.tab')) document.querySelectorAll('.table-wrap').forEach((b) => seen.delete(b));
  }, true);
  const search = document.getElementById('search');
  if (search) search.addEventListener('input', () => seen.delete(document.getElementById('bookingTable')), true);

  // ----- Ripple on button click -----
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn || btn.disabled) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height);
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    btn.appendChild(s);
    setTimeout(() => s.remove(), 650);
  });

  // ----- Hero: live slot preview + parallax -----
  const tiles = [...document.querySelectorAll('.mini-map span')];
  const freeText = document.querySelector('.preview-foot b');
  if (tiles.length) {
    tiles.forEach((t) => t.classList.remove('blink'));
    const recount = () => {
      const free = tiles.filter((t) => t.classList.contains('f')).length;
      if (freeText) freeText.textContent = `${free} of ${tiles.length} available`;
    };
    setInterval(() => {
      const t = tiles[Math.floor(Math.random() * tiles.length)];
      t.classList.toggle('f');
      t.classList.remove('flip');
      void t.offsetWidth;
      t.classList.add('flip');
      recount();
    }, 1600);
  }

  const hero = document.querySelector('.hero');
  if (hero && finePointer) {
    const glass = hero.querySelector('.glass');
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      hero.style.setProperty('--mx', x.toFixed(3));
      hero.style.setProperty('--my', y.toFixed(3));
      if (glass) glass.style.setProperty('--tilt', `rotateY(${x * 10}deg) rotateX(${-y * 10}deg)`);
    });
    hero.addEventListener('pointerleave', () => {
      hero.style.setProperty('--mx', 0);
      hero.style.setProperty('--my', 0);
      if (glass) glass.style.setProperty('--tilt', 'none');
    });
  }

  // ----- 3D tilt + spotlight on feature cards -----
  if (finePointer) {
    document.querySelectorAll('.feature, .vehicle, .steps .card, .free-item, .stat').forEach(addTilt);
    new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      (n.matches('.free-item') ? [n] : [...n.querySelectorAll('.free-item')]).forEach(addTilt);
    }))).observe(document.body, { childList: true, subtree: true });
  }
  function addTilt(el) {
    if (el._tilt) return;
    el._tilt = true;
    el.classList.add('tilt');
    el.addEventListener('pointermove', (e) => {
      if (el.classList.contains('reveal')) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--px', `${x * 100}%`);
      el.style.setProperty('--py', `${y * 100}%`);
      el.style.setProperty('--rx', `${(0.5 - y) * 8}deg`);
      el.style.setProperty('--ry', `${(x - 0.5) * 8}deg`);
    });
    el.addEventListener('pointerleave', () => {
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    });
  }
})();
