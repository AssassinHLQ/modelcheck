import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, statSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const musicDir = resolve(root, 'music');
const backupDir = resolve(root, 'music-original');

const BITRATE = process.env.BITRATE || '128k';

function findFfmpeg() {
  for (const name of ['ffmpeg', 'ffmpeg.exe']) {
    try {
      execFileSync(name, ['-version'], { stdio: 'ignore' });
      return name;
    } catch {}
  }
  const candidates = [
    'C:/Program Files/ffmpeg/bin/ffmpeg.exe',
    'C:/ffmpeg/bin/ffmpeg.exe',
  ];
  const base = 'C:/Users/WY157/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build/bin/ffmpeg.exe';
  if (existsSync(base)) return base;
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

const ffmpeg = findFfmpeg();
if (!ffmpeg) {
  console.error('未找到 ffmpeg，请先安装（winget install Gyan.FFmpeg）');
  process.exit(1);
}

mkdirSync(backupDir, { recursive: true });

const files = readdirSync(musicDir).filter((f) => f.endsWith('.mp4'));
if (!files.length) {
  console.log('music/ 中没有 .mp4 文件');
  process.exit(0);
}

let done = 0;
let fail = 0;
const before = files.reduce((s, f) => s + statSync(join(musicDir, f)).size, 0);

for (const f of files) {
  const src = join(musicDir, f);
  const tmp = join(musicDir, '.tmp-' + f);
  const r = spawnSync(ffmpeg, ['-y', '-i', src, '-c:a', 'aac', '-b:a', BITRATE, '-movflags', '+faststart', '-vn', tmp], { stdio: 'ignore' });
  if (r.status !== 0 || !existsSync(tmp) || statSync(tmp).size <= 0) {
    console.log(`[失败] ${f}`);
    fail++;
    continue;
  }
  if (!existsSync(join(backupDir, f))) copyFileSync(src, join(backupDir, f));
  renameSync(tmp, src);
  done++;
  console.log(`[完成] ${f}`);
}

const after = files.reduce((s, f) => s + statSync(join(musicDir, f)).size, 0);
console.log(`压缩完成：成功 ${done}，失败 ${fail}`);
console.log(`大小：${(before / 1048576).toFixed(1)}MB -> ${(after / 1048576).toFixed(1)}MB（节省 ${(100 - (after / before) * 100).toFixed(0)}%）`);
console.log(`原始文件备份在 music-original/ 文件夹`);
