/* Screen margins: UI. Maths lives in convert.js (window.SM). */
(function () {
  'use strict';
  const KEY = 'screen-margins:v1';
  const COLORS = ['#e66767', '#3987e5', '#3fbf4f', '#fab219', '#b277e6', '#2fc4c4', '#ec835a', '#d36fb0'];
  const UNITS = [['px', 'Pixels'], ['pct', 'Percent (0–100)'], ['norm', 'Normalised (0–1)'], ['custom', 'Custom range']];
  const POS = [['anchor', 'A point of the PiP (X / Y)'], ['edges', 'Distance from frame edges'], ['insets', 'All four edges (insets)'], ['corners', 'Corner coordinates (X1 Y1 X2 Y2)']];
  const SIZES = [['axis', 'Same units as position'], ['scale', 'Scale, 1 = full frame'], ['scalePct', 'Scale %, 100 = full frame']];
  const PTS = Object.entries(SM.POINT_NAMES).map(([k, v]) => [k, v[0].toUpperCase() + v.slice(1)]);
  const UNIT_SUFFIX = { px: 'px', pct: '%', norm: '', custom: '' };

  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const color = i => COLORS[i % COLORS.length];
  const keys = p => SM.fields(p).map(f => f.key).join(',');
  const fmtVals = (p, v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SM.fmt(x, p.decimals)]));
  const short = n => SM.fmt(n, Math.abs(n) >= 100 ? 1 : 4);

  /* Per-PiP position format on the source side. '' = the source profile's default. */
  const MODES = [
    ['Point of the PiP (X / Y)', Object.keys(SM.POINTS).map(k => ['anchor:' + k, SM.POINT_NAMES[k][0].toUpperCase() + SM.POINT_NAMES[k].slice(1)])],
    ['Distance from frame edges', [['edges:left:top', 'From left + top'], ['edges:right:top', 'From right + top'], ['edges:left:bottom', 'From left + bottom'], ['edges:right:bottom', 'From right + bottom']]],
    ['Edges', [['insets', 'Insets (L T R B)'], ['corners', 'Corners (X1 Y1 X2 Y2)']]],
  ];
  function modeOv(m) {
    if (!m) return {};
    const [pos, a, b] = m.split(':');
    if (pos === 'anchor') return { pos, anchor: a };
    if (pos === 'edges') return { pos, edgeX: a, edgeY: b };
    if (pos === 'rel') return { pos, relRef: +a, relFrom: b || 'tl', relTo: m.split(':')[3] || 'tl' };
    return { pos };
  }
  /* Relative rows: mode 'rel:<ref id>:<point on ref>:<point on this PiP>'. */
  const relOf = p => { const m = modeOv(p.mode); return m.pos === 'rel' ? m : null; };
  const pipById = id => S.pips.find(q => q.id === id);
  const refPip = p => { const m = relOf(p); return m ? pipById(m.relRef) || null : null; };
  /* Reference box for a relative row (undefined for other rows, null if the reference has no box). */
  function refBox(p) {
    if (!relOf(p)) return undefined;
    const r = refPip(p);
    return r && validBox(r.box) ? r.box : null;
  }
  const pipName = q => q.name || 'PiP ' + (S.pips.indexOf(q) + 1);
  /* Does q hang off p, directly or through other rows? */
  function dependsOn(q, p) {
    for (let r = q, n = 0; r && n <= S.pips.length; r = refPip(r), n++) if (r === p) return true;
    return false;
  }
  /* Recompute every box, references first. Rows in a loop (only possible from a hand-edited save) get no box. */
  function resolveAll() {
    const done = new Set(), busy = new Set();
    const visit = p => {
      if (done.has(p)) return;
      if (busy.has(p)) { p.box = null; return; }
      busy.add(p);
      const r = refPip(p); if (r) visit(r);
      const rb = refBox(p);
      if (p.same && rb) { const sp = srcFor(p); p.vals.w = SM.fmt(SM.sizeVal(sp, rb.w, 'x'), sp.decimals); p.vals.h = SM.fmt(SM.sizeVal(sp, rb.h, 'y'), sp.decimals); }
      p.box = SM.toBox(srcFor(p), p.vals, rb);
      busy.delete(p); done.add(p);
    };
    S.pips.forEach(visit);
  }
  /* Rewrite a row's numbers from its current box in its (new) format, so it stays where it is. */
  function revalue(p) { const sp = srcFor(p); p.vals = validBox(p.box) ? fmtVals(sp, SM.fromBox(sp, p.box, refBox(p))) : {}; }
  /* Turn a relative row into an absolute one at the same place. */
  function detach(p) { p.mode = ''; p.same = false; revalue(p); }
  function modeName(p) {
    if (p.pos === 'anchor') return SM.POINT_NAMES[p.anchor];
    if (p.pos === 'edges') return `from ${p.edgeX} + ${p.edgeY}`;
    return p.pos === 'insets' ? 'insets' : 'corners';
  }
  const withMode = (prof, p) => Object.assign({}, prof, modeOv(p.mode), { uniform: false });
  const srcBase = () => Object.assign({}, S.src, { uniform: false });
  const DEF_ASPECT = 16 / 9;
  function ratioText(a) {
    if (!(a > 0) || !isFinite(a)) return '';
    for (let q = 1; q <= 20; q++) { const n = Math.round(a * q); if (n > 0 && Math.abs(n / q - a) < 0.0015) return n + ':' + q; }
    return SM.fmt(a, 3) + ':1';
  }
  const validBox = b => b && b.w > 0 && b.h > 0;
  /* Locked PiP: the size field just typed decides the other one. */
  function applyLock(p, key) {
    const sp = srcFor(p);
    if (!p.lock || !SM.hasSize(sp) || (key !== 'w' && key !== 'h')) return;
    const v = SM.parseNum(p.vals[key]); if (v === null) return;
    const r = +sp.W / +sp.H;
    if (key === 'w') p.vals.h = SM.fmt(SM.sizeVal(sp, SM.sizeFrac(sp, v, 'x') * r / p.aspect, 'y'), sp.decimals);
    else p.vals.w = SM.fmt(SM.sizeVal(sp, SM.sizeFrac(sp, v, 'y') * p.aspect / r, 'x'), sp.decimals);
  }
  const srcFor = p => withMode(S.src, p);

  /* ---------- state ---------- */
  let S;
  /* Take a loaded, shared or undone state: fill in defaults and recompute every box. */
  function adopt(s) {
    s.src = SM.defaultProfile(s.src); s.dst = SM.defaultProfile(s.dst); s.saved = s.saved || {};
    s.pips.forEach(p => { p.vals = p.vals || {}; });
    S = s;
    S.nextId = Math.max(S.nextId || 1, ...S.pips.map(p => (p.id || 0) + 1));
    S.pips.forEach(p => { p.mode = p.mode || ''; if (!p.id) p.id = S.nextId++; });
    S.pips.forEach(p => {
      if (relOf(p)) return;
      // older saves may hold a single size value: read them with the profile as saved, then rewrite as W/H
      const asSaved = Object.assign({}, S.src, modeOv(p.mode));
      p.box = SM.toBox(asSaved, p.vals);
      reformat(p, asSaved, srcFor(p));
    });
    resolveAll();
    S.pips.forEach(p => {
      if (p.lock === undefined) p.lock = true;
      if (!(p.aspect > 0)) p.aspect = validBox(p.box) ? SM.boxAspect(S.src, p.box) : DEF_ASPECT;
    });
  }
  adopt(load() || initial());
  let sel = 0;

  function initial() {
    const src = SM.defaultProfile();                  // top-left X / Y
    const dst = SM.defaultProfile({ anchor: 'c' });
    const vals = { x: '1240', y: '680', w: '640', h: '360' };
    return { src, dst, pips: [{ id: 1, name: 'PiP 1', vals, lock: true, aspect: DEF_ASPECT }], saved: {}, nextId: 2 };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.src && s.dst && Array.isArray(s.pips)) return s;
    } catch (e) { /* storage unavailable or corrupt: start fresh */ }
    return null;
  }
  let saveT;
  function persist(str) { try { localStorage.setItem(KEY, str); } catch (e) { /* private mode */ } }
  function saveNow() { clearTimeout(saveT); saveT = null; const str = JSON.stringify(S); record(str); persist(str); }
  function save() { clearTimeout(saveT); saveT = setTimeout(saveNow, 200); }
  /* ---------- undo / redo ----------
     Every save is a step (saves are debounced, so a burst of typing or one drag is one step). The background image isn't part of it. */
  const hist = { list: [JSON.stringify(S)], at: 0 };
  function record(str) {
    if (hist.list[hist.at] === str) return;
    hist.list.length = hist.at + 1; hist.list.push(str);
    if (hist.list.length > 200) hist.list.shift();
    hist.at = hist.list.length - 1;
    undoState();
  }
  function undoState() {
    const u = $('#undo'), r = $('#redo'); if (!u) return;
    u.disabled = hist.at <= 0; r.disabled = hist.at >= hist.list.length - 1;
  }
  /* Replace the whole state and redraw, keeping the focus on the same field if it still exists. */
  function replaceState(next, from) {
    const a = document.activeElement, tr = a && a.closest && a.closest('tr[data-i]'), prof = a && a.closest && a.closest('#prof-src, #prof-dst');
    const again = tr && a.dataset.c ? `#tbl tr[data-i="${tr.dataset.i}"] [data-c="${a.dataset.c}"]` : prof && a.dataset.k ? `#${prof.id} [data-k="${a.dataset.k}"]` : null;
    adopt(next);
    if (sel >= S.pips.length) sel = Math.max(0, S.pips.length - 1);
    renderProfile('src'); renderProfile('dst'); renderTable(); renderPreview();
    if (again) { const el = $(again); if (el) el.focus(); } else if (from) from.focus();
  }
  function step(dir) {
    if (saveT) saveNow();
    const j = hist.at + dir; if (j < 0 || j >= hist.list.length) return false;
    hist.at = j;
    replaceState(JSON.parse(hist.list[j]));
    const str = JSON.stringify(S); hist.list[j] = str; persist(str);
    undoState();
    return true;
  }
  // don't lose the last edit when the tab is closed or reloaded within the debounce
  addEventListener('pagehide', () => { if (saveT) saveNow(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && saveT) saveNow(); });

  function toast(msg, ms) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), ms || 1400);
  }
  function copy(text, msg) {
    const done = () => toast(msg || 'Copied');
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    function fallback() {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed'); }
      ta.remove();
    }
  }

  /* ---------- profile forms ---------- */
  const opts = (list, v) => list.map(([k, l]) => `<option value="${k}"${String(k) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const sel1 = (k, label, list, v) => `<div class="field"><label>${label}</label><select data-k="${k}">${opts(list, v)}</select></div>`;
  const num = (k, label, v, unit) => `<div class="field"><label>${label}</label><div class="unit"><input type="text" inputmode="decimal" data-num data-k="${k}" value="${esc(v)}">${unit ? `<span>${unit}</span>` : ''}</div></div>`;
  const chk = (k, label, v) => `<div class="field"><span class="lbl">&nbsp;</span><label class="chk"><input type="checkbox" data-k="${k}"${v ? ' checked' : ''}> ${label}</label></div>`;
  const PRESETS = window.SM_PRESETS || [];
  const presetById = id => PRESETS.find(x => x.id === id);
  // a preset sets conventions, not the show's resolution: keep the current canvas
  const presetProfile = (pre, cur) => SM.defaultProfile(Object.assign(clone(pre.p), { W: cur.W, H: cur.H, preset: pre.id }));
  const sameProfile = (a, b) => JSON.stringify(Object.assign({}, a, { name: '' })) === JSON.stringify(Object.assign({}, b, { name: '' }));

  function savedHTML(which) {
    const p = S[which], names = Object.keys(S.saved).sort((a, b) => a.localeCompare(b));
    const has = p.name && S.saved[p.name];
    const mod = has && !sameProfile(p, S.saved[p.name]);
    const pre = !has && presetById(p.preset);
    const preMod = pre && !sameProfile(p, presetProfile(pre, p));
    const presetOpts = PRESETS.map(x => `<option value="preset:${x.id}"${pre && x.id === pre.id ? ' selected' : ''}>${esc(x.label)}${pre && x.id === pre.id && preMod ? ' (modified)' : ''}</option>`).join('');
    const savedOpts = names.map(n => `<option value="${esc(n)}"${n === p.name ? ' selected' : ''}>${esc(n)}${n === p.name && mod ? ' (modified)' : ''}</option>`).join('');
    const note = presetById(p.preset);
    return `<div class="saved"><select data-act="load" aria-label="Profile"><option value="">— custom —</option>`
      + `<optgroup label="Switcher presets">${presetOpts}</optgroup>${names.length ? `<optgroup label="Your profiles">${savedOpts}</optgroup>` : ''}</select>`
      + `<button class="btn sm" data-act="save" type="button">${mod ? 'Update' : 'Save as…'}</button>${has ? '<button class="btn sm" data-act="del" type="button">Delete</button>' : ''}</div>`
      + (note ? `<p class="hint presetnote">${pre && !preMod ? '' : `Based on ${esc(note.label)}. `}${esc(note.note)}</p>` : '');
  }

  function axesHTML(p) {
    const a = SM.axes(p);
    return `<b>X</b> ${short(a.x0)} at left → ${short(a.x1)} at right · <b>Y</b> ${short(a.y0)} at top → ${short(a.y1)} at bottom`;
  }

  function profileHTML(which) {
    const p = S[which], u = UNIT_SUFFIX[p.unit];
    let h = `<div class="row one"><div class="field"><label>Preset or saved profile</label><div data-slot="saved">${savedHTML(which)}</div></div></div>`;
    h += `<h3>Frame and units</h3><div class="row">${num('W', 'Canvas width', p.W, 'px')}${num('H', 'Canvas height', p.H, 'px')}</div>`;
    h += `<div class="row">${sel1('unit', 'Numbers are in', UNITS, p.unit)}${num('decimals', 'Decimals', p.decimals)}</div>`;
    if (p.unit === 'custom') {
      h += `<div class="row four">${num('range.left', 'Left edge', p.range.left)}${num('range.right', 'Right edge', p.range.right)}${num('range.top', 'Top edge', p.range.top)}${num('range.bottom', 'Bottom edge', p.range.bottom)}</div>`;
    } else {
      h += `<div class="row">${sel1('origin', '0,0 is at the frame’s', PTS, p.origin)}${chk('yUp', 'Y counts upwards', p.yUp)}</div>`;
    }
    h += `<div class="axes" data-slot="axes">${axesHTML(p)}</div>`;
    h += `<h3>PiP position${which === 'src' ? ' <span class="muted" style="font-weight:500">· default, each PiP can override it</span>' : ''}</h3><div class="row one">${sel1('pos', 'Numbers give', POS, p.pos)}</div>`;
    if (p.pos === 'anchor') h += `<div class="row">${sel1('anchor', 'Point of the PiP', PTS, p.anchor)}<div></div></div>`;
    if (p.pos === 'edges') h += `<div class="row">${sel1('edgeX', 'Horizontal distance from', [['left', 'Left edge'], ['right', 'Right edge']], p.edgeX)}${sel1('edgeY', 'Vertical distance from', [['top', 'Top edge'], ['bottom', 'Bottom edge']], p.edgeY)}</div>`;
    if (p.pos === 'insets') h += `<p class="hint">Distance from each frame edge to the matching PiP edge, in ${p.unit === 'custom' ? 'range units' : (u || 'units')}. Size follows from them.</p>`;
    if (p.pos === 'corners') h += `<p class="hint">Coordinates of the PiP’s left/top and right/bottom edges. Size follows from them.</p>`;
    if (which === 'src') {
      h += `<h3>PiP size</h3><div class="row">${sel1('size', 'Size is', SIZES, p.size)}<div></div></div><p class="hint">Width and height are both shown; lock the aspect per PiP in the table.</p>`;
    } else if (SM.hasSize(p)) {
      h += `<h3>PiP size</h3><div class="row">${sel1('size', 'Size is', SIZES, p.size)}${chk('uniform', 'One value (keeps aspect)', p.uniform)}</div>`;
      if (p.uniform) h += `<div class="row"><div class="field"><label>Content aspect</label><div class="ratio"><input type="text" inputmode="decimal" data-num data-k="aspectW" value="${esc(p.aspectW)}" aria-label="Aspect width"><span>:</span><input type="text" inputmode="decimal" data-num data-k="aspectH" value="${esc(p.aspectH)}" aria-label="Aspect height"></div></div><div></div></div>`;
    }
    if (which === 'src') h += `<p class="hint" style="margin-top:10px">Changing these reinterprets the numbers you typed. To move PiPs over to another system, set it as the target or use Swap.</p>`;
    return h;
  }

  function renderProfile(which) {
    const el = $(which === 'src' ? '#prof-src' : '#prof-dst');
    const f = document.activeElement && el.contains(document.activeElement) ? document.activeElement.dataset.k : null;
    el.innerHTML = profileHTML(which);
    if (f) { const n = el.querySelector(`[data-k="${f}"]`); if (n) n.focus(); }
  }

  function setK(p, k, el) {
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if ('num' in el.dataset) {
      v = SM.parseNum(el.value);
      const bad = v === null || ((k === 'W' || k === 'H' || k === 'aspectW' || k === 'aspectH') && v <= 0)
        || (k === 'decimals' && (v < 0 || v > 6)) || (k.startsWith('range.') && rangeCollapses(p, k, v));
      el.classList.toggle('bad', bad);
      if (bad) return false;
      if (k === 'decimals') v = Math.round(v);
    } else v = el.value;
    if (k.startsWith('range.')) p.range[k.slice(6)] = v; else p[k] = v;
    return true;
  }
  function rangeCollapses(p, k, v) {
    const r = Object.assign({}, p.range, { [k.slice(6)]: v });
    return +r.left === +r.right || +r.top === +r.bottom;
  }

  /* A PiP's source format changed from oldProf to newProf: same fields -> reinterpret the typed numbers, else recompute them. */
  function reformat(p, oldProf, newProf) {
    if (keys(oldProf) !== keys(newProf)) p.vals = p.box ? fmtVals(newProf, SM.fromBox(newProf, p.box, refBox(p))) : {};
    p.box = SM.toBox(newProf, p.vals, refBox(p));
  }

  function profileChanged(which, old, structural) {
    if (which === 'src') { S.pips.forEach(p => reformat(p, withMode(old, p), srcFor(p))); resolveAll(); }
    if (structural) renderProfile(which);
    else {
      const el = $(which === 'src' ? '#prof-src' : '#prof-dst');
      el.querySelector('[data-slot=axes]').innerHTML = axesHTML(S[which]);
      el.querySelector('[data-slot=saved]').innerHTML = savedHTML(which);
    }
    renderTable(); renderPreview(); save();
  }

  function bindProfile(which) {
    const el = $(which === 'src' ? '#prof-src' : '#prof-dst');
    el.addEventListener('input', e => {
      const t = e.target;
      if (!('num' in t.dataset) || !t.dataset.k) return;
      const old = clone(S[which]);
      if (setK(S[which], t.dataset.k, t)) profileChanged(which, old, false);
    });
    el.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.act === 'load') {
        const old = clone(S[which]);
        if (t.value.startsWith('preset:')) S[which] = presetProfile(presetById(t.value.slice(7)), S[which]);
        else if (t.value) S[which] = SM.defaultProfile(clone(S.saved[t.value]));
        else { S[which].name = ''; S[which].preset = ''; S[which].labels = {}; }
        profileChanged(which, old, true);
        return;
      }
      if (!t.dataset.k || 'num' in t.dataset) return;
      const old = clone(S[which]);
      setK(S[which], t.dataset.k, t);
      profileChanged(which, old, true);
    });
    el.addEventListener('click', e => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const p = S[which];
      if (b.dataset.act === 'save') {
        const update = p.name && S.saved[p.name] && !sameProfile(p, S.saved[p.name]);
        let name = update ? p.name : prompt('Name for this profile', p.name || (presetById(p.preset) || {}).label || (which === 'src' ? 'Documentation' : 'Switcher'));
        if (!name || !(name = name.trim())) return;
        if (S.saved[name] && name !== p.name && !confirm(`Replace the saved profile “${name}”?`)) return;
        p.name = name; S.saved[name] = clone(p);
        toast(`Saved “${name}”`);
      } else if (b.dataset.act === 'del') {
        if (!confirm(`Delete the saved profile “${p.name}”? Your current settings stay.`)) return;
        delete S.saved[p.name]; p.name = '';
      }
      renderProfile('src'); renderProfile('dst'); save();
    });
  }

  /* ---------- PiP table ---------- */
  function renderTable() {
    const df = SM.fields(S.dst);
    const tbl = $('#tbl');
    const nsrc = Math.max(...S.pips.map(p => SM.fields(srcFor(p)).length), 1);
    $('#pipcount').textContent = S.pips.length ? `${S.pips.length} PiP${S.pips.length === 1 ? '' : 's'}` : '';
    const aspS = S.src.W / S.src.H, aspD = S.dst.W / S.dst.H;
    $('#banner').innerHTML = Math.abs(aspS - aspD) > 1e-3
      ? `<div class="banner"><b>!</b><span>Source canvas ${S.src.W}×${S.src.H} and target canvas ${S.dst.W}×${S.dst.H} have different aspect ratios. Positions are scaled per axis, so PiPs change shape. Check that both canvases are right.</span></div>` : '';
    if (!S.pips.length) { tbl.innerHTML = `<tbody><tr><td class="empty">No PiPs yet. Add one, paste a table, or use the layout generator.</td></tr></tbody>`; return; }
    const def = `Default (${modeName(S.src)})`;
    const modeSel = p => {
      const rel = relOf(p), cur = rel ? 'rel:' + rel.relRef : p.mode;
      // a row can hang off any other row that doesn't already hang off it
      const refs = S.pips.filter(q => q !== p && !dependsOn(q, p)).map(q => ['rel:' + q.id, 'Relative to ' + pipName(q)]);
      const groups = refs.length ? MODES.concat([['Relative to another PiP', refs]]) : MODES;
      let h = `<select class="mode" data-m aria-label="Position given as"><option value="">${esc(def)}</option>${groups.map(([g, list]) =>
        `<optgroup label="${g}">${list.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('')}</select>`;
      if (rel) {
        const r = refPip(p), rn = r ? pipName(r) : 'reference';
        const pt = (attr, v, lab) => `<select class="pt" ${attr} aria-label="${esc(lab)}" title="${esc(lab)}">${opts(PTS, v)}</select>`;
        h += `<div class="relpts">${pt('data-rf', rel.relFrom, `Point on ${rn}`)}<span>→</span>${pt('data-rt', rel.relTo, 'Point on this PiP')}</div>`
          + `<label class="chk same"><input type="checkbox" data-same${p.same ? ' checked' : ''}> Same size as ${esc(rn)}</label>`;
      }
      return h;
    };
    let h = `<thead><tr><th colspan="2"></th><th class="grp" colspan="${nsrc + 1}">Source${S.src.name ? ' · ' + esc(S.src.name) : ''}</th><th></th>`
      + `<th class="grp" colspan="${df.length}">Target${S.dst.name ? ' · ' + esc(S.dst.name) : ''}</th><th colspan="2"></th></tr>`
      + `<tr><th>#</th><th>Name</th><th>Position given as</th><th colspan="${nsrc}">Values</th><th></th>`
      + `${df.map(f => `<th title="${esc(f.hint)}">${esc(f.label)}</th>`).join('')}<th></th><th></th></tr></thead><tbody>`;
    S.pips.forEach((p, i) => {
      h += `<tr data-i="${i}"${i === sel ? ' class="sel"' : ''}><td class="idx"><span class="dot" style="background:${color(i)}"></span>${i + 1}</td>`
        + `<td><input type="text" class="name" data-c="name" value="${esc(p.name)}" aria-label="Name"></td>`
        + `<td>${modeSel(p)}</td>`
        + srcCells(p, nsrc)
        + `<td class="sep">→</td>` + df.map(f => `<td class="out" data-o="${f.key}" title="Click to copy"></td>`).join('')
        + `<td class="w"></td><td><button class="x" data-del type="button" title="Remove" aria-label="Remove">×</button></td></tr>`;
    });
    tbl.innerHTML = h + '</tbody>';
    S.pips.forEach((_, i) => updateRow(i));
  }

  function srcCells(p, n) {
    const f = SM.fields(srcFor(p));
    const ro = k => p.same && relOf(p) && (k === 'w' || k === 'h');
    const inp = x => `<input type="text" inputmode="decimal" data-c="${x.key}" value="${esc(p.vals[x.key] ?? '')}" title="${esc(ro(x.key) ? 'Follows the reference PiP' : x.hint)}" aria-label="${esc(x.label)}"${ro(x.key) ? ' readonly' : ''}>`;
    return f.map(x => x.key === 'h' && !ro('h')
      // the lock sits between W and H, at the front of the H cell (a div, so clicking the label doesn't toggle it)
      ? `<td><div class="cell"><span title="${esc(x.hint)}">${esc(x.label)}${p.lock ? ` <i class="lockratio">· ${esc(ratioText(p.aspect))}</i>` : ''}</span><div class="pair">${lockBtn(p)}${inp(x)}</div></div></td>`
      : `<td><label class="cell"><span title="${esc(x.hint)}">${esc(x.label)}</span>${inp(x)}</label></td>`).join('')
      + '<td></td>'.repeat(n - f.length);
  }
  const LOCK_ON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="3" y="7" width="10" height="7.5" rx="1.5"/><path d="M5.2 7V5a2.8 2.8 0 0 1 5.6 0v2"/></svg>';
  const LOCK_OFF = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="3" y="7" width="10" height="7.5" rx="1.5"/><path d="M5.2 7V5a2.8 2.8 0 0 1 5.4-1"/></svg>';
  function lockBtn(p) {
    const r = ratioText(p.aspect);
    return `<button type="button" class="lock" data-lock aria-pressed="${p.lock}" `
      + `title="${p.lock ? `Aspect locked at ${esc(r)}: changing W or H updates the other. Click to unlock.` : 'Aspect unlocked: W and H are independent. Click to lock at the current ratio.'}">${p.lock ? LOCK_ON : LOCK_OFF}</button>`;
  }

  function targetVals(p) { return p.box ? fmtVals(S.dst, SM.fromBox(S.dst, p.box)) : null; }

  function updateRow(i) {
    const tr = $(`#tbl tr[data-i="${i}"]`); if (!tr) return;
    const p = S.pips[i], out = targetVals(p);
    tr.querySelectorAll('td.out').forEach(td => { td.textContent = out ? out[td.dataset.o] : '—'; td.classList.toggle('na', !out); });
    tr.querySelectorAll('input[data-c]').forEach(inp => {
      if (inp.dataset.c === 'name') return;
      inp.classList.toggle('bad', inp.value.trim() !== '' && SM.parseNum(inp.value) === null);
    });
    const w = p.box ? SM.warnings(S.dst, p.box) : [];
    tr.querySelector('td.w').innerHTML = w.length ? `<span class="warnicon" title="${esc(w.join('\n'))}">!</span>` : '';
  }
  function updateAll(skip) {
    S.pips.forEach((_, j) => { updateRowInputs(j, skip); updateRow(j); });
  }
  function updateRowInputs(i, skip) {
    const tr = $(`#tbl tr[data-i="${i}"]`); if (!tr) return;
    tr.querySelectorAll('input[data-c]').forEach(inp => { if (inp.dataset.c !== 'name' && inp !== skip) inp.value = S.pips[i].vals[inp.dataset.c] ?? ''; });
  }
  function select(i) {
    if (i === sel) return;
    sel = i;
    document.querySelectorAll('#tbl tr[data-i]').forEach(tr => tr.classList.toggle('sel', +tr.dataset.i === sel));
    renderPreview();
  }
  function newPip() {
    const last = S.pips[S.pips.length - 1];
    const vals = last ? clone(last.vals) : {};
    const p = { id: S.nextId++, name: 'PiP ' + (S.pips.length + 1), mode: last ? last.mode : '', vals, lock: last ? last.lock : true, aspect: last ? last.aspect : DEF_ASPECT, same: !!(last && last.same) };
    // after a relative row, the new one hangs off that row the same way, so "Add" continues a row or column
    const rel = last && relOf(last);
    if (rel) p.mode = `rel:${last.id}:${rel.relFrom}:${rel.relTo}`;
    return p;
  }

  function bindTable() {
    const tbl = $('#tbl');
    tbl.addEventListener('input', e => {
      const t = e.target; if (!t.dataset.c) return;
      const i = +t.closest('tr').dataset.i, p = S.pips[i];
      if (t.dataset.c === 'name') p.name = t.value;
      else { p.vals[t.dataset.c] = t.value; applyLock(p, t.dataset.c); resolveAll(); updateAll(t); }
      updateRow(i); renderPreview(); save();
    });
    tbl.addEventListener('change', e => {
      const t = e.target, tr = t.closest('tr[data-i]'); if (!tr) return;
      const i = +tr.dataset.i, p = S.pips[i], rel = relOf(p);
      let focus;
      if (t.matches('select[data-m]')) {
        const old = srcFor(p);
        if (t.value.startsWith('rel:')) {
          // picking a reference keeps the PiP where it is: the offsets are worked out from its current box
          p.mode = `${t.value}:${rel ? rel.relFrom : 'tl'}:${rel ? rel.relTo : 'tl'}`;
          revalue(p);
        } else {
          p.mode = t.value;
          if (rel) { p.same = false; revalue(p); } else reformat(p, old, srcFor(p));
        }
        focus = 'select[data-m]';
      } else if (rel && (t.matches('[data-rf]') || t.matches('[data-rt]'))) {
        p.mode = `rel:${rel.relRef}:${t.matches('[data-rf]') ? t.value : rel.relFrom}:${t.matches('[data-rt]') ? t.value : rel.relTo}`;
        revalue(p);
        focus = t.matches('[data-rf]') ? '[data-rf]' : '[data-rt]';
      } else if (t.matches('[data-same]')) {
        p.same = t.checked;
        focus = '[data-same]';
      } else return;
      resolveAll();
      if (p.lock && validBox(p.box)) p.aspect = SM.boxAspect(S.src, p.box);
      renderTable(); renderPreview(); save();
      const s = $(`#tbl tr[data-i="${i}"] ${focus}`); if (s) s.focus();
    });
    tbl.addEventListener('focusin', e => { const tr = e.target.closest('tr[data-i]'); if (tr) select(+tr.dataset.i); });
    tbl.addEventListener('click', e => {
      const tr = e.target.closest('tr[data-i]'); if (!tr) return;
      const i = +tr.dataset.i;
      if (e.target.closest('[data-del]')) {
        const gone = S.pips[i];
        S.pips.forEach(q => { if (refPip(q) === gone) detach(q); });
        S.pips.splice(i, 1); if (sel >= S.pips.length) sel = Math.max(0, S.pips.length - 1);
        resolveAll(); renderTable(); renderPreview(); save(); return;
      }
      select(i);
      if (e.target.closest('[data-lock]')) {
        const p = S.pips[i];
        p.lock = !p.lock;
        if (p.lock && validBox(p.box)) p.aspect = SM.boxAspect(S.src, p.box);
        if (p.lock && !(p.aspect > 0)) p.aspect = DEF_ASPECT;
        renderTable(); save();
        const b = $(`#tbl tr[data-i="${i}"] [data-lock]`); if (b) b.focus();
        return;
      }
      const td = e.target.closest('td.out');
      if (td && !td.classList.contains('na')) copy(td.textContent, `Copied ${td.textContent}`);
    });
    tbl.addEventListener('paste', e => {
      const t = e.target; if (!t.dataset.c) return;
      const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\r/g, '').replace(/\n+$/, '');
      const r0 = +t.closest('tr').dataset.i;
      const colsOf = p => ['name', ...SM.fields(srcFor(p)).map(f => f.key)];
      const c0 = colsOf(S.pips[r0]).indexOf(t.dataset.c);
      const tabbed = text.includes('\t');
      // Tabs come from spreadsheets. PDFs give spaces; split on them only when not starting in the name column.
      const splitter = tabbed || c0 === 0 ? '\t' : /[\s;]+/;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '').map(l => l.split(splitter));
      if (lines.length < 2 && lines[0] && lines[0].length < 2) return; // ordinary single-value paste
      e.preventDefault();
      lines.forEach((cells, r) => {
        const i = r0 + r;
        // new rows take the format of the row the paste started in
        const r0p = S.pips[r0];
        while (S.pips.length <= i) S.pips.push({ id: S.nextId++, name: 'PiP ' + (S.pips.length + 1), mode: r0p.mode, vals: {}, box: null, lock: r0p.lock, aspect: r0p.aspect, same: r0p.same });
        const p = S.pips[i], cols = colsOf(p), got = new Set();
        cells.forEach((v, c) => { const k = cols[c0 + c]; if (!k) return; got.add(k); if (k === 'name') p.name = v.trim(); else p.vals[k] = v.trim(); });
        // both sizes given: they define the ratio; only one: the lock fills in the other
        if (got.has('w') && !got.has('h')) applyLock(p, 'w');
        if (got.has('h') && !got.has('w')) applyLock(p, 'h');
        p.box = SM.toBox(srcFor(p), p.vals, refBox(p));
        if (p.lock && got.has('w') && got.has('h') && validBox(p.box)) p.aspect = SM.boxAspect(S.src, p.box);
      });
      resolveAll(); renderTable(); renderPreview(); save();
      toast(`Pasted ${lines.length} row${lines.length === 1 ? '' : 's'}`);
    });
  }

  /* ---------- preview ---------- */
  const svg = $('#pv');
  let drag = null;

  function anchorFrac(p, b) {
    if (p.pos === 'anchor') { const [ax, ay] = SM.POINTS[p.anchor]; return [b.l + ax * b.w, b.t + ay * b.h]; }
    if (p.pos === 'edges') return [p.edgeX === 'right' ? b.l + b.w : b.l, p.edgeY === 'bottom' ? b.t + b.h : b.t];
    return null;
  }

  /* Points of a box that a profile's numbers name (source diamonds). */
  function refPoints(sp, b) {
    if (sp.pos === 'corners') return [[b.l, b.t], [b.l + b.w, b.t + b.h]];
    if (sp.pos === 'rel') { const [x, y] = SM.POINTS[sp.relTo]; return [[b.l + x * b.w, b.t + y * b.h]]; }
    const a = anchorFrac(sp, b);
    return a ? [a] : [];
  }
  const relRefName = sp => { const r = pipById(sp.relRef); return r ? pipName(r) : 'reference'; };
  const describe = sp => sp.pos === 'rel' ? `${SM.POINT_NAMES[sp.relTo]}, offset from ${relRefName(sp)} ${SM.POINT_NAMES[sp.relFrom]}` : sp.pos === 'anchor' ? `${SM.POINT_NAMES[sp.anchor]} X / Y` : sp.pos === 'edges' ? `distance from ${sp.edgeX} + ${sp.edgeY}` : sp.pos === 'insets' ? 'insets (all four edges)' : 'corner coordinates';

  /* Lines showing what each source number measures, in canvas units of the preview. */
  function givenLines(sp, vals, b, W, H, rb) {
    const lab = Object.fromEntries(SM.fields(sp).map(x => [x.key, x.label]));
    const t = k => `${lab[k]} ${vals[k] ?? ''}`.trim();
    const L = b.l * W, T = b.t * H, R = (b.l + b.w) * W, B = (b.t + b.h) * H, CX = (L + R) / 2, CY = (T + B) / 2;
    const side = { left: [0, CY, L, CY, 'h'], right: [R, CY, W, CY, 'h'], top: [CX, 0, CX, T, 'v'], bottom: [CX, B, CX, H, 'v'] };
    const out = [], add = (g, label) => out.push({ x1: g[0], y1: g[1], x2: g[2], y2: g[3], dir: g[4], label });
    if (sp.pos === 'edges') { add(side[sp.edgeX], t('dx')); add(side[sp.edgeY], t('dy')); return { lines: out, sides: [sp.edgeX, sp.edgeY] }; }
    if (sp.pos === 'rel') {
      // from the point on the reference across, then down/up to this PiP's point
      if (!rb) return { lines: out, sides: [] };
      const [fx, fy] = SM.POINTS[sp.relFrom], [tx, ty] = SM.POINTS[sp.relTo];
      const RX = (rb.l + fx * rb.w) * W, RY = (rb.t + fy * rb.h) * H, PX = (b.l + tx * b.w) * W, PY = (b.t + ty * b.h) * H;
      // a small offset has no room for two labels: put both on the horizontal one
      const tight = Math.abs(PX - RX) < W / 12 && Math.abs(PY - RY) < H / 12;
      add([RX, RY, PX, RY, 'h'], tight ? `${t('rx')} · ${t('ry')}` : t('rx')); add([PX, RY, PX, PY, 'v'], tight ? '' : t('ry'));
      return { lines: out, sides: [], from: [RX, RY] };
    }
    if (sp.pos === 'insets') { add(side.left, t('il')); add(side.top, t('it')); add(side.right, t('ir')); add(side.bottom, t('ib')); return { lines: out, sides: ['left', 'right', 'top', 'bottom'] }; }
    // X / Y style: measured from the source's 0,0 axes (clamped to the frame) to the named point
    const ax = SM.axes(sp), clamp = v => Math.min(1, Math.max(0, v));
    const OX = clamp(-ax.x0 / (ax.x1 - ax.x0)) * W, OY = clamp(-ax.y0 / (ax.y1 - ax.y0)) * H;
    const pts = refPoints(sp, b), keys = sp.pos === 'corners' ? [['x1', 'y1'], ['x2', 'y2']] : [['x', 'y']];
    pts.forEach(([fx, fy], n) => {
      const PX = fx * W, PY = fy * H;
      add([OX, PY, PX, PY, 'h'], t(keys[n][0])); add([PX, OY, PX, PY, 'v'], t(keys[n][1]));
    });
    return { lines: out, sides: [] };
  }

  /* Measurement lines with end ticks. Source labels sit below/left ('near'), target labels above/right ('far'),
     so they don't collide when both systems measure the same distance. Labels are kept inside the frame. */
  function drawLines(o, lines, cls, txtCls, side, fs, W, H) {
    const r = n => Math.round(n * 100) / 100, ve = 'vector-effect="non-scaling-stroke"';
    const cl = (v, lo, hi) => Math.min(Math.max(v, lo), hi), pad = fs * .3;
    for (const g of lines) {
      if (Math.hypot(g.x2 - g.x1, g.y2 - g.y1) < 0.5) continue;
      const k = fs * .25, tick = (px, py) => g.dir === 'h' ? `M${r(px)} ${r(py - k)}V${r(py + k)}` : `M${r(px - k)} ${r(py)}H${r(px + k)}`;
      o.push(`<path class="${cls}" d="M${r(g.x1)} ${r(g.y1)}L${r(g.x2)} ${r(g.y2)}${tick(g.x1, g.y1)}${tick(g.x2, g.y2)}" ${ve}/>`);
      const tw = g.label.length * fs * .78 * .58;
      let tx, ty, anchor = 'middle';
      if (g.dir === 'h') {
        tx = cl((g.x1 + g.x2) / 2, tw / 2 + pad, W - tw / 2 - pad);
        const below = g.y1 + fs * 1.05, above = g.y1 - fs * .45;
        ty = side === 'near' ? (below > H - pad ? above : below) : (above < fs ? below : above);
      } else {
        const leftOk = g.x1 - fs * .4 - tw > pad, rightOk = g.x1 + fs * .4 + tw < W - pad;
        const left = side === 'near' ? leftOk || !rightOk : !rightOk && leftOk;
        tx = left ? g.x1 - fs * .4 : g.x1 + fs * .4; anchor = left ? 'end' : 'start';
        ty = cl((g.y1 + g.y2) / 2 + fs * .3, fs, H - pad);
      }
      if (g.label) o.push(`<text class="${txtCls}" x="${r(tx)}" y="${r(ty)}" font-size="${r(fs * .78)}" text-anchor="${anchor}">${esc(g.label)}</text>`);
    }
  }

  /* The drawing, in target canvas units. all: every PiP gets its measurements (exports), no selection or handles. */
  function scene(W, H, fs, all, bgHref) {
    const d = S.dst;
    const r = n => Math.round(n * 100) / 100;
    const ve = 'vector-effect="non-scaling-stroke"';
    const o = [`<rect class="frame" x="0" y="0" width="${W}" height="${H}" ${ve}/>`];
    // custom background: stretched to the canvas, then darkened so the lines stay readable
    if (bgHref) o.push(`<image href="${esc(bgHref)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" pointer-events="none"/>`,
      `<rect x="0" y="0" width="${W}" height="${H}" fill="#000" fill-opacity="${BG.dim / 100}" pointer-events="none"/>`);
    o.push(      `<path class="guide" d="M${W / 2} 0V${H}M0 ${H / 2}H${W}M${W / 3} 0V${H}M${2 * W / 3} 0V${H}M0 ${H / 3}H${W}M0 ${2 * H / 3}H${W}" ${ve}/>`);
    if (!all && $('#gen').open) SM.layout(S.src, genOpts()).forEach(b =>
      o.push(`<rect class="ghost" x="${r(b.l * W)}" y="${r(b.t * H)}" width="${r(b.w * W)}" height="${r(b.h * H)}" ${ve}/>`));
    const order = S.pips.map((_, i) => i).filter(i => i !== sel).concat(S.pips[sel] ? [sel] : []);
    for (const i of order) {
      const b = S.pips[i].box; if (!b || !(b.w > 0) || !(b.h > 0)) continue;
      const x = b.l * W, y = b.t * H, w = b.w * W, h = b.h * H, c = color(i);
      o.push(`<rect class="pip${i === sel && !all ? ' sel' : ''}" data-i="${i}" x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" fill="${c}" stroke="${c}" ${ve}/>`);
      const hs = fs * .7;
      if (i === sel && !all && !(S.pips[i].same && relOf(S.pips[i]))) for (const [k, [hx, hy]] of Object.entries(SM.POINTS)) {
        if (k === 'c' || (hx === .5 && w < hs * 4) || (hy === .5 && h < hs * 4)) continue;
        o.push(`<rect class="handle h-${k}" data-i="${i}" data-h="${k}" x="${r(x + hx * w - hs / 2)}" y="${r(y + hy * h - hs / 2)}" width="${r(hs)}" height="${r(hs)}" rx="${r(hs / 5)}"/>`);
      }
      const sp = srcFor(S.pips[i]);
      o.push(`<text class="lbl" x="${r(x + fs * .4)}" y="${r(y + fs * 1.2)}" font-size="${r(fs)}">${esc(S.pips[i].name || i + 1)}</text>`);
      if (h > fs * 3.2) o.push(`<text class="modetxt" x="${r(x + fs * .4)}" y="${r(y + fs * 2.15)}" font-size="${r(fs * .72)}">given as ${esc(describe(sp))}</text>`);
      const a = anchorFrac(d, b);
      if (a) o.push(`<circle class="anchor" cx="${r(a[0] * W)}" cy="${r(a[1] * H)}" r="${r(fs * .35)}" ${ve}/>`);
      for (const [fx, fy] of refPoints(sp, b)) {
        const px = fx * W, py = fy * H, k = fs * .3;
        o.push(`<path class="srcpt" d="M${r(px)} ${r(py - k)}L${r(px + k)} ${r(py)}L${r(px)} ${r(py + k)}L${r(px - k)} ${r(py)}Z" ${ve}/>`);
      }
      if (all || i === sel) {
        // solid = what the source numbers measure, dashed = what the target numbers measure
        const g = givenLines(sp, S.pips[i].vals, b, W, H, refBox(S.pips[i]));
        drawLines(o, g.lines, 'given', 'giventxt', 'near', fs, W, H);
        if (g.from) {   // the point on the reference PiP, as a hollow diamond
          const [px, py] = g.from, k = fs * .3;
          o.push(`<path class="srcpt from" d="M${r(px)} ${r(py - k)}L${r(px + k)} ${r(py)}L${r(px)} ${r(py + k)}L${r(px - k)} ${r(py)}Z" ${ve}/>`);
        }
        drawLines(o, givenLines(d, targetVals(S.pips[i]) || {}, b, W, H).lines, 'dim', 'dimtxt', 'far', fs, W, H);
      }
    }
    // where the target's 0,0 sits
    const ax = SM.axes(d), ox = -ax.x0 / (ax.x1 - ax.x0), oy = -ax.y0 / (ax.y1 - ax.y0);
    if (ox >= 0 && ox <= 1 && oy >= 0 && oy <= 1) {
      const px = ox * W, py = oy * H, s = fs * .6;
      o.push(`<path class="origin" d="M${r(px - s)} ${r(py)}H${r(px + s)}M${r(px)} ${r(py - s)}V${r(py + s)}" ${ve}/>`);
      o.push(`<text class="origintxt" x="${r(Math.min(px + s * .6, W - fs * 2))}" y="${r(py < H - fs ? py + s * 1.8 : py - s * .8)}" font-size="${r(fs * .75)}">0,0</text>`);
    }
    return o;
  }

  function renderPreview() {
    const d = S.dst, W = +d.W, H = +d.H;
    // text size in canvas units: 1/60 of the frame, but never below ~12 px on screen (phones)
    const shown = svg.getBoundingClientRect().width || 800;
    const fs = Math.max(Math.max(W, H * 16 / 9) / 60, 12 * W / shown);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const o = scene(W, H, fs, false, BG.url);   // a short blob: URL, so redraws while dragging stay cheap
    if (drag && drag.snap) {
      const sn = drag.snap, ve = 'vector-effect="non-scaling-stroke"';
      if (sn.x !== undefined) o.push(`<path class="snap" d="M${sn.x * W} 0V${H}" ${ve}/>`);
      if (sn.y !== undefined) o.push(`<path class="snap" d="M0 ${sn.y * H}H${W}" ${ve}/>`);
      // equal gaps: a bar with end ticks for each, along the axis it was measured on
      const k = fs * .35;
      for (const g of sn.gaps || []) {
        if (Math.abs(g.z - g.a) < 1e-6) continue;
        if (g.ax === 'x') { const y = g.at * H; o.push(`<path class="snap gap" d="M${g.a * W} ${y}H${g.z * W}M${g.a * W} ${y - k}V${y + k}M${g.z * W} ${y - k}V${y + k}" ${ve}/>`); }
        else { const x = g.at * W; o.push(`<path class="snap gap" d="M${x} ${g.a * H}V${g.z * H}M${x - k} ${g.a * H}H${x + k}M${x - k} ${g.z * H}H${x + k}" ${ve}/>`); }
      }
    }
    svg.innerHTML = o.join('');
    $('#png').textContent = `Download PNG · ${W}×${H}`;
    updateExportState();
    const p = S.pips[sel];
    $('#pvbar').innerHTML = `<span>Target canvas <b>${W} × ${H}</b>${S.src.W !== d.W || S.src.H !== d.H ? ` · source <b>${S.src.W} × ${S.src.H}</b>` : ''}</span>`
      + (p ? `<span>Selected <b>${esc(p.name || sel + 1)}</b> · given as <b>${esc(describe(srcFor(p)))}</b> → target <b>${esc(describe(d))}</b></span>` : '');
  }

  function frac(e) { const b = svg.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height }; }
  svg.addEventListener('pointerdown', e => {
    const el = e.target.closest('[data-i]'); if (!el) return;
    const i = +el.dataset.i, p = S.pips[i]; if (!p || !p.box) return;
    select(i); svg.focus({ preventScroll: true });
    drag = { i, resize: el.dataset.h ? SM.POINTS[el.dataset.h] : null, p0: frac(e), b0: Object.assign({}, p.box), targets: snapTargets(p) };
    svg.setPointerCapture(e.pointerId); e.preventDefault();
  });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    const pt = frac(e), dx = pt.x - drag.p0.x, dy = pt.y - drag.p0.y, b0 = drag.b0;
    const p = S.pips[drag.i];
    if (drag.resize && p.same && relOf(p)) return;
    const r = S.src.W / S.src.H, free = e.altKey;   // Alt: no snapping
    const rc = svg.getBoundingClientRect(), T = drag.targets, tx = 8 / rc.width, ty = 8 / rc.height;
    drag.snap = {};
    let b;
    if (!drag.resize) {
      // snap edges and centres to the frame and to other PiPs within 8 screen px
      b = { l: b0.l + dx, t: b0.t + dy, w: b0.w, h: b0.h };
      // (or to equal gaps on both sides / the gap next door)
      const sx = !free && closer(snapTo([b.l, b.l + b.w / 2, b.l + b.w], T.xs, tx), equalMove(T, 'x', b, tx));
      const sy = !free && closer(snapTo([b.t, b.t + b.h / 2, b.t + b.h], T.ys, ty), equalMove(T, 'y', b, ty));
      if (sx) b.l += sx.d;
      if (sy) b.t += sy.d;
      showSnap(drag.snap, 'x', sx); showSnap(drag.snap, 'y', sy);
    } else b = resizeBox(b0, drag.resize, dx, dy, p.lock ? p.aspect / r : 0, free ? null : { T, tx, ty }, drag.snap);
    const sp = srcFor(p);
    p.vals = fmtVals(sp, SM.fromBox(sp, b, refBox(p)));   // rounded to the source's decimals, so it snaps
    resolveAll();                                          // rows hanging off this one follow it
    updateAll(); renderPreview();
  });
  // label size depends on the on-screen width, so redraw when it changes
  if (window.ResizeObserver) { let lastW = 0; new ResizeObserver(([e]) => { const w = Math.round(e.contentRect.width); if (w !== lastW) { lastW = w; renderPreview(); } }).observe(svg.parentNode); }
  const endDrag = () => { if (drag) { drag = null; save(); renderPreview(); } };
  /* Resize from handle [hx, hy] (0, .5 or 1 on each axis) by dx/dy. The opposite handle stays put.
     With an aspect (box w/h in frame fractions) the PiP keeps its shape: an edge handle scales around the middle of the opposite edge,
     a corner follows whichever side moved more, or whichever side snapped. snap = { T, tx, ty } or null; the snapped lines go into out. */
  function resizeBox(b0, [hx, hy], dx, dy, aspect, snap, out) {
    const MIN = 0.01;
    const mx = hx !== .5, my = hy !== .5;
    // where the moving edges end up
    let ex = mx ? b0.l + hx * b0.w + dx : null, ey = my ? b0.t + hy * b0.h + dy : null;
    const sx = snap && mx && closer(snapTo([ex], snap.T.xs, snap.tx), equalEdge(snap.T, 'x', b0, hx, ex, snap.tx));
    const sy = snap && my && closer(snapTo([ey], snap.T.ys, snap.ty), equalEdge(snap.T, 'y', b0, hy, ey, snap.ty));
    if (sx) ex += sx.d;
    if (sy) ey += sy.d;
    const fx = b0.l + (1 - hx) * b0.w, fy = b0.t + (1 - hy) * b0.h;   // the fixed point
    let w = mx ? Math.max(MIN, (ex - fx) * (hx ? 1 : -1)) : b0.w;
    let h = my ? Math.max(MIN, (ey - fy) * (hy ? 1 : -1)) : b0.h;
    let byX = mx;
    if (aspect) {
      if (mx && my) byX = sx && sy ? Math.abs(sx.d) / snap.tx <= Math.abs(sy.d) / snap.ty : sx ? true : sy ? false : w / aspect >= h;
      if (byX) h = w / aspect; else w = h * aspect;
    }
    const b = { l: fx - (1 - hx) * w, t: fy - (1 - hy) * h, w, h };
    if (!aspect || byX) showSnap(out, 'x', sx);
    if (!aspect || !byX) showSnap(out, 'y', sy);
    return b;
  }
  /* Snap menu: per browser, not part of the layout or undo. */
  const SNAPKEY = 'screen-margins:v1:snap';
  const SNAP = { frame: true, pips: true, equal: true };
  try { Object.assign(SNAP, JSON.parse(localStorage.getItem(SNAPKEY)) || {}); } catch (e) { /* defaults */ }
  document.querySelectorAll('[data-snap]').forEach(c => {
    c.checked = !!SNAP[c.dataset.snap];
    c.addEventListener('change', () => { SNAP[c.dataset.snap] = c.checked; try { localStorage.setItem(SNAPKEY, JSON.stringify(SNAP)); } catch (e) { /* private mode */ } snapLabel(); });
  });
  function snapLabel() { const n = Object.values(SNAP).filter(Boolean).length; $('#snapsum').textContent = n ? 'Snap' : 'Snap: off'; }
  snapLabel();
  document.addEventListener('click', e => { const m = $('#snapmenu'); if (m.open && !m.contains(e.target)) m.open = false; });
  /* What a dragged PiP snaps to, as picked in the Snap menu: frame edges and centre lines, the edges and centres of PiPs that
     don't move with it, and equal gaps. Equal gaps are measured to the frame edges, the centre lines and (with PiPs on) other PiPs. */
  function snapTargets(p) {
    const xs = SNAP.frame ? [0, .5, 1] : [], ys = SNAP.frame ? [0, .5, 1] : [], boxes = [];
    if (SNAP.pips) S.pips.forEach(q => {
      if (q === p || !validBox(q.box) || dependsOn(q, p)) return;
      boxes.push(q.box);
      xs.push(q.box.l, q.box.l + q.box.w / 2, q.box.l + q.box.w); ys.push(q.box.t, q.box.t + q.box.h / 2, q.box.t + q.box.h);
    });
    return { xs, ys, boxes, equal: SNAP.equal };
  }
  const closer = (a, b) => a && b ? (Math.abs(b.d) < Math.abs(a.d) - 1e-9 ? b : a) : a || b;
  /* Per axis: lo = position, sz = size, and the same for the other axis. */
  const AX = { x: { lo: 'l', sz: 'w', clo: 't', csz: 'h' }, y: { lo: 't', sz: 'h', clo: 'l', csz: 'w' } };
  /* Things along an axis that a gap can be measured to, for a box: frame edges, the centre line, PiPs beside it (overlapping across). */
  function obstacles(T, ax, b, withMid) {
    const A = AX[ax], c0 = b[A.clo], c1 = c0 + b[A.csz];
    const o = [{ a0: -1, a1: 0 }, { a0: 1, a1: 2 }];
    if (withMid) o.push({ a0: .5, a1: .5 });
    T.boxes.forEach(q => { if (q !== b && q[A.clo] < c1 - 1e-9 && q[A.clo] + q[A.csz] > c0 + 1e-9) o.push({ a0: q[A.lo], a1: q[A.lo] + q[A.sz], q }); });
    return o;
  }
  const before = (o, x, tol) => o.filter(k => k.a1 <= x + tol && k.a0 < x).reduce((m, k) => !m || k.a1 > m.a1 ? k : m, null);
  const after = (o, x, tol) => o.filter(k => k.a0 >= x - tol && k.a1 > x).reduce((m, k) => !m || k.a0 < m.a0 ? k : m, null);
  const mid = (b, ax) => b[AX[ax].clo] + b[AX[ax].csz] / 2;
  /* Moving: centre the box between its neighbours, or repeat the gap a neighbour has on its far side. */
  function equalMove(T, ax, b, thr) {
    if (!T.equal) return null;
    // once with the centre line as a neighbour, once without (so two PiPs either side of it can still match)
    return [true, false].map(w => equalMoveIn(T, ax, b, thr, w)).reduce(closer, null);
  }
  function equalMoveIn(T, ax, b, thr, withMid) {
    const A = AX[ax], lo = b[A.lo], sz = b[A.sz], hi = lo + sz, o = obstacles(T, ax, b, withMid), at = mid(b, ax);
    const L = before(o, lo, thr), R = after(o, hi, thr), c = [];
    if (L && R && R.a0 - L.a1 >= sz) { const g = (R.a0 - L.a1 - sz) / 2; c.push({ lo: L.a1 + g, gaps: [[L.a1, L.a1 + g, at], [R.a0 - g, R.a0, at]] }); }
    if (L && L.q) {
      const LL = before(obstacles(T, ax, L.q, withMid), L.a0, 1e-9);
      if (LL) { const g = L.a0 - LL.a1; c.push({ lo: L.a1 + g, gaps: [[LL.a1, L.a0, mid(L.q, ax)], [L.a1, L.a1 + g, at]] }); }
    }
    if (R && R.q) {
      const RR = after(obstacles(T, ax, R.q, withMid), R.a1, 1e-9);
      if (RR) { const g = RR.a0 - R.a1; c.push({ lo: R.a0 - g - sz, gaps: [[R.a1, RR.a0, mid(R.q, ax)], [R.a0 - g, R.a0, at]] }); }
    }
    return c.map(k => ({ d: k.lo - lo, gaps: k.gaps })).filter(k => Math.abs(k.d) <= thr).reduce(closer, null);
  }
  /* Resizing: put the moving edge (side 0 = low, 1 = high, now at e) as far from its neighbour as the fixed edge is from its own. */
  function equalEdge(T, ax, b0, side, e, thr) {
    if (!T.equal) return null;
    return [true, false].map(w => equalEdgeIn(T, ax, b0, side, e, thr, w)).reduce(closer, null);
  }
  function equalEdgeIn(T, ax, b0, side, e, thr, withMid) {
    const A = AX[ax], lo = b0[A.lo], hi = lo + b0[A.sz], o = obstacles(T, ax, b0, withMid), at = mid(b0, ax);
    let t, gaps;
    if (side === 1) {
      const L = before(o, lo, 1e-9), R = after(o, e, thr); if (!L || !R) return null;
      t = R.a0 - (lo - L.a1); gaps = [[L.a1, lo, at], [t, R.a0, at]];
    } else {
      const R = after(o, hi, 1e-9), L = before(o, e, thr); if (!L || !R) return null;
      t = L.a1 + (R.a0 - hi); gaps = [[L.a1, t, at], [hi, R.a0, at]];
    }
    return Math.abs(t - e) <= thr ? { d: t - e, gaps } : null;
  }
  /* Remember what to draw for a snap: a line across the canvas, or the equal gaps. */
  function showSnap(out, ax, sn) {
    if (!sn) return;
    if (sn.gaps) (out.gaps = out.gaps || []).push(...sn.gaps.map(([a, z, at]) => ({ ax, a, z, at })));
    else out[ax] = sn.t;
  }
  function snapTo(edges, targets, thr) {
    let best = null;
    for (const v of edges) for (const t of targets) { const d = t - v; if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t }; }
    return best;
  }
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  /* ---------- exports ---------- */
  /* The page's SVG styles with the colours written out, for drawing outside the page. k scales strokes for big canvases. */
  const exportCSS = k => `text{font-family:Inter,"Helvetica Neue",Helvetica,Arial,sans-serif}
.frame{fill:#101012;stroke:#3a3a40}.guide{stroke:#26262a;stroke-width:${k}}
.pip{fill-opacity:.2;stroke-width:${2 * k}}.lbl{fill:#f3f3f4;font-weight:600}.modetxt{fill:#b3b3ba}
.dim{stroke:#b3b3ba;stroke-dasharray:${5 * k} ${4 * k};stroke-width:${1.5 * k};fill:none}
.dimtxt{fill:#b3b3ba;font-variant-numeric:tabular-nums;paint-order:stroke;stroke:#101012;stroke-width:${4 * k}px}
.given{stroke:#f3f3f4;stroke-width:${2 * k};fill:none}
.giventxt{fill:#f3f3f4;font-weight:600;font-variant-numeric:tabular-nums;paint-order:stroke;stroke:#101012;stroke-width:${4 * k}px}
.anchor{fill:none;stroke:#f3f3f4;stroke-width:${2 * k}}.origin{stroke:#ff5f68;stroke-width:${2 * k}}.origintxt{fill:#ff5f68;font-weight:600}
.srcpt{fill:#f3f3f4;stroke:#101012;stroke-width:${1.5 * k}}.srcpt.from{fill:none;stroke:#f3f3f4;stroke-width:${2 * k}}`;

  /* The whole canvas at the target's resolution, one image pixel per canvas pixel, with every PiP's measurements. */
  async function renderCanvas() {
    const W = +S.dst.W, H = +S.dst.H, base = Math.max(W, H * 16 / 9);
    const body = scene(W, H, base / 60, true, BG.data).join('');   // an image drawn from SVG may only use data: URLs
    const src = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>${exportCSS(Math.max(1, base / 1920))}</style>${body}</svg>`;
    const url = URL.createObjectURL(new Blob([src], { type: 'image/svg+xml' }));
    try {
      const img = new Image(); img.src = url; await img.decode();
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      c.getContext('2d').drawImage(img, 0, 0, W, H);
      return c;
    } finally { URL.revokeObjectURL(url); }
  }
  const blobOf = (c, type, q) => new Promise((ok, no) => c.toBlob(b => b ? ok(b) : no(new Error('toBlob failed')), type, q));
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  const stamp = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
  const fileBase = () => 'screen-margins' + (S.dst.name ? '-' + S.dst.name.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() : '');

  async function exportPNG() {
    try { download(await blobOf(await renderCanvas(), 'image/png'), `${fileBase()}-${S.dst.W}x${S.dst.H}.png`); }
    catch (e) { toast('PNG export failed'); console.error(e); }
  }

  /* Plain-text description of a profile for the report. */
  function profileLines(p, which) {
    const unit = (UNITS.find(u => u[0] === p.unit) || [, p.unit])[1];
    const pre = presetById(p.preset);
    const a = SM.axes(p);
    const L = [`Profile: ${p.name || (pre ? pre.label : 'custom')}`, `Canvas ${p.W} × ${p.H} px · numbers in ${unit.toLowerCase()}${p.decimals ? ` · ${p.decimals} decimals` : ''}`];
    L.push(p.unit === 'custom' ? `Range: X ${short(a.x0)} at left to ${short(a.x1)} at right, Y ${short(a.y0)} at top to ${short(a.y1)} at bottom`
      : `0,0 at the frame’s ${SM.POINT_NAMES[p.origin]}, Y counts ${p.yUp ? 'up' : 'down'} (X ${short(a.x0)} to ${short(a.x1)}, Y ${short(a.y0)} to ${short(a.y1)})`);
    L.push(`Position: ${describe(p)}${which === 'src' ? ' (default; PiPs can override it)' : ''}`);
    if (which === 'src' || SM.hasSize(p)) L.push(`Size: ${(SIZES.find(x => x[0] === p.size) || [, p.size])[1].toLowerCase()}${which === 'dst' && p.uniform ? `, one value keeping ${p.aspectW}:${p.aspectH}` : ''}`);
    return L;
  }

  async function exportPDF() {
    let jpg, canvas;
    try { canvas = await renderCanvas(); jpg = new Uint8Array(await (await blobOf(canvas, 'image/jpeg', .92)).arrayBuffer()); }
    catch (e) { toast('PDF export failed'); console.error(e); return; }
    const P = SMPDF, PW = 842, PH = 595, M = 36, CW = PW - 2 * M, BOTTOM = PH - M - 14;   // A4 landscape, points
    const ink = '#1d1d22', mute = '#6b6b75', rule = '#d9d9de', headBg = '#f2f2f4';
    const doc = P.create(PW, PH);
    let pg = doc.page(), y = M;
    pg.text(M, y, 'Screen margins', { size: 18, bold: true, color: ink });
    pg.text(PW - M, y + 5, new Date().toLocaleString(), { size: 9, color: mute, align: 'right' });
    y += 32;

    // the two profiles side by side
    const half = (CW - 28) / 2;
    const prof = (x, title, p, which) => {
      let yy = y;
      pg.text(x, yy, title, { size: 11, bold: true, color: ink }); yy += 17;
      for (const l of profileLines(p, which)) for (const w of P.wrap(l, 9, half)) { pg.text(x, yy, w, { size: 9, color: ink }); yy += 12; }
      return yy;
    };
    y = Math.max(prof(M, 'Source · how the numbers arrive', S.src, 'src'), prof(M + half + 28, 'Target · how the switcher wants them', S.dst, 'dst')) + 16;

    // results table
    const df = SM.fields(S.dst);
    const cols = [{ t: '#', w: 24 }, { t: 'Name', w: 92 }, { t: 'Given as', w: 150 }, { t: 'Source values', w: 168 }]
      .concat(df.map(f => ({ t: f.label, w: 60, target: true })));
    const used = cols.reduce((a, c) => a + c.w, 0);
    cols.push({ t: 'Notes', w: Math.max(60, CW - used) });
    if (used + cols[cols.length - 1].w > CW) cols[2].w -= used + cols[cols.length - 1].w - CW;   // narrow "Given as" if it doesn't fit
    let cx = M; cols.forEach(c => { c.x = cx; cx += c.w; });
    const FS = 9, LH = 11.5, PAD = 4;
    const header = () => {
      const lines = cols.map(c => P.wrap(c.t, 8, c.w - 2 * PAD, true));
      const h = Math.max(...lines.map(l => l.length)) * 10 + 2 * PAD;
      pg.rect(M, y, CW, h, { fill: headBg });
      cols.forEach((c, k) => lines[k].forEach((l, j) => pg.text(c.x + PAD, y + PAD + j * 10, l, { size: 8, bold: true, color: c.target ? ink : mute })));
      y += h;
    };
    pg.text(M, y, `Results · ${S.pips.length} PiP${S.pips.length === 1 ? '' : 's'}`, { size: 11, bold: true, color: ink }); y += 17;
    header();
    S.pips.forEach((p, i) => {
      const sp = srcFor(p), out = targetVals(p), warn = p.box ? SM.warnings(S.dst, p.box) : ['Incomplete: values missing'];
      const cells = [String(i + 1), p.name || `PiP ${i + 1}`, describe(sp),
        SM.fields(sp).map(f => `${f.label} ${p.vals[f.key] ?? ''}`).join('   '),
        ...df.map(f => out ? out[f.key] : '—'), warn.join('; ')];
      const lines = cells.map((t, k) => P.wrap(t, FS, cols[k].w - 2 * PAD - (k === 0 ? 9 : 0), cols[k].target));
      const h = Math.max(...lines.map(l => l.length)) * LH + 2 * PAD;
      if (y + h > BOTTOM) { pg = doc.page(); y = M; header(); }
      pg.rect(cols[0].x + PAD, y + PAD + 2.5, 6, 6, { fill: color(i) });
      cells.forEach((_, k) => lines[k].forEach((l, j) => pg.text(cols[k].x + PAD + (k === 0 ? 9 : 0), y + PAD + j * LH, l,
        { size: FS, bold: !!cols[k].target, color: k === cols.length - 1 ? '#b4232c' : ink })));
      y += h;
      pg.line(M, y, M + CW, y, { color: rule });
    });

    // the drawing, as big as fits; on a new page if less than half a page is left
    const W = canvas.width, H = canvas.height;
    let iw = CW, ih = CW * H / W;
    const room = () => BOTTOM - y - 40;
    if (room() < Math.min(ih, (BOTTOM - M) / 2)) { pg = doc.page(); y = M; } else y += 20;
    if (ih > room()) { ih = room(); iw = ih * W / H; }
    pg.text(M, y, `Canvas · ${W} × ${H} target pixels`, { size: 11, bold: true, color: ink }); y += 17;
    pg.image(doc.addJpeg(jpg, W, H), M, y, iw, ih); y += ih + 6;
    pg.text(M, y, 'Solid lines: what the source numbers measure · dashed lines: what the target numbers measure · ring: the point the target position refers to · red cross: target 0,0',
      { size: 7.5, color: mute });

    doc.pages.forEach((p, k) => {
      p.text(M, PH - M + 2, 'Screen margins · greatmastix.github.io/Screen-margins · check the numbers on your switcher before the show', { size: 7.5, color: mute });
      p.text(PW - M, PH - M + 2, `Page ${k + 1} of ${doc.pages.length}`, { size: 7.5, color: mute, align: 'right' });
    });
    download(new Blob([doc.bytes()], { type: 'application/pdf' }), `${fileBase()}-${stamp()}.pdf`);
  }
  /* Anything that would make an export show wrong or missing numbers: [{ msg, el }] (el = the field to fix, if any). */
  function exportProblems() {
    const out = [];
    for (const [w, label] of [['src', 'Source'], ['dst', 'Target']]) {
      const el = $(`#prof-${w} input.bad`);
      if (el) out.push({ msg: `${label} profile: “${el.value}” isn’t a valid value`, el });
    }
    S.pips.forEach((p, i) => {
      if (validBox(p.box)) return;
      const tr = $(`#tbl tr[data-i="${i}"]`);
      const el = tr && [...tr.querySelectorAll('input[data-c]:not(.name)')].find(x => SM.parseNum(x.value) === null);
      let why;
      if (el) why = el.value.trim() === '' ? `${el.getAttribute('aria-label')} is missing` : `“${el.value}” isn’t a number`;
      else if (relOf(p) && !refBox(p)) why = 'its reference PiP has no valid position';
      else why = 'width and height must be above 0';
      const sizeEl = tr && [...tr.querySelectorAll('input[data-c="w"], input[data-c="h"]')].find(x => SM.parseNum(x.value) <= 0);
      out.push({ msg: `${pipName(p)}: ${why}`, el: el || sizeEl || (tr && tr.querySelector('input[data-c]:not(.name)')) });
    });
    return out;
  }
  // a function declaration (hoisted), because renderPreview calls it and may run before this point
  function updateExportState() {
    const pr = exportProblems();
    ['#png', '#pdf'].forEach(id => {
      const b = $(id);
      if (b.dataset.title === undefined) b.dataset.title = b.title;
      b.setAttribute('aria-disabled', pr.length ? 'true' : 'false');
      b.title = pr.length ? `Fix first:\n${pr.map(x => x.msg).join('\n')}` : b.dataset.title;
    });
  }
  const guarded = fn => () => {
    const pr = exportProblems();
    if (!pr.length) return fn();
    toast(`Can’t export yet. ${pr[0].msg}${pr.length > 1 ? ` (and ${pr.length - 1} more)` : ''}`, 3500);
    const el = pr[0].el;
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); }
    updateExportState();
  };
  $('#png').addEventListener('click', guarded(exportPNG));
  $('#pdf').addEventListener('click', guarded(exportPDF));
  // the profile forms mark bad fields without redrawing the preview, so check after every edit too
  document.addEventListener('input', () => setTimeout(updateExportState));

  /* ---------- canvas background ---------- */
  /* An image behind the PiPs (a frame grab, the show's background). Kept apart from the main state because it is big. */
  const BGKEY = KEY + ':bg';
  const BG = { data: null, url: null, dim: 40 };
  function dataToBlob(d) {
    const [head, b64] = d.split(','), bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type: head.slice(5).split(';')[0] });
  }
  function storeBG() {
    try {
      if (BG.data) localStorage.setItem(BGKEY, JSON.stringify({ data: BG.data, dim: BG.dim }));
      else localStorage.removeItem(BGKEY);
    } catch (e) { toast('Background too big to remember: it stays until you reload'); }
  }
  function setBG(data, store) {
    BG.data = data;
    if (BG.url) URL.revokeObjectURL(BG.url);
    BG.url = data ? URL.createObjectURL(dataToBlob(data)) : null;
    $('#bgctl').hidden = !data; $('#bgdim').value = BG.dim;
    $('#bgbtn').textContent = data ? 'Change background' : 'Background…';
    renderPreview();
    if (store) storeBG();
  }
  async function readBG(file) {
    if (!file || !/^image\//.test(file.type)) { toast('That’s not an image'); return; }
    const url = URL.createObjectURL(file), img = new Image();
    try { img.src = url; await img.decode(); } catch (e) { toast('Couldn’t read that image'); URL.revokeObjectURL(url); return; }
    const W = +S.dst.W, H = +S.dst.H;
    const iw = img.naturalWidth || W, ih = img.naturalHeight || H;
    // keep it no bigger than the canvas needs (max 4K) and store as JPEG, so it fits in local storage
    const k = Math.min(1, Math.min(3840, Math.max(W, H, 1920)) / Math.max(iw, ih));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(iw * k)); c.height = Math.max(1, Math.round(ih * k));
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    setBG(c.toDataURL('image/jpeg', .85), true);
    toast(Math.abs(iw / ih - W / H) > .01 ? `Background ${iw}×${ih} stretched to the ${W}×${H} canvas` : 'Background set');
  }
  $('#bgbtn').addEventListener('click', () => $('#bgfile').click());
  $('#bgfile').addEventListener('change', e => { readBG(e.target.files[0]); e.target.value = ''; });
  $('#bgdim').addEventListener('input', e => { BG.dim = +e.target.value; renderPreview(); });
  $('#bgdim').addEventListener('change', storeBG);
  $('#bgdel').addEventListener('click', () => setBG(null, true));
  // drop an image on the preview, or paste one anywhere outside a text field
  const pvCard = $('.preview');
  pvCard.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); pvCard.classList.add('drop'); } });
  pvCard.addEventListener('dragleave', e => { if (!pvCard.contains(e.relatedTarget)) pvCard.classList.remove('drop'); });
  pvCard.addEventListener('drop', e => { e.preventDefault(); pvCard.classList.remove('drop'); readBG(e.dataTransfer.files[0]); });
  document.addEventListener('paste', e => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    const f = [...(e.clipboardData || {}).files || []].find(x => /^image\//.test(x.type));
    if (f) { e.preventDefault(); readBG(f); }
  });
  try { const j = JSON.parse(localStorage.getItem(BGKEY)); if (j && j.data) { BG.dim = j.dim ?? 40; setBG(j.data, false); } } catch (e) { /* none or unreadable */ }

  /* ---------- layout generator ---------- */
  function genOpts() {
    const v = id => SM.parseNum($(id).value);
    return { count: v('#g-count') || 1, cols: v('#g-cols') || 0, marginX: v('#g-mx') || 0, marginY: v('#g-my') || 0,
      gapX: v('#g-gx') || 0, gapY: v('#g-gy') || 0, aspectW: v('#g-aw') || 16, aspectH: v('#g-ah') || 9, stretch: $('#g-stretch').checked };
  }
  function generate(replace) {
    const boxes = SM.layout(S.src, genOpts());
    if (!boxes.length) { toast('The margins leave no room for PiPs'); return; }
    if (replace) { S.pips = []; sel = 0; }
    boxes.forEach(b => {
      const sp = srcBase(), vals = fmtVals(sp, SM.fromBox(sp, b));
      S.pips.push({ id: S.nextId++, name: 'PiP ' + (S.pips.length + 1), mode: '', vals, box: SM.toBox(sp, vals), lock: true, aspect: SM.boxAspect(S.src, b) });
    });
    renderTable(); renderPreview(); save();
  }
  $('#gen').addEventListener('toggle', renderPreview);
  $('#gen').addEventListener('input', renderPreview);
  $('#g-replace').addEventListener('click', () => {
    if (S.pips.length > 1 && !confirm(`Replace the ${S.pips.length} PiPs in the table?`)) return;
    generate(true);
  });
  $('#g-append').addEventListener('click', () => generate(false));

  /* ---------- header / toolbar ---------- */
  $('#swap').addEventListener('click', () => {
    const t = S.src; S.src = S.dst; S.dst = t;
    // Per-PiP formats described the old source; after a swap every row uses the new source's default.
    S.pips.forEach(p => { p.mode = ''; p.same = false; const sp = srcFor(p); p.vals = p.box ? fmtVals(sp, SM.fromBox(sp, p.box)) : {}; });
    resolveAll();
    renderProfile('src'); renderProfile('dst'); renderTable(); renderPreview(); save();
  });
  $('#add').addEventListener('click', () => {
    S.pips.push(newPip()); sel = S.pips.length - 1; resolveAll();
    renderTable(); renderPreview(); save();
    const inp = $(`#tbl tr[data-i="${sel}"] input.name`); if (inp) { inp.focus(); inp.select(); }
  });
  $('#clearall').addEventListener('click', () => {
    if (!S.pips.length || !confirm('Remove all PiPs?')) return;
    S.pips = []; sel = 0; renderTable(); renderPreview(); save();
  });
  $('#copyall').addEventListener('click', () => {
    const df = SM.fields(S.dst);
    const rows = [['Name', ...df.map(f => f.label)].join('\t')];
    S.pips.forEach((p, i) => { const v = targetVals(p); rows.push([p.name || String(i + 1), ...df.map(f => v ? v[f.key] : '')].join('\t')); });
    copy(rows.join('\n'), `Copied ${S.pips.length} row${S.pips.length === 1 ? '' : 's'}`);
  });

  /* ---------- share links ----------
     The profiles and PiPs (not saved profiles, not the background) go into the URL after #s=, deflated and base64url-encoded.
     Opening one replaces the current layout; Undo brings the old one back. */
  const b64u = bytes => { let t = ''; bytes.forEach(b => { t += String.fromCharCode(b); }); return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  async function pipe(bytes, stream) {
    const w = stream.writable.getWriter();
    w.write(bytes).catch(() => {}); w.close().catch(() => {});   // a damaged link fails on the reading side
    const r = stream.readable.getReader(), parts = [];
    for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); }
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
    parts.reduce((at, p) => { out.set(p, at); return at + p.length; }, 0);
    return out;
  }
  function shareData() {
    const prof = p => { const o = clone(p); delete o.name; return o; };
    return { v: 1, src: prof(S.src), dst: prof(S.dst),
      pips: S.pips.map(p => ({ id: p.id, name: p.name, mode: p.mode, vals: p.vals, lock: p.lock, aspect: p.aspect, same: !!p.same })) };
  }
  async function shareCode() {
    const raw = new TextEncoder().encode(JSON.stringify(shareData()));
    return window.CompressionStream ? 'z' + b64u(await pipe(raw, new CompressionStream('deflate-raw'))) : 'j' + b64u(raw);
  }
  async function readCode(code) {
    const bytes = unb64u(code.slice(1));
    const raw = code[0] === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
    return JSON.parse(new TextDecoder().decode(raw));
  }
  /* A link can come from anyone: keep only known fields with sane values. */
  const ENUMS = { unit: UNITS.map(u => u[0]), pos: POS.map(u => u[0]), size: SIZES.map(u => u[0]), origin: Object.keys(SM.POINTS), anchor: Object.keys(SM.POINTS),
    edgeX: ['left', 'right'], edgeY: ['top', 'bottom'], relFrom: Object.keys(SM.POINTS), relTo: Object.keys(SM.POINTS), preset: ['', ...PRESETS.map(x => x.id)] };
  const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : typeof v === 'number' && isFinite(v) ? String(v) : '';
  function cleanProfile(o) {
    const d = SM.defaultProfile(), p = {};
    o = o && typeof o === 'object' ? o : {};
    for (const k of Object.keys(d)) {
      const v = o[k];
      if (ENUMS[k]) p[k] = ENUMS[k].includes(v) ? v : d[k];
      else if (k === 'name') p[k] = '';
      else if (k === 'yUp' || k === 'uniform') p[k] = !!v;
      else if (k === 'range') p[k] = Object.fromEntries(['left', 'right', 'top', 'bottom'].map(e => [e, isFinite(+(v || {})[e]) ? +(v || {})[e] : d.range[e]]));
      else if (k === 'labels') p[k] = Object.fromEntries(Object.entries(v && typeof v === 'object' ? v : {}).filter(([a]) => /^\w{1,4}$/.test(a)).map(([a, b]) => [a, str(b, 40)]));
      else p[k] = isFinite(+v) && v !== '' && v !== null ? +v : d[k];
    }
    p.decimals = Math.max(0, Math.min(6, Math.round(p.decimals)));
    if (!(p.W > 0)) p.W = d.W; if (!(p.H > 0)) p.H = d.H;
    return p;
  }
  const MODE_RE = /^(|anchor:(tl|tc|tr|ml|c|mr|bl|bc|br)|edges:(left|right):(top|bottom)|insets|corners|rel:\d{1,6}:(tl|tc|tr|ml|c|mr|bl|bc|br):(tl|tc|tr|ml|c|mr|bl|bc|br))$/;
  function cleanShared(d) {
    if (!d || typeof d !== 'object' || !Array.isArray(d.pips)) throw new Error('not a layout');
    const ids = new Set();
    const pips = d.pips.slice(0, 500).map(q => {
      q = q && typeof q === 'object' ? q : {};
      let id = Math.floor(+q.id); if (!(id > 0) || ids.has(id)) id = 0; else ids.add(id);
      const vals = {};
      Object.entries(q.vals && typeof q.vals === 'object' ? q.vals : {}).forEach(([k, v]) => { if (/^\w{1,4}$/.test(k)) vals[k] = str(v, 60); });
      return { id, name: str(q.name, 80), mode: MODE_RE.test(q.mode || '') ? q.mode || '' : '', vals, lock: q.lock !== false, aspect: +q.aspect > 0 ? +q.aspect : undefined, same: !!q.same };
    });
    return { src: cleanProfile(d.src), dst: cleanProfile(d.dst), pips };
  }
  $('#share').addEventListener('click', () => {
    if (saveT) saveNow();
    const msg = `Link copied${BG.data ? ' · the background image isn’t included' : ''}`;
    const url = shareCode().then(c => location.href.split('#')[0] + '#s=' + c);
    // Safari only lets a click write the clipboard straight away, so hand it the link as a promise when it can take one
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write && window.isSecureContext) {
      navigator.clipboard.write([new ClipboardItem({ 'text/plain': url.then(u => new Blob([u], { type: 'text/plain' })) })])
        .then(() => toast(msg), () => url.then(u => copy(u, msg)));
    } else url.then(u => copy(u, msg), e => toast('Couldn’t make a link: ' + e.message, 3500));
  });
  async function openShared() {
    const m = /^#s=([zj][\w-]+)$/.exec(location.hash); if (!m) return;
    history.replaceState(null, '', location.href.split('#')[0]);   // a reload keeps your own edits, not the link
    try {
      const d = cleanShared(await readCode(m[1]));
      if (saveT) saveNow();
      replaceState(Object.assign(d, { saved: S.saved }));
      sel = 0; renderTable(); renderPreview(); saveNow();
      toast(`Opened a shared layout with ${d.pips.length} PiP${d.pips.length === 1 ? '' : 's'}${hist.at > 0 ? ` · ${MODK}Z brings yours back` : ''}`, 4000);
    } catch (e) { toast('That share link is damaged or incomplete', 4000); }
  }
  addEventListener('hashchange', openShared);

  /* ---------- keyboard: undo / redo, nudging ---------- */
  const MODK = /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl+';
  const typing = el => el && el.matches && el.matches('input:not([type=checkbox]):not([type=range]), textarea, select, [contenteditable]');
  /* Move (or with resize, grow) the selected PiP by whole source pixels. If the source's decimals swallow that, take the smallest step that shows. */
  function nudge(dx, dy, resize) {
    const p = S.pips[sel]; if (!p || !validBox(p.box) || (resize && p.same && relOf(p))) return;
    const b0 = Object.assign({}, p.box), sp = srcFor(p), r = +S.src.W / +S.src.H;
    for (let k = 1; k <= 4096; k *= 2) {
      const fx = dx * k / +S.src.W, fy = dy * k / +S.src.H;
      let b;
      if (!resize) b = Object.assign({}, b0, { l: b0.l + fx, t: b0.t + fy });
      else if (p.lock) {
        const w = fx ? b0.w + fx : (b0.h + fy) * p.aspect / r;
        b = Object.assign({}, b0, { w, h: w * r / p.aspect });
      } else b = Object.assign({}, b0, { w: b0.w + fx, h: b0.h + fy });
      if (!(b.w > 0 && b.h > 0)) return;
      const vals = fmtVals(sp, SM.fromBox(sp, b, refBox(p)));
      const nb = SM.toBox(sp, vals, refBox(p));
      if (nb && ['l', 't', 'w', 'h'].some(e => Math.abs(nb[e] - b0[e]) > 1e-12)) {
        p.vals = vals; resolveAll(); updateAll(); renderPreview(); save();
        return;
      }
    }
  }
  svg.setAttribute('tabindex', '0');
  svg.setAttribute('aria-label', 'Preview. Arrow keys move the selected PiP, Shift for 10 px, Alt to resize.');
  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && !e.altKey && (k === 'z' || k === 'y')) {
      // our own undo everywhere, also in fields: they write to the layout as you type
      e.preventDefault();
      step(k === 'y' || e.shiftKey ? 1 : -1);
      return;
    }
    const dir = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k];
    if (!dir || mod || document.activeElement !== svg) return;
    e.preventDefault();
    const n = e.shiftKey ? 10 : 1;
    nudge(dir[0] * n, dir[1] * n, e.altKey);
  });
  $('#undo').addEventListener('click', () => step(-1));
  $('#redo').addEventListener('click', () => step(1));

  /* Number fields take sums (200+10, 1920/2-320). The result is used as you type;
     Enter or leaving the field replaces the sum with it. */
  function commitExpr(e) {
    const el = e.target;
    if (!el.matches || !el.matches('input[inputmode=decimal]')) return;
    if (e.type === 'keydown' && e.key !== 'Enter') return;
    if (SM.parsePlain(el.value) !== null) return;
    const n = SM.parseNum(el.value);
    if (n === null) {
      if (e.type === 'keydown' && SM.divByZero(el.value)) { el.value = '\u{1F921}'; el.dispatchEvent(new Event('input', { bubbles: true })); }
      return;
    }
    el.value = SM.fmt(n, 6);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  document.addEventListener('keydown', commitExpr, true);
  document.addEventListener('change', commitExpr, true);

  bindProfile('src'); bindProfile('dst'); bindTable();
  renderProfile('src'); renderProfile('dst'); renderTable(); renderPreview(); undoState();
  openShared();
})();
