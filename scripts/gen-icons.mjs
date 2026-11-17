// Генератор PNG-иконок без внешних зависимостей (только zlib из Node.js).
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function pixel(x, y, size) {
  const u = x / size;
  const v = y / size;
  let r = 17, g = 24, b = 39; // #111827

  // Траектория: красная парабола
  const apexU = 0.45;
  const apexV = 0.25;
  const k = 3.29;
  if (u >= 0.15 && u <= 0.82) {
    const pv = apexV + k * (u - apexU) ** 2;
    if (Math.abs(v - pv) < 0.018) {
      r = 239; g = 68; b = 68; // #ef4444
    }
  }

  // Мишень: белое кольцо с красной точкой
  const tu = 0.82, tv = 0.7;
  const dr = Math.hypot(u - tu, v - tv);
  if (dr < 0.075) {
    if (dr > 0.052) { r = 255; g = 255; b = 255; }
    else if (dr < 0.024) { r = 239; g = 68; b = 68; }
    else { r = 55; g = 65; b = 81; }
  }

  // Пуля в начале траектории
  if (Math.hypot((u - 0.15) * 1.3, v - 0.546) < 0.026) {
    r = 255; g = 255; b = 255;
  }

  return [r, g, b, 255];
}

function makePng(size, file) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    const start = y * stride;
    raw[start] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      const o = start + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png);
  console.log(`written ${file} (${png.length} bytes)`);
}

makePng(192, 'public/icons/icon-192.png');
makePng(512, 'public/icons/icon-512.png');
