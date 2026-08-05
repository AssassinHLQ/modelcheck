import { mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync, statSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modelsDir = resolve(root, 'models');
const destDir = resolve(root, 'public', 'models');

mkdirSync(modelsDir, { recursive: true });
rmSync(destDir, { recursive: true, force: true });
mkdirSync(destDir, { recursive: true });
const readme = join(modelsDir, 'README.txt');
if (!existsSync(readme)) {
  writeFileSync(
    readme,
    '把模型文件放入本文件夹，然后重新运行 npm run build（开发模式则重启 npm run dev）。\n' +
      '支持：.3dm .skp .fbx .glb .gltf .obj .stp .step .iges .igs .brep .stl .dxf .ply .3mf\n' +
      '（.mtl / .png / .jpg 等附件文件与主模型一起放入，会自动匹配）\n' +
      '小于 3MB 的模型会内嵌进网页，双击 dist/index.html 也能直接加载；更大的模型需要部署到服务器。\n'
  );
}

mkdirSync(destDir, { recursive: true });

const ALLOWED = new Set([
  '.3dm', '.skp', '.fbx', '.glb', '.gltf', '.obj', '.stp', '.step',
  '.iges', '.igs', '.brep', '.stl', '.dxf', '.ply', '.3mf',
  '.mtl', '.png', '.jpg', '.jpeg', '.bmp',
]);

const EMBED_LIMIT = 3 * 1024 * 1024;
const entries = [];

for (const f of readdirSync(modelsDir)) {
  if (f.startsWith('.')) continue;
  const ext = f.slice(f.lastIndexOf('.')).toLowerCase();
  if (!ALLOWED.has(ext)) continue;
  const full = join(modelsDir, f);
  if (statSync(full).isDirectory()) continue;
  copyFileSync(full, join(destDir, f));
  const size = statSync(full).size;
  const entry = { name: f, size };
  if (size <= EMBED_LIMIT) entry.data = readFileSync(full).toString('base64');
  entries.push(entry);
}

writeFileSync(join(destDir, 'manifest.js'), 'window.BUILTIN_MODELS = ' + JSON.stringify(entries) + ';\n');
console.log(`内置模型：${entries.length} 个文件 -> public/models/`);
