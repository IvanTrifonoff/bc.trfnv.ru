/**
 * Баллистический движок: модель точечной массы, кривые сопротивления G1/G7.
 * Интегрирование методом Рунге-Кутты 4-го порядка.
 * Все единицы СИ: м, с, кг, Па.
 */

import { G1, G7 } from './drag-tables.js';

export const GRAVITY = 9.80665;
export const LB_IN2_TO_KG_M2 = 703.069579;

const TABLES = { G1, G7 };

export function speedOfSound(tempC) {
  return Math.sqrt(1.4 * 287.053 * (tempC + 273.15));
}

export function airDensity(tempC, pressureHpa, humidityPct) {
  const tK = tempC + 273.15;
  // Давление насыщенного водяного пара, hPa (Magnus).
  const es = 6.1078 * Math.pow(10, (7.5 * tempC) / (237.3 + tempC));
  const e = (es * humidityPct) / 100;
  const pDry = (pressureHpa - e) * 100;
  const pVap = e * 100;
  return pDry / (287.053 * tK) + pVap / (461.52 * tK);
}

function cdFromTable(table, mach) {
  if (mach <= 0) return table[0][1];
  if (mach >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 1; i < table.length; i++) {
    const [m1, c1] = table[i];
    if (mach <= m1) {
      const [m0, c0] = table[i - 1];
      const f = (mach - m0) / (m1 - m0);
      return c0 + (c1 - c0) * f;
    }
  }
  return table[table.length - 1][1];
}

/** Коэффициент формы относительно эталонной пули G1. */
export function formFactor(bulletWeightG, caliberMm, bcLbIn2) {
  const massKg = bulletWeightG / 1000;
  const d = caliberMm / 1000;
  const bcSi = bcLbIn2 * LB_IN2_TO_KG_M2;
  return massKg / (bcSi * d * d);
}

function buildParams(input) {
  const {
    bulletWeightG,
    caliberMm,
    bc,
    dragModel = 'G1',
    muzzleVelocity,
    sightHeightMm,
    tempC = 15,
    pressureHpa = 1013.25,
    humidityPct = 0,
    windSpeed = 0,
    windFromDeg = 0,
    elevationDeg = 0,
  } = input;

  const massKg = bulletWeightG / 1000;
  const d = caliberMm / 1000;
  const area = (Math.PI * d * d) / 4;
  const i = formFactor(bulletWeightG, caliberMm, bc);
  const table = TABLES[dragModel] || G1;
  const rho = airDensity(tempC, pressureHpa, humidityPct);
  const sound = speedOfSound(tempC);
  const wRad = (windFromDeg * Math.PI) / 180;
  const wx = -windSpeed * Math.cos(wRad); // встречный ветер: воздух движется к стрелку
  const wz = windSpeed * Math.sin(wRad); // ветер слева -> снос вправо (+z)
  const aRad = (elevationDeg * Math.PI) / 180;
  const gx = -GRAVITY * Math.sin(aRad);
  const gy = -GRAVITY * Math.cos(aRad);

  return {
    v0: muzzleVelocity,
    massKg,
    area,
    i,
    table,
    rho,
    sound,
    wx,
    wz,
    gx,
    gy,
    sightHeight: sightHeightMm / 1000,
  };
}

function deriv(s, p) {
  const rvx = s.vx - p.wx;
  const rvy = s.vy;
  const rvz = s.vz - p.wz;
  const rv = Math.hypot(rvx, rvy, rvz) || 1e-9;
  const cd = p.i * cdFromTable(p.table, rv / p.sound);
  const k = (0.5 * p.rho * cd * p.area * rv) / p.massKg;
  return {
    x: s.vx,
    y: s.vy,
    z: s.vz,
    vx: -k * rvx + p.gx,
    vy: -k * rvy + p.gy,
    vz: -k * rvz,
  };
}

function addScaled(s, d, h) {
  return {
    x: s.x + d.x * h,
    y: s.y + d.y * h,
    z: s.z + d.z * h,
    vx: s.vx + d.vx * h,
    vy: s.vy + d.vy * h,
    vz: s.vz + d.vz * h,
  };
}

function rk4Step(s, dt, p) {
  const d1 = deriv(s, p);
  const s2 = addScaled(s, d1, dt / 2);
  const d2 = deriv(s2, p);
  const s3 = addScaled(s, d2, dt / 2);
  const d3 = deriv(s3, p);
  const s4 = addScaled(s, d3, dt);
  const d4 = deriv(s4, p);
  const c = dt / 6;
  return {
    x: s.x + c * (d1.x + 2 * d2.x + 2 * d3.x + d4.x),
    y: s.y + c * (d1.y + 2 * d2.y + 2 * d3.y + d4.y),
    z: s.z + c * (d1.z + 2 * d2.z + 2 * d3.z + d4.z),
    vx: s.vx + c * (d1.vx + 2 * d2.vx + 2 * d3.vx + d4.vx),
    vy: s.vy + c * (d1.vy + 2 * d2.vy + 2 * d3.vy + d4.vy),
    vz: s.vz + c * (d1.vz + 2 * d2.vz + 2 * d3.vz + d4.vz),
  };
}

/** Интегрирует траекторию и возвращает параметры на запрошенных дистанциях. */
function integrate(p, theta, ranges, dt = 0.0005) {
  const targets = [...ranges].sort((a, b) => a - b);
  let s = {
    x: 0,
    y: -p.sightHeight,
    z: 0,
    vx: p.v0 * Math.cos(theta),
    vy: p.v0 * Math.sin(theta),
    vz: 0,
  };
  let prev = { x: 0, y: s.y, z: 0, t: 0, v: p.v0 };
  const out = [];
  let idx = 0;
  let t = 0;
  const maxTime = 8;

  while (idx < targets.length && t < maxTime) {
    s = rk4Step(s, dt, p);
    t += dt;
    const v = Math.hypot(s.vx, s.vy, s.vz);
    while (idx < targets.length && s.x >= targets[idx]) {
      const span = s.x - prev.x;
      const f = span > 0 ? (targets[idx] - prev.x) / span : 1;
      out.push({
        range: targets[idx],
        y: prev.y + (s.y - prev.y) * f,
        z: prev.z + (s.z - prev.z) * f,
        v: prev.v + (v - prev.v) * f,
        t: prev.t + (t - prev.t) * f,
      });
      idx++;
    }
    prev = { x: s.x, y: s.y, z: s.z, t, v };
  }

  // Если пуля не долетела до какой-то дистанции — заполняем последним состоянием.
  while (idx < targets.length) {
    out.push({ range: targets[idx], y: prev.y, z: prev.z, v: prev.v, t: prev.t });
    idx++;
  }
  return out;
}

/** Подбор угла прицеливания так, чтобы траектория пересекла линию прицела на дистанции zeroRange. */
function solveZero(p, zeroRange) {
  let lo = -0.01;
  let hi = 0.1;
  for (let n = 0; n < 36; n++) {
    const mid = (lo + hi) / 2;
    const sample = integrate(p, mid, [zeroRange], 0.001)[0];
    if (sample.y < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Основная функция расчёта.
 * @param {object} input параметры патрона, оружия и среды
 * @returns {{theta:number, thetaDeg:number, samples:Array, rho:number, sound:number}}
 */
/** Угол прицеливания, зафиксированный при пристрелке (без ветра, по горизонтали). */
export function solveZeroAngle(profile) {
  const bc = profile.dragModel === 'G7' ? profile.bcG7 : profile.bc;
  const p = buildParams({
    bulletWeightG: profile.bulletWeightG,
    caliberMm: profile.caliberMm,
    bc,
    dragModel: profile.dragModel,
    muzzleVelocity: profile.muzzleVelocity,
    sightHeightMm: profile.sightHeightMm,
    tempC: profile.tempC,
    pressureHpa: profile.pressureHpa,
    humidityPct: profile.humidityPct,
    windSpeed: 0,
    windFromDeg: 0,
    elevationDeg: 0,
    ranges: [profile.zeroRange],
  });
  return solveZero(p, profile.zeroRange);
}

/**
 * Поправки для режима «Охота»: угол прицела уже выставлен при пристрелке,
 * меняются только условия и расстояние до цели.
 */
export function correctionsAt(profile, theta, field, range, clickMrad) {
  const bc = profile.dragModel === 'G7' ? profile.bcG7 : profile.bc;
  const p = buildParams({
    bulletWeightG: profile.bulletWeightG,
    caliberMm: profile.caliberMm,
    bc,
    dragModel: profile.dragModel,
    muzzleVelocity: profile.muzzleVelocity,
    sightHeightMm: profile.sightHeightMm,
    tempC: field.tempC,
    pressureHpa: field.pressureHpa,
    humidityPct: field.humidityPct ?? profile.humidityPct,
    windSpeed: field.windSpeed,
    windFromDeg: field.windFromDeg,
    elevationDeg: field.elevationDeg ?? 0,
    ranges: [range],
  });
  const s = integrate(p, theta, [range], 0.0004)[0];
  const dropMm = -s.y * 1000;
  const windageMm = s.z * 1000;
  const mrad = (mm) => mm / Math.max(range, 0.001);

  return {
    range,
    dropMm,
    windageMm,
    dropMrad: mrad(dropMm),
    windageMrad: mrad(windageMm),
    dropClicks: mrad(dropMm) / clickMrad,
    windageClicks: mrad(windageMm) / clickMrad,
    velocity: s.v,
    energy: 0.5 * p.massKg * s.v * s.v,
    time: s.t,
    sample: {
      range,
      dropMm,
      windageMm,
      dropMrad: mrad(dropMm),
      windageMrad: mrad(windageMm),
    },
  };
}

export function calculate(input) {
  const ranges = input.ranges && input.ranges.length ? input.ranges : [10, 25, 50, 75, 100];
  const p = buildParams(input);
  const theta = solveZero(p, input.zeroRange);
  const raw = integrate(p, theta, ranges, 0.0004);
  const massKg = p.massKg;

  const samples = raw.map((s) => {
    const safeRange = Math.max(s.range, 0.001);
    return {
      range: s.range,
      dropMm: -s.y * 1000, // положительное = ниже линии прицела
      windageMm: s.z * 1000, // положительное = вправо
      velocity: s.v,
      energy: 0.5 * massKg * s.v * s.v,
      time: s.t,
      // 1 мрад ≈ 1 мм на 1 м: переводим отношение в миллирадианы (×1000).
      dropMrad: (-s.y / safeRange) * 1000,
      windageMrad: (s.z / safeRange) * 1000,
      mach: s.v / p.sound,
    };
  });

  return {
    theta,
    thetaDeg: (theta * 180) / Math.PI,
    samples,
    rho: p.rho,
    sound: p.sound,
    bc: input.bc,
    dragModel: TABLES[input.dragModel] ? input.dragModel : 'G1',
    ballisticCoefficientSi: input.bc * LB_IN2_TO_KG_M2,
    formFactor: p.i,
  };
}

/** Плотная траектория с шагом по времени —для поиска пересечений и апогея. */
function trace(p, theta, maxRange, dt = 0.0004) {
  let s = {
    x: 0,
    y: -p.sightHeight,
    z: 0,
    vx: p.v0 * Math.cos(theta),
    vy: p.v0 * Math.sin(theta),
    vz: 0,
  };
  const out = [{ x: 0, y: s.y, z: 0, t: 0, v: p.v0 }];
  let t = 0;
  while (s.x < maxRange && t < 20) {
    s = rk4Step(s, dt, p);
    t += dt;
    out.push({ x: s.x, y: s.y, z: s.z, t, v: Math.hypot(s.vx, s.vy, s.vz) });
  }
  return out;
}

function crossings(samples, level) {
  const found = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const va = a.y - level;
    const vb = b.y - level;
    if (va === 0) {
      found.push(a.x);
    } else if (va * vb < 0) {
      const f = -va / (vb - va);
      found.push(a.x + (b.x - a.x) * f);
    }
  }
  return found;
}

/**
 * Параметры прямого выстрела: ближний и дальний ноль, апогей,
 * максимальная дистанция прямого выстрела для цели заданной высоты.
 */
export function directShot(input, targetHeightMm = 50) {
  const p = buildParams(input);
  const theta = solveZero(p, input.zeroRange);
  const maxRange = Math.max(1.6 * input.zeroRange, ...(input.ranges || [100])) * 1.2;
  const samples = trace(p, theta, maxRange, 0.0004);
  const half = targetHeightMm / 2000; // половина высоты цели, м

  const zeros = crossings(samples, 0);
  const lower = crossings(samples, -half);
  const upper = crossings(samples, half);
  const apex = samples.reduce((best, s) => (s.y > best.y ? s : best), samples[0]);

  const nearZero = zeros.length ? zeros[0] : null;
  const farZero = zeros.length > 1 ? zeros[zeros.length - 1] : zeros[0] ?? null;
  const mpbr = lower.length ? lower[lower.length - 1] : null;
  let bandStart = p.sightHeight <= half ? 0 : lower.length ? lower[0] : null;
  const bandEnd = mpbr;

  // Зона поражения на дистанции пристрелки: интервал глубины, где пуля в цели.
  const dangerNear = upper.length > 1 ? upper[1] : upper[0] ?? null;
  const dangerFar = mpbr;

  return {
    targetHeightMm,
    halfBandMm: targetHeightMm / 2,
    nearZero,
    farZero,
    apexRange: apex.x,
    apexMm: apex.y * 1000,
    mpbr,
    bandStart,
    bandEnd,
    dangerNear,
    dangerFar,
    samples: samples.map((s) => ({
      range: s.x,
      heightMm: s.y * 1000, // положительное = выше линии прицела
      windageMm: s.z * 1000,
    })),
  };
}
