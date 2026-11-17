import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

test('runtime: приложение инициализируется и строит таблицу результатов', async () => {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  const store = new Map();

  const noopCtx = new Proxy(
    {
      setTransform() {}, scale() {}, save() {}, restore() {},
      clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {},
      moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {},
      fillText() {}, setLineDash() {}, rect() {}, clip() {},
    },
    { get: (t, p) => (p in t ? t[p] : () => {}), set: () => true },
  );

  window.HTMLCanvasElement.prototype.getContext = () => noopCtx;
  window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
    width: 800, height: 260, left: 0, top: 0, right: 800, bottom: 260,
  });
  window.devicePixelRatio = 1;
  window.fetch = async (url) => {
    if (String(url).includes('catalog.json')) {
      return new Response(fs.readFileSync(path.join(root, 'public/data/catalog.json'), 'utf8'), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('', { status: 404 });
  };

  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message));

  const g = globalThis;
  g.window = window;
  g.document = window.document;
  g.HTMLCanvasElement = window.HTMLCanvasElement;
  Object.defineProperty(g, 'navigator', {
    value: { onLine: true },
    configurable: true,
    writable: true,
  });
  g.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  g.fetch = window.fetch;
  g.confirm = () => true;

  await import('../public/js/app.js');
  await new Promise((r) => setTimeout(r, 100));

  const doc = window.document;
  assert.deepEqual(errors, [], `JS-ошибки: ${errors.join('; ')}`);
  const rows = doc.querySelectorAll('#resultTable tbody tr');
  assert.equal(rows.length, 7, 'ожидается 7 строк: 40..100 с шагом 10');
  assert.match(rows[0].textContent, /40/);
  assert.match(rows[6].textContent, /100/);
  assert.equal(doc.querySelectorAll('#summaryCards .card').length, 5);
  assert.equal(doc.querySelectorAll('#reticleRange option').length, 7, 'в ретике должен быть список дистанций');
  assert.equal(doc.querySelectorAll('#resultTable tbody td[data-label]').length, 49, 'у всех ячеек должны быть подписи для мобильной версии');
  assert.equal(doc.querySelectorAll('#resultTable thead th').length, 7, 'по умолчанию включены 7 столбцов из 8');

  // Галочки столбцов реально скрывают колонки.
  const colTime = doc.getElementById('col-time');
  colTime.checked = true;
  colTime.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(doc.querySelectorAll('#resultTable thead th').length, 8);

  // Блоки ввода скрываются галочками.
  assert.equal(doc.querySelector('[data-section="conditions"]').hidden, true);
  const sec = doc.getElementById('sec-conditions');
  sec.checked = true;
  sec.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(doc.querySelector('[data-section="conditions"]').hidden, false);
  assert.equal(doc.querySelectorAll('#cartridgeSelect option').length, 9);
  assert.equal(doc.querySelectorAll('#rifleSelect option').length, 5);
  assert.match(doc.getElementById('statusBadge').textContent, /Онлайн/);

  dom.window.close();
});
