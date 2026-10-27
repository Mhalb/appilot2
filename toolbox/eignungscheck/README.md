# Appilot-Toolbox · Eignungscheck (Prototyp)

Prüft vor der Anbindung, ob Appilot eine Anwendung zuverlässig verstehen kann. Das Skript liest je Maske den
Barrierefreiheitsbaum aus, so wie ein Screenreader die Seite sieht, und schreibt einen Report mit Ampel.

## Aufruf

```bash
npm run eignungscheck -- toolbox/eignungscheck/beispiele/workbench.json   # Report unter …/beispiele/report-bk-workbench/
```

Voraussetzung: Node 20 und Playwright mit Chromium.

## Konfiguration

```json
{ "name": "bk Workbench", "baseUrl": "http://localhost:8800/",
  "localStorage": {"bkz-user": "mike"},
  "settleMs": 600,
  "masks": [
    {"name": "Tickets", "url": "/tickets/"},
    {"name": "Schritt 2", "url": "index.html#/schritt/2", "steps": [{"click": "text=Weiter"}]},
    {"name": "Mobil", "url": "/mobil/", "kern": false}
  ] }
```

- `masks`: eine Zeile je Maske. `steps` sind optionale Klicks oder Eingaben (Playwright-Selektoren), um eine Maske zu erreichen.
- `kern: false`: zählt nicht zur Gesamtampel.
- Appilot selbst (`/appilot/appilot.js`) wird während der Messung blockiert, damit nur die Anwendung gemessen wird (`"blockAppilot": false` schaltet das ab).

## Messgrößen

| Messgröße | Bedeutung |
| --- | --- |
| Benennung | Anteil der Bedienelemente mit Rolle und Namen |
| Eindeutig (mit Zeile) | Anteil, den Appilot über Rolle, Name und umgebende Tabellenzeile unterscheiden kann |
| Technische Namen | Namen wie „edit“: auffindbar, aber nicht verständlich erklärbar |
| Stabil | Anteil, der nach erneutem Laden gleich bleibt |
| Generierte IDs | Anteil mit Framework-IDs (Information, nicht in der Ampel) |
| Feldhilfen | Eingabefelder mit Beschreibung im Barrierefreiheitsbaum |
| Blinde Bereiche | fremde iframes, Canvas, vermutete geschlossene Shadow-DOMs |

Ampel: Grün ab 90 % Benennung und Eindeutigkeit, höchstens 10 % technische Namen, ohne blinde Bereiche; Gelb ab
70 %; sonst Rot. Die Schwellen sind vorläufig und werden nach den ersten Anwendungen kalibriert.

Der Report ersetzt keine Prüfung nach BITV oder EN 301 549.

## Noch nicht enthalten

- Anmeldung mit echtem Login (heute: offene Testinstanz oder `localStorage`)
- automatisches Abklicken aller Masken (heute: Liste in der Konfiguration)
- Vergleich zweier Versionen einer Anwendung (Stabilität über ein Update)
- Probelauf-Runner und Datenabfluss-Prüfer
