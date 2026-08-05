import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

export function loadStl(buffer) {
  const buf = buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  let geometry;
  try {
    geometry = new STLLoader().parse(buf);
  } catch (e) {
    throw new Error('无法解析该 .stl 文件' + (e.message ? '：' + e.message : ''));
  }

  const pos = geometry.attributes.position;
  const count = pos.count;
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    pos.setXYZ(i, x, z, -y);
  }
  pos.needsUpdate = true;

  const nrm = geometry.attributes.normal;
  if (nrm) {
    for (let i = 0; i < count; i++) {
      const x = nrm.getX(i);
      const y = nrm.getY(i);
      const z = nrm.getZ(i);
      nrm.setXYZ(i, x, z, -y);
    }
    nrm.needsUpdate = true;
  }

  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xcfd6e0,
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  group.add(new THREE.Mesh(geometry, mat));

  const triCount = geometry.index ? geometry.index.count / 3 : Math.floor(count / 3);
  return { group, stats: { meshCount: 1, triCount } };
}
