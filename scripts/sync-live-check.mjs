// Kopiert die gemeinsame Messlogik in die Browser-Erweiterung (Erweiterungen dürfen nur eigene Dateien laden).
import fs from 'node:fs';
fs.copyFileSync('toolbox/gemeinsam/messung.js', 'toolbox/live-check/lib/messung.js');
console.log('toolbox/live-check/lib/messung.js aktualisiert');
