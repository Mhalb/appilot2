// Appilot-Check · Service Worker
// Hängt sich per chrome.debugger an den aktiven Tab, liest den Barrierefreiheitsbaum und misst die Maske
// mit derselben Logik wie das Skript. Ergebnisse liegen in chrome.storage.local, je Herkunft (origin).
import { itemsFromAX, measureMask, blindAreasInPage, pixelateDataUrl } from './lib/messung.js';
import { compactElements, buildMessages, askModel, verifyPlan, verifyOpen, judge, overlayInPage, clearOverlayInPage } from './lib/fragetest.js';

const PROTOCOL = '1.3';
const send = (target, method, params = {}) => chrome.debugger.sendCommand(target, method, params);
const evalInPage = async (target, fn, arg) => {
  const call = arg === undefined ? '()' : `(${JSON.stringify(arg)})`;
  const r = await send(target, 'Runtime.evaluate', { expression: `(${fn.toString()})${call}`, returnByValue: true, awaitPromise: true });
  return r.result ? r.result.value : undefined;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
export const storageKey = origin => 'live:' + origin;

// CSP der Seite: HEAD-Anfrage an dieselbe Adresse, ändert nichts an der Anwendung
function cspInPage() {
  return fetch(location.href, { method: 'HEAD', credentials: 'include', cache: 'no-store' })
    .then(r => r.headers.get('content-security-policy') || '').catch(() => '');
}
function scrollInPage() { return { x: scrollX, y: scrollY }; }

async function check(tabId, opts = {}) {
  const { unkenntlich = true, kern = true, wartezeit = 1500, maxShots = 8 } = opts;
  const tab = await chrome.tabs.get(tabId);
  if (!/^https?:/.test(tab.url || '')) throw new Error('Nur Webseiten (http/https) lassen sich prüfen.');
  const target = { tabId };
  await chrome.debugger.attach(target, PROTOCOL);
  try {
    await send(target, 'DOM.enable'); await send(target, 'Accessibility.enable'); await send(target, 'Page.enable');
    await send(target, 'DOM.getDocument', { depth: -1, pierce: true });
    const snap = async () => itemsFromAX((await send(target, 'Accessibility.getFullAXTree')).nodes);
    const items = await snap();
    const blind = await evalInPage(target, blindAreasInPage);
    const csp = await evalInPage(target, cspInPage);
    const domInfo = async backend => {
      try {
        const { node } = await send(target, 'DOM.describeNode', { backendNodeId: backend });
        const a = node.attributes || []; let id = '';
        for (let i = 0; i < a.length; i += 2) if (a[i] === 'id') id = a[i + 1];
        return { tag: (node.localName || node.nodeName || '').toLowerCase(), id };
      } catch { return { tag: '', id: '' }; }
    };
    const clip = async backend => {
      try {
        const { model } = await send(target, 'DOM.getBoxModel', { backendNodeId: backend });
        const s = await evalInPage(target, scrollInPage);
        const q = model.border; const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
        const x = Math.max(0, Math.min(...xs) - 6), y = Math.max(0, Math.min(...ys) - 6);
        const w = Math.max(...xs) - x + 12, h = Math.max(...ys) - y + 12;
        if (w < 4 || h < 4 || w > 1400 || h > 900) return null;
        const shot = await send(target, 'Page.captureScreenshot',
          { format: 'png', captureBeyondViewport: true, clip: { x: x + s.x, y: y + s.y, width: w, height: h, scale: 1 } });
        const url = 'data:image/png;base64,' + shot.data;
        return unkenntlich ? await pixelateDataUrl(url) : url;
      } catch { return null; }
    };
    const name = (opts.name || tab.title || tab.url).trim();
    const result = await measureMask({ items, domInfo, clip, maxShots, name, url: tab.url, kern, title: tab.title, blind, csp, secondItems: null });
    // Stabilität ohne Neuladen: zweite Messung nach kurzer Wartezeit (die Seite des Nutzers bleibt, wie sie ist)
    await sleep(wartezeit);
    const second = await snap();
    const stab = await measureMask({ items, domInfo: async () => ({}), secondItems: second, name, url: tab.url });
    result.stabilitaet = stab.stabilitaet;
    result.stabilitaetArt = `zweite Messung nach ${(wartezeit / 1000).toLocaleString('de-DE')} s, ohne Neuladen`;
    result.unkenntlich = unkenntlich;
    await save(new URL(tab.url).origin, result);
    return result;
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

async function save(origin, result) {
  const key = storageKey(origin);
  const cur = (await chrome.storage.local.get(key))[key] || { origin, masken: [] };
  cur.masken = cur.masken.filter(m => !(m.url === result.url && m.name === result.name));
  cur.masken.push(result);
  await chrome.storage.local.set({ [key]: cur });
}

// ---------- Fragetest ----------
export const DEFAULTS = { baseUrl: 'https://api.anthropic.com/v1/', model: 'claude-sonnet-5-5', apiKey: '', ausblenden: true };
export const fragenKey = origin => 'fragen:' + origin;
async function settings() { return { ...DEFAULTS, ...((await chrome.storage.local.get('einstellungen')).einstellungen || {}) }; }

async function withPage(tabId, fn) {
  const tab = await chrome.tabs.get(tabId);
  if (!/^https?:/.test(tab.url || '')) throw new Error('Nur Webseiten (http/https) lassen sich prüfen.');
  const target = { tabId };
  await chrome.debugger.attach(target, PROTOCOL);
  try {
    await send(target, 'DOM.enable'); await send(target, 'Accessibility.enable');
    await send(target, 'DOM.getDocument', { depth: -1, pierce: true });
    const items = itemsFromAX((await send(target, 'Accessibility.getFullAXTree')).nodes);
    return await fn({ tab, target, items });
  } finally { await chrome.debugger.detach(target).catch(() => {}); }
}

async function markSteps(target, pruefung) {
  const s = await evalInPage(target, scrollInPage);
  const boxes = [];
  for (const [i, p] of pruefung.entries()) {
    if (!p.backend || !['gefunden', 'mehrdeutig'].includes(p.status)) continue;
    try {
      const { model } = await send(target, 'DOM.getBoxModel', { backendNodeId: p.backend });
      const q = model.border; const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
      boxes.push({ x: Math.min(...xs) + s.x - 3, y: Math.min(...ys) + s.y - 3, w: Math.max(...xs) - Math.min(...xs) + 6,
        h: Math.max(...ys) - Math.min(...ys) + 6, label: String(i + 1), ok: p.status === 'gefunden' });
    } catch { /* Element nicht sichtbar */ }
  }
  return evalInPage(target, overlayInPage, boxes);
}

async function frage(tabId, { frage, gegenprobe = false }) {
  const cfg = await settings();
  if (!cfg.apiKey && /anthropic\.com/.test(cfg.baseUrl)) throw new Error('Bitte zuerst in den Einstellungen einen API-Schlüssel eintragen.');
  return withPage(tabId, async ({ tab, target, items }) => {
    const { elements, ausgeblendet } = compactElements(items, { ausblenden: cfg.ausblenden });
    const messages = buildMessages(frage, elements, cfg.ausblenden ? '' : tab.title);
    const { plan } = await askModel(cfg, messages);
    const pruefung = verifyPlan(plan, elements);
    await markSteps(target, pruefung);
    const entry = { frage, gegenprobe, url: tab.url, maske: tab.title, modell: cfg.model, ausblenden: cfg.ausblenden,
      gesendet: { elemente: elements.length, ausgeblendet }, plan, pruefung, urteil: judge(plan, pruefung, gegenprobe),
      zeit: new Date().toISOString() };
    const key = fragenKey(new URL(tab.url).origin);
    const list = (await chrome.storage.local.get(key))[key] || [];
    list.push(entry); await chrome.storage.local.set({ [key]: list });
    return { ...entry, index: list.length - 1 };
  });
}

async function weiter(tabId, { origin, index }) {
  const key = fragenKey(origin);
  const list = (await chrome.storage.local.get(key))[key] || [];
  const entry = list[index]; if (!entry) throw new Error('Frage nicht gefunden');
  const cfg = await settings();
  return withPage(tabId, async ({ target, items }) => {
    const { elements } = compactElements(items, { ausblenden: cfg.ausblenden });
    entry.pruefung = verifyOpen(entry.plan, entry.pruefung, elements);
    entry.urteil = judge(entry.plan, entry.pruefung, entry.gegenprobe);
    await markSteps(target, entry.pruefung);
    list[index] = entry; await chrome.storage.local.set({ [key]: list });
    return { ...entry, index };
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const handle = p => { p.then(r => reply({ ok: true, result: r })).catch(e => reply({ ok: false, error: String(e.message || e) })); return true; };
  if (msg?.type === 'frage') return handle(frage(msg.tabId, msg.opts));
  if (msg?.type === 'weiter') return handle(weiter(msg.tabId, msg.opts));
  if (msg?.type === 'overlay-aus') return handle(withPage(msg.tabId, ({ target }) => evalInPage(target, clearOverlayInPage)));
  if (msg?.type === 'fragen-leeren') return handle(chrome.storage.local.remove(fragenKey(msg.origin)));

  if (msg?.type === 'check') {
    check(msg.tabId, msg.opts).then(r => reply({ ok: true, result: r })).catch(e => reply({ ok: false, error: String(e.message || e) }));
    return true;
  }
  if (msg?.type === 'clear') {
    chrome.storage.local.remove(storageKey(msg.origin)).then(() => reply({ ok: true }));
    return true;
  }
});

// für automatische Tests
self.appilotCheck = check;
self.appilotFrage = frage;
self.appilotWeiter = weiter;
