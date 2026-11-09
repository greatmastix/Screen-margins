// Run: node test/convert.test.js
const assert = require('assert');
const SM = require('../convert.js');
const P = SM.defaultProfile;
const near = (a, b, msg, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} != ${b}`);
const convert = (src, vals, dst) => SM.fromBox(dst, SM.toBox(src, vals));
let n = 0; const t = (name, fn) => { fn(); n++; };

// The case from the brief: size in px, distance from bottom/right edge -> midpoint position.
const doc = P({ pos: 'edges', edgeX: 'right', edgeY: 'bottom' });
const mid = P({ anchor: 'c' });
t('edges -> centre px', () => {
  const r = convert(doc, { dx: 40, dy: 40, w: 640, h: 360 }, mid);
  near(r.x, 1560, 'x'); near(r.y, 860, 'y'); near(r.w, 640, 'w'); near(r.h, 360, 'h');
});
t('edges -> centre-origin custom range, y up, uniform scale', () => {
  const atemLike = P({ unit: 'custom', range: { left: -16, right: 16, top: 9, bottom: -9 }, anchor: 'c', size: 'scale', uniform: true });
  const r = convert(doc, { dx: 40, dy: 40, w: 640, h: 360 }, atemLike);
  near(r.x, 10, 'x'); near(r.y, -16 / 3, 'y'); near(r.s, 1 / 3, 's');
  assert.deepStrictEqual(SM.warnings(atemLike, SM.toBox(doc, { dx: 40, dy: 40, w: 640, h: 360 })), []);
});
t('percent, centre origin, y up', () => {
  const p = P({ unit: 'pct', origin: 'c', yUp: true, anchor: 'c' });
  const r = convert(doc, { dx: 40, dy: 40, w: 640, h: 360 }, p);
  near(r.x, 1560 / 1920 * 100 - 50, 'x'); near(r.y, 50 - 860 / 1080 * 100, 'y');
  near(r.w, 100 / 3, 'w'); near(r.h, 100 / 3, 'h');
});
t('4K doc -> HD switcher scales', () => {
  const r = convert(P({ W: 3840, H: 2160 }), { x: 100, y: 200, w: 1280, h: 720 }, P());
  near(r.x, 50, 'x'); near(r.y, 100, 'y'); near(r.w, 640, 'w'); near(r.h, 360, 'h');
});
t('insets and corners', () => {
  const b = SM.toBox(P(), { x: 100, y: 50, w: 800, h: 450 });
  const ins = SM.fromBox(P({ pos: 'insets' }), b);
  near(ins.il, 100, 'il'); near(ins.it, 50, 'it'); near(ins.ir, 1020, 'ir'); near(ins.ib, 580, 'ib');
  const cor = SM.fromBox(P({ pos: 'corners', unit: 'norm' }), b);
  near(cor.x2, 900 / 1920, 'x2'); near(cor.y2, 500 / 1080, 'y2');
  const back = SM.toBox(P({ pos: 'corners', unit: 'norm' }), { x1: cor.x2, y1: cor.y2, x2: cor.x1, y2: cor.y1 });
  near(back.l, b.l, 'swapped corners l'); near(back.w, b.w, 'swapped corners w');
});
t('uniform aspect mismatch is flagged', () => {
  const b = SM.toBox(P(), { x: 0, y: 0, w: 480, h: 360 }); // 4:3 box
  assert.strictEqual(SM.warnings(P({ uniform: true }), b).length, 1);
  assert.strictEqual(SM.warnings(P({ uniform: true, aspectW: 4, aspectH: 3 }), b).length, 0);
});
t('missing / bad numbers', () => {
  assert.strictEqual(SM.toBox(P(), { x: 1, y: 2, w: '', h: 4 }), null);
  assert.strictEqual(SM.parseNum('12,5 px'), 12.5);
  assert.strictEqual(SM.parseNum('-3%'), -3);
  assert.strictEqual(SM.parseNum('abc'), null);
  assert.strictEqual(SM.fmt(-0.0001, 2), '0');
});
t('round trip every profile shape', () => {
  const units = ['px', 'pct', 'norm', 'custom'], poss = ['anchor', 'edges', 'insets', 'corners'], sizes = ['axis', 'scale', 'scalePct'];
  const box = { l: 0.6, t: 0.55, w: 0.3, h: 0.3 * 16 / 9 * 9 / 16 * 1 }; // 16:9 content on 16:9 frame
  for (const unit of units) for (const pos of poss) for (const size of sizes) for (const origin of Object.keys(SM.POINTS))
    for (const yUp of [false, true]) for (const uniform of [false, true]) for (const anchor of ['tl', 'c', 'br']) {
      const p = P({ unit, pos, size, origin, yUp, uniform, anchor, edgeX: anchor === 'br' ? 'right' : 'left', edgeY: anchor === 'br' ? 'bottom' : 'top', W: 3840, H: 2160 });
      const back = SM.toBox(p, SM.fromBox(p, box));
      for (const k of ['l', 't', 'w', 'h']) near(back[k], box[k], `${JSON.stringify({ unit, pos, size, origin, yUp, uniform, anchor })} ${k}`, 1e-12);
    }
});
t('layout: 4 PiPs, 2x2, 40 margin, 20 gap', () => {
  const b = SM.layout(P(), { count: 4, cols: 2, marginX: 40, marginY: 40, gapX: 20, gapY: 20, aspectW: 16, aspectH: 9 });
  assert.strictEqual(b.length, 4);
  // height limits: (1080-80-20)/2 = 490 tall, 871.1 wide; centred horizontally
  near(b[0].h * 1080, 490, 'h', 1e-9); near(b[0].w * 1920, 490 * 16 / 9, 'w', 1e-9);
  near(b[0].t * 1080, 40, 'top margin', 1e-9);
  near(b[1].l * 1920 - (b[0].l + b[0].w) * 1920, 20, 'gap', 1e-9);
  near(b[0].l * 1920, 1920 - (b[1].l + b[1].w) * 1920, 'symmetric', 1e-9);
  const three = SM.layout(P(), { count: 3, cols: 2, marginX: 0, marginY: 0, gapX: 0, gapY: 0, aspectW: 16, aspectH: 9 });
  near(three[2].l + three[2].w / 2, 0.5, 'short last row centred');
});
t('size helpers', () => {
  const pct = P({ unit: 'pct' }), atem = P({ unit: 'custom', size: 'scale' });
  near(SM.sizeFrac(pct, 50, 'y'), 0.5, 'pct'); near(SM.sizeVal(P(), 0.5, 'y'), 540, 'px h');
  near(SM.sizeVal(atem, 0.25, 'x'), 0.25, 'scale'); near(SM.sizeVal(P({ unit: 'custom' }), 0.5, 'x'), 16, 'custom axis');
  near(SM.boxAspect(P(), { l: 0, t: 0, w: 1 / 3, h: 1 / 3 }), 16 / 9, 'aspect');
});
console.log(`ok, ${n} tests`);
