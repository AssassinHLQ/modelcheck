# 鲁伊专用模型查看网站

纯前端 3D 模型查看网站，支持 **14 种格式**：Rhino (.3dm)、SketchUp (.skp)、FBX、GLB/GLTF、OBJ、STEP/IGES/BREP、STL、DXF、PLY、3MF。

所有解析与渲染都在浏览器本地完成，**文件不会上传到任何服务器**。

## 功能特性

- **上传**：拖拽或点击上传，多模型同时载入、多选文件
- **视图**：六向正交视图（顶 / 底 / 左 / 右 / 前 / 后）+ 默认透视视图，切换不跳变；缩放跟随鼠标
- **操作**：左键旋转、右键平移、滚轮缩放、**WASD 移动、E/Q 升降**（速度随视距自适应）
- **测量长度**：侧栏进入测量模式，点击模型两点显示距离（可连续测量、一键清除）
- **显示精度**：低（优先用文件自带的渲染网格，无则 1% 精度）/ 中（0.5% 强制网格化）/ 高（0.2% 强制网格化）
- **工具栏**：上传模型、内置模型、背景音乐、视图、网格、坐标轴、线框、重置视角、清空
- **侧边栏**：模型列表（名称 / 大小 / 面数），单独显示隐藏、删除；测量、显示精度设置
- **背景音乐**：内置曲库，列表播放 / 单曲循环，淡入淡出（0-1000ms），切歌预加载不卡顿
- **细节**：点击火花动效（左键粉色、右键淡蓝，拖动带火花拖尾）、加载进度、错误提示

## 格式支持说明

| 格式 | 渲染方式 | 说明 |
| --- | --- | --- |
| `.3dm` | rhino3dm（官方 OpenNURBS 引擎） | 网格对象完整渲染；Brep 按显示精度设置：低=优先文件内嵌渲染网格，中/高=实时三角化；支持材质颜色与透明度、点云颜色、顶点色；按图层/材质着色（**注**：rhino3dm.js 官方库未暴露纹理读取 API，.3dm 内嵌贴图无法显示） |
| `.skp` | OpenSKP（开源解析器） | 支持 SketchUp 2013–2020（MFC）与 2021+（VFF）格式；组件 / 群组实例化完整展开，按面材质着色（纹理图暂以底色代替） |
| `.fbx` | three.js FBXLoader | 支持 FBX 7.x 二进制与 ASCII；**内嵌贴图直接显示**，外置贴图把 .fbx 与贴图文件一起拖入自动匹配 |
| `.glb / .gltf` | three.js GLTFLoader | 完整 PBR 材质、贴图、透明度、多节点层级；.gltf 的 .bin 与贴图文件可一并拖入 |
| `.obj` | three.js OBJLoader + MTLLoader | 支持 .mtl 材质与贴图；.obj/.mtl/.png 一起拖入自动匹配 |
| `.stp / .step / .iges / .igs / .brep` | OpenCascade（occt-import-js，WASM） | CAD 交换格式（SolidWorks / CATIA / NX / Fusion 均可导出）；B-rep 实体实时网格化，支持实体颜色 |
| `.stl` | three.js STLLoader | 二进制与 ASCII 均支持 |
| `.dxf` | 内置解析器 | AutoCAD 交换格式：LINE / LWPOLYLINE / POLYLINE / CIRCLE / ARC / ELLIPSE / POINT / 3DFACE / MESH / INSERT（图块），按图层颜色渲染（文字/标注/填充暂不支持） |
| `.ply` | three.js PLYLoader | 网格与点云均支持（点云带顶点颜色） |
| `.3mf` | three.js 3MFLoader | 3D 打印格式，支持颜色与材质 |

## 内置模型系统

把模型文件放进项目根目录 `models/` 文件夹，运行 `npm run assets`（或重新 `npm run build`）后：

- 访问者打开网站**不会自动加载**内置模型
- 点击工具栏「内置模型」按钮展开列表，点击某个模型**才加载**
- 小于 3MB 的模型会内嵌进网页（双击 dist/index.html 也能加载）；更大的模型需部署到服务器
- `.obj/.gltf` 的附件（.mtl/.png/.jpg）与主文件放同一文件夹即可自动匹配

## 背景音乐系统

把音乐文件（.mp4/.mp3 等）放进项目根目录 `music/` 文件夹，运行 `npm run assets` 后：

- 工具栏「背景音乐」展开曲目列表（毛玻璃卡片）选择播放
- 列表播放（播完自动下一首，最后一首回到第一首）/ 单曲循环
- 淡入淡出开关 + 0-1000ms 调节（弹性滑杆），曲目音量可由文件本身控制
- 列表模式下快结束时**自动预加载下一首**，切歌不卡顿

## 构建与部署

需要 Node.js 18+。

```bash
npm install

npm run dev          # 本地开发 http://localhost:5173
npm run build        # 完整构建（引擎内嵌，可双击 dist/index.html 使用）
npm run build:local  # 本地双击版：去掉重复引擎文件，dist 更小（约 32MB）
npm run build:server # 服务器部署版：引擎走独立文件，index.html 仅 0.8MB（约 37MB）
npm run assets       # 快速同步：更新 models/ music/ 等资源到 dist（几秒钟）
npm run compress-music          # 音乐压缩（默认 128k，可用 BITRATE=96k 等）
```

- **本地分发**：`build:local` 后把 `dist/` 文件夹发给对方，双击 index.html 即用
- **服务器部署**：`build:server` 后上传整个 `dist/` 文件夹到任意静态托管（Netlify / GitHub Pages / 宝塔 / Nginx 等），Netlify 等自动 gzip/brotli 压缩，线上首屏传输仅约 2-3MB
- **GitHub Pages 自动部署**：已配置 `.github/workflows/deploy.yml`，push 到 main 分支自动构建发布（Settings → Pages → Source 选 GitHub Actions）

## 关于 SolidWorks 与 Blender 原生格式

- **`.sldprt / .sldasm`（SolidWorks 原生格式）**：私有闭源格式，没有第三方库能直接解析。Rhino（Windows 版）能打开它，是因为内置了西门子 Parasolid 内核（商业授权）。两种实用路径：
  1. SolidWorks 内：另存为 STEP (.stp) 或 IGES (.igs)，直接拖入查看器
  2. 已装 Rhino：用 `tools/rhino-solidworks-to-step.py`（Rhino 8 内运行，批量转 .sldprt/.sldasm → .step）
- **`.blend`（Blender 原生格式）**：格式公开但无成熟 JS 解析器。Blender 导出 glTF 2.0 (.glb) 即可带完整材质贴图
- **服务器批量转换**（可选）：`converter-server/` 是自建 Rhino 转换服务原型（上传 SolidWorks 文件 → 服务器转 STEP → 返回下载），详见其目录内 README

## 致谢

- [occt-import-js](https://github.com/kovacsv/occt-import-js)（OpenCascade WASM，LGPL-2.1）——STEP/IGES/BREP 解析引擎
- [rhino3dm](https://www.npmjs.com/package/rhino3dm)（MIT）——.3dm 解析引擎
- [openskp](https://www.npmjs.com/package/openskp)（MIT）——.skp 解析引擎
- [three.js](https://threejs.org/)（MIT）——WebGL 渲染
