import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcRhino = resolve(root, 'node_modules', 'rhino3dm');
const dest = resolve(root, 'public', 'rhino3dm');
mkdirSync(dest, { recursive: true });
copyFileSync(resolve(srcRhino, 'rhino3dm.js'), resolve(dest, 'rhino3dm.js'));
copyFileSync(resolve(srcRhino, 'rhino3dm.wasm'), resolve(dest, 'rhino3dm.wasm'));

const inline = process.env.INLINE_WASM !== '0';
if (inline) {
  const gz = gzipSync(readFileSync(resolve(srcRhino, 'rhino3dm.wasm')), { level: 9 });
  const b64 = gz.toString('base64');
  writeFileSync(
    resolve(root, 'src', 'rhinoWasmB64.js'),
    `import { gunzipSync } from 'fflate';\nconst data = Uint8Array.from(atob(${JSON.stringify(b64)}), (c) => c.charCodeAt(0));\nexport default data;\nexport function decompressWasm() { return gunzipSync(data); }\n`
  );
  console.log('rhino3dm files copied to public/rhino3dm/（内联 gzip）');
} else {
  writeFileSync(resolve(root, 'src', 'rhinoWasmB64.js'), 'export default null;\nexport function decompressWasm() { return null; }\n');
  console.log('rhino3dm files copied to public/rhino3dm/（服务器模式：不内联）');
}
