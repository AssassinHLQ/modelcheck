import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcOcct = resolve(root, 'node_modules', 'occt-import-js', 'dist');
const dest = resolve(root, 'public', 'occt');
mkdirSync(dest, { recursive: true });
copyFileSync(resolve(srcOcct, 'occt-import-js.js'), resolve(dest, 'occt-import-js.js'));
copyFileSync(resolve(srcOcct, 'occt-import-js.wasm'), resolve(dest, 'occt-import-js.wasm'));

const inline = process.env.INLINE_WASM !== '0';
if (inline) {
  const gz = gzipSync(readFileSync(resolve(srcOcct, 'occt-import-js.wasm')), { level: 9 });
  const b64 = gz.toString('base64');
  writeFileSync(
    resolve(root, 'src', 'occtWasmB64.js'),
    `import { gunzipSync } from 'fflate';\nconst data = Uint8Array.from(atob(${JSON.stringify(b64)}), (c) => c.charCodeAt(0));\nexport default data;\nexport function decompressWasm() { return gunzipSync(data); }\n`
  );
  console.log('occt-import-js files copied to public/occt/（内联 gzip）');
} else {
  writeFileSync(resolve(root, 'src', 'occtWasmB64.js'), 'export default null;\nexport function decompressWasm() { return null; }\n');
  console.log('occt-import-js files copied to public/occt/（服务器模式：不内联）');
}
