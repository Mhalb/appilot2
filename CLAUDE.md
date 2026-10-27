# Appilot 2 – Hinweise für Claude Code

Appilot als eigene App (Kern, Profile, Server, Studio, Toolbox). Konzept: `docs/konzept.md`.

## Regeln

- Änderungen per Pull Request auf `main`, eigener Branch. Commit-Nachrichten, PR-Texte, Doku und Oberfläche auf Deutsch; Code-Bezeichner Englisch.
- `npm test` muss grün sein. Neue Messgrößen oder Befunde im Eignungscheck brauchen einen Test mit einer Testmaske in `tests/fixtures/`.
- Die MVDemo (eigenes Repository) wird nicht verändert; Teile daraus werden hierher übernommen.
- **Keine Kundendaten, keine DVZ- oder Konzeptinhalte von Kundenvorhaben** im Repository, in Testseiten oder Beispielreports. Testseiten sind selbst gebaut und als Testseite gekennzeichnet.
- Der Eignungscheck misst die Eignung für Appilot, keine BITV-Konformität. So steht es auch im Report.
- Appilot führt in Fachverfahren keine Arbeitsschritte aus; Änderungen nur über Werkzeuge mit Bestätigung und nur mit den Rechten der angemeldeten Person.

## Umgebung von Claude Code in der Cloud

- Playwright und Chromium sind vorinstalliert; nicht neu installieren. `NODE_PATH=$(npm root -g)` setzen, wenn `playwright` nicht gefunden wird.
- `npm`/`pip` mit `NO_PROXY= no_proxy=` aufrufen.
- `gh pr create` scheitert; PR über `gh api repos/Mhalb/appilot2/pulls -f title=… -f head=… -f base=main -F body=@datei`.

## Nächste Schritte

1. Kern und Studio aus der MVDemo übernehmen (`appilot/appilot.js`, `lib/`, `editor.html`, `lern-editor.html`).
2. Leser für den Barrierefreiheitsbaum im Kern; eigene Markierungen der MVDemo nur noch als Ergänzung.
3. Probelauf-Runner (aufgenommene Abläufe ohne Bildschirm durchspielen, Protokoll).
4. Profile: Workbench, Nextcloud, HKR-Fiori.
5. Datenabfluss-Prüfer.

Offen im Eignungscheck: Anmeldung, automatisches Abklicken der Masken, Versionsvergleich über ein Update.
