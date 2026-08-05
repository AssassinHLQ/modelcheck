export function initElasticSlider({ el, valueEl, min = 0, max = 1000, step = 50, defaultValue = 500, onChange } = {}) {
  const track = el.querySelector('.es-track');
  const fill = el.querySelector('.es-fill');
  const leftIcon = el.querySelector('.es-left');
  const rightIcon = el.querySelector('.es-right');
  const trackWrap = el.querySelector('.es-track-wrap');
  const rowEl = el.closest('.fade-row');
  if (!track || !fill || !trackWrap) return;

  const MAX_OVERFLOW = 50;
  let value = Math.min(max, Math.max(min, defaultValue));
  let overflow = 0;
  let region = 'middle';

  const decay = (input, m) => (m === 0 ? 0 : 2 * (1 / (1 + Math.exp(-input / m)) - 0.5) * m);

  const render = () => {
    const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
    fill.style.width = pct + '%';
    if (valueEl) valueEl.textContent = Math.round(value) + 'ms';
  };

  const applyOverflow = () => {
    const t = overflow / MAX_OVERFLOW;
    track.style.transformOrigin = region === 'left' ? 'right' : 'left';
    track.style.transform = `scaleX(${1 + overflow / track.clientWidth}) scaleY(${1 + t * -0.2})`;
    if (region === 'left') leftIcon.style.transform = `translateX(${-overflow}px)`;
    else if (region === 'right') rightIcon.style.transform = `translateX(${overflow}px)`;
  };

  const pulseIcon = (icon) => {
    icon.style.transition = 'transform 0.125s ease-out';
    icon.style.transform = 'scale(1.4)';
    setTimeout(() => {
      icon.style.transition = '';
      icon.style.transform = '';
    }, 125);
  };

  const handleMove = (clientX) => {
    const rect = track.getBoundingClientRect();
    let v = min + ((clientX - rect.left) / rect.width) * (max - min);
    if (step > 0) v = Math.round(v / step) * step;
    value = Math.min(max, Math.max(min, v));
    render();

    let ov = 0;
    let rg = 'middle';
    if (clientX < rect.left) {
      rg = 'left';
      ov = decay(rect.left - clientX, MAX_OVERFLOW);
    } else if (clientX > rect.right) {
      rg = 'right';
      ov = decay(clientX - rect.right, MAX_OVERFLOW);
    }
    if (rg !== region) {
      if (rg !== 'middle') pulseIcon(rg === 'left' ? leftIcon : rightIcon);
      region = rg;
    }
    overflow = ov;
    applyOverflow();
    if (onChange) onChange(value);
  };

  const springOverflow = (to) => {
    const start = overflow;
    const startTime = performance.now();
    const mass = 1;
    const stiffness = 170;
    const damping = 26 * (1 - 0.4);
    const dampingRatio = damping / (2 * Math.sqrt(mass * stiffness));
    const angularFreq = Math.sqrt(stiffness / mass);
    const dampedFreq = angularFreq * Math.sqrt(Math.max(0, 1 - dampingRatio * dampingRatio));
    const step = (now) => {
      const t = (now - startTime) / 1000;
      let disp;
      if (dampingRatio < 1) {
        const env = Math.exp(-dampingRatio * angularFreq * t);
        disp = env * (Math.cos(dampedFreq * t) + ((dampingRatio * angularFreq) / dampedFreq) * Math.sin(dampedFreq * t));
      } else {
        disp = Math.exp(-angularFreq * t);
      }
      overflow = to + (start - to) * disp;
      if (Math.abs(overflow - to) < 0.01 && t > 0.1) {
        overflow = to;
        applyOverflow();
        return;
      }
      applyOverflow();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const onDown = (e) => {
    try {
      trackWrap.setPointerCapture(e.pointerId);
    } catch {}
    if (rowEl) rowEl.classList.add('adjusting');
    handleMove(e.clientX);
  };
  const onMove = (e) => {
    if (e.buttons > 0 || e.pointerType === 'touch') handleMove(e.clientX);
  };
  const onUp = () => {
    if (rowEl) rowEl.classList.remove('adjusting');
    springOverflow(0);
  };

  trackWrap.addEventListener('pointerdown', onDown);
  trackWrap.addEventListener('pointermove', onMove);
  trackWrap.addEventListener('pointerup', onUp);
  trackWrap.addEventListener('pointercancel', onUp);

  render();
  return {
    setValue(v) {
      value = Math.min(max, Math.max(min, v));
      render();
    },
    getValue() {
      return value;
    },
  };
}
