import { mkdirSync, copyFileSync, readdirSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const musicDir = resolve(root, 'music');
const destDir = resolve(root, 'public', 'music');

mkdirSync(musicDir, { recursive: true });
rmSync(destDir, { recursive: true, force: true });
mkdirSync(destDir, { recursive: true });

const entries = [];
for (const f of readdirSync(musicDir)) {
  if (f.startsWith('.')) continue;
  const full = join(musicDir, f);
  if (statSync(full).isDirectory()) continue;
  copyFileSync(full, join(destDir, f));
  entries.push({ name: f, size: statSync(full).size });
}

writeFileSync(join(destDir, 'manifest.js'), 'window.BUILTIN_MUSIC = ' + JSON.stringify(entries) + ';\n');
console.log(`背景音乐：${entries.length} 个文件 -> public/music/`);
