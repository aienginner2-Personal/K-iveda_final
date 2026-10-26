(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  /* ---------- Mobile menu ---------- */
  const menuBtn = $('#menuBtn');
  const nav = $('#nav');
  menuBtn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  $$('#nav a').forEach(a => a.addEventListener('click', () => {
    nav.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
  }));

  /* ---------- Language toggle (English / Hindi) ---------- */
  const translatable = $$('[data-hi]');
  translatable.forEach(el => { el.dataset.en = el.textContent; });
  const langBtn = $('#langBtn');
  let lang = 'en';
  langBtn.addEventListener('click', () => {
    lang = lang === 'en' ? 'hi' : 'en';
    translatable.forEach(el => { el.textContent = lang === 'hi' ? el.dataset.hi : el.dataset.en; });
    document.documentElement.lang = lang;
    langBtn.textContent = lang === 'hi' ? 'English' : 'हिन्दी';
    langBtn.setAttribute('aria-label', lang === 'hi' ? 'Switch language to English' : 'Switch language to Hindi');
  });

  /* ---------- Sample satellite scene ---------- */
  const COLS = 48, ROWS = 30, CELL = 20;
  const M2_PER_CELL = 100;            // 10 m x 10 m pixels
  const M2_PER_ACRE = 4046.86;

  const canvas = $('#fieldMap');
  const ctx = canvas.getContext('2d');
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;

  const fields = [
    { name: 'North plot',  crop: 'Wheat',     x: 0,  y: 0,  w: 15, h: 14, base: 0.70 },
    { name: 'Canal plot',  crop: 'Wheat',     x: 16, y: 0,  w: 16, h: 14, base: 0.72 },
    { name: 'East plot',   crop: 'Sugarcane', x: 33, y: 0,  w: 15, h: 14, base: 0.78 },
    { name: 'West plot',   crop: 'Wheat',     x: 0,  y: 15, w: 20, h: 15, base: 0.66 },
    { name: 'Centre plot', crop: 'Mustard',   x: 21, y: 15, w: 12, h: 15, base: 0.68 },
    { name: 'South plot',  crop: 'Sugarcane', x: 34, y: 15, w: 14, h: 15, base: 0.76 }
  ];

  // Problem zones baked into the sample scene
  const patches = [
    { cx: 24, cy: 6,  r: 5, ndvi: 0.38, moist: 0.42 },  // irrigation gap in Canal plot
    { cx: 27, cy: 22, r: 4, ndvi: 0.34, moist: 0.00 },  // canopy damage, moisture fine
    { cx: 3,  cy: 26, r: 6, ndvi: 0.16, moist: 0.40 }   // dry corner in West plot
  ];

  const noise = (x, y, s) =>
    (Math.sin(x * 0.35 + s) + Math.sin(y * 0.42 + s * 1.7) +
     Math.sin((x + y) * 0.21 + s * 2.3) + Math.sin(Math.hypot(x - 24, y - 15) * 0.3 + s)) / 4;
  const rnd = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };

  const fieldAt = (x, y) =>
    fields.findIndex(f => x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h);

  const cells = [];
  for (let y = 0; y < ROWS; y++) {
    const row = [];
    for (let x = 0; x < COLS; x++) {
      const fi = fieldAt(x, y);
      if (fi < 0) { row.push({ f: -1 }); continue; }
      let ndvi = fields[fi].base + 0.14 * noise(x, y, 1) + 0.05 * (rnd(x, y) - 0.5);
      let moist = 0.55 + 0.22 * noise(x, y, 4) + 0.3 * (ndvi - 0.65) + 0.05 * (rnd(y, x) - 0.5);
      patches.forEach(p => {
        const w = clamp(1 - Math.hypot(x - p.cx, y - p.cy) / p.r);
        ndvi -= p.ndvi * w;
        moist -= p.moist * w;
      });
      ndvi = clamp(ndvi, 0.08, 0.92);
      moist = clamp(moist);
      const stress = clamp(0.6 * (1 - (ndvi - 0.25) / 0.6) + 0.4 * (1 - moist));
      row.push({ f: fi, ndvi, moist, stress });
    }
    cells.push(row);
  }

  /* ---------- Per-plot statistics and advice ---------- */
  fields.forEach((f, i) => {
    let n = 0, sn = 0, sm = 0, bad = 0, badMoist = 0;
    cells.forEach(row => row.forEach(c => {
      if (c.f !== i) return;
      n++; sn += c.ndvi; sm += c.moist;
      if (c.stress > 0.55) { bad++; badMoist += c.moist; }
    }));
    f.n = n;
    f.acres = n * M2_PER_CELL / M2_PER_ACRE;
    f.ndvi = sn / n;
    f.moist = sm / n;
    f.badPct = Math.round(bad / n * 100);
    f.badMoist = bad ? badMoist / bad : 1;
  });

  const healthWord = v => (v >= 0.65 ? 'Strong' : v >= 0.5 ? 'Moderate' : 'Weak');

  const adviceFor = f => {
    if (f.badPct < 8) return 'Even canopy and steady moisture across the plot. No action needed this week.';
    if (f.badMoist < 0.35) {
      return `${f.badPct}% of this plot is stressed and the soil there is dry. Walk the red zone first and check the nearest irrigation line.`;
    }
    return `${f.badPct}% of this plot has a weak canopy even though the soil holds water. Scout the red zone for pests or disease before irrigating.`;
  };

  /* ---------- Colour layers ---------- */
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const ramp = (stops, t) => {
    t = clamp(t);
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
        const k = (t - t0) / (t1 - t0);
        return c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
      }
    }
    return stops[stops.length - 1][1];
  };

  const layers = {
    ndvi: {
      stops: [[0, hex('#8a5a2b')], [0.35, hex('#d9b44a')], [0.6, hex('#6fae3e')], [1, hex('#1c6b3a')]],
      value: c => (c.ndvi - 0.1) / 0.8, lo: 'Bare', hi: 'Dense'
    },
    moisture: {
      stops: [[0, hex('#e9d9a6')], [0.5, hex('#7fb8d6')], [1, hex('#1f5e99')]],
      value: c => c.moist, lo: 'Dry', hi: 'Wet'
    },
    stress: {
      stops: [[0, hex('#2f7d3b')], [0.5, hex('#e8c23a')], [1, hex('#c8452f')]],
      value: c => c.stress, lo: 'Calm', hi: 'Stressed'
    }
  };
  let layer = 'ndvi';

  const setLegend = () => {
    const L = layers[layer];
    const grad = [0, 0.25, 0.5, 0.75, 1].map(t => `rgb(${ramp(L.stops, t).join(',')}) ${t * 100}%`).join(',');
    $('#legBar').style.background = `linear-gradient(90deg, ${grad})`;
    $('#legLo').textContent = L.lo;
    $('#legHi').textContent = L.hi;
  };

  /* ---------- Drawing ---------- */
  let selected = 1;       // start on the plot with the irrigation gap
  let hover = -1;
  let revealed = COLS;    // columns revealed by the opening scan

  const draw = () => {
    const L = layers[layer];
    ctx.fillStyle = '#1b2a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < Math.min(COLS, Math.ceil(revealed)); x++) {
        const c = cells[y][x];
        ctx.fillStyle = c.f < 0 ? '#243a3f' : `rgb(${ramp(L.stops, L.value(c)).join(',')})`;
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
    if (revealed < COLS) {                       // scan line
      ctx.fillStyle = 'rgba(232,163,23,0.9)';
      ctx.fillRect(revealed * CELL, 0, 3, canvas.height);
      return;
    }
    const outline = (i, color, w) => {
      const f = fields[i];
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.strokeRect(f.x * CELL + w / 2, f.y * CELL + w / 2, f.w * CELL - w, f.h * CELL - w);
    };
    if (hover >= 0 && hover !== selected) outline(hover, 'rgba(255,255,255,0.85)', 2);
    if (selected >= 0) outline(selected, '#e8a317', 4);
  };

  /* ---------- Info panel and plot buttons ---------- */
  const info = $('#info');
  const plotsBox = $('#plots');

  fields.forEach((f, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = f.name;
    b.addEventListener('click', () => select(i));
    plotsBox.appendChild(b);
  });

  const renderInfo = () => {
    const f = fields[selected];
    info.innerHTML = `
      <div class="info-head">
        <h3>${f.name}</h3>
        <span class="info-meta">${f.crop}, ${f.acres.toFixed(1)} acres</span>
      </div>
      <div class="stats">
        <div><b>${f.ndvi.toFixed(2)}</b><span>Crop health index, ${healthWord(f.ndvi).toLowerCase()}</span></div>
        <div><b>${Math.round(f.moist * 100)}%</b><span>Average soil moisture</span></div>
        <div><b>${f.badPct}%</b><span>Of the plot under stress</span></div>
      </div>
      <p class="advice">${adviceFor(f)}</p>`;
    $$('button', plotsBox).forEach((b, i) => b.setAttribute('aria-pressed', String(i === selected)));
  };

  const select = i => { selected = i; renderInfo(); draw(); };

  /* ---------- Canvas pointer handling ---------- */
  const plotFromEvent = e => {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * COLS);
    const y = Math.floor((e.clientY - r.top) / r.height * ROWS);
    return x >= 0 && x < COLS && y >= 0 && y < ROWS ? fieldAt(x, y) : -1;
  };
  canvas.addEventListener('mousemove', e => {
    const h = plotFromEvent(e);
    if (h !== hover) { hover = h; draw(); }
  });
  canvas.addEventListener('mouseleave', () => { hover = -1; draw(); });
  canvas.addEventListener('click', e => {
    const i = plotFromEvent(e);
    if (i >= 0) select(i);
  });

  $$('input[name="layer"]').forEach(r => r.addEventListener('change', () => {
    layer = r.value;
    setLegend();
    draw();
  }));

  /* ---------- Opening scan (single entrance moment) ---------- */
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  setLegend();
  renderInfo();
  if (reduce) {
    draw();
  } else {
    revealed = 0;
    let last = performance.now();
    const step = now => {
      revealed += (now - last) / 1000 * (COLS / 1.3);   // sweep in about 1.3 s
      last = now;
      if (revealed >= COLS) { revealed = COLS; draw(); return; }
      draw();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- Estimate calculator ---------- */
  // Typical yields in quintals per acre, used for illustration only
  const crops = {
    wheat:     { yieldPerAcre: 18,  label: 'quintals of wheat' },
    rice:      { yieldPerAcre: 24,  label: 'quintals of rice' },
    sugarcane: { yieldPerAcre: 380, label: 'quintals of sugarcane' },
    cotton:    { yieldPerAcre: 8,   label: 'quintals of cotton (kapas)' }
  };
  const acresIn = $('#acres');
  const cropIn = $('#crop');
  const resultNum = $('#resultNum');
  const resultNote = $('#resultNote');

  const fmt = v => (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString('en-IN');

  const calc = () => {
    const acres = parseFloat(acresIn.value);
    if (!(acres > 0)) {
      resultNum.textContent = '0';
      resultNote.textContent = 'Enter the acres you farm.';
      return;
    }
    const c = crops[cropIn.value];
    const base = acres * c.yieldPerAcre;
    resultNum.textContent = `${fmt(base * 0.03)} to ${fmt(base * 0.09)}`;
    resultNote.textContent = `${c.label}, on ${fmt(acres)} acres. Based on ${c.yieldPerAcre} quintals per acre.`;
  };
  acresIn.addEventListener('input', calc);
  cropIn.addEventListener('change', calc);
  $('#calc').addEventListener('submit', e => e.preventDefault());
  calc();

  /* ---------- Early access form ---------- */
  const form = $('#contactForm');
  const msg = $('#formMsg');
  form.addEventListener('submit', e => {
    e.preventDefault();
    let ok = true;
    ['cName', 'cReach', 'cPlace'].forEach(id => {
      const el = $('#' + id);
      const bad = !el.value.trim();
      el.setAttribute('aria-invalid', String(bad));
      if (bad) ok = false;
    });
    if (!ok) {
      msg.className = 'form-msg err';
      msg.textContent = 'Fill in all three fields so we know how to reach you.';
      return;
    }
    const name = $('#cName').value.trim();
    msg.className = 'form-msg ok';
    msg.textContent = `Thanks, ${name}. Your request is noted. This prototype does not send data yet, so nothing has left your device.`;
    form.reset();
  });
})();
