import * as THREE from 'three';
import occtWasmB64 from './occtWasmB64.js';
import { decompressWasm as decompressOcctWasm } from './occtWasmB64.js';

let occtPromise = null;
let wasmObjectUrl = null;

const BASE_URL = (import.meta.env && import.meta.env.BASE_URL) || '/';
const isFileProtocol = typeof location !== 'undefined' && location.protocol === 'file:';

function engineScriptUrl() {
  if (isFileProtocol) return new URL('occt/occt-import-js.js', window.location.href).href;
  return `${BASE_URL}occt/occt-import-js.js`;
}

function wasmUrl() {
  if (isFileProtocol) {
    if (!occtWasmB64) {
      throw new Error('本构建未内嵌 CAD 引擎（服务器模式）。请用完整构建（npm run build）支持本地双击，或部署到服务器使用');
    }
    if (!wasmObjectUrl) {
      const raw = decompressOcctWasm();
      wasmObjectUrl = URL.createObjectURL(new Blob([raw], { type: 'application/wasm' }));
    }
    return wasmObjectUrl;
  }
  return `${BASE_URL}occt/occt-import-js.wasm`;
}

function getOcct() {
  if (occtPromise) return occtPromise;
  occtPromise = (async () => {
    if (!window.occtimportjs) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = engineScriptUrl();
        script.onload = resolve;
        script.onerror = () => reject(new Error('OCCT 引擎加载失败，请刷新重试'));
        document.head.appendChild(script);
      });
    }
    return window.occtimportjs({ locateFile: () => wasmUrl() });
  })();
  return occtPromise;
}

const yUp = (p) => [p[0], p[2], -p[1]];

export async function loadStep(buffer, format) {
  const occt = await getOcct();
  const reader =
    format === 'iges' || format === 'igs'
      ? occt.ReadIgesFile
      : format === 'brep'
        ? occt.ReadBrepFile
        : occt.ReadStepFile;

  let result;
  try {
    result = reader(new Uint8Array(buffer), null);
  } catch (e) {
    throw new Error('无法解析该文件（文件可能损坏或包含不支持的实体）');
  }
  if (!result || !result.success) {
    const msg = result && result.messages && result.messages.length ? result.messages[0].message : '';
    throw new Error('解析失败' + (msg ? '：' + msg : ''));
  }
  const meshes = result.meshes || [];
  if (!meshes.length) throw new Error('文件中没有可显示的几何体');

  const group = new THREE.Group();
  let meshCount = 0;
  let triCount = 0;
  for (const m of meshes) {
    const pos = m.attributes && m.attributes.position && m.attributes.position.array;
    if (!pos || !pos.length) continue;
    const n = pos.length / 3;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const p = yUp([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
      positions[i * 3] = p[0];
      positions[i * 3 + 1] = p[1];
      positions[i * 3 + 2] = p[2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const nrm = m.attributes.normal && m.attributes.normal.array;
    if (nrm && nrm.length >= n * 3) {
      const normals = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const p = yUp([nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]]);
        normals[i * 3] = p[0];
        normals[i * 3 + 1] = p[1];
        normals[i * 3 + 2] = p[2];
      }
      geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    } else {
      geo.computeVertexNormals();
    }

    const idx = m.index && m.index.array;
    if (idx && idx.length) {
      geo.setIndex(Array.isArray(idx) ? idx : Array.from(idx));
    }
    triCount += geo.index ? geo.index.count / 3 : Math.floor(n / 3);

    const mat = new THREE.MeshStandardMaterial({
      color: 0xcfd6e0,
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });

    const vcol = m.attributes.color && m.attributes.color.array;
    if (vcol && vcol.length >= n * 4) {
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        colors[i * 3] = vcol[i * 4];
        colors[i * 3 + 1] = vcol[i * 4 + 1];
        colors[i * 3 + 2] = vcol[i * 4 + 2];
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const colored = mat.clone();
      colored.vertexColors = true;
      group.add(new THREE.Mesh(geo, colored));
    } else if (m.color && m.color.length >= 3) {
      mat.color.setRGB(m.color[0], m.color[1], m.color[2], THREE.SRGBColorSpace);
      group.add(new THREE.Mesh(geo, mat));
    } else {
      group.add(new THREE.Mesh(geo, mat));
    }
    meshCount++;
  }

  if (!meshCount) throw new Error('文件中没有可显示的几何体');
  return { group, stats: { meshCount, triCount } };
}
