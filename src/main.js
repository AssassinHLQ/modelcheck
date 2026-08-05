import { ModelViewer } from './viewer.js';
import { createCrosshair } from './crosshair.js';
import { initClickSpark } from './clickSpark.js';
import { initElasticSlider } from './elasticSlider.js';
import { setTessellationQuality } from './brepTessellate.js';
import { load3dm } from './load3dm.js';
import { loadSkp } from './loadSkp.js';
import { loadFbx } from './loadFbx.js';
import { loadGlb, loadGltf } from './loadGlb.js';
import { loadObj } from './loadObj.js';
import { loadStep } from './loadStep.js';
import { loadStl } from './loadStl.js';
import { loadDxf } from './loadDxf.js';
import { loadPly } from './loadPly.js';
import { load3mf } from './load3mf.js';

const SUPPORTED = {
  '3dm': '3dm',
  'skp': 'skp',
  'fbx': 'fbx',
  'glb': 'glb',
  'gltf': 'gltf',
  'obj': 'obj',
  'stp': 'stp',
  'step': 'stp',
  'iges': 'iges',
  'igs': 'iges',
  'brep': 'brep',
  'stl': 'stl',
  'dxf': 'dxf',
  'ply': 'ply',
  '3mf': '3mf',
};
const COMPANION = new Set(['mtl', 'png', 'jpg', 'jpeg', 'bmp']);

const els = {
  viewer: document.getElementById('viewer'),
  fileInput: document.getElementById('fileInput'),
  btnUpload: document.getElementById('btnUpload'),
  btnBuiltin: document.getElementById('btnBuiltin'),
  builtinPanel: document.getElementById('builtinPanel'),
  builtinList: document.getElementById('builtinList'),
  builtinHint: document.getElementById('builtinHint'),
  btnMusic: document.getElementById('btnMusic'),
  musicPanel: document.getElementById('musicPanel'),
  musicList: document.getElementById('musicList'),
  musicHint: document.getElementById('musicHint'),
  modeList: document.getElementById('modeList'),
  modeLoop: document.getElementById('modeLoop'),
  btnViews: document.getElementById('btnViews'),
  viewPanel: document.getElementById('viewPanel'),
  fadeEnabled: document.getElementById('fadeEnabled'),
  fadeIn: document.getElementById('fadeIn'),
  fadeInVal: document.getElementById('fadeInVal'),
  fadeOut: document.getElementById('fadeOut'),
  fadeOutVal: document.getElementById('fadeOutVal'),
  btnPick: document.getElementById('btnPick'),
  btnGrid: document.getElementById('btnGrid'),
  btnAxes: document.getElementById('btnAxes'),
  btnWire: document.getElementById('btnWire'),
  btnReset: document.getElementById('btnReset'),
  btnClear: document.getElementById('btnClear'),
  btnMeasure: document.getElementById('btnMeasure'),
  btnClearMeasure: document.getElementById('btnClearMeasure'),
  btnHideMode: document.getElementById('btnHideMode'),
  btnShowAll: document.getElementById('btnShowAll'),
  modelList: document.getElementById('modelList'),
  sidebarHint: document.getElementById('sidebarHint'),
  modelCount: document.getElementById('modelCount'),
  emptyState: document.getElementById('emptyState'),
  dropOverlay: document.getElementById('dropOverlay'),
  loading: document.getElementById('loading'),
  loadingTitle: document.getElementById('loadingTitle'),
  loadingSub: document.getElementById('loadingSub'),
  loadingBar: document.getElementById('loadingBar'),
  toastWrap: document.getElementById('toastWrap'),
  stats: document.getElementById('stats'),
};

const viewer = new ModelViewer(els.viewer);
const crosshair = createCrosshair(els.viewer);
const entries = new Map();
const hiddenParts = new Map();
let hideSeq = 0;
let wireframeOn = false;
let dragDepth = 0;

function extOf(name) {
  const idx = name.lastIndexOf('.');
  return idx < 0 ? '' : name.slice(idx + 1).toLowerCase();
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  els.toastWrap.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 350);
  }, type === 'error' ? 12000 : 3800);
}

const shownErrors = new Set();
function reportFatal(msg) {
  if (!msg) return;
  const key = String(msg).slice(0, 120);
  if (shownErrors.has(key)) return;
  shownErrors.add(key);
  toast('页面出错：' + key, 'error');
}

window.addEventListener('error', (e) => {
  if (e && e.message && e.filename && e.filename.indexOf('index.html') === -1) return;
  if (e && e.message) reportFatal(e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e && e.reason;
  reportFatal(r && r.message ? r.message : String(r));
});

function showLoading(title, sub) {
  els.loading.hidden = false;
  els.loading.classList.add('show');
  els.loadingTitle.textContent = title;
  els.loadingSub.textContent = sub || '';
  els.loadingBar.style.width = '0';
}

function updateLoading(pct, sub) {
  els.loadingBar.style.width = (pct || 0) + '%';
  if (sub) els.loadingSub.textContent = sub;
}

function hideLoading() {
  els.loading.hidden = true;
  els.loading.classList.remove('show');
}

function fmtChip(ext) {
  const cls =
    {
      '3dm': 'chip-3dm',
      'skp': 'chip-skp',
      'fbx': 'chip-fbx',
      'glb': 'chip-glb',
      'gltf': 'chip-glb',
      'obj': 'chip-obj',
      'stp': 'chip-stp',
      'iges': 'chip-iges',
      'brep': 'chip-stp',
      'stl': 'chip-stl',
      'dxf': 'chip-dxf',
      'ply': 'chip-ply',
      '3mf': 'chip-3mf',
    }[ext] || 'chip-fbx';
  return `<span class="fmt ${cls}">.${ext}</span>`;
}

const FORMAT_DESC = {
  '3dm': 'Rhino 原生格式：曲面、实体与网格',
  'skp': 'SketchUp 模型：组件与材质完整显示',
  'fbx': '通用 3D 交换格式：支持贴图与动画',
  'glb': '现代标准格式：材质贴图效果最佳',
  'gltf': '现代标准格式：材质贴图效果最佳',
  'obj': '经典通用格式：配合 mtl 文件显示贴图',
  'stp': '工业 CAD 格式：实体零件精细显示',
  'step': '工业 CAD 格式：实体零件精细显示',
  'iges': 'CAD 曲面格式：曲线曲面精细显示',
  'igs': 'CAD 曲面格式：曲线曲面精细显示',
  'brep': 'Rhino 实体数据：实时网格化显示',
  'stl': '3D 打印格式：仅表面网格无颜色',
  'dxf': 'CAD 二维线框：线条分层显示',
  'ply': '通用格式：支持网格与彩色点云',
  '3mf': '3D 打印标准：支持彩色与材质',
};

let fmtTipEl = null;
let fmtTipTimer = null;
let fmtTipKey = '';
let fmtTipVisible = false;

function showFormatTip(anchor, ext) {
  const desc = FORMAT_DESC[(ext || '').toLowerCase().replace(/^\./, '')];
  if (!desc) return;
  const key = anchor.textContent.trim();
  if (!fmtTipEl) {
    fmtTipEl = document.createElement('div');
    fmtTipEl.className = 'fmt-tip';
    document.documentElement.appendChild(fmtTipEl);
  }
  if (fmtTipVisible && fmtTipKey === key) {
    clearTimeout(fmtTipTimer);
    fmtTipTimer = setTimeout(hideFormatTip, 3000);
    return;
  }
  fmtTipKey = key;
  const rect = anchor.getBoundingClientRect();
  let left = rect.left + rect.width / 2;
  left = Math.max(100, Math.min(window.innerWidth - 100, left));
  fmtTipEl.style.left = left + 'px';
  fmtTipEl.style.top = rect.bottom + 10 + 'px';
  fmtTipEl.textContent = desc;
  fmtTipEl.classList.remove('hide');
  void fmtTipEl.offsetWidth;
  fmtTipEl.classList.add('show');
  fmtTipVisible = true;
  clearTimeout(fmtTipTimer);
  fmtTipTimer = setTimeout(hideFormatTip, 3000);
}

function hideFormatTip() {
  if (!fmtTipVisible) return;
  fmtTipEl.classList.remove('show');
  fmtTipEl.classList.add('hide');
  fmtTipVisible = false;
  fmtTipTimer = null;
}

document.addEventListener('click', (e) => {
  if (fmtTipVisible && !e.target.closest('.brand .chip')) hideFormatTip();
});

document.querySelectorAll('.brand .chip').forEach((chip) => {
  chip.addEventListener('click', () => showFormatTip(chip, chip.textContent.trim()));
});

function refreshSidebar() {
  els.modelCount.textContent = entries.size;
  els.sidebarHint.style.display = entries.size ? 'none' : '';
  els.emptyState.classList.toggle('hidden-state', entries.size > 0);
  refreshStats();
}

function refreshStats() {
  if (!entries.size) {
    els.stats.hidden = true;
    return;
  }
  let meshes = 0;
  let lines = 0;
  let points = 0;
  let tris = 0;
  for (const entry of entries.values()) {
    meshes += entry.info.stats.meshCount || 0;
    lines += entry.info.stats.lineCount || 0;
    points += entry.info.stats.pointCount || 0;
    tris += Math.round(entry.info.stats.triCount || 0);
  }
  const parts = [`${entries.size} 个模型`];
  if (meshes) parts.push(`${meshes} 个网格`);
  if (lines) parts.push(`${lines} 条曲线`);
  if (points) parts.push(`${points} 个点`);
  if (tris) parts.push(`${tris.toLocaleString()} 个三角面`);
  els.stats.innerHTML = parts.join(' · ');
  els.stats.hidden = false;
}

function addEntry(file, ext, result) {
  const id = viewer.addModel(result.group, { name: file.name });

  const li = document.createElement('li');
  li.className = 'model-item';
  li.dataset.id = id;

  const info = document.createElement('div');
  info.className = 'name';

  const nameDiv = document.createElement('div');
  nameDiv.textContent = file.name;

  const metaParts = [fmtSize(file.size)];
  const s = result.stats || {};
  const bits = [];
  if (s.meshCount) bits.push(`网格 ${s.meshCount}`);
  if (s.lineCount) bits.push(`曲线 ${s.lineCount}`);
  if (s.pointCount) bits.push(`点 ${s.pointCount}`);
  if (s.faceCount) bits.push(`Brep 面 ${s.faceCount}`);
  if (s.triCount) bits.push(`${Math.round(s.triCount).toLocaleString()} 面`);
  if (bits.length) metaParts.push(bits.join('、'));
  if (s.skipped) metaParts.push(`跳过 ${s.skipped}`);
  const metaDiv = document.createElement('div');
  metaDiv.className = 'meta';
  metaDiv.textContent = metaParts.join(' · ');

  info.appendChild(nameDiv);
  info.appendChild(metaDiv);

  const eye = document.createElement('button');
  eye.className = 'icon-btn';
  eye.title = '显示/隐藏';
  eye.textContent = '◇';
  eye.addEventListener('click', (e) => {
    e.stopPropagation();
    const entry = entries.get(id);
    const next = entry.group.visible === false;
    viewer.setVisible(id, next);
    eye.textContent = next ? '◆' : '◇';
    eye.classList.toggle('off', !next);
  });

  const del = document.createElement('button');
  del.className = 'icon-btn del';
  del.title = '移除模型';
  del.textContent = '✕';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    const group = entries.get(id)?.group;
    viewer.removeModel(id);
    entries.delete(id);
    if (group) {
      for (const [hid, item] of [...hiddenParts]) {
        let o = item.obj;
        while (o.parent && o.parent !== viewer.scene) o = o.parent;
        if (o === group) {
          hiddenParts.delete(hid);
          els.modelList.querySelector(`[data-hid="${hid}"]`)?.remove();
        }
      }
    }
    li.remove();
    refreshSidebar();
  });

  li.insertAdjacentHTML('afterbegin', fmtChip(ext));
  li.appendChild(info);
  li.appendChild(eye);
  li.appendChild(del);

  li.addEventListener('click', () => viewer.fitTo(entries.get(id).group));

  els.modelList.appendChild(li);
  entries.set(id, {
    group: result.group,
    info: { name: file.name, ext, size: file.size, stats: s },
  });
  refreshSidebar();
}

async function loadFile(file, fileMap) {
  const ext = extOf(file.name);
  const fmt = SUPPORTED[ext];
  if (!fmt) {
    toast(`不支持的文件类型：${file.name}`, 'error');
    return;
  }
  if (file.size > 100 * 1024 * 1024) {
    toast(`文件较大（${fmtSize(file.size)}），解析可能较慢，请耐心等待`, 'info');
  }

  showLoading(`正在解析 ${file.name}`, '');
  try {
    let result;
    if (fmt === '3dm') {
      const buffer = await file.arrayBuffer();
      result = await load3dm(buffer, (pct) => updateLoading(pct, 'Brep 网格化中（无内嵌网格时实时计算）…'));
    } else if (fmt === 'skp') {
      const buffer = await file.arrayBuffer();
      result = await loadSkp(buffer, (pct, sub) => updateLoading(15 + pct * 0.8, sub || '构建场景网格…'));
      updateLoading(100, '');
    } else if (fmt === 'fbx') {
      const buffer = await file.arrayBuffer();
      updateLoading(40, 'FBX 解析中…');
      result = loadFbx(buffer, fileMap);
    } else if (fmt === 'glb') {
      const buffer = await file.arrayBuffer();
      updateLoading(40, 'GLB 解析中…');
      result = await loadGlb(buffer);
    } else if (fmt === 'gltf') {
      updateLoading(40, 'GLTF 解析中…');
      result = await loadGltf(await file.text(), fileMap);
    } else if (fmt === 'stl') {
      const buffer = await file.arrayBuffer();
      updateLoading(40, 'STL 解析中…');
      result = loadStl(buffer);
    } else if (fmt === 'stp' || fmt === 'iges' || fmt === 'brep') {
      const buffer = await file.arrayBuffer();
      updateLoading(40, 'OpenCascade 引擎解析中…');
      result = await loadStep(buffer, fmt);
    } else if (fmt === 'dxf') {
      updateLoading(40, 'DXF 解析中…');
      result = loadDxf(await file.text());
    } else if (fmt === 'ply') {
      const buffer = await file.arrayBuffer();
      updateLoading(40, 'PLY 解析中…');
      result = loadPly(buffer);
    } else if (fmt === '3mf') {
      const buffer = await file.arrayBuffer();
      updateLoading(40, '3MF 解析中…');
      result = load3mf(buffer);
    } else {
      updateLoading(40, 'OBJ 解析中…');
      result = await loadObj(await file.text(), fileMap);
    }
    addEntry(file, ext, result);
    if (wireframeOn) viewer.setWireframe(true);
    hideLoading();
    toast(`已载入 ${file.name}`, 'ok');
  } catch (err) {
    hideLoading();
    console.error(err);
    toast(`${file.name}：${err.message || '解析失败'}`, 'error');
  }
}

async function handleFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  const companions = new Map();
  const primaries = [];
  let primaryFound = false;
  for (const file of files) {
    const ext = extOf(file.name);
    if (COMPANION.has(ext)) {
      companions.set(file.name.toLowerCase(), file);
    } else {
      primaries.push(file);
      if (SUPPORTED[ext]) primaryFound = true;
    }
  }
  if (!primaryFound && companions.size) {
    toast('贴图/材质文件（.mtl/.png/.jpg）需与 .obj 或 .gltf 一起上传', 'info');
    return;
  }
  for (const file of primaries) {
    await loadFile(file, companions);
  }
}

els.fileInput.addEventListener('change', () => {
  handleFiles(els.fileInput.files);
  els.fileInput.value = '';
});

els.btnUpload.addEventListener('click', () => els.fileInput.click());
els.btnPick.addEventListener('click', () => els.fileInput.click());

els.btnGrid.addEventListener('click', () => {
  const on = els.btnGrid.classList.toggle('active');
  viewer.setGridVisible(on);
});

els.btnAxes.addEventListener('click', () => {
  const on = els.btnAxes.classList.toggle('active');
  viewer.setAxesVisible(on);
});

els.btnWire.addEventListener('click', () => {
  wireframeOn = els.btnWire.classList.toggle('active');
  viewer.setWireframe(wireframeOn);
});

els.btnViews.addEventListener('click', () => {
  if (panelIsOpen(els.viewPanel)) closePanel(els.viewPanel);
  else openPanel(els.viewPanel);
});

els.viewPanel.querySelectorAll('.view-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    viewer.setView(btn.dataset.view);
    closePanel(els.viewPanel);
  });
});

els.btnReset.addEventListener('click', () => viewer.resetView());

function openPanel(panel, render) {
  clearTimeout(panel._closeTimer);
  panel.classList.remove('closing');
  panel.classList.add('show');
  if (render) render();
}

function closePanel(panel) {
  if (!panel.classList.contains('show') || panel.classList.contains('closing')) return;
  panel.classList.add('closing');
  panel._closeTimer = setTimeout(() => {
    panel.classList.remove('closing');
    panel.classList.remove('show');
  }, 180);
}

const panelIsOpen = (panel) => panel.classList.contains('show') && !panel.classList.contains('closing');

els.btnBuiltin.addEventListener('click', () => {
  if (panelIsOpen(els.builtinPanel)) closePanel(els.builtinPanel);
  else openPanel(els.builtinPanel, renderBuiltinList);
});

els.btnMusic.addEventListener('click', () => {
  if (panelIsOpen(els.musicPanel)) closePanel(els.musicPanel);
  else openPanel(els.musicPanel, renderMusicList);
});

const audio = new Audio();
if (typeof window !== 'undefined') window.__audio = audio;
let currentTrack = null;
let musicMode = 'list';

let musicSettings = { enabled: true, fadeIn: 0.5, fadeOut: 0.5 };
try {
  musicSettings = Object.assign(musicSettings, JSON.parse(localStorage.getItem('musicFade') || '{}'));
} catch {}
musicSettings.fadeIn = Math.min(1, Math.max(0, Number(musicSettings.fadeIn) || 0));
musicSettings.fadeOut = Math.min(1, Math.max(0, Number(musicSettings.fadeOut) || 0));

function saveFade() {
  try {
    localStorage.setItem('musicFade', JSON.stringify(musicSettings));
  } catch {}
}

function syncFadeUI() {
  els.fadeEnabled.checked = musicSettings.enabled;
}

initElasticSlider({
  el: els.fadeIn,
  valueEl: els.fadeInVal,
  min: 0,
  max: 1000,
  step: 50,
  defaultValue: Math.round(musicSettings.fadeIn * 1000),
  onChange: (ms) => {
    musicSettings.fadeIn = ms / 1000;
    saveFade();
  },
});

initElasticSlider({
  el: els.fadeOut,
  valueEl: els.fadeOutVal,
  min: 0,
  max: 1000,
  step: 50,
  defaultValue: Math.round(musicSettings.fadeOut * 1000),
  onChange: (ms) => {
    musicSettings.fadeOut = ms / 1000;
    saveFade();
  },
});

els.fadeEnabled.addEventListener('change', () => {
  musicSettings.enabled = els.fadeEnabled.checked;
  saveFade();
});

syncFadeUI();

els.modeList.addEventListener('click', () => {
  musicMode = 'list';
  els.modeList.classList.add('active');
  els.modeLoop.classList.remove('active');
});

els.modeLoop.addEventListener('click', () => {
  musicMode = 'loop';
  els.modeLoop.classList.add('active');
  els.modeList.classList.remove('active');
});

function cleanTrackName(name) {
  return name
    .replace(/\.(mp4|mp3|wav|m4a|ogg|flac)$/i, '')
    .replace(/【[^】]*】/g, '')
    .replace(/_音频$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderMusicList() {
  const tracks = window.BUILTIN_MUSIC || [];
  els.musicList.innerHTML = '';
  if (!tracks.length) {
    els.musicHint.textContent = '暂无背景音乐：把音乐文件放入项目 music/ 文件夹，重新运行 npm run build 后刷新页面';
    els.musicHint.style.display = '';
    return;
  }
  els.musicHint.style.display = 'none';
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'glass-item';
    btn.dataset.name = t.name;
    btn.innerHTML = glassItemHTML(cleanTrackName(t.name), GLASS_COLORS[i % GLASS_COLORS.length], ICON_NOTE);
    if (currentTrack === t.name) btn.classList.add('playing');
    btn.addEventListener('click', () => toggleMusic(t.name));
    els.musicList.appendChild(btn);
  }
}

function toggleMusic(name) {
  if (currentTrack === name) {
    if (audio.paused) resumeTrack();
    else pauseTrack();
    return;
  }
  if (!currentTrack || audio.paused) playTrack(name);
  else switchTrack(name);
}

let preloadAudio = null;
let preloadedFor = null;

function nextTrackName(name) {
  const tracks = window.BUILTIN_MUSIC || [];
  if (!tracks.length) return null;
  const idx = tracks.findIndex((t) => t.name === name);
  if (idx >= 0 && idx < tracks.length - 1) return tracks[idx + 1].name;
  return tracks[0].name;
}

function preloadNext() {
  const next = nextTrackName(currentTrack);
  if (!next) return;
  const url = new URL('music/' + encodeURIComponent(next), window.location.href).href;
  if (!preloadAudio) {
    preloadAudio = new Audio();
    preloadAudio.preload = 'auto';
    if (typeof window !== 'undefined') window.__preloadAudio = preloadAudio;
  }
  if (preloadAudio.src !== url) preloadAudio.src = url;
}

audio.addEventListener('timeupdate', () => {
  if (musicMode !== 'list' || preloadedFor === currentTrack) return;
  if (audio.duration && audio.duration > 0 && audio.currentTime > audio.duration - 25) {
    preloadedFor = currentTrack;
    preloadNext();
  }
});

function playTrack(name, volumeStart) {
  currentTrack = name;
  preloadedFor = null;
  audio.src = new URL('music/' + encodeURIComponent(name), window.location.href).href;
  const fadeIn = musicSettings.enabled && musicSettings.fadeIn > 0;
  if (volumeStart === undefined) volumeStart = fadeIn ? 0 : 1;
  if (volumeStart === 0 && !fadeIn) volumeStart = 1;
  audio.volume = volumeStart;
  audio
    .play()
    .then(() => {
      refreshMusicState();
      toast('正在播放：' + cleanTrackName(name), 'ok');
      if (fadeIn) rampVolume(0, 1, musicSettings.fadeIn, 'smooth');
    })
    .catch((e) => {
      currentTrack = null;
      audio.volume = 1;
      toast('播放失败（浏览器可能不支持该音频格式）：' + e.message, 'error');
      refreshMusicState();
    });
}

function pauseTrack() {
  if (musicSettings.enabled && musicSettings.fadeOut > 0 && !audio.paused) {
    rampVolume(audio.volume, 0, musicSettings.fadeOut, 'smooth', () => {
      audio.pause();
      refreshMusicState();
    });
  } else {
    audio.pause();
    refreshMusicState();
  }
}

function resumeTrack() {
  const fadeIn = musicSettings.enabled && musicSettings.fadeIn > 0;
  audio.volume = fadeIn ? 0 : 1;
  audio
    .play()
    .then(() => {
      refreshMusicState();
      if (fadeIn) rampVolume(0, 1, musicSettings.fadeIn, 'smooth');
    })
    .catch((e) => {
      audio.volume = 1;
      toast('播放失败：' + e.message, 'error');
    });
}

function switchTrack(name) {
  if (musicSettings.enabled && musicSettings.fadeOut > 0 && !audio.paused) {
    rampVolume(audio.volume, 0, musicSettings.fadeOut, 'smooth', () => playTrack(name, 0));
  } else {
    playTrack(name, 0);
  }
}

let fadeToken = 0;

function rampVolume(from, to, seconds, rate, onDone) {
  const token = ++fadeToken;
  const dur = Math.max(0.05, seconds);
  const t0 = performance.now();
  const kOf = (t) => {
    if (rate === 'linear') return t;
    if (rate === 'fast') return t * t;
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  };
  const step = (now) => {
    if (token !== fadeToken) return;
    let t = (now - t0) / 1000 / dur;
    if (t >= 1) t = 1;
    audio.volume = from + (to - from) * kOf(t);
    if (t < 1) requestAnimationFrame(step);
    else if (onDone) onDone();
  };
  requestAnimationFrame(step);
}

audio.addEventListener('ended', () => {
  if (musicSettings.enabled && musicSettings.fadeOut > 0) {
    rampVolume(audio.volume, 0, musicSettings.fadeOut, 'smooth', () => onTrackEnded());
  } else {
    onTrackEnded();
  }
});

function onTrackEnded() {
  if (musicMode === 'loop' && currentTrack) {
    audio.currentTime = 0;
    audio
      .play()
      .then(() => {
        refreshMusicState();
        if (musicSettings.enabled && musicSettings.fadeIn > 0) rampVolume(0, 1, musicSettings.fadeIn, 'smooth');
      })
      .catch(() => {});
    return;
  }
  const next = nextTrackName(currentTrack);
  if (next) {
    playTrack(next, 0);
  } else {
    currentTrack = null;
    audio.volume = 1;
    refreshMusicState();
  }
}

function refreshMusicState() {
  els.musicList.querySelectorAll('.glass-item').forEach((btn) => {
    btn.classList.toggle('playing', btn.dataset.name === currentTrack && !audio.paused);
  });
}

document.addEventListener('click', (e) => {
  if (!els.builtinPanel.contains(e.target) && e.target !== els.btnBuiltin) {
    closePanel(els.builtinPanel);
  }
  if (!els.musicPanel.contains(e.target) && e.target !== els.btnMusic) {
    closePanel(els.musicPanel);
  }
  if (!els.viewPanel.contains(e.target) && e.target !== els.btnViews) {
    closePanel(els.viewPanel);
  }
});

const GLASS_COLORS = ['g-blue', 'g-purple', 'g-red', 'g-indigo', 'g-orange', 'g-green'];

const ICON_CUBE =
  '<svg viewBox="0 0 24 24"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5"/><path d="M12 12v10"/></svg>';
const ICON_FILE =
  '<svg viewBox="0 0 24 24"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/></svg>';
const ICON_SCAN =
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v4.5M12 17.5V22M2 12h4.5M17.5 12H22"/></svg>';
const ICON_NOTE =
  '<svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';

const GLASS_STYLE = {
  '3dm': { color: 'g-purple', icon: ICON_CUBE },
  'skp': { color: 'g-purple', icon: ICON_CUBE },
  'fbx': { color: 'g-blue', icon: ICON_CUBE },
  'glb': { color: 'g-blue', icon: ICON_CUBE },
  'gltf': { color: 'g-blue', icon: ICON_CUBE },
  'obj': { color: 'g-blue', icon: ICON_CUBE },
  'stl': { color: 'g-green', icon: ICON_CUBE },
  '3mf': { color: 'g-green', icon: ICON_CUBE },
  'brep': { color: 'g-red', icon: ICON_CUBE },
  'stp': { color: 'g-orange', icon: ICON_FILE },
  'iges': { color: 'g-orange', icon: ICON_FILE },
  'dxf': { color: 'g-orange', icon: ICON_FILE },
  'ply': { color: 'g-indigo', icon: ICON_SCAN },
};

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function glassItemHTML(name, color, icon) {
  return (
    `<span class="glass-base ${color}"></span>` +
    `<span class="glass-front"><span class="glass-icon">${icon}</span></span>` +
    `<span class="glass-label">${escapeHtml(name)}</span>`
  );
}

function renderBuiltinList() {
  const files = (window.BUILTIN_MODELS || []).filter((f) => SUPPORTED[extOf(f.name)]);
  els.builtinList.innerHTML = '';
  if (!files.length) {
    els.builtinHint.textContent = '暂无内置模型：把模型文件放入项目 models/ 文件夹，重新运行 npm run build 后刷新页面';
    els.builtinHint.style.display = '';
    return;
  }
  els.builtinHint.style.display = 'none';
  for (const f of files) {
    const li = document.createElement('li');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'b-name';
    nameSpan.textContent = f.name;
    const sizeSpan = document.createElement('span');
    sizeSpan.className = 'b-size';
    sizeSpan.textContent = fmtSize(f.size);
    li.appendChild(nameSpan);
    li.appendChild(sizeSpan);
    li.addEventListener('click', () => {
      showFormatTip(extOf(f.name));
      loadBuiltin(f);
    });
    els.builtinList.appendChild(li);
  }
}

async function loadBuiltin(meta) {
  const manifest = window.BUILTIN_MODELS || [];
  const isFileProtocol = location.protocol === 'file:';
  const fetchBytes = async (name) => {
    const entry = manifest.find((x) => x.name === name);
    if (entry && entry.data) {
      const bin = Uint8Array.from(atob(entry.data), (c) => c.charCodeAt(0));
      return bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
    }
    if (isFileProtocol) {
      throw new Error('该模型较大（>3MB），本地双击模式无法读取。请用 npm run dev 或部署到服务器后使用');
    }
    const resp = await fetch(new URL('models/' + encodeURIComponent(name), window.location.href));
    if (!resp.ok) throw new Error('模型文件读取失败：' + name);
    return resp.arrayBuffer();
  };
  const lazyFile = (entry) => ({
    name: entry.name,
    size: entry.size,
    arrayBuffer: () => fetchBytes(entry.name),
    text: async () => new TextDecoder().decode(await fetchBytes(entry.name)),
  });
  const fileMap = new Map();
  for (const e of manifest) {
    if (e.name === meta.name) continue;
    fileMap.set(e.name.toLowerCase(), lazyFile(e));
  }
  await loadFile(lazyFile(meta), fileMap);
}

els.btnClear.addEventListener('click', () => {
  if (!entries.size) return;
  viewer.clear();
  entries.clear();
  els.modelList.innerHTML = '';
  refreshSidebar();
  toast('已清空所有模型', 'info');
});

els.btnMeasure.addEventListener('click', () => {
  const on = !viewer.measureMode;
  if (on && viewer.hideMode) {
    viewer.setHideMode(false);
    els.btnHideMode.classList.remove('active');
    els.btnHideMode.textContent = '隐藏物体';
  }
  viewer.setMeasureMode(on);
  crosshair.setEnabled(on);
  els.btnMeasure.classList.toggle('active', on);
  els.btnMeasure.textContent = on ? '测量中…' : '测量长度';
  if (on) toast('点击模型上的两个点测量距离，右键/再次点击按钮退出', 'info');
});

function refreshModelEyes() {
  els.modelList.querySelectorAll('.model-item').forEach((li) => {
    const entry = entries.get(li.dataset.id);
    const eye = li.querySelector('.icon-btn');
    if (entry && eye) {
      const hidden = entry.group.visible === false;
      eye.textContent = hidden ? '◆' : '◇';
      eye.classList.toggle('off', hidden);
    }
  });
}

viewer._onHideModel = (obj) => {
  let entryObj = obj;
  while (entryObj.parent && entryObj.parent !== viewer.scene) entryObj = entryObj.parent;
  for (const [id, entry] of entries) {
    if (entry.group === entryObj) {
      obj.visible = false;
      refreshModelEyes();
      hideSeq++;
      const hid = 'h' + hideSeq;
      const label = '隐藏' + String(hideSeq).padStart(3, '0');
      const srcName = obj.name || entry.info.name;
      hiddenParts.set(hid, { obj, label });
      appendHiddenPart(hid, label, srcName);
      return;
    }
  }
};

function appendHiddenPart(hid, label, srcName) {
  const li = document.createElement('li');
  li.className = 'model-item hidden-part';
  li.dataset.hid = hid;
  const chip = document.createElement('span');
  chip.className = 'fmt chip-hidden';
  chip.textContent = '隐藏';
  const info = document.createElement('div');
  info.className = 'name';
  const nameDiv = document.createElement('div');
  nameDiv.textContent = label;
  const metaDiv = document.createElement('div');
  metaDiv.className = 'meta';
  metaDiv.textContent = srcName ? '原部件：' + srcName : '已隐藏';
  info.appendChild(nameDiv);
  info.appendChild(metaDiv);
  const eye = document.createElement('button');
  eye.className = 'icon-btn off';
  eye.title = '显示此物体';
  eye.textContent = '◆';
  eye.addEventListener('click', (e) => {
    e.stopPropagation();
    const item = hiddenParts.get(hid);
    if (!item) return;
    item.obj.visible = true;
    hiddenParts.delete(hid);
    li.remove();
  });
  li.addEventListener('click', () => {
    const item = hiddenParts.get(hid);
    if (item) viewer.fitTo(item.obj);
  });
  li.appendChild(chip);
  li.appendChild(info);
  li.appendChild(eye);
  els.modelList.appendChild(li);
}

els.btnHideMode.addEventListener('click', () => {
  const on = !viewer.hideMode;
  if (on && viewer.measureMode) {
    viewer.setMeasureMode(false);
    crosshair.setEnabled(false);
    els.btnMeasure.classList.remove('active');
    els.btnMeasure.textContent = '测量长度';
  }
  viewer.setHideMode(on);
  els.btnHideMode.classList.toggle('active', on);
  els.btnHideMode.textContent = on ? '隐藏中…' : '隐藏物体';
  if (on) toast('点击模型即可隐藏；恢复：模型列表点 ◇/◆ 或「全部显示」', 'info');
});

els.btnShowAll.addEventListener('click', () => {
  const n = viewer.showAllModels();
  hiddenParts.clear();
  els.modelList.querySelectorAll('.hidden-part').forEach((li) => li.remove());
  refreshModelEyes();
});

els.btnClearMeasure.addEventListener('click', () => {
  viewer.clearMeasurements();
  toast('已清除所有测量', 'info');
});

const QUALITY_LABEL = { 1: '低', 0.5: '中', 0.2: '高' };
const QUALITY_NOTE = {
  1: '低（优先使用文件自带的渲染网格，无渲染网格时按 1% 精度网格化）',
  0.5: '中（按 0.5% 精度实时网格化）',
  0.2: '高（按 0.2% 精度实时网格化）',
};
let tessQuality = 1;
try {
  tessQuality = parseFloat(localStorage.getItem('tessQuality') || '1') || 1;
} catch {}
if (![1, 0.5, 0.2].includes(tessQuality)) tessQuality = 1;
setTessellationQuality(tessQuality);

function applyQuality(q) {
  tessQuality = q;
  setTessellationQuality(q);
  try {
    localStorage.setItem('tessQuality', String(q));
  } catch {}
  document.querySelectorAll('.quality-btn').forEach((btn) => {
    btn.classList.toggle('active', parseFloat(btn.dataset.q) === q);
  });
}

document.querySelectorAll('.quality-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    applyQuality(parseFloat(btn.dataset.q));
    toast(`显示精度已设为「${QUALITY_LABEL[btn.dataset.q]}」：${QUALITY_NOTE[btn.dataset.q]}（对之后加载的模型生效，已加载的模型请重新打开）`, 'info');
  });
});

applyQuality(tessQuality);

window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
  e.preventDefault();
  dragDepth++;
  els.dropOverlay.classList.add('show');
});

window.addEventListener('dragover', (e) => {
  if ([...e.dataTransfer.types].includes('Files')) e.preventDefault();
});

window.addEventListener('dragleave', (e) => {
  if (![...e.dataTransfer.types].includes('Files')) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) els.dropOverlay.classList.remove('show');
});

window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  els.dropOverlay.classList.remove('show');
  handleFiles(e.dataTransfer.files);
});

refreshSidebar();

initClickSpark({
  sparkColor: '#f9a8d4',
  sparkSize: 12,
  sparkRadius: 20,
  sparkCount: 10,
  duration: 450,
  easing: 'ease-out',
});
