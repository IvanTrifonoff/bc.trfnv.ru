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
import { createReticle } from './reticle.js';

const DEFAULT_STATE = {
  cartridgeId: '',
  bulletWeightG: 2.59,
  caliberMm: 5.56,
  bc: 0.112,
  bcG7: 0.063,
  dragModel: 'G1',
  muzzleVelocity: 326,
  clickMrad: 0.1,
  rifleId: '',
  sightHeightMm: 25,
  zeroRange: 50,
  tempC: 15,
  pressureHpa: 1013.25,
  humidityPct: 50,
  windSpeed: 3,
  windFromDeg: 90,
  elevationDeg: 0,
  rangeFrom: 40,
  rangeTo: 100,
  rangeStep: 10,
  sections: { cartridge: true, advanced: false, rifle: true, zero: true, conditions: false, ranges: true },
  columns: { velocity: true, energy: true, drop: true, windage: true, time: false, mrad: true, clicks: true },
};

const NUMERIC_FIELDS = [
  'bulletWeightG', 'caliberMm', 'bc', 'bcG7', 'muzzleVelocity', 'clickMrad',
  'sightHeightMm', 'zeroRange', 'tempC', 'pressureHpa',
  'humidityPct', 'windSpeed', 'windFromDeg', 'elevationDeg',
  'rangeFrom', 'rangeTo', 'rangeStep',
];

const SECTION_IDS = ['cartridge', 'advanced', 'rifle', 'zero', 'conditions', 'ranges'];
const COLUMN_IDS = ['velocity', 'energy', 'drop', 'windage', 'time', 'mrad', 'clicks'];

const $ = (id) => document.getElementById(id);
let chart = null;
let reticle = null;
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
  // Совместимость со старыми сохранёнными состояниями, где был список дистанций.
  if (s.rangeFrom == null && Array.isArray(state.ranges) && state.ranges.length) {
    s.rangeFrom = state.ranges[0];
    s.rangeTo = state.ranges[state.ranges.length - 1];
    s.rangeStep = state.ranges.length > 1 ? state.ranges[1] - state.ranges[0] : 10;
  }
  fill('bulletWeightG', s.bulletWeightG);
  fill('caliberMm', s.caliberMm);
  fill('bc', s.bc);
  fill('bcG7', s.bcG7);
  fill('clickMrad', s.clickMrad);
  $('dragModel').value = s.dragModel || 'G1';
  fill('muzzleVelocity', s.muzzleVelocity);
  fill('sightHeightMm', s.sightHeightMm);
  fill('zeroRange', s.zeroRange);
  fill('tempC', s.tempC);
  fill('pressureHpa', s.pressureHpa);
  fill('humidityPct', s.humidityPct);
  fill('windSpeed', s.windSpeed);
  fill('windFromDeg', s.windFromDeg);
  fill('elevationDeg', s.elevationDeg);
  fill('rangeFrom', s.rangeFrom);
  fill('rangeTo', s.rangeTo);
  fill('rangeStep', s.rangeStep);
  for (const id of SECTION_IDS) {
    $(`sec-${id}`).checked = (s.sections || {})[id] ?? DEFAULT_STATE.sections[id];
  }
  for (const id of COLUMN_IDS) {
    $(`col-${id}`).checked = (s.columns || {})[id] ?? DEFAULT_STATE.columns[id];
  }
  $('cartridgeId').value = s.cartridgeId || '';
  $('rifleId').value = s.rifleId || '';
  applySectionVisibility();
}

function applySectionVisibility() {
  for (const id of SECTION_IDS) {
    const body = document.querySelector(`[data-section="${id}"]`);
    if (body) body.hidden = !$(`sec-${id}`).checked;
  }
}

function collectState() {
  const state = {
    cartridgeId: $('cartridgeId').value,
    rifleId: $('rifleId').value,
    dragModel: $('dragModel').value,
  };
  for (const f of NUMERIC_FIELDS) {
    const id = f === 'cartridgeId' || f === 'rifleId' ? f : f;
    state[f] = num(id, DEFAULT_STATE[f]);
  }
  const from = num('rangeFrom', DEFAULT_STATE.rangeFrom);
  const to = num('rangeTo', DEFAULT_STATE.rangeTo);
  const step = num('rangeStep', DEFAULT_STATE.rangeStep);
  state.rangeFrom = from;
  state.rangeTo = to;
  state.rangeStep = step;
  state.ranges = [];
  if (step > 0 && to >= from) {
    for (let r = from; r <= to + 1e-9 && state.ranges.length < 30; r += step) {
      state.ranges.push(Math.round(r * 1000) / 1000);
    }
  }
  state.sections = Object.fromEntries(SECTION_IDS.map((id) => [id, $(`sec-${id}`).checked]));
  state.columns = Object.fromEntries(COLUMN_IDS.map((id) => [id, $(`col-${id}`).checked]));
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
  fill('bcG7', c.bcG7 ?? c.bc);
  fill('muzzleVelocity', c.muzzleVelocity);
  $('cartridgeId').value = id;
}

function applyRifle(id) {
  const r = findRifle(id) || loadCustom().rifles.find((x) => x.id === id);
  if (!r) return;
  // Дистанция пристрелки — параметр стрелка; выбор винтовки её не перезаписывает.
  fill('sightHeightMm', r.sightHeightMm);
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
    { label: 'Модель / BC', value: result.dragModel + ' ' + fmt(result.bc, 3), hint: 'коэффициент формы ' + fmt(result.formFactor, 2) },
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

function renderTable(result, state) {
  const click = state.clickMrad || 0.1;
  const cols = [
    { id: 'range', label: 'Дальность, м', cell: (s) => fmt(s.range, 0) },
    { id: 'velocity', label: 'Скорость, м/с', cell: (s) => fmt(s.velocity, 0) },
    { id: 'energy', label: 'Энергия, Дж', cell: (s) => fmt(s.energy, 0) },
    { id: 'drop', label: 'Падение, мм', cls: (s) => (s.dropMm > 0 ? 'down' : 'up'), cell: (s) => fmt(s.dropMm) },
    { id: 'windage', label: 'Снос, мм', cls: (s) => (s.windageMm > 0 ? 'right' : 'left'), cell: (s) => fmt(s.windageMm) },
    { id: 'time', label: 'Время, с', cell: (s) => fmt(s.time, 3) },
    { id: 'mrad', label: 'Поправка, мрад', cell: (s) => fmt(s.dropMrad, 2) + ' / ' + fmt(s.windageMrad, 2) },
    { id: 'clicks', label: 'Клики в/г', cell: (s) => fmt(s.dropMrad / click, 0) + ' / ' + fmt(s.windageMrad / click, 0) },
  ];
  const active = cols.filter((c) => c.id === 'range' || state.columns[c.id]);
  const head = '<thead><tr>' + active.map((c) => `<th>${c.label}</th>`).join('') + '</tr></thead>';
  const rows = result.samples
    .map(
      (s) =>
        '<tr>' +
        active
          .map(
            (c) =>
              `<td data-label="${c.label}"${c.cls ? ` class="${c.cls(s)}"` : ''}>${c.cell(s)}</td>`,
          )
          .join('') +
        '</tr>',
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
  const activeBc = state.dragModel === 'G7' ? state.bcG7 : state.bc;
  if (state.bulletWeightG <= 0 || state.caliberMm <= 0 || activeBc <= 0 || state.muzzleVelocity <= 0 || state.clickMrad <= 0) {
    $('errorBox').hidden = false;
    $('errorBox').textContent = 'Проверьте параметры патрона и цену щелчка: всё должно быть больше нуля.';
    return;
  }
  if (!state.ranges.length || state.rangeFrom <= 0 || state.rangeTo < state.rangeFrom || state.rangeStep <= 0) {
    $('errorBox').hidden = false;
    $('errorBox').textContent = 'Проверьте диапазон дистанций: «до» должно быть не меньше «от», шаг — больше нуля.';
    return;
  }
  $('errorBox').hidden = true;

  const result = calculate({
    bulletWeightG: state.bulletWeightG,
    caliberMm: state.caliberMm,
    bc: activeBc,
    dragModel: state.dragModel,
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
  renderTable(result, state);
  if (chart) chart.setData(result);

  const rangeSelect = $('reticleRange');
  const previous = rangeSelect.value;
  rangeSelect.innerHTML = '';
  for (const s of result.samples) {
    const opt = document.createElement('option');
    opt.value = String(s.range);
    opt.textContent = fmt(s.range, 0) + ' м';
    rangeSelect.appendChild(opt);
  }
  const keep = result.samples.some((s) => String(s.range) === previous);
  rangeSelect.value = keep ? previous : String(result.samples[result.samples.length - 1].range);
  if (reticle) {
    reticle.setData(result.samples, state);
    reticle.setRange(parseFloat(rangeSelect.value));
    reticle.setOptions({
      reticleType: $('reticleType').value,
      targetCm: parseFloat($('targetSizeCm').value),
    });
  }
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
      bcG7: parseFloat(f.get('bc7')),
      muzzleVelocity: parseFloat(f.get('velocity')),
    };
    if (!item.name || [item.bulletWeightG, item.caliberMm, item.bc, item.bcG7, item.muzzleVelocity].some((v) => !Number.isFinite(v) || v <= 0)) return;
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
    };
    if (!item.name || !Number.isFinite(item.sightHeightMm) || item.sightHeightMm < 0) return;
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
  const cartridgeFields = ['bulletWeightG', 'caliberMm', 'bc', 'bcG7', 'muzzleVelocity'];
  const rifleFields = ['sightHeightMm'];
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
  for (const id of ['rangeFrom', 'rangeTo', 'rangeStep']) {
    $(id).addEventListener('input', calculateAndRender);
  }
  for (const id of SECTION_IDS) {
    $(`sec-${id}`).addEventListener('change', () => {
      applySectionVisibility();
      persist();
    });
  }
  for (const id of COLUMN_IDS) {
    $(`col-${id}`).addEventListener('change', calculateAndRender);
  }
  $('themeToggle').addEventListener('change', (e) => {
    document.documentElement.classList.toggle('dark', e.target.checked);
    try {
      localStorage.setItem('ballistics.theme', e.target.checked ? 'dark' : 'light');
    } catch (_) { /* ignore */ }
  });
  $('dragModel').addEventListener('change', calculateAndRender);
  $('calcBtn').addEventListener('click', calculateAndRender);
  $('exportBtn').addEventListener('click', exportCsv);
  $('reticleRange').addEventListener('change', (e) => reticle && reticle.setRange(parseFloat(e.target.value)));
  $('reticleType').addEventListener('change', (e) => reticle && reticle.setOptions({ reticleType: e.target.value }));
  $('targetSizeCm').addEventListener('input', (e) => reticle && reticle.setOptions({ targetCm: parseFloat(e.target.value) }));
  $('downloadReticleBtn').addEventListener('click', () => reticle && reticle.exportPNG());
  $('printReticleBtn').addEventListener('click', () => window.print());
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
  $('themeToggle').checked = document.documentElement.classList.contains('dark');
  chart = createTrajectoryChart($('chart'), $('chartTooltip'));
  reticle = createReticle($('reticleCanvas'));
  reticle.resize();
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
