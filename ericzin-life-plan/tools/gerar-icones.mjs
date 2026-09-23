// Gera os ícones do LifePlan: coração vermelho pixelado sobre fundo roxo.
// Uso: node ericzin-life-plan/tools/gerar-icones.mjs   (sem dependências: PNG escrito à mão com zlib)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// 1 = coração, 2 = brilho, 3 = sombra
const HEART = [
  '..111...111..',
  '.12211.11111.',
  '1221111111111',
  '1211111111113',
  '1111111111113',
  '.11111111113.',
  '..111111113..',
  '...1111113...',
  '....11113....',
  '.....113.....',
  '......3......',
];
const W = 13, H = HEART.length;
if (HEART.some(r => r.length !== W)) throw new Error('linhas do coração com larguras diferentes');

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const C = {
  bg: hex('#8570fd'), bgDark: hex('#6349f8'),
  outline: hex('#2a1760'),
  1: hex('#ef233c'), 2: hex('#ffb3bd'), 3: hex('#a4161a'),
};

const inHeart = (x, y) => x >= 0 && y >= 0 && x < W && y < H && HEART[y][x] !== '.';
// contorno: células vizinhas (inclusive diagonais) ao coração que não são coração
const cell = (x, y) => {
  if (inHeart(x, y)) return C[HEART[y][x]];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inHeart(x + dx, y + dy)) return C.outline;
  return null;
};

/* size: lado em px; pad: fração de margem até o coração; radius: canto arredondado (fração) */
function render(size, { pad, radius }) {
  const px = new Uint8Array(size * size * 4);
  const gw = W + 2, gh = H + 2;                        // grade com o contorno
  const unit = Math.floor((size * (1 - 2 * pad)) / gw);
  const ox = Math.floor((size - unit * gw) / 2), oy = Math.floor((size - unit * gh) / 2) + Math.round(unit * 0.3);
  const r = radius * size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // canto arredondado
    const cx = Math.min(x, size - 1 - x), cy = Math.min(y, size - 1 - y);
    if (r && cx < r && cy < r && (r - cx - .5) ** 2 + (r - cy - .5) ** 2 > r * r) continue;
    // fundo: degradê diagonal roxo
    const t = (x + y) / (2 * size);
    let c = C.bg.map((v, i) => i < 3 ? Math.round(v + (C.bgDark[i] - v) * t) : 255);
    const gx = Math.floor((x - ox) / unit) - 1, gy = Math.floor((y - oy) / unit) - 1;
    if (x >= ox && y >= oy && gx >= -1 && gy >= -1 && gx <= W && gy <= H) { const h = cell(gx, gy); if (h) c = h; }
    px.set(c, (y * size + x) * 4);
  }
  return png(size, size, px);
}

function png(w, h, rgba) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const out = {
  'favicon-32.png':      render(32,  { pad: 0.02, radius: 0.22 }),
  'favicon-64.png':      render(64,  { pad: 0.06, radius: 0.22 }),
  'apple-touch-icon.png':render(180, { pad: 0.14, radius: 0 }),    // o iOS arredonda sozinho
  'icon-192.png':        render(192, { pad: 0.12, radius: 0.22 }),
  'icon-512.png':        render(512, { pad: 0.12, radius: 0.22 }),
  'icon-maskable-512.png': render(512, { pad: 0.22, radius: 0 }),  // Android recorta: coração dentro da zona segura
};
for (const [n, b] of Object.entries(out)) fs.writeFileSync(path.join(OUT, n), b);
console.log('ícones em', OUT, Object.keys(out).join(', '));
