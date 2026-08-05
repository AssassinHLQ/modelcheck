import { FBXLoader } from './vendor/FBXLoader.js';
import { LoadingManager } from 'three';

const basename = (p) => {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(i + 1) : p;
};

export function loadFbx(buffer, fileMap) {
  const manager = new LoadingManager();
  const blobCache = new Map();
  manager.setURLModifier((url) => {
    const file = fileMap && fileMap.get(basename(url).toLowerCase());
    if (!file) return url;
    let blob = blobCache.get(file.name);
    if (!blob) {
      blob = URL.createObjectURL(file);
      blobCache.set(file.name, blob);
    }
    return blob;
  });

  const loader = new FBXLoader(manager);
  let group;
  try {
    group = loader.parse(buffer, '');
  } catch (e) {
    throw new Error('无法解析该 .fbx 文件（可能是加密或过于老旧的 FBX 版本）');
  }

  let meshCount = 0;
  let triCount = 0;
  group.traverse((o) => {
    if (o.isMesh) {
      meshCount++;
      if (o.geometry && o.geometry.index) triCount += o.geometry.index.count / 3;
    }
  });

  if (!meshCount) {
    throw new Error('该 .fbx 文件中没有可显示的几何体');
  }

  const stats = { meshCount, triCount };
  return { group, stats };
}
