// Fragetest: reine Logik und Ablauf in der Erweiterung mit einem nachgebauten Sprachmodell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compactElements, parsePlan, verifyPlan, verifyOpen, judge, buildMessages } from '../toolbox/gemeinsam/fragetest.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const ext = path.join(here, '..', 'toolbox', 'live-check');

const items = [
  { role: 'heading', name: 'Dateien', ctx: '' },
  { role: 'button', name: 'Neu', ctx: '', backend: 1 },
  { role: 'link', name: 'Angebot Stadtwerke.pdf', ctx: 'row:Angebot Stadtwerke.pdf Aktionen', backend: 2 },
  { role: 'button', name: 'Aktionen', ctx: 'row:Angebot Stadtwerke.pdf Aktionen', backend: 3 },
  { role: 'link', name: 'Vertrag Kanzlei.docx', ctx: 'row:Vertrag Kanzlei.docx Aktionen', backend: 4 },
  { role: 'button', name: 'Aktionen', ctx: 'row:Vertrag Kanzlei.docx Aktionen', backend: 5 },
];

test('Inhalte in Listen werden vor dem Senden ausgeblendet', () => {
  const { elements, ausgeblendet } = compactElements(items);
  assert.equal(ausgeblendet, 2);
  const text = buildMessages('Wie lege ich einen Ordner an?', elements)[1].content;
  assert.ok(!text.includes('Stadtwerke') && !text.includes('Kanzlei'), 'keine Dateinamen im Prompt');
  assert.match(text, /button "Aktionen" \(Zeile 1\)/);
  assert.equal(compactElements(items, { ausblenden: false }).ausgeblendet, 0);
});

test('Schritte werden gegen die Seite geprüft und beurteilt', () => {
  const { elements } = compactElements(items);
  const plan = parsePlan('```json\n{"machbar":"ja","schritte":[{"ref":"e2","rolle":"button","name":"Neu"},{"ref":null,"rolle":"menuitem","name":"Neuer Ordner"}]}\n```');
  let p = verifyPlan(plan, elements);
  assert.deepEqual(p.map(x => x.status), ['gefunden', 'offen']);
  assert.equal(judge(plan, p, false), 'beantwortbar, Folgeschritte offen');
  p = verifyOpen(plan, p, [...elements, { ref: 'e9', role: 'menuitem', name: 'Neuer Ordner', echt: 'Neuer Ordner', ctx: '', backend: 9 }]);
  assert.equal(judge(plan, p, false), 'beantwortbar');
  const erfunden = parsePlan('{"machbar":"ja","schritte":[{"ref":"e77","rolle":"button","name":"Ordner"}]}');
  assert.equal(judge(erfunden, verifyPlan(erfunden, elements), false), 'unzuverlässig');
  const nein = parsePlan('{"machbar":"nein","schritte":[]}');
  assert.equal(judge(nein, [], true), 'bestanden');
  assert.equal(judge(nein, [], false), 'nicht beantwortbar');
});

// nachgebautes Sprachmodell (OpenAI-kompatibel): sucht die Kennung von „Neu“ im Prompt und schlägt einen Plan vor
function mockModel() {
  const calls = [];
  const srv = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' }); return res.end(); }
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      const msg = JSON.parse(body); calls.push(msg);
      const user = msg.messages[1].content;
      const ref = (user.match(/^(e\d+) button "Neu"/m) || [])[1];
      const plan = /Urlaub/.test(user) ? { machbar: 'nein', begruendung: 'Keine Urlaubsfunktion auf dieser Seite', schritte: [] }
        : { machbar: 'ja', begruendung: '', schritte: [
          { ref, rolle: 'button', name: 'Neu', aktion: 'klicken', erklaerung: 'Klicken Sie auf „Neu“.' },
          { ref: null, rolle: 'menuitem', name: 'Neuer Ordner', aktion: 'klicken', erklaerung: 'Wählen Sie „Neuer Ordner“.' },
          { ref: null, rolle: 'textbox', name: 'Ordnername', aktion: 'eingeben', erklaerung: 'Geben Sie einen Namen ein.' }] };
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) } }] }));
    });
  });
  return { srv, calls };
}

test('Fragetest in der Erweiterung: Plan prüfen, mitklicken, Gegenprobe, Report', async () => {
  const dir = path.join(here, 'fixtures');
  const site = await new Promise(r => { const s = http.createServer((req, res) => {
    const f = path.join(dir, req.url.split('?')[0]);
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f));
  }).listen(0, () => r(s)); });
  const { srv: llm, calls } = mockModel(); await new Promise(r => llm.listen(0, r));
  const base = `http://localhost:${site.address().port}`;
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'ft-')), {
    channel: 'chromium', headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
  try {
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
    await sw.evaluate(async url => chrome.storage.local.set({ einstellungen: { baseUrl: url, model: 'testmodell', apiKey: 'x', ausblenden: true } }),
      `http://localhost:${llm.address().port}/v1/`);
    const page = await ctx.newPage(); await page.goto(`${base}/dateien.html`);
    const tabId = await sw.evaluate(async u => (await chrome.tabs.query({})).find(t => t.url === u).id, `${base}/dateien.html`);
    let r = await sw.evaluate(({ tabId }) => self.appilotFrage(tabId, { frage: 'Wie lege ich einen neuen Ordner an?' }), { tabId });
    assert.deepEqual(r.pruefung.map(p => p.status), ['gefunden', 'offen', 'offen']);
    assert.equal(r.urteil, 'beantwortbar, Folgeschritte offen');
    assert.equal(await page.locator('#appilot-check-overlay > div').count(), 1, 'erster Schritt markiert');
    const prompt = calls[0].messages[1].content;
    assert.ok(!prompt.includes('Stadtwerke') && !prompt.includes('Kanzlei'), 'Dateinamen nicht gesendet');
    assert.ok(!prompt.includes('Testseite Dateien'), 'Seitentitel nicht gesendet');
    // Die Person klickt selbst; danach werden die offenen Schritte geprüft
    await page.click('#neu');
    r = await sw.evaluate(({ tabId, origin, index }) => self.appilotWeiter(tabId, { origin, index }), { tabId, origin: base, index: r.index });
    assert.deepEqual(r.pruefung.map(p => p.status), ['gefunden', 'gefunden', 'offen']);
    await page.click('#neuerOrdner');
    r = await sw.evaluate(({ tabId, origin, index }) => self.appilotWeiter(tabId, { origin, index }), { tabId, origin: base, index: r.index });
    assert.equal(r.urteil, 'beantwortbar');
    const g = await sw.evaluate(({ tabId }) => self.appilotFrage(tabId, { frage: 'Wie buche ich hier meinen Urlaub?', gegenprobe: true }), { tabId });
    assert.equal(g.urteil, 'bestanden');
    const id = new URL(sw.url()).host;
    const rep = await ctx.newPage();
    await rep.goto(`chrome-extension://${id}/report.html?origin=${encodeURIComponent(base)}`);
    await rep.waitForSelector('h1');
    const text = await rep.textContent('body');
    assert.match(text, /Fragetest/); assert.match(text, /Beantwortbar: 1 von 1/); assert.match(text, /Gegenproben bestanden: 1 von 1/);
  } finally { await ctx.close(); site.close(); llm.close(); }
});
