# Konzept: Appilot als eigene App

Das ausführliche Konzept liegt als Claude-Dokument: https://claude.ai/artifact/6nrueFYUWFBH4xmsF8RDAV

Kurzfassung:

- Appilot wird aus der MVDemo herausgelöst und eine eigene App mit fünf Teilen: Kern, Profile, Server, Studio, Toolbox.
- Der Kern liest Anwendungen über den Barrierefreiheitsbaum (wie UI Automation unter Windows oder ein Screenreader im Browser).
- Die Toolbox prüft jede Anwendung vor und nach der Anbindung: Eignungscheck mit Report, Probelauf nach Updates, Prüfung auf Datenabfluss.
- Kern, Profile, Server und Studio werden an Kunden geliefert (Nutzungsrecht, ggf. Open Source); die Toolbox bleibt ein internes Werkzeug der bk.
- Zunächst nur Anwendungen im Browser. Desktop-Anwendungen (UI Automation mit lokalem Agenten) später.
- Appilot führt in Fachverfahren keine Arbeitsschritte aus; echte Änderungen nur über Werkzeuge mit Bestätigung, wo freigegeben.

## Erste Ergebnisse des Eignungschecks (27.10.2026)

| Anwendung | Masken | Benennung | Eindeutig (mit Zeile) | Technische Namen | Generierte IDs | Ampel |
| --- | --- | --- | --- | --- | --- | --- |
| bk Workbench | 5 | 100 % | 100 % | 0 % | 0 % | Grün |
| MVDemo (HKR-Nachbau) | 12 | 100 % | 100 % | 0 % | 0 % | Grün |
| UI5-Testseite (OpenUI5, Horizon) | 1 | 100 % | 88,2 % | 17,6 % | 100 % | Gelb |

Beispielreport: [beispielreports/ui5-testseite.html](beispielreports/ui5-testseite.html). Die UI5-Testseite ist eine
eigene Maske, nicht HKR 2.0; belastbar für HKR wird die Aussage erst mit einer Fiori-Testinstanz.
