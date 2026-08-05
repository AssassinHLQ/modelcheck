import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
mkdirSync(dist, { recursive: true });
for (const sub of ['models', 'music', 'rhino3dm', 'occt']) {
  rmSync(join(dist, sub), { recursive: true, force: true });
}
cpSync(resolve(root, 'public'), dist, { recursive: true });
console.log('public/ -> dist/ 已同步（已清理过期文件）');
