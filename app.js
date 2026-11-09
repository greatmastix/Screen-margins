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
    return { pos };
  }
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
  let S = load() || initial();
  S.pips.forEach(p => {
    p.mode = p.mode || '';
    // older saves may hold a single size value: read them with the profile as saved, then rewrite as W/H
    const asSaved = Object.assign({}, S.src, modeOv(p.mode));
    p.box = SM.toBox(asSaved, p.vals);
    reformat(p, asSaved, srcFor(p));
    if (p.lock === undefined) p.lock = true;
    if (!(p.aspect > 0)) p.aspect = validBox(p.box) ? SM.boxAspect(S.src, p.box) : DEF_ASPECT;
  });
  let sel = 0;

  function initial() {
    const src = SM.defaultProfile();                  // top-left X / Y
    const dst = SM.defaultProfile({ anchor: 'c' });
    const vals = { x: '1240', y: '680', w: '640', h: '360' };
    return { src, dst, pips: [{ name: 'PiP 1', vals, lock: true, aspect: DEF_ASPECT }], saved: {} };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.src && s.dst && Array.isArray(s.pips)) {
        s.src = SM.defaultProfile(s.src); s.dst = SM.defaultProfile(s.dst); s.saved = s.saved || {};
        s.pips.forEach(p => { p.vals = p.vals || {}; });
        return s;
      }
    } catch (e) { /* storage unavailable or corrupt: start fresh */ }
    return null;
  }
  let saveT;
  function saveNow() { clearTimeout(saveT); saveT = null; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }
  function save() { clearTimeout(saveT); saveT = setTimeout(saveNow, 200); }
  // don't lose the last edit when the tab is closed or reloaded within the debounce
  addEventListener('pagehide', () => { if (saveT) saveNow(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && saveT) saveNow(); });

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 1400);
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
  const num = (k, label, v, unit) => `<div class="field"><label>${label}</label><div class="unit"><input type="number" step="any" data-k="${k}" value="${esc(v)}">${unit ? `<span>${unit}</span>` : ''}</div></div>`;
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
      if (p.uniform) h += `<div class="row"><div class="field"><label>Content aspect</label><div class="ratio"><input type="number" step="any" data-k="aspectW" value="${esc(p.aspectW)}" aria-label="Aspect width"><span>:</span><input type="number" step="any" data-k="aspectH" value="${esc(p.aspectH)}" aria-label="Aspect height"></div></div><div></div></div>`;
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
    else if (el.type === 'number') {
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
    if (keys(oldProf) !== keys(newProf)) p.vals = p.box ? fmtVals(newProf, SM.fromBox(newProf, p.box)) : {};
    p.box = SM.toBox(newProf, p.vals);
  }

  function profileChanged(which, old, structural) {
    if (which === 'src') S.pips.forEach(p => reformat(p, withMode(old, p), srcFor(p)));
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
      if (t.type !== 'number' || !t.dataset.k) return;
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
      if (!t.dataset.k || t.type === 'number') return;
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
    const modeSel = m => `<select class="mode" data-m aria-label="Position given as"><option value="">${esc(def)}</option>${MODES.map(([g, list]) =>
      `<optgroup label="${g}">${list.map(([v, l]) => `<option value="${v}"${v === m ? ' selected' : ''}>${l}</option>`).join('')}</optgroup>`).join('')}</select>`;
    let h = `<thead><tr><th colspan="2"></th><th class="grp" colspan="${nsrc + 1}">Source${S.src.name ? ' · ' + esc(S.src.name) : ''}</th><th></th>`
      + `<th class="grp" colspan="${df.length}">Target${S.dst.name ? ' · ' + esc(S.dst.name) : ''}</th><th colspan="2"></th></tr>`
      + `<tr><th>#</th><th>Name</th><th>Position given as</th><th colspan="${nsrc}">Values</th><th></th>`
      + `${df.map(f => `<th title="${esc(f.hint)}">${esc(f.label)}</th>`).join('')}<th></th><th></th></tr></thead><tbody>`;
    S.pips.forEach((p, i) => {
      h += `<tr data-i="${i}"${i === sel ? ' class="sel"' : ''}><td class="idx"><span class="dot" style="background:${color(i)}"></span>${i + 1}</td>`
        + `<td><input type="text" class="name" data-c="name" value="${esc(p.name)}" aria-label="Name"></td>`
        + `<td>${modeSel(p.mode)}</td>`
        + srcCells(p, nsrc)
        + `<td class="sep">→</td>` + df.map(f => `<td class="out" data-o="${f.key}" title="Click to copy"></td>`).join('')
        + `<td class="w"></td><td><button class="x" data-del type="button" title="Remove" aria-label="Remove">×</button></td></tr>`;
    });
    tbl.innerHTML = h + '</tbody>';
    S.pips.forEach((_, i) => updateRow(i));
  }

  function srcCells(p, n) {
    const f = SM.fields(srcFor(p));
    const inp = x => `<input type="text" inputmode="decimal" data-c="${x.key}" value="${esc(p.vals[x.key] ?? '')}" title="${esc(x.hint)}" aria-label="${esc(x.label)}">`;
    return f.map(x => x.key === 'h'
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
    const p = { name: 'PiP ' + (S.pips.length + 1), mode: last ? last.mode : '', vals, lock: last ? last.lock : true, aspect: last ? last.aspect : DEF_ASPECT };
    p.box = SM.toBox(srcFor(p), vals);
    return p;
  }

  function bindTable() {
    const tbl = $('#tbl');
    tbl.addEventListener('input', e => {
      const t = e.target; if (!t.dataset.c) return;
      const i = +t.closest('tr').dataset.i, p = S.pips[i];
      if (t.dataset.c === 'name') p.name = t.value;
      else { p.vals[t.dataset.c] = t.value; applyLock(p, t.dataset.c); p.box = SM.toBox(srcFor(p), p.vals); updateRowInputs(i, t); }
      updateRow(i); renderPreview(); save();
    });
    tbl.addEventListener('change', e => {
      const t = e.target; if (!t.matches('select[data-m]')) return;
      const i = +t.closest('tr').dataset.i, p = S.pips[i], old = srcFor(p);
      p.mode = t.value;
      reformat(p, old, srcFor(p));
      renderTable(); renderPreview(); save();
      const s = $(`#tbl tr[data-i="${i}"] select[data-m]`); if (s) s.focus();
    });
    tbl.addEventListener('focusin', e => { const tr = e.target.closest('tr[data-i]'); if (tr) select(+tr.dataset.i); });
    tbl.addEventListener('click', e => {
      const tr = e.target.closest('tr[data-i]'); if (!tr) return;
      const i = +tr.dataset.i;
      if (e.target.closest('[data-del]')) {
        S.pips.splice(i, 1); if (sel >= S.pips.length) sel = Math.max(0, S.pips.length - 1);
        renderTable(); renderPreview(); save(); return;
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
        while (S.pips.length <= i) S.pips.push({ name: 'PiP ' + (S.pips.length + 1), mode: r0p.mode, vals: {}, box: null, lock: r0p.lock, aspect: r0p.aspect });
        const p = S.pips[i], cols = colsOf(p), got = new Set();
        cells.forEach((v, c) => { const k = cols[c0 + c]; if (!k) return; got.add(k); if (k === 'name') p.name = v.trim(); else p.vals[k] = v.trim(); });
        // both sizes given: they define the ratio; only one: the lock fills in the other
        if (got.has('w') && !got.has('h')) applyLock(p, 'w');
        if (got.has('h') && !got.has('w')) applyLock(p, 'h');
        p.box = SM.toBox(srcFor(p), p.vals);
        if (p.lock && got.has('w') && got.has('h') && validBox(p.box)) p.aspect = SM.boxAspect(S.src, p.box);
      });
      renderTable(); renderPreview(); save();
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
    const a = anchorFrac(sp, b);
    return a ? [a] : [];
  }
  const describe = sp => sp.pos === 'anchor' ? `${SM.POINT_NAMES[sp.anchor]} X / Y` : sp.pos === 'edges' ? `distance from ${sp.edgeX} + ${sp.edgeY}` : sp.pos === 'insets' ? 'insets (all four edges)' : 'corner coordinates';

  /* Lines showing what each source number measures, in canvas units of the preview. */
  function givenLines(sp, vals, b, W, H) {
    const lab = Object.fromEntries(SM.fields(sp).map(x => [x.key, x.label]));
    const t = k => `${lab[k]} ${vals[k] ?? ''}`.trim();
    const L = b.l * W, T = b.t * H, R = (b.l + b.w) * W, B = (b.t + b.h) * H, CX = (L + R) / 2, CY = (T + B) / 2;
    const side = { left: [0, CY, L, CY, 'h'], right: [R, CY, W, CY, 'h'], top: [CX, 0, CX, T, 'v'], bottom: [CX, B, CX, H, 'v'] };
    const out = [], add = (g, label) => out.push({ x1: g[0], y1: g[1], x2: g[2], y2: g[3], dir: g[4], label });
    if (sp.pos === 'edges') { add(side[sp.edgeX], t('dx')); add(side[sp.edgeY], t('dy')); return { lines: out, sides: [sp.edgeX, sp.edgeY] }; }
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
      o.push(`<text class="${txtCls}" x="${r(tx)}" y="${r(ty)}" font-size="${r(fs * .78)}" text-anchor="${anchor}">${esc(g.label)}</text>`);
    }
  }

  function renderPreview() {
    const d = S.dst, W = +d.W, H = +d.H;
    // text size in canvas units: 1/60 of the frame, but never below ~12 px on screen (phones)
    const shown = svg.getBoundingClientRect().width || 800;
    const fs = Math.max(Math.max(W, H * 16 / 9) / 60, 12 * W / shown);
    const r = n => Math.round(n * 100) / 100;
    const ve = 'vector-effect="non-scaling-stroke"';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const o = [`<rect class="frame" x="0" y="0" width="${W}" height="${H}" ${ve}/>`,
      `<path class="guide" d="M${W / 2} 0V${H}M0 ${H / 2}H${W}M${W / 3} 0V${H}M${2 * W / 3} 0V${H}M0 ${H / 3}H${W}M0 ${2 * H / 3}H${W}" ${ve}/>`];
    if ($('#gen').open) SM.layout(S.src, genOpts()).forEach(b =>
      o.push(`<rect class="ghost" x="${r(b.l * W)}" y="${r(b.t * H)}" width="${r(b.w * W)}" height="${r(b.h * H)}" ${ve}/>`));
    const order = S.pips.map((_, i) => i).filter(i => i !== sel).concat(S.pips[sel] ? [sel] : []);
    for (const i of order) {
      const b = S.pips[i].box; if (!b || !(b.w > 0) || !(b.h > 0)) continue;
      const x = b.l * W, y = b.t * H, w = b.w * W, h = b.h * H, c = color(i);
      o.push(`<rect class="pip${i === sel ? ' sel' : ''}" data-i="${i}" x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" fill="${c}" stroke="${c}" ${ve}/>`);
      const sp = srcFor(S.pips[i]);
      o.push(`<text class="lbl" x="${r(x + fs * .4)}" y="${r(y + fs * 1.2)}" font-size="${r(fs)}">${esc(S.pips[i].name || i + 1)}</text>`);
      if (h > fs * 3.2) o.push(`<text class="modetxt" x="${r(x + fs * .4)}" y="${r(y + fs * 2.15)}" font-size="${r(fs * .72)}">given as ${esc(describe(sp))}</text>`);
      const a = anchorFrac(d, b);
      if (a) o.push(`<circle class="anchor" cx="${r(a[0] * W)}" cy="${r(a[1] * H)}" r="${r(fs * .35)}" ${ve}/>`);
      for (const [fx, fy] of refPoints(sp, b)) {
        const px = fx * W, py = fy * H, k = fs * .3;
        o.push(`<path class="srcpt" d="M${r(px)} ${r(py - k)}L${r(px + k)} ${r(py)}L${r(px)} ${r(py + k)}L${r(px - k)} ${r(py)}Z" ${ve}/>`);
      }
      if (i === sel) {
        // solid = what the source numbers measure, dashed = what the target numbers measure
        drawLines(o, givenLines(sp, S.pips[i].vals, b, W, H).lines, 'given', 'giventxt', 'near', fs, W, H);
        drawLines(o, givenLines(d, targetVals(S.pips[i]) || {}, b, W, H).lines, 'dim', 'dimtxt', 'far', fs, W, H);
        const hs = fs * .7;
        o.push(`<rect class="handle" data-i="${i}" data-h="1" x="${r(x + w - hs / 2)}" y="${r(y + h - hs / 2)}" width="${r(hs)}" height="${r(hs)}" rx="${r(hs / 5)}"/>`);
      }
    }
    // where the target's 0,0 sits
    const ax = SM.axes(d), ox = -ax.x0 / (ax.x1 - ax.x0), oy = -ax.y0 / (ax.y1 - ax.y0);
    if (ox >= 0 && ox <= 1 && oy >= 0 && oy <= 1) {
      const px = ox * W, py = oy * H, s = fs * .6;
      o.push(`<path class="origin" d="M${r(px - s)} ${r(py)}H${r(px + s)}M${r(px)} ${r(py - s)}V${r(py + s)}" ${ve}/>`);
      o.push(`<text class="origintxt" x="${r(Math.min(px + s * .6, W - fs * 2))}" y="${r(py < H - fs ? py + s * 1.8 : py - s * .8)}" font-size="${r(fs * .75)}">0,0</text>`);
    }
    svg.innerHTML = o.join('');
    const p = S.pips[sel];
    $('#pvbar').innerHTML = `<span>Target canvas <b>${W} × ${H}</b>${S.src.W !== d.W || S.src.H !== d.H ? ` · source <b>${S.src.W} × ${S.src.H}</b>` : ''}</span>`
      + (p ? `<span>Selected <b>${esc(p.name || sel + 1)}</b> · given as <b>${esc(describe(srcFor(p)))}</b> → target <b>${esc(describe(d))}</b></span>` : '');
  }

  function frac(e) { const b = svg.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height }; }
  svg.addEventListener('pointerdown', e => {
    const el = e.target.closest('[data-i]'); if (!el) return;
    const i = +el.dataset.i, p = S.pips[i]; if (!p || !p.box) return;
    select(i);
    drag = { i, resize: !!el.dataset.h, p0: frac(e), b0: Object.assign({}, p.box) };
    svg.setPointerCapture(e.pointerId); e.preventDefault();
  });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    const pt = frac(e), dx = pt.x - drag.p0.x, dy = pt.y - drag.p0.y, b0 = drag.b0;
    const p = S.pips[drag.i];
    let b;
    if (!drag.resize) b = { l: b0.l + dx, t: b0.t + dy, w: b0.w, h: b0.h };
    else {
      const w = Math.max(0.01, b0.w + dx);
      b = { l: b0.l, t: b0.t, w, h: p.lock ? w * (S.src.W / S.src.H) / p.aspect : Math.max(0.01, b0.h + dy) };
    }
    const sp = srcFor(p);
    p.vals = fmtVals(sp, SM.fromBox(sp, b));   // rounded to the source's decimals, so it snaps
    p.box = SM.toBox(sp, p.vals);
    updateRowInputs(drag.i); updateRow(drag.i); renderPreview();
  });
  // label size depends on the on-screen width, so redraw when it changes
  if (window.ResizeObserver) { let lastW = 0; new ResizeObserver(([e]) => { const w = Math.round(e.contentRect.width); if (w !== lastW) { lastW = w; renderPreview(); } }).observe(svg.parentNode); }
  const endDrag = () => { if (drag) { drag = null; save(); } };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

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
      S.pips.push({ name: 'PiP ' + (S.pips.length + 1), mode: '', vals, box: SM.toBox(sp, vals), lock: true, aspect: SM.boxAspect(S.src, b) });
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
    S.pips.forEach(p => { p.mode = ''; const sp = srcFor(p); p.vals = p.box ? fmtVals(sp, SM.fromBox(sp, p.box)) : {}; p.box = SM.toBox(sp, p.vals); });
    renderProfile('src'); renderProfile('dst'); renderTable(); renderPreview(); save();
  });
  $('#add').addEventListener('click', () => {
    S.pips.push(newPip()); sel = S.pips.length - 1;
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

  bindProfile('src'); bindProfile('dst'); bindTable();
  renderProfile('src'); renderProfile('dst'); renderTable(); renderPreview();
})();
