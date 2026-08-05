import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, createReadStream, existsSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertWithRhino, findRhino } from './convert.js';

const JOBS_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'jobs');
mkdirSync(JOBS_DIR, { recursive: true });

const MAX_UPLOAD = 300 * 1024 * 1024;
const PORT = process.env.PORT || 8787;
const CONVERTER = (process.env.CONVERTER || 'rhino').toLowerCase();
const CONVERT_TIMEOUT_MS = parseInt(process.env.CONVERT_TIMEOUT_MS || '300000', 10);
const CONVERT_WINDOW = (process.env.CONVERT_WINDOW || 'hidden').toLowerCase();
const RHINO_AVAILABLE = !!findRhino();

const ALLOWED_EXT = new Set([
  '.sldprt', '.sldasm', '.3dm', '.dwg', '.dxf', '.iges', '.igs', '.stp', '.step', '.sat',
]);

const jobs = new Map();
const queue = [];
let workerBusy = false;

function newJob(id, fileName, inputPath) {
  const job = {
    id,
    fileName,
    inputPath,
    state: 'queued',
    error: null,
    outputName: null,
    outputPath: null,
    size: 0,
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  queue.push(job);
  pump();
  return job;
}

async function pump() {
  if (workerBusy) return;
  const job = queue.shift();
  if (!job) return;
  workerBusy = true;
  try {
    job.state = 'converting';
    const outPath = join(JOBS_DIR, job.id, 'output.step');
    const logPath = join(JOBS_DIR, job.id, 'convert.log');
    let result;
    if (CONVERTER === 'mock') {
      await new Promise((r) => setTimeout(r, 800));
      const sample = join(fileURLToPath(new URL('.', import.meta.url)), 'sample-output.step');
      if (existsSync(sample)) {
        writeFileSync(outPath, readFileSync(sample));
        result = { ok: true, outputPath: outPath };
      } else {
        result = { ok: false, error: 'mock 模式缺少 sample-output.step' };
      }
    } else {
      result = await convertWithRhino(job.inputPath, outPath, { timeoutMs: CONVERT_TIMEOUT_MS, logFile: logPath, visibility: CONVERT_WINDOW });
    }
    if (result.ok) {
      job.state = 'done';
      job.outputPath = result.outputPath;
      job.outputName = job.fileName.replace(/\.[^.]+$/, '') + '.step';
      job.size = existsSync(result.outputPath) ? readFileSync(result.outputPath).length : 0;
    } else {
      job.state = 'error';
      job.error = result.error || '转换失败';
    }
  } catch (e) {
    job.state = 'error';
    job.error = '服务内部错误：' + e.message;
  } finally {
    workerBusy = false;
    setTimeout(pump, 0);
  }
}

function parseMultipart(buf, boundary) {
  const parts = [];
  const delim = Buffer.from('--' + boundary);
  let pos = 0;
  while (pos < buf.length) {
    const start = buf.indexOf(delim, pos);
    if (start === -1) break;
    if (buf.slice(start + delim.length, start + delim.length + 2).toString() === '--') break;
    const headerEnd = buf.indexOf(Buffer.from('\r\n\r\n'), start + delim.length);
    if (headerEnd === -1) break;
    const headers = buf.slice(start + delim.length, headerEnd).toString();
    const dataStart = headerEnd + 4;
    const dataEnd = buf.indexOf(Buffer.from('\r\n--' + boundary), dataStart);
    if (dataEnd === -1) break;
    const name = (headers.match(/name="([^"]+)"/) || [])[1];
    const filename = (headers.match(/filename="([^"]+)"/) || [])[1];
    parts.push({ name, filename, data: buf.slice(dataStart, dataEnd) });
    pos = dataEnd + 2;
  }
  return parts;
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const UI = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><title>格式转换服务</title>
<style>
body{font-family:"Microsoft YaHei",sans-serif;background:#0f1216;color:#dde3ea;max-width:640px;margin:60px auto;padding:0 20px}
.card{background:#161b22;border:1px solid #2a313c;border-radius:12px;padding:24px}
h1{font-size:20px;margin:0 0 6px}
.sub{color:#8b95a3;font-size:13px;margin:0 0 18px}
input[type=file]{width:100%;padding:10px;border:1px dashed #3a4350;border-radius:8px;background:#1c222b;margin-bottom:12px}
button{background:#4d9fff;border:none;color:#fff;padding:10px 22px;border-radius:8px;font-size:14px;cursor:pointer}
button:disabled{opacity:.5;cursor:default}
#status{margin-top:16px;font-size:14px;display:none;line-height:1.8}
#status a{color:#38bdf8}
.err{color:#ff6b6b}
code{background:#1c222b;padding:2px 6px;border-radius:4px;font-size:12px}
</style>
</head>
<body>
<div class="card">
<h1>CAD 格式转换服务</h1>
<p class="sub">服务器装有 Rhino，把 SolidWorks (.sldprt / .sldasm) 等格式自动转成 STEP。文件仅在本服务器处理。</p>
<input type="file" id="file" />
<button id="btn" onclick="upload()">上传并转换</button>
<div id="status"></div>
</div>
<script>
async function upload(){
  const f=document.getElementById('file').files[0];
  if(!f){alert('请先选择文件');return}
  const btn=document.getElementById('btn');btn.disabled=true;
  const st=document.getElementById('status');st.style.display='block';st.innerHTML='上传中…';
  const fd=new FormData();fd.append('file',f);
  let id;
  try{
    const r=await fetch('/convert',{method:'POST',body:fd});
    const j=await r.json();
    if(!j.ok){st.innerHTML='<span class="err">'+j.error+'</span>';btn.disabled=false;return}
    id=j.id;
  }catch(e){st.innerHTML='<span class="err">上传失败：'+e.message+'</span>';btn.disabled=false;return}
  const poll=async()=>{
    const r=await fetch('/status/'+id);const j=await r.json();
    if(j.state==='done'){st.innerHTML='转换完成：<a href="/download/'+id+'">下载 '+j.outputName+'（'+Math.round(j.size/1024)+' KB）</a>'}
    else if(j.state==='error'){st.innerHTML='<span class="err">转换失败：'+j.error+'</span>'}
    else{st.innerHTML='转换中，请稍候…（Rhino 启动需要一些时间）';setTimeout(poll,1500)}
  };
  poll();
}
</script>
</body>
</html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  if (req.method === 'GET' && path === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(UI);
    return;
  }

  if (req.method === 'GET' && path === '/health') {
    sendJson(res, 200, { ok: true, converter: CONVERTER, rhino: RHINO_AVAILABLE ? findRhino() : null });
    return;
  }

  if (req.method === 'POST' && path === '/convert') {
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_UPLOAD) {
        aborted = true;
        req.destroy();
        sendJson(res, 413, { ok: false, error: '文件超过 300MB 限制' });
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      const body = Buffer.concat(chunks);
      const ct = req.headers['content-type'] || '';
      const bm = ct.match(/boundary=(.+)$/);
      if (!bm) {
        sendJson(res, 400, { ok: false, error: '请求格式错误（缺少 multipart boundary）' });
        return;
      }
      const parts = parseMultipart(body, bm[1].trim().replace(/^"|"$/g, ''));
      const filePart = parts.find((p) => p.name === 'file');
      if (!filePart || !filePart.data.length) {
        sendJson(res, 400, { ok: false, error: '未收到文件' });
        return;
      }
      const fileName = filePart.filename || 'input';
      const ext = extname(fileName).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        sendJson(res, 400, { ok: false, error: '不支持的文件类型：' + ext + '（支持：' + [...ALLOWED_EXT].join(' ') + '）' });
        return;
      }
      const id = randomUUID().slice(0, 12);
      const dir = join(JOBS_DIR, id);
      mkdirSync(dir, { recursive: true });
      const inputPath = join(dir, 'input' + ext);
      writeFileSync(inputPath, filePart.data);
      const job = newJob(id, fileName, inputPath);
      sendJson(res, 200, { ok: true, id: job.id });
    });
    return;
  }

  const statusMatch = path.match(/^\/status\/([\w-]+)$/);
  if (req.method === 'GET' && statusMatch) {
    const job = jobs.get(statusMatch[1]);
    if (!job) {
      sendJson(res, 404, { ok: false, error: '任务不存在' });
      return;
    }
    sendJson(res, 200, {
      state: job.state,
      fileName: job.fileName,
      outputName: job.outputName,
      size: job.size,
      error: job.error,
    });
    return;
  }

  const dlMatch = path.match(/^\/download\/([\w-]+)$/);
  if (req.method === 'GET' && dlMatch) {
    const job = jobs.get(dlMatch[1]);
    if (!job || job.state !== 'done') {
      sendJson(res, 404, { ok: false, error: '结果不存在或尚未完成' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="UTF-8''${encodeURIComponent(job.outputName)}"`,
    });
    createReadStream(job.outputPath).pipe(res);
    return;
  }

  sendJson(res, 404, { ok: false, error: '未知路径' });
});

server.listen(PORT, () => {
  console.log(`转换服务已启动: http://localhost:${PORT}`);
  console.log(`转换器: ${CONVERTER === 'mock' ? 'mock（测试模式）' : 'Rhino' + (RHINO_AVAILABLE ? '（' + findRhino() + '）' : '（未找到 Rhino！设置 RHINO_EXE 或安装 Rhino）')}`);
  console.log(`工作目录: ${JOBS_DIR}`);
});
