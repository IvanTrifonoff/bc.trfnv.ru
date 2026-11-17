import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

test('DOM: все используемые в app.js идентификаторы присутствуют', async () => {
  const appJs = fs.readFileSync(path.join(root, 'public/js/app.js'), 'utf8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const ids = new Set(
    [...appJs.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]),
  );
  const missing = [...ids].filter((id) => !doc.getElementById(id));
  assert.deepEqual(missing, [], `отсутствуют: ${missing.join(', ')}`);
  dom.window.close();
});

test('DOM: все поля NUMERIC_FIELDS и справочники присутствуют', () => {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const fields = [
    'bulletWeightG', 'caliberMm', 'bc', 'muzzleVelocity',
    'sightHeightMm', 'zeroRange', 'tempC', 'pressureHpa',
    'humidityPct', 'windSpeed', 'windFromDeg', 'elevationDeg',
    'cartridgeSelect', 'rifleSelect', 'rangeFrom', 'rangeTo', 'rangeStep',
    'resultTable', 'chart', 'themeToggle', 'sec-cartridge', 'sec-conditions',
    'col-drop', 'col-clicks',
  ];
  const missing = fields.filter((id) => !doc.getElementById(id));
  assert.deepEqual(missing, []);
  dom.window.close();
});

test('манифест и service worker согласованы по активам', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.webmanifest'), 'utf8'));
  const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
  for (const icon of manifest.icons) {
    assert.ok(sw.includes(`'./${icon.src}'`), `иконка ${icon.src} отсутствует в sw.js`);
    assert.ok(fs.existsSync(path.join(root, 'public', icon.src)), `файл ${icon.src} не найден`);
  }
});
