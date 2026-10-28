// Kopiert die gemeinsame Mess- und Fragetest-Logik in die Browser-Erweiterung (Erweiterungen dürfen nur eigene Dateien laden).
import fs from 'node:fs';
for (const f of ['messung.js', 'fragetest.js']) {
  fs.copyFileSync(`toolbox/gemeinsam/${f}`, `toolbox/live-check/lib/${f}`);
  console.log(`toolbox/live-check/lib/${f} aktualisiert`);
}
