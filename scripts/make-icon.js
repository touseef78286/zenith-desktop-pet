const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BASE = [
  '........DED........DED........',
  '.......DEEE........EEED.......',
  '......DEEEED......DEEEED......',
  '......DEEEEED....DEEEEED......',
  '......EEEEEED....DEEEEEE......',
  '......EEEEEEFDDDDFEEEEEE......',
  '......EEEEEEFFFFFFEEEEEE......',
  '......DEEEEFFFFFFFFEEEED......',
  '.....DFFFFFFFFFFFFFFFFFFD.....',
  '....DFFFFFFFFFFFFFFFFFFFFD....',
  '....DFFFFWWWFFFFFFWWWFFFFD....',
  '....DFFFWOOOWFFFFWOOOWFFFD....',
  '...DFFFFWOOOWFFFFWOOOWFFFFD...',
  '...DFFFFWOOOWFFFFWOOOWFFFFD...',
  'DDDDDDDFFWWWFFFFFFWWWFFDDDDDDD',
  'DDDDDDDFFFFFFFFNNFFFFFFFDDDDDD',
  '...DFFFFFFFFFFNNFFFFFFFFFFD...',
  'DDDDDDDFFFFFFNFFNFFFFFFDDDDDDD',
  'DDDDFFFFFFFFFFBBBFFFFFFFFFDDDD',
  '....DFFFFFFFFBBBBBFFFFFFFD.....',
  '.....DFFFFFFFBBBBBFFFFFFD......',
  '......DFFFFFFFBBBFFFFFFD.......',
  '.......DDFFFFFFFFFFFFDD.......',
  '.........DDDDDDDDDDDD.........',
];

const PALETTE = {
  F: [245, 160, 90],
  D: [191, 116, 66],
  E: [235, 150, 140],
  B: [251, 227, 187],
  N: [224, 120, 120],
  O: [35, 32, 30],
  W: [255, 251, 240],
};

function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * (1 + width * 4) + 1 + x * 4;
      raw[dst] = rgba[src];
      raw[dst + 1] = rgba[src + 1];
      raw[dst + 2] = rgba[src + 2];
      raw[dst + 3] = rgba[src + 3];
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function renderCat(size) {
  const cols = BASE[0].length;
  const rows = BASE.length;
  const cell = Math.floor(size / Math.max(cols, rows));
  const offsetX = Math.floor((size - cols * cell) / 2);
  const offsetY = Math.floor((size - rows * cell) / 2);
  const rgba = new Uint8Array(size * size * 4);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = BASE[r][c];
      const color = PALETTE[ch];
      if (!color) continue;
      for (let py = 0; py < cell; py++) {
        for (let px = 0; px < cell; px++) {
          const x = offsetX + c * cell + px;
          const y = offsetY + r * cell + py;
          if (x >= size || y >= size) continue;
          const i = (y * size + x) * 4;
          rgba[i] = color[0];
          rgba[i + 1] = color[1];
          rgba[i + 2] = color[2];
          rgba[i + 3] = 255;
        }
      }
    }
  }
  return encodePng(size, size, rgba);
}

const assetsDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
fs.writeFileSync(path.join(assetsDir, 'icon.png'), renderCat(256));
fs.writeFileSync(path.join(assetsDir, 'tray.png'), renderCat(32));
console.log('icons written:', path.join(assetsDir, 'icon.png'), path.join(assetsDir, 'tray.png'));
