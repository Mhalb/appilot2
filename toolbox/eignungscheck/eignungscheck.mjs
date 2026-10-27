#!/usr/bin/env node
// Appilot-Toolbox · Eignungscheck (Prototyp)
// Liest je Maske den Barrierefreiheitsbaum (wie ein Screenreader) und misst, wie gut Appilot
// die Oberfläche verstehen kann. Ergebnis: report.json und report.html mit Ampel.
// Die Messlogik teilt sich das Skript mit dem Live-Check (toolbox/gemeinsam/messung.js).
//
// Aufruf: node eignungscheck.mjs config.json [ausgabeordner]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { itemsFromAX, measureMask, buildReport, reportHtml, blindAreasInPage, pixelateDataUrl } from '../gemeinsam/messung.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const cfgPath = process.argv[2];
if (!cfgPath) { console.error('Aufruf: node eignungscheck.mjs config.json [ausgabeordner]'); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const out = process.argv[3] || path.join(path.dirname(cfgPath), 'report-' + slug(cfg.name));
fs.mkdirSync(out, { recursive: true });

async function runSteps(page, steps = []) {
  for (const s of steps) {
    if (s.click) await page.locator(s.click).first().click({ timeout: 5000 });
    if (s.fill) await page.locator(s.fill).first().fill(s.value || '', { timeout: 5000 });
    if (s.wait) await page.waitForTimeout(s.wait);
  }
  await page.waitForTimeout(cfg.settleMs ?? 600);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'de-DE' });
if (cfg.blockAppilot !== false) await context.route(/\/appilot\/appilot\.js/, r => r.abort());
if (cfg.localStorage) await context.addInitScript(ls => { for (const [k, val] of Object.entries(ls)) localStorage.setItem(k, val); }, cfg.localStorage);

const masken = [];
for (const mask of cfg.masks) {
  process.stdout.write(`· ${mask.name} … `);
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('DOM.enable'); await cdp.send('Accessibility.enable');
    const resp = await page.goto(new URL(mask.url, cfg.baseUrl).href, { waitUntil: 'networkidle', timeout: 30000 });
    await runSteps(page, mask.steps);
    const snap = async () => itemsFromAX((await cdp.send('Accessibility.getFullAXTree')).nodes);
    const items = await snap();
    const blind = await page.evaluate(blindAreasInPage);
    const title = await page.title();
    // Bildausschnitte vor dem Neuladen holen, sonst passen die Knoten nicht mehr
    const domInfo = async backend => {
      try {
        const { node } = await cdp.send('DOM.describeNode', { backendNodeId: backend });
        const a = node.attributes || []; let id = '';
        for (let i = 0; i < a.length; i += 2) if (a[i] === 'id') id = a[i + 1];
        return { tag: (node.localName || node.nodeName || '').toLowerCase(), id };
      } catch { return { tag: '', id: '' }; }
    };
    const clip = async backend => {
      try {
        const { model } = await cdp.send('DOM.getBoxModel', { backendNodeId: backend });
        const q = model.border; const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
        const x = Math.max(0, Math.min(...xs) - 6), y = Math.max(0, Math.min(...ys) - 6);
        const w = Math.max(...xs) - x + 12, h = Math.max(...ys) - y + 12;
        if (w < 4 || h < 4 || w > 1400 || h > 900) return null;
        const url = 'data:image/png;base64,' + (await page.screenshot({ clip: { x, y, width: w, height: h } })).toString('base64');
        return cfg.unkenntlich ? await page.evaluate(pixelateDataUrl, url) : url;
      } catch { return null; }
    };
    const first = await measureMask({ items, domInfo, clip, maxShots: cfg.maxShots, name: mask.name, url: mask.url, kern: mask.kern,
      title, blind, csp: resp?.headers()['content-security-policy'] || '', secondItems: null });
    // Stabilität: neu laden und erneut messen
    await page.reload({ waitUntil: 'networkidle' }); await runSteps(page, mask.steps);
    const second = await snap();
    const withStab = await measureMask({ items, domInfo: async () => ({}), secondItems: second, name: mask.name, url: mask.url });
    first.stabilitaet = withStab.stabilitaet; first.stabilitaetArt = 'nach Neuladen';
    await page.close();
    masken.push(first);
    console.log('ok');
  } catch (e) { masken.push({ name: mask.name, url: mask.url, fehler: String(e.message || e) }); console.log('Fehler: ' + e.message); }
}
await browser.close();

const report = buildReport({ anwendung: cfg.name, baseUrl: cfg.baseUrl, masken, modus: 'Skript' });
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(out, 'report.html'), reportHtml(report));
console.log(`\nGesamt: ${report.gesamt.toUpperCase()} · Bericht: ${path.join(out, 'report.html')}`);
