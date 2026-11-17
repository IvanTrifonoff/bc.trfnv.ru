/**
 * Баллистический движок: модель точечной массы, кривая сопротивления G1.
 * Интегрирование методом Рунге-Кутты 4-го порядка.
 * Все единицы СИ: м, с, кг, Па.
 */

export const GRAVITY = 9.80665;
export const LB_IN2_TO_KG_M2 = 703.069579;

// Приближение кривой G1: коэффициент лобового сопротивления Cd по числу Маха.
// Значения согласованы с классическими таблицами Ingalls/G1 для sporting bullets.
const G1_CD = [
  [0.00, 0.00],
  [0.10, 0.22],
  [0.20, 0.27],
  [0.30, 0.31],
  [0.40, 0.34],
  [0.50, 0.37],
  [0.60, 0.40],
  [0.70, 0.44],
  [0.80, 0.50],
  [0.90, 0.62],
  [1.00, 0.72],
  [1.10, 0.76],
  [1.20, 0.75],
  [1.30, 0.71],
  [1.50, 0.64],
  [1.75, 0.57],
  [2.00, 0.52],
  [2.50, 0.45],
  [3.00, 0.40],
  [4.00, 0.34],
  [5.00, 0.30],
];

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

function cdG1(mach) {
  if (mach <= 0) return 0;
  if (mach >= G1_CD[G1_CD.length - 1][0]) return G1_CD[G1_CD.length - 1][1];
  for (let i = 1; i < G1_CD.length; i++) {
    const [m1, c1] = G1_CD[i];
    if (mach <= m1) {
      const [m0, c0] = G1_CD[i - 1];
      const f = (mach - m0) / (m1 - m0);
      return c0 + (c1 - c0) * f;
    }
  }
  return 0.3;
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
  const cd = p.i * cdG1(rv / p.sound);
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
      dropMrad: -s.y / safeRange,
      windageMrad: s.z / safeRange,
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
    ballisticCoefficientSi: input.bc * LB_IN2_TO_KG_M2,
    formFactor: p.i,
  };
}
