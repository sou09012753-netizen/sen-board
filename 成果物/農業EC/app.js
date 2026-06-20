/* ════════════════════════════════════════════════
   SEN — APP LOGIC (Three.js 3D vegetable scene)
   ════════════════════════════════════════════════ */
import * as THREE from 'three';
import { EffectComposer }   from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }       from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }  from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment }  from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader }       from 'three/addons/loaders/GLTFLoader.js';

/* ════════ 1. 3D VEGETABLE SCENE ════════ */
class VegScene3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.W = 0; this.H = 0;
    this.t = 0;
    this.currentGroup = null;
    this.composer = null;
    this._mx = 0; this._my = 0;
  }

  _init() {
    const W = this.W = window.innerWidth;
    const H = this.H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(W, H);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.80;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();

    // IBL環境マップ (RoomEnvironment = 室内光のIBL)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(this.renderer), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
    this.camera.position.set(0, 0, 6);

    // キーライト: 暖かい白, 左上前から
    const key = new THREE.DirectionalLight(0xffd88a, 1.5);
    key.position.set(-3, 4, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 20;
    this.scene.add(key);

    // フィルライト: 涼しい青, 右から
    const fill = new THREE.DirectionalLight(0x88aaff, 0.6);
    fill.position.set(5, -1, 2);
    this.scene.add(fill);

    // リムライト: 背面からの縁取り
    const rim = new THREE.PointLight(0xaadcff, 1.2, 20);
    rim.position.set(1.5, 1.5, -5);
    this.scene.add(rim);

    // 下からの反射光 (地面からの跳ね返り)
    const bounce = new THREE.PointLight(0xffd080, 0.5, 12);
    bounce.position.set(0, -4, 2);
    this.scene.add(bounce);

    this.scene.add(new THREE.AmbientLight(0x111111, 1.0));

    // ポストプロセス: ブルーム
    const rp = new RenderPass(this.scene, this.camera);
    const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.10, 0.3, 0.96);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(rp);
    this.composer.addPass(bloom);

    window.addEventListener('resize', () => this._resize());
    window.addEventListener('mousemove', e => {
      this._mx = (e.clientX / this.W - 0.5) * 2;
      this._my = (e.clientY / this.H - 0.5) * 2;
    }, { passive: true });
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

  // ── とうもろこし ──────────────────────────────────
  _buildCorn() {
    const g = new THREE.Group();
    const ROWS = 20, COLS = 13;
    const cobH = 2.4;

    for (let row = 0; row < ROWS; row++) {
      const t = row / (ROWS - 1);
      const profile = Math.sin(t * Math.PI);
      const R = 0.46 + profile * 0.20;
      const y = (t - 0.5) * cobH;
      // 色: 上部は黄緑, 下部は濃い金色 (lightness低めでACESトーンマップ後もゴールデン)
      const hue   = 0.14 - t * 0.05;
      const light = 0.26 + profile * 0.10;
      const baseCol = new THREE.Color().setHSL(hue, 0.92, light);

      for (let col = 0; col < COLS; col++) {
        const angle = (col / COLS) * Math.PI * 2 + (row % 2 === 0 ? 0 : Math.PI / COLS);
        const kGeo  = new THREE.SphereGeometry(0.085, 9, 7);
        kGeo.scale(1.1, 1.4, 0.82); // 縦長の楕円カーネル
        const kCol = baseCol.clone().multiplyScalar(0.82 + Math.random() * 0.36);
        const kMat = new THREE.MeshStandardMaterial({ color: kCol, roughness: 0.80, metalness: 0.0 });
        const kernel = new THREE.Mesh(kGeo, kMat);
        kernel.position.set(R * Math.cos(angle), y, R * Math.sin(angle));
        kernel.lookAt(new THREE.Vector3(R * Math.cos(angle) * 3, y, R * Math.sin(angle) * 3));
        kernel.castShadow = true;
        g.add(kernel);
      }
    }

    // 先端キャップ
    const tipMat = new THREE.MeshStandardMaterial({ color: 0x8a6408, roughness: 0.75 });
    const topTip = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), tipMat);
    topTip.scale.set(1, 1.7, 1);
    topTip.position.y = cobH * 0.5 + 0.12;
    const botTip = topTip.clone(); botTip.position.y = -cobH * 0.5 - 0.12;
    g.add(topTip, botTip);

    // 緑の葉（3枚）
    const huskMat = new THREE.MeshStandardMaterial({ color: 0x4a9020, roughness: 0.8, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const pts = Array.from({ length: 12 }, (_, j) => {
        const s = j / 11;
        return new THREE.Vector3(
          Math.cos(a) * (0.28 + s * 0.55) + Math.sin(s * Math.PI) * 0.18 * Math.cos(a + Math.PI / 2),
          cobH * 0.48 + s * 1.1 + Math.pow(s, 1.5) * 0.3,
          Math.sin(a) * (0.28 + s * 0.55) + Math.sin(s * Math.PI) * 0.18 * Math.sin(a + Math.PI / 2)
        );
      });
      const leaf = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.055, 5, false),
        huskMat
      );
      leaf.castShadow = true;
      g.add(leaf);
    }

    // シルク（ひげ）
    const silkMat = new THREE.MeshStandardMaterial({ color: 0xf0d060, roughness: 1.0 });
    for (let i = 0; i < 10; i++) {
      const rx = (Math.random() - 0.5) * 0.18, rz = (Math.random() - 0.5) * 0.18;
      const h = 0.35 + Math.random() * 0.55;
      const silk = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
          new THREE.Vector3(rx, cobH * 0.5 + 0.22, rz),
          new THREE.Vector3(rx * 1.8 + 0.08, cobH * 0.5 + 0.22 + h * 0.5, rz * 1.8),
          new THREE.Vector3(rx * 2.8 + 0.18, cobH * 0.5 + 0.22 + h, rz * 2.8),
        ]), 8, 0.010, 4, false),
        silkMat
      );
      g.add(silk);
    }

    g.scale.setScalar(0.28);
    g.position.set(1.8, -0.20, 0);
    return g;
  }

  // ── いちご ───────────────────────────────────────
  _buildStrawberry() {
    const g = new THREE.Group();

    // 本体 (LatheGeometry で回転体)
    const profile = [
      new THREE.Vector2(0.00, -1.35), new THREE.Vector2(0.18, -1.05),
      new THREE.Vector2(0.60, -0.50), new THREE.Vector2(0.92, 0.05),
      new THREE.Vector2(1.00, 0.50),  new THREE.Vector2(0.92, 0.90),
      new THREE.Vector2(0.75, 1.18),  new THREE.Vector2(0.50, 1.38),
      new THREE.Vector2(0.22, 1.50),  new THREE.Vector2(0.00, 1.55),
    ];
    const bodyGeo = new THREE.LatheGeometry(profile, 52);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc80e1c, roughness: 0.68, metalness: 0.02 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // 種 (surface seeds)
    const seedMat = new THREE.MeshStandardMaterial({ color: 0xf0d848, roughness: 0.5 });
    let rngS = 54321;
    const rnd = () => { rngS = (rngS * 1664525 + 1013904223) >>> 0; return rngS / 0xffffffff; };

    for (let i = 0; i < 90; i++) {
      const t   = rnd() * 0.9;
      const phi = rnd() * Math.PI * 2;
      const pi  = Math.min(profile.length - 2, Math.floor(t * (profile.length - 1)));
      const frac = t * (profile.length - 1) - pi;
      const r = profile[pi].x * (1 - frac) + profile[pi + 1].x * frac;
      const y = profile[pi].y * (1 - frac) + profile[pi + 1].y * frac;
      if (r < 0.1) continue;
      const seed = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), seedMat);
      seed.position.set(r * Math.cos(phi), y, r * Math.sin(phi));
      seed.scale.z = 0.5;
      seed.lookAt(new THREE.Vector3(r * Math.cos(phi) * 3, y, r * Math.sin(phi) * 3));
      g.add(seed);
    }

    // がく (5枚の葉)
    const calyxMat = new THREE.MeshStandardMaterial({ color: 0x2a8018, roughness: 0.75, side: THREE.DoubleSide });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const pts = [
        new THREE.Vector3(0, 1.55, 0),
        new THREE.Vector3(Math.cos(a) * 0.35, 1.68, Math.sin(a) * 0.35),
        new THREE.Vector3(Math.cos(a) * 0.72, 1.92, Math.sin(a) * 0.72),
        new THREE.Vector3(Math.cos(a) * 0.88, 2.18, Math.sin(a) * 0.88),
      ];
      const leaf = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.058, 5, false),
        calyxMat
      );
      leaf.castShadow = true;
      g.add(leaf);
    }

    // 軸
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.055, 0.42, 8),
      new THREE.MeshStandardMaterial({ color: 0x507028, roughness: 0.9 })
    );
    stem.position.y = 1.77;
    g.add(stem);

    g.scale.setScalar(0.30);
    g.position.set(1.6, -0.15, 0);
    return g;
  }

  // ── アニメーション補助 ──────────────────────────
  _tween(ms, fn) {
    return new Promise(res => {
      const t0 = performance.now();
      const tick = now => {
        const p = Math.min(1, (now - t0) / ms);
        fn(p);
        if (p < 1) requestAnimationFrame(tick); else res();
      };
      requestAnimationFrame(tick);
    });
  }

  async _animIn(group) {
    group.scale.setScalar(0.001);
    this.scene.add(group);
    this.currentGroup = group;
    await this._tween(900, p => {
      const s = 1 - Math.pow(1 - p, 3); // ease-out cubic
      group.scale.setScalar(0.001 + s * 0.999);
    });
  }

  async _animOut(group) {
    await this._tween(650, p => {
      group.scale.setScalar(Math.max(0, 1 - p * p * p));
    });
    if (group._vortex) this.scene.remove(group._vortex);
    this.scene.remove(group);
    this.currentGroup = null;
  }

  // ── 3Dミニチュア渦パーティクル ──────────────────
  // sourceScene: GLBシーンのクローン（ジオメトリ・マテリアルを共有）
  _buildVortex3D(sourceScene, posX) {
    const group = new THREE.Group();
    const N = 55;
    const instances = [];

    for (let i = 0; i < N; i++) {
      const mini = sourceScene.clone(true); // ジオメトリ/マテリアルはGPU共有
      const theta = Math.random() * Math.PI * 2;
      const r     = 0.6 + Math.random() * 3.2;
      const y     = (Math.random() - 0.5) * 5.0;
      const sc    = 0.055 + Math.random() * 0.080; // 自然サイズの5.5〜13.5%

      mini.scale.setScalar(sc);
      mini.position.set(posX + Math.cos(theta) * r, y, Math.sin(theta) * r);
      mini.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      instances.push({
        obj:   mini,
        theta, r,
        drdt:  0.003 + Math.random() * 0.007,   // 外向きドリフト
        dy:    (Math.random() - 0.5) * 0.007,   // 上下ドリフト
        rx:    (Math.random() - 0.5) * 0.045,   // 個別スピン
        ry:    (Math.random() - 0.5) * 0.055,
        rz:    (Math.random() - 0.5) * 0.030,
      });
      group.add(mini);
    }

    group.userData = { instances, posX };
    return group;
  }

  _updateVortex(vortexGroup) {
    const { instances, posX } = vortexGroup.userData;
    const boost    = vortexGroup.userData.mouseBoost || 1.0;
    const angSpeed = 0.007 * boost;

    for (const inst of instances) {
      // 渦巻き: 中心ほど速く回る
      inst.theta += angSpeed * (1.8 / (inst.r + 0.5));
      inst.r     += inst.drdt * boost * 0.5;
      inst.obj.position.y += inst.dy;

      inst.obj.position.x = posX + Math.cos(inst.theta) * inst.r;
      inst.obj.position.z = Math.sin(inst.theta) * inst.r;

      // 個別回転
      inst.obj.rotation.x += inst.rx;
      inst.obj.rotation.y += inst.ry;
      inst.obj.rotation.z += inst.rz;

      // 外に出たら中心付近にリセット
      if (inst.r > 4.5 || Math.abs(inst.obj.position.y) > 3.5) {
        inst.theta = Math.random() * Math.PI * 2;
        inst.r     = 0.1 + Math.random() * 0.35;
        inst.obj.position.y = (Math.random() - 0.5) * 1.8;
      }
    }
  }

  // ── GLBロード ────────────────────────────────
  _loadGLB(url, scale, posX, innerOffsetY = 0) {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(url, gltf => {
        const g = gltf.scene;

        // 色彩強化（マテリアル共有のためクローン前に適用）
        g.traverse(o => {
          if (o.isMesh && o.material) {
            [].concat(o.material).forEach(m => {
              m.envMapIntensity = 2.2;
              if (m.color) {
                const hsl = {};
                m.color.getHSL(hsl);
                if (hsl.s > 0.08) {
                  m.color.setHSL(hsl.h, Math.min(1.0, hsl.s * 1.9), hsl.l * 0.76);
                }
              }
              m.needsUpdate = true;
            });
          }
        });

        // マテリアル適用後にクローン（パーティクルは同じマテリアルを共有）
        const particleSource = g.clone(true);

        // メイン表示モデルの配置
        const box    = new THREE.Box3().setFromObject(g);
        const center = box.getCenter(new THREE.Vector3());
        g.position.sub(center);
        g.position.y += innerOffsetY;
        g.scale.setScalar(scale);

        const wrapper = new THREE.Group();
        wrapper.add(g);
        wrapper.position.set(posX, 0, 0);

        // 3Dミニチュア渦パーティクルをシーンに追加
        const vortex = this._buildVortex3D(particleSource, posX);
        this.scene.add(vortex);
        wrapper._vortex = vortex;

        resolve(wrapper);
      }, undefined, reject);
    });
  }

  // ── メインループ ────────────────────────────────
  async cycle() {
    const builders = [
      () => this._loadGLB('assets/corn_ai.glb',       3.2, 1.6, -0.5),
      () => this._loadGLB('assets/strawberry_ai.glb', 3.0, 1.7, -0.2),
    ];
    let idx = 0;
    while (true) {
      let group;
      try {
        group = await builders[idx % builders.length]();
      } catch(e) {
        group = idx % 2 === 0 ? this._buildCorn() : this._buildStrawberry();
      }
      idx++;
      await this._animIn(group);
      await wait(5500);
      await this._animOut(group);
      await wait(400);
    }
  }

  update() {
    this.t += 0.007;
    if (this.currentGroup) {
      // マウスで大きく傾く (感度UP)
      const targetRX = this._my * -0.35;
      const targetRY = this._mx * 0.40 + this.t * 0.20;
      this.currentGroup.rotation.x += (targetRX - this.currentGroup.rotation.x) * 0.06;
      this.currentGroup.rotation.y += (targetRY - this.currentGroup.rotation.y) * 0.06;
      // 上下浮遊 + マウスで少し上下移動
      const floatTarget = Math.sin(this.t * 0.6) * 0.12 + this._my * -0.18;
      this.currentGroup.position.y += (floatTarget - this.currentGroup.position.y) * 0.07;
      // X方向もマウスに追従
      const baseX = this.currentGroup._baseX || this.currentGroup.position.x;
      this.currentGroup._baseX = baseX;
      this.currentGroup.position.x += (baseX + this._mx * 0.18 - this.currentGroup.position.x) * 0.05;
      // 渦パーティクル: マウスに反応して渦の回転速度が変わる
      if (this.currentGroup._vortex) {
        this.currentGroup._vortex.userData.mouseBoost = 1.0 + Math.abs(this._mx) * 0.8 + Math.abs(this._my) * 0.8;
        this._updateVortex(this.currentGroup._vortex);
      }
    }
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
