import { spawn } from 'node:child_process';
import { existsSync, statSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LAUNCHER = join(HERE, 'launch-rhino-hidden.ps1');

const RHINO_CANDIDATES = [
  'C:\\Program Files\\Rhino 8\\System\\Rhino.exe',
  'C:\\Program Files\\Rhino 7\\System\\Rhino.exe',
  'C:\\Program Files\\Rhino 6\\System\\Rhino.exe',
];

export function findRhino() {
  if (process.env.RHINO_EXE && existsSync(process.env.RHINO_EXE)) return process.env.RHINO_EXE;
  for (const p of RHINO_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return null;
}

const TIMEOUT_ERROR =
  'Rhino 未在超时时间内完成转换。请确认：服务器运行在交互式桌面会话中（非系统服务会话）、Rhino 已正常启动过一次、且已安装 SolidWorks 导入插件';

function waitExit(child, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      resolve({ code: 124, timedOut: true });
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, error: '启动进程失败：' + e.message });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1 });
    });
  });
}

export function convertWithRhino(inputPath, outputPath, { timeoutMs = 300000, logFile = null, visibility = 'hidden' } = {}) {
  return new Promise(async (resolve) => {
    const rhino = findRhino();
    if (!rhino) {
      resolve({ ok: false, error: '未找到 Rhino，请安装 Rhino 8 或设置环境变量 RHINO_EXE' });
      return;
    }
    if (/\s/.test(inputPath) || /\s/.test(outputPath)) {
      resolve({ ok: false, error: '路径含空格时请配置 RHINO_EXE 与工作目录后重试（当前 Rhino 命令行参数兼容性限制）' });
      return;
    }

    const script = `-_Open "${inputPath}" _-Enter -_SelAll _-Enter -_Export "${outputPath}" _-Enter -_Exit`;
    const timeoutSec = Math.max(10, Math.ceil(timeoutMs / 1000));
    const runOnce = async (mode) => {
      let child;
      let modeLabel;
      if (mode === 'hidden' || mode === 'minimized') {
        const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', LAUNCHER, '-RhinoExe', rhino, '-RunScript', script, '-TimeoutSec', String(timeoutSec)];
        if (mode === 'minimized') args.push('-Minimized');
        child = spawn('powershell.exe', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        modeLabel = mode === 'hidden' ? '隐藏桌面' : '最小化窗口';
      } else {
        child = spawn(rhino, ['-nosplash', `-runscript="${script}"`], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        modeLabel = '普通窗口';
      }
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      const { code, timedOut, error } = await waitExit(child, timeoutMs + 15000);
      return { code, timedOut, error, stdout, stderr, modeLabel };
    };

    const useModes = visibility === 'normal' ? ['normal'] : visibility === 'minimized' ? ['minimized'] : ['hidden', 'minimized'];
    let attempt = 0;
    for (const mode of useModes) {
      attempt++;
      const r = await runOnce(mode);
      if (logFile) {
        try {
          appendFileSync(logFile, `attempt=${attempt} mode=${r.modeLabel} exit=${r.code}\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}\n`);
        } catch {}
      }
      if (r.error) {
        resolve({ ok: false, error: r.error });
        return;
      }
      if (r.code === 2 && mode === 'hidden' && useModes.length > 1) {
        continue;
      }
      if (r.timedOut || r.code === 124) {
        resolve({ ok: false, error: TIMEOUT_ERROR });
        return;
      }
      if (existsSync(outputPath) && statSync(outputPath).size > 0) {
        resolve({ ok: true, outputPath });
        return;
      }
      resolve({ ok: false, error: `Rhino 已退出（code=${r.code}，窗口模式：${r.modeLabel}）但未生成输出文件。请查看 jobs/<id>/convert.log` });
      return;
    }
    resolve({ ok: false, error: '未知错误' });
  });
}
