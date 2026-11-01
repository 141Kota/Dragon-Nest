// キャンバスとタップ入力（即時モードのボタン登録・縦スクロール）
export const W = 390; // 論理座標の横幅

export class UI {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.regions = [];
    this.prevRegions = [];
    this.scrolls = {};
    this.pointer = null;
    this.H = 760;
    this.scale = 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', () => { this.pointer = null; });
    // iOS のダブルタップ拡大や長押しメニューを止める
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, r.width), cssH = Math.max(1, r.height);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
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
      if (!this.pointer || this.pointer.scroll !== s) {
        if (Math.abs(s.vel) > 0.1) { s.offset += s.vel; s.vel *= 0.92; } else s.vel = 0;
      }
      s.offset = Math.max(0, Math.min(s.max, s.offset));
    }
  }

  // タップできる領域を登録（後から登録したものが手前）
  hit(x, y, w, h, onTap, clip = null) {
    this.regions.push({ kind: 'tap', x, y, w, h, onTap, clip });
  }

  // モーダルなど、下へのタップを止める
  block(x = 0, y = 0, w = W, h = this.H, onTap = null) {
    this.regions.push({ kind: 'block', x, y, w, h, onTap });
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

  find(p, kind) {
    for (let i = this.prevRegions.length - 1; i >= 0; i--) {
      const g = this.prevRegions[i];
      if (p.x < g.x || p.y < g.y || p.x > g.x + g.w || p.y > g.y + g.h) continue;
      if (g.kind === 'tap' && g.clip) {
        const c = g.clip;
        if (p.x < c.x || p.y < c.y || p.x > c.x + c.w || p.y > c.y + c.h) continue;
      }
      if (g.kind === 'block') return kind === 'tap' ? g : null;
      if (g.kind === kind) return g;
    }
    return null;
  }

  onDown(e) {
    const p = this.toLocal(e);
    const sc = this.find(p, 'scroll');
    this.pointer = { id: e.pointerId, start: p, last: p, moved: false, scroll: sc ? sc.s : null, t: performance.now() };
    if (sc) sc.s.vel = 0;
  }

  onMove(e) {
    const pt = this.pointer;
    if (!pt || pt.id !== e.pointerId) return;
    const p = this.toLocal(e);
    if (Math.hypot(p.x - pt.start.x, p.y - pt.start.y) > 9) pt.moved = true;
    if (pt.scroll && pt.moved) {
      const dy = p.y - pt.last.y;
      pt.scroll.offset -= dy;
      pt.scroll.vel = -dy;
    }
    pt.last = p;
  }

  onUp(e) {
    const pt = this.pointer;
    this.pointer = null;
    if (!pt || pt.id !== e.pointerId) return;
    if (pt.moved && pt.scroll) return;
    if (pt.moved && !pt.scroll && Math.hypot(pt.last.x - pt.start.x, pt.last.y - pt.start.y) > 24) return;
    const g = this.find(pt.start, 'tap');
    if (g && g.onTap) {
      if (this.onTapSound) this.onTapSound();
      g.onTap(pt.start);
    }
  }
}
