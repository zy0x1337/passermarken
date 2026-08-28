/* Inliniert den kompilierten Build (dist/game.js) in index.html.
   Grund: das Spiel muss auch von file:// und aus dem Standalone-PWA-Container
   ohne Server-Rewrites laufen. Ein externer Bundle-Import wäre dafür ein
   unnötiger Fehlerpfad. Marker: @@BUILD:START / @@BUILD:END */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const js = readFileSync(join(root, 'dist', 'game.js'), 'utf8');

const START = '/* @@BUILD:START';
const END = '/* @@BUILD:END */';
const i = html.indexOf(START);
const j = html.indexOf(END);
if (i < 0 || j < 0) throw new Error('Build-Marker in index.html nicht gefunden.');

const head = html.slice(0, i);
const tail = html.slice(j);
const out = `${head}${START} — generiert aus src/game.ts · ${new Date().toISOString().slice(0, 10)} */\n${js.trim()}\n${tail}`;

writeFileSync(join(root, 'index.html'), out, 'utf8');
console.log(`✔ dist/game.js (${(js.length / 1024).toFixed(1)} KB) nach index.html inliniert.`);
