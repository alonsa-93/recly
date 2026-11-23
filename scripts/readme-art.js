// Builds the README art: banner (light/dark) and screenshots, from demo media drawn in the page.
// node scripts/readme-art.js   → docs/brand/*.png, docs/screenshots/*.jpg
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const OUT_B = path.join(ROOT, 'docs', 'brand'), OUT_S = path.join(ROOT, 'docs', 'screenshots');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };

const MARK_SVG = fs.readFileSync(path.join(ROOT, 'icons', 'mark.svg'), 'utf8');
const MARK = s => MARK_SVG.replace('width="512" height="512"', `width="${s}" height="${s}"`).replace('<title>Recly</title>', '');

const BANNER = dark => `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
@font-face{font-family:Rubik;src:url(/fonts/rubik-latin-wght-normal.woff2) format('woff2');font-weight:300 900;unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:Rubik;src:url(/fonts/rubik-hebrew-wght-normal.woff2) format('woff2');font-weight:300 900;unicode-range:U+0590-05FF,U+FB1D-FB4F}
*{margin:0;box-sizing:border-box}
html,body{width:1280px;height:640px;overflow:hidden}
body{font-family:Rubik,sans-serif;position:relative;
  background:${dark ? 'radial-gradient(60% 80% at 85% 10%,#0e3b38 0,transparent 70%),radial-gradient(50% 70% at 10% 100%,#08343a 0,transparent 70%),linear-gradient(160deg,#061312,#030a0a)'
                    : 'radial-gradient(55% 75% at 88% 8%,#9fe3d8 0,transparent 70%),radial-gradient(50% 70% at 5% 100%,#b5ecf0 0,transparent 70%),linear-gradient(160deg,#eaf8f5,#d3efe9)'};
  color:${dark ? '#e6fffb' : '#05302c'}}
.blob{position:absolute;border-radius:50%;filter:blur(70px);opacity:${dark ? .45 : .55}}
.b1{width:420px;height:420px;right:-60px;top:-120px;background:${dark ? '#0d7f76' : '#5fd3c4'}}
.b2{width:360px;height:360px;left:-100px;bottom:-140px;background:${dark ? '#0a5f6e' : '#8ee0ea'}}
.card{position:absolute;inset:56px 64px;border-radius:40px;padding:64px 72px;display:flex;flex-direction:column;justify-content:center;
  background:${dark ? 'rgb(14 40 38 / .55)' : 'rgb(255 255 255 / .62)'};border:1px solid ${dark ? 'rgb(94 234 212 / .18)' : 'rgb(255 255 255 / .9)'};
  box-shadow:inset 0 1px 0 ${dark ? 'rgb(255 255 255 / .08)' : '#fff'},0 1px 0 ${dark ? 'rgb(0 0 0 / .4)' : 'rgb(4 60 55 / .08)'},0 30px 70px -30px ${dark ? 'rgb(0 0 0 / .7)' : 'rgb(4 70 64 / .35)'};
  backdrop-filter:blur(22px) saturate(1.35)}
.row{display:flex;align-items:center;gap:34px}
h1{font-size:128px;font-weight:800;letter-spacing:2px;line-height:1;color:${dark ? '#e6fffb' : '#0e4f52'}}
.tag{margin-top:14px;font-size:42px;color:${dark ? '#9ff1e4' : '#1b8f88'};font-weight:600;letter-spacing:-.5px}
.tag b{color:${dark ? '#5eead4' : '#0b7068'};font-weight:700}
.he{margin-top:30px;font-size:30px;font-weight:500;opacity:.78;direction:rtl;text-align:left;unicode-bidi:plaintext}
.chips{margin-top:40px;display:flex;gap:12px;flex-wrap:wrap}
.chips span{font-size:21px;font-weight:600;padding:10px 20px;border-radius:999px;
  background:${dark ? 'rgb(45 212 191 / .12)' : 'rgb(13 127 118 / .09)'};border:1px solid ${dark ? 'rgb(94 234 212 / .22)' : 'rgb(13 127 118 / .18)'};color:${dark ? '#bff7ee' : '#0b5d57'}}
.chips span i{display:inline-block;width:9px;height:9px;border-radius:50%;background:#f4523f;margin-right:10px;vertical-align:2px}
.rec{position:absolute;right:72px;top:64px;display:flex;align-items:center;gap:10px;font-size:20px;font-weight:700;letter-spacing:2px;color:#f4523f}
.rec i{width:14px;height:14px;border-radius:50%;background:#f4523f;box-shadow:0 0 0 6px rgb(244 82 63 / .18)}
</style></head><body><div class="blob b1"></div><div class="blob b2"></div>
<div class="card"><div class="rec"><i></i>REC · LOCAL</div>
  <div class="row">${MARK(190)}<div><h1>RECLY</h1><div class="tag">Record <b>locally</b>. Stay <b>yours</b>.</div></div></div>
  <div class="he">מקליטים במחשב שלך. נשאר רק שלך.</div>
  <div class="chips"><span><i></i>No sign-up</span><span><i></i>No upload</span><span><i></i>No time limit</span><span><i></i>Works offline</span><span><i></i>Hebrew captions</span></div>
</div></body></html>`;

const LOGO = dark => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Rubik;src:url(/fonts/rubik-latin-wght-normal.woff2) format('woff2');font-weight:300 900}
*{margin:0}html,body{background:transparent}body{width:1000px;height:300px;display:flex;align-items:center;gap:44px;padding:0 30px;box-sizing:border-box;font-family:Rubik,sans-serif}
h1{font-size:128px;font-weight:800;letter-spacing:3px;line-height:.95;color:${dark ? '#eafffb' : '#0e4f52'}}
p{font-size:44px;font-weight:500;color:${dark ? '#7ee8d8' : '#1b8f88'};margin-top:10px;letter-spacing:.2px}
</style></head><body>${MARK(250)}<div><h1>RECLY</h1><p>Record locally. Stay yours.</p></div></body></html>`;

/* Demo media: a slide deck as "the screen" and a soft illustrated presenter as "the camera". */
const DEMO = () => {
  const screen = document.createElement('canvas'); screen.width = 1920; screen.height = 1080;
  const cam = document.createElement('canvas'); cam.width = 640; cam.height = 480;
  let t = 0;
  const paint = () => {
    t += 1 / 30;
    const g = screen.getContext('2d'), W = 1920, H = 1080;
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0f1c2e'); bg.addColorStop(1, '#16304a');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < 12; i++) g.fillRect(0, 140 + i * 80, W, 1);
    g.fillStyle = '#7dd3fc'; g.font = '600 34px Rubik, Segoe UI, sans-serif'; g.textAlign = 'right'; g.direction = 'rtl';
    g.fillText('סקירה רבעונית · Q3', W - 120, 130);
    g.fillStyle = '#fff'; g.font = '800 92px Rubik, Segoe UI, sans-serif'; g.fillText('צמיחה של 38% במשתמשים', W - 120, 250);
    g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '400 40px Rubik, Segoe UI, sans-serif';
    ['הרשמה בלחיצה אחת', 'זמן טעינה ירד בחצי', 'שימור משתמשים: 71%'].forEach((s, i) => { g.fillText('•  ' + s, W - 120, 380 + i * 74); });
    const vals = [38, 52, 47, 66, 74, 88, 96], bw = 92;
    vals.forEach((v, i) => {
      const k = Math.min(1, Math.max(0, (t - i * .12) * 1.4)), h = v * 6.2 * k, x = 140 + i * (bw + 34), y = 960 - h;
      const gr = g.createLinearGradient(0, y, 0, 960); gr.addColorStop(0, i === vals.length - 1 ? '#2dd4bf' : '#38bdf8'); gr.addColorStop(1, 'rgba(56,189,248,.25)');
      g.fillStyle = gr; g.beginPath(); g.roundRect(x, y, bw, h, 14); g.fill();
    });
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(120, 962, 1000, 3);
    const c = cam.getContext('2d');
    const cb = c.createLinearGradient(0, 0, 640, 480); cb.addColorStop(0, '#f6d7c3'); cb.addColorStop(1, '#e9b9a0');
    c.fillStyle = cb; c.fillRect(0, 0, 640, 480);
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(520, 90, 120, 0, 7); c.fill();
    const bob = Math.sin(t * 2) * 4;
    c.fillStyle = '#2f5d62'; c.beginPath(); c.ellipse(320, 520 + bob, 230, 170, 0, Math.PI, 0); c.fill();
    c.fillStyle = '#c98b6b'; c.fillRect(290, 300 + bob, 60, 70);
    c.fillStyle = '#d9a07f'; c.beginPath(); c.ellipse(320, 230 + bob, 92, 112, 0, 0, 7); c.fill();
    c.fillStyle = '#3b2a22'; c.beginPath(); c.ellipse(320, 160 + bob, 100, 62, 0, Math.PI, 0); c.fill(); c.fillRect(220, 150 + bob, 22, 80); c.fillRect(398, 150 + bob, 22, 80);
    c.fillStyle = '#3b2a22'; c.beginPath(); c.arc(286, 232 + bob, 8, 0, 7); c.arc(354, 232 + bob, 8, 0, 7); c.fill();
    c.strokeStyle = '#9c5b44'; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.arc(320, 268 + bob, 30, .2, Math.PI - .2); c.stroke();
  };
  setInterval(paint, 33); paint();
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getDisplayMedia = async () => screen.captureStream(30);
  navigator.mediaDevices.getUserMedia = async c => (c && c.video) ? cam.captureStream(30) : orig(c);
};

(async () => {
  fs.mkdirSync(OUT_B, { recursive: true }); fs.mkdirSync(OUT_S, { recursive: true });
  const srv = http.createServer((q, r) => {
    const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
    if (u === '/__banner-light' || u === '/__banner-dark') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return r.end(BANNER(u.endsWith('dark'))); }
    if (u === '/__logo-light' || u === '/__logo-dark') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return r.end(LOGO(u.endsWith('dark'))); }
    const rel = u.replace(/^\/+/, '') || 'index.html';
    fs.readFile(path.join(ROOT, rel), (e, b) => {
      if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(rel)] || 'application/octet-stream', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' }); r.end(b);
    });
  }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${path.join(ROOT, 'tests', 'fixtures', 'speech-he.wav')}`] });

  // Banner + logo
  for (const v of ['light', 'dark']) {
    const p = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 2 });
    await p.goto(base + '__banner-' + v); await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(OUT_B, `banner-${v}.png`) }); await p.close();
  }
  // Horizontal logo (mark + wordmark + tagline) for the README header
  for (const v of ['light', 'dark']) {
    const p = await browser.newPage({ viewport: { width: 1000, height: 300 }, deviceScaleFactor: 2 });
    await p.goto(base + '__logo-' + v); await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(OUT_B, `logo-${v}.png`), omitBackground: true }); await p.close();
  }
  // App icons: PWA tiles, maskable, Apple touch, and the sizes for the Windows .ico
  const SMALL_SVG = fs.readFileSync(path.join(ROOT, 'icons', 'mark-small.svg'), 'utf8');
  const icon = async (file, s, pad, bg, small) => {
    const svg = (small ? SMALL_SVG : MARK_SVG).replace('width="512" height="512"', `width="${s - pad * 2}" height="${s - pad * 2}"`);
    const p = await browser.newPage({ viewport: { width: s, height: s } });
    await p.setContent(`<body style="margin:0;width:${s}px;height:${s}px;display:grid;place-items:center;background:${bg}">${svg}</body>`);
    await p.screenshot({ path: file, omitBackground: bg === 'transparent' }); await p.close();
  };
  await icon(path.join(ROOT, 'icons', 'icon-192.png'), 192, 12, 'transparent');
  await icon(path.join(ROOT, 'icons', 'icon-512.png'), 512, 32, 'transparent');
  await icon(path.join(ROOT, 'icons', 'icon-maskable-512.png'), 512, 100, '#ffffff');
  await icon(path.join(ROOT, 'icons', 'apple-touch-icon.png'), 180, 18, '#ffffff');
  const ICO = path.join(OUT_B, 'ico'); fs.mkdirSync(ICO, { recursive: true });
  for (const s of [16, 24, 32, 48, 64, 128, 256]) await icon(path.join(ICO, `${s}.png`), s, 0, 'transparent', s <= 48);

  const shoot = async (theme, fn) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, acceptDownloads: true, colorScheme: theme });
    await ctx.addInitScript(DEMO);
    await ctx.addInitScript(t => { try { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', 1); localStorage.clear(); localStorage.setItem('recly.theme', t); } } catch (e) {} }, theme);
    const page = await ctx.newPage(); await page.goto(base); await page.evaluate(() => document.fonts.ready);
    await page.selectOption('#cd', '0');
    await fn(page); await ctx.close();
  };
  const shot = (page, name) => page.screenshot({ path: path.join(OUT_S, name + '.jpg'), type: 'jpeg', quality: 88 });
  const recordWithBubble = async page => {
    await page.click('#seg button[data-m="screen+cam"]');
    await page.selectOption('#frame', 'teal');
    await page.click('#btnStart'); await page.waitForFunction(() => phase === 'recording');
    await page.waitForTimeout(2500);
  };

  for (const theme of ['light', 'dark']) {
    await shoot(theme, async page => { await recordWithBubble(page); await shot(page, `recording-${theme}`); });
  }
  await shoot('light', async page => {
    await recordWithBubble(page); await page.waitForTimeout(6000);
    await page.click('#btnStop'); await page.waitForFunction(() => phase === 'done' && speech && speech.has, null, { timeout: 30000 });
    await page.evaluate(() => { window.__asrMock = async () => [
      { start: 0.6, end: 2.6, text: 'שלום לכולם וברוכים הבאים.' },
      { start: 2.8, end: 5.3, text: 'היום אני אראה לכם איך מקליטים את המסך בקלות.' },
      { start: 5.5, end: 8.4, text: 'לוחצים על הכפתור, בוחרים חלון ומתחילים לדבר.' }]; });
    await page.click('#btnCap'); await page.waitForFunction(() => cues.length === 3);
    await page.evaluate(() => { const v = document.getElementById('playback'); v.currentTime = 3.6; });
    await page.waitForTimeout(800);
    await page.evaluate(() => document.getElementById('editBox').scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -330));
    await page.waitForTimeout(400);
    await shot(page, 'captions-light');
  });
  await shoot('dark', async page => {
    await page.selectOption('#area', 'part');
    await page.click('#btnStart'); await page.waitForFunction(() => document.getElementById('regionUI').offsetParent !== null || selecting, null, { timeout: 15000 });
    const b = await page.locator('#stage').boundingBox();
    await page.mouse.move(b.x + b.width * .52, b.y + b.height * .1); await page.mouse.down();
    await page.mouse.move(b.x + b.width * .95, b.y + b.height * .7, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(300);
    await shot(page, 'region-dark');
  });
  await browser.close(); srv.close();
  console.log('ok', fs.readdirSync(OUT_B), fs.readdirSync(OUT_S));
})();
