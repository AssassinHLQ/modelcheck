import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';

export function load3mf(buffer) {
  let group;
  try {
    group = new ThreeMFLoader().parse(buffer);
  } catch (e) {
    throw new Error('无法解析该 .3mf 文件' + (e.message ? '：' + e.message : ''));
  }
  if (!group) throw new Error('无法解析该 .3mf 文件');

  let meshCount = 0;
  let triCount = 0;
  group.traverse((o) => {
    if (o.isMesh) {
      meshCount++;
      if (o.geometry && o.geometry.index) triCount += o.geometry.index.count / 3;
    }
  });
  if (!meshCount) throw new Error('该 .3mf 文件中没有可显示的几何体');
  return { group, stats: { meshCount, triCount } };
}
