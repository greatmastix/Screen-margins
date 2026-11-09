// Browser tests: drives the real page in Chromium with Playwright.
// Run: docker run --rm --ipc=host -v "$PWD":/w -w /w mcr.microsoft.com/playwright:v1.63.0-noble \
//        sh -c 'npm i --no-save --no-package-lock playwright@1.63.0 >/dev/null && node test/e2e.test.mjs'
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { chromium, firefox, webkit } from 'playwright';

// the page lives in public/ on the playground and at the top of the GitHub repo
const here = dirname(fileURLToPath(import.meta.url));
const root = existsSync(join(here, '../public/index.html')) ? join(here, '../public') : join(here, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  let p = normalize(decodeURIComponent(req.url.split(/[?#]/)[0])).replace(/^(\.\.[/\\])+/, '');
  if (p.endsWith('/')) p += 'index.html';
  const f = join(root, p);
  if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${server.address().port}/`;

// BROWSER=firefox or webkit to run in another engine (Chromium by default)
const ENGINE = process.env.BROWSER || 'chromium';
const browser = await { chromium, firefox, webkit }[ENGINE].launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true,
  permissions: ENGINE === 'chromium' ? ['clipboard-read', 'clipboard-write'] : [] });
const MOD = ENGINE === 'webkit' ? 'Meta' : 'Control';
// only Chromium lets a test read the real clipboard; elsewhere record what the page writes
if (ENGINE !== 'chromium') await ctx.addInitScript(() => {
  const rec = { write: async items => { window.__clip = await (await items[0].getType('text/plain')).text(); }, writeText: async t => { window.__clip = t; },
    readText: async () => window.__clip || '' };
  Object.defineProperty(navigator, 'clipboard', { value: rec, configurable: true });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const row = i => `#tbl tr[data-i="${i}"]`;
const val = (i, k) => page.inputValue(`${row(i)} input[data-c="${k}"]`);
const out = async i => page.$$eval(`${row(i)} td.out`, tds => tds.map(t => t.textContent));
const fresh = async () => { await page.goto(URL0); await page.evaluate(() => localStorage.clear()); await page.goto(URL0); };
const settle = () => page.waitForTimeout(350);   // saves are debounced by 200 ms
let n = 0;
async function t(name, fn) {
  try { await fn(); n++; } catch (e) { console.error(`FAIL ${name}`); throw e; }
}

await t('loads with the default PiP and converts it', async () => {
  await fresh();
  assert.equal(await page.$$eval('#tbl tr[data-i]', r => r.length), 1);
  assert.deepEqual(await out(0), ['1560', '860', '640', '360']);   // top-left 1240,680 -> centre
});

await t('sums, and the clown', async () => {
  await page.fill(`${row(0)} input[data-c="x"]`, '1200+40');
  await page.press(`${row(0)} input[data-c="x"]`, 'Enter');
  assert.equal(await val(0, 'x'), '1240');
  await page.fill(`${row(0)} input[data-c="x"]`, '5/0');
  await page.press(`${row(0)} input[data-c="x"]`, 'Enter');
  assert.equal(await val(0, 'x'), '\u{1F921}');
  assert.equal(await page.getAttribute('#pdf', 'aria-disabled'), 'true');
  await page.fill(`${row(0)} input[data-c="x"]`, '1240');
  assert.equal(await page.getAttribute('#pdf', 'aria-disabled'), 'false');
});

await t('ATEM preset: top-left quarter is -8, 4.5 at size 0.5', async () => {
  await page.selectOption('#prof-dst select[data-act=load]', 'preset:atem-dve');
  for (const [k, v] of [['x', '0'], ['y', '0'], ['w', '960'], ['h', '540']]) await page.fill(`${row(0)} input[data-c="${k}"]`, v);
  assert.deepEqual(await out(0), ['-8', '4.5', '0.5', '0.5']);
});

await t('undo and redo, by key and button', async () => {
  await settle();
  await page.fill(`${row(0)} input[data-c="x"]`, '100'); await settle();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press(`${MOD}+z`);
  assert.equal(await val(0, 'x'), '0');
  await page.keyboard.press(`${MOD}+Shift+z`);
  assert.equal(await val(0, 'x'), '100');
  await page.click('#add'); await settle();
  assert.equal(await page.$$eval('#tbl tr[data-i]', r => r.length), 2);
  await page.click('#undo');
  assert.equal(await page.$$eval('#tbl tr[data-i]', r => r.length), 1);
  await page.click('#redo');
  assert.equal(await page.$$eval('#tbl tr[data-i]', r => r.length), 2);
  await page.click('#undo');
  // the undone state is what's stored
  await page.reload();
  assert.equal(await page.$$eval('#tbl tr[data-i]', r => r.length), 1);
  assert.equal(await val(0, 'x'), '100');
});

await t('arrow keys nudge the selected PiP; Alt resizes', async () => {
  await page.locator('#pv').scrollIntoViewIfNeeded();
  const box = await page.locator('#pv rect.pip').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press('ArrowRight');
  assert.equal(await val(0, 'x'), '101');
  await page.keyboard.press('Shift+ArrowDown');
  assert.equal(await val(0, 'y'), '10');
  await page.keyboard.press('Alt+ArrowRight');   // aspect is locked: H follows
  assert.equal(await val(0, 'w'), '961');
  assert.equal(await val(0, 'h'), '541');
});

await t('dragging snaps to the frame edge, Alt drags freely', async () => {
  for (const [k, v] of [['x', '40'], ['y', '40'], ['w', '640'], ['h', '360']]) await page.fill(`${row(0)} input[data-c="${k}"]`, v);
  await page.locator('#pv').scrollIntoViewIfNeeded();
  const pv = await page.locator('#pv').boundingBox(), k = pv.width / 1920;
  const at = (x, y) => [pv.x + x * k, pv.y + y * k];
  // grab the middle, move left by 38 canvas px (4 screen px from the edge): snaps to 0
  await page.mouse.move(...at(360, 220)); await page.mouse.down();
  await page.mouse.move(...at(322, 220), { steps: 4 });
  assert.equal(await page.$$eval('#pv path.snap', p => p.length), 1);
  await page.mouse.up();
  assert.equal(await val(0, 'x'), '0');
  assert.equal(await page.$$eval('#pv path.snap', p => p.length), 0);
  await page.keyboard.down('Alt');
  await page.mouse.move(...at(320, 220)); await page.mouse.down();
  await page.mouse.move(...at(330, 220), { steps: 4 }); await page.mouse.up();
  await page.keyboard.up('Alt');
  const x = +await val(0, 'x');
  assert.ok(x > 5 && x < 15, `free drag: x = ${x}`);
});

await t('every corner and edge resizes; the lock keeps the shape', async () => {
  for (const [k, v] of [['x', '400'], ['y', '300'], ['w', '640'], ['h', '360']]) await page.fill(`${row(0)} input[data-c="${k}"]`, v);
  await page.locator('#pv').scrollIntoViewIfNeeded();
  assert.equal(await page.$$eval('#pv rect.handle', h => h.length), 8);
  const pv = await page.locator('#pv').boundingBox(), k = pv.width / 1920;
  const at = (x, y) => [pv.x + x * k, pv.y + y * k];
  const pull = async (from, to) => {
    await page.keyboard.down('Alt');   // no snapping
    await page.mouse.move(...at(...from)); await page.mouse.down();
    await page.mouse.move(...at(...to), { steps: 4 }); await page.mouse.up();
    await page.keyboard.up('Alt');
  };
  const box = async () => Promise.all(['x', 'y', 'w', 'h'].map(async c => +await val(0, c)));
  // the mouse lands on whole screen pixels (about 2.4 canvas px here), so allow a little
  const near = (got, want) => got.forEach((g, i) => assert.ok(Math.abs(g - want[i]) <= 2, `${got} vs ${want}`));
  // locked, top-left corner 80 px left: grows to 720 wide, 16:9 kept, bottom-right stays at 1040, 660
  await pull([400, 300], [320, 300]);
  near(await box(), [320, 255, 720, 405]);
  const [, yA, w1, h1] = await box(); const y1 = () => yA;
  assert.ok(Math.abs(w1 / h1 - 16 / 9) < 0.01, 'still 16:9');
  // unlocked, left edge 20 px further: only X and W change
  await page.click(`${row(0)} [data-lock]`);
  await pull([320, yA + h1 / 2], [300, yA + h1 / 2]);
  const [x0, y0, w0, h0] = await box();
  near([x0, w0], [300, 740]); assert.equal(y0, y1()); assert.equal(h0, h1);
  // locked again, bottom edge 45 px down: W follows, the PiP stays centred
  await page.click(`${row(0)} [data-lock]`);
  const cx = x0 + w0 / 2;
  await pull([cx, y0 + h0], [cx, y0 + h0 + 45]);
  const [x, y, w, h] = await box();
  assert.equal(y, y0); near([h], [h0 + 45]);
  assert.ok(Math.abs(w / h - w0 / h0) < 0.01, `aspect ${w / h} vs ${w0 / h0}`);
  assert.ok(Math.abs(x + w / 2 - cx) <= 1, `centre ${x + w / 2} vs ${cx}`);
});

await t('snaps to equal gaps; the Snap menu turns kinds off', async () => {
  await fresh();
  const set = async (i, v) => { for (const [k, x] of Object.entries(v)) await page.fill(`${row(i)} input[data-c="${k}"]`, String(x)); };
  await page.click(`${row(0)} [data-lock]`);
  await set(0, { x: 200, y: 100, w: 400, h: 300 });
  await page.click('#add');
  await set(1, { x: 1300, y: 500, w: 400, h: 300 });
  await page.locator('#pv').scrollIntoViewIfNeeded();
  const pv = await page.locator('#pv').boundingBox(), k = pv.width / 1920;
  const at = (x, y) => [pv.x + x * k, pv.y + y * k];
  // drag PiP 2 by its middle (now at 1500, 650) so its left edge lands near x, and its top near PiP 1's (snaps y to 100)
  const moveTo = async (x, gaps) => {
    await page.mouse.move(...at(1500, 650)); await page.mouse.down();
    await page.mouse.move(...at(x + 200, 252), { steps: 5 });
    if (gaps !== undefined) assert.equal(await page.$$eval('#pv path.snap.gap', p => p.length), gaps, `gap markers at ${x}`);
    await page.mouse.up();
    const got = +await val(1, 'x');
    await set(1, { x: 1300, y: 500 });
    return got;
  };
  assert.equal(await moveTo(1064, 2), 1060);   // PiP 1 -> PiP 2 = PiP 2 -> right edge (460)
  assert.equal(await moveTo(1244, 2), 1240);   // centred between the centre line and the right edge
  assert.equal(await moveTo(804, 2), 800);     // same gap as left edge -> PiP 1 (200)
  // the menu: equal gaps off, the same drag stays where the mouse put it
  await page.click('#snapsum');
  await page.uncheck('[data-snap=equal]');
  await page.click('#snapsum');
  const x = await moveTo(1064);
  assert.ok(Math.abs(x - 1064) <= 3, `no equal snap: ${x}`);
  // and it's remembered
  await page.reload();
  await page.click('#snapsum');
  assert.equal(await page.isChecked('[data-snap=equal]'), false);
  await page.check('[data-snap=equal]');
  await page.click('#snapsum');
});

await t('resizing snaps an edge to the same gap as the other side', async () => {
  // PiP 1 sits 200 from the left edge; pull its right edge to about 200 from the right edge
  await page.locator('#pv').scrollIntoViewIfNeeded();
  const pv = await page.locator('#pv').boundingBox(), k = pv.width / 1920;
  const at = (x, y) => [pv.x + x * k, pv.y + y * k];
  await page.mouse.move(...at(1700, 650)); await page.mouse.down();     // select PiP 2 out of the way first
  await page.mouse.up();
  await page.locator(`${row(0)} input.name`).click();
  await page.mouse.move(...at(600, 250)); await page.mouse.down();     // PiP 1's right edge handle (unlocked)
  await page.mouse.move(...at(1716, 250), { steps: 6 }); await page.mouse.up();
  assert.equal(+await val(0, 'w'), 1520);
});

await t('relative PiP follows its reference', async () => {
  await fresh();
  for (const [k, v] of [['x', '80'], ['y', '80']]) await page.fill(`${row(0)} input[data-c="${k}"]`, v);
  await page.click('#add');
  await page.selectOption(`${row(1)} select[data-m]`, 'rel:1');
  await page.selectOption(`${row(1)} select[data-rf]`, 'br');
  await page.fill(`${row(1)} input[data-c="rx"]`, '40'); await page.fill(`${row(1)} input[data-c="ry"]`, '40');
  assert.deepEqual((await out(1)).slice(0, 2), ['1080', '660']);   // 80+640+40 + 320, 80+360+40 + 180
  await page.fill(`${row(0)} input[data-c="x"]`, '100');
  assert.equal((await out(1))[0], '1100');
});

await t('share link round-trips the layout, keeps saved profiles, Undo restores', async () => {
  await page.fill(`${row(0)} input.name`, 'Speaker «1»'); await settle();
  await page.click('#share');
  await page.waitForFunction(() => /Link copied/.test(document.querySelector('#toast').textContent));
  const link = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(link, /#s=z[\w-]+$/);
  // somebody else's browser: different layout, a saved profile of their own
  await fresh();
  await page.fill(`${row(0)} input[data-c="x"]`, '7'); await settle();
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('screen-margins:v1')); s.saved = { Mine: s.src }; localStorage.setItem('screen-margins:v1', JSON.stringify(s)); });
  await page.goto(URL0);
  await page.goto(link);
  await page.waitForFunction(() => document.querySelectorAll('#tbl tr[data-i]').length === 2);
  assert.equal(await page.inputValue(`${row(0)} input.name`), 'Speaker «1»');
  assert.equal((await out(1))[0], '1100');
  assert.equal(new URL(page.url()).hash, '', 'hash is removed after opening');
  assert.ok(await page.evaluate(() => !!JSON.parse(localStorage.getItem('screen-margins:v1')).saved.Mine), 'saved profiles kept');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press(`${MOD}+z`);
  assert.equal(await page.$$eval('#tbl tr[data-i]', r => r.length), 1);
  assert.equal(await val(0, 'x'), '7');
});

await t('a damaged link is refused without touching the layout', async () => {
  await page.goto(URL0 + '#s=zAAAA');
  await page.waitForTimeout(300);
  assert.match(await page.textContent('#toast'), /damaged/);
  assert.equal(await val(0, 'x'), '7');
});

await t('a hostile link is cleaned', async () => {
  const bad = { v: 1, src: { unit: '<img src=x onerror=alert(1)>', W: -5, labels: { x: '<b>X</b>' } }, dst: {}, pips: [{ name: '<script>1</script>', mode: 'evil', vals: { x: '1', '<a>': 2 } }] };
  const code = 'j' + Buffer.from(JSON.stringify(bad)).toString('base64url');
  await page.goto(URL0 + '#s=' + code);
  await page.waitForFunction(() => /Opened/.test(document.querySelector('#toast').textContent));
  assert.equal(await page.inputValue(`${row(0)} input.name`), '<script>1</script>');
  assert.equal(await page.$$eval('#tbl script, #tbl img, #prof-src img', e => e.length), 0);
  assert.equal(await page.inputValue('#prof-src input[data-k="W"]'), '1920');
});

await t('PNG and PDF downloads; blocked while a number is invalid', async () => {
  await fresh();
  for (const [id, re, magic] of [['#png', /\.png$/, '\x89PNG'], ['#pdf', /\.pdf$/, '%PDF']]) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(id)]);
    assert.match(dl.suggestedFilename(), re);
    const f = join(mkdtempSync(join(tmpdir(), 'sm-')), 'out'); await dl.saveAs(f);
    assert.equal(readFileSync(f).subarray(0, magic.length).toString('latin1'), magic);
  }
  let downloads = 0; page.on('download', () => downloads++);
  await page.fill(`${row(0)} input[data-c="w"]`, 'abc');
  await page.click('#png', { force: true }); await page.waitForTimeout(400);
  assert.equal(downloads, 0);
  assert.match(await page.textContent('#toast'), /Can.t export yet/);
});

await t('canvas background survives a reload', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sm-'));
  // a 1×1 PNG
  writeFileSync(join(dir, 'bg.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  await page.setInputFiles('#bgfile', join(dir, 'bg.png'));
  await page.waitForFunction(() => document.querySelectorAll('#pv image').length === 1);
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('#pv image').length === 1);
  await page.click('#bgdel');
  assert.equal(await page.$$eval('#pv image', e => e.length), 0);
});

assert.deepEqual(errors, [], 'no errors in the page');
await browser.close(); server.close();
console.log(`ok, ${n} browser tests (${ENGINE})`);
