import * as THREE from 'three';

const ACI_BASIC = [
  [0, 0, 0],
  [255, 0, 0],
  [255, 255, 0],
  [0, 255, 0],
  [0, 255, 255],
  [0, 0, 255],
  [255, 0, 255],
  [255, 255, 255],
  [128, 128, 128],
  [192, 192, 192],
];

const ACI_WHEEL = [
  [255, 0, 0], [255, 63, 0], [255, 127, 0], [255, 191, 0], [255, 255, 0], [191, 255, 0], [127, 255, 0], [63, 255, 0], [0, 255, 0], [0, 255, 63],
  [0, 255, 127], [0, 255, 191], [0, 255, 255], [0, 191, 255], [0, 127, 255], [0, 63, 255], [0, 0, 255], [63, 0, 255], [127, 0, 255], [191, 0, 255],
  [255, 0, 255], [255, 0, 191], [255, 0, 127], [255, 0, 63], [255, 127, 127], [255, 63, 63], [191, 127, 127], [191, 63, 63], [127, 127, 127], [63, 63, 63],
  [255, 255, 191], [191, 255, 191], [191, 255, 255], [191, 191, 255], [255, 191, 191], [255, 191, 255], [255, 255, 127], [127, 255, 127], [127, 255, 255], [127, 127, 255],
];

function aciToRgb(aci) {
  if (aci < 0) aci = -aci;
  if (aci <= 9) return ACI_BASIC[aci];
  if (aci >= 250) {
    const v = 255 - (aci - 250) * 24;
    return [v, v, v];
  }
  return ACI_WHEEL[(aci - 10) % 40];
}

const NUM = (v) => parseFloat(v);
const getN = (pairs, code, idx = 0) => {
  let n = 0;
  for (const p of pairs) {
    if (p.code === code) {
      if (n++ === idx) return NUM(p.value);
    }
  }
  return null;
};
const getAll = (pairs, code) => pairs.filter((p) => p.code === code).map((p) => NUM(p.value));
const getS = (pairs, code) => {
  for (const p of pairs) if (p.code === code) return p.value.trim();
  return '';
};

const ENTITY_TYPES = new Set([
  'LINE', 'LWPOLYLINE', 'POLYLINE', 'VERTEX', 'SEQEND', 'CIRCLE', 'ARC', 'ELLIPSE', 'POINT',
  '3DFACE', 'MESH', 'INSERT', 'LAYER', 'SOLID', 'TEXT', 'MTEXT', 'SPLINE', 'HATCH', 'DIMENSION', 'ATTDEF',
]);

function parseDxfText(text) {
  const lines = text.split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;
    pairs.push({ code: parseInt(trimmed, 10), value: lines[i + 1] });
  }

  const layers = new Map();
  const blocks = new Map();
  const entities = [];
  let section = null;
  let ent = null;
  let pendingBlock = null;
  let blockEntities = null;

  const flush = () => {
    if (!ent) return;
    if (ent.type === 'LAYER') {
      const name = getS(ent.pairs, 2);
      const color = getN(ent.pairs, 62);
      layers.set(name, color === null ? 7 : color);
    } else if (section === 'ENTITIES') {
      entities.push(ent);
    } else if (section === 'BLOCKS' && blockEntities) {
      blockEntities.push(ent);
    }
    ent = null;
  };

  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    if (p.code !== 0) {
      if (ent) ent.pairs.push(p);
      continue;
    }
    const t = p.value.trim().toUpperCase();
    if (t === 'SECTION') {
      flush();
      section = pairs[i + 1] && pairs[i + 1].code === 2 ? pairs[i + 1].value.trim().toUpperCase() : null;
      i++;
      continue;
    }
    if (t === 'ENDSEC') {
      flush();
      section = null;
      continue;
    }
    if (t === 'BLOCK') {
      flush();
      pendingBlock = { name: null, entities: [] };
      continue;
    }
    if (t === 'ENDBLK') {
      flush();
      if (pendingBlock && pendingBlock.name) blocks.set(pendingBlock.name, pendingBlock.entities);
      pendingBlock = null;
      blockEntities = null;
      continue;
    }
    if (t === 'TABLE') {
      flush();
      continue;
    }
    if (t === 'ENDTAB') {
      flush();
      continue;
    }
    if (section === 'BLOCKS' && pendingBlock && pendingBlock.name === null && p.code === 0 && t !== 'BLOCK') {
      if (pairs[i - 1] && pairs[i - 1].code === 2) pendingBlock.name = pairs[i - 1].value.trim();
      blockEntities = pendingBlock.entities;
    }
    if (t === 'POLYLINE' || t === 'VERTEX') {
      flush();
      ent = { type: t, pairs: [] };
      continue;
    }
    if (t === 'SEQEND') {
      flush();
      continue;
    }
    if (ENTITY_TYPES.has(t)) {
      flush();
      ent = { type: t, pairs: [] };
      continue;
    }
    flush();
  }
  flush();

  for (const e of entities) {
    if (e.type === 'POLYLINE') {
      const verts = [];
      const walk = (i) => {
        if (i >= entities.length) return;
        if (entities[i].type === 'VERTEX') verts.push(entities[i]);
        if (entities[i].type === 'SEQEND') return;
        walk(i + 1);
      };
      walk(entities.indexOf(e) + 1);
      e.vertices = verts;
    }
  }
  return { layers, blocks, entities };
}

function applyTf(tf, p) {
  return tf ? tf(p) : p;
}

function pushPolyline(target, pts, tf) {
  for (const p of pts) target.lines.push(applyTf(tf, p));
}

function buildEntity(e, blocks, target, depth, tf) {
  if (depth > 6) return;
  const layerColor = target.layerColors.get(getS(e.pairs, 8)) ?? [255, 255, 255];
  const aci = getN(e.pairs, 62);
  const color = aci === null ? layerColor : aciToRgb(aci);
  let buckets = target.colors.get(color.join(','));
  if (!buckets) {
    buckets = { lines: [], points: [], faces: [] };
    target.colors.set(color.join(','), buckets);
  }

  switch (e.type) {
    case 'LINE': {
      const a = [getN(e.pairs, 10), getN(e.pairs, 20), getN(e.pairs, 30) || 0];
      const b = [getN(e.pairs, 11), getN(e.pairs, 21), getN(e.pairs, 31) || 0];
      if (a[0] !== null && b[0] !== null) {
        buckets.lines.push(applyTf(tf, a), applyTf(tf, b));
      }
      break;
    }
    case 'LWPOLYLINE': {
      const xs = getAll(e.pairs, 10);
      const ys = getAll(e.pairs, 20);
      const z = getN(e.pairs, 30) || 0;
      const closed = (getN(e.pairs, 70) || 0) & 1;
      const pts = [];
      for (let i = 0; i < xs.length; i++) pts.push([xs[i], ys[i] || 0, z]);
      if (closed && pts.length) pts.push(pts[0]);
      pushPolyline(buckets, pts, tf);
      break;
    }
    case 'POLYLINE': {
      const closed = (getN(e.pairs, 70) || 0) & 1;
      const pts = (e.vertices || []).map((v) => [getN(v.pairs, 10), getN(v.pairs, 20), getN(v.pairs, 30) || 0]);
      if (closed && pts.length) pts.push(pts[0]);
      pushPolyline(buckets, pts, tf);
      break;
    }
    case 'CIRCLE': {
      const c = [getN(e.pairs, 10), getN(e.pairs, 20), getN(e.pairs, 30) || 0];
      const r = getN(e.pairs, 40) || 0;
      const pts = [];
      const n = 72;
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2;
        pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), c[2]]);
      }
      pushPolyline(buckets, pts, tf);
      break;
    }
    case 'ARC': {
      const c = [getN(e.pairs, 10), getN(e.pairs, 20), getN(e.pairs, 30) || 0];
      const r = getN(e.pairs, 40) || 0;
      let a0 = (getN(e.pairs, 50) || 0) * (Math.PI / 180);
      let a1 = (getN(e.pairs, 51) || 0) * (Math.PI / 180);
      let sweep = a1 - a0;
      if (sweep < 0) sweep += Math.PI * 2;
      if (sweep <= 0) sweep = Math.PI * 2;
      const n = Math.max(4, Math.ceil((72 * sweep) / (Math.PI * 2)));
      const pts = [];
      for (let k = 0; k <= n; k++) {
        const a = a0 + (sweep * k) / n;
        pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), c[2]]);
      }
      pushPolyline(buckets, pts, tf);
      break;
    }
    case 'ELLIPSE': {
      const c = [getN(e.pairs, 10), getN(e.pairs, 20), getN(e.pairs, 30) || 0];
      const mx = getN(e.pairs, 11) || 0;
      const my = getN(e.pairs, 21) || 0;
      const mz = getN(e.pairs, 31) || 0;
      const rx = Math.hypot(mx, my, mz) || 1;
      const ry = rx * (getN(e.pairs, 40) || 1);
      const rot = Math.atan2(my, mx);
      let t0 = getN(e.pairs, 41) || 0;
      let t1 = getN(e.pairs, 42) || Math.PI * 2;
      const n = 72;
      const pts = [];
      for (let k = 0; k <= n; k++) {
        const t = t0 + ((t1 - t0) * k) / n;
        const ct = Math.cos(t);
        const st = Math.sin(t);
        pts.push([
          c[0] + rx * Math.cos(rot) * ct - ry * Math.sin(rot) * st,
          c[1] + rx * Math.sin(rot) * ct + ry * Math.cos(rot) * st,
          c[2],
        ]);
      }
      pushPolyline(buckets, pts, tf);
      break;
    }
    case 'POINT': {
      const p = [getN(e.pairs, 10), getN(e.pairs, 20), getN(e.pairs, 30) || 0];
      if (p[0] !== null) buckets.points.push(applyTf(tf, p));
      break;
    }
    case '3DFACE': {
      const corners = [];
      for (let k = 0; k < 4; k++) {
        corners.push([getN(e.pairs, 10 + k), getN(e.pairs, 20 + k), getN(e.pairs, 30 + k) || 0]);
      }
      if (corners[0][0] === null || corners[1][0] === null || corners[2][0] === null) break;
      const a = applyTf(tf, corners[0]);
      const b = applyTf(tf, corners[1]);
      const c2 = applyTf(tf, corners[2]);
      const d = applyTf(tf, corners[3]);
      const same = d && Math.abs(d[0] - c2[0]) < 1e-12 && Math.abs(d[1] - c2[1]) < 1e-12 && Math.abs(d[2] - c2[2]) < 1e-12;
      buckets.faces.push(a, b, c2);
      if (!same) buckets.faces.push(a, c2, d);
      break;
    }
    case 'MESH': {
      const verts = [];
      let cur = [0, 0, 0];
      let phase = 0;
      let seen93 = 0;
      let faceCountdown = 0;
      let face = null;
      for (const p of e.pairs) {
        if (p.code === 93) {
          seen93++;
          if (seen93 >= 2) phase = 1;
          continue;
        }
        if (phase === 0) {
          if (p.code === 10) cur = [NUM(p.value), cur[1], cur[2]];
          else if (p.code === 20) cur[1] = NUM(p.value);
          else if (p.code === 30) {
            cur[2] = NUM(p.value);
            verts.push(cur);
            cur = [0, 0, 0];
          }
        } else if (p.code === 90) {
          if (faceCountdown === 0) {
            faceCountdown = NUM(p.value);
            face = [];
          } else {
            face.push(NUM(p.value));
            faceCountdown--;
            if (faceCountdown === 0 && face && face.length >= 3) {
              for (let k = 1; k < face.length - 1; k++) {
                const a = applyTf(tf, verts[face[0]]);
                const b = applyTf(tf, verts[face[k]]);
                const c2 = applyTf(tf, verts[face[k + 1]]);
                if (a && b && c2) buckets.faces.push(a, b, c2);
              }
            }
          }
        }
      }
      break;
    }
    case 'INSERT': {
      const name = getS(e.pairs, 2);
      const blk = blocks.get(name);
      if (!blk) break;
      const ip = [getN(e.pairs, 10) || 0, getN(e.pairs, 20) || 0, getN(e.pairs, 30) || 0];
      const sx = getN(e.pairs, 41) || 1;
      const sy = getN(e.pairs, 42) || 1;
      const sz = getN(e.pairs, 43) || 1;
      const rot = (getN(e.pairs, 50) || 0) * (Math.PI / 180);
      const inner = (p) => {
        const x = p[0] * sx;
        const y = p[1] * sy;
        const z = p[2] * sz;
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        return [ip[0] + x * c - y * s, ip[1] + x * s + y * c, ip[2] + z];
      };
      const combined = tf ? (p) => tf(inner(p)) : inner;
      for (const be of blk) buildEntity(be, blocks, target, depth + 1, combined);
      break;
    }
    default:
      break;
  }
}

export function loadDxf(text) {
  const { layers, blocks, entities } = parseDxfText(text);

  const layerColors = new Map();
  for (const [name, aci] of layers) {
    const [r, g, b] = aciToRgb(aci);
    layerColors.set(name, [r, g, b]);
  }

  const target = { layerColors, colors: new Map() };
  for (const e of entities) {
    if (e.type === 'VERTEX' || e.type === 'SEQEND') continue;
    buildEntity(e, blocks, target, 0, null);
  }

  const group = new THREE.Group();
  let lineCount = 0;
  let pointCount = 0;
  let meshCount = 0;
  let triCount = 0;

  for (const [key, bucket] of target.colors) {
    const [r, g, b] = key.split(',').map(Number);
    const color = new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);

    if (bucket.lines.length >= 2) {
      const positions = new Float32Array(bucket.lines.length * 3);
      for (let i = 0; i < bucket.lines.length; i++) {
        const p = bucket.lines[i];
        positions[i * 3] = p[0];
        positions[i * 3 + 1] = p[1];
        positions[i * 3 + 2] = p[2];
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color }));
      lineCount += Math.floor(bucket.lines.length / 2);
      group.add(line);
    }

    if (bucket.points.length) {
      const positions = new Float32Array(bucket.points.length * 3);
      for (let i = 0; i < bucket.points.length; i++) {
        const p = bucket.points[i];
        positions[i * 3] = p[0];
        positions[i * 3 + 1] = p[1];
        positions[i * 3 + 2] = p[2];
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      group.add(new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 5, sizeAttenuation: false })));
      pointCount += bucket.points.length;
    }

    if (bucket.faces.length >= 3) {
      const positions = new Float32Array(bucket.faces.length * 3);
      for (let i = 0; i < bucket.faces.length; i++) {
        const p = bucket.faces[i];
        positions[i * 3] = p[0];
        positions[i * 3 + 1] = p[1];
        positions[i * 3 + 2] = p[2];
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.computeVertexNormals();
      group.add(
        new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide }))
      );
      meshCount++;
      triCount += Math.floor(bucket.faces.length / 3);
    }
  }

  if (!group.children.length) throw new Error('该 .dxf 文件中没有可显示的图元（文字/标注暂不支持）');

  group.rotation.x = -Math.PI / 2;
  return { group, stats: { meshCount, lineCount, pointCount, triCount } };
}
