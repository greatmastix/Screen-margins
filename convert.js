/* Screen margins: conversion core.
 * Every PiP is held as a box in frame fractions {l, t, w, h} (left/top edge, width/height; 0..1, y down).
 * A profile describes how one device or document writes that box as numbers. */
(function (root) {
  'use strict';

  const POINTS = { tl: [0, 0], tc: [.5, 0], tr: [1, 0], ml: [0, .5], c: [.5, .5], mr: [1, .5], bl: [0, 1], bc: [.5, 1], br: [1, 1] };
  const POINT_NAMES = { tl: 'top-left', tc: 'top-centre', tr: 'top-right', ml: 'middle-left', c: 'centre', mr: 'middle-right', bl: 'bottom-left', bc: 'bottom-centre', br: 'bottom-right' };
  const UNIT_SPAN = { pct: 100, norm: 1 };

  function defaultProfile(over) {
    return Object.assign({
      name: '',
      W: 1920, H: 1080,
      unit: 'px',              // px | pct | norm | custom
      origin: 'tl',            // one of POINTS (px/pct/norm only)
      yUp: false,
      range: { left: -16, right: 16, top: 9, bottom: -9 }, // custom: value at each frame edge
      pos: 'anchor',           // anchor | edges | insets | corners | rel (relative to another PiP's box)
      anchor: 'tl',            // which point of the PiP the position names
      edgeX: 'left', edgeY: 'top', // edges mode: which frame edge distances are measured from
      relFrom: 'tl', relTo: 'tl', // rel mode: point on the reference PiP, point on this PiP
      size: 'axis',            // axis (same units as positions) | scale (1 = full frame) | scalePct (100 = full frame)
      uniform: false,          // one size value, height follows the content aspect
      aspectW: 16, aspectH: 9, // content aspect for uniform size
      decimals: 0,
      preset: '',              // id of the built-in preset this came from, if any
      labels: {},              // device field names by key (e.g. {x: 'H Pos'}); defaults otherwise
    }, over || {});
  }

  /* Values at the left/right and top/bottom frame edges. */
  function axes(p) {
    if (p.unit === 'custom') {
      const r = p.range;
      return { x0: +r.left, x1: +r.right, y0: +r.top, y1: +r.bottom };
    }
    const sx = p.unit === 'px' ? +p.W : UNIT_SPAN[p.unit];
    const sy = p.unit === 'px' ? +p.H : UNIT_SPAN[p.unit];
    const [ox, oy] = POINTS[p.origin] || POINTS.tl;
    const s = p.yUp ? -1 : 1;
    return { x0: -ox * sx, x1: (1 - ox) * sx, y0: -oy * sy * s, y1: (1 - oy) * sy * s };
  }

  function spans(p) {
    const a = axes(p);
    return { sx: Math.abs(a.x1 - a.x0), sy: Math.abs(a.y1 - a.y0) };
  }

  /* Height fraction for a width fraction when the PiP keeps the content aspect. */
  function uniformH(p, fw) {
    const content = (+p.aspectW || 16) / (+p.aspectH || 9);
    return fw * (+p.W / +p.H) / content;
  }

  function hasSize(p) { return p.pos === 'anchor' || p.pos === 'edges' || p.pos === 'rel'; }

  /* Ordered input fields for a profile: [{key, label, hint}] */
  function fields(p) {
    const f = [];
    const an = POINT_NAMES[p.anchor] || '';
    if (p.pos === 'anchor') {
      f.push({ key: 'x', label: 'X', hint: 'X of the PiP ' + an }, { key: 'y', label: 'Y', hint: 'Y of the PiP ' + an });
    } else if (p.pos === 'edges') {
      f.push({ key: 'dx', label: 'From ' + p.edgeX, hint: 'Distance from the frame ' + p.edgeX + ' edge to the PiP' },
             { key: 'dy', label: 'From ' + p.edgeY, hint: 'Distance from the frame ' + p.edgeY + ' edge to the PiP' });
    } else if (p.pos === 'rel') {
      const from = 'from the reference PiP’s ' + POINT_NAMES[p.relFrom] + ' to this PiP’s ' + POINT_NAMES[p.relTo];
      f.push({ key: 'rx', label: 'ΔX', hint: 'Horizontal offset ' + from }, { key: 'ry', label: 'ΔY', hint: 'Vertical offset ' + from });
    } else if (p.pos === 'insets') {
      f.push({ key: 'il', label: 'Left', hint: 'Frame left edge to PiP left edge' }, { key: 'it', label: 'Top', hint: 'Frame top edge to PiP top edge' },
             { key: 'ir', label: 'Right', hint: 'PiP right edge to frame right edge' }, { key: 'ib', label: 'Bottom', hint: 'PiP bottom edge to frame bottom edge' });
    } else if (p.pos === 'corners') {
      f.push({ key: 'x1', label: 'X1', hint: 'Left edge' }, { key: 'y1', label: 'Y1', hint: 'Top edge' },
             { key: 'x2', label: 'X2', hint: 'Right edge' }, { key: 'y2', label: 'Y2', hint: 'Bottom edge' });
    }
    if (hasSize(p)) {
      const sl = p.size === 'axis' ? '' : ' (scale)';
      if (p.uniform) f.push({ key: 's', label: 'Size' + sl, hint: 'Width; height follows ' + p.aspectW + ':' + p.aspectH });
      else f.push({ key: 'w', label: 'W' + sl, hint: 'Width' }, { key: 'h', label: 'H' + sl, hint: 'Height' });
    }
    const L = p.labels || {};
    return f.map(x => L[x.key] ? Object.assign({}, x, { label: L[x.key] }) : x);
  }

  function sizeToFrac(p, v, span) {
    if (p.size === 'scale') return v;
    if (p.size === 'scalePct') return v / 100;
    return v / span;
  }
  function fracToSize(p, f, span) {
    if (p.size === 'scale') return f;
    if (p.size === 'scalePct') return f * 100;
    return f * span;
  }

  const FRAME = { l: 0, t: 0, w: 1, h: 1 };

  /* Numbers in a profile -> box. Returns null if a needed value is missing.
     ref: the reference PiP's box, needed (and only used) when p.pos is 'rel'. */
  function toBox(p, vals, ref) {
    if (p.pos === 'rel' && !ref) return null;
    const keys = fields(p).map(f => f.key);
    const v = {};
    for (const k of keys) {
      const n = parseNum(vals[k]);
      if (n === null) return null;
      v[k] = n;
    }
    const a = axes(p), { sx, sy } = spans(p);
    const fx = val => (val - a.x0) / (a.x1 - a.x0);   // coordinate -> fraction from left
    const fy = val => (val - a.y0) / (a.y1 - a.y0);   // coordinate -> fraction from top
    let w, h;
    if (hasSize(p)) {
      if (p.uniform) { w = sizeToFrac(p, v.s, sx); h = uniformH(p, w); }
      else { w = sizeToFrac(p, v.w, sx); h = sizeToFrac(p, v.h, sy); }
    }
    if (p.pos === 'anchor') {
      const [ax, ay] = POINTS[p.anchor] || POINTS.tl;
      return { l: fx(v.x) - ax * w, t: fy(v.y) - ay * h, w, h };
    }
    if (p.pos === 'rel') {
      // offsets run from the reference point to this PiP's point, in the profile's units and directions
      const [fx, fy] = POINTS[p.relFrom] || POINTS.tl, [tx, ty] = POINTS[p.relTo] || POINTS.tl;
      const px = ref.l + fx * ref.w + v.rx / (a.x1 - a.x0), py = ref.t + fy * ref.h + v.ry / (a.y1 - a.y0);
      return { l: px - tx * w, t: py - ty * h, w, h };
    }
    if (p.pos === 'edges') {
      const l = p.edgeX === 'right' ? 1 - w - v.dx / sx : v.dx / sx;
      const t = p.edgeY === 'bottom' ? 1 - h - v.dy / sy : v.dy / sy;
      return { l, t, w, h };
    }
    if (p.pos === 'insets') {
      const l = v.il / sx, t = v.it / sy;
      return { l, t, w: 1 - l - v.ir / sx, h: 1 - t - v.ib / sy };
    }
    // corners: either corner may come first, so sort by edge
    const xa = fx(v.x1), xb = fx(v.x2), ya = fy(v.y1), yb = fy(v.y2);
    return { l: Math.min(xa, xb), t: Math.min(ya, yb), w: Math.abs(xb - xa), h: Math.abs(yb - ya) };
  }

  /* Box -> numbers in a profile (unrounded). ref as in toBox; a missing one counts as the whole frame. */
  function fromBox(p, b, ref) {
    const a = axes(p), { sx, sy } = spans(p);
    const cx = f => a.x0 + (a.x1 - a.x0) * f;
    const cy = f => a.y0 + (a.y1 - a.y0) * f;
    const out = {};
    if (p.pos === 'anchor') {
      const [ax, ay] = POINTS[p.anchor] || POINTS.tl;
      out.x = cx(b.l + ax * b.w); out.y = cy(b.t + ay * b.h);
    } else if (p.pos === 'rel') {
      const r = ref || FRAME;
      const [fx, fy] = POINTS[p.relFrom] || POINTS.tl, [tx, ty] = POINTS[p.relTo] || POINTS.tl;
      out.rx = (b.l + tx * b.w - r.l - fx * r.w) * (a.x1 - a.x0);
      out.ry = (b.t + ty * b.h - r.t - fy * r.h) * (a.y1 - a.y0);
    } else if (p.pos === 'edges') {
      out.dx = (p.edgeX === 'right' ? 1 - b.l - b.w : b.l) * sx;
      out.dy = (p.edgeY === 'bottom' ? 1 - b.t - b.h : b.t) * sy;
    } else if (p.pos === 'insets') {
      out.il = b.l * sx; out.it = b.t * sy; out.ir = (1 - b.l - b.w) * sx; out.ib = (1 - b.t - b.h) * sy;
    } else {
      out.x1 = cx(b.l); out.y1 = cy(b.t); out.x2 = cx(b.l + b.w); out.y2 = cy(b.t + b.h);
    }
    if (hasSize(p)) {
      if (p.uniform) out.s = fracToSize(p, b.w, sx);
      else { out.w = fracToSize(p, b.w, sx); out.h = fracToSize(p, b.h, sy); }
    }
    return out;
  }

  /* One size number <-> frame fraction along an axis ('x' = width, 'y' = height). */
  function sizeFrac(p, v, axis) { const s = spans(p); return sizeToFrac(p, v, axis === 'x' ? s.sx : s.sy); }
  function sizeVal(p, f, axis) { const s = spans(p); return fracToSize(p, f, axis === 'x' ? s.sx : s.sy); }
  /* Pixel aspect (width / height) of a box on a profile's canvas. */
  function boxAspect(p, b) { return (b.w * +p.W) / (b.h * +p.H); }

  /* Things worth flagging for a box written in a profile. */
  function warnings(p, b) {
    const w = [];
    const eps = 0.5 / Math.max(+p.W, +p.H);  // half a pixel of the profile canvas
    if (hasSize(p) && p.uniform && Math.abs(uniformH(p, b.w) - b.h) > eps)
      w.push('Aspect differs from ' + p.aspectW + ':' + p.aspectH + ', height will not match');
    if (b.w <= 0 || b.h <= 0) w.push('Zero or negative size');
    else if (b.l < -eps || b.t < -eps || b.l + b.w > 1 + eps || b.t + b.h > 1 + eps) w.push('Partly outside the frame');
    return w;
  }

  /* A plain number, as typed or pasted: spaces, a decimal comma and a trailing unit (px, %) are fine. */
  function parsePlain(s) {
    if (s === null || s === undefined) return null;
    if (typeof s === 'number') return isFinite(s) ? s : null;
    const t = String(s).trim().replace(/\s/g, '').replace(/[%a-z]+$/i, '').replace(',', '.');
    if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
    return parseFloat(t);
  }

  /* Arithmetic: + - * / (also × x ÷), brackets, unary minus, decimal comma. No eval(). */
  function evalExpr(str, info) {
    const s = String(str).replace(/\s/g, '').replace(/(px|%)$/i, '').replace(/,/g, '.').replace(/[×xX]/g, '*').replace(/÷/g, '/');
    let i = 0;
    const num = () => {
      const m = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(s.slice(i));
      if (!m) throw new Error('number expected');
      i += m[0].length; return parseFloat(m[0]);
    };
    const factor = () => {
      if (s[i] === '+') { i++; return factor(); }
      if (s[i] === '-') { i++; return -factor(); }
      if (s[i] === '(') { i++; const v = expr(); if (s[i] !== ')') throw new Error(') expected'); i++; return v; }
      return num();
    };
    const term = () => { let v = factor(); while (s[i] === '*' || s[i] === '/') { const o = s[i++], w = factor(); if (o === '/' && w === 0 && info) info.div0 = true; v = o === '*' ? v * w : v / w; } return v; };
    const expr = () => { let v = term(); while (s[i] === '+' || s[i] === '-') { const o = s[i++], w = term(); v = o === '+' ? v + w : v - w; } return v; };
    try {
      const v = expr();
      if (info) info.div0 = !!info.div0 && i === s.length;   // only for an otherwise complete sum
      return i === s.length && isFinite(v) ? v : null;
    } catch (e) { if (info) info.div0 = false; return null; }
  }
  /* A complete sum that divides by zero (the app has an opinion about those). */
  function divByZero(s) { const info = {}; evalExpr(s, info); return info.div0; }

  /* A number or a sum like 200+10 or (1920-640)/2. */
  function parseNum(s) {
    const n = parsePlain(s);
    if (n !== null || typeof s !== 'string' || !s.trim()) return n;
    return evalExpr(s);
  }

  function fmt(n, decimals) {
    const r = Number(n.toFixed(Math.max(0, Math.min(6, decimals | 0))));
    return Object.is(r, -0) ? '0' : String(r);
  }

  /* Grid of equally sized PiPs with outer margins and gaps, in canvas pixels of profile p. */
  function layout(p, o) {
    const n = Math.max(1, o.count | 0);
    const cols = Math.max(1, (o.cols | 0) || Math.ceil(Math.sqrt(n)));
    const rows = Math.ceil(n / cols);
    const W = +p.W, H = +p.H;
    const mx = +o.marginX || 0, my = +o.marginY || 0, gx = +o.gapX || 0, gy = +o.gapY || 0;
    const availW = W - 2 * mx - (cols - 1) * gx, availH = H - 2 * my - (rows - 1) * gy;
    if (availW <= 0 || availH <= 0) return [];
    const ar = (+o.aspectW || 16) / (+o.aspectH || 9);
    let bw = availW / cols, bh = availH / rows;
    if (ar > 0 && !o.stretch) { if (bw / bh > ar) bw = bh * ar; else bh = bw / ar; }
    const usedH = rows * bh + (rows - 1) * gy, y0 = my + (availH + (rows - 1) * gy - usedH) / 2;
    const boxes = [];
    for (let r = 0; r < rows; r++) {
      const inRow = Math.min(cols, n - r * cols);
      const usedW = inRow * bw + (inRow - 1) * gx;
      const x0 = mx + (W - 2 * mx - usedW) / 2;   // last row is centred if it is short
      for (let c = 0; c < inRow; c++)
        boxes.push({ l: (x0 + c * (bw + gx)) / W, t: (y0 + r * (bh + gy)) / H, w: bw / W, h: bh / H });
    }
    return boxes;
  }

  const api = { POINTS, POINT_NAMES, defaultProfile, axes, spans, fields, toBox, fromBox, warnings, parseNum, parsePlain, evalExpr, divByZero, fmt, layout, hasSize, sizeFrac, sizeVal, boxAspect };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SM = api;
})(this);
