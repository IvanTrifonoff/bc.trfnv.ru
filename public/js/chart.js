/** График траектории с зоной прямого выстрела. Canvas, без внешних библиотек. */

export function createTrajectoryChart(canvas, tooltipEl) {
  const ctx = canvas.getContext('2d');
  let shot = null;
  let hover = null;

  function colors() {
    const dark = document.documentElement.classList.contains('dark');
    return dark
      ? {
          grid: '#374151', text: '#9ca3af', strong: '#e5e7eb', zero: '#6b7280',
          traj: '#f87171', fillTop: 'rgba(248,113,113,0.28)', fillBottom: 'rgba(248,113,113,0.02)',
          wind: '#60a5fa', band: 'rgba(16,185,129,0.12)', bandEdge: '#10b981',
          mark: '#fbbf24', mpbr: '#a78bfa', apex: '#f472b6',
        }
      : {
          grid: '#e5e7eb', text: '#6b7280', strong: '#374151', zero: '#9ca3af',
          traj: '#dc2626', fillTop: 'rgba(220,38,38,0.22)', fillBottom: 'rgba(220,38,38,0.02)',
          wind: '#2563eb', band: 'rgba(5,150,105,0.10)', bandEdge: '#059669',
          mark: '#d97706', mpbr: '#7c3aed', apex: '#db2777',
        };
  }

  function fmt(v, digits = 0) {
    return Number.isFinite(v) ? v.toFixed(digits).replace('.', ',') : '—';
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(rect.width, 1) * dpr;
    canvas.height = Math.max(rect.height, 1) * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function empty(c) {
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = c.text;
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Нет данных для графика', rect.width / 2, rect.height / 2);
    if (tooltipEl) tooltipEl.hidden = true;
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);
    const c = colors();
    if (!shot || !shot.samples || shot.samples.length < 2) return empty(c);

    const pad = { l: 52, r: 46, t: 16, b: 26 };
    const cw = W - pad.l - pad.r;
    const ch = H - pad.t - pad.b;
    if (cw <= 10 || ch <= 10) return;

    const samples = shot.samples;
    const maxR = samples[samples.length - 1].range || 1;
    const heights = samples.map((s) => s.heightMm);
    const winds = samples.map((s) => s.windageMm);
    const half = shot.halfBandMm;

    let minV = Math.min(...heights, -half, 0);
    let maxV = Math.max(...heights, half, 0);
    const span = maxV - minV || 1;
    minV -= span * 0.12;
    maxV += span * 0.12;

    const windMax = Math.max(1, ...winds.map((w) => Math.abs(w))) * 1.1;

    const x = (r) => pad.l + (r / maxR) * cw;
    const y = (v) => pad.t + (1 - (v - minV) / (maxV - minV)) * ch;
    const yWind = (w) => pad.t + (1 - (w + windMax) / (2 * windMax)) * ch;

    // Зона цели (прямой выстрел)
    const bandTop = y(half);
    const bandBottom = y(-half);
    ctx.fillStyle = c.band;
    ctx.fillRect(pad.l, bandTop, cw, bandBottom - bandTop);
    ctx.strokeStyle = c.bandEdge;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.l, bandTop); ctx.lineTo(W - pad.r, bandTop);
    ctx.moveTo(pad.l, bandBottom); ctx.lineTo(W - pad.r, bandBottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = c.bandEdge;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('зона цели ' + fmt(shot.targetHeightMm) + ' см', W - pad.r - 4, bandTop - 3);

    // Сетка и подписи левой оси
    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    const rows = 5;
    for (let i = 0; i <= rows; i++) {
      const v = minV + ((maxV - minV) * i) / rows;
      const yy = y(v);
      ctx.strokeStyle = c.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l, yy); ctx.lineTo(W - pad.r, yy);
      ctx.stroke();
      ctx.fillStyle = c.text;
      ctx.fillText(fmt(v), pad.l - 6, yy);
    }

    // Правая ось — снос
    ctx.textAlign = 'left';
    ctx.fillStyle = c.wind;
    for (const v of [windMax, 0, -windMax]) {
      ctx.fillText(fmt(v), W - pad.r + 6, yWind(v));
    }

    // Подписи дистанций
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const cols = Math.min(6, Math.round(maxR / 20));
    for (let i = 0; i <= cols; i++) {
      const r = (maxR * i) / cols;
      ctx.fillStyle = c.text;
      ctx.fillText(fmt(r), x(r), H - pad.b + 5);
    }
    ctx.fillStyle = c.text;
    ctx.textAlign = 'right';
    ctx.fillText('м', W - pad.r, H - pad.b + 5);

    // Линия прицела
    ctx.strokeStyle = c.zero;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.l, y(0)); ctx.lineTo(W - pad.r, y(0));
    ctx.stroke();
    ctx.setLineDash([]);

    // Снос (тонкая линия)
    ctx.strokeStyle = c.wind;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    samples.forEach((s, i) => {
      const xx = x(s.range); const yy = yWind(s.windageMm);
      if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    });
    ctx.stroke();

    // Траектория с градиентной заливкой до линии прицела
    const zeroY = y(0);
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch);
    grad.addColorStop(0, c.fillTop);
    grad.addColorStop(1, c.fillBottom);
    ctx.beginPath();
    ctx.moveTo(x(samples[0].range), zeroY);
    samples.forEach((s) => ctx.lineTo(x(s.range), y(s.heightMm)));
    ctx.lineTo(x(samples[samples.length - 1].range), zeroY);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = c.traj;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    samples.forEach((s, i) => {
      const xx = x(s.range); const yy = y(s.heightMm);
      if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    });
    ctx.stroke();

    // Нули
    for (const [range, label] of [[shot.nearZero, 'ноль'], [shot.farZero, 'ноль']]) {
      if (!Number.isFinite(range) || range > maxR) continue;
      const xx = x(range);
      ctx.strokeStyle = c.mark;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(xx, pad.t); ctx.lineTo(xx, pad.t + ch); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = c.mark;
      ctx.beginPath(); ctx.arc(xx, y(0), 4, 0, Math.PI * 2); ctx.fill();
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(label + ' ' + fmt(range) + ' м', xx, y(0) - 7);
    }

    // Апогей
    if (Number.isFinite(shot.apexRange) && shot.apexRange > 0 && shot.apexRange <= maxR) {
      const xx = x(shot.apexRange); const yy = y(shot.apexMm);
      ctx.fillStyle = c.apex;
      ctx.beginPath(); ctx.arc(xx, yy, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('апогей +' + fmt(shot.apexMm) + ' мм', xx, yy - 6);
    }

    // Граница прямого выстрела
    if (Number.isFinite(shot.mpbr) && shot.mpbr <= maxR) {
      const xx = x(shot.mpbr);
      ctx.strokeStyle = c.mpbr;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath(); ctx.moveTo(xx, pad.t); ctx.lineTo(xx, pad.t + ch); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = c.mpbr;
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('МПВ ' + fmt(shot.mpbr) + ' м', xx - 4, pad.t + ch - 4);
    }

    // Курсор
    if (hover) {
      const xx = x(hover.range);
      ctx.strokeStyle = c.text;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(xx, pad.t); ctx.lineTo(xx, pad.t + ch); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = c.traj;
      ctx.beginPath(); ctx.arc(xx, y(hover.heightMm), 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.wind;
      ctx.beginPath(); ctx.arc(xx, yWind(hover.windageMm), 4, 0, Math.PI * 2); ctx.fill();
      if (tooltipEl) {
        tooltipEl.hidden = false;
        tooltipEl.innerHTML =
          `<strong>${fmt(hover.range)} м</strong><br>` +
          `<span style="color:${c.traj}">Высота: ${fmt(hover.heightMm)} мм</span><br>` +
          `<span style="color:${c.wind}">Снос: ${fmt(hover.windageMm)} мм</span>`;
        const tw = tooltipEl.offsetWidth || 140;
        tooltipEl.style.left = Math.min(Math.max(xx - tw / 2, 4), W - tw - 4) + 'px';
        tooltipEl.style.top = pad.t + 4 + 'px';
      }
    } else if (tooltipEl) {
      tooltipEl.hidden = true;
    }
  }

  canvas.addEventListener('mousemove', (e) => {
    if (!shot || !shot.samples.length) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const pad = { l: 52, r: 46 };
    const cw = rect.width - pad.l - pad.r;
    const maxR = shot.samples[shot.samples.length - 1].range || 1;
    const r = ((mx - pad.l) / cw) * maxR;
    let nearest = shot.samples[0];
    let best = Infinity;
    for (const s of shot.samples) {
      const d = Math.abs(s.range - r);
      if (d < best) { best = d; nearest = s; }
    }
    hover = nearest;
    draw();
  });
  canvas.addEventListener('mouseleave', () => { hover = null; draw(); });
  window.addEventListener('resize', resize);

  return {
    setData(shotData) {
      shot = shotData;
      hover = null;
      draw();
    },
    redraw: draw,
    resize,
  };
}
