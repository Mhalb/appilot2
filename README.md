# Appilot 2

Appilot als eigene App. Der Kern stammt aus dem Repository MVDemo (das als Demo-Stand unverändert bleibt) und wird
hier für alle Einsatzorte weiterentwickelt: bk Workbench, Nextcloud und Kundenvorhaben wie DiSI MV.

Leitidee: **Appilot liest Anwendungen wie ein Screenreader**, über den Barrierefreiheitsbaum (Rolle, Name, Zustand)
statt über eigene Markierungen oder generierte IDs. Dadurch reicht je Anwendung ein schlankes Profil.

## Aufbau (Ziel)

| Teil | Inhalt | Stand |
| --- | --- | --- |
| Kern | Widget im Browser, Seitenverständnis über den Barrierefreiheitsbaum, Führen, Vormachen | folgt aus MVDemo |
| Profile | Masken, Feldhilfen, Besonderheiten je Anwendung (Workbench, Nextcloud, Fiori) | offen |
| Server | Abläufe, Wissen, Feedback, Werkzeugregister, Anbindung an das Model-Gateway | offen |
| Studio | Aufnehmen, Bearbeiten, Lernstrecken, Freigabe | folgt aus MVDemo |
| Toolbox | Eignungscheck mit Report, Live-Check im Browser, Probelauf-Runner, Datenabfluss-Prüfer | **Eignungscheck, Live-Check und Fragetest als Prototyp** |

Konzept: [docs/konzept.md](docs/konzept.md).

## Schnellstart

```bash
npm install
npx playwright install chromium
npm test                                                        # Skript und Erweiterung gegen zwei Testmasken
npm run eignungscheck -- toolbox/eignungscheck/beispiele/workbench.json
```

Die Beispielkonfigurationen erwarten die Workbench unter `localhost:8800`, die MVDemo unter `localhost:8801` und die
UI5-Testseite unter `localhost:8802` (`npm run testseite:ui5`, danach `python3 -m http.server 8802 -d testseiten/ui5`).

## Verzeichnisse

```
toolbox/gemeinsam/       Messlogik, Fragetest und Report, gemeinsam für Skript und Erweiterung
toolbox/eignungscheck/   Eignungscheck als Skript (Doku, Beispielkonfigurationen)
toolbox/live-check/      Appilot-Check als Chrome-Erweiterung (Installation siehe README dort)
testseiten/ui5/          eigene Erfassungsmaske mit OpenUI5 im Fiori-Stil, als realistisches Prüfziel
tests/                   Tests mit einer gut und einer schlecht beschrifteten Maske
docs/                    Konzept, Beispielreport
```
