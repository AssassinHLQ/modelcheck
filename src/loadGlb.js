import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const basename = (p) => {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(i + 1) : p;
};

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('读取文件失败'));
    fr.readAsDataURL(file);
  });
}

function countStats(group) {
  let meshCount = 0;
  let triCount = 0;
  group.traverse((o) => {
    if (o.isMesh) {
      meshCount++;
      if (o.geometry && o.geometry.index) triCount += o.geometry.index.count / 3;
    }
  });
  return { meshCount, triCount };
}

async function fromGltf(data) {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  loader.setDRACOLoader(draco);
  let gltf;
  try {
    gltf = await loader.parseAsync(data, '');
  } catch (e) {
    throw new Error('无法解析该文件' + (e.message ? '：' + e.message : ''));
  }
  const stats = countStats(gltf.scene);
  if (!stats.meshCount) throw new Error('文件中没有可显示的几何体');
  return { group: gltf.scene, stats };
}

export function loadGlb(buffer) {
  return fromGltf(buffer);
}

export async function loadGltf(text, fileMap) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('无法解析该 .gltf 文件（JSON 无效）');
  }
  for (const buf of json.buffers || []) {
    if (buf.uri && !buf.uri.startsWith('data:')) {
      const file = fileMap && fileMap.get(basename(buf.uri).toLowerCase());
      if (!file) throw new Error('缺少资源文件：' + basename(buf.uri));
      buf.uri = await fileToDataUrl(file);
    }
  }
  for (const img of json.images || []) {
    if (img.uri && !img.uri.startsWith('data:')) {
      const file = fileMap && fileMap.get(basename(img.uri).toLowerCase());
      if (!file) throw new Error('缺少贴图文件：' + basename(img.uri));
      img.uri = await fileToDataUrl(file);
    }
  }
  return fromGltf(JSON.stringify(json));
}
