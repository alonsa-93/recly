// End-to-end tests: real recordings in Chromium with fake camera, mic and screen.
// Run: npm test   (needs `npm install` once; uses Playwright's bundled Chromium)
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
      const f = path.join(ROOT, rel);
      if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(f, (e, b) => {
        if (e) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream',
          'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' });
        res.end(b);
      });
    }).listen(0, '127.0.0.1', () => resolve(srv));
  });
}

const tests = [];
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const test = (name, fn) => { if (!ONLY || ONLY.test(name)) tests.push({ name, fn }); };

/* Opens the app in a fresh page and collects page errors and any request that leaves localhost. */
async function open(browser, base, { init } = {}) {
  const context = await browser.newContext({ acceptDownloads: true });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { const u = new URL(r.url()); if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !/^(blob|data):/.test(r.url())) external.push(r.url()); });
  await page.goto(base);
  await page.selectOption('#cd', '0');
  const done = async () => {
    assert.deepEqual(errors, [], 'page errors');
    assert.deepEqual(external, [], 'requests outside localhost (rule: no network)');
    await context.close();
  };
  return { page, done };
}
const phase = page => page.evaluate(() => phase);
const waitPhase = (page, p) => page.waitForFunction(x => phase === x, p, { timeout: 15000 });

/* Recording finished → the playback video has a real, finite duration. */
async function assertPlayable(page) {
  await waitPhase(page, 'done');
  await page.waitForFunction(() => { const v = document.getElementById('playback'); return v.readyState >= 1; }, null, { timeout: 10000 });
  const size = await page.evaluate(() => blob.size);
  assert.ok(size > 1000, `blob too small: ${size}`);
  // The patched file must report its duration on its own, without the seek trick.
  const dur = await page.evaluate(() => new Promise(res => {
    const v = document.createElement('video'); v.muted = true; v.preload = 'metadata';
    v.onloadedmetadata = () => res(v.duration); v.onerror = () => res(-1);
    v.src = URL.createObjectURL(blob);
  }));
  assert.ok(Number.isFinite(dur) && dur > 0.5, `duration in file header: ${dur}`);
  return dur;
}

/* ---------------------------------------------------------------- */

test('screen recording end to end: MP4 by default, real duration, .mp4 download', async (browser, base) => {
  const { page, done } = await open(browser, base);
  assert.equal(await page.inputValue('#fmt'), 'mp4');
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  await page.waitForTimeout(3000);
  await page.click('#btnStop');
  const dur = await assertPlayable(page);
  assert.ok(dur > 2 && dur < 6, `3 s recording reported ${dur} s`);
  assert.match(await page.evaluate(() => blob.type), /^video\/mp4/);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnDl')]);
  assert.match(dl.suggestedFilename(), /^recly-.*\.mp4$/);
  await done();
});

test('WebM option: duration header patched, .webm download', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.selectOption('#fmt', 'webm');
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  await page.waitForTimeout(3000);
  await page.click('#btnStop');
  const dur = await assertPlayable(page);
  assert.ok(dur > 2 && dur < 6, `3 s recording reported ${dur} s`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnDl')]);
  assert.match(dl.suggestedFilename(), /^recly-.*\.webm$/);
  await done();
});

test('camera-only recording goes through the canvas path', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.click('#seg button[data-m="cam"]');
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  assert.equal(await page.evaluate(() => !!canvasTrack), true, 'canvas track should be recorded');
  await page.waitForTimeout(2500);
  await page.click('#btnStop');
  await assertPlayable(page);
  await done();
});

test('screen + camera records with the bubble', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.click('#seg button[data-m="screen+cam"]');
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  assert.equal(await page.evaluate(() => !!sCam && !!canvasTrack), true);
  await page.waitForTimeout(2000);
  await page.click('#btnStop');
  await assertPlayable(page);
  await done();
});

test('rule 1: a failing camera does not kill a screen recording', async (browser, base) => {
  const { page, done } = await open(browser, base, { init: () => {
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = c => c && c.video ? Promise.reject(new DOMException('busy', 'NotReadableError')) : orig(c);
  } });
  await page.click('#seg button[data-m="screen+cam"]');
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  assert.match(await page.textContent('#alert'), /המצלמה לא זמינה/);
  await page.waitForTimeout(2000);
  await page.click('#btnStop');
  await assertPlayable(page);
  await done();
});

test('camera-only with a failing camera stops cleanly instead of recording black', async (browser, base) => {
  const { page, done } = await open(browser, base, { init: () => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('busy', 'NotReadableError'));
  } });
  await page.click('#seg button[data-m="cam"]');
  await page.click('#btnStart');
  await page.waitForFunction(() => document.getElementById('alert').textContent.includes('תפוסים'));
  assert.equal(await phase(page), 'idle');
  assert.equal(await page.evaluate(() => rec), null);
  await done();
});

test('second start during the countdown is ignored; Esc cancels and releases the screen', async (browser, base) => {
  const { page, done } = await open(browser, base, { init: () => {
    window.__gdm = 0;
    const orig = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = c => { window.__gdm++; return orig(c); };
  } });
  await page.selectOption('#cd', '3');
  await page.click('#btnStart');
  await waitPhase(page, 'countdown');
  await page.evaluate(() => { start(); document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'r', bubbles: true })); });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__gdm), 1, 'getDisplayMedia calls');
  await page.keyboard.press('Escape');
  assert.equal(await phase(page), 'idle');
  assert.equal(await page.isVisible('#countdown'), false, 'countdown overlay hidden');
  assert.equal(await page.evaluate(() => sScr), null, 'screen stream released');
  await page.waitForTimeout(3500);   // the old countdown loop must not wake up and start recording
  assert.equal(await phase(page), 'idle');
  assert.equal(await page.evaluate(() => rec), null);
  await done();
});

test('shortcuts use the physical key, so a Hebrew layout works (ר = R, ד = S)', async (browser, base) => {
  const { page, done } = await open(browser, base);
  const key = (code, k) => page.evaluate(([c, kk]) => document.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: kk, bubbles: true })), [code, k]);
  await page.focus('body');
  await key('KeyR', 'ר');
  await waitPhase(page, 'recording');
  await page.waitForTimeout(1500);
  await key('Space', ' ');
  assert.equal(await phase(page), 'paused');
  await key('Space', ' ');
  assert.equal(await phase(page), 'recording');
  await key('KeyS', 'ד');
  await assertPlayable(page);
  await done();
});

test('settings are locked while recording and unlocked afterwards', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  for (const sel of ['#seg button[data-m="cam"]', '#fps', '#bitrate', '#mic', '#btnStart'])
    assert.equal(await page.isDisabled(sel), true, `${sel} should be disabled`);
  await page.click('#btnStop');
  await waitPhase(page, 'done');
  assert.equal(await page.isDisabled('#seg button[data-m="cam"]'), false);
  await done();
});

test('closing the tab with an undownloaded recording asks first (library off)', async (browser, base) => {
  const { page } = await open(browser, base);
  await page.click('#panelLib label.sw');
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  await page.waitForTimeout(1000);
  await page.click('#btnStop');
  await waitPhase(page, 'done');
  let asked = false;
  page.on('dialog', d => { asked = d.type() === 'beforeunload'; d.dismiss(); });
  await page.close({ runBeforeUnload: true });
  await page.waitForTimeout(500);
  assert.equal(asked, true, 'beforeunload dialog');
  await page.context().close();
});

test('alert text is never parsed as HTML', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.evaluate(() => say('<img src=x onerror="window.__x=1">', { b: 'bold' }));
  assert.equal(await page.evaluate(() => document.querySelector('#alert img')), null);
  assert.equal(await page.textContent('#alert b'), 'bold');
  await done();
});

test('draw loop is driven by a worker timer, not setInterval', async (browser, base) => {
  const { page, done } = await open(browser, base, { init: () => {
    window.__workers = 0; const W = window.Worker;
    window.Worker = function (...a) { window.__workers++; return new W(...a); };
  } });
  assert.equal(await page.evaluate(() => window.__workers), 1);
  await done();
});

/* The folder picker is a native dialog Playwright can't drive, so it returns the page's
   private (OPFS) folder instead. That folder supports the same write API as a real one. */
const fakeFolder = (perm = 'granted') => `
  window.__picks = 0;
  window.showDirectoryPicker = async () => {
    window.__picks++;
    const d = await navigator.storage.getDirectory();
    d.queryPermission = async () => ${JSON.stringify(perm)};
    d.requestPermission = async () => ${JSON.stringify(perm)};
    return d;
  };`;
const folderFiles = page => page.evaluate(async () => {
  const out = [];
  for await (const [name, h] of (await navigator.storage.getDirectory()).entries())
    if (h.kind === 'file') out.push({ name, size: (await h.getFile()).size });
  return out;
});

test('save to folder is off by default and opens no dialog', async (browser, base) => {
  const { page, done } = await open(browser, base, { init: fakeFolder() });
  assert.equal(await page.isVisible('#panelDisk'), true);
  assert.equal(await page.isChecked('#disk'), false);
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  await page.waitForTimeout(800);
  await page.click('#btnStop');
  await waitPhase(page, 'done');
  assert.equal(await page.evaluate(() => window.__picks), 0, 'folder picker opened');
  assert.deepEqual(await folderFiles(page), []);
  await done();
});

test('save to folder streams to a file, keeps nothing in memory, patches the duration', async (browser, base) => {
  const { page, done } = await open(browser, base, { init: fakeFolder() });
  await page.selectOption('#fmt', 'webm');
  await page.click('#panelDisk label.sw');
  assert.equal(await page.isChecked('#disk'), true);
  assert.match(await page.textContent('#diskDir'), /תיקייה/);
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  await page.waitForTimeout(3000);
  assert.equal(await page.evaluate(() => chunks.length), 0, 'chunks kept in memory');
  await page.click('#btnStop');
  const dur = await assertPlayable(page);
  assert.ok(dur > 2 && dur < 6, `3 s recording reported ${dur} s`);
  const files = await folderFiles(page);
  assert.equal(files.length, 1, JSON.stringify(files));
  assert.match(files[0].name, /^recly-.*\.webm$/);
  assert.ok(files[0].size > 1000);
  assert.equal(await page.isVisible('#btnDl'), false, 'download button hidden');
  assert.match(await page.textContent('#alert'), /נשמר בתיקייה/);
  // Already saved, so leaving the page must not warn.
  let asked = false;
  page.on('dialog', d => { asked = true; d.dismiss(); });
  await page.close({ runBeforeUnload: true });
  await new Promise(r => setTimeout(r, 300));
  assert.equal(asked, false);
  await done();
});

test('save to folder: two takes in a row get two files, a cancelled countdown leaves none', async (browser, base) => {
  const { page, done } = await open(browser, base, { init: fakeFolder() });
  await page.click('#panelDisk label.sw');
  for (let i = 0; i < 2; i++) {
    await page.click('#btnStart');
    await waitPhase(page, 'recording');
    await page.waitForTimeout(700);
    await page.click('#btnStop');
    await waitPhase(page, 'done');
    await page.click('#btnNew');
  }
  await page.selectOption('#cd', '3');
  await page.click('#btnStart');
  await waitPhase(page, 'countdown');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const names = (await folderFiles(page)).map(f => f.name);
  assert.equal(names.length, 2, JSON.stringify(names));
  assert.notEqual(names[0], names[1]);
  await done();
});

test('save to folder without permission falls back to memory and still records', async (browser, base) => {
  const { page, done } = await open(browser, base, { init: fakeFolder('denied') });
  await page.click('#panelDisk label.sw');
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  assert.match(await page.textContent('#alert'), /אין הרשאה/);
  await page.waitForTimeout(1500);
  await page.click('#btnStop');
  await assertPlayable(page);
  assert.equal(await page.isVisible('#btnDl'), true, 'download button shown');
  await done();
});

test('closing the folder picker leaves the option off', async (browser, base) => {
  const { page, done } = await open(browser, base, { init: () => {
    window.showDirectoryPicker = () => Promise.reject(new DOMException('cancel', 'AbortError'));
  } });
  await page.click('#panelDisk label.sw');
  await page.waitForTimeout(200);
  assert.equal(await page.isChecked('#disk'), false);
  await done();
});

/* ---------- design, UI and accessibility ---------- */

/* axe-core is loaded from node_modules, so the "no external requests" check still holds. */
async function axe(page) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  return page.evaluate(async () => {
    const r = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] });
    return r.violations.map(v => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
  });
}

for (const scheme of ['dark', 'light']) {
  test(`no WCAG 2.1 AA violations (axe), ${scheme} theme`, async (browser, base) => {
    const { page, done } = await open(browser, base);
    if (scheme === 'dark') await page.click('#btnTheme');      // light is the default; dark is opt-in
    await page.waitForTimeout(400);                            // let colour transitions finish
    assert.deepEqual(await axe(page), []);
    await page.click('#seg button[data-m="screen+cam"]');     // camera panel visible too
    await page.click('#lnkHelp');                              // and the dialog
    assert.deepEqual(await axe(page), []);
    await done();
  });
}

test('theme toggle switches and is remembered', async (browser, base) => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto(base);
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const light = await bg();
  await page.click('#btnTheme');
  assert.notEqual(await bg(), light);
  assert.equal(await page.getAttribute('#btnTheme', 'aria-label'), 'מצב בהיר');
  await page.reload();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await context.close();
});

test('mode picker is a radio group driven by the arrow keys', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.focus('#seg button[data-m="screen"]');
  await page.keyboard.press('ArrowLeft');               // RTL: left is the next option
  assert.equal(await page.evaluate(() => mode), 'screen+cam');
  assert.equal(await page.getAttribute('#seg button[data-m="screen+cam"]', 'aria-checked'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.m), 'screen+cam');
  await page.keyboard.press('End');
  assert.equal(await page.evaluate(() => mode), 'cam');
  await page.keyboard.press('ArrowLeft');               // wraps around
  assert.equal(await page.evaluate(() => mode), 'screen');
  await done();
});

test('the opening text matches the chosen mode', async (browser, base) => {
  const { page, done } = await open(browser, base);
  assert.match(await page.textContent('#intro'), /שתי שאלות/);
  await page.click('label.sw:has(#mic)');   // microphone off
  assert.match(await page.textContent('#intro'), /שאלה אחת/);
  await page.click('#seg button[data-m="screen+cam"]');
  assert.match(await page.textContent('#intro'), /שתי שאלות: איזה מסך לשתף ואישור מצלמה/);
  await done();
});

test('preferences survive a reload', async (browser, base) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base);
  await page.click('#seg button[data-m="screen+cam"]');
  await page.selectOption('#fps', '60');
  await page.selectOption('#camPos', 'tr');
  await page.reload();
  assert.equal(await page.evaluate(() => mode), 'screen+cam');
  assert.equal(await page.inputValue('#fps'), '60');
  assert.equal(await page.inputValue('#camPos'), 'tr');
  await context.close();
});

test('recording state shows in the page and the tab title; mute toggles the mic track', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  assert.equal(await page.evaluate(() => document.body.dataset.phase), 'recording');
  await page.waitForTimeout(400);
  assert.match(await page.title(), /^● 00:0\d/);
  assert.equal(await page.isVisible('#btnMute'), true);
  await page.click('#btnMute');
  assert.equal(await page.evaluate(() => sMic.getAudioTracks()[0].enabled), false);
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('KeyM');
  assert.equal(await page.evaluate(() => sMic.getAudioTracks()[0].enabled), true);
  await page.click('#btnStop');
  await waitPhase(page, 'done');
  assert.doesNotMatch(await page.title(), /●/);
  await done();
});

test('single-key shortcuts can be turned off; Esc still works', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Shift+Slash');
  assert.equal(await page.evaluate(() => document.getElementById('help').open), true, '? opens the dialog');
  await page.click('#help label.sw');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.getElementById('help').open), false);
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(500);
  assert.equal(await phase(page), 'idle', 'R must do nothing when shortcuts are off');
  await page.selectOption('#cd', '3');
  await page.click('#btnStart');
  await waitPhase(page, 'countdown');
  await page.keyboard.press('Escape');
  assert.equal(await phase(page), 'idle');
  await done();
});

test('the camera bubble moves with the arrow keys', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.click('#seg button[data-m="screen+cam"]');
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  await page.waitForFunction(() => box.w > 0);
  const before = await page.evaluate(() => ({ ...box }));
  await page.focus('#stage');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({ ...box }));
  assert.ok(after.y < before.y && after.x > before.x, `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  assert.equal(await phase(page), 'recording', 'arrow keys must not pause or stop');
  await page.click('#btnStop');
  await waitPhase(page, 'done');
  await done();
});

/* ---------- full function audit: flows that were not covered yet ---------- */

test('pause time is left out of the duration', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  await page.waitForTimeout(1500);
  await page.click('#btnPause');
  assert.equal(await phase(page), 'paused');
  assert.equal(await page.textContent('#btnPause'), 'המשך');
  assert.match(await page.title(), /^❚❚/);
  await page.waitForTimeout(2500);
  await page.click('#btnPause');
  assert.equal(await phase(page), 'recording');
  await page.waitForTimeout(1500);
  await page.click('#btnStop');
  const dur = await assertPlayable(page);
  assert.ok(dur > 2.2 && dur < 4.5, `about 3 s recorded, 2.5 s paused; got ${dur}`);
  await done();
});

test('camera test shows a live preview; turning the mic off afterwards keeps it out of the take', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.click('#seg button[data-m="screen+cam"]');
  await page.click('#btnTest');
  await page.waitForFunction(() => previewOnly && !!sCam && !!sMic);
  assert.match(await page.textContent('#status'), /תצוגה מקדימה/);
  assert.equal(await page.isVisible('#stage'), true);
  await page.click('label.sw:has(#mic)');                     // mic off after the test
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  assert.equal(await page.evaluate(() => sMic), null, 'mic from the test must be released');
  assert.equal(await page.isVisible('#btnMute'), false);
  await page.waitForTimeout(1500);
  await page.click('#btnStop');
  await assertPlayable(page);
  await done();
});

test('a saved device that no longer exists falls back to the default one', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.evaluate(() => {
    for (const id of ['micDev', 'camDev']) { const s = document.getElementById(id); s.add(new Option('gone', 'no-such-device')); s.value = 'no-such-device'; }
  });
  await page.click('#seg button[data-m="screen+cam"]');
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  assert.equal(await page.evaluate(() => !!sCam && !!sMic), true, 'camera and mic opened on the default device');
  assert.equal(await page.isVisible('#alert'), false, 'no warning needed');
  await page.waitForTimeout(1500);
  await page.click('#btnStop');
  await assertPlayable(page);
  await done();
});

test('the browser\'s "stop sharing" ends the take and keeps the video', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  await page.waitForTimeout(1500);
  await page.evaluate(() => sScr.getVideoTracks()[0].dispatchEvent(new Event('ended')));
  await assertPlayable(page);
  await done();
});

test('a camera unplugged mid-take drops the bubble and the take goes on', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.click('#seg button[data-m="screen+cam"]');
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  await page.waitForTimeout(800);
  await page.evaluate(() => sCam.getVideoTracks()[0].dispatchEvent(new Event('ended')));
  assert.equal(await page.evaluate(() => sCam), null);
  assert.equal(await phase(page), 'recording');
  assert.match(await page.textContent('#alert'), /המצלמה התנתקה/);
  assert.equal(await page.getAttribute('#alert', 'data-kind'), 'warn');
  await page.waitForTimeout(800);
  await page.click('#btnStop');
  await assertPlayable(page);
  await done();
});

test('camera-only: an unplugged camera ends the take with a playable file', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.click('#seg button[data-m="cam"]');
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  await page.waitForTimeout(1500);
  await page.evaluate(() => sCam.getVideoTracks()[0].dispatchEvent(new Event('ended')));
  await assertPlayable(page);
  await done();
});

test('shortcuts still work after clicking the preview (only arrows go to the bubble)', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.click('#seg button[data-m="screen+cam"]');
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  await page.focus('#stage');
  await page.keyboard.press('Space');
  assert.equal(await phase(page), 'paused');
  await page.keyboard.press('KeyS');
  await waitPhase(page, 'done');
  await done();
});

test('"new recording" asks before throwing away an undownloaded take, and resets after', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.click('#panelLib label.sw');
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  await page.waitForTimeout(800);
  await page.click('#btnStop');
  await waitPhase(page, 'done');
  let msg = '';
  page.once('dialog', d => { msg = d.message(); d.dismiss(); });
  await page.click('#btnNew');
  assert.match(msg, /עוד לא הורדה/);
  assert.equal(await phase(page), 'done', 'cancel keeps the recording');
  await Promise.all([page.waitForEvent('download'), page.click('#btnDl')]);
  await page.click('#btnNew');                     // downloaded: no question
  assert.equal(await phase(page), 'idle');
  assert.equal(await page.evaluate(() => blob), null);
  assert.equal(await page.isVisible('#btnStart'), true);
  assert.equal(await page.textContent('#tm'), '00:00');
  await done();
});

test('the shortcuts dialog: clicks inside stay open, backdrop click closes, focus returns', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.click('#btnHelp');
  await page.click('#helpTitle');
  await page.mouse.click(await page.evaluate(() => document.getElementById('help').getBoundingClientRect().left + 6),
                         await page.evaluate(() => document.getElementById('help').getBoundingClientRect().top + 6));
  assert.equal(await page.evaluate(() => document.getElementById('help').open), true, 'padding click closed it');
  await page.mouse.click(5, 5);
  assert.equal(await page.evaluate(() => document.getElementById('help').open), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'btnHelp');
  await done();
});

test('Rubik is bundled and actually used, with no network', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.fonts.check('16px Rubik', 'אבג')), true);
  assert.equal(await page.evaluate(() => [...document.fonts].some(f => f.family.replace(/"/g, '') === 'Rubik' && f.status === 'loaded')), true);
  await done();
});


/* ---------- groups A + B: new features ---------- */

const record = async (page, ms) => {
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  await page.waitForTimeout(ms);
  await page.click('#btnStop');
  return assertPlayable(page);
};

test('noise suppression is on by default, can be turned off, and the mic meter moves', async (browser, base) => {
  const { page, done } = await open(browser, base);
  assert.equal(await page.isChecked('#ns'), true);
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  assert.equal(await page.evaluate(() => sMic.getAudioTracks()[0].getSettings().noiseSuppression), true);
  assert.equal(await page.isVisible('#meter'), true, 'meter shown while the mic is live');
  await page.waitForFunction(() => parseFloat(document.getElementById('meterFill').style.width) > 0, null, { timeout: 5000 });
  await page.click('#btnStop');
  await waitPhase(page, 'done');
  assert.equal(await page.isVisible('#meter'), false, 'meter hidden after the take');
  await page.click('#btnNew');
  await page.click('#rowNs label.sw');
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  assert.equal(await page.evaluate(() => sMic.getAudioTracks()[0].getSettings().noiseSuppression), false);
  await page.click('#btnStop');
  await waitPhase(page, 'done');
  await done();
});

test('bubble shapes, resize by wheel, by keys and by dragging the edge', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.click('#seg button[data-m="screen+cam"]');
  await page.selectOption('#camShape', 'wide');
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  await page.waitForFunction(() => box.w > 0);
  const wide = await page.evaluate(() => ({ ...box }));
  assert.ok(wide.w > wide.h * 1.5, `wide bubble ${JSON.stringify(wide)}`);
  const pt = await page.evaluate(() => { const r = stage.getBoundingClientRect(), k = r.width / stage.width;
    return { x: r.left + (box.x + box.w / 2) * k, y: r.top + (box.y + box.h / 2) * k }; });
  const s0 = +(await page.inputValue('#camSize'));
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(100);
  assert.equal(+(await page.inputValue('#camSize')), s0 + 2, 'wheel grows the bubble');
  await page.focus('#stage');
  await page.keyboard.press('-'); await page.keyboard.press('-');
  assert.equal(+(await page.inputValue('#camSize')), s0 - 2, 'minus key shrinks it');
  await page.selectOption('#camShape', 'rounded');
  await page.waitForTimeout(150);
  const c = await page.evaluate(() => { layout(); const r = stage.getBoundingClientRect(), k = r.width / stage.width;
    return { x: r.left + (box.x + box.w - 3) * k, y: r.top + (box.y + box.h - 3) * k, cx: r.left + (box.x + box.w / 2) * k, cy: r.top + (box.y + box.h / 2) * k }; });
  const before = +(await page.inputValue('#camSize'));
  await page.mouse.move(c.x, c.y); await page.mouse.down();
  await page.mouse.move(c.x + (c.x - c.cx) * .8, c.y + (c.y - c.cy) * .8, { steps: 5 }); await page.mouse.up();
  assert.ok(+(await page.inputValue('#camSize')) > before, 'edge drag grows the bubble');
  assert.equal(await phase(page), 'recording');
  await page.mouse.move(0, 0);
  await page.click('#btnStop', { force: true });   // under load the stability check timed out once
  await waitPhase(page, 'done');
  await done();
});

test('a saved "round: off" from an older version becomes the rounded-square shape', async (browser, base) => {
  const { page, done } = await open(browser, base, { init: () => {
    if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1');
      localStorage.setItem('recordo.prefs', JSON.stringify({ mode: 'screen+cam', camRound: false })); } } });   // the old app name on purpose: settings carry over to Recly
  assert.equal(await page.inputValue('#camShape'), 'rounded');
  await done();
});

test('background frame: goes through the canvas and paints the background', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.selectOption('#frame', 'teal');
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => !!canvasTrack), true, 'a frame needs the canvas path');
  const px = await page.evaluate(() => [...ctx.getImageData(2, 2, 1, 1).data].slice(0, 3));
  assert.ok(px[1] > 60 && px[1] > px[0], `corner should be turquoise, got ${px}`);
  await page.waitForTimeout(1200);
  await page.click('#btnStop');
  await assertPlayable(page);
  await done();
});

test('part of the screen: pick a region, record only that, Esc cancels the picker', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await page.selectOption('#area', 'part');
  await page.click('#btnStart');
  await page.waitForFunction(() => !!selecting);
  assert.equal(await page.isVisible('#regionUI'), true);
  const full = await page.evaluate(() => ({ w: stage.width, h: stage.height }));
  const r = await page.evaluate(() => { const b = stage.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
  await page.mouse.move(r.x + r.w * .1, r.y + r.h * .2); await page.mouse.down();
  await page.mouse.move(r.x + r.w * .6, r.y + r.h * .7, { steps: 6 }); await page.mouse.up();
  await page.click('#btnRegionOk');
  await waitPhase(page, 'recording');
  const got = await page.evaluate(() => ({ w: stage.width, h: stage.height }));
  assert.ok(Math.abs(got.w - full.w * .5) < full.w * .03 && Math.abs(got.h - full.h * .5) < full.h * .03, JSON.stringify({ full, got }));
  assert.equal(got.w % 2 + got.h % 2, 0, 'even size for the encoder');
  await page.waitForTimeout(1500);
  await page.click('#btnStop');
  await assertPlayable(page);
  const v = await page.evaluate(() => ({ w: document.getElementById('playback').videoWidth, h: document.getElementById('playback').videoHeight }));
  assert.equal(v.w, got.w); assert.equal(v.h, got.h);
  await page.waitForFunction(() => downloaded);          // kept in the library, so "new" asks nothing
  await page.click('#btnNew');
  await waitPhase(page, 'idle');
  await page.click('#btnStart');
  await page.waitForFunction(() => !!selecting);
  await page.keyboard.press('Escape');
  await waitPhase(page, 'idle');
  assert.equal(await page.evaluate(() => sScr === null && selecting === null), true);
  await done();
});

test('trim: in and out points cut the take, undo brings the original back', async (browser, base) => {
  const { page, done } = await open(browser, base);
  const full = await record(page, 3500);
  assert.equal(await page.isVisible('#editBox'), true);
  assert.equal(await page.isDisabled('#btnTrim'), true, 'nothing to cut yet');
  const pbTo = t => page.evaluate(t => new Promise(r => { const v = document.getElementById('playback'); v.onseeked = () => r(); v.currentTime = t; }), t);
  await pbTo(.6); await page.click('#btnIn');
  await pbTo(2.1); await page.click('#btnOut');
  assert.match(await page.textContent('#trimLbl'), /00:00\.6 – 00:02\.1/);
  const origSize = await page.evaluate(() => blob.size);
  await page.click('#btnTrim');
  await page.waitForFunction(() => !exporting && origBlob, null, { timeout: 20000 });
  const cut = await assertPlayable(page);
  assert.ok(cut > 1.1 && cut < 2.1, `trimmed to about 1.5 s, got ${cut} (full ${full})`);
  assert.equal(await page.isVisible('#btnUndo'), true);
  assert.equal(await page.isVisible('#btnDl'), true);
  await page.click('#btnUndo');
  assert.equal(await page.evaluate(() => blob.size), origSize);
  await done();
});

test('recent recordings: a take is kept, survives a reload, opens, downloads and deletes', async (browser, base) => {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.selectOption('#cd', '0');
  assert.equal(await page.isVisible('#panelLib'), true);
  assert.equal(await page.isChecked('#lib'), true);
  await record(page, 1500);
  await page.waitForFunction(() => libMeta().length === 1);
  assert.equal(await page.evaluate(() => downloaded), true, 'kept in the library = nothing to lose');
  const size = await page.evaluate(() => blob.size);
  await page.reload();
  assert.equal(await page.locator('#libList li').count(), 1);
  await page.click('#libList button:has-text("פתיחה")');
  await waitPhase(page, 'done');
  assert.equal(await page.evaluate(() => blob.size), size);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#libList button:has-text("הורדה")')]);
  assert.match(dl.suggestedFilename(), /^recly-.*\.mp4$/);
  page.once('dialog', d => d.accept());
  await page.click('#libList button:has-text("מחיקה")');
  await page.waitForFunction(() => libMeta().length === 0);
  const left = await page.evaluate(async () => { const d = await libDir(); const n = []; for await (const k of d.keys()) n.push(k); return n; });
  assert.deepEqual(left, []);
  assert.deepEqual(errors, []);
  await context.close();
});

test('installable: manifest, icons and an offline service worker, all local', async (browser, base) => {
  const { page, done } = await open(browser, base);
  const m = await page.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]').href;
    const j = await (await fetch(href)).json();
    const icons = await Promise.all(j.icons.map(i => fetch(new URL(i.src, href)).then(r => r.ok && r.headers.get('content-type'))));
    return { name: j.short_name, display: j.display, icons };
  });
  assert.equal(m.name, 'Recly'); assert.equal(m.display, 'standalone');
  assert.ok(m.icons.every(t => /image\/png/.test(t)), JSON.stringify(m.icons));
  const sw = await page.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active));
  assert.equal(sw, true);
  await done();
});

test('floating control window: opens on demand, mirrors the timer and stops the take', async (browser, base) => {
  const { page, done } = await open(browser, base);
  const can = await page.evaluate(() => canPip);
  if (can) { await page.click('#panelPrompt summary'); await page.fill('#prompt', 'שלום לכולם\nזו שורה שנייה'); }
  await page.click('#btnStart');
  await waitPhase(page, 'recording');
  if (!can) { console.log('        (no Document PiP in this Chromium: checked the button stays hidden)');
    assert.equal(await page.isVisible('#btnPip'), false); await page.click('#btnStop'); await waitPhase(page, 'done'); return done(); }
  assert.equal(await page.isVisible('#btnPip'), true);
  await page.click('#btnPip');
  await page.waitForFunction(() => pipWin && pipWin.document.getElementById('pTm'), null, { timeout: 5000 });
  await page.waitForTimeout(700);
  const st = await page.evaluate(() => ({ tm: pipWin.document.getElementById('pTm').textContent,
    text: pipWin.document.getElementById('pText').textContent, hidden: pipWin.document.getElementById('pPrompt').hidden }));
  assert.match(st.tm, /^00:0\d$/); assert.equal(st.hidden, false); assert.match(st.text, /שלום לכולם/);
  await page.evaluate(() => pipWin.document.getElementById('pPause').click());
  assert.equal(await phase(page), 'paused');
  await page.evaluate(() => pipWin.document.getElementById('pPause').click());
  await page.evaluate(() => pipWin.document.getElementById('pStop').click());
  await assertPlayable(page);
  assert.equal(await page.evaluate(() => pipWin), null, 'closed after the take');
  await done();
});


/* ---------- group C: captions, only when there is speech ---------- */

test('captions: a take without speech (only the fake mic beeps) offers no captions', async (browser, base) => {
  const { page, done } = await open(browser, base);
  await record(page, 3000);
  await page.waitForFunction(() => speech !== null, null, { timeout: 15000 });
  assert.equal(await page.evaluate(() => speech.has), false, `beeps are not speech: ${await page.evaluate(() => JSON.stringify(speech))}`);
  assert.equal(await page.isVisible('#capBox'), false);
  await done();
});

test('captions: repeated phrases from the model are cleaned up, timings never overlap', async (browser, base) => {
  const { page, done } = await open(browser, base);
  const out = await page.evaluate(() => tidyCues([
    { start: 0, end: 2, text: ' שלום לכולם, שלום לכולם וברוכים הבאים.' },
    { start: 2, end: 4, text: 'לוחצים על הכפתור,' },
    { start: 4, end: 5, text: 'לוחצים על הכפתור,' },
    { start: 5, end: 7, text: 'בוחרים חלון, בוחרים חלון, ומתחילים לדבר.' },
    { start: 6.5, end: 8, text: '[מוזיקה]' }]));
  assert.deepEqual(out.map(c => c.text), ['שלום לכולם, שלום לכולם וברוכים הבאים.', 'לוחצים על הכפתור,', 'בוחרים חלון, ומתחילים לדבר.']);
  assert.ok(out.every((c, i) => !i || c.start >= out[i - 1].end));
  assert.equal(await page.evaluate(() => self.crossOriginIsolated), true, 'served cross-origin isolated (threads for the model)');
  await done();
});

test('captions: the runtime loads from this site only (worker + vendored transformers.js)', async (browser, base) => {
  const { page, done } = await open(browser, base);
  const r = await page.evaluate(() => new Promise(res => {
    const w = new Worker('asr-worker.js', { type: 'module' });
    w.onerror = e => res('error: ' + (e.message || 'load failed'));
    setTimeout(() => { w.terminate(); res('ok'); }, 2500);
  }));
  assert.equal(r, 'ok');
  await done();
});

test('captions: speech is detected, the model download needs consent, captions export as SRT and burned in', async (_browser, base) => {
  // A separate browser whose fake microphone plays a recorded voice.
  const voiced = await chromium.launch({ args: [
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--auto-select-desktop-capture-source=Entire screen',
    `--use-file-for-fake-audio-capture=${path.join(__dirname, 'fixtures', 'speech.wav')}`] });
  try {
    const { page, done } = await open(voiced, base);
    await page.click('#panelLib label.sw');                 // keep this test's takes out of the library
    await record(page, 6000);
    await page.waitForFunction(() => speech !== null, null, { timeout: 20000 });
    const sp = await page.evaluate(() => ({ has: speech.has, secs: speech.secs, wins: speech.wins.length }));
    assert.equal(sp.has, true, `speech expected: ${JSON.stringify(sp)}`);
    assert.ok(sp.wins >= 1);
    assert.equal(await page.isVisible('#capBox'), true);

    // No model in the cache: the app must ask first. Saying no downloads nothing.
    await page.click('#btnCap');
    await page.waitForFunction(() => document.getElementById('asrDlg').open);
    assert.match(await page.textContent('#asrText'), /Hugging Face/);
    await page.click('#asrNo');
    await page.waitForFunction(() => !document.getElementById('asrDlg').open && !capBusy);
    assert.equal(await page.evaluate(() => cues.length), 0);

    // With a stand-in model the rest of the flow runs for real.
    await page.evaluate(() => { window.__asrMock = async () => [
      { start: 0.5, end: 2.0, text: ' שלום לכולם ' },
      { start: 2.0, end: 3.5, text: '[music]' },
      { start: 3.5, end: 5.0, text: 'this is a test' }]; });
    await page.click('#btnCap');
    await page.waitForFunction(() => cues.length === 2);
    await page.fill('#cueList li:first-child input', 'שלום לכולם, ברוכים הבאים');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#playback track').length), 1, 'shown in the player');
    const [srt] = await Promise.all([page.waitForEvent('download'), page.click('#btnSrt')]);
    assert.match(srt.suggestedFilename(), /\.srt$/);
    const text = fs.readFileSync(await srt.path(), 'utf8');
    assert.match(text, /1\r\n00:00:00,500 --> 00:00:02,000\r\nשלום לכולם, ברוכים הבאים/);
    assert.match(text, /2\r\n00:00:03,500 --> 00:00:05,000\r\nthis is a test/);
    const [vid] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#btnBurn')]);
    assert.match(vid.suggestedFilename(), /-captions\.mp4$/);
    assert.ok(fs.statSync(await vid.path()).size > 5000, 'burned-in video has content');
    await done();
  } finally { await voiced.close(); }
});

/* ---------------------------------------------------------------- */

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: [
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--auto-select-desktop-capture-source=Entire screen'] });
  let failed = 0;
  for (const t of tests) {
    const t0 = Date.now();
    try { await t.fn(browser, base); console.log(`  ok    ${t.name}  (${Date.now() - t0} ms)`); }
    catch (e) { failed++; console.log(`  FAIL  ${t.name}\n        ${String(e.message || e).split('\n').join('\n        ')}`); }
  }
  await browser.close(); srv.close();
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
