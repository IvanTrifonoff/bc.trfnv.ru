/** Простой график на canvas: падение и снос по дистанции. Без внешних библиотек. */

export function createTrajectoryChart(canvas, tooltipEl) {
  const ctx = canvas.getContext('2d');
  let current = null;
  let hover = null;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(rect.width, 1) * dpr;
    canvas.height = Math.max(rect.height, 1) * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function fmt(v, digits = 1) {
    return Number.isFinite(v) ? v.toFixed(digits) : '—';
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);

    if (!current || !current.samples || current.samples.length < 2) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Нет данных для графика', W / 2, H / 2);
      return;
    }

    const pad = { l: 48, r: 48, t: 16, b: 30 };
    const cw = W - pad.l - pad.r;
    const ch = H - pad.t - pad.b;
    const samples = current.samples;
    const ranges = samples.map((s) => s.range);
    const minR = ranges[0];
    const maxR = ranges[ranges.length - 1];

    const allVals = samples.flatMap((s) => [s.dropMm, s.windageMm]);
    let minV = Math.min(...allVals, 0);
    let maxV = Math.max(...allVals, 0);
    if (maxV - minV < 1) {
      minV -= 1;
      maxV += 1;
    }
    const margin = (maxV - minV) * 0.1;
    minV -= margin;
    maxV += margin;

    const x = (r) => pad.l + ((r - minR) / (maxR - minR || 1)) * cw;
    // Положительное «падение» = пуля ниже линии прицела, поэтому оно идёт ВНИЗ.
    const y = (v) => pad.t + ((v - minV) / (maxV - minV || 1)) * ch;

    // Сетка и подписи
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#4b5563';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const rows = 5;
    for (let i = 0; i <= rows; i++) {
      const v = minV + ((maxV - minV) * i) / rows;
      const yy = y(v);
      ctx.beginPath();
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(W - pad.r, yy);
      ctx.stroke();
      ctx.fillText(fmt(v, 0), pad.l - 6, yy);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const cols = Math.min(ranges.length - 1, 6);
    for (let i = 0; i <= cols; i++) {
      const r = minR + ((maxR - minR) * i) / cols;
      const xx = x(r);
      ctx.fillText(fmt(r, 0), xx, H - pad.b + 6);
    }

    // Ноль
    if (minV < 0 && maxV > 0) {
      ctx.strokeStyle = '#9ca3af';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.l, y(0));
      ctx.lineTo(W - pad.r, y(0));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const series = [
      { key: 'dropMm', color: '#dc2626', label: 'Падение' },
      { key: 'windageMm', color: '#2563eb', label: 'Снос' },
    ];
    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      samples.forEach((sample, i) => {
        const xx = x(sample.range);
        const yy = y(sample[s.key]);
        if (i === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      });
      ctx.stroke();
      ctx.fillStyle = s.color;
      samples.forEach((sample) => {
        ctx.beginPath();
        ctx.arc(x(sample.range), y(sample[s.key]), 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Курсор
    if (hover) {
      const xx = x(hover.range);
      ctx.strokeStyle = '#6b7280';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(xx, pad.t);
      ctx.lineTo(xx, H - pad.b);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const s of series) {
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(xx, y(hover[s.key]), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (tooltipEl) {
        tooltipEl.hidden = false;
        tooltipEl.innerHTML =
          `<strong>${fmt(hover.range, 0)} м</strong><br>` +
          `<span style="color:#dc2626">Падение: ${fmt(hover.dropMm)} мм</span><br>` +
          `<span style="color:#2563eb">Снос: ${fmt(hover.windageMm)} мм</span>`;
        const tw = tooltipEl.offsetWidth || 140;
        const left = Math.min(Math.max(xx - tw / 2, 4), W - tw - 4);
        tooltipEl.style.left = left + 'px';
        tooltipEl.style.top = pad.t + 4 + 'px';
      }
    } else if (tooltipEl) {
      tooltipEl.hidden = true;
    }
  }

  canvas.addEventListener('mousemove', (e) => {
    if (!current || !current.samples.length) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const pad = { l: 48, r: 48 };
    const cw = rect.width - pad.l - pad.r;
    const ranges = current.samples.map((s) => s.range);
    const minR = ranges[0];
    const maxR = ranges[ranges.length - 1];
    const r = minR + ((mx - pad.l) / cw) * (maxR - minR);
    let nearest = current.samples[0];
    let best = Infinity;
    for (const s of current.samples) {
      const d = Math.abs(s.range - r);
      if (d < best) {
        best = d;
        nearest = s;
      }
    }
    hover = nearest;
    draw();
  });
  canvas.addEventListener('mouseleave', () => {
    hover = null;
    draw();
  });

  window.addEventListener('resize', resize);

  return {
    setData(result) {
      current = result;
      hover = null;
      draw();
    },
    redraw: draw,
    resize,
  };
}
