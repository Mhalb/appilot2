// Appilot-Toolbox · Fragetest
// Prüft, ob Appilot eine echte Frage zur geöffneten Seite beantworten und Schritt für Schritt führen kann.
// Das Sprachmodell bekommt nur Rolle und Name der Bedienelemente (ohne Inhalte), schlägt einen Schritt-Plan vor,
// und jeder Schritt wird gegen den echten Barrierefreiheitsbaum geprüft. Es wird nichts geklickt.
// Diese Datei ist die Quelle; toolbox/live-check/lib/fragetest.js ist eine Kopie (npm run sync:live-check).
import { INTERACTIVE } from './messung.js';

export const FRAGENKATALOG = {
  'Nextcloud – Dateien': [
    { frage: 'Wie lege ich einen neuen Ordner an?' },
    { frage: 'Wie lade ich eine Datei hoch?' },
    { frage: 'Wie teile ich eine Datei mit einer Kollegin?' },
    { frage: 'Wie benenne ich eine Datei um?' },
    { frage: 'Wie finde ich eine Datei über die Suche?' },
    { frage: 'Wie markiere ich eine Datei als Favorit?' },
    { frage: 'Wie öffne ich meine persönlichen Einstellungen?' },
    { frage: 'Wie buche ich hier meinen Urlaub?', gegenprobe: true },
    { frage: 'Wie drucke ich hier meine Gehaltsabrechnung aus?', gegenprobe: true },
  ],
  'Allgemein': [
    { frage: 'Wie suche ich etwas auf dieser Seite?' },
    { frage: 'Wie komme ich zur Startseite?' },
    { frage: 'Wie melde ich mich ab?' },
    { frage: 'Wie bestelle ich hier eine Pizza?', gegenprobe: true },
  ],
};

const MAX_ELEMENTS = 400;
const CONTENT_ROLES = new Set(['link', 'row', 'cell', 'gridcell', 'listitem', 'treeitem', 'option']);
// Namen, die nach Inhalt aussehen: Dateinamen, E-Mail-Adressen, lange Zahlen
const CONTENT_NAME = /\.[a-z0-9]{2,5}$|@|\d{4,}/i;

/**
 * Verdichtet den Baum auf Bedienelemente und Überschriften mit kurzer Kennung (e1, e2 …).
 * Mit ausblenden=true werden Namen von Einträgen in Listen und Tabellen (z. B. Dateinamen) durch „[Eintrag]“ ersetzt
 * und Zeilen nur durchnummeriert, damit keine Inhalte an das Sprachmodell gehen.
 */
export function compactElements(items, { ausblenden = true } = {}) {
  const rows = new Map(); let ausgeblendet = 0;
  const els = [];
  for (const i of items) {
    if (!(INTERACTIVE.has(i.role) || i.role === 'heading')) continue;
    let ctx = '';
    if (i.ctx) { if (!rows.has(i.ctx)) rows.set(i.ctx, rows.size + 1); ctx = 'Zeile ' + rows.get(i.ctx); }
    let name = i.name;
    if (ausblenden && name && ((ctx && CONTENT_ROLES.has(i.role)) || (i.role === 'heading' && ctx) || (i.role === 'link' && CONTENT_NAME.test(name)) || name.length > 80)) { name = '[Eintrag]'; ausgeblendet++; }
    els.push({ ref: 'e' + (els.length + 1), role: i.role, name, ctx, backend: i.backend, echt: i.name });
    if (els.length >= MAX_ELEMENTS) break;
  }
  return { elements: els, ausgeblendet };
}

export function buildMessages(frage, elements, seitentitel = '') {
  const list = elements.map(e => `${e.ref} ${e.role} "${e.name}"${e.ctx ? ' (' + e.ctx + ')' : ''}`).join('\n');
  const system = [
    'Du bist Appilot, ein Assistent, der Anwendende Schritt für Schritt durch eine Webanwendung führt.',
    'Du siehst nur die Bedienelemente der aktuellen Seite mit Kennung, Rolle und Namen.',
    'Beantworte die Frage ausschließlich mit diesen Elementen. Erfinde keine Elemente.',
    'Braucht ein Schritt ein Element, das erst nach einem vorherigen Schritt erscheint (z. B. ein Menüpunkt nach Klick auf ein Menü),',
    'setze "ref" auf null und gib die erwartete Rolle und den erwarteten Namen an.',
    'Ist die Aufgabe auf dieser Seite nicht möglich, setze "machbar" auf "nein" und gib keine Schritte an.',
    'Antworte nur mit JSON in dieser Form:',
    '{"machbar":"ja|teilweise|nein","begruendung":"kurz","schritte":[{"ref":"e12 oder null","rolle":"button","name":"Neu","aktion":"klicken|eingeben|auswählen|lesen","erklaerung":"kurzer Satz für Anwendende"}]}',
  ].join(' ');
  const user = `Seite: ${seitentitel}\nBedienelemente:\n${list}\n\nFrage: ${frage}`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

/** Ruft ein OpenAI-kompatibles Chat-Endpunkt auf (Anthropic, Bedrock-Proxy, Ollama, vLLM …). */
export async function askModel({ baseUrl, apiKey, model, maxTokens = 1200 }, messages, fetchFn = fetch) {
  const url = baseUrl.replace(/\/?$/, '/') + 'chat/completions';
  const res = await fetchFn(url, { method: 'POST',
    headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: 'Bearer ' + apiKey } : {}),
      // Anthropic verlangt diese Kennzeichnung für Aufrufe aus dem Browser (hier: aus der Erweiterung)
      ...(/api\.anthropic\.com/.test(baseUrl) ? { 'anthropic-dangerous-direct-browser-access': 'true', ...(apiKey ? { 'x-api-key': apiKey } : {}) } : {}) },
    // keine temperature < 1 und kein response_format: verträgt Anthropics OpenAI-Kompatibilität nicht
    body: JSON.stringify({ model, max_tokens: maxTokens, messages }) });
  if (!res.ok) throw new Error(`Sprachmodell antwortet mit ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  return { text, plan: parsePlan(text) };
}

export function parsePlan(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Antwort des Sprachmodells enthält kein JSON');
  const p = JSON.parse(text.slice(a, b + 1));
  return { machbar: String(p.machbar || '').toLowerCase(), begruendung: p.begruendung || '',
    schritte: Array.isArray(p.schritte) ? p.schritte.map(s => ({ ref: s.ref && s.ref !== 'null' ? String(s.ref) : null,
      rolle: s.rolle || '', name: s.name || '', aktion: s.aktion || '', erklaerung: s.erklaerung || '' })) : [] };
}

const norm = s => String(s || '').trim().toLowerCase();
function findNow(step, elements) {
  const hits = elements.filter(e => norm(e.role) === norm(step.rolle) && (norm(e.echt) === norm(step.name) || norm(e.name) === norm(step.name)));
  return hits;
}

/** Prüft jeden Schritt gegen die Elemente der Seite. Folgeschritte, die erst später erscheinen, bleiben offen. */
export function verifyPlan(plan, elements) {
  const byRef = new Map(elements.map(e => [e.ref, e]));
  return plan.schritte.map((s, idx) => checkStep(s, idx, byRef, elements));
}

function checkStep(s, idx, byRef, elements) {
  if (s.ref) {
    const e = byRef.get(s.ref);
    if (!e) return { status: 'erfunden', hinweis: `Kennung ${s.ref} gibt es auf der Seite nicht` };
    if (s.rolle && norm(e.role) !== norm(s.rolle)) return { status: 'erfunden', hinweis: `${s.ref} ist ${e.role}, nicht ${s.rolle}`, backend: e.backend };
    const same = elements.filter(x => x.role === e.role && x.echt === e.echt && x.ctx === e.ctx);
    return { status: same.length > 1 ? 'mehrdeutig' : 'gefunden', backend: e.backend, ref: e.ref };
  }
  const hits = findNow(s, elements);
  if (hits.length === 1) return { status: 'gefunden', backend: hits[0].backend, ref: hits[0].ref };
  if (hits.length > 1) return { status: 'mehrdeutig', backend: hits[0].backend, ref: hits[0].ref };
  return { status: idx === 0 ? 'nicht gefunden' : 'offen', hinweis: idx === 0 ? 'erster Schritt nicht auf der Seite' : 'erscheint erst nach vorherigem Schritt' };
}

/** Nach einem Klick der Person: offene Schritte gegen die neue Seite prüfen. */
export function verifyOpen(plan, pruefung, elements) {
  const byRef = new Map();
  return pruefung.map((p, idx) => {
    if (p.status !== 'offen') return p;
    const s = { ...plan.schritte[idx], ref: null };
    const r = checkStep(s, idx, byRef, elements);
    return r.status === 'nicht gefunden' || r.status === 'offen' ? { status: 'offen', hinweis: 'noch nicht sichtbar' } : r;
  });
}

/** Gesamturteil für eine Frage. */
export function judge(plan, pruefung, gegenprobe) {
  if (gegenprobe) return plan.machbar === 'nein' && !plan.schritte.length
    ? 'bestanden' : 'nicht bestanden';
  if (plan.machbar === 'nein' || !plan.schritte.length) return 'nicht beantwortbar';
  if (pruefung.some(p => p.status === 'erfunden')) return 'unzuverlässig';
  if (pruefung[0]?.status === 'nicht gefunden') return 'nicht beantwortbar';
  if (pruefung.every(p => p.status === 'gefunden')) return 'beantwortbar';
  if (pruefung.some(p => p.status === 'mehrdeutig')) return 'teilweise';
  return 'beantwortbar, Folgeschritte offen';
}

export const URTEIL_AMPEL = { 'beantwortbar': 'gruen', 'bestanden': 'gruen', 'beantwortbar, Folgeschritte offen': 'gelb',
  'teilweise': 'gelb', 'nicht beantwortbar': 'rot', 'unzuverlässig': 'rot', 'nicht bestanden': 'rot' };

/** Läuft im Browser der geprüften Seite: markiert gefundene Elemente mit Nummern, ohne die Anwendung zu bedienen. */
export function overlayInPage(boxes) {
  const old = document.getElementById('appilot-check-overlay'); if (old) old.remove();
  if (!boxes || !boxes.length) return 0;
  const root = document.createElement('div'); root.id = 'appilot-check-overlay';
  root.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none';
  for (const b of boxes) {
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;border:3px solid ${b.ok ? '#92BD14' : '#e0a800'};border-radius:6px;box-shadow:0 0 0 3px rgba(0,0,0,.15)`;
    const n = document.createElement('div'); n.textContent = b.label;
    n.style.cssText = `position:absolute;left:-12px;top:-12px;min-width:22px;height:22px;padding:0 5px;border-radius:11px;background:${b.ok ? '#92BD14' : '#e0a800'};color:#000;font:600 13px/22px system-ui,sans-serif;text-align:center`;
    d.append(n); root.append(d);
  }
  document.body.append(root);
  return boxes.length;
}
export function clearOverlayInPage() { const o = document.getElementById('appilot-check-overlay'); if (o) o.remove(); return true; }

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** HTML-Abschnitt für den Report. */
export function fragenHtml(fragen) {
  if (!fragen?.length) return '';
  const label = { gruen: 'Grün', gelb: 'Gelb', rot: 'Rot' };
  const normal = fragen.filter(f => !f.gegenprobe), gegen = fragen.filter(f => f.gegenprobe);
  const ok = normal.filter(f => f.urteil === 'beantwortbar' || f.urteil === 'beantwortbar, Folgeschritte offen').length;
  const okG = gegen.filter(f => f.urteil === 'bestanden').length;
  const rows = fragen.map(f => {
    const a = URTEIL_AMPEL[f.urteil] || 'rot';
    const steps = f.plan.schritte.map((s, i) => `<li>${esc(s.erklaerung || `${s.aktion} ${s.rolle} „${s.name}“`)} <small>(${esc(s.rolle)} „${esc(s.name)}“ · <b>${esc(f.pruefung[i]?.status)}</b>${f.pruefung[i]?.hinweis ? ', ' + esc(f.pruefung[i].hinweis) : ''})</small></li>`).join('');
    return `<tr><td>${esc(f.frage)}${f.gegenprobe ? ' <small>(Gegenprobe)</small>' : ''}<br><small>${esc(f.maske)}</small></td>
      <td><span class="dot ${a}" aria-hidden="true"></span>${esc(f.urteil)}<br><small>Modell: ${esc(f.plan.machbar || '–')}${f.plan.begruendung ? ' · ' + esc(f.plan.begruendung) : ''}</small></td>
      <td>${steps ? `<ol>${steps}</ol>` : '<small>keine Schritte</small>'}</td></tr>`;
  }).join('');
  return `<h2>Fragetest</h2>
<p>Beantwortbar: <b>${ok} von ${normal.length}</b> Fragen. Gegenproben bestanden: <b>${okG} von ${gegen.length}</b>.
<span class="muted">Gesendet wurden nur Rolle und Name der Bedienelemente; Inhalte in Listen waren ${fragen.every(f => f.ausblenden) ? 'ausgeblendet' : 'teilweise nicht ausgeblendet'}. Modell: ${esc([...new Set(fragen.map(f => f.modell))].join(', '))}.</span></p>
<div class="scroll"><table><thead><tr><th>Frage</th><th>Ergebnis</th><th>Schritte und Prüfung</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="muted">„gefunden“: Element existiert und ist eindeutig. „mehrdeutig“: mehrere passende Elemente. „offen“: erscheint erst nach einem vorherigen Schritt und wurde nicht weiter geprüft. „erfunden“: das Modell hat ein Element genannt, das es nicht gibt. Gegenprobe bestanden: Das Modell hat erkannt, dass die Aufgabe hier nicht möglich ist. Antworten von Sprachmodellen schwanken; einzelne Fragen ggf. mehrfach testen.</p>`;
}
