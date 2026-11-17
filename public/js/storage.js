/** Локальное хранение состояния и пользовательских элементов справочника. */

const KEY_STATE = 'ballistics.state.v1';
const KEY_CUSTOM = 'ballistics.custom.v1';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    /* ignore */
  }
}

export const loadState = () => read(KEY_STATE, null);
export const saveState = (state) => write(KEY_STATE, state);

export const loadCustom = () =>
  read(KEY_CUSTOM, { cartridges: [], rifles: [] });

export const saveCustom = (custom) => write(KEY_CUSTOM, custom);

export function addCustomCartridge(item) {
  const custom = loadCustom();
  const entry = { ...item, id: `custom-${Date.now()}`, custom: true };
  custom.cartridges.push(entry);
  saveCustom(custom);
  return entry;
}

export function addCustomRifle(item) {
  const custom = loadCustom();
  const entry = { ...item, id: `custom-${Date.now()}`, custom: true };
  custom.rifles.push(entry);
  saveCustom(custom);
  return entry;
}

export function deleteCustom(type, id) {
  const custom = loadCustom();
  custom[type] = custom[type].filter((item) => item.id !== id);
  saveCustom(custom);
}
