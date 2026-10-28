import { buildReport } from './lib/messung.js';
import { FRAGENKATALOG, URTEIL_AMPEL } from './lib/fragetest.js';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const tab = params.get('tabId') ? await chrome.tabs.get(+params.get('tabId'))
  : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
const isWeb = /^https?:/.test(tab?.url || '');
const origin = isWeb ? new URL(tab.url).origin : null;
const label = { gruen: 'Grün', gelb: 'Gelb', rot: 'Rot' };
const fmt = x => (x === null || x === undefined ? '–' : x.toLocaleString('de-DE') + ' %');
const status = (t, err) => { $('status').textContent = t; $('status').className = err ? 'err' : ''; };

$('host').textContent = isWeb ? origin : 'Diese Seite lässt sich nicht prüfen (nur http/https).';
$('name').value = tab?.title || '';
$('pruefen').disabled = $('fragen').disabled = !isWeb;
$('einstellungen').addEventListener('click', e => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

// Reiter
for (const [t, p] of [['tab-check', 'p-check'], ['tab-frage', 'p-frage']]) {
  $(t).addEventListener('click', () => {
    for (const [t2, p2] of [['tab-check', 'p-check'], ['tab-frage', 'p-frage']]) { $(t2).setAttribute('aria-selected', t2 === t); $(p2).hidden = p2 !== p; }
  });
}

// Fragenkatalog
for (const [gruppe, fragen] of Object.entries(FRAGENKATALOG)) {
  const og = document.createElement('optgroup'); og.label = gruppe;
  for (const f of fragen) { const o = document.createElement('option'); o.value = JSON.stringify(f); o.textContent = f.frage + (f.gegenprobe ? ' (Gegenprobe)' : ''); og.append(o); }
  $('katalog').append(og);
}
const pick = () => { const f = JSON.parse($('katalog').value); $('frage').value = ''; $('frage').placeholder = f.frage; $('gegenprobe').checked = !!f.gegenprobe; };
$('katalog').addEventListener('change', pick); pick();

const { einstellungen = {} } = await chrome.storage.local.get('einstellungen');
const cfg = { baseUrl: 'https://api.anthropic.com/v1/', ausblenden: true, ...einstellungen };
const modelHost = (() => { try { return new URL(cfg.baseUrl).host; } catch { return cfg.baseUrl; } })();
$('datenhinweis').textContent = `Gesendet werden die Frage und Rolle und Name der Bedienelemente an ${modelHost}` +
  (cfg.ausblenden ? ', Inhalte in Listen ausgeblendet.' : '. Achtung: Inhalte werden nicht ausgeblendet.') +
  (cfg.apiKey || !/anthropic/.test(modelHost) ? '' : ' Zuerst in den Einstellungen einen API-Schlüssel eintragen.');

let current = null;
function showResult(r) {
  current = r; $('ergebnis').hidden = false;
  const a = URTEIL_AMPEL[r.urteil] || 'rot';
  $('u-dot').className = 'dot ' + a; $('u-text').textContent = r.urteil;
  const ol = $('schritte'); ol.textContent = '';
  if (!r.plan.schritte.length) { const li = document.createElement('li'); li.textContent = r.plan.begruendung || 'Keine Schritte.'; ol.append(li); }
  r.plan.schritte.forEach((s, i) => {
    const p = r.pruefung[i] || {}; const li = document.createElement('li');
    li.textContent = s.erklaerung || `${s.aktion} ${s.rolle} „${s.name}“`;
    const sm = document.createElement('small'); sm.className = 'st-' + (p.status || '').split(' ')[0];
    sm.textContent = `${s.rolle} „${s.name}“ · ${p.status}${p.hinweis ? ' – ' + p.hinweis : ''}`;
    li.append(sm); ol.append(li);
  });
  $('weiter').hidden = !r.pruefung.some(p => p.status === 'offen');
}

async function render() {
  if (!origin) return;
  const d = await chrome.storage.local.get(['live:' + origin, 'fragen:' + origin]);
  const masken = d['live:' + origin]?.masken || []; const fragen = d['fragen:' + origin] || [];
  const n = masken.length + fragen.length;
  $('anzahl').textContent = n ? `(${masken.length} ${masken.length === 1 ? 'Maske' : 'Masken'}, ${fragen.length} ${fragen.length === 1 ? 'Frage' : 'Fragen'})` : '';
  $('report').disabled = $('leeren').disabled = !n;
  const list = $('liste'); list.textContent = '';
  if (!n) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Noch nichts geprüft.'; list.append(li); return; }
  const R = masken.length ? buildReport({ anwendung: origin, baseUrl: origin, masken, modus: 'Live-Check' }) : { masken: [] };
  const add = (cls, title, sub) => { const li = document.createElement('li'); const dot = document.createElement('span'); dot.className = 'dot ' + cls;
    const t = document.createElement('div'); t.className = 't'; const b = document.createElement('b'); b.textContent = title;
    const s = document.createElement('small'); s.textContent = sub; t.append(b, s); li.append(dot, t); list.append(li); };
  for (const m of R.masken) add(m.ampel, m.name, `Maske · ${label[m.ampel]} · Benennung ${fmt(m.benennung)} · eindeutig ${fmt(m.eindeutigkeit)} · ${m.problemeGesamt} Befunde`);
  for (const f of fragen) add(URTEIL_AMPEL[f.urteil] || 'rot', f.frage, `Frage${f.gegenprobe ? ' (Gegenprobe)' : ''} · ${f.urteil}`);
}

$('pruefen').addEventListener('click', async () => {
  $('pruefen').disabled = true; status('Prüfe … Chrome zeigt dabei kurz den Hinweis „wird debuggt“.');
  const res = await chrome.runtime.sendMessage({ type: 'check', tabId: tab.id,
    opts: { name: $('name').value, unkenntlich: $('unkenntlich').checked, kern: $('kern').checked } });
  $('pruefen').disabled = false;
  if (res?.ok) status(`Fertig: ${res.result.bedienelemente} Bedienelemente, ${res.result.problemeGesamt} Befunde.`);
  else status('Fehler: ' + (res?.error || 'unbekannt'), true);
  await render();
});

$('fragen').addEventListener('click', async () => {
  const k = JSON.parse($('katalog').value);
  const frage = $('frage').value.trim() || k.frage;
  $('fragen').disabled = true; status('Frage wird an das Sprachmodell gestellt und gegen die Seite geprüft …');
  const res = await chrome.runtime.sendMessage({ type: 'frage', tabId: tab.id, opts: { frage, gegenprobe: $('gegenprobe').checked } });
  $('fragen').disabled = false;
  if (res?.ok) { status(''); showResult(res.result); } else status('Fehler: ' + (res?.error || 'unbekannt'), true);
  await render();
});
$('weiter').addEventListener('click', async () => {
  if (!current) return; status('Prüfe die nächsten Schritte auf der aktuellen Seite …');
  const res = await chrome.runtime.sendMessage({ type: 'weiter', tabId: tab.id, opts: { origin, index: current.index } });
  if (res?.ok) { status(''); showResult(res.result); } else status('Fehler: ' + (res?.error || 'unbekannt'), true);
  await render();
});
$('overlayaus').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'overlay-aus', tabId: tab.id }));
$('report').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('report.html?origin=' + encodeURIComponent(origin)) }));
$('leeren').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'clear', origin }); await chrome.runtime.sendMessage({ type: 'fragen-leeren', origin });
  $('ergebnis').hidden = true; await render();
});
await render();
