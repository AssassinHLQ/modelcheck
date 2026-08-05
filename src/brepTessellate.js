import * as THREE from 'three';
import earcut from 'earcut';
import { yieldToEventLoop } from './yield.js';

const yUp = (p) => [p[0], p[2], -p[1]];

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function isFinite3(p) {
  return Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]);
}

function sampleCurve3D(curve, n = 32) {
  if (curve.isLinear()) return [curve.pointAtStart, curve.pointAtEnd];
  const dom = curve.domain;
  const seg = Math.max(2, n);
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    pts.push(curve.pointAt(dom[0] + ((dom[1] - dom[0]) * i) / seg));
  }
  return pts;
}

function faceRing3D(brep, loop) {
  const ring = [];
  for (let t = 0; t < loop.trims.count; t++) {
    const trim = loop.trims.get(t);
    if (trim.edgeIndex < 0) continue;
    const edge = brep.edges().get(trim.edgeIndex);
    let seg = sampleCurve3D(edge);
    if (trim.isReversed) seg = seg.reverse();
    for (const p of seg) ring.push(p);
  }
  return ring;
}

function dedupeRing(ring) {
  if (!ring.length) return ring;
  const out = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const a = out[out.length - 1];
    const b = ring[i];
    const d2 = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    if (d2 > 1e-24) out.push(b);
  }
  return out;
}

function bboxDiag(pts) {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    if (p[0] < min[0]) min[0] = p[0];
    if (p[1] < min[1]) min[1] = p[1];
    if (p[2] < min[2]) min[2] = p[2];
    if (p[0] > max[0]) max[0] = p[0];
    if (p[1] > max[1]) max[1] = p[1];
    if (p[2] > max[2]) max[2] = p[2];
  }
  const dx = max[0] - min[0];
  const dy = max[1] - min[1];
  const dz = max[2] - min[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
}

function makeUvSolver(surf, scale) {
  const uDom = surf.domain(0);
  const vDom = surf.domain(1);
  const u0 = uDom[0];
  const u1 = uDom[1];
  const v0 = vDom[0];
  const v1 = vDom[1];
  const spanU = u1 - u0;
  const spanV = v1 - v0;
  const h = Math.max(spanU, spanV, 1) * 1e-4;
  const tol2 = Math.max(scale * 1e-6, 1e-10) ** 2;

  const err2 = (u, v, p) => {
    const q = surf.pointAt(u, v);
    if (!q || !isFinite3(q)) return Infinity;
    return (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
  };

  const gridSearch = (p) => {
    const N = 8;
    let bu = u0;
    let bv = v0;
    let be = Infinity;
    for (let i = 0; i <= N; i++) {
      const u = u0 + (spanU * i) / N;
      for (let j = 0; j <= N; j++) {
        const v = v0 + (spanV * j) / N;
        const e = err2(u, v, p);
        if (e < be) {
          be = e;
          bu = u;
          bv = v;
        }
      }
    }
    const cu = spanU / N;
    const cv = spanV / N;
    for (let i = 0; i <= N; i++) {
      const u = Math.min(u1, Math.max(u0, bu - cu / 2 + (cu * i) / N));
      for (let j = 0; j <= N; j++) {
        const v = Math.min(v1, Math.max(v0, bv - cv / 2 + (cv * j) / N));
        const e = err2(u, v, p);
        if (e < be) {
          be = e;
          bu = u;
          bv = v;
        }
      }
    }
    return [bu, bv, be];
  };

  const newton = (p, su, sv) => {
    let u = Math.min(u1, Math.max(u0, su));
    let v = Math.min(v1, Math.max(v0, sv));
    for (let it = 0; it < 8; it++) {
      const q = surf.pointAt(u, v);
      if (!q || !isFinite3(q)) break;
      const ex = q[0] - p[0];
      const ey = q[1] - p[1];
      const ez = q[2] - p[2];
      const e = ex * ex + ey * ey + ez * ez;
      if (e < tol2) return [u, v, e];
      const qUp = surf.pointAt(Math.min(u + h, u1), v);
      const qUm = surf.pointAt(Math.max(u - h, u0), v);
      const qVp = surf.pointAt(u, Math.min(v + h, v1));
      const qVm = surf.pointAt(u, Math.max(v - h, v0));
      if (!qUp || !qUm || !qVp || !qVm || !isFinite3(qUp) || !isFinite3(qUm) || !isFinite3(qVp) || !isFinite3(qVm)) break;
      const su2 = Math.min(u + h, u1) - Math.max(u - h, u0);
      const sv2 = Math.min(v + h, v1) - Math.max(v - h, v0);
      const j00 = (qUp[0] - qUm[0]) / su2;
      const j10 = (qUp[1] - qUm[1]) / su2;
      const j20 = (qUp[2] - qUm[2]) / su2;
      const j01 = (qVp[0] - qVm[0]) / sv2;
      const j11 = (qVp[1] - qVm[1]) / sv2;
      const j21 = (qVp[2] - qVm[2]) / sv2;
      const a00 = j00 * j00 + j10 * j10 + j20 * j20;
      const a01 = j00 * j01 + j10 * j11 + j20 * j21;
      const a11 = j01 * j01 + j11 * j11 + j21 * j21;
      const b0 = -(j00 * ex + j10 * ey + j20 * ez);
      const b1 = -(j01 * ex + j11 * ey + j21 * ez);
      const det = a00 * a11 - a01 * a01;
      if (Math.abs(det) < 1e-30) return [u, v, e];
      let du = (b0 * a11 - a01 * b1) / det;
      let dv = (a00 * b1 - b0 * a01) / det;
      const maxStep = Math.max(spanU, spanV) / 4;
      const cl = Math.max(1, Math.abs(du) / maxStep, Math.abs(dv) / maxStep);
      du /= cl;
      dv /= cl;
      u = Math.min(u1, Math.max(u0, u + du));
      v = Math.min(v1, Math.max(v0, v + dv));
    }
    const q = surf.pointAt(u, v);
    if (!q || !isFinite3(q)) return [u, v, Infinity];
    return [u, v, (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2];
  };

  return {
    solve(p, seed) {
      if (seed) {
        const [u, v, e] = newton(p, seed[0], seed[1]);
        if (e < tol2 * 100) return [u, v];
        const [gu, gv, ge] = gridSearch(p);
        return ge < e ? [gu, gv] : [u, v];
      }
      return gridSearch(p).slice(0, 2);
    },
  };
}

function ringToUV(ring, solver) {
  const uv = [];
  let seed = null;
  for (const p of ring) {
    if (!isFinite3(p)) return null;
    const [u, v] = solver.solve(p, seed);
    uv.push([u, v]);
    seed = [u, v];
  }
  return uv;
}

function signedArea2D(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

function pointInRing2D(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function ringOnDomainBoundary(uvPts, surf) {
  const uDom = surf.domain(0);
  const vDom = surf.domain(1);
  const eps = Math.max(uDom[1] - uDom[0], vDom[1] - vDom[0], 1) * 2e-3;
  let onBoundary = 0;
  for (const [u, v] of uvPts) {
    if (Math.abs(u - uDom[0]) < eps || Math.abs(u - uDom[1]) < eps || Math.abs(v - vDom[0]) < eps || Math.abs(v - vDom[1]) < eps) {
      onBoundary++;
    }
  }
  return uvPts.length > 0 && onBoundary / uvPts.length >= 0.9;
}

function triangulateRings(rings2D) {
  const flat = [];
  const ringStarts = [];
  const holes = [];
  for (let r = 0; r < rings2D.length; r++) {
    let ring = rings2D[r];
    const area = signedArea2D(ring);
    if (Math.abs(area) < 1e-16) continue;
    if ((area > 0) !== (r === 0)) ring = ring.slice().reverse();
    ringStarts.push(flat.length / 2);
    for (const [u, v] of ring) flat.push(u, v);
    if (r > 0) holes.push(flat.length / 2);
  }
  if (flat.length < 6) return null;
  let tris;
  try {
    tris = earcut(flat, holes.length ? holes : undefined, 2);
  } catch {
    return null;
  }
  if (!tris || tris.length < 3) return null;
  return { pts2D: flat, tris, ringStarts };
}

let tessToleranceFactor = 1;

export function setTessellationQuality(factor) {
  tessToleranceFactor = factor;
}

function buildMeshData(surf, pts2D, tris, orientationIsReversed) {
  const pts3D = [];
  for (let i = 0; i < pts2D.length; i += 2) {
    const p = surf.pointAt(pts2D[i], pts2D[i + 1]);
    if (!p || !isFinite3(p)) return null;
    pts3D.push(p);
  }

  const diag = bboxDiag(pts3D);
  const tol = Math.max(diag * 1e-2 * tessToleranceFactor, 1e-8);
  const areaFloor = Math.max(diag * diag * 1e-7, 1e-14);
  const edgeFloor = tol * 0.25;
  const maxDepth = 10;
  const maxTris = 200000;
  const outIdx = [];
  const cache = new Map();

  const mid = (a, b) => {
    const key = a < b ? a + ',' + b : b + ',' + a;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const u = (pts2D[a * 2] + pts2D[b * 2]) / 2;
    const v = (pts2D[a * 2 + 1] + pts2D[b * 2 + 1]) / 2;
    const p = surf.pointAt(u, v);
    if (!p || !isFinite3(p)) return -1;
    const idx = pts2D.length / 2;
    pts2D.push(u, v);
    pts3D.push(p);
    cache.set(key, idx);
    return idx;
  };

  const devOf = (a, b) => {
    const m = mid(a, b);
    if (m < 0) return Infinity;
    const pa = pts3D[a];
    const pb = pts3D[b];
    const pm = pts3D[m];
    const dx = pa[0] + pb[0] - pm[0] * 2;
    const dy = pa[1] + pb[1] - pm[1] * 2;
    const dz = pa[2] + pb[2] - pm[2] * 2;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;
  };

  const subdivide = (a, b, c, depth) => {
    if (outIdx.length >= maxTris * 3) return;
    const dab = devOf(a, b);
    const dbc = devOf(b, c);
    const dca = devOf(c, a);
    const dev = Math.max(dab, dbc, dca);
    const pa = pts3D[a];
    const pb = pts3D[b];
    const pc = pts3D[c];
    const ux = pb[0] - pa[0];
    const uy = pb[1] - pa[1];
    const uz = pb[2] - pa[2];
    const vx = pc[0] - pa[0];
    const vy = pc[1] - pa[1];
    const vz = pc[2] - pa[2];
    const crossLen2 = (uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2;
    if (depth >= maxDepth || dev <= tol || crossLen2 < areaFloor * areaFloor * 4) {
      outIdx.push(a, b, c);
      return;
    }
    let m;
    if (dab >= dbc && dab >= dca) m = mid(a, b);
    else if (dbc >= dca) m = mid(b, c);
    else m = mid(c, a);
    if (m < 0) {
      outIdx.push(a, b, c);
      return;
    }
    if (dab >= dbc && dab >= dca) {
      subdivide(a, m, c, depth + 1);
      subdivide(m, b, c, depth + 1);
    } else if (dbc >= dca) {
      subdivide(b, m, a, depth + 1);
      subdivide(m, c, a, depth + 1);
    } else {
      subdivide(c, m, b, depth + 1);
      subdivide(m, a, b, depth + 1);
    }
  };

  for (let t = 0; t < tris.length; t += 3) {
    subdivide(tris[t], tris[t + 1], tris[t + 2], 0);
  }
  if (!outIdx.length) return null;

  const areaEps = Math.max(diag * diag * 1e-16, 1e-20);
  const positions = new Float32Array(pts3D.length * 3);
  const normals = new Float32Array(pts3D.length * 3);
  for (let i = 0; i < pts3D.length; i++) {
    const p = yUp(pts3D[i]);
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
    let n = surf.normalAt(pts2D[i * 2], pts2D[i * 2 + 1]);
    if (!n || !isFinite3(n)) n = [0, 1, 0];
    let len = Math.hypot(n[0], n[1], n[2]);
    if (!len) n = [0, 1, 0];
    len = Math.hypot(n[0], n[1], n[2]);
    const nu = yUp([n[0] / len, n[1] / len, n[2] / len]);
    normals[i * 3] = nu[0];
    normals[i * 3 + 1] = nu[1];
    normals[i * 3 + 2] = nu[2];
  }

  const indices = [];
  for (let t = 0; t < outIdx.length; t += 3) {
    const a = outIdx[t];
    const b = outIdx[t + 1];
    const c = outIdx[t + 2];
    if (a < 0 || b < 0 || c < 0) continue;
    const pa = pts3D[a];
    const pb = pts3D[b];
    const pc = pts3D[c];
    const ux = pb[0] - pa[0];
    const uy = pb[1] - pa[1];
    const uz = pb[2] - pa[2];
    const vx = pc[0] - pa[0];
    const vy = pc[1] - pa[1];
    const vz = pc[2] - pa[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    if (nx * nx + ny * ny + nz * nz < areaEps) continue;
    indices.push(a, b, c);
  }
  if (!indices.length) return null;
  if (orientationIsReversed) {
    for (let i = 0; i < indices.length; i += 3) {
      const tmp = indices[i + 1];
      indices[i + 1] = indices[i + 2];
      indices[i + 2] = tmp;
    }
  }
  return { positions, normals, indices: Uint32Array.from(indices) };
}

function planarMeshData(surf, rings3D, orientationIsReversed, faceNormal) {
  const ring0 = rings3D[0];
  const p0 = ring0[0];
  let i = 1;
  while (i < ring0.length && (ring0[i][0] - p0[0]) ** 2 + (ring0[i][1] - p0[1]) ** 2 + (ring0[i][2] - p0[2]) ** 2 < 1e-24) i++;
  if (i >= ring0.length) return null;
  const x0 = ring0[i][0] - p0[0];
  const y0 = ring0[i][1] - p0[1];
  const z0 = ring0[i][2] - p0[2];
  let len = Math.hypot(x0, y0, z0);
  if (!len) return null;
  const xAxis = [x0 / len, y0 / len, z0 / len];
  let n = faceNormal;
  if (!n) n = surf.normalAt((surf.domain(0)[0] + surf.domain(0)[1]) / 2, (surf.domain(1)[0] + surf.domain(1)[1]) / 2);
  if (!n || !isFinite3(n)) return null;
  const c = [xAxis[1] * n[2] - xAxis[2] * n[1], xAxis[2] * n[0] - xAxis[0] * n[2], xAxis[0] * n[1] - xAxis[1] * n[0]];
  const yLen = Math.hypot(c[0], c[1], c[2]);
  if (!yLen) return null;
  const yAxis = [c[0] / yLen, c[1] / yLen, c[2] / yLen];
  const rings2D = rings3D.map((ring) =>
    ring.map((p) => [
      (p[0] - p0[0]) * xAxis[0] + (p[1] - p0[1]) * xAxis[1] + (p[2] - p0[2]) * xAxis[2],
      (p[0] - p0[0]) * yAxis[0] + (p[1] - p0[1]) * yAxis[1] + (p[2] - p0[2]) * yAxis[2],
    ])
  );
  const triData = triangulateRings(rings2D);
  if (!triData) return null;

  const totalPts = rings3D.reduce((s, r) => s + r.length, 0);
  const positions = new Float32Array(totalPts * 3);
  const normals = new Float32Array(totalPts * 3);
  let k = 0;
  const nLen = Math.hypot(n[0], n[1], n[2]);
  if (!nLen) return null;
  const nu = yUp([n[0] / nLen, n[1] / nLen, n[2] / nLen]);
  for (const ring of rings3D) {
    for (const p of ring) {
      const q = yUp(p);
      positions[k * 3] = q[0];
      positions[k * 3 + 1] = q[1];
      positions[k * 3 + 2] = q[2];
      normals[k * 3] = nu[0];
      normals[k * 3 + 1] = nu[1];
      normals[k * 3 + 2] = nu[2];
      k++;
    }
  }
  const indices = [];
  for (let t = 0; t < triData.tris.length; t += 3) {
    indices.push(triData.tris[t], triData.tris[t + 1], triData.tris[t + 2]);
  }
  if (!indices.length) return null;
  if (orientationIsReversed) {
    for (let i = 0; i < indices.length; i += 3) {
      const tmp = indices[i + 1];
      indices[i + 1] = indices[i + 2];
      indices[i + 2] = tmp;
    }
  }
  return { positions, normals, indices: Uint32Array.from(indices) };
}

function gridMeshData(surf, holes2D, orientationIsReversed) {
  const uDom = surf.domain(0);
  const vDom = surf.domain(1);
  const u0 = uDom[0];
  const u1 = uDom[1];
  const v0 = vDom[0];
  const v1 = vDom[1];
  const N = Math.round(16 + (1 - tessToleranceFactor) * 44);
  const pts2D = [];
  for (let j = 0; j <= N; j++) {
    const v = v0 + ((v1 - v0) * j) / N;
    for (let i = 0; i <= N; i++) {
      pts2D.push(u0 + ((u1 - u0) * i) / N, v);
    }
  }
  const inside = (u, v) => {
    for (const hole of holes2D) {
      if (pointInRing2D(u, v, hole)) return false;
    }
    return true;
  };
  const tris = [];
  for (let j = 0; j < N; j++) {
    const vc = v0 + ((v1 - v0) * (j + 0.5)) / N;
    for (let i = 0; i < N; i++) {
      const uc = u0 + ((u1 - u0) * (i + 0.5)) / N;
      if (!inside(uc, vc)) continue;
      const a = j * (N + 1) + i;
      const b = a + 1;
      const c = a + N + 1;
      const d = c + 1;
      tris.push(a, b, c, b, d, c);
    }
  }
  if (!tris.length) return null;
  return buildMeshData(surf, pts2D, tris, orientationIsReversed);
}

function isActuallyPlanar(surf, scale) {
  const uDom = surf.domain(0);
  const vDom = surf.domain(1);
  const u0 = uDom[0];
  const u1 = uDom[1];
  const v0 = vDom[0];
  const v1 = vDom[1];
  const um = (u0 + u1) / 2;
  const vm = (v0 + v1) / 2;
  const samples = [
    [u0, v0],
    [u1, v0],
    [u0, v1],
    [u1, v1],
    [um, vm],
  ];
  let n = null;
  for (const [u, v] of samples) {
    const nv = surf.normalAt(u, v);
    if (!nv || !isFinite3(nv)) return false;
    if (!n) {
      n = nv;
      continue;
    }
    const dot = nv[0] * n[0] + nv[1] * n[1] + nv[2] * n[2];
    if (dot < Math.cos((0.5 * Math.PI) / 180)) return false;
  }
  const p0 = surf.pointAt(u0, v0);
  if (!p0 || !isFinite3(p0)) return false;
  const nLen = Math.hypot(n[0], n[1], n[2]) || 1;
  const planarTol = Math.max(scale * 1e-8, 1e-9);
  for (const [u, v] of samples) {
    const p = surf.pointAt(u, v);
    if (!p || !isFinite3(p)) return false;
    const d = (p[0] - p0[0]) * n[0] + (p[1] - p0[1]) * n[1] + (p[2] - p0[2]) * n[2];
    if (Math.abs(d) / nLen > planarTol) return false;
  }
  return true;
}

function fromRhinoMesh(mesh) {
  const verts = mesh.vertices();
  const vc = verts.count;
  if (!vc) return null;
  const positions = new Float32Array(vc * 3);
  for (let i = 0; i < vc; i++) {
    const v = verts.get(i);
    const q = yUp(v);
    positions[i * 3] = q[0];
    positions[i * 3 + 1] = q[1];
    positions[i * 3 + 2] = q[2];
  }
  const faceList = mesh.faces();
  const rawIdx = [];
  for (let f = 0; f < faceList.count; f++) {
    const face = faceList.get(f);
    if (face.length === 4) rawIdx.push(face[0], face[1], face[2], face[0], face[2], face[3]);
    else if (face.length >= 3) rawIdx.push(face[0], face[1], face[2]);
  }
  if (!rawIdx.length) return null;

  let colors = null;
  const vcols = mesh.vertexColors();
  if (vcols && vcols.count === vc) {
    const arr = new Float32Array(vc * 3);
    for (let i = 0; i < vc; i++) {
      const c = vcols.get(i);
      if (!c) continue;
      arr[i * 3] = srgbToLinear(c.r / 255);
      arr[i * 3 + 1] = srgbToLinear(c.g / 255);
      arr[i * 3 + 2] = srgbToLinear(c.b / 255);
    }
    colors = arr;
  }

  const normals = new Float32Array(vc * 3);
  const mNormals = mesh.normals();
  if (mNormals && mNormals.count === vc) {
    for (let i = 0; i < vc; i++) {
      const n = mNormals.get(i);
      if (!n || !isFinite3(n)) continue;
      const nu = yUp(n);
      normals[i * 3] = nu[0];
      normals[i * 3 + 1] = nu[1];
      normals[i * 3 + 2] = nu[2];
    }
  } else {
    const accum = new Float32Array(vc * 3);
    for (let f = 0; f < rawIdx.length; f += 3) {
      const a = rawIdx[f];
      const b = rawIdx[f + 1];
      const c = rawIdx[f + 2];
      const pa = positions;
      const ux = pa[b * 3] - pa[a * 3];
      const uy = pa[b * 3 + 1] - pa[a * 3 + 1];
      const uz = pa[b * 3 + 2] - pa[a * 3 + 2];
      const vx = pa[c * 3] - pa[a * 3];
      const vy = pa[c * 3 + 1] - pa[a * 3 + 1];
      const vz = pa[c * 3 + 2] - pa[a * 3 + 2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      if (!len) continue;
      accum[a * 3] += nx / len;
      accum[a * 3 + 1] += ny / len;
      accum[a * 3 + 2] += nz / len;
      accum[b * 3] += nx / len;
      accum[b * 3 + 1] += ny / len;
      accum[b * 3 + 2] += nz / len;
      accum[c * 3] += nx / len;
      accum[c * 3 + 1] += ny / len;
      accum[c * 3 + 2] += nz / len;
    }
    for (let i = 0; i < vc; i++) {
      const ax = accum[i * 3];
      const ay = accum[i * 3 + 1];
      const az = accum[i * 3 + 2];
      const len = Math.hypot(ax, ay, az) || 1;
      normals[i * 3] = ax / len;
      normals[i * 3 + 1] = ay / len;
      normals[i * 3 + 2] = az / len;
    }
  }
  return { positions, normals, indices: Uint32Array.from(rawIdx), colors };
}

function mergeRecords(records, diag) {
  if (!records.length) return null;
  const positions = [];
  const normals = [];
  const colors = [];
  let hasColors = false;
  for (const rec of records) if (rec.colors) { hasColors = true; break; }
  const indices = [];
  const weld = new Map();
  const coloredSet = new Set();
  const q = Math.min(1e9, Math.max(1e-3, 1e6 / Math.max(diag, 1e-9)));
  const cos85 = Math.cos((85 * Math.PI) / 180);

  const pushVertex = (x, y, z, nx, ny, nz) => {
    const key = Math.round(x * q) + ',' + Math.round(y * q) + ',' + Math.round(z * q);
    const hit = weld.get(key);
    if (hit) {
      const d = hit.nx * nx + hit.ny * ny + hit.nz * nz;
      if (d > cos85) {
        const sx = hit.nx + nx;
        const sy = hit.ny + ny;
        const sz = hit.nz + nz;
        const len = Math.hypot(sx, sy, sz) || 1;
        hit.nx = sx / len;
        hit.ny = sy / len;
        hit.nz = sz / len;
        return hit.idx;
      }
    }
    const idx = positions.length / 3;
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    if (hasColors) {
      colors.push(1, 1, 1);
    }
    weld.set(key, { idx, nx, ny, nz });
    return idx;
  };

  for (const rec of records) {
    const vmap = new Map();
    const recCol = rec.colors;
    for (let v = 0; v < rec.positions.length / 3; v++) {
      const merged = pushVertex(rec.positions[v * 3], rec.positions[v * 3 + 1], rec.positions[v * 3 + 2], rec.normals[v * 3], rec.normals[v * 3 + 1], rec.normals[v * 3 + 2]);
      if (hasColors && recCol && !coloredSet.has(merged)) {
        coloredSet.add(merged);
        const ci = merged * 3;
        colors[ci] = recCol[v * 3];
        colors[ci + 1] = recCol[v * 3 + 1];
        colors[ci + 2] = recCol[v * 3 + 2];
      }
      vmap.set(v, merged);
    }
    for (let i = 0; i < rec.indices.length; i += 3) {
      indices.push(vmap.get(rec.indices[i]), vmap.get(rec.indices[i + 1]), vmap.get(rec.indices[i + 2]));
    }
  }
  if (!indices.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  if (hasColors) geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(indices);
  return geometry;
}

function buildLineGeometry(linePts) {
  if (!linePts.length) return null;
  const positions = new Float32Array(linePts.length * 3);
  for (let i = 0; i < linePts.length; i++) {
    const p = yUp(linePts[i]);
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

export {
  sampleCurve3D,
  faceRing3D,
  dedupeRing,
  makeUvSolver,
  ringToUV,
  triangulateRings,
  buildMeshData,
};

export async function tessellateBrep(rhino, brep, { onYield } = {}) {
  const faces = brep.faces();
  const records = [];
  const linePts = [];
  let failedFaces = 0;

  const brepVerts = brep.vertices();
  const diagPts = [];
  for (let i = 0; i < brepVerts.count; i++) diagPts.push(brepVerts.get(i).location);
  const scale = bboxDiag(diagPts);

  let budget = 0;
  for (let f = 0; f < faces.count; f++) {
    const tFace0 = performance.now();
    const face = faces.get(f);

    const preferRenderMesh = tessToleranceFactor >= 1;
    const renderMesh = preferRenderMesh ? face.getMesh(rhino.MeshType.Render) || face.getMesh(rhino.MeshType.Default) : null;
    if (renderMesh) {
      const data = fromRhinoMesh(renderMesh);
      if (data && data.indices.length >= 3) {
        records.push(data);
        budget += performance.now() - tFace0;
        if (budget > 12 && onYield) {
          budget = 0;
          await yieldToEventLoop();
        }
        continue;
      }
    }

    const surf = face.underlyingSurface();
    if (!surf) {
      failedFaces++;
      budget += performance.now() - tFace0;
      if (budget > 12 && onYield) {
        budget = 0;
        await yieldToEventLoop();
      }
      continue;
    }

    const loops = face.loops;
    const rings3D = [];
    const innerRings3D = [];
    for (let l = 0; l < loops.count; l++) {
      const loop = loops.get(l);
      const ring = dedupeRing(faceRing3D(brep, loop));
      if (ring.length < 3) continue;
      if (loop.loopType === rhino.BrepLoopType.Inner) innerRings3D.push(ring);
      else rings3D.push(ring);
    }

    let data = null;

    if (rings3D.length && isActuallyPlanar(surf, scale)) {
      data = planarMeshData(surf, rings3D, face.orientationIsReversed, null);
    }

    if (!data) {
      const solver = makeUvSolver(surf, scale);
      const uvHoles = [];
      for (const ring of innerRings3D) {
        const uv = ringToUV(ring, solver);
        if (uv) uvHoles.push(uv);
      }

      if (rings3D.length) {
        const outer = rings3D[0];
        const stride = Math.max(1, Math.floor(outer.length / 56));
        const coarse = [];
        for (let i = 0; i < outer.length; i += stride) coarse.push(outer[i]);
        const uvCoarse = ringToUV(coarse, solver);
        if (uvCoarse && ringOnDomainBoundary(uvCoarse, surf)) {
          data = gridMeshData(surf, uvHoles, face.orientationIsReversed);
        }
      }

      if (!data) {
        const uvRings = [];
        let ok = true;
        for (const ring of rings3D) {
          const uv = ringToUV(ring, solver);
          if (!uv) {
            ok = false;
            break;
          }
          uvRings.push(uv);
        }
        if (!ok || !uvRings.length) {
          const uDom = surf.domain(0);
          const vDom = surf.domain(1);
          const domArea = (uDom[1] - uDom[0]) * (vDom[1] - vDom[0]) || 1;
          const outerArea = uvRings.length ? Math.abs(signedArea2D(uvRings[0])) : 0;
          const singular = outerArea < domArea * 0.03;
          if (singular) {
            data = gridMeshData(surf, uvHoles, face.orientationIsReversed);
          }
        } else {
          const uDom = surf.domain(0);
          const vDom = surf.domain(1);
          const domArea = (uDom[1] - uDom[0]) * (vDom[1] - vDom[0]) || 1;
          const outerArea = Math.abs(signedArea2D(uvRings[0]));
          if (outerArea < domArea * 0.03) {
            data = gridMeshData(surf, uvHoles, face.orientationIsReversed);
          } else {
            const triData = triangulateRings([...uvRings, ...uvHoles]);
            if (triData) data = buildMeshData(surf, triData.pts2D, triData.tris, face.orientationIsReversed);
          }
        }
      }
    }

    if (data && data.indices.length >= 3) {
      records.push(data);
    } else {
      failedFaces++;
      for (const ring of rings3D) linePts.push(...ring);
    }
    budget += performance.now() - tFace0;
    if (budget > 12 && onYield) {
      budget = 0;
      await yieldToEventLoop();
    }
  }

  const geometry = mergeRecords(records, scale);
  const lineGeometry = buildLineGeometry(linePts);
  return { geometry, lineGeometry, faceCount: faces.count, failedFaces, triCount: geometry ? geometry.index.count / 3 : 0 };
}
