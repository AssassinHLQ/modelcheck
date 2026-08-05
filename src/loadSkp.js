import { buildScene, toGLB } from 'openskp';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export async function loadSkp(buffer, onProgress) {
  const scene = buildScene(buffer, {
    onProgress: (info) => {
      if (onProgress && info.total > 0) {
        onProgress(Math.min(100, Math.round((info.current / info.total) * 100)), `正在处理 ${info.stage} (${info.current}/${info.total})`);
      }
    },
  });

  if (!scene.glbPrimitives || !scene.glbPrimitives.length) {
    throw new Error('该 .skp 文件中没有可显示的几何体');
  }

  const glb = toGLB(scene);
  const bytes = new Uint8Array(glb.buffer, glb.byteOffset, glb.byteLength);
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(bytes.buffer.slice(0), '');

  const group = gltf.scene;
  let meshCount = 0;
  let triCount = 0;
  group.traverse((o) => {
    if (o.isMesh) {
      meshCount++;
      if (o.geometry && o.geometry.index) triCount += o.geometry.index.count / 3;
    }
  });

  const stats = { meshCount, triCount };
  return { group, stats };
}
