import { calculate } from './ballistics.js';
import { loadCatalog, getCatalog, findCartridge, findRifle } from './catalog.js';
import {
  loadState,
  saveState,
  loadCustom,
  addCustomCartridge,
  addCustomRifle,
  deleteCustom,
} from './storage.js';
import { createTrajectoryChart } from './chart.js';

const DEFAULT_STATE = {
  cartridgeId: '',
  bulletWeightG: 2.59,
  caliberMm: 5.56,
  bc: 0.112,
  muzzleVelocity: 326,
  rifleId: '',
  sightHeightMm: 25,
  zeroRange: 50,
  tempC: 15,
  pressureHpa: 1013.25,
  humidityPct: 50,
  windSpeed: 3,
  windFromDeg: 90,
  elevationDeg: 0,
  ranges: [10, 25, 50, 75, 100],
};

const NUMERIC_FIELDS = [
  'bulletWeightG', 'caliberMm', 'bc', 'muzzleVelocity',
  'sightHeightMm', 'zeroRange', 'tempC', 'pressureHpa',
  'humidityPct', 'windSpeed', 'windFromDeg', 'elevationDeg',
];

const $ = (id) => document.getElementById(id);
let chart = null;
let deferredInstall = null;

function num(id, fallback) {
  const v = parseFloat($(id).value.replace(',', '.'));
  return Number.isFinite(v) ? v : fallback;
}

function fill(id, value) {
  $(id).value = value;
}

function applyState(state) {
  const s = { ...DEFAULT_STATE, ...state };
  fill('bulletWeightG', s.bulletWeightG);
  fill('caliberMm', s.caliberMm);
  fill('bc', s.bc);
  fill('muzzleVelocity', s.muzzleVelocity);
  fill('sightHeightMm', s.sightHeightMm);
  fill('zeroRange', s.zeroRange);
  fill('tempC', s.tempC);
  fill('pressureHpa', s.pressureHpa);
  fill('humidityPct', s.humidityPct);
  fill('windSpeed', s.windSpeed);
  fill('windFromDeg', s.windFromDeg);
  fill('elevationDeg', s.elevationDeg);
  fill('ranges', s.ranges.join(', '));
  $('cartridgeId').value = s.cartridgeId || '';
  $('rifleId').value = s.rifleId || '';
}

function collectState() {
  const state = { cartridgeId: $('cartridgeId').value, rifleId: $('rifleId').value };
  for (const f of NUMERIC_FIELDS) {
    const id = f === 'cartridgeId' || f === 'rifleId' ? f : f;
    state[f] = num(id, DEFAULT_STATE[f]);
  }
  state.ranges = $('ranges').value
    .split(/[,\s;]+/)
    .map((v) => parseFloat(v.replace(',', '.')))
    .filter((v) => Number.isFinite(v) && v > 0)
    .slice(0, 20);
  if (!state.ranges.length) state.ranges = DEFAULT_STATE.ranges.slice();
  return state;
}

function persist() {
  saveState(collectState());
}

function populateSelect(select, items, placeholder, selected) {
  select.innerHTML = '';
  const first = document.createElement('option');
  first.value = '';
  first.textContent = placeholder;
  select.appendChild(first);
  for (const item of items) {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = (item.custom ? '★ ' : '') + item.name;
    select.appendChild(opt);
  }
  select.value = selected || '';
}

function populateSelects(state) {
  const custom = loadCustom();
  const catalog = getCatalog();
  populateSelect(
    $('cartridgeSelect'),
    [...(catalog.cartridges || []), ...(custom.cartridges || [])],
    'Вручную',
    state.cartridgeId,
  );
  populateSelect(
    $('rifleSelect'),
    [...(catalog.rifles || []), ...(custom.rifles || [])],
    'Вручную',
    state.rifleId,
  );
  $('cartridgeId').value = state.cartridgeId || '';
  $('rifleId').value = state.rifleId || '';
}

function applyCartridge(id) {
  const c = findCartridge(id) || loadCustom().cartridges.find((x) => x.id === id);
  if (!c) return;
  fill('bulletWeightG', c.bulletWeightG);
  fill('caliberMm', c.caliberMm);
  fill('bc', c.bc);
  fill('muzzleVelocity', c.muzzleVelocity);
  $('cartridgeId').value = id;
}

function applyRifle(id) {
  const r = findRifle(id) || loadCustom().rifles.find((x) => x.id === id);
  if (!r) return;
  fill('sightHeightMm', r.sightHeightMm);
  fill('zeroRange', r.zeroRange);
  $('rifleId').value = id;
}

function fmt(v, digits = 1) {
  return Number.isFinite(v) ? v.toFixed(digits).replace('.', ',') : '—';
}

function renderSummary(result, state) {
  const last = result.samples[result.samples.length - 1];
  const cards = [
    { label: 'Угол прицеливания', value: fmt(result.thetaDeg, 3) + '°', hint: 'относительно линии ствола' },
    { label: 'Энергия у дула', value: fmt(0.5 * (state.bulletWeightG / 1000) * state.muzzleVelocity ** 2, 0) + ' Дж', hint: '' },
    { label: 'Скорость на ' + fmt(last.range, 0) + ' м', value: fmt(last.velocity, 0) + ' м/с', hint: 'число Маха ' + fmt(last.mach, 2) },
    { label: 'Плотность воздуха', value: fmt(result.rho, 3) + ' кг/м³', hint: 'звук ' + fmt(result.sound, 0) + ' м/с' },
  ];
  $('summaryCards').innerHTML = cards
    .map(
      (c) =>
        `<div class="card"><div class="card-label">${c.label}</div>` +
        `<div class="card-value">${c.value}</div>` +
        `<div class="card-hint">${c.hint}</div></div>`,
    )
    .join('');
}

function renderTable(result) {
  const head =
    '<thead><tr><th>Дальность, м</th><th>Скорость, м/с</th><th>Энергия, Дж</th>' +
    '<th>Падение, мм</th><th>Снос, мм</th><th>Время, с</th><th>Поправка, мрад</th></tr></thead>';
  const rows = result.samples
    .map(
      (s) =>
        `<tr><td>${fmt(s.range, 0)}</td><td>${fmt(s.velocity, 0)}</td>` +
        `<td>${fmt(s.energy, 0)}</td><td class="${s.dropMm > 0 ? 'down' : 'up'}">${fmt(s.dropMm)}</td>` +
        `<td class="${s.windageMm > 0 ? 'right' : 'left'}">${fmt(s.windageMm)}</td>` +
        `<td>${fmt(s.time, 3)}</td><td>${fmt(s.dropMrad, 2)} / ${fmt(s.windageMrad, 2)}</td></tr>`,
    )
    .join('');
  $('resultTable').innerHTML = head + '<tbody>' + rows + '</tbody>';
}

function calculateAndRender() {
  const state = collectState();
  if (state.zeroRange <= 0) {
    $('errorBox').hidden = false;
    $('errorBox').textContent = 'Дистанция пристрелки должна быть больше нуля.';
    return;
  }
  if (state.bulletWeightG <= 0 || state.caliberMm <= 0 || state.bc <= 0 || state.muzzleVelocity <= 0) {
    $('errorBox').hidden = false;
    $('errorBox').textContent = 'Проверьте параметры патрона: всё должно быть больше нуля.';
    return;
  }
  $('errorBox').hidden = true;

  const result = calculate({
    bulletWeightG: state.bulletWeightG,
    caliberMm: state.caliberMm,
    bc: state.bc,
    muzzleVelocity: state.muzzleVelocity,
    sightHeightMm: state.sightHeightMm,
    zeroRange: state.zeroRange,
    tempC: state.tempC,
    pressureHpa: state.pressureHpa,
    humidityPct: state.humidityPct,
    windSpeed: state.windSpeed,
    windFromDeg: state.windFromDeg,
    elevationDeg: state.elevationDeg,
    ranges: state.ranges,
  });
  renderSummary(result, state);
  renderTable(result);
  if (chart) chart.setData(result);
  persist();
}

function exportCsv() {
  const table = $('resultTable');
  const rows = [...table.querySelectorAll('tr')].map((tr) =>
    [...tr.querySelectorAll('th,td')].map((cell) => cell.textContent).join(';'),
  );
  const blob = new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ballistics.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function updateConnectionUI() {
  const online = navigator.onLine;
  const badge = $('statusBadge');
  badge.textContent = online ? '● Онлайн' : '● Офлайн';
  badge.classList.toggle('offline', !online);
  $('offlineHint').textContent = online
    ? 'Справочник загружен и сохранён для работы без интернета.'
    : 'Офлайн-режим: используется сохранённый справочник и кэш приложения.';
}

function openAddDialog(which) {
  const dlg = $(which === 'cartridge' ? 'dlgCartridge' : 'dlgRifle');
  dlg.showModal();
}

function bindDialogs() {
  $('addCartridgeBtn').addEventListener('click', () => openAddDialog('cartridge'));
  $('addRifleBtn').addEventListener('click', () => openAddDialog('rifle'));

  $('dlgCartridge').querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const item = {
      name: f.get('name').trim(),
      bulletWeightG: parseFloat(f.get('weight')),
      caliberMm: parseFloat(f.get('caliber')),
      bc: parseFloat(f.get('bc')),
      muzzleVelocity: parseFloat(f.get('velocity')),
    };
    if (!item.name || [item.bulletWeightG, item.caliberMm, item.bc, item.muzzleVelocity].some((v) => !Number.isFinite(v) || v <= 0)) return;
    const saved = addCustomCartridge(item);
    applyCartridge(saved.id);
    const state = collectState();
    populateSelects(state);
    $('cartridgeId').value = saved.id;
    $('cartridgeSelect').value = saved.id;
    $('dlgCartridge').close();
    e.target.reset();
    calculateAndRender();
  });

  $('dlgRifle').querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const item = {
      name: f.get('name').trim(),
      sightHeightMm: parseFloat(f.get('sight')),
      zeroRange: parseFloat(f.get('zero')),
    };
    if (!item.name || !Number.isFinite(item.sightHeightMm) || !Number.isFinite(item.zeroRange)) return;
    const saved = addCustomRifle(item);
    applyRifle(saved.id);
    const state = collectState();
    populateSelects(state);
    $('rifleId').value = saved.id;
    $('rifleSelect').value = saved.id;
    $('dlgRifle').close();
    e.target.reset();
    calculateAndRender();
  });

  for (const id of ['dlgCartridge', 'dlgRifle']) {
    $(id).querySelector('[data-close]').addEventListener('click', () => $(id).close());
  }
}

function bindEvents() {
  $('cartridgeSelect').addEventListener('change', (e) => {
    applyCartridge(e.target.value);
    calculateAndRender();
  });
  $('rifleSelect').addEventListener('change', (e) => {
    applyRifle(e.target.value);
    calculateAndRender();
  });
  const cartridgeFields = ['bulletWeightG', 'caliberMm', 'bc', 'muzzleVelocity'];
  const rifleFields = ['sightHeightMm', 'zeroRange'];
  for (const f of NUMERIC_FIELDS) {
    $(f).addEventListener('input', () => {
      if (cartridgeFields.includes(f)) {
        $('cartridgeSelect').value = '';
        $('cartridgeId').value = '';
      }
      if (rifleFields.includes(f)) {
        $('rifleSelect').value = '';
        $('rifleId').value = '';
      }
      calculateAndRender();
    });
  }
  $('ranges').addEventListener('input', calculateAndRender);
  $('calcBtn').addEventListener('click', calculateAndRender);
  $('exportBtn').addEventListener('click', exportCsv);
  $('resetBtn').addEventListener('click', () => {
    if (!confirm('Сбросить все параметры к значениям по умолчанию?')) return;
    applyState(DEFAULT_STATE);
    calculateAndRender();
  });
  window.addEventListener('online', updateConnectionUI);
  window.addEventListener('offline', updateConnectionUI);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch((err) =>
      console.warn('Service worker registration failed:', err),
    );
  }
}

function bindInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    $('installBtn').hidden = false;
  });
  $('installBtn').addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    $('installBtn').hidden = true;
  });
}

async function init() {
  chart = createTrajectoryChart($('chart'), $('chartTooltip'));
  bindEvents();
  bindDialogs();
  bindInstall();
  registerServiceWorker();
  updateConnectionUI();

  const state = loadState() || DEFAULT_STATE;
  populateSelects(state);
  applyState(state);
  await loadCatalog();
  populateSelects(collectState());
  chart.resize();
  calculateAndRender();
}

init();
