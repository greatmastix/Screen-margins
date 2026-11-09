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
t('relative to another PiP', () => {
  const ref = SM.toBox(P(), { x: 100, y: 100, w: 640, h: 360 });       // bottom-right at 740, 460
  const rel = P({ pos: 'rel', relFrom: 'br', relTo: 'tl' });
  const b = SM.toBox(rel, { rx: 20, ry: 20, w: 640, h: 360 }, ref);
  near(b.l * 1920, 760, 'l'); near(b.t * 1080, 480, 't'); near(b.w * 1920, 640, 'w');
  assert.strictEqual(SM.toBox(rel, { rx: 20, ry: 20, w: 640, h: 360 }), null, 'no ref -> null');
  const back = SM.fromBox(rel, b, ref); near(back.rx, 20, 'rx'); near(back.ry, 20, 'ry');
  // the other way round: PiP 1 hangs off PiP 2, offsets flip sign
  const inv = SM.fromBox(P({ pos: 'rel', relFrom: 'tl', relTo: 'br' }), ref, b);
  near(inv.rx, -20, 'inv rx'); near(inv.ry, -20, 'inv ry');
  // y up and percent: +ΔY moves up
  const up = P({ pos: 'rel', unit: 'pct', yUp: true, relFrom: 'tl', relTo: 'bl' });
  const u = SM.toBox(up, { rx: 0, ry: 10, w: 10, h: 10 }, ref);
  near(u.t + u.h, ref.t - 0.1, 'y up');
  assert.deepStrictEqual(SM.fields(rel).map(f => f.key), ['rx', 'ry', 'w', 'h']);
});
t('sums in number fields', () => {
  const e = SM.parseNum;
  assert.strictEqual(e('200+10'), 210); assert.strictEqual(e(' 1920 - 640 '), 1280);
  assert.strictEqual(e('(1920-640)/2'), 640); assert.strictEqual(e('2*3+4'), 10); assert.strictEqual(e('2+3*4'), 14);
  assert.strictEqual(e('-(10+5)'), -15); assert.strictEqual(e('1,5*2'), 3); assert.strictEqual(e('1920x0.5'), 960);
  assert.strictEqual(e('16÷2'), 8); assert.strictEqual(e('100+20px'), 120); assert.strictEqual(e('1e3+1'), 1001);
  for (const bad of ['200+', '(1+2', '1/0', 'abc', '2**3', 'alert(1)', '']) assert.strictEqual(e(bad), null, bad);
  assert.ok(SM.divByZero('200/0')); assert.ok(SM.divByZero('5/(2-2)')); assert.ok(!SM.divByZero('200/0+')); assert.ok(!SM.divByZero('200/2'));
  assert.strictEqual(SM.parsePlain('200+10'), null); assert.strictEqual(e('640'), 640); assert.strictEqual(e('50%'), 50);
});
t('pdf writer: valid structure', () => {
  const PDF = require('../pdf.js');
  assert.strictEqual(PDF.winAnsi('ΔX → 5 – “a” 🤡'), 'dX -> 5 \x96 \x93a\x94 ?');
  near(PDF.width('0000', 10), 22.24, 'digit widths');
  assert.deepStrictEqual(PDF.wrap('one two three', 10, PDF.width('one two', 10)), ['one two', 'three']);
  const doc = PDF.create(842, 595);
  doc.page().text(10, 10, 'Hi (there) \\ Δ').line(0, 0, 10, 10).rect(5, 5, 20, 20, { fill: '#ff0000' })
    .image(doc.addJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 1, 1), 0, 0, 10, 10);
  doc.page().text(10, 10, 'page 2', { bold: true, align: 'right' });
  const b = Buffer.from(doc.bytes()), txt = b.toString('latin1');
  assert.ok(txt.startsWith('%PDF-1.4') && txt.trimEnd().endsWith('%%EOF'));
  const xref = +/startxref\n(\d+)/.exec(txt)[1];
  assert.ok(txt.startsWith('xref', xref), 'startxref points at xref');
  const offs = txt.slice(xref).split('\n').slice(3).filter(l => / n $/.test(l)).map(l => parseInt(l, 10));
  offs.forEach((o, i) => assert.ok(txt.startsWith(`${i + 1} 0 obj`, o), `object ${i + 1} offset`));
  assert.ok(txt.includes('(Hi \\(there\\) \\\\ d) Tj') && txt.includes('/Count 2'));
});
console.log(`ok, ${n} tests`);
