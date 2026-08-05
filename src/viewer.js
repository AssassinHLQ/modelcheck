import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

export function formatMeasure(v) {
  if (!Number.isFinite(v)) return '—';
  if (v >= 1000) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

export class ModelViewer {
  constructor(container) {
    this.container = container;
    this.models = new Map();
    this._seq = 0;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf6f1fb);

    this.camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 1e-4, 1e12);
    this.camera.position.set(5, 4, 8);
    this.perspCamera = this.camera;
    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1e-4, 1e12);
    this.orthoHalfH = 1;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.zoomToCursor = true;
    this._isRotated = () => window.matchMedia('(orientation: portrait) and (pointer: coarse)').matches;
    this.controls.clientToLocal = (x, y) => {
      if (!this._isRotated()) return { x, y };
      const r = this.renderer.domElement.getBoundingClientRect();
      return { x: y - r.top, y: r.left + r.width - x };
    };
    this.controls.getEventRect = () => {
      if (!this._isRotated()) return this.renderer.domElement.getBoundingClientRect();
      const r = this.renderer.domElement.getBoundingClientRect();
      return { left: 0, top: 0, width: r.height, height: r.width, right: r.height, bottom: r.width };
    };

    this._lastTapT = 0;
    this._lastTapX = 0;
    this._lastTapY = 0;
    this._panMode = false;
    this._panArmed = false;
    this._panMoved = false;
    this._panStartX = 0;
    this._panStartY = 0;
    const el = this.renderer.domElement;
    this._enterPanMode = (e) => {
      this._panMode = true;
      this._panMoved = false;
      this._panStartX = e.clientX;
      this._panStartY = e.clientY;
      try {
        this.controls.enabled = false;
        this.controls._state = -1;
        if (this.controls._pointers) this.controls._pointers.length = 0;
        el.releasePointerCapture(e.pointerId);
      } catch {}
    };
    this._touchDown = (e) => {
      if (e.pointerType !== 'touch') return;
      if (this.measureMode) {
        this._lastTapT = 0;
        return;
      }
      if (this._panArmed) {
        this._panArmed = false;
        this._enterPanMode(e);
        return;
      }
      const now = performance.now();
      const d = Math.hypot(e.clientX - this._lastTapX, e.clientY - this._lastTapY);
      if (now - this._lastTapT < 350 && d < 40) {
        this._enterPanMode(e);
        return;
      }
      this._lastTapT = now;
      this._lastTapX = e.clientX;
      this._lastTapY = e.clientY;
    };
    this._touchMove = (e) => {
      if (!this._panMode) return;
      let dx = e.clientX - this._panStartX;
      let dy = e.clientY - this._panStartY;
      if (this._isRotated()) {
        const t = dx;
        dx = dy;
        dy = -t;
      }
      if (Math.abs(dx) + Math.abs(dy) > 1) this._panMoved = true;
      this._panBy(dx, dy);
      this._panStartX = e.clientX;
      this._panStartY = e.clientY;
    };
    this._touchUp = () => {
      if (!this._panMode) return;
      this._panMode = false;
      this.controls.enabled = true;
      try {
        this.controls._state = -1;
      } catch {}
      if (!this._panMoved) this._panArmed = true;
      this._panMoved = false;
      this._lastTapT = 0;
    };
    el.addEventListener('pointerdown', this._touchDown);
    window.addEventListener('pointermove', this._touchMove);
    window.addEventListener('pointerup', this._touchUp);
    window.addEventListener('pointercancel', this._touchUp);

    this.keys = new Set();
    this._keydown = (e) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(e.code)) {
        this.keys.add(e.code);
        e.preventDefault();
      }
    };
    this._keyup = (e) => this.keys.delete(e.code);
    window.addEventListener('keydown', this._keydown);
    window.addEventListener('keyup', this._keyup);
    this.clock = new THREE.Clock();

    this.hemi = new THREE.HemisphereLight(0xdfe9ff, 0x2a3040, 0.9);
    this.scene.add(this.hemi);
    this.dir = new THREE.DirectionalLight(0xffffff, 1.4);
    this.dir.position.set(10, 20, 8);
    this.scene.add(this.dir);
    this.amb = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(this.amb);

    if (typeof window !== 'undefined') window.__viewer = this;

    this.grid = new THREE.GridHelper(10, 10, 0xd8c8ee, 0xefe5f8);
    this.scene.add(this.grid);

    this.axes = new THREE.AxesHelper(1);
    this.axes.visible = false;
    this.scene.add(this.axes);

    this.measureGroup = new THREE.Group();
    this.measureGroup.name = 'measurements';
    this.scene.add(this.measureGroup);
    this.measureMode = false;
    this.measurePoints = [];
    this.hideMode = false;
    this.raycaster = new THREE.Raycaster();
    this._measureClick = (e) => this._handleMeasureClick(e);
    this._hideClick = (e) => this._handleHideClick(e);
    this._onHideModel = null;

    this._ro = new ResizeObserver(() => this._onResize());
    this._ro.observe(container);
    this.renderer.setAnimationLoop(() => {
      this._moveWithKeys();
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  _panBy(dx, dy) {
    const el = this.renderer.domElement;
    let pxScale;
    if (this.camera.isOrthographicCamera) {
      pxScale = (2 * this.orthoHalfH) / el.clientHeight;
    } else {
      const d = this.camera.position.distanceTo(this.controls.target);
      pxScale = (2 * d * Math.tan((this.camera.fov * Math.PI) / 360)) / el.clientHeight;
    }
    const off = new THREE.Vector3();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1).normalize();
    off.addScaledVector(right, -dx * pxScale);
    off.addScaledVector(up, dy * pxScale);
    this.camera.position.add(off);
    this.controls.target.add(off);
  }

  _moveWithKeys() {
    if (!this.keys.size) return;
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-8) forward.set(0, 0, -1);
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const move = new THREE.Vector3();
    if (this.keys.has('KeyW')) move.add(forward);
    if (this.keys.has('KeyS')) move.sub(forward);
    if (this.keys.has('KeyD')) move.add(right);
    if (this.keys.has('KeyA')) move.sub(right);
    if (this.keys.has('KeyE')) move.y += 1;
    if (this.keys.has('KeyQ')) move.y -= 1;
    if (!move.lengthSq()) return;
    const dist = this.camera.position.distanceTo(this.controls.target);
    move.normalize().multiplyScalar(dist * 1.2 * dt);
    this.camera.position.add(move);
    this.controls.target.add(move);
  }

  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.perspCamera.aspect = w / h;
    this.perspCamera.updateProjectionMatrix();
    if (this.camera === this.orthoCamera) {
      this.orthoCamera.left = -this.orthoHalfH * (w / h);
      this.orthoCamera.right = this.orthoHalfH * (w / h);
      this.orthoCamera.top = this.orthoHalfH;
      this.orthoCamera.bottom = -this.orthoHalfH;
      this.orthoCamera.updateProjectionMatrix();
    }
    this.renderer.setSize(w, h);
  }

  _useOrtho() {
    if (this.camera === this.orthoCamera) return;
    const dist = Math.max(this.camera.position.distanceTo(this.controls.target), 1e-9);
    this.orthoHalfH = dist * Math.tan((this.perspCamera.fov * Math.PI) / 360);
    const aspect = this.perspCamera.aspect || 1;
    this.orthoCamera.left = -this.orthoHalfH * aspect;
    this.orthoCamera.right = this.orthoHalfH * aspect;
    this.orthoCamera.top = this.orthoHalfH;
    this.orthoCamera.bottom = -this.orthoHalfH;
    this.orthoCamera.near = this.perspCamera.near;
    this.orthoCamera.far = this.perspCamera.far;
    this.orthoCamera.up.copy(this.perspCamera.up);
    this.orthoCamera.position.copy(this.perspCamera.position);
    this.orthoCamera.quaternion.copy(this.perspCamera.quaternion);
    this.orthoCamera.updateProjectionMatrix();
    this.camera = this.orthoCamera;
    this.controls.object = this.orthoCamera;
  }

  _usePerspective() {
    if (this.camera === this.perspCamera) return;
    this.camera = this.perspCamera;
    this.controls.object = this.perspCamera;
  }

  setView(name) {
    const center = this.controls.target.clone();
    const dist = Math.max(this.camera.position.distanceTo(center), this._fitRadius || 1);
    if (name !== 'default') this._useOrtho();
    else this._usePerspective();
    if (name === 'default') {
      this.resetView();
      return;
    }
    const pos = center.clone();
    const up = new THREE.Vector3(0, 1, 0);
    switch (name) {
      case 'top':
        pos.y += dist;
        up.set(0, 0, -1);
        break;
      case 'bottom':
        pos.y -= dist;
        up.set(0, 0, 1);
        break;
      case 'front':
        pos.z += dist;
        break;
      case 'back':
        pos.z -= dist;
        break;
      case 'left':
        pos.x -= dist;
        break;
      case 'right':
        pos.x += dist;
        break;
      default:
        return;
    }
    this.camera.position.copy(pos);
    this.camera.up.copy(up);
    this.camera.lookAt(center);
    this.controls.update();
  }

  addModel(group, info) {
    const id = 'm' + ++this._seq;
    group.userData.modelId = id;
    group.userData.modelName = info.name;
    this.scene.add(group);
    this.models.set(id, { id, group, info });
    this.fitTo(group);
    return id;
  }

  removeModel(id) {
    const entry = this.models.get(id);
    if (!entry) return;
    this.scene.remove(entry.group);
    entry.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
    this.models.delete(id);
    this._fitAllIfAny();
  }

  clear() {
    for (const id of [...this.models.keys()]) this.removeModel(id);
  }

  setVisible(id, visible) {
    const entry = this.models.get(id);
    if (entry) entry.group.visible = visible;
  }

  setWireframe(on) {
    for (const { group } of this.models.values()) {
      group.traverse((o) => {
        if (o.isMesh || o.isLine) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) if (m && m.wireframe !== undefined) m.wireframe = on;
        }
      });
    }
  }

  setGridVisible(on) {
    this.grid.visible = on;
    this._applyGridSize();
  }

  setAxesVisible(on) {
    this.axes.visible = on;
    this._applyAxesSize();
  }

  setMeasureMode(on) {
    this.measureMode = on;
    this.renderer.domElement.style.cursor = on ? 'crosshair' : '';
    if (on) this.renderer.domElement.addEventListener('click', this._measureClick);
    else this.renderer.domElement.removeEventListener('click', this._measureClick);
    if (!on) this.measurePoints = [];
  }

  setHideMode(on) {
    this.hideMode = on;
    this.renderer.domElement.style.cursor = on ? 'pointer' : '';
    if (on) this.renderer.domElement.addEventListener('click', this._hideClick);
    else this.renderer.domElement.removeEventListener('click', this._hideClick);
  }

  showAllModels() {
    let count = 0;
    for (const { group } of this.models.values()) {
      group.traverse((o) => {
        if (!o.visible) count++;
        o.visible = true;
      });
    }
    return count;
  }

  _handleHideClick(e) {
    if (!this.hideMode) return;
    this.raycaster.setFromCamera(this._ndcFromClient(e.clientX, e.clientY), this.camera);
    const hits = this.raycaster.intersectObjects(this._measureTargets(), false);
    if (!hits.length) return;
    let obj = hits[0].object;
    while (obj.parent && obj.parent !== this.scene) {
      if (obj.parent.parent === this.scene) break;
      obj = obj.parent;
    }
    if (this._onHideModel) this._onHideModel(obj);
  }

  clearMeasurements() {
    while (this.measureGroup.children.length) {
      const child = this.measureGroup.children.pop();
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    }
    this.measurePoints = [];
  }

  _measureTargets() {
    const targets = [];
    this.scene.traverse((o) => {
      if (!o.visible) return;
      if (o === this.measureGroup || o === this.grid || o === this.axes) return;
      if (o.isMesh || o.isLine || o.isPoints) targets.push(o);
    });
    return targets;
  }

  _ndcFromClient(cx, cy) {
    const r = this.renderer.domElement.getBoundingClientRect();
    if (this._isRotated()) {
      const lx = cy - r.top;
      const ly = r.left + r.width - cx;
      return new THREE.Vector2((lx / r.height) * 2 - 1, -(ly / r.width) * 2 + 1);
    }
    return new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  }

  _handleMeasureClick(e) {
    if (!this.measureMode) return;
    this.raycaster.setFromCamera(this._ndcFromClient(e.clientX, e.clientY), this.camera);
    const hits = this.raycaster.intersectObjects(this._measureTargets(), false);
    if (!hits.length) return;
    this._addMeasurePoint(hits[0].point.clone());
  }

  _addMeasurePoint(point) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xf472b6 });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 12), mat);
    sphere.position.copy(point);
    const radius = this._fitRadius ? Math.max(this._fitRadius * 0.006, 1e-6) : 1;
    sphere.scale.setScalar(radius);
    this.measureGroup.add(sphere);
    this.measurePoints.push(point);
    if (this.measurePoints.length >= 2) {
      const p1 = this.measurePoints[this.measurePoints.length - 2];
      const p2 = this.measurePoints[this.measurePoints.length - 1];
      const dist = p1.distanceTo(p2);
      const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf472b6 }));
      this.measureGroup.add(line);
      const label = this._makeMeasureLabel(dist, radius);
      label.position.copy(p1).add(p2).multiplyScalar(0.5);
      label.position.y += radius * 2.2;
      this.measureGroup.add(label);
    }
  }

  _makeMeasureLabel(dist, radius) {
    const text = formatMeasure(dist);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 30px "Segoe UI", "Microsoft YaHei", sans-serif';
    const w = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.roundRect(4, 8, w + 24, 44, 12);
    ctx.fill();
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#b02e6e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, 32);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    const scale = Math.max(radius * 6, 0.001);
    sprite.scale.set(scale * 3.2, scale * 0.8, 1);
    return sprite;
  }

  _sceneExtent() {
    const box = new THREE.Box3();
    for (const { group } of this.models.values()) {
      if (group.visible) box.expandByObject(group);
    }
    return box.isEmpty() ? null : box;
  }

  fitTo(object) {
    const box = new THREE.Box3().setFromObject(object);
    this._fitBox(box);
  }

  resetView() {
    const box = this._sceneExtent();
    if (!box) return;
    this._fitBox(box);
  }

  _fitBox(box) {
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(1e-9, size.length() / 2);

    const offset = this.camera.position.clone().sub(center);
    if (offset.lengthSq() < 1e-12) offset.set(1, 0.7, 1);
    offset.normalize().multiplyScalar(radius * 2.6);

    this.camera.position.copy(center).add(offset);
    this.controls.target.copy(center);
    this.controls.minDistance = Math.max(1e-9, radius * 1e-4);
    this.controls.maxDistance = radius * 1e6;
    this.controls.update();
    this._fitCenter = center.clone();
    this._fitRadius = radius;

    this._applyGridSize();
    this._applyAxesSize();
  }

  _applyGridSize() {
    const c = this._fitCenter;
    const r = this._fitRadius;
    if (!c || !r || !this.grid.visible) return;
    const s = Math.pow(10, Math.floor(Math.log10(Math.max(r, 1e-6))));
    this.grid.position.set(c.x, 0, c.z);
    this.grid.scale.set(s, 1, s);
  }

  _applyAxesSize() {
    const c = this._fitCenter;
    const r = this._fitRadius;
    if (!c || !r || !this.axes.visible) return;
    this.axes.position.copy(c);
    this.axes.scale.setScalar(r * 1.2);
  }

  _fitAllIfAny() {
    if (this.models.size) this.resetView();
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.clear();
    this._ro.disconnect();
    window.removeEventListener('keydown', this._keydown);
    window.removeEventListener('keyup', this._keyup);
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
