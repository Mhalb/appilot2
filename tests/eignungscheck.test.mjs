// Prüft, dass der Eignungscheck gut und schlecht beschriftete Masken unterscheidet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, '..', 'toolbox', 'eignungscheck', 'eignungscheck.mjs');

function serve(dir) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const f = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
      if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f));
    }).listen(0, () => resolve(srv));
  });
}

async function check(port, page) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eignung-'));
  const cfg = path.join(tmp, 'config.json');
  fs.writeFileSync(cfg, JSON.stringify({ name: page, baseUrl: `http://localhost:${port}/`, settleMs: 100, masks: [{ name: page, url: page }] }));
  // asynchron starten, damit der Testserver in diesem Prozess weiter antworten kann
  await run(process.execPath, [script, cfg, path.join(tmp, 'out')]);
  return JSON.parse(fs.readFileSync(path.join(tmp, 'out', 'report.json'), 'utf8'));
}

test('gut beschriftete Maske ist grün', async () => {
  const srv = await serve(path.join(here, 'fixtures'));
  try {
    const r = await check(srv.address().port, 'gut.html');
    const m = r.masken[0];
    assert.equal(r.gesamt, 'gruen');
    assert.equal(m.benennung, 100);
    assert.equal(m.eindeutigkeit, 100);
    assert.ok(m.meldungsbereiche >= 1, 'Statusbereich wird erkannt');
    assert.ok(m.feldhilfen > 0, 'Feldhilfe über aria-describedby wird erkannt');
  } finally { srv.close(); }
});

test('schwierige Maske ist rot und nennt die Befunde', async () => {
  const srv = await serve(path.join(here, 'fixtures'));
  try {
    const r = await check(srv.address().port, 'schlecht.html');
    const m = r.masken[0];
    assert.equal(r.gesamt, 'rot');
    assert.ok(m.benennung < 70, `Benennung ${m.benennung}`);
    assert.ok(m.generierteIds > 50, `generierte IDs ${m.generierteIds}`);
    assert.ok(m.blind.canvas >= 1 && m.blind.iframesFremd >= 1, 'blinde Bereiche werden erkannt');
    const why = m.probleme.map(p => p.why);
    assert.ok(why.includes('ohne Namen'));
    assert.ok(why.some(w => w.includes('nicht unterscheidbar')), 'doppeltes „Weiter“ wird gemeldet');
  } finally { srv.close(); }
});
