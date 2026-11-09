/* Screen margins: a very small PDF writer. Text in Helvetica / Helvetica-Bold (WinAnsi), lines, rectangles and JPEG images.
 * Coordinates are in points from the page's top-left. No dependencies, no compression. */
(function (root) {
  'use strict';

  // Helvetica advance widths (1/1000 em) for ASCII 32..126; everything else counts as 556.
  const HW = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
    278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722,
    667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556,
    333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  // WinAnsi bytes for the characters outside Latin-1 that it has, plus stand-ins for a few it lacks.
  const WIN = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };
  const SUB = { 'Δ': 'd', '→': '->', '←': '<-', '−': '-', '≈': '~', ' ': ' ' };

  /* Unicode -> WinAnsi string (one char per byte). Unknown characters become '?'. */
  function winAnsi(s) {
    let out = '';
    for (const ch of String(s)) {
      if (SUB[ch] !== undefined) { out += SUB[ch]; continue; }
      const c = ch.codePointAt(0);
      if ((c >= 0x20 && c < 0x7f) || (c >= 0xa1 && c <= 0xff)) out += ch;
      else if (WIN[ch]) out += String.fromCharCode(WIN[ch]);
      else out += '?';
    }
    return out;
  }
  function width(s, size, bold) {
    let w = 0;
    for (const ch of winAnsi(s)) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? HW[c - 32] : 556; }
    return w * size / 1000 * (bold ? 1.06 : 1);
  }
  /* Break text into lines no wider than maxW. */
  function wrap(s, size, maxW, bold) {
    const lines = [];
    for (const para of String(s).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const t = line ? line + ' ' + word : word;
        if (!line || width(t, size, bold) <= maxW) line = t;
        else { lines.push(line); line = word; }
      }
      lines.push(line);
    }
    return lines;
  }
  const esc = s => winAnsi(s).replace(/[\\()]/g, c => '\\' + c).replace(/[\x80-\xff]/g, c => '\\' + c.charCodeAt(0).toString(8).padStart(3, '0'));
  const n = v => (Math.round(v * 100) / 100).toString();
  function rgb(c) {
    if (Array.isArray(c)) return c;
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c || '#000000');
    return m ? [1, 2, 3].map(i => parseInt(m[i], 16) / 255) : [0, 0, 0];
  }
  const col = (c, op) => rgb(c).map(n).join(' ') + ' ' + op;

  function create(pw, ph) {
    const pages = [], images = [];
    function page() {
      const ops = [], imgs = new Set();
      const y = v => ph - v;
      const pg = {
        w: pw, h: ph,
        text(x, top, s, o = {}) {
          const size = o.size || 10, bold = !!o.bold;
          let tx = x;
          if (o.align === 'right') tx = x - width(s, size, bold);
          else if (o.align === 'center') tx = x - width(s, size, bold) / 2;
          // top is the top of the line box; the baseline sits ~0.8 em below it
          ops.push(`BT ${col(o.color, 'rg')} /${bold ? 'F2' : 'F1'} ${n(size)} Tf ${n(tx)} ${n(y(top + size * .8))} Td (${esc(s)}) Tj ET`);
          return pg;
        },
        line(x1, y1, x2, y2, o = {}) {
          ops.push(`${col(o.color, 'RG')} ${n(o.width || .5)} w ${o.dash ? `[${o.dash.join(' ')}] 0 d` : '[] 0 d'} ${n(x1)} ${n(y(y1))} m ${n(x2)} ${n(y(y2))} l S`);
          return pg;
        },
        rect(x, top, w, h, o = {}) {
          const paint = o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S';
          ops.push(`${o.fill ? col(o.fill, 'rg') : ''} ${o.stroke ? col(o.stroke, 'RG') + ' ' + n(o.width || .5) + ' w' : ''} ${n(x)} ${n(y(top + h))} ${n(w)} ${n(h)} re ${paint}`);
          return pg;
        },
        /* img: { bytes: Uint8Array (JPEG), w, h } from addJpeg */
        image(img, x, top, w, h) {
          imgs.add(img.id);
          ops.push(`q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(y(top + h))} cm /Im${img.id} Do Q`);
          return pg;
        },
        ops, imgs,
      };
      pages.push(pg);
      return pg;
    }
    function addJpeg(bytes, w, h) { const img = { id: images.length + 1, bytes, w, h }; images.push(img); return img; }

    /* Serialise. Object numbers: 1 catalog, 2 pages, 3 F1, 4 F2, then images, then (page, content) pairs. */
    function bytes() {
      const chunks = [], offsets = [];
      let len = 0;
      const put = x => { const b = typeof x === 'string' ? latin1(x) : x; chunks.push(b); len += b.length; };
      const obj = (num, body, stream) => {
        offsets[num] = len;
        put(`${num} 0 obj\n${body}\n`);
        if (stream) { put('stream\n'); put(stream); put('\nendstream\n'); }
        put('endobj\n');
      };
      const imgBase = 5, pageBase = imgBase + images.length;
      put('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
      obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
      obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageBase + i * 2} 0 R`).join(' ')}] >>`);
      obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      images.forEach((im, i) => obj(imgBase + i,
        `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>`, im.bytes));
      pages.forEach((pg, i) => {
        const content = latin1(pg.ops.join('\n'));
        const xo = [...pg.imgs].map(id => `/Im${id} ${imgBase + id - 1} 0 R`).join(' ');
        obj(pageBase + i * 2, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(pw)} ${n(ph)}] /Contents ${pageBase + i * 2 + 1} 0 R `
          + `/Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo ? ` /XObject << ${xo} >>` : ''} >> >>`);
        obj(pageBase + i * 2 + 1, `<< /Length ${content.length} >>`, content);
      });
      const count = pageBase + pages.length * 2, xref = len;
      put(`xref\n0 ${count}\n0000000000 65535 f \n`);
      for (let i = 1; i < count; i++) put(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
      put(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
      const out = new Uint8Array(len); let at = 0;
      for (const c of chunks) { out.set(c, at); at += c.length; }
      return out;
    }
    return { page, addJpeg, bytes, pages };
  }
  function latin1(s) { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; }

  const api = { create, width, wrap, winAnsi };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SMPDF = api;
})(this);
