export function initClickSpark(opts = {}) {
  const leftColor = opts.sparkColor || '#f9a8d4';
  const rightColor = opts.rightColor || '#7dd3fc';
  const sparkSize = opts.sparkSize || 12;
  const sparkRadius = opts.sparkRadius || 20;
  const sparkCount = opts.sparkCount || 10;
  const dragCount = opts.dragCount || 4;
  const dragInterval = opts.dragInterval || 80;
  const duration = opts.duration || 450;
  const extraScale = opts.extraScale || 1;
  const easing = opts.easing || 'ease-out';

  const ease = (t) => {
    switch (easing) {
      case 'linear':
        return t;
      case 'ease-in':
        return t * t;
      case 'ease-in-out':
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      default:
        return t * (2 - t);
    }
  };

  const canvas = document.createElement('canvas');
  canvas.className = 'spark-canvas';
  document.documentElement.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', resize);
  resize();

  let sparks = [];
  let rafId = null;

  const draw = (ts) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    sparks = sparks.filter((s) => ts - s.startTime < duration);
    for (const s of sparks) {
      const elapsed = ts - s.startTime;
      const progress = elapsed / duration;
      const eased = ease(progress);
      const distance = eased * sparkRadius * extraScale;
      const lineLength = sparkSize * (1 - eased);
      const x1 = s.x + distance * Math.cos(s.angle);
      const y1 = s.y + distance * Math.sin(s.angle);
      const x2 = s.x + (distance + lineLength) * Math.cos(s.angle);
      const y2 = s.y + (distance + lineLength) * Math.sin(s.angle);
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = 1 - progress * 0.85;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    rafId = sparks.length ? requestAnimationFrame(draw) : null;
  };

  const spawn = (x, y, color, count) => {
    const now = performance.now();
    for (let i = 0; i < count; i++) {
      sparks.push({
        x,
        y,
        color,
        angle: (2 * Math.PI * i) / count + (Math.random() - 0.5) * 0.2,
        startTime: now,
      });
    }
    if (!rafId) rafId = requestAnimationFrame(draw);
  };

  let lastLeft = 0;
  let lastRight = 0;

  const onMouseDown = (e) => {
    if (e.button === 0) {
      spawn(e.clientX, e.clientY, leftColor, sparkCount);
      lastLeft = performance.now();
    } else if (e.button === 2) {
      spawn(e.clientX, e.clientY, rightColor, sparkCount);
      lastRight = performance.now();
    }
  };

  const onMouseMove = (e) => {
    const now = performance.now();
    if (e.buttons & 1 && now - lastLeft >= dragInterval) {
      spawn(e.clientX, e.clientY, leftColor, dragCount);
      lastLeft = now;
    }
    if (e.buttons & 2 && now - lastRight >= dragInterval) {
      spawn(e.clientX, e.clientY, rightColor, dragCount);
      lastRight = now;
    }
  };

  const onContextMenu = (e) => e.preventDefault();

  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('contextmenu', onContextMenu);

  return () => {
    document.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('resize', resize);
    if (rafId) cancelAnimationFrame(rafId);
    canvas.remove();
  };
}
