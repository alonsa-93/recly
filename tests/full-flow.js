// Full end-to-end run with the REAL captions model (not part of `npm test`: it downloads ~565–760MB once).
// Run: node tests/full-flow.js [path-to-speech.wav]
// Keeps a browser profile in tests/output/profile so the model is downloaded only on the first run.
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'output');
const WAV = path.resolve(process.argv[2] || path.join(__dirname, 'fixtures', 'speech.wav'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const MODEL_HOSTS = /(^|\.)(huggingface\.co|hf\.co|xethub\.hf\.co)$/;
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`, ...a);

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
      const f = path.join(ROOT, rel);
      fs.readFile(f, (e, b) => {
        if (e) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream',
          'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' }); res.end(b);
      });
    }).listen(0, '127.0.0.1', () => resolve(srv));
  });
}
const fileDuration = (page, p) => page.evaluate(async b64 => {
  const b = await (await fetch('data:video/mp4;base64,' + b64)).blob();
  return new Promise(res => { const v = document.createElement('video'); v.muted = true; v.preload = 'metadata';
    v.onloadedmetadata = () => res(v.duration); v.onerror = () => res(-1); v.src = URL.createObjectURL(b); });
}, fs.readFileSync(p).toString('base64'));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const ctx = await chromium.launchPersistentContext(path.join(OUT, 'profile'), {
    acceptDownloads: true, viewport: { width: 1300, height: 950 },
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--auto-select-desktop-capture-source=Entire screen', `--use-file-for-fake-audio-capture=${WAV}`,
      '--enable-unsafe-webgpu', '--enable-features=Vulkan'] });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [], external = new Map(), notes = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') notes.push(m.text()); });
  ctx.on('request', r => { if (/^(blob|data):/.test(r.url())) return; const h = new URL(r.url()).hostname;
    if (!['127.0.0.1', 'localhost'].includes(h)) external.set(h, (external.get(h) || 0) + 1); });
  const save = async (dl, name) => { const p = path.join(OUT, name || dl.suggestedFilename()); await dl.saveAs(p); return p; };
  const waitPhase = p => page.waitForFunction(x => phase === x, p, { timeout: 30000 });
  const step = async (name, fn) => { log('▶', name); await fn(); log('  ✓', name); };

  try {
    await page.goto(base);
    await page.evaluate(() => { try { localStorage.removeItem('recly.lib'); } catch (e) {} });
    await page.reload();
    await page.selectOption('#cd', '3');
    const plan = await page.evaluate(() => asrPlan());
    log('model plan:', JSON.stringify(plan));

    await step('1. record 13 s of screen + mic with a 3 s countdown (default mode, MP4)', async () => {
      assert.equal(await page.inputValue('#fmt'), 'mp4');
      await page.click('#btnStart');
      await waitPhase('countdown');
      await waitPhase('recording');
      await page.waitForTimeout(4000);
      await page.click('#btnPause'); await waitPhase('paused'); await page.waitForTimeout(1500);
      await page.click('#btnPause'); await waitPhase('recording');
      await page.waitForTimeout(9000);
      await page.click('#btnStop');
      await waitPhase('done');
      const info = await page.evaluate(() => ({ type: blob.type, size: blob.size, tm: document.getElementById('tm').textContent }));
      log('  take:', JSON.stringify(info));
      assert.match(info.type, /^video\/mp4/);
    });

    await step('2. speech detection shows the captions card', async () => {
      await page.waitForFunction(() => speech !== null, null, { timeout: 30000 });
      const sp = await page.evaluate(() => ({ has: speech.has, secs: +speech.secs.toFixed(2), wins: speech.wins.length }));
      log('  speech:', JSON.stringify(sp), '| card:', await page.textContent('#capInfo'));
      assert.equal(sp.has, true);
      assert.equal(await page.isVisible('#capBox'), true);
    });

    await step('3. the take is in the library', async () => {
      const n = await page.locator('#libList li:not(.libempty)').count();
      log('  library entries:', n);
      assert.ok(n >= 1);
    });

    let cached = await page.evaluate(() => asrPlan().then(asrCached));
    await step(`4. captions with the real model (${cached ? 'already cached' : 'consent + download'})`, async () => {
      await page.selectOption('#capLang', 'hebrew');
      await page.click('#btnCap');
      if (!cached) {
        await page.waitForFunction(() => document.getElementById('asrDlg').open, null, { timeout: 15000 });
        log('  consent dialog:', (await page.textContent('#asrText')).replace(/\s+/g, ' ').slice(0, 160), '…');
        assert.equal(external.size, 0, 'nothing downloaded before consent');
        await page.click('#asrYes');
      }
      let last = '';
      const tick = setInterval(async () => { try { const m = await page.textContent('#capMsg'); if (m && m !== last) { last = m; log('  ', m); } } catch (e) {} }, 5000);
      try {
        await page.waitForFunction(() => cues.length > 0 || /נכשלה|לא זוהה/.test(document.getElementById('capMsg').textContent), null, { timeout: 60 * 60000, polling: 1000 });
      } finally { clearInterval(tick); }
      const msg = await page.textContent('#capMsg');
      log('  result:', msg);
      const cs = await page.evaluate(() => cues.map(c => `${c.start.toFixed(1)}–${c.end.toFixed(1)}  ${c.text}`));
      cs.forEach(c => log('    ', c));
      assert.ok(cs.length > 0, 'captions created');
      assert.equal(await page.evaluate(() => document.querySelectorAll('#playback track').length), 1);
    });

    await step('5. export SRT and a video with burned-in captions', async () => {
      const [srt] = await Promise.all([page.waitForEvent('download'), page.click('#btnSrt')]);
      const srtPath = await save(srt);
      log('  SRT:', srtPath);
      assert.match(fs.readFileSync(srtPath, 'utf8'), /^\uFEFF1\r\n\d\d:\d\d:\d\d,\d{3} --> /);
      const [vid] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('#btnBurn')]);
      const vp = await save(vid);
      const d = await fileDuration(page, vp);
      log('  burned video:', vp, `${(fs.statSync(vp).size / 1048576).toFixed(2)} MB, ${d.toFixed(2)} s`);
      assert.ok(d > 5);
    });

    await step('6. download the take itself', async () => {
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnDl')]);
      const p = await save(dl);
      log('  take:', p, `${(fs.statSync(p).size / 1048576).toFixed(2)} MB, ${(await fileDuration(page, p)).toFixed(2)} s`);
    });

    await step('7. trim 2 s → 8 s, captions again from the cached model with no dialog', async () => {
      await page.evaluate(() => { document.getElementById('playback').currentTime = 2; });
      await page.click('#btnIn');
      await page.evaluate(() => { document.getElementById('playback').currentTime = 8; });
      await page.click('#btnOut');
      log('  trim label:', await page.textContent('#trimLbl'));
      await page.click('#btnTrim');
      await page.waitForFunction(() => !exporting && document.getElementById('btnUndo').style.display !== 'none', null, { timeout: 120000 });
      const d = await page.evaluate(() => clipDur());
      log('  trimmed duration:', d.toFixed(2));
      assert.ok(d > 5 && d < 7.5);
      await page.waitForFunction(() => speech !== null, null, { timeout: 30000 });
      if (await page.evaluate(() => speech.has)) {
        await page.click('#btnCap');
        await page.waitForTimeout(1500);
        assert.equal(await page.evaluate(() => document.getElementById('asrDlg').open), false, 'no second consent');
        await page.waitForFunction(() => cues.length > 0 || /נכשלה|לא זוהה/.test(document.getElementById('capMsg').textContent), null, { timeout: 30 * 60000, polling: 1000 });
        (await page.evaluate(() => cues.map(c => `${c.start.toFixed(1)}–${c.end.toFixed(1)}  ${c.text}`))).forEach(c => log('    ', c));
      } else log('  (no speech left in the trimmed part)');
      await page.click('#btnUndo');
      log('  undo → duration', (await page.evaluate(() => clipDur())).toFixed(2));
    });

    await step('8. offline: reload with the network off, open the take from the library, captions still work', async () => {
      const before = new Map(external);
      await ctx.setOffline(true);
      await page.reload();
      await page.waitForSelector('#libList li:not(.libempty) button');
      await page.locator('#libList li:not(.libempty) button').first().click();
      await waitPhase('done');
      await page.waitForFunction(() => speech !== null && speech.has, null, { timeout: 30000 });
      await page.click('#btnCap');
      await page.waitForFunction(() => cues.length > 0 || /נכשלה|לא זוהה/.test(document.getElementById('capMsg').textContent), null, { timeout: 30 * 60000, polling: 1000 });
      log('  offline result:', await page.textContent('#capMsg'));
      assert.ok(await page.evaluate(() => cues.length) > 0, 'captions offline from the cache');
      await ctx.setOffline(false);
      for (const [h, n] of external) assert.equal(n, before.get(h), `no requests while offline (${h})`);
    });

    await page.screenshot({ path: path.join(OUT, 'final.png'), fullPage: true });
    log('external hosts:', JSON.stringify([...external]));
    for (const h of external.keys()) assert.match(h, MODEL_HOSTS, `only the model host may be contacted, got ${h}`);
    assert.deepEqual(errors, [], 'page errors');
    log('ALL STEPS PASSED');
  } catch (e) {
    log('FAILED:', e.message);
    log('external hosts:', JSON.stringify([...external]), '| page errors:', JSON.stringify(errors), '| console errors:', JSON.stringify(notes.slice(-5)));
    try { await page.screenshot({ path: path.join(OUT, 'failure.png'), fullPage: true }); } catch (x) {}
    process.exitCode = 1;
  } finally { await ctx.close(); srv.close(); }
})();
