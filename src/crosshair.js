export function createCrosshair(container) {
  const wrap = document.createElement('div');
  wrap.className = 'crosshair';
  const hLine = document.createElement('div');
  hLine.className = 'crosshair-h';
  const vLine = document.createElement('div');
  vLine.className = 'crosshair-v';
  wrap.appendChild(hLine);
  wrap.appendChild(vLine);
  container.appendChild(wrap);

  let mouse = { x: 0, y: 0 };
  let smooth = { x: 0, y: 0 };
  let rafId = null;
  let enabled = false;
  let inside = false;

  const lerp = (a, b, n) => a + (b - a) * n;

  const onMove = (e) => {
    const rect = container.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    const inBounds =
      e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (inBounds !== inside) {
      inside = inBounds;
      wrap.classList.toggle('inside', inside);
    }
  };

  const tick = () => {
    smooth.x = lerp(smooth.x, mouse.x, 0.15);
    smooth.y = lerp(smooth.y, mouse.y, 0.15);
    vLine.style.transform = `translateX(${smooth.x - 0.5}px)`;
    hLine.style.transform = `translateY(${smooth.y - 0.5}px)`;
    if (enabled) rafId = requestAnimationFrame(tick);
    else rafId = null;
  };

  window.addEventListener('pointermove', onMove, { passive: true });

  return {
    setEnabled(on) {
      enabled = on;
      if (on) {
        smooth.x = mouse.x;
        smooth.y = mouse.y;
        wrap.classList.add('show');
        if (rafId === null) rafId = requestAnimationFrame(tick);
      } else {
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = null;
        wrap.classList.remove('show');
      }
    },
    destroy() {
      window.removeEventListener('pointermove', onMove);
      this.setEnabled(false);
      wrap.remove();
    },
  };
}
