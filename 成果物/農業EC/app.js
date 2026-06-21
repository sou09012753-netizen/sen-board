/* ════════════════════════════════════════════════
   SEN — APP LOGIC (Three.js particle vegetable scene)
   ════════════════════════════════════════════════ */
import * as THREE from 'three';
import { EffectComposer }   from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }       from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }  from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment }  from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader }       from 'three/addons/loaders/GLTFLoader.js';

/* ════════ 1. PARTICLE VEGETABLE SCENE ════════ */

const N_PTC        = 7000;  // 粒子数
const ASSEMBLE_MS  = 2600;  // 散乱→集合
const HOLD_MS      = 5000;  // 集合保持
const DISSOLVE_MS  = 1800;  // 集合→散乱
const SCATTER_MS   = 900;   // 次モデルへの過渡期

class VegScene3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.W = this.H = 0;
    this.t = 0;
    this._mx = 0; this._my = 0;

    /* 粒子バッファ */
    this.curPos  = new Float32Array(N_PTC * 3); // 毎フレーム更新
    this.fromPos = null;  // フェーズ開始時スナップショット
    this.toPos   = null;  // 補間先

    /* 散乱軌道パラメータ: θ, r, dy, dr_drift */
    this.scP  = new Float32Array(N_PTC * 4);
    this.posX = 1.65;

    /* プリロード済みモデルデータ */
    this.models   = [];
    this.modelIdx = 0;

    /* フェーズ状態機械 */
    this.phase    = 'scatter';
    this.phaseT0  = 0;
    this.phaseDur = 99999;

    /* マウス反発用変位バッファ（hold中のみ使用） */
    this._disp = new Float32Array(N_PTC * 3);

    /* Three.js オブジェクト */
    this.posAttr  = null;
    this.colAttr  = null;
    this.pts      = null;
    this.composer = null;
  }

  /* ── 丸い光点テクスチャ ──────────────────────── */
  _makeCircleTex() {
    const sz  = 64;
    const cv  = document.createElement('canvas');
    cv.width  = cv.height = sz;
    const ctx = cv.getContext('2d');
    const g   = ctx.createRadialGradient(sz/2, sz/2, 0, sz/2, sz/2, sz/2);
    g.addColorStop(0,   'rgba(255,255,255,1.0)');
    g.addColorStop(0.35,'rgba(255,255,255,0.85)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.25)');
    g.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, sz, sz);
    return new THREE.CanvasTexture(cv);
  }

  /* ── レンダラー・シーン初期化 ─────────────────── */
  _init() {
    const W = this.W = window.innerWidth;
    const H = this.H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(W, H);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(this.renderer), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
    this.camera.position.set(0, 0, 6);

    const rp    = new RenderPass(this.scene, this.camera);
    const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.38, 0.55, 0.78);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(rp);
    this.composer.addPass(bloom);

    window.addEventListener('resize', () => this._resize());
    window.addEventListener('mousemove', e => {
      this._mx = (e.clientX / this.W - 0.5) * 2;
      this._my = (e.clientY / this.H - 0.5) * 2;
    }, { passive: true });

    /* 散乱軌道を初期化 */
    this._resetScatter();

    /* Points オブジェクト生成 */
    const geo    = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.curPos, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);

    const col    = new Float32Array(N_PTC * 3).fill(0.55);
    this.colAttr = new THREE.BufferAttribute(col, 3);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);

    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color',    this.colAttr);

    this.pts = new THREE.Points(geo, new THREE.PointsMaterial({
      size:            0.028,
      map:             this._makeCircleTex(),
      vertexColors:    true,
      transparent:     true,
      opacity:         0.95,
      depthWrite:      false,
      blending:        THREE.AdditiveBlending,
      sizeAttenuation: true,
      alphaTest:       0.001,
    }));
    this.scene.add(this.pts);

    this.phaseT0  = performance.now();
  }

  _resize() {
    this.W = window.innerWidth; this.H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setSize(this.W, this.H);
    this.renderer.setPixelRatio(dpr);
    this.camera.aspect = this.W / this.H;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(this.W, this.H);
  }

  /* ── 散乱軌道パラメータ初期化 ────────────────── */
  /* 軌道中心をx=0（画面中央）にして画面外に出ないようにする。
     カメラz=6, fov=42°の視野: 横±3.7, 縦±2.3 world units */
  _resetScatter() {
    for (let i = 0; i < N_PTC; i++) {
      const th = Math.random() * Math.PI * 2;
      const r  = 0.2 + Math.random() * 3.2; // max r=3.4 → 画面内に収まる
      const y  = (Math.random() - 0.5) * 4.2;
      this.scP[i*4]   = th;
      this.scP[i*4+1] = r;
      this.scP[i*4+2] = (Math.random() - 0.5) * 0.006;
      this.scP[i*4+3] = 0.002 + Math.random() * 0.005; // ドリフト抑制
      this.curPos[i*3]   = Math.cos(th) * r;  // x=0中心
      this.curPos[i*3+1] = y;
      this.curPos[i*3+2] = Math.sin(th) * r;
    }
  }

  /* ── GLBサーフェスをN_PTC点サンプリング ──────── */
  async _sampleGLB(url, scale, posX, offsetY) {
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(url, gltf => {
        const g = gltf.scene;

        /* センタリング＋スケール */
        const box = new THREE.Box3().setFromObject(g);
        const ctr = box.getCenter(new THREE.Vector3());
        g.position.sub(ctr);
        g.position.y += offsetY;
        g.scale.setScalar(scale);
        g.updateMatrixWorld(true);

        /* テクスチャ → ピクセルデータをキャッシュ */
        const texCache = new Map();
        g.traverse(o => {
          if (!o.isMesh) return;
          const mat = [].concat(o.material)[0];
          if (!mat?.map?.image) return;
          const uuid = mat.map.uuid;
          if (texCache.has(uuid)) return;
          const img = mat.map.image;
          const tw  = img.width  || img.naturalWidth  || 512;
          const th2 = img.height || img.naturalHeight || 512;
          const cv  = document.createElement('canvas');
          cv.width = tw; cv.height = th2;
          const ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0, tw, th2);
          texCache.set(uuid, { px: ctx.getImageData(0, 0, tw, th2).data, tw, th: th2 });
        });

        /* メッシュ収集 */
        const meshes = [];
        g.traverse(o => { if (o.isMesh && o.geometry) meshes.push(o); });

        /* サンプリング */
        const positions = new Float32Array(N_PTC * 3);
        const colors    = new Float32Array(N_PTC * 3);

        for (let s = 0; s < N_PTC; s++) {
          const o   = meshes[Math.floor(Math.random() * meshes.length)];
          const geo = o.geometry;
          const pA  = geo.attributes.position;
          const uvA = geo.attributes.uv;
          const idx = geo.index;
          const mat = [].concat(o.material)[0];

          const tCnt = idx ? idx.count / 3 : pA.count / 3;
          const tri  = Math.floor(Math.random() * tCnt);
          let a, b, c;
          if (idx) {
            a = idx.getX(tri*3); b = idx.getX(tri*3+1); c = idx.getX(tri*3+2);
          } else {
            a = tri*3; b = tri*3+1; c = tri*3+2;
          }

          /* 重心座標でランダム点 */
          let r1 = Math.random(), r2 = Math.random();
          if (r1 + r2 > 1) { r1 = 1-r1; r2 = 1-r2; }
          const r3 = 1 - r1 - r2;

          /* ローカル座標 → ワールド座標 */
          const lx = pA.getX(a)*r3 + pA.getX(b)*r1 + pA.getX(c)*r2;
          const ly = pA.getY(a)*r3 + pA.getY(b)*r1 + pA.getY(c)*r2;
          const lz = pA.getZ(a)*r3 + pA.getZ(b)*r1 + pA.getZ(c)*r2;
          const wp  = new THREE.Vector3(lx, ly, lz).applyMatrix4(o.matrixWorld);

          positions[s*3]   = wp.x + posX;
          positions[s*3+1] = wp.y;
          positions[s*3+2] = wp.z;

          /* テクスチャカラーをサンプル */
          let r = 0.8, gg = 0.8, bl = 0.8;
          if (uvA && mat?.map) {
            const tx = texCache.get(mat.map.uuid);
            if (tx) {
              const u  = uvA.getX(a)*r3 + uvA.getX(b)*r1 + uvA.getX(c)*r2;
              const v  = uvA.getY(a)*r3 + uvA.getY(b)*r1 + uvA.getY(c)*r2;
              const px = Math.min(tx.tw-1, Math.max(0, Math.floor(u * tx.tw)));
              const py = Math.min(tx.th-1, Math.max(0, Math.floor((1-v) * tx.th)));
              const pi = (py * tx.tw + px) * 4;
              /* 彩度ブースト */
              const col = new THREE.Color(tx.px[pi]/255, tx.px[pi+1]/255, tx.px[pi+2]/255);
              const hsl = {}; col.getHSL(hsl);
              if (hsl.s > 0.03) col.setHSL(hsl.h, Math.min(1, hsl.s * 3.2), Math.min(0.82, hsl.l * 1.2));
              r = col.r; gg = col.g; bl = col.b;
            }
          } else if (mat?.color) {
            r = mat.color.r; gg = mat.color.g; bl = mat.color.b;
          }
          colors[s*3] = r; colors[s*3+1] = gg; colors[s*3+2] = bl;
        }

        resolve({ positions, colors, posX });
      }, undefined, reject);
    });
  }

  /* ── フェーズ遷移 ────────────────────────────── */
  _ease(t) {
    return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
  }

  _setPhase(name, dur) {
    this.phase    = name;
    this.phaseT0  = performance.now();
    this.phaseDur = dur;

    if (name === 'assemble' || name === 'dissolve') {
      this.fromPos = this.curPos.slice();
      this._disp.fill(0);
    }
    if (name === 'dissolve') {
      /* 散乱先を生成（x=0中心・画面内） */
      this.toPos = new Float32Array(N_PTC * 3);
      for (let i = 0; i < N_PTC; i++) {
        const th = Math.random() * Math.PI * 2;
        const r  = 0.3 + Math.random() * 3.2;
        this.toPos[i*3]   = Math.cos(th) * r;  // x=0中心
        this.toPos[i*3+1] = (Math.random() - 0.5) * 4.2;
        this.toPos[i*3+2] = Math.sin(th) * r;
      }
    }
  }

  _applyColors(colors) {
    const ca = this.colAttr.array;
    for (let i = 0; i < N_PTC * 3; i++) ca[i] = colors[i];
    this.colAttr.needsUpdate = true;
  }

  /* ── メインサイクル ──────────────────────────── */
  async cycle() {
    const cfgs = [
      { url: 'assets/corn_ai.glb',       scale: 3.2, posX: 1.6,  offsetY: -0.5 },
      { url: 'assets/strawberry_ai.glb', scale: 3.0, posX: 1.65, offsetY: -0.2 },
    ];

    /* プリロード（両モデルを順次読み込み） */
    for (const cfg of cfgs) {
      try {
        const m = await this._sampleGLB(cfg.url, cfg.scale, cfg.posX, cfg.offsetY);
        this.models.push(m);
      } catch(e) {
        console.warn('GLB load failed:', cfg.url, e);
        this.models.push(null);
      }
    }

    /* サイクルループ */
    while (true) {
      const m = this.models[this.modelIdx % this.models.length];
      this.modelIdx++;
      if (!m) { await wait(1000); continue; }

      this.posX = m.posX;
      this._applyColors(m.colors);

      /* 散乱: 粒子が渦巻く */
      this._setPhase('scatter', SCATTER_MS);
      await wait(SCATTER_MS);

      /* 集合: 散乱→野菜の形 */
      this.toPos = m.positions;
      this._setPhase('assemble', ASSEMBLE_MS);
      await wait(ASSEMBLE_MS + 200);

      /* 保持: 野菜の形で静止・呼吸（マウスで一部散乱） */
      this._setPhase('hold', HOLD_MS);
      await wait(HOLD_MS);

      /* 解散: 野菜の形→散乱 */
      this._setPhase('dissolve', DISSOLVE_MS);
      await wait(DISSOLVE_MS + 200);

      /* 散乱パラメータを解散後の位置に同期（x=0中心） */
      for (let i = 0; i < N_PTC; i++) {
        const x = this.curPos[i*3];  // x=0中心なのでそのまま使う
        const z = this.curPos[i*3+2];
        const r = Math.sqrt(x*x + z*z);
        this.scP[i*4]   = Math.atan2(z, x);
        this.scP[i*4+1] = Math.max(0.1, r);
      }
    }
  }

  /* ── 毎フレーム更新 ──────────────────────────── */
  update() {
    this.t += 0.007;
    const elapsed = performance.now() - this.phaseT0;
    const p       = this._ease(Math.min(1, elapsed / this.phaseDur));
    const boost   = 1 + Math.abs(this._mx) * 0.9 + Math.abs(this._my) * 0.9;

    /* ── 散乱フェーズ: 渦巻き軌道（x=0中心・画面内） ── */
    if (this.phase === 'scatter') {
      const ang = 0.008 * boost;
      for (let i = 0; i < N_PTC; i++) {
        const r = this.scP[i*4+1];
        this.scP[i*4]      += ang * (1.5 / (r + 0.4));
        this.scP[i*4+1]    += this.scP[i*4+3] * boost * 0.3;
        this.curPos[i*3+1] += this.scP[i*4+2];
        this.curPos[i*3]    = Math.cos(this.scP[i*4]) * this.scP[i*4+1]; // x=0中心
        this.curPos[i*3+2]  = Math.sin(this.scP[i*4]) * this.scP[i*4+1];
        // 画面内リセット（横±3.5, 縦±2.4）
        if (this.scP[i*4+1] > 3.5 || Math.abs(this.curPos[i*3+1]) > 2.4) {
          this.scP[i*4]      = Math.random() * Math.PI * 2;
          this.scP[i*4+1]    = Math.random() * 0.4;
          this.curPos[i*3+1] = (Math.random() - 0.5) * 1.2;
        }
      }
      this.posAttr.needsUpdate = true;
    }

    /* ── 集合フェーズ: 散乱位置→サーフェス位置 ── */
    else if (this.phase === 'assemble') {
      const f = this.fromPos, to = this.toPos;
      for (let i = 0; i < N_PTC * 3; i++) this.curPos[i] = f[i] * (1-p) + to[i] * p;
      this.posAttr.needsUpdate = true;
    }

    /* ── 保持フェーズ: 呼吸 + マウス近傍だけ局所散乱 ── */
    else if (this.phase === 'hold' && this.toPos) {
      const halfH    = Math.tan(21 * Math.PI / 180) * 6;
      const halfW    = halfH * (this.W / this.H);
      const mwx      = this._mx * halfW;
      const mwy      = -this._my * halfH;
      const RADIUS   = 0.90;   // 影響半径 (world units)
      const STRENGTH = 0.11;   // フレームあたり押し出し強度
      const DAMPING  = 0.86;   // 減衰（約0.3sで元位置に戻る）
      const amp      = 0.006;

      for (let i = 0; i < N_PTC; i++) {
        /* 呼吸振動 */
        const ph = (i * 2.39996) % (Math.PI * 2);
        const w  = Math.sin(this.t * 2.0 + ph) * amp;
        const tx = this.toPos[i*3]   + w * Math.cos(ph);
        const ty = this.toPos[i*3+1] + w * Math.sin(ph);
        const tz = this.toPos[i*3+2] + w * 0.4;

        /* カーソル近傍の粒子を外側に押し出す */
        const dx   = tx - mwx;
        const dy   = ty - mwy;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < RADIUS && dist > 0.001) {
          const f = STRENGTH * Math.pow(1 - dist / RADIUS, 2);
          this._disp[i*3]   += (dx / dist) * f;
          this._disp[i*3+1] += (dy / dist) * f;
        }

        /* 全粒子の変位を減衰（カーソルが離れると元の位置に戻る） */
        this._disp[i*3]   *= DAMPING;
        this._disp[i*3+1] *= DAMPING;
        this._disp[i*3+2] *= DAMPING;

        this.curPos[i*3]   = tx + this._disp[i*3];
        this.curPos[i*3+1] = ty + this._disp[i*3+1];
        this.curPos[i*3+2] = tz + this._disp[i*3+2];
      }
      this.posAttr.needsUpdate = true;
    }

    /* ── 解散フェーズ: サーフェス位置→散乱 ── */
    else if (this.phase === 'dissolve') {
      const f = this.fromPos, to = this.toPos;
      for (let i = 0; i < N_PTC * 3; i++) this.curPos[i] = f[i] * (1-p) + to[i] * p;
      this.posAttr.needsUpdate = true;
    }

    /* 非常に微妙なカメラ傾き（右に飛ばないよう自動回転なし） */
    const tx = this._my * -0.025;
    const ty = this._mx *  0.030;
    this.camera.rotation.x += (tx - this.camera.rotation.x) * 0.03;
    this.camera.rotation.y += (ty - this.camera.rotation.y) * 0.03;

    this.composer.render();
  }

  start() {
    this._init();
    const loop = () => { this.update(); requestAnimationFrame(loop); };
    loop();
    this.cycle();
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
  const vp = new VegScene3D(document.getElementById('hero-canvas'));
  vp.start();
  initParallax();
  setTimeout(initReveal, 200);
});
