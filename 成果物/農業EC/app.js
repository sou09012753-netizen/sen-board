/* ════════════════════════════════════════════════
   SEN — APP LOGIC (Three.js WebGL particle system)
   ════════════════════════════════════════════════ */
import * as THREE from 'three';

/* ── 実写透過PNG（背景除去済み）— パーティクル生成専用 ── */
const VEG_PHOTOS = [
  './assets/corn_v3.png',
  './assets/strawberry.png',
  './assets/grape.png',
  './assets/egg.png',
];

/* ════════ 1. PARTICLE SYSTEM (WebGL / Three.js) ════════ */
const VERT = `
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aSize;
  uniform float uCameraZ;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor  = aColor;
    vAlpha  = aAlpha;
    vec4 mvPos      = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize    = aSize * (uCameraZ / -mvPos.z); // perspective size attenuation
    gl_Position     = projectionMatrix * mvPos;
  }
`;

const FRAG = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv) * 2.0;
    if (d >= 1.0) discard;

    // Sharp pixel core + visible glow — bright enough to read on black
    float core  = pow(max(0.0, 1.0 - d),        4.5) * 4.2;
    float bloom = pow(max(0.0, 1.0 - d * 0.60), 2.0) * 1.0;
    float halo  = pow(max(0.0, 1.0 - d * 0.36), 0.7) * 0.22;
    float bright = core + bloom + halo;

    vec3 warm  = vec3(1.0, 0.92, 0.55);
    vec3 col   = mix(vColor, warm, clamp(bright * 0.08, 0.0, 0.42));

    gl_FragColor = vec4(col * bright, vAlpha * min(bright, 1.0));
  }
`;

class VegParticles {
  constructor(canvas) {
    this.canvas   = canvas;
    this.W        = 0; this.H = 0;
    this.vegKeys  = VEG_PHOTOS;
    this.state    = 'converge';
    this.particles   = [];
    this.raf         = null;
    this.renderer = this.scene = this.camera = null;
    this.geo = this.points = this.material = null;
    this._posArr = this._alpArr = null;
    this._rotY = 0; this._cameraZ = 700;
  }

  _initThree() {
    const W = this.W = window.innerWidth;
    const H = this.H = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    /* Renderer — pure black background for maximum particle contrast */
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, alpha: false, antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(W, H);

    /* Scene */
    this.scene = new THREE.Scene();

    /* PerspectiveCamera: cameraZ set so 1 world unit = 1 CSS pixel at z=0 */
    const fov = 60;
    const cameraZ = H / (2 * Math.tan((fov * Math.PI / 180) / 2));
    this._cameraZ = cameraZ;
    this.camera = new THREE.PerspectiveCamera(fov, W / H, 1, cameraZ * 4);
    this.camera.position.z = cameraZ;

    /* ShaderMaterial */
    this.material = new THREE.ShaderMaterial({
      uniforms:       { uCameraZ: { value: cameraZ } },
      vertexShader:   VERT,
      fragmentShader: FRAG,
      blending:       THREE.AdditiveBlending,
      transparent:    true,
      depthWrite:     false,
      depthTest:      false,
    });

    /* BufferGeometry: pre-init with 1 dummy particle so shader compiles correctly */
    this.geo = new THREE.BufferGeometry();
    const d1 = new Float32Array(3), d3 = new Float32Array(3), d1f = new Float32Array([1]);
    this.geo.setAttribute('position', new THREE.BufferAttribute(d1.slice(), 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor',   new THREE.BufferAttribute(d3.slice(), 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha',   new THREE.BufferAttribute(d1.slice(), 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize',    new THREE.BufferAttribute(d1f, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0); // draw nothing until init() is called
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false; // skip bounding-sphere culling for dynamic geometry
    this.scene.add(this.points);
    this._posArr = null; this._alpArr = null;

  }

  resize() {
    this.W = window.innerWidth; this.H = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setSize(this.W, this.H);
    this.renderer.setPixelRatio(dpr);
    const fov = 60;
    const cameraZ = this.H / (2 * Math.tan((fov * Math.PI / 180) / 2));
    this._cameraZ = cameraZ;
    this.camera.aspect = this.W / this.H;
    this.camera.far    = cameraZ * 4;
    this.camera.position.z = cameraZ;
    this.material.uniforms.uCameraZ.value = cameraZ;
    this.camera.updateProjectionMatrix();
  }

  sampleImage(src, brightBoost = 1) {
    const size    = Math.round(Math.min(this.W, this.H) * 0.62);
    const MAX_PTS = 120000;
    return new Promise(res => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        const off = Object.assign(document.createElement('canvas'), { width: size, height: size });
        const o = off.getContext('2d');
        o.drawImage(img, 0, 0, size, size);
        const d = o.getImageData(0, 0, size, size).data;
        const pts = [];
        const cx = this.W / 2, cy = this.H / 2;
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            const i = (y * size + x) * 4;
            const r = d[i], g = d[i+1], b = d[i+2], a = d[i+3];
            if (a < 30) continue;
            // Skip white/gray background (high brightness + low saturation)
            const bright = (r + g + b) / 3;
            const sat = Math.max(r, g, b) - Math.min(r, g, b);
            if (bright > 190 && sat < 45) continue;
            // Skip green-dominant pixels (husks, leaves) — keep only warm/yellow tones
            if (g > r * 1.05 && g > b * 1.3) continue;
            pts.push({
              tx: x - size / 2,
              ty: -(y - size / 2),
              r:  Math.min(1, r * brightBoost / 255),
              g:  Math.min(1, g * brightBoost / 255),
              b:  Math.min(1, b * brightBoost / 255),
              a:  a / 255,
            });
          }
        }
        if (pts.length > MAX_PTS) {
          const stride = pts.length / MAX_PTS;
          res(Array.from({ length: MAX_PTS }, (_, i) => pts[Math.floor(i * stride)]));
        } else {
          res(pts);
        }
      };
      img.onerror = () => res([]);
    });
  }

  init(pts) {
    const N   = pts.length;
    const dpr = window.devicePixelRatio || 1;
    const depthSpread = 28; // Z range ±28 world units — subtle depth, shape stays readable

    const posArr = new Float32Array(N * 3);
    const colArr = new Float32Array(N * 3);
    const alpArr = new Float32Array(N);
    const szArr  = new Float32Array(N);

    this.particles = pts.map((p, i) => {
      const tz = (Math.random() - 0.5) * 2 * depthSpread;

      // Scatter from random 3D positions
      const ix = (Math.random() - 0.5) * this.W * 0.9;
      const iy = (Math.random() - 0.5) * this.H * 0.9;
      const iz = (Math.random() - 0.5) * 500;

      const sz = (0.9 + Math.random() * 1.1) * dpr; // 0.9–2.0px: visible crisp pixels
      const ph = Math.random() * Math.PI * 2;
      const tw = 0.5 + Math.random() * 1.5;

      posArr[i*3]   = ix; posArr[i*3+1] = iy; posArr[i*3+2] = iz;
      colArr[i*3]   = p.r; colArr[i*3+1] = p.g; colArr[i*3+2] = p.b;
      alpArr[i]     = p.a * 0.92;
      szArr[i]      = sz;

      return {
        x: ix, y: iy, z: iz,
        vx: 0, vy: 0, vz: 0,
        tx: p.tx, ty: p.ty, tz,
        r: p.r, g: p.g, b: p.b, a: p.a,
        size: sz, phase: ph, twinkle: tw,
      };
    });

    this.geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    this.geo.setAttribute('aColor',   new THREE.BufferAttribute(colArr, 3));
    this.geo.setAttribute('aAlpha',   new THREE.BufferAttribute(alpArr, 1));
    this.geo.setAttribute('aSize',    new THREE.BufferAttribute(szArr,  1));
    this.geo.setDrawRange(0, N);
    this._posArr = posArr;
    this._alpArr = alpArr;

    // Reset object rotation each cycle
    this._rotY = 0;
    this.points.rotation.set(0, 0, 0);
  }

  update() {
    if (!this._posArr || !this.particles.length) return;
    const now = Date.now() * 0.001;

    if (this.state === 'converge') {
      // Move each particle toward its 3D target
      this.particles.forEach((p, i) => {
        p.vx += (p.tx - p.x) * 0.046; p.vy += (p.ty - p.y) * 0.046; p.vz += (p.tz - p.z) * 0.046;
        p.vx *= 0.83; p.vy *= 0.83; p.vz *= 0.83;
        p.x += p.vx; p.y += p.vy; p.z += p.vz;
        this._posArr[i*3]   = p.x;
        this._posArr[i*3+1] = p.y;
        this._posArr[i*3+2] = p.z;
        const tw = 0.82 + Math.sin(now * (1.2 + p.twinkle) + p.phase) * 0.18;
        this._alpArr[i] = p.a * tw * 0.94;
      });
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate   = true;

    } else if (this.state === 'rotate') {
      // Gentle oscillation — shape stays recognizable, subtle 3D feel
      this.points.rotation.y = Math.sin(now * 0.28) * 0.22;
      this.points.rotation.x = Math.sin(now * 0.18) * 0.08;
      this.points.rotation.z = Math.sin(now * 0.13) * 0.03;
      // Subtle twinkle — keep alphas stable so pixels read clearly
      this.particles.forEach((p, i) => {
        const tw = 0.92 + Math.sin(now * (0.6 + p.twinkle * 0.4) + p.phase) * 0.08;
        this._alpArr[i] = p.a * tw;
      });
      this.geo.attributes.aAlpha.needsUpdate = true;
    }
  }

  draw() { this.renderer.render(this.scene, this.camera); }

  async cycle() {
    const pts = await this.sampleImage(this.vegKeys[0], 1.8);
    if (!pts.length) return;
    this.init(pts);
    this.state = 'converge';
    await wait(3500);          // converge into 3D cloud
    this.state = 'rotate';     // rotate forever
  }

  start() {
    this._initThree();
    const loop = () => { this.update(); this.draw(); this.raf = requestAnimationFrame(loop); };
    loop();
    this.cycle();
    window.addEventListener('resize', () => this.resize());
  }
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ════════ 2. HELPERS ════════ */
const fmt = n => '¥' + n.toLocaleString('ja-JP');

/* ════════ 3. CART (LocalStorage) ════════ */
const Cart = {
  KEY: 'sen_cart', items: [],
  load() { try { this.items = JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { this.items = []; } this.badge(); },
  save() { localStorage.setItem(this.KEY, JSON.stringify(this.items)); },
  add(id, q = 1) { const e = this.items.find(i => i.id === id); e ? e.q += q : this.items.push({ id, q }); this.save(); this.badge(); this.bump(); },
  remove(id) { this.items = this.items.filter(i => i.id !== id); this.save(); this.badge(); this.render(); },
  set(id, q) { if (q <= 0) return this.remove(id); const e = this.items.find(i => i.id === id); if (e) e.q = q; this.save(); this.badge(); this.render(); },
  total() { return this.items.reduce((s, i) => s + (PRODUCTS[i.id]?.price || 0) * i.q, 0); },
  count() { return this.items.reduce((s, i) => s + i.q, 0); },
  badge() { const b = document.getElementById('cart-badge'); const c = this.count(); b.textContent = c; b.classList.toggle('on', c > 0); },
  bump() { const b = document.getElementById('cart-badge'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); },
  render() {
    const list = document.getElementById('cart-list'), tot = document.getElementById('cart-total');
    if (!this.items.length) { list.innerHTML = '<div class="cart-empty">カートは空です</div>'; tot.textContent = '¥0'; return; }
    list.innerHTML = this.items.map(i => {
      const p = PRODUCTS[i.id]; if (!p) return '';
      return `<div class="cart-item">
        <img class="cart-item-img" src="${p.photo}" alt="${p.shortName}">
        <div style="flex:1;min-width:0"><div class="cart-item-name">${p.shortName}</div><div class="cart-item-price">${fmt(p.price)} / ${p.unit}</div></div>
        <div class="cart-item-ctrl">
          <button class="cqb" data-dec="${i.id}">−</button><span class="cqty">${i.q}</span><button class="cqb" data-inc="${i.id}">＋</button>
        </div></div>`;
    }).join('');
    tot.textContent = fmt(this.total());
  },
};

/* ════════ 4. RENDER FARMERS ════════ */
function renderFarmers() {
  document.getElementById('nav-drop').innerHTML = FARMERS.map(f => `
    <a class="nav-drop-item" data-scroll-to="#farmer-${f.id}">
      <img class="nav-drop-thumb" src="${f.heroPhoto}" alt="${f.name}">
      <div><strong>${f.name}</strong><em>${f.region}</em></div>
    </a>`).join('') + '<div class="nav-drop-more">and more!</div>';

  document.getElementById('farmers-container').innerHTML = FARMERS.map((f, idx) => {
    const caseNo = String(idx + 1).padStart(2, '0'), total = String(FARMERS.length).padStart(2, '0');
    const flip = idx % 2 === 1;
    const data = Object.entries(f.cultivationData || {}).map(([k, v]) =>
      `<div class="farmer-data-row"><span class="farmer-data-label">${k}</span><span class="farmer-data-val">${v}</span></div>`).join('');
    return `<div class="farmer-block" id="farmer-${f.id}">
      <div class="farmer-hero ${flip ? 'flip' : ''}">
        <div class="farmer-photo">
          <img src="${f.heroPhoto}" alt="${f.name}">
          <span class="farmer-case">Case ${caseNo} | ${total}</span>
        </div>
        <div class="farmer-info">
          <div class="farmer-name" data-reveal>${f.name}</div>
          <div class="farmer-en" data-reveal>${f.nameEn || ''} · ${f.region}</div>
          <p class="farmer-catch" data-reveal>"${f.catchphrase}"</p>
          <p class="farmer-story" data-reveal>${f.story}</p>
          <div class="farmer-data" data-reveal>${data}</div>
          <div class="farmer-voice" data-reveal>
            <img class="farmer-voice-photo" src="${f.voice.photo}" alt="${f.voice.name}">
            <div>
              <div class="farmer-voice-label">Voice of Farmer</div>
              <div class="farmer-voice-name">${f.voice.headline}</div>
              <div class="farmer-voice-name" style="color:var(--mid);font-weight:400;margin-top:2px">${f.voice.name}</div>
            </div>
          </div>
          <div class="farmer-actions" data-reveal>
            <button class="btn-dark" data-farmer="${f.id}">詳しく見る</button>
            <a class="btn-ghost" data-scroll-to="#products">商品を見る</a>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ════════ 5. RENDER PRODUCTS ════════ */
function renderProducts() {
  document.getElementById('product-grid').innerHTML = Object.values(PRODUCTS).map(p => {
    const f = FARMERS.find(f => f.id === p.farmerId);
    return `<div class="prod-card" data-reveal data-farmer="${p.farmerId}">
      <div class="prod-photo"><img src="${p.photo}" alt="${p.name}">${p.tag ? `<span class="prod-tag">${p.tag}</span>` : ''}</div>
      <div class="prod-info">
        <div class="prod-season">${p.season} · ${f.name} · ${f.region}</div>
        <div class="prod-name">${p.name}</div>
        <p class="prod-desc">${p.desc}</p>
        <div class="prod-delivery">${p.delivery || '出荷時期：お問い合わせください'} · ${p.shipping || '送料別途'}</div>
        <div class="prod-bottom">
          <span class="prod-price">${fmt(p.price)}<small>/${p.unit}</small></span>
          <span class="prod-soon">近日公開</span>
        </div>
      </div></div>`;
  }).join('');
}

/* ════════ 6. FARMER DETAIL MODAL ════════ */
function openFarmer(id) {
  const f = FARMERS.find(f => f.id === id); if (!f) return;
  document.getElementById('farmer-modal').innerHTML = `
    <div class="fm-head">
      <button class="fm-close" data-close-farmer>✕</button>
      <div class="fm-en">${f.nameEn || ''} · ${f.region}</div>
      <div class="fm-name">${f.name}</div>
      <div class="fm-catch">"${f.catchphrase}"</div>
    </div>
    <div class="fm-body">
      <div class="fm-label">農家の想い</div>
      <div class="fm-story">${f.story}</div>
      <div class="fm-label">栽培へのこだわり</div>
      <div class="fm-story">${f.method}</div>
      <div class="fm-label">取扱商品</div>
      <div class="fm-prods">${(f.products || []).map(p => `
        <div class="fm-prod">
          <img class="fm-prod-img" src="${p.photo}" alt="${p.shortName}">
          <div><div class="fm-prod-name">${p.name}</div><div class="fm-prod-price">${fmt(p.price)} / ${p.unit}</div></div>
          <span class="prod-soon" style="margin-left:auto;font-size:.66rem">近日公開</span>
        </div>`).join('')}</div>
    </div>`;
  document.getElementById('farmer-overlay').classList.add('on');
  document.body.style.overflow = 'hidden';
}

/* ════════ 7. MAP PINS ════════ */
function renderMap() {
  const g = document.getElementById('map-pins'), legend = document.getElementById('map-legend');
  const xy = (lat, lng) => ({ x: Math.round((lng - 122) / 26 * 420), y: Math.round((46 - lat) / 22 * 520) });
  g.innerHTML = FARMERS.map(f => {
    const { x, y } = xy(f.lat, f.lng);
    return `<g class="map-pin-group" data-pin="${f.id}" data-x="${x}" data-y="${y}">
      <circle class="map-pin-ring" cx="${x}" cy="${y}" r="6"/>
      <circle class="map-pin-dot" cx="${x}" cy="${y}" r="6"/>
      <circle cx="${x}" cy="${y}" r="3" fill="#FDFCF9"/></g>`;
  }).join('');
  legend.innerHTML = FARMERS.map(f =>
    `<div class="map-legend-item"><span class="map-legend-dot"></span><span><strong class="map-legend-name">${f.name}</strong> ${f.region}</span></div>`
  ).join('');
}

/* ════════ 8. SCROLL REVEAL + 字間アニメーション ════════ */
function initReveal() {
  const items = [...document.querySelectorAll('[data-reveal]:not(.on)')];
  const pm = new Map();
  items.forEach(el => { const p = el.parentElement; if (!pm.has(p)) pm.set(p, []); pm.get(p).push(el); });
  const obs = new IntersectionObserver(es => {
    es.forEach(e => {
      if (!e.isIntersecting) return;
      const sib = pm.get(e.target.parentElement) || [e.target];
      setTimeout(() => e.target.classList.add('on'), sib.indexOf(e.target) * 90);
      obs.unobserve(e.target);
    });
  }, { threshold: .12, rootMargin: '0px 0px -40px 0px' });
  items.forEach(el => obs.observe(el));

  document.querySelectorAll('[data-split]').forEach(el => {
    if (el.dataset.done) return; el.dataset.done = '1';
    el.innerHTML = [...el.textContent].map((c, i) =>
      `<span class="char" style="transition-delay:${i * 60}ms">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
  });
  const so = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('split-on'); so.unobserve(e.target); } });
  }, { threshold: .3 });
  document.querySelectorAll('[data-split]').forEach(el => so.observe(el));
}

/* ════════ 9. PARALLAX ════════ */
function initParallax() {
  const els = [...document.querySelectorAll('[data-parallax]')];
  if (!els.length) return;
  window.addEventListener('scroll', () => {
    els.forEach(el => {
      const c = el.closest('section') || el.parentElement;
      const cr = c.getBoundingClientRect();
      if (cr.bottom < 0 || cr.top > window.innerHeight) return;
      const prog = (window.innerHeight - cr.top) / (window.innerHeight + cr.height);
      el.style.transform = `translateY(${(prog - 0.5) * -60}px)`;
    });
  }, { passive: true });
}

/* ════════ 10. EVENTS ════════ */
function bindEvents() {
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => nav.classList.toggle('solid', window.scrollY > 80), { passive: true });

  document.addEventListener('click', e => {
    const a = e.target.closest('[data-scroll-to]');
    if (a) { e.preventDefault(); const t = document.querySelector(a.dataset.scrollTo); if (t) { if (window._lenis) window._lenis.scrollTo(t, { offset: -72 }); else t.scrollIntoView({ behavior: 'smooth' }); } closeMenu(); }
  });

  document.getElementById('cart-btn').onclick  = () => { Cart.render(); openOv('cart-overlay'); };
  document.getElementById('cart-close').onclick = () => closeOv('cart-overlay');
  document.getElementById('cart-checkout').textContent = '近日公開予定';
  document.getElementById('cart-checkout').disabled = true;

  document.addEventListener('click', e => {
    const add = e.target.closest('[data-add]'); if (add) { Cart.add(add.dataset.add); return; }
    const inc = e.target.closest('[data-inc]'); if (inc) { const i = Cart.items.find(x => x.id === inc.dataset.inc); Cart.set(inc.dataset.inc, (i?.q || 0) + 1); return; }
    const dec = e.target.closest('[data-dec]'); if (dec) { const i = Cart.items.find(x => x.id === dec.dataset.dec); Cart.set(dec.dataset.dec, (i?.q || 0) - 1); return; }
    const fm = e.target.closest('[data-farmer]');
    if (fm && !e.target.closest('[data-add]') && !e.target.closest('[data-scroll-to]')) { openFarmer(fm.dataset.farmer); return; }
    if (e.target.closest('[data-close-farmer]')) closeOv('farmer-overlay');
  });

  ['cart-overlay', 'farmer-overlay'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => { if (e.target.id === id) closeOv(id); });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeOv('cart-overlay'); closeOv('farmer-overlay'); } });

  document.querySelectorAll('.map-pin-group').forEach(g => {
    const f = FARMERS.find(f => f.id === g.dataset.pin), tip = document.getElementById('map-tip');
    g.addEventListener('mouseenter', () => {
      const svg = document.getElementById('japan-map'), scale = svg.clientWidth / 420;
      tip.innerHTML = `<strong>${f.name}</strong><em>${f.region}</em>`;
      tip.style.left = (g.dataset.x * scale) + 'px'; tip.style.top = (g.dataset.y * scale - 8) + 'px'; tip.style.opacity = '1';
    });
    g.addEventListener('mouseleave', () => tip.style.opacity = '0');
    g.addEventListener('click', () => openFarmer(f.id));
  });

  document.getElementById('hamburger').onclick = function () {
    this.classList.toggle('open'); document.getElementById('mobile-menu').classList.toggle('open');
  };
}
function openOv(id) { document.getElementById(id).classList.add('on'); document.body.style.overflow = 'hidden'; }
function closeOv(id) { document.getElementById(id).classList.remove('on'); document.body.style.overflow = ''; }
function closeMenu() { document.getElementById('hamburger').classList.remove('open'); document.getElementById('mobile-menu').classList.remove('open'); }

/* ════════ 11. LOADER ════════ */
function runLoader(done) {
  let pct = 0; const el = document.getElementById('loader-pct');
  const t = setInterval(() => {
    pct = Math.min(100, pct + Math.random() * 18); el.textContent = Math.round(pct);
    if (pct >= 100) { clearInterval(t); setTimeout(() => { document.getElementById('loader').classList.add('out'); done(); }, 300); }
  }, 120);
}

/* ════════ INIT ════════
   Module scripts are implicitly deferred and run after DOMContentLoaded,
   so DOM is ready here. No event listener needed.                       */
if (typeof Lenis !== 'undefined') {
  window._lenis = new Lenis({ duration: 1.2, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
  (function lraf(t) { window._lenis.raf(t); requestAnimationFrame(lraf); })(0);
}
Cart.load();
renderFarmers();
renderProducts();
renderMap();
bindEvents();
runLoader(() => {
  const vp = new VegParticles(document.getElementById('hero-canvas'));
  vp.start();
  initParallax();
  setTimeout(initReveal, 200);
});
