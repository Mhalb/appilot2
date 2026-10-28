# Appilot-Check (Live-Check als Chrome-Erweiterung)

Prüft die gerade geöffnete Seite mit derselben Messlogik wie der Eignungscheck (`toolbox/gemeinsam/messung.js`):
Benennung, Eindeutigkeit mit Zeilenkontext, technische Namen, Stabilität, generierte IDs, Feldhilfen,
Meldungsbereiche und blinde Bereiche. Man geht selbst durch die Anwendung, zum Beispiel die eigene Nextcloud, und
prüft Maske für Maske. Anmeldung, Zwei-Faktor und Intranet sind kein Problem, weil der eigene Browser misst.

## Installieren (Entwicklermodus)

1. Ordner `toolbox/live-check` herunterladen bzw. das ZIP entpacken.
2. In Chrome oder Edge `chrome://extensions` öffnen, oben rechts **Entwicklermodus** einschalten.
3. **Entpackte Erweiterung laden** und den Ordner `live-check` wählen.
4. Das Symbol „Appilot-Check“ an die Symbolleiste anheften.

## Benutzen

1. Anwendung öffnen und zur gewünschten Maske gehen.
2. Symbol anklicken, Namen der Maske prüfen, **Diese Maske prüfen**.
3. Chrome zeigt während der Messung oben einen Hinweis („wird von Appilot-Check debuggt“). Das ist normal: Die
   Erweiterung liest den Barrierefreiheitsbaum über dieselbe Schnittstelle wie die Entwicklertools.
4. Weitere Masken genauso prüfen. **Report öffnen** zeigt alle Masken dieser Adresse mit Ampel und Befunden und bietet
   den Report als HTML und die Rohdaten als JSON zum Herunterladen an.

## Was die Erweiterung tut und was nicht

- Sie **liest nur**: Barrierefreiheitsbaum, Element-Kennungen, Bildausschnitte der Befunde und per `HEAD`-Anfrage die
  Content-Security-Policy der Seite. Sie klickt nichts und ändert nichts.
- **Bildausschnitte werden standardmäßig verpixelt**, damit im Report keine echten Daten lesbar sind. Abschalten nur in
  Testumgebungen mit Beispieldaten.
- Die Ergebnisse bleiben **lokal im Browser** (`chrome.storage.local`), je Adresse. Nichts wird übertragen.
- **Stabilität** misst der Live-Check ohne Neuladen (zweite Messung nach 1,5 s), damit die Seite so bleibt, wie man
  sie gerade bearbeitet. Das Skript lädt dagegen neu; die Werte sind deshalb nicht ganz vergleichbar.
- Nur eigene oder freigegebene Anwendungen prüfen. Auf verwalteten Rechnern können Erweiterungen gesperrt sein; dann
  den Eignungscheck als Skript verwenden.

## Entwicklung

`lib/messung.js` ist eine Kopie von `toolbox/gemeinsam/messung.js`. Nach Änderungen dort `npm run sync:live-check`;
ein Test prüft, dass beide gleich sind. `npm test` lädt die Erweiterung in Chromium und prüft zwei Testmasken.

## Fragetest

Der Reiter **Fragetest** prüft, ob Appilot eine echte Frage zur Seite beantworten und führen kann, z. B. „Wie lege
ich einen neuen Ordner an?“ in Nextcloud.

1. Einmal unter **Einstellungen** (Link oben rechts im Popup) Adresse, Modell und API-Schlüssel eintragen. Standard ist
   Anthropic (`https://api.anthropic.com/v1/`, Modell `claude-sonnet-5-5`). Jede OpenAI-kompatible Schnittstelle geht,
   etwa ein lokales Modell über Ollama (`http://localhost:11434/v1/`) oder vLLM; Chrome fragt dann einmal nach der
   Freigabe für diese Adresse.
2. Frage aus dem Katalog wählen oder eigene eingeben, **Frage testen**.
3. Das Modell schlägt Schritte vor. Jeder Schritt wird gegen die echte Seite geprüft: **gefunden**, **mehrdeutig**,
   **erfunden** (Element gibt es nicht) oder **offen** (erscheint erst nach einem vorherigen Schritt). Gefundene
   Elemente werden auf der Seite nummeriert markiert.
4. Die Erweiterung klickt nichts. Den Schritt selbst ausführen und **Nächsten Schritt prüfen** wählen.
5. **Gegenproben** sind Fragen, die auf der Seite nicht gehen („Wie buche ich hier meinen Urlaub?“). Bestanden ist eine
   Gegenprobe, wenn das Modell das erkennt, statt sich Schritte auszudenken.

Die Ergebnisse stehen im Report im Abschnitt „Fragetest“.

**Was an das Sprachmodell geht:** die Frage und eine Liste der Bedienelemente mit Kennung, Rolle und Namen. Mit
„Inhalte ausblenden“ (Standard) werden Namen von Einträgen in Listen und Tabellen sowie dateinamenähnliche Links durch
„[Eintrag]“ ersetzt und der Seitentitel weggelassen. Keine Bildschirmfotos, keine Feldinhalte. Trotzdem nur mit
Testkonto oder Beispieldaten verwenden. Der API-Schlüssel liegt nur lokal in diesem Browser.
