/** Прицельная картинка: миллирадианная сетка, цель и точка попадания.
 *  Рисуется в виртуальных координатах 1000×1000 — один и тот же код
 *  используется для экрана, PNG-экспорта и печати. */

const V = 1000;
const CX = 500;
const CY = 505;
const FIELD = { x: 70, y: 95, w: 860, h: 830 };

function fmt(v, digits = 1) {
  return Number.isFinite(v) ? v.toFixed(digits).replace('.', ',') : '—';
}

function render(ctx, data) {
  const scale = 1; // виртуальные координаты уже 1000×1000
  ctx.save();
  ctx.scale(scale, scale);

  // Фон и верхняя плашка
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, V, V);
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, V, 82);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('ПРИЦЕЛЬНАЯ КАРТИНКА', 34, 42);
  ctx.textAlign = 'right';
  ctx.font = '24px system-ui, sans-serif';
  ctx.fillText(`${fmt(data.range, 0)} м`, V - 34, 42);

  // Поле сетки
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 2;
  ctx.strokeRect(FIELD.x, FIELD.y, FIELD.w, FIELD.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(FIELD.x, FIELD.y, FIELD.w, FIELD.h);
  ctx.clip();

  const sample = data.sample;
  const dropMrad = sample ? sample.dropMrad : 0;
  const windMrad = sample ? sample.windageMrad : 0;
  const targetMrad = data.targetCm ? (data.targetCm * 10) / Math.max(data.range, 1) : 0;

  const maxAbs = Math.max(Math.abs(dropMrad), Math.abs(windMrad), targetMrad / 2, 0.8);
  const pxPerMrad = Math.min(150, Math.max(28, 360 / (maxAbs + 0.35)));

  // Сетка 1 мрад
  const ticksX = Math.floor(400 / pxPerMrad);
  const ticksY = Math.floor(400 / pxPerMrad);
  ctx.strokeStyle = '#9ca3af';
  ctx.fillStyle = '#374151';
  ctx.lineWidth = 2;

  if (data.reticleType === 'mildot') {
    for (let n = 1; n <= ticksY; n++) {
      const dy = n * pxPerMrad;
      dot(ctx, CX, CY - dy, 5);
      dot(ctx, CX, CY + dy, 5);
    }
    for (let n = 1; n <= ticksX; n++) {
      const dx = n * pxPerMrad;
      dot(ctx, CX - dx, CY, 5);
      dot(ctx, CX + dx, CY, 5);
    }
    dot(ctx, CX, CY, 4);
  }

  // Перекрестие
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(FIELD.x, CY);
  ctx.lineTo(FIELD.x + FIELD.w, CY);
  ctx.moveTo(CX, FIELD.y);
  ctx.lineTo(CX, FIELD.y + FIELD.h);
  ctx.stroke();

  if (data.reticleType === 'crosshair') {
    ctx.lineWidth = 3;
    for (let n = 1; n <= ticksY; n++) {
      const dy = n * pxPerMrad;
      tick(ctx, CX, CY - dy, data.clickMrad ? 12 : 10, 'v');
      tick(ctx, CX, CY + dy, 10, 'v');
    }
    for (let n = 1; n <= ticksX; n++) {
      const dx = n * pxPerMrad;
      tick(ctx, CX - dx, CY, 10, 'h');
      tick(ctx, CX + dx, CY, 10, 'h');
    }
  }

  // Цель
  if (targetMrad > 0) {
    const side = targetMrad * pxPerMrad;
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 3;
    ctx.strokeRect(CX - side / 2, CY - side / 2, side, side);
    ctx.restore();
    ctx.fillStyle = '#6b7280';
    ctx.font = '18px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('цель ' + fmt(data.targetCm, 0) + ' см', FIELD.x + 14, FIELD.y + 24);
  }

  // Точка попадания
  if (sample) {
    const ix = CX + windMrad * pxPerMrad;
    const iy = CY + dropMrad * pxPerMrad;
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(ix, iy, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ix - 26, iy);
    ctx.lineTo(ix + 26, iy);
    ctx.moveTo(ix, iy - 26);
    ctx.lineTo(ix, iy + 26);
    ctx.stroke();
  }
  ctx.restore();

  // Нижняя информационная плашка
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(0, 940, V, 60);
  ctx.fillStyle = '#111827';
  ctx.font = '19px system-ui, sans-serif';
  ctx.textAlign = 'left';
  const clicks = data.clickMrad ? data.clickMrad : 0.1;
  const line =
    `Падение ${fmt(sample ? sample.dropMm : 0)} мм = ${fmt(dropMrad, 2)} мрад = ${fmt(dropMrad / clicks, 0)} щелчков` +
    '    |    ' +
    `Снос ${fmt(sample ? sample.windageMm : 0)} мм = ${fmt(windMrad, 2)} мрад = ${fmt(windMrad / clicks, 0)} щелчков`;
  ctx.fillText(line, 28, 964);
  ctx.fillStyle = '#4b5563';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText(
    `Пристрелка ${fmt(data.zeroRange, 0)} м · ${data.dragModel} BC ${fmt(data.bc, 3)} · цена щелчка ${fmt(clicks, 2)} мрад`,
    28,
    990,
  );

  ctx.restore();
}

function dot(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function tick(ctx, x, y, len, dir) {
  ctx.beginPath();
  if (dir === 'v') {
    ctx.moveTo(x - len, y);
    ctx.lineTo(x + len, y);
  } else {
    ctx.moveTo(x, y - len);
    ctx.lineTo(x, y + len);
  }
  ctx.stroke();
}

export function createReticle(canvas) {
  const ctx = canvas.getContext('2d');
  const data = {
    samples: [],
    range: 100,
    sample: null,
    reticleType: 'mildot',
    targetCm: 10,
    clickMrad: 0.1,
    zeroRange: 50,
    dragModel: 'G1',
    bc: 0.112,
  };

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const size = Math.max(rect.width, 200);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr * (size / V), 0, 0, dpr * (size / V), 0, 0);
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, V, V);
    render(ctx, data);
  }

  function exportPNG() {
    const size = 1680;
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const offCtx = off.getContext('2d');
    offCtx.scale(size / V, size / V);
    render(offCtx, data);
    const a = document.createElement('a');
    a.href = off.toDataURL('image/png');
    a.download = `reticle-${fmt(data.range, 0)}m.png`;
    a.click();
  }

  window.addEventListener('resize', resize);

  return {
    setData(samples, state) {
      data.samples = samples;
      data.clickMrad = state.clickMrad;
      data.zeroRange = state.zeroRange;
      data.dragModel = state.dragModel;
      data.bc = state.dragModel === 'G7' ? state.bcG7 : state.bc;
      if (!samples.some((s) => s.range === data.range)) {
        data.range = samples.length ? samples[samples.length - 1].range : 100;
      }
      data.sample = samples.find((s) => s.range === data.range) || null;
      draw();
    },
    setRange(range) {
      data.range = range;
      data.sample = data.samples.find((s) => s.range === range) || null;
      draw();
    },
    setOptions({ reticleType, targetCm }) {
      if (reticleType) data.reticleType = reticleType;
      if (Number.isFinite(targetCm)) data.targetCm = targetCm;
      draw();
    },
    redraw: draw,
    resize,
    exportPNG,
  };
}
