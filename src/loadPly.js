import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

export function loadPly(buffer) {
  const buf = buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  let geometry;
  try {
    geometry = new PLYLoader().parse(buf);
  } catch (e) {
    throw new Error('无法解析该 .ply 文件' + (e.message ? '：' + e.message : ''));
  }
  const pos = geometry.attributes.position;
  if (!pos || !pos.count) throw new Error('该 .ply 文件中没有可显示的几何体');

  const group = new THREE.Group();
  const hasColors = !!geometry.getAttribute('color');

  if (geometry.index) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xcfd6e0,
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.DoubleSide,
      vertexColors: hasColors,
    });
    group.add(new THREE.Mesh(geometry, mat));
    return { group, stats: { meshCount: 1, triCount: geometry.index.count / 3 } };
  }

  const mat = new THREE.PointsMaterial({
    color: hasColors ? 0xffffff : 0x8893a3,
    size: 3,
    sizeAttenuation: false,
    vertexColors: hasColors,
  });
  group.add(new THREE.Points(geometry, mat));
  return { group, stats: { meshCount: 0, pointCount: pos.count } };
}
