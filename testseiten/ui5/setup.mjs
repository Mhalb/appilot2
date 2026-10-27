// Baut die UI5-Testseite lokal auf: OpenUI5 aus npm, Ressourcen zusammenführen, Horizon-Theme übersetzen.
// Aufruf: node testseiten/ui5/setup.mjs   danach: npx http-server testseiten/ui5 -p 8802 (oder python3 -m http.server)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const work = path.join(here, '.ui5');
const libs = ['sap.ui.core', 'sap.m', 'sap.ui.layout', 'sap.ui.unified', 'themelib_sap_horizon'];
fs.mkdirSync(work, { recursive: true });
if (!fs.existsSync(path.join(work, 'package.json'))) fs.writeFileSync(path.join(work, 'package.json'), '{"private":true}');
execSync(`npm i --silent ${libs.map(l => '@openui5/' + l).join(' ')} less-openui5`, { cwd: work, stdio: 'inherit' });

const res = path.join(here, 'resources');
fs.rmSync(res, { recursive: true, force: true });
for (const l of libs) fs.cpSync(path.join(work, 'node_modules', '@openui5', l, 'src'), res, { recursive: true });

const require = createRequire(path.join(work, 'package.json'));
const { Builder } = require('less-openui5');
const b = new Builder();
for (const lib of ['sap/ui/core', 'sap/m', 'sap/ui/layout', 'sap/ui/unified']) {
  const inp = `${lib}/themes/sap_horizon/library.source.less`;
  const r = await b.build({ lessInputPath: inp, rootPaths: [res] });
  const dir = path.join(res, lib, 'themes', 'sap_horizon');
  fs.writeFileSync(path.join(dir, 'library.css'), r.css);
  fs.writeFileSync(path.join(dir, 'library-parameters.json'), JSON.stringify(r.variables));
  console.log('Theme übersetzt:', lib);
}
console.log('Fertig. Testseite: testseiten/ui5/index.html über einen lokalen Webserver öffnen.');
