# Rhino 转换服务（原型）

服务器装有 Rhino 时，把上传的 **SolidWorks (.sldprt / .sldasm)** 等格式自动转换为 **STEP** 并返回下载。

## 原理

Rhino（Windows 版）内置 SolidWorks 文件导入器（Parasolid 内核授权），本服务用 Rhino 命令行批量执行：
`Open 输入文件 → Export 输出 .step → 退出`，一次只跑一个任务（Rhino 单实例串行队列）。

> 授权提示：自用/内部部署合规；**对外公开服务**请先与 McNeel 确认授权条款（尤其 Parasolid 面向第三方的使用范围）。免费公开服务同样需要确认。

## 使用

```bash
npm start                    # 默认端口 8787，打开 http://localhost:8787 上传文件
# 或指定端口 / Rhino 路径 / 测试模式
PORT=9000 RHINO_EXE="C:\Program Files\Rhino 8\System\Rhino.exe" npm start
CONVERTER=mock npm start     # 测试模式：不调用 Rhino，返回样例 STEP（用于开发调试）
```

支持扩展名：`.sldprt .sldasm .3dm .dwg .dxf .iges .igs .stp .step .sat`（输出统一为 `.step`）

API：
- `POST /convert`（multipart，字段名 `file`）→ `{ ok, id }`
- `GET /status/:id` → `{ state: queued|converting|done|error, outputName, size, error }`
- `GET /download/:id` → 下载生成的 .step
- `GET /health` → 服务与 Rhino 状态

## 重要：运行环境要求

Rhino 是图形程序，自动化转换对运行环境有硬性要求：

1. **必须在交互式桌面会话中运行**（普通登录用户直接 `npm start`），不能在系统服务/远程会话（如某些 SSH、计划任务"不管用户是否登录"）里跑——那种环境下 Rhino 会启动但脚本不执行（实测现象：进程挂起、无输出）。
2. 服务器上的 Rhino 需要**已正常手动启动过一次**（完成插件加载/许可激活）。
3. 需要 **Windows 版 Rhino 8**（含 SolidWorks 导入器与 STEP 导出）。
4. 每个转换任务最多等 5 分钟，超时即报错；转换日志在 `jobs/<id>/convert.log`。
5. 生产级无头部署请改用 McNeel 官方 **Rhino.Compute**（专为服务器设计）。

## 文件

- `server.js` — HTTP 服务：上传、队列、状态轮询、下载、内置页面
- `convert.js` — Rhino 命令行调用（串行、超时、日志）
- `tools/`（上级目录）— 单机手动批量转换脚本（RhinoPython / PowerShell）
