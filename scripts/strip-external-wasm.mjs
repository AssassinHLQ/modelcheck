import { rmSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const targets = [join(dist, 'rhino3dm', 'rhino3dm.wasm'), join(dist, 'occt', 'occt-import-js.wasm')];
for (const t of targets) {
  if (existsSync(t)) {
    rmSync(t);
    console.log('已移除（本地双击版用内嵌引擎，不再需要）:', t);
  }
}
console.log('本地双击版 dist 已瘦身完成');
