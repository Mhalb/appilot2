import { buildReport, reportHtml } from './lib/messung.js';
const origin = new URLSearchParams(location.search).get('origin');
const key = 'live:' + origin;
const data = (await chrome.storage.local.get(key))[key];
if (!data?.masken?.length) {
  document.body.textContent = 'Für ' + origin + ' sind noch keine Masken geprüft.';
} else {
  const R = buildReport({ anwendung: new URL(origin).host, baseUrl: origin, masken: data.masken, modus: 'Live-Check' });
  const html = reportHtml(R);
  // Report als eigenständiges Dokument darstellen; die Downloads enthalten genau dieses HTML und die Rohdaten
  const doc = new DOMParser().parseFromString(html, 'text/html');
  document.head.replaceWith(document.adoptNode(doc.head));
  document.body.replaceWith(document.adoptNode(doc.body));
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const base = `eignungscheck-${new URL(origin).host}-${stamp}`;
  const bar = document.createElement('p');
  bar.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap';
  for (const [text, type, content, ext] of [['Report herunterladen (HTML)', 'text/html', html, 'html'],
    ['Rohdaten herunterladen (JSON)', 'application/json', JSON.stringify(R, null, 2), 'json']]) {
    const a = document.createElement('a'); a.textContent = text; a.download = `${base}.${ext}`;
    a.href = URL.createObjectURL(new Blob([content], { type })); bar.append(a);
  }
  document.querySelector('main').prepend(bar);
}
