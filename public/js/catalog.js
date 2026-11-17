/** Каталог патронов и оружия. Загружается из /data/catalog.json и кэшируется SW. */

const CATALOG_URL = 'data/catalog.json';
const FALLBACK = {
  cartridges: [],
  rifles: [],
};

let cache = FALLBACK;

/** Загружает справочник (при работе онлайн). Офлайн используется последняя загруженная копия. */
export async function loadCatalog() {
  try {
    const res = await fetch(CATALOG_URL, { cache: 'no-cache' });
    if (res.ok) {
      cache = await res.json();
      try {
        localStorage.setItem('ballistics.catalog.cache', JSON.stringify(cache));
      } catch (_) {
        /* приватный режим — игнорируем */
      }
    }
  } catch (_) {
    try {
      const saved = localStorage.getItem('ballistics.catalog.cache');
      if (saved) cache = JSON.parse(saved);
    } catch (_) {
      /* ignore */
    }
  }
  return cache;
}

export function getCatalog() {
  return cache;
}

export function findCartridge(id) {
  return cache.cartridges.find((c) => c.id === id) || null;
}

export function findRifle(id) {
  return cache.rifles.find((r) => r.id === id) || null;
}
