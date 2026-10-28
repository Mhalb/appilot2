// Lädt die Browser-Erweiterung in Chromium und prüft damit eine gut und eine schlecht beschriftete Testmaske.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const ext = path.join(here, '..', 'toolbox', 'live-check');

test('Kopien der gemeinsamen Logik in der Erweiterung sind aktuell', () => {
  for (const f of ['messung.js', 'fragetest.js']) {
    const a = fs.readFileSync(path.join(here, '..', 'toolbox', 'gemeinsam', f), 'utf8');
    const b = fs.readFileSync(path.join(ext, 'lib', f), 'utf8');
    assert.equal(b, a, `${f}: npm run sync:live-check ausführen`);
  }
});

test('Live-Check misst Testmasken über chrome.debugger', async () => {
  const dir = path.join(here, 'fixtures');
  const srv = await new Promise(r => { const s = http.createServer((req, res) => {
    const f = path.join(dir, req.url.split('?')[0]);
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f));
  }).listen(0, () => r(s)); });
  const base = `http://localhost:${srv.address().port}`;
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'lc-')), {
    channel: 'chromium', headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
  try {
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
    const run = async (file, opts = {}) => {
      const page = await ctx.newPage(); await page.goto(`${base}/${file}`); await page.waitForTimeout(200);
      return sw.evaluate(async ({ url, opts }) => {
        const tab = (await chrome.tabs.query({})).find(t => t.url === url);
        return self.appilotCheck(tab.id, { wartezeit: 200, ...opts });
      }, { url: `${base}/${file}`, opts });
    };
    const gut = await run('gut.html');
    assert.equal(gut.benennung, 100);
    assert.equal(gut.eindeutigkeit, 100);
    assert.equal(gut.stabilitaet, 100);
    const schlecht = await run('schlecht.html');
    assert.ok(schlecht.benennung < 70);
    assert.ok(schlecht.blind.canvas >= 1 && schlecht.blind.iframesFremd >= 1);
    assert.ok(schlecht.probleme.some(p => p.why === 'ohne Namen'));
    assert.ok(schlecht.probleme.some(p => p.bild && p.bild.startsWith('data:image/png')), 'Bildausschnitte vorhanden');
    // Ergebnisse liegen je Herkunft im Speicher der Erweiterung; der Report baut daraus die Ampel
    const id = new URL(sw.url()).host;
    const rep = await ctx.newPage();
    await rep.goto(`chrome-extension://${id}/report.html?origin=${encodeURIComponent(base)}`);
    await rep.waitForSelector('h1');
    const text = await rep.textContent('body');
    assert.match(text, /Live-Check/);
    assert.match(text, /Rot/);
    assert.equal(await rep.locator('a[download]').count(), 2);
  } finally { await ctx.close(); srv.close(); }
});
