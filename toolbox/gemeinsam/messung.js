// Appilot-Toolbox · gemeinsame Messlogik für Eignungscheck (Skript) und Live-Check (Browser-Erweiterung).
// Reines ES-Modul ohne Abhängigkeiten. Eingabe ist der Barrierefreiheitsbaum aus dem Chrome DevTools Protocol
// (Accessibility.getFullAXTree); woher er kommt (Playwright oder chrome.debugger), ist hier egal.
// Diese Datei ist die Quelle; toolbox/live-check/lib/messung.js ist eine Kopie (npm run sync:live-check).

export const INTERACTIVE = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch',
  'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'slider', 'spinbutton', 'listbox', 'treeitem']);
export const FIELDS = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton', 'listbox', 'checkbox', 'radio', 'switch', 'slider']);
export const MESSAGES = new Set(['alert', 'alertdialog', 'status', 'log', 'marquee', 'timer']);
// Technisch wirkende Namen (z. B. Symbolname „edit“ statt „Position bearbeiten“)
export const WEAK_NAME = /^([a-z]+(-[a-z]+)*|[a-z]+[A-Z]\w*|sap-icon:\/\/.*|icon|btn\w*)$/;
// Generierte IDs: lange Ziffernfolgen, Hashes, typische Framework-Präfixe (UI5, ExtJS, React, Angular)
export const GENERATED_ID = /(\d{4,})|([a-f0-9]{10,})|(^__)|(--\d)|(^(ext|ui5|id|ember|react|ng|mat|j_id)[-_:]?\d)|(:r[0-9a-z]+:)/i;

const v = x => (x && x.value !== undefined ? x.value : undefined);
const prop = (n, name) => { const p = (n.properties || []).find(p => p.name === name); return p ? v(p.value) : undefined; };
export const pct = (a, b) => (b ? Math.round(1000 * a / b) / 10 : null);

/** Wandelt die Knoten aus Accessibility.getFullAXTree in eine flache Liste mit Rolle, Name und Zeilenkontext. */
export function itemsFromAX(nodes) {
  const byId = new Map(nodes.map(n => [n.nodeId, n]));
  const ctxOf = n => { // nächste Zeile/Listeneintrag als Kontext, wie Appilot ihn zur Unterscheidung nutzen kann
    let p = byId.get(n.parentId), hops = 0;
    while (p && hops++ < 12) {
      const r = v(p.role);
      if (['row', 'listitem', 'treeitem', 'article'].includes(r)) return r + ':' + ((v(p.name) || '').trim() || p.nodeId);
      p = byId.get(p.parentId);
    }
    return '';
  };
  const items = [];
  for (const n of nodes) {
    if (n.ignored) continue;
    const role = v(n.role); if (!role) continue;
    items.push({ role, name: (v(n.name) || '').trim(), desc: (v(n.description) || '').trim(),
      live: prop(n, 'live'), backend: n.backendDOMNodeId, ctx: ctxOf(n) });
  }
  return items;
}

export function analyse(items) {
  const inter = items.filter(i => INTERACTIVE.has(i.role));
  const named = inter.filter(i => i.name);
  const counts = {}; for (const i of named) { const k = i.role + '|' + i.name; counts[k] = (counts[k] || 0) + 1; }
  const unique = named.filter(i => counts[i.role + '|' + i.name] === 1);
  const cc = {}; for (const i of named) { const k = i.role + '|' + i.name + '|' + i.ctx; cc[k] = (cc[k] || 0) + 1; }
  const uniqueCtx = named.filter(i => cc[i.role + '|' + i.name + '|' + i.ctx] === 1);
  const weak = named.filter(i => WEAK_NAME.test(i.name));
  const fields = inter.filter(i => FIELDS.has(i.role));
  const withHelp = fields.filter(i => i.desc);
  const messages = items.filter(i => MESSAGES.has(i.role) || (i.live && i.live !== 'off'));
  const headings = items.filter(i => i.role === 'heading' && i.name).map(i => i.name);
  return { inter, named, unique, uniqueCtx, weak, counts, cc, fields, withHelp, messages, headings };
}

/** Wird im Browser der geprüften Seite ausgeführt (page.evaluate bzw. Runtime.evaluate). Keine Abhängigkeiten. */
export function blindAreasInPage() {
  const res = { iframesFremd: 0, iframesGleich: 0, canvas: 0, verdachtGeschlossenesShadowDom: 0 };
  for (const f of document.querySelectorAll('iframe')) {
    try { if (f.contentDocument) res.iframesGleich++; else res.iframesFremd++; } catch { res.iframesFremd++; }
  }
  res.canvas = document.querySelectorAll('canvas').length;
  for (const el of document.querySelectorAll('*')) {
    if (el.tagName.includes('-') && !el.shadowRoot && el.childElementCount === 0 && !el.textContent.trim()
        && el.getBoundingClientRect().width > 40) res.verdachtGeschlossenesShadowDom++;
  }
  return res;
}

/**
 * Misst eine Maske.
 * @param {object} o
 * @param {Array} o.items            Ergebnis von itemsFromAX
 * @param {Function} o.domInfo       async (backendNodeId) => {tag, id}
 * @param {Function} [o.clip]        async (backendNodeId) => dataURL|null
 * @param {Array|null} [o.secondItems] zweite Messung (nach Neuladen bzw. Wartezeit) für die Stabilität
 */
export async function measureMask(o) {
  const a = analyse(o.items);
  let generated = 0; const problems = [];
  for (const i of a.inter) {
    const d = (await o.domInfo(i.backend)) || {}; i.tag = d.tag || ''; i.domId = d.id || '';
    if (i.domId && GENERATED_ID.test(i.domId)) { generated++; i.generated = true; }
  }
  for (const i of a.inter) {
    let why = null;
    if (!i.name) why = 'ohne Namen';
    else if (a.cc[i.role + '|' + i.name + '|' + i.ctx] > 1) why = `Name ${a.counts[i.role + '|' + i.name]}× vorhanden, auch im Kontext nicht unterscheidbar`;
    else if (WEAK_NAME.test(i.name)) why = 'Name wirkt technisch';
    else if (a.counts[i.role + '|' + i.name] > 1) why = `Name ${a.counts[i.role + '|' + i.name]}× vorhanden, über Zeile unterscheidbar`;
    else if (i.generated) why = 'generierte ID';
    if (why) problems.push({ role: i.role, name: i.name, tag: i.tag, id: i.domId, why, backend: i.backend });
  }
  const sev = w => (w.includes('nicht unterscheidbar') ? 0 : w === 'ohne Namen' ? 1 : w.includes('technisch') ? 2 : w.includes('über Zeile') ? 3 : 4);
  problems.sort((x, y) => sev(x.why) - sev(y.why));
  if (o.clip) for (const p of problems.slice(0, o.maxShots ?? 8)) p.bild = await o.clip(p.backend);
  let stabilitaet = null;
  if (o.secondItems) {
    const b = analyse(o.secondItems);
    const keysB = new Set(b.named.map(i => i.role + '|' + i.name));
    stabilitaet = pct(a.named.filter(i => keysB.has(i.role + '|' + i.name)).length, a.named.length);
  }
  return {
    name: o.name, url: o.url, kern: o.kern !== false, title: o.title || '', heading: a.headings[0] || '',
    bedienelemente: a.inter.length,
    benennung: pct(a.named.length, a.inter.length),
    eindeutigkeitRoh: pct(a.unique.length, a.named.length),
    eindeutigkeit: pct(a.uniqueCtx.length, a.named.length),
    technischeNamen: pct(a.weak.length, a.named.length),
    stabilitaet, stabilitaetArt: o.stabilitaetArt || 'neu geladen',
    generierteIds: pct(generated, a.inter.length),
    felder: a.fields.length, feldhilfen: pct(a.withHelp.length, a.fields.length),
    meldungsbereiche: a.messages.length,
    blind: o.blind || { iframesFremd: 0, iframesGleich: 0, canvas: 0, verdachtGeschlossenesShadowDom: 0 },
    csp: o.csp || '', gemessen: new Date().toISOString(),
    probleme: problems.map(({ backend, ...p }) => p), problemeGesamt: problems.length,
  };
}

export function ampel(r) {
  if (r.fehler) return 'rot';
  const min = Math.min(r.benennung ?? 0, r.eindeutigkeit ?? 0);
  const blind = r.blind.iframesFremd + r.blind.canvas + r.blind.verdachtGeschlossenesShadowDom;
  if (min < 70 || (r.kern && r.blind.iframesFremd > 0)) return 'rot';
  if (min < 90 || (r.stabilitaet ?? 100) < 95 || (r.technischeNamen ?? 0) > 10 || blind > 0 || r.maskeErkennbar === false) return 'gelb';
  return 'gruen';
}

/** Fasst Masken zu einem Report zusammen (Ampel je Maske und gesamt, Mittelwerte, Einbindung, Aufwand). */
export function buildReport({ anwendung, baseUrl, masken, modus = 'Skript' }) {
  const ok = masken.filter(r => !r.fehler);
  const keyOf = r => [r.title, r.heading].join('|');
  for (const r of ok) r.maskeErkennbar = ok.filter(x => x !== r && x.url === r.url && keyOf(x) === keyOf(r)).length === 0;
  const sig = ok.map(r => [r.url, r.title, r.heading].join('|'));
  for (const r of masken) r.ampel = ampel(r);
  const order = { gruen: 0, gelb: 1, rot: 2 };
  const kern = masken.filter(r => r.kern !== false);
  const gesamt = kern.length ? kern.reduce((m, r) => (order[r.ampel] > order[m] ? r.ampel : m), 'gruen') : 'gelb';
  const avg = k => { const xs = ok.map(r => r[k]).filter(x => x !== null && x !== undefined); return xs.length ? Math.round(10 * xs.reduce((s, x) => s + x, 0) / xs.length) / 10 : null; };
  const c = ok.map(r => r.csp).find(Boolean);
  let integration;
  if (!c) integration = 'Script-Einbindung möglich (keine Content-Security-Policy gesetzt).';
  else {
    const s = (c.match(/script-src([^;]*)/) || c.match(/default-src([^;]*)/) || [, ''])[1];
    integration = /'self'|\*/.test(s)
      ? `Content-Security-Policy erlaubt Skripte nur eingeschränkt (${s.trim()}); Einbindung über Freigabe in der CSP, Browser-Erweiterung oder Reverse Proxy.`
      : `Content-Security-Policy blockiert fremde Skripte (${s.trim()}); Browser-Erweiterung oder Reverse Proxy nötig.`;
  }
  const aufwand = { gruen: 'Standardprofil, grob 1–2 Tage je Anwendung', gelb: 'Profil mit Zusatzregeln für die markierten Masken, grob 3–5 Tage', rot: 'Erst Barrieren beheben lassen oder andere Integration prüfen' }[gesamt];
  return { anwendung, modus, erstellt: new Date().toISOString(), baseUrl, gesamt, maskenUnterscheidbar: new Set(sig).size === sig.length,
    mittel: { benennung: avg('benennung'), eindeutigkeit: avg('eindeutigkeit'), stabilitaet: avg('stabilitaet'), feldhilfen: avg('feldhilfen') },
    integration, aufwand, masken };
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function reportHtml(R) {
  const label = { gruen: 'Grün', gelb: 'Gelb', rot: 'Rot' };
  const fmt = x => (x === null || x === undefined ? '–' : x.toLocaleString('de-DE') + ' %');
  const dot = a => `<span class="dot ${a}" aria-hidden="true"></span><span>${label[a]}</span>`;
  const rows = R.masken.map(m => m.fehler ? `<tr><td>${esc(m.name)}</td><td colspan="8">Fehler: ${esc(m.fehler)}</td><td>${dot('rot')}</td></tr>` :
    `<tr><td>${esc(m.name)}${m.kern ? '' : ' <small>(keine Kernmaske)</small>'}<br><small>${esc(m.url)}</small></td><td class="n">${m.bedienelemente}</td><td class="n">${fmt(m.benennung)}</td><td class="n">${fmt(m.eindeutigkeit)}<br><small>ohne Zeile ${fmt(m.eindeutigkeitRoh)}</small></td><td class="n">${fmt(m.technischeNamen)}</td><td class="n">${fmt(m.stabilitaet)}</td><td class="n">${fmt(m.generierteIds)}</td><td class="n">${fmt(m.feldhilfen)}</td><td class="n">${m.meldungsbereiche}</td><td>${dot(m.ampel)}</td></tr>`).join('');
  const probs = R.masken.filter(m => !m.fehler && m.probleme.length).map(m => `<h3>${esc(m.name)} <small>${m.problemeGesamt} Befunde</small></h3>
    <table><thead><tr><th>Rolle</th><th>Name</th><th>Element</th><th>Befund</th><th>Ausschnitt</th></tr></thead><tbody>${
    m.probleme.slice(0, 25).map(p => `<tr><td>${esc(p.role)}</td><td>${esc(p.name) || '<em>leer</em>'}</td><td><code>${esc(p.tag)}${p.id ? '#' + esc(p.id) : ''}</code></td><td>${esc(p.why)}</td><td>${p.bild ? `<img src="${p.bild}" alt="Ausschnitt ${esc(p.name || p.role)}">` : ''}</td></tr>`).join('')
    }</tbody></table>${m.probleme.length > 25 ? `<p class="muted">… und ${m.probleme.length - 25} weitere (siehe report.json)</p>` : ''}`).join('');
  const blind = R.masken.filter(m => !m.fehler && (m.blind.iframesFremd || m.blind.canvas || m.blind.verdachtGeschlossenesShadowDom))
    .map(m => `<li>${esc(m.name)}: ${m.blind.iframesFremd} fremde iframes, ${m.blind.canvas} Canvas, ${m.blind.verdachtGeschlossenesShadowDom} Verdacht auf geschlossenes Shadow DOM</li>`).join('') || '<li>Keine gefunden.</li>';
  const stabArt = [...new Set(R.masken.filter(m => !m.fehler).map(m => m.stabilitaetArt))].join(', ');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Eignungscheck ${esc(R.anwendung)}</title><style>
:root{--g:#92BD14;--ink:#111;--muted:#555;--line:#ddd;--bg:#fff;--card:#f6f7f3}
@media (prefers-color-scheme:dark){:root{--ink:#eee;--muted:#aaa;--line:#333;--bg:#141414;--card:#1d1d1d}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1080px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:32px 0 8px;border-bottom:2px solid var(--g);padding-bottom:4px}h3{font-size:16px;margin:20px 0 6px}
small,.muted{color:var(--muted);font-weight:400}
.hero{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0}.card{background:var(--card);border-radius:10px;padding:12px 16px;min-width:150px}
.card b{display:block;font-size:22px}.big{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:600}
.dot{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:6px;vertical-align:-1px}.big .dot{width:20px;height:20px}
.gruen{background:#2e9e44}.gelb{background:#e0a800}.rot{background:#d23b3b}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
th{font-weight:600}td.n{text-align:right;font-variant-numeric:tabular-nums}img{max-width:220px;max-height:70px;border:1px solid var(--line);border-radius:4px}
code{font-size:12.5px}.note{background:var(--card);border-left:4px solid var(--g);padding:10px 14px;border-radius:6px}
</style></head><body><main>
<p class="muted">Appilot-Toolbox · Eignungscheck (${esc(R.modus)}, Prototyp)</p>
<h1>${esc(R.anwendung)}</h1>
<p class="muted">${esc(R.baseUrl)} · ${new Date(R.erstellt).toLocaleString('de-DE')}</p>
<div class="hero"><div class="card"><span class="muted">Gesamt (Kernmasken)</span><div class="big">${dot(R.gesamt)}</div></div>
<div class="card"><span class="muted">Benennung</span><b>${fmt(R.mittel.benennung)}</b></div>
<div class="card"><span class="muted">Eindeutigkeit</span><b>${fmt(R.mittel.eindeutigkeit)}</b></div>
<div class="card"><span class="muted">Stabilität</span><b>${fmt(R.mittel.stabilitaet)}</b></div>
<div class="card"><span class="muted">Feldhilfen</span><b>${fmt(R.mittel.feldhilfen)}</b></div></div>
<p><b>Empfehlung:</b> ${esc(R.aufwand)}. <b>Einbindung:</b> ${esc(R.integration)}</p>
<h2>Masken</h2><div class="scroll"><table><thead><tr><th>Maske</th><th>Bedien&shy;elemente</th><th>Benennung</th><th>Eindeutig (mit Zeile)</th><th>Technische Namen</th><th>Stabil</th><th>Generierte IDs</th><th>Feldhilfen</th><th>Meldungs&shy;bereiche</th><th>Ampel</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="muted">Masken unterscheidbar über Adresse, Titel oder Überschrift: ${R.maskenUnterscheidbar ? 'ja' : 'nein'}.</p>
<h2>Blinde Bereiche</h2><ul>${blind}</ul>
<h2>Befunde je Maske</h2><div class="scroll">${probs || '<p>Keine Befunde.</p>'}</div>
<h2>So ist der Report zu lesen</h2>
<ul><li><b>Benennung:</b> Anteil der Bedienelemente mit Rolle und Namen im Barrierefreiheitsbaum.</li>
<li><b>Eindeutig (mit Zeile):</b> Anteil der benannten Elemente, die Appilot über Rolle, Name und die umgebende Tabellenzeile oder den Listeneintrag sicher unterscheiden kann; darunter der Wert ohne Zeilenkontext.</li><li><b>Technische Namen:</b> Anteil der Namen, die wie interne Bezeichner wirken (z. B. Symbolname „edit“). Appilot findet das Element, kann es aber nicht verständlich erklären.</li>
<li><b>Stabil:</b> Anteil, der bei einer zweiten Messung gleich bleibt (${esc(stabArt || '–')}). <b>Generierte IDs:</b> Anteil mit IDs, die nach Framework-Mustern aussehen.</li>
<li><b>Feldhilfen:</b> Anteil der Eingabefelder mit Beschreibung im Barrierefreiheitsbaum (z. B. <code>aria-describedby</code>). Fehlen sie, muss das Profil die Feldhilfen liefern. Auswahloptionen in Listen zählen nicht als eigene Bedienelemente. <b>Ampel:</b> Grün ab 90 % Benennung und Eindeutigkeit, höchstens 10 % technische Namen und ohne blinde Bereiche; Gelb ab 70 %; sonst Rot. Generierte IDs fließen nicht in die Ampel ein, weil Appilot über Rolle und Name sucht. Schwellen sind vorläufig.</li></ul>
<p class="note">Dieser Report misst die Eignung für Appilot. Er ersetzt keine Prüfung nach BITV oder EN 301 549; die Befunde können aber Anlass für eine solche Prüfung sein.</p>
</main></body></html>`;
}

/**
 * Macht einen Bildausschnitt unkenntlich (Verpixeln), damit im Report keine echten Daten lesbar sind.
 * Läuft im Browser (Seite oder Service Worker der Erweiterung), braucht OffscreenCanvas.
 */
export async function pixelateDataUrl(dataUrl, block = 7) {
  const blob = await (await fetch(dataUrl)).blob();
  const bmp = await createImageBitmap(blob);
  const w = Math.max(1, Math.round(bmp.width / block)), h = Math.max(1, Math.round(bmp.height / block));
  const small = new OffscreenCanvas(w, h); small.getContext('2d').drawImage(bmp, 0, 0, w, h);
  const out = new OffscreenCanvas(bmp.width, bmp.height); const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false; ctx.drawImage(small, 0, 0, bmp.width, bmp.height);
  const res = await out.convertToBlob({ type: 'image/png' });
  const buf = new Uint8Array(await res.arrayBuffer()); let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return 'data:image/png;base64,' + btoa(s);
}
