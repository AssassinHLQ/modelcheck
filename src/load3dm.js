import * as THREE from 'three';
import { tessellateBrep } from './brepTessellate.js';
import rhinoWasmB64 from './rhinoWasmB64.js';
import { decompressWasm as decompressRhinoWasm } from './rhinoWasmB64.js';
import { yieldToEventLoop } from './yield.js';

let rhinoPromise = null;

const BASE_URL = (import.meta.env && import.meta.env.BASE_URL) || '/';

const isFileProtocol = typeof location !== 'undefined' && location.protocol === 'file:';

function engineScriptUrl() {
  if (isFileProtocol) return new URL('rhino3dm/rhino3dm.js', window.location.href).href;
  return `${BASE_URL}rhino3dm/rhino3dm.js`;
}

function wasmUrl() {
  if (isFileProtocol) {
    if (!rhinoWasmB64) {
      throw new Error('本构建未内嵌 3dm 引擎（服务器模式）。请用完整构建（npm run build）支持本地双击，或部署到服务器使用');
    }
    if (!wasmObjectUrl) {
      const raw = decompressRhinoWasm();
      wasmObjectUrl = URL.createObjectURL(new Blob([raw], { type: 'application/wasm' }));
    }
    return wasmObjectUrl;
  }
  return new URL(`${BASE_URL}rhino3dm/rhino3dm.wasm`, window.location.href).href;
}

let wasmObjectUrl = null;

function getRhino() {
  if (rhinoPromise) return rhinoPromise;
  rhinoPromise = (async () => {
    if (!window.rhino3dm) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = engineScriptUrl();
        script.onload = resolve;
        script.onerror = () => reject(new Error('rhino3dm 引擎加载失败，请刷新重试'));
        document.head.appendChild(script);
      });
    }
    return window.rhino3dm({ locateFile: () => wasmUrl() });
  })();
  return rhinoPromise;
}

export async function load3dm(buffer, onProgress) {
  const rhino = await getRhino();
  const doc = rhino.File3dm.fromByteArray(new Uint8Array(buffer));
  if (!doc) throw new Error('无法解析该 .3dm 文件（文件损坏或格式不兼容）');

  const group = new THREE.Group();
  const stats = { meshCount: 0, lineCount: 0, pointCount: 0, skipped: 0, triCount: 0, faceCount: 0 };

  const layers = doc.layers();
  const materials = doc.materials();
  const DEFAULT_MESH = 0xb8c0cc;
  const DEFAULT_LINE = 0x8893a3;

  const layerOf = (index) => {
    if (index < 0 || index >= layers.count) return null;
    return layers.get(index);
  };

  const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

  const colorFromRgb = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

  const materialInfoCache = new Map();
  const materialInfo = (idx) => {
    if (idx < 0 || idx >= materials.count) return null;
    if (materialInfoCache.has(idx)) return materialInfoCache.get(idx);
    const m = materials.get(idx);
    const d = m && m.diffuseColor;
    const color = d && d.r !== undefined ? colorFromRgb(d.r / 255, d.g / 255, d.b / 255) : null;
    const transparency = m ? Number(m.transparency) || 0 : 0;
    const opacity = Math.max(0.02, Math.min(1, 1 - transparency));
    const info = { color, opacity, transparent: opacity < 0.999 };
    materialInfoCache.set(idx, info);
    return info;
  };

  const layerColorOf = (layer) => {
    if (!layer) return null;
    const c = layer.color;
    if (!c) return null;
    return colorFromRgb(c.r / 255, c.g / 255, c.b / 255);
  };

  const resolveColor = (attrs, layerIndex) => {
    let info = null;
    let explicit = false;
    const fromObject = attrs.materialSource === rhino.ObjectMaterialSource.MaterialFromObject && attrs.materialIndex >= 0;
    if (fromObject) {
      info = materialInfo(attrs.materialIndex);
      explicit = true;
    }
    if (!info) {
      const layer = layerOf(layerIndex);
      const layerMat = layer && layer.renderMaterialIndex >= 0 ? materialInfo(layer.renderMaterialIndex) : null;
      if (layerMat && layerMat.color) {
        info = layerMat;
        explicit = true;
      } else {
        info = { color: layerColorOf(layer), opacity: 1, transparent: false };
      }
    }
    if (!info.color) info = { color: null, opacity: info.opacity, transparent: info.transparent };
    if (!explicit && info.color) {
      const lum = 0.2126 * info.color.r + 0.7152 * info.color.g + 0.0722 * info.color.b;
      if (lum < 0.06) info.color = null;
    }
    return info;
  };

  const meshMatCache = new Map();
  const meshMaterial = (color, opacity = 1) => {
    const key = (color ? '#' + color.getHexString() : 'default') + '|' + opacity.toFixed(3);
    if (!meshMatCache.has(key)) {
      meshMatCache.set(
        key,
        new THREE.MeshStandardMaterial({
          color: color ?? DEFAULT_MESH,
          roughness: 0.72,
          metalness: 0.08,
          side: THREE.DoubleSide,
          transparent: opacity < 0.999,
          opacity,
        })
      );
    }
    return meshMatCache.get(key);
  };

  const lineMatCache = new Map();
  const lineMaterial = (color) => {
    const key = color ? '#' + color.getHexString() : 'default';
    if (!lineMatCache.has(key)) {
      lineMatCache.set(key, new THREE.LineBasicMaterial({ color: color ?? DEFAULT_LINE }));
    }
    return lineMatCache.get(key);
  };

  const pointMatCache = new Map();
  const pointMaterial = (color) => {
    const key = color ? '#' + color.getHexString() : 'default';
    if (!pointMatCache.has(key)) {
      pointMatCache.set(
        key,
        new THREE.PointsMaterial({
          color: color ?? DEFAULT_LINE,
          size: 5,
          sizeAttenuation: false,
        })
      );
    }
    return pointMatCache.get(key);
  };

  const addMesh = (mesh, colorInfo) => {
    const verts = mesh.vertices();
    const vc = verts.count;
    if (!vc) return;
    const positions = new Float32Array(vc * 3);
    for (let i = 0; i < vc; i++) {
      const v = verts.get(i);
      positions[i * 3] = v[0];
      positions[i * 3 + 1] = v[2];
      positions[i * 3 + 2] = -v[1];
    }
    const indices = [];
    const faces = mesh.faces();
    for (let f = 0; f < faces.count; f++) {
      const face = faces.get(f);
      if (face.length === 4) {
        indices.push(face[0], face[1], face[2], face[0], face[2], face[3]);
      } else if (face.length >= 3) {
        indices.push(face[0], face[1], face[2]);
      }
    }
    if (!indices.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = meshMaterial(colorInfo.color, colorInfo.opacity);

    const vcols = mesh.vertexColors();
    if (vcols && vcols.count === vc) {
      const colors = new Float32Array(vc * 3);
      for (let i = 0; i < vc; i++) {
        const c = vcols.get(i);
        colors[i * 3] = srgbToLinear(c.r / 255);
        colors[i * 3 + 1] = srgbToLinear(c.g / 255);
        colors[i * 3 + 2] = srgbToLinear(c.b / 255);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const colored = mat.clone();
      colored.vertexColors = true;
      const meshObj = new THREE.Mesh(geo, colored);
      group.add(meshObj);
      stats.meshCount++;
      stats.triCount += indices.length / 3;
      return;
    }

    group.add(new THREE.Mesh(geo, mat));
    stats.meshCount++;
    stats.triCount += indices.length / 3;
  };

  const addBrep = async (brep, colorInfo) => {
    const res = await tessellateBrep(rhino, brep, { onYield: yieldToEventLoop });
    if (res.geometry) {
      const mat = meshMaterial(colorInfo.color, colorInfo.opacity);
      if (res.geometry.getAttribute('color')) {
        const colored = mat.clone();
        colored.vertexColors = true;
        group.add(new THREE.Mesh(res.geometry, colored));
      } else {
        group.add(new THREE.Mesh(res.geometry, mat));
      }
      stats.meshCount++;
      stats.triCount += res.triCount;
      stats.faceCount += res.faceCount;
    }
    if (res.lineGeometry) {
      group.add(new THREE.Line(res.lineGeometry, lineMaterial(colorInfo.color)));
      stats.lineCount++;
    }
    stats.skipped += res.failedFaces;
  };

  const addExtrusion = async (extrusion, colorInfo) => {
    const m = extrusion.getMesh(rhino.MeshType.Render) || extrusion.getMesh(rhino.MeshType.Default);
    if (m) {
      addMesh(m, colorInfo);
      return;
    }
    const brep = extrusion.toBrep(false);
    if (brep) await addBrep(brep, colorInfo);
    else stats.skipped++;
  };

  const addConvertible = async (geom, colorInfo) => {
    const brep = rhino.Brep.tryConvertBrep(geom);
    if (brep) await addBrep(brep, colorInfo);
    else stats.skipped++;
  };

  const addCurve = (curve, colorInfo) => {
    let pts;
    if (curve.isLinear()) {
      pts = [curve.pointAtStart, curve.pointAtEnd];
    } else {
      const dom = curve.domain;
      const n = 48;
      pts = [];
      for (let i = 0; i <= n; i++) {
        pts.push(curve.pointAt(dom[0] + ((dom[1] - dom[0]) * i) / n));
      }
    }
    if (pts.length < 2) return;
    const positions = new Float32Array(pts.length * 3);
    for (let i = 0; i < pts.length; i++) {
      const p = [pts[i][0], pts[i][2], -pts[i][1]];
      positions[i * 3] = p[0];
      positions[i * 3 + 1] = p[1];
      positions[i * 3 + 2] = p[2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    group.add(new THREE.Line(geo, lineMaterial(colorInfo.color)));
    stats.lineCount++;
  };

  const addPoints = (pts, colorInfo, colors) => {
    if (!pts.length) return;
    const positions = new Float32Array(pts.length * 3);
    for (let i = 0; i < pts.length; i++) {
      const p = [pts[i][0], pts[i][2], -pts[i][1]];
      positions[i * 3] = p[0];
      positions[i * 3 + 1] = p[1];
      positions[i * 3 + 2] = p[2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = pointMaterial(colorInfo.color);
    if (colors && colors.length === pts.length) {
      const col = new Float32Array(pts.length * 3);
      for (let i = 0; i < pts.length; i++) {
        const c = colors[i];
        col[i * 3] = srgbToLinear(c.r / 255);
        col[i * 3 + 1] = srgbToLinear(c.g / 255);
        col[i * 3 + 2] = srgbToLinear(c.b / 255);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const colored = mat.clone();
      colored.vertexColors = true;
      group.add(new THREE.Points(geo, colored));
    } else {
      group.add(new THREE.Points(geo, mat));
    }
    stats.pointCount++;
  };

  const objects = doc.objects();
  let budget = 0;
  for (let i = 0; i < objects.count; i++) {
    const tObj = performance.now();
    if (i % 8 === 0 && onProgress) onProgress(Math.min(90, Math.round((i / objects.count) * 90)));
    const obj = objects.get(i);
    const att = obj.attributes();
    if (att.mode === rhino.ObjectMode.Hidden || att.visible === false) continue;
    const geom = obj.geometry();
    if (!geom || !geom.isValid) continue;
    const colorInfo = resolveColor(att, att.layerIndex);
    const type = geom.objectType;

    if (type === rhino.ObjectType.Mesh) {
      addMesh(geom, colorInfo);
    } else if (type === rhino.ObjectType.Brep) {
      await addBrep(geom, colorInfo);
    } else if (type === rhino.ObjectType.Extrusion) {
      await addExtrusion(geom, colorInfo);
    } else if (type === rhino.ObjectType.Surface || type === rhino.ObjectType.Hatch) {
      await addConvertible(geom, colorInfo);
    } else if (type === rhino.ObjectType.Curve) {
      addCurve(geom, colorInfo);
    } else if (type === rhino.ObjectType.Point) {
      addPoints([geom.location], colorInfo, null);
    } else if (type === rhino.ObjectType.PointSet) {
      addPoints(geom.getPoints(), colorInfo, geom.containsColors ? geom.getColors() : null);
    } else {
      stats.skipped++;
    }
    budget += performance.now() - tObj;
    if (budget > 30) {
      budget = 0;
      await yieldToEventLoop();
    }
  }

  const total = stats.meshCount + stats.lineCount + stats.pointCount;
  if (!total) {
    throw new Error('该 .3dm 文件中没有可显示的几何体');
  }

  return { group, stats };
}
