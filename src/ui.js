// キャンバスと入力（即時モードのボタン登録・縦スクロール・仮想スティック・複数の指）
export const W = 390; // 論理座標の横幅
export const DRAG_PX = 8; // これ以上指が動いたらタップではなくドラッグ

export class UI {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.regions = [];
    this.prevRegions = [];
    this.scrolls = {};
    this.pointers = new Map();
    this.keys = new Set();
    this.H = 760;
    this.scale = 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.keys.add(e.key));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key));
    window.addEventListener('blur', () => this.keys.clear());
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, r.width), cssH = Math.max(1, r.height);
    // 描画の解像度は2倍まで。重いときは dprCap を下げる（main.js が自動で調整）
    const dpr = Math.min(this.dprCap || 2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.scale = cssW / W;
    this.H = cssH / this.scale;
    this.pixel = this.scale * dpr;
  }

  beginFrame() {
    this.prevRegions = this.regions;
    this.regions = [];
    const ctx = this.ctx;
    ctx.setTransform(this.pixel, 0, 0, this.pixel, 0, 0);
    ctx.clearRect(0, 0, W, this.H);
    for (const s of Object.values(this.scrolls)) {
      const held = [...this.pointers.values()].some((p) => p.scroll === s);
      if (!held) {
        if (Math.abs(s.vel) > 0.1) { s.offset += s.vel; s.vel *= 0.92; } else s.vel = 0;
      }
      s.offset = Math.max(0, Math.min(s.max, s.offset));
    }
  }

  // 指を離したときに反応する領域（後から登録したものが手前）
  hit(x, y, w, h, onTap, clip = null) {
    this.regions.push({ kind: 'tap', x, y, w, h, onTap, clip });
  }

  // 指を置いた瞬間に反応する領域（アクション用）
  press(x, y, w, h, onPress) {
    this.regions.push({ kind: 'press', x, y, w, h, onPress });
  }

  // モーダルなど、下への入力を止める
  block(x = 0, y = 0, w = W, h = this.H, onTap = null) {
    this.regions.push({ kind: 'block', x, y, w, h, onTap });
  }

  // 仮想スティック。領域内に指を置くとその場所が中心になる
  stick(id, x, y, w, h) {
    this.regions.push({ kind: 'stick', x, y, w, h, id });
    for (const p of this.pointers.values()) {
      if (p.stick === id) {
        const dx = p.last.x - p.start.x, dy = p.last.y - p.start.y;
        const m = Math.hypot(dx, dy), R = 48;
        const k = m > R ? R / m : 1;
        return { active: true, cx: p.start.x, cy: p.start.y, x: (dx * k) / R, y: (dy * k) / R };
      }
    }
    return { active: false, x: 0, y: 0 };
  }

  // 縦スクロール領域。戻り値はスクロール量
  scroll(id, x, y, w, h, contentH) {
    const s = this.scrolls[id] || (this.scrolls[id] = { offset: 0, vel: 0, max: 0 });
    s.max = Math.max(0, contentH - h);
    s.offset = Math.max(0, Math.min(s.max, s.offset));
    this.regions.push({ kind: 'scroll', x, y, w, h, s });
    return s.offset;
  }

  resetScroll(id) {
    if (this.scrolls[id]) { this.scrolls[id].offset = 0; this.scrolls[id].vel = 0; }
  }

  toLocal(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.scale, y: (e.clientY - r.top) / this.scale };
  }

  find(p, kinds) {
    for (let i = this.prevRegions.length - 1; i >= 0; i--) {
      const g = this.prevRegions[i];
      if (p.x < g.x || p.y < g.y || p.x > g.x + g.w || p.y > g.y + g.h) continue;
      if (g.kind === 'tap' && g.clip) {
        const c = g.clip;
        if (p.x < c.x || p.y < c.y || p.x > c.x + c.w || p.y > c.y + c.h) continue;
      }
      if (g.kind === 'block') return kinds.includes('tap') ? g : null;
      if (kinds.includes(g.kind)) return g;
    }
    return null;
  }

  // 縦のパン操作（touch-action: pan-y 相当）はこのクラスが自分で扱う。
  // ブラウザ任せにすると iOS ではドラッグ中に pointercancel が来てボタンとスクロールが両方止まるため、
  // canvas は touch-action: none にして、スクロール領域とボタンの上の縦ドラッグをここでスクロールに変える。
  onDown(e) {
    const p = this.toLocal(e);
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* 古いブラウザ */ }
    const g = this.find(p, ['press', 'stick', 'scroll', 'tap']);
    const ptr = { id: e.pointerId, start: p, last: p, moved: false, scroll: null, stick: null, t: performance.now() };
    if (g && g.kind === 'press') {
      ptr.pressed = true;
      g.onPress(p);
    } else if (g && g.kind === 'stick') {
      ptr.stick = g.id;
    } else {
      // ボタンの上から触っても、その下にスクロール領域があればドラッグでスクロールできる
      const sc = this.find(p, ['scroll']);
      if (sc) { ptr.scroll = sc.s; sc.s.vel = 0; }
    }
    this.pointers.set(e.pointerId, ptr);
  }

  onMove(e) {
    const pt = this.pointers.get(e.pointerId);
    if (!pt) return;
    const p = this.toLocal(e);
    // 指が DRAG_PX 以上動いたらスクロール扱い（ボタンの反応は取り消す）
    if (!pt.moved && Math.hypot(p.x - pt.start.x, p.y - pt.start.y) > DRAG_PX) {
      pt.moved = true;
      pt.last = { x: pt.last.x, y: pt.start.y + Math.sign(p.y - pt.start.y) * DRAG_PX };
    }
    if (pt.scroll && pt.moved) {
      const dy = p.y - pt.last.y;
      pt.scroll.offset -= dy;
      pt.scroll.vel = -dy;
    }
    pt.last = p;
  }

  onUp(e) {
    const pt = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!pt || pt.pressed || pt.stick) return;
    if (pt.moved && pt.scroll) return;
    if (pt.moved && Math.hypot(pt.last.x - pt.start.x, pt.last.y - pt.start.y) > 24) return;
    const g = this.find(pt.start, ['tap']);
    if (g && g.onTap) g.onTap(pt.start);
  }

  // 押している最中か（ボタンの見た目を沈める）。ドラッグに変わったら false
  held(x, y, w, h) {
    for (const p of this.pointers.values()) {
      if (p.moved || p.pressed || p.stick) continue;
      if (p.start.x >= x && p.start.x <= x + w && p.start.y >= y && p.start.y <= y + h) return true;
    }
    return false;
  }

  // キーボード（パソコンで試すとき用）
  keyDir() {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('ArrowLeft') || k.has('a')) x -= 1;
    if (k.has('ArrowRight') || k.has('d')) x += 1;
    if (k.has('ArrowUp') || k.has('w')) y -= 1;
    if (k.has('ArrowDown') || k.has('s')) y += 1;
    const m = Math.hypot(x, y);
    return m ? { x: x / m, y: y / m } : { x: 0, y: 0 };
  }
}
