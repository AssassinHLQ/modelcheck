import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.INLINE_WASM = '0';

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
};

run(process.execPath, [resolve(root, 'scripts', 'copy-rhino.mjs')]);
run(process.execPath, [resolve(root, 'scripts', 'copy-occt.mjs')]);
run(process.execPath, [resolve(root, 'scripts', 'copy-models.mjs')]);
run(process.execPath, [resolve(root, 'scripts', 'copy-music.mjs')]);
run(process.execPath, [resolve(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build']);
console.log('服务器模式构建完成（index.html 不内嵌引擎）');
