import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, airDensity, speedOfSound } from '../public/js/ballistics.js';

const base = {
  bulletWeightG: 2.59,
  caliberMm: 5.56,
  bc: 0.112,
  muzzleVelocity: 326,
  sightHeightMm: 25,
  zeroRange: 50,
  tempC: 15,
  pressureHpa: 1013.25,
  humidityPct: 50,
  windSpeed: 0,
  ranges: [10, 25, 50, 75, 100],
};

test('плотность воздуха и скорость звука при стандартных условиях', () => {
  assert.ok(Math.abs(speedOfSound(15) - 340.3) < 1);
  assert.ok(Math.abs(airDensity(15, 1013.25, 0) - 1.225) < 0.02);
});

test('траектория .22LR: пристрелка на 50 м и падение на 100 м', () => {
  const res = calculate(base);
  const at50 = res.samples.find((s) => s.range === 50);
  const at100 = res.samples.find((s) => s.range === 100);
  assert.ok(Math.abs(at50.dropMm) < 5, `drop@50 = ${at50.dropMm}`);
  assert.ok(at100.dropMm > 120 && at100.dropMm < 450, `drop@100 = ${at100.dropMm}`);
  assert.ok(at100.velocity < base.muzzleVelocity);
  assert.ok(at100.energy > 0);
});

test('больший BC даёт меньшее падение', () => {
  const low = calculate({ ...base, bc: 0.09 }).samples.find((s) => s.range === 100);
  const high = calculate({ ...base, bc: 0.2 }).samples.find((s) => s.range === 100);
  assert.ok(high.dropMm < low.dropMm, `${high.dropMm} vs ${low.dropMm}`);
  assert.ok(high.velocity > low.velocity);
});

test('боковой ветер вызывает снос вправо', () => {
  const res = calculate({ ...base, windSpeed: 4, windFromDeg: 90 });
  const at100 = res.samples.find((s) => s.range === 100);
  assert.ok(at100.windageMm > 0, `windage = ${at100.windageMm}`);
});

test('G7 с пересчитанным BC даёт близкую траекторию к G1', () => {
  const g1 = calculate({ ...base, dragModel: 'G1', bc: 0.112 });
  const g7 = calculate({ ...base, dragModel: 'G7', bc: 0.063 });
  const a = g1.samples.find((s) => s.range === 100);
  const b = g7.samples.find((s) => s.range === 100);
  assert.ok(Math.abs(a.dropMm - b.dropMm) < 120, `${a.dropMm} vs ${b.dropMm}`);
  assert.ok(Math.abs(a.velocity - b.velocity) < 25, `${a.velocity} vs ${b.velocity}`);
  assert.equal(g1.dragModel, 'G1');
  assert.equal(g7.dragModel, 'G7');
});

test('высота прицела увеличивает угол прицеливания', () => {
  const low = calculate({ ...base, sightHeightMm: 10 });
  const high = calculate({ ...base, sightHeightMm: 50 });
  assert.ok(high.theta > low.theta);
});
