const $ = id => document.getElementById(id);
const DEFAULTS = { baseUrl: 'https://api.anthropic.com/v1/', model: 'claude-sonnet-5-5', apiKey: '', ausblenden: true };
const cur = { ...DEFAULTS, ...((await chrome.storage.local.get('einstellungen')).einstellungen || {}) };
$('baseUrl').value = cur.baseUrl; $('model').value = cur.model; $('apiKey').value = cur.apiKey; $('ausblenden').checked = cur.ausblenden;
$('speichern').addEventListener('click', async () => {
  const baseUrl = $('baseUrl').value.trim() || DEFAULTS.baseUrl;
  let origin; try { origin = new URL(baseUrl).origin; } catch { $('status').textContent = 'Adresse ist ungültig.'; return; }
  // andere Adressen als Anthropic brauchen eine Freigabe, damit die Erweiterung sie ohne CORS-Probleme erreicht
  if (origin !== 'https://api.anthropic.com') {
    const ok = await chrome.permissions.request({ origins: [origin + '/*'] }).catch(() => false);
    if (!ok) { $('status').textContent = 'Ohne Freigabe für ' + origin + ' kann die Erweiterung das Modell nicht erreichen.'; return; }
  }
  await chrome.storage.local.set({ einstellungen: { baseUrl, model: $('model').value.trim() || DEFAULTS.model,
    apiKey: $('apiKey').value.trim(), ausblenden: $('ausblenden').checked } });
  $('status').textContent = 'Gespeichert.';
});
