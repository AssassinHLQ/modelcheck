把模型文件放入本文件夹，然后重新运行 npm run build（开发模式则重启 npm run dev）。
支持：.3dm .skp .fbx .glb .gltf .obj .stp .step .iges .igs .brep .stl .dxf .ply .3mf
（.mtl / .png / .jpg 等附件文件与主模型一起放入，会自动匹配）
小于 3MB 的模型会内嵌进网页，双击 dist/index.html 也能直接加载；更大的模型需要部署到服务器。
