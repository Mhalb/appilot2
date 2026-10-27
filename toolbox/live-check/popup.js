import { buildReport } from './lib/messung.js';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const tab = params.get('tabId') ? await chrome.tabs.get(+params.get('tabId'))
  : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
const isWeb = /^https?:/.test(tab?.url || '');
const origin = isWeb ? new URL(tab.url).origin : null;
const label = { gruen: 'Grün', gelb: 'Gelb', rot: 'Rot' };
const fmt = x => (x === null || x === undefined ? '–' : x.toLocaleString('de-DE') + ' %');

$('host').textContent = isWeb ? origin : 'Diese Seite lässt sich nicht prüfen (nur http/https).';
$('name').value = tab?.title || '';
$('pruefen').disabled = !isWeb;

async function render() {
  if (!origin) return;
  const key = 'live:' + origin;
  const data = (await chrome.storage.local.get(key))[key];
  const masken = data?.masken || [];
  $('anzahl').textContent = masken.length ? `(${masken.length})` : '';
  $('report').disabled = $('leeren').disabled = !masken.length;
  const list = $('liste'); list.textContent = '';
  if (!masken.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Noch keine Maske geprüft.'; list.append(li); return; }
  const R = buildReport({ anwendung: origin, baseUrl: origin, masken, modus: 'Live-Check' });
  for (const m of R.masken) {
    const li = document.createElement('li');
    const dot = document.createElement('span'); dot.className = 'dot ' + m.ampel; dot.title = label[m.ampel];
    const t = document.createElement('div'); t.className = 't';
    const b = document.createElement('b'); b.textContent = m.name;
    const s = document.createElement('small');
    s.textContent = `${label[m.ampel]} · Benennung ${fmt(m.benennung)} · eindeutig ${fmt(m.eindeutigkeit)} · ${m.problemeGesamt} Befunde`;
    t.append(b, s); li.append(dot, t); list.append(li);
  }
}

$('pruefen').addEventListener('click', async () => {
  const btn = $('pruefen'); btn.disabled = true; $('status').className = '';
  $('status').textContent = 'Prüfe … Chrome zeigt dabei kurz einen Hinweis zur Fehlersuche.';
  const res = await chrome.runtime.sendMessage({ type: 'check', tabId: tab.id,
    opts: { name: $('name').value, unkenntlich: $('unkenntlich').checked, kern: $('kern').checked } });
  btn.disabled = false;
  if (res?.ok) $('status').textContent = `Fertig: ${res.result.bedienelemente} Bedienelemente, ${res.result.problemeGesamt} Befunde.`;
  else { $('status').className = 'err'; $('status').textContent = 'Fehler: ' + (res?.error || 'unbekannt'); }
  await render();
});
$('report').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('report.html?origin=' + encodeURIComponent(origin)) }));
$('leeren').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'clear', origin }); await render(); });
await render();
