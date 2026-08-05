import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';

const basename = (p) => {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(i + 1) : p;
};

export async function loadObj(text, fileMap) {
  let creator = null;
  const mtlMatch = text.match(/^mtllib\s+(.+)$/gim);
  if (mtlMatch) {
    for (const line of mtlMatch) {
      const name = basename(line.replace(/^mtllib\s+/i, '').trim());
      const file = fileMap && fileMap.get(name.toLowerCase());
      if (file) {
        const mtlText = await file.text();
        creator = new MTLLoader().setMaterialOptions({ side: THREE.DoubleSide }).parse(mtlText, '');
        const origLoadTexture = creator.loadTexture.bind(creator);
        creator.loadTexture = (url, mapping, onLoad, onProgress, onError) => {
          const texFile = fileMap.get(basename(url).toLowerCase());
          if (!texFile) return origLoadTexture(url, mapping, onLoad, onProgress, onError);
          const img = new Image();
          const tex = new THREE.Texture(img, mapping);
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          img.onload = () => {
            tex.needsUpdate = true;
            if (onLoad) onLoad(tex);
          };
          img.onerror = () => {
            if (onError) onError(new Error('贴图加载失败：' + basename(url)));
          };
          img.src = URL.createObjectURL(texFile);
          return tex;
        };
        break;
      }
    }
  }

  const loader = new OBJLoader();
  if (creator) loader.setMaterials(creator);
  let group;
  try {
    group = loader.parse(text);
  } catch (e) {
    throw new Error('无法解析该 .obj 文件' + (e.message ? '：' + e.message : ''));
  }

  if (!creator) {
    group.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m) {
          m.side = THREE.DoubleSide;
          m.needsUpdate = true;
        }
      }
    });
  }

  let meshCount = 0;
  let triCount = 0;
  group.traverse((o) => {
    if (o.isMesh) {
      meshCount++;
      const g = o.geometry;
      if (g) {
        if (g.index) triCount += g.index.count / 3;
        else if (g.attributes.position) triCount += g.attributes.position.count / 3;
      }
    }
  });
  if (!meshCount) throw new Error('该 .obj 文件中没有可显示的几何体');
  return { group, stats: { meshCount, triCount } };
}
