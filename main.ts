// The World in One Day — Saturday 21 November 2026. v2.
// A picture paper drawn entirely in code: hand-rolled PNG encoder,
// hand-drawn 5x7 bitmap type, hand-drawn scenes. Node 22 stdlib only,
// no network, no external images. Writes /output/entry.png.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const W = 1024, H = 1024;

// ---------- PNG encoder (CRC32 + zlib deflate, RGB8, no filters) ----------
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(rgb, w, h) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    rgb.copy(raw, y * (1 + w * 3) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- framebuffer + drawing primitives ----------
const fb = Buffer.alloc(W * H * 3);
function px(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  fb[i] = c[0]; fb[i + 1] = c[1]; fb[i + 2] = c[2];
}
function rect(x, y, w, h, c) {
  for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++)
    for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) px(xx, yy, c);
}
function rectBorder(x, y, w, h, c, t = 1) {
  rect(x, y, w, t, c); rect(x, y + h - t, w, t, c);
  rect(x, y, t, h, c); rect(x + w - t, y, t, h, c);
}
function hline(x0, x1, y, c) { for (let x = x0; x <= x1; x++) px(x, y, c); }
function vline(x, y0, y1, c) { for (let y = y0; y <= y1; y++) px(x, y, c); }
function line(x0, y0, x1, y1, c) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (;;) {
    px(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
function disc(cx, cy, r, c) {
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++)
      if (x * x + y * y <= r * r) px(cx + x, cy + y, c);
}
function ring(cx, cy, r, c) {
  for (let a = 0; a < 360; a += 2) {
    const t = (a * Math.PI) / 180;
    px(Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), c);
  }
}
function tri(x0, y0, x1, y1, x2, y2, c) {
  const minX = Math.max(0, Math.min(x0, x1, x2)), maxX = Math.min(W - 1, Math.max(x0, x1, x2));
  const minY = Math.max(0, Math.min(y0, y1, y2)), maxY = Math.min(H - 1, Math.max(y0, y1, y2));
  const d = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
  if (d === 0) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const a = ((x1 - x) * (y2 - y) - (y1 - y) * (x2 - x)) / d;
      const b = ((x2 - x) * (y0 - y) - (y2 - y) * (x0 - x)) / d;
      const g = 1 - a - b;
      if (a >= 0 && b >= 0 && g >= 0) px(x, y, c);
    }
  }
}
function zigzag(x0, y, step, amp, n, c) {
  let x = x0, yy = y;
  for (let i = 0; i < n; i++) {
    const ny = i % 2 === 0 ? y - amp : y + amp;
    line(x, yy, x + step, ny, c);
    x += step; yy = ny;
  }
}

// ---------- 5x7 bitmap font (own glyph definitions, all caps) ----------
const FONT = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14], "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 6, 8, 16, 31], "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2], "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14], "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14], "9": [14, 17, 17, 15, 1, 2, 12],
  " ": [0, 0, 0, 0, 0, 0, 0], ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8], ":": [0, 12, 12, 0, 12, 12, 0],
  ";": [0, 12, 12, 0, 12, 4, 8], "'": [4, 4, 8, 0, 0, 0, 0],
  '"': [10, 10, 0, 0, 0, 0, 0], "(": [2, 4, 8, 8, 8, 4, 2],
  ")": [8, 4, 2, 2, 2, 4, 8], "-": [0, 0, 0, 14, 0, 0, 0],
  $: [4, 15, 20, 14, 5, 30, 4], "%": [25, 26, 2, 4, 8, 11, 19],
  "&": [12, 18, 20, 8, 21, 18, 13], "*": [0, 4, 21, 14, 21, 4, 0],
  "!": [4, 4, 4, 4, 4, 0, 4], "?": [14, 17, 1, 6, 4, 0, 4],
  "+": [0, 4, 4, 31, 4, 4, 0], "/": [1, 2, 2, 4, 8, 8, 16],
  "=": [0, 0, 31, 0, 31, 0, 0], "<": [2, 4, 8, 16, 8, 4, 2],
  ">": [8, 4, 2, 1, 2, 4, 8], "|": [4, 4, 4, 4, 4, 4, 4],
  _: [0, 0, 0, 0, 0, 0, 31],
};
function textWidth(s, sc) { return s.length * 6 * sc - sc; }
function drawText(x, y, s, sc, c, align = "l") {
  if (align === "c") x -= Math.floor(textWidth(s, sc) / 2);
  if (align === "r") x -= textWidth(s, sc);
  for (const ch of s.toUpperCase()) {
    const g = FONT[ch] || FONT[" "];
    for (let r = 0; r < 7; r++)
      for (let col = 0; col < 5; col++)
        if (g[r] & (16 >> col)) rect(x + col * sc, y + r * sc, sc, sc, c);
    x += 6 * sc;
  }
  return x;
}
function wrap(s, maxChars) {
  const words = s.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawLines(x, y, lines, sc, c, lh) {
  lines.forEach((ln, i) => drawText(x, y + i * lh, ln, sc, c));
  return y + lines.length * lh;
}

// ---------- palette ----------
const PAPER = [247, 242, 231], INK = [24, 34, 56], RED = [185, 28, 28];
const GREY = [110, 110, 105], DARKGREY = [70, 70, 66], GOLD = [191, 141, 38];
const NAVY = [24, 52, 84], TEAL = [15, 118, 110], GREEN = [22, 101, 52];
const BLUE = [30, 64, 175], PURPLE = [109, 40, 217], WHITE = [255, 255, 255];
const BLACK = [10, 10, 10], CREAM = [244, 225, 189], TAN = [232, 217, 168];
const SKY = [186, 219, 238], SAND = [214, 186, 140];

// ---------- scenes (each draws inside x,y,w,h) ----------
function sceneCOP31(x, y, w, h) {
  rect(x, y, w, h, [214, 232, 210]);
  disc(x + Math.floor(w * 0.30), y + Math.floor(h * 0.48), 30, [43, 108, 196]);
  disc(x + Math.floor(w * 0.30), y + Math.floor(h * 0.48), 26, [76, 141, 220]);
  rect(x + Math.floor(w * 0.30) - 26, y + Math.floor(h * 0.48) - 3, 52, 3, [22, 101, 52]);
  rect(x + Math.floor(w * 0.30) - 3, y + Math.floor(h * 0.48) - 26, 3, 52, [22, 101, 52]);
  disc(x + Math.floor(w * 0.30), y + Math.floor(h * 0.48), 9, [22, 101, 52]);
  rect(x + Math.floor(w * 0.62), y + Math.floor(h * 0.16), 10, 44, WHITE);
  rectBorder(x + Math.floor(w * 0.62), y + Math.floor(h * 0.16), 10, 44, INK, 1);
  rect(x + Math.floor(w * 0.62) + 2, y + Math.floor(h * 0.16) + 26, 6, 18, [185, 28, 28]);
  disc(x + Math.floor(w * 0.62) + 5, y + Math.floor(h * 0.16) + 48, 9, [185, 28, 28]);
  disc(x + Math.floor(w * 0.85), y + Math.floor(h * 0.42), 18, WHITE);
  ring(x + Math.floor(w * 0.85), y + Math.floor(h * 0.42), 18, INK);
  ring(x + Math.floor(w * 0.85), y + Math.floor(h * 0.42), 17, INK);
  line(x + Math.floor(w * 0.85), y + Math.floor(h * 0.42), x + Math.floor(w * 0.85), y + Math.floor(h * 0.42) - 11, INK);
  line(x + Math.floor(w * 0.85), y + Math.floor(h * 0.42), x + Math.floor(w * 0.85) + 8, y + Math.floor(h * 0.42) + 5, INK);
  rect(x, y + h - 14, w, 14, [120, 130, 110]);
  for (let i = 0; i < 7; i++) rect(x + 8 + i * 14, y + h - 26, 8, 12, [70, 80, 70]);
}
function sceneSaudi(x, y, w, h) {
  rect(x, y, w, h, NAVY);
  disc(x + Math.floor(w * 0.82), y + Math.floor(h * 0.22), 12, [255, 214, 90]);
  for (let i = 0; i < 8; i++) {
    const bx = x + 14 + i * 38, bh = 26 + ((i * 37) % 42);
    rect(bx, y + h - 16 - bh, 26, bh + 16, [12, 26, 48]);
    for (let wy = 0; wy < 3; wy++)
      for (let wx = 0; wx < 3; wx++)
        if ((wx + wy + i) % 2 === 0) rect(bx + 4 + wx * 7, y + h - 16 - bh + 6 + wy * 9, 3, 4, [255, 214, 90]);
  }
  line(x + 20, y + 30, x + 90, y + 78, [255, 214, 90]);
  line(x + 90, y + 78, x + 150, y + 40, [255, 214, 90]);
  disc(x + 90, y + 78, 5, [255, 120, 60]);
  disc(x + 150, y + 40, 4, [255, 120, 60]);
  disc(x + Math.floor(w * 0.55), y + Math.floor(h * 0.30), 2, WHITE);
  disc(x + Math.floor(w * 0.68), y + Math.floor(h * 0.16), 2, WHITE);
  disc(x + Math.floor(w * 0.40), y + Math.floor(h * 0.14), 2, WHITE);
}
function scenePeru(x, y, w, h) {
  rect(x, y, w, h, [238, 222, 190]);
  tri(x + 6, y + h - 18, x + Math.floor(w * 0.30), y + 18, x + Math.floor(w * 0.58), y + h - 18, [107, 74, 53]);
  tri(x + Math.floor(w * 0.30) - 16, y + 34, x + Math.floor(w * 0.30), y + 18, x + Math.floor(w * 0.30) + 16, y + 34, WHITE);
  tri(x + Math.floor(w * 0.45), y + h - 18, x + Math.floor(w * 0.72), y + 34, x + w - 8, y + h - 18, [88, 60, 42]);
  tri(x + Math.floor(w * 0.72) - 12, y + 48, x + Math.floor(w * 0.72), y + 34, x + Math.floor(w * 0.72) + 12, y + 48, WHITE);
  zigzag(x + 10, y + Math.floor(h * 0.62), 12, 8, Math.floor((w - 20) / 12), [185, 28, 28]);
  rect(x + w - 52, y + h - 34, 34, 20, [196, 120, 80]);
  tri(x + w - 56, y + h - 34, x + w - 35, y + h - 48, x + w - 14, y + h - 34, [140, 60, 40]);
}
function sceneKyiv(x, y, w, h) {
  rect(x, y, w, h, [253, 214, 90]);
  rect(x, y, w, Math.floor(h * 0.45), [30, 64, 175]);
  line(x + 8, y + h - 14, x + Math.floor(w * 0.5), y + 22, INK);
  line(x + Math.floor(w * 0.5), y + 22, x + w - 8, y + h - 14, INK);
  for (let i = 0; i < 5; i++) vline(x + 20 + i * Math.floor((w - 40) / 4), y + 30 + Math.abs(i - 2) * 8, y + h - 16, INK);
  rect(x + Math.floor(w * 0.68), y + h - 34, 16, 20, [24, 34, 56]);
  disc(x + Math.floor(w * 0.68) + 8, y + h - 38, 7, [232, 190, 150]);
}
function sceneHormuz(x, y, w, h) {
  rect(x, y, w, h, SKY);
  rect(x, y + Math.floor(h * 0.55), w, Math.floor(h * 0.45), [28, 80, 130]);
  for (let i = 0; i < 4; i++) hline(x + 6 + (i % 2) * 20, x + 60 + (i % 2) * 20, y + Math.floor(h * 0.62) + i * 8, [120, 180, 220]);
  rect(x + Math.floor(w * 0.30), y + Math.floor(h * 0.42), 70, 12, [40, 40, 44]);
  rect(x + Math.floor(w * 0.42), y + Math.floor(h * 0.30), 8, 14, [40, 40, 44]);
  line(x + Math.floor(w * 0.42) + 4, y + Math.floor(h * 0.30), x + Math.floor(w * 0.42) + 4, y + Math.floor(h * 0.12), [40, 40, 44]);
  disc(x + Math.floor(w * 0.78), y + Math.floor(h * 0.28), 6, [60, 60, 64]);
  line(x + Math.floor(w * 0.78) - 12, y + Math.floor(h * 0.28), x + Math.floor(w * 0.78) + 12, y + Math.floor(h * 0.28), [60, 60, 64]);
  line(x + Math.floor(w * 0.78), y + Math.floor(h * 0.28) - 12, x + Math.floor(w * 0.78), y + Math.floor(h * 0.28) + 12, [60, 60, 64]);
}
function sceneIran(x, y, w, h) {
  rect(x, y, w, h, [226, 214, 180]);
  disc(x + Math.floor(w * 0.5), y + Math.floor(h * 0.42), 22, [120, 90, 40]);
  ring(x + Math.floor(w * 0.5), y + Math.floor(h * 0.42), 22, GOLD);
  disc(x + Math.floor(w * 0.5), y + Math.floor(h * 0.42), 6, GOLD);
  for (let i = 0; i < 3; i++) {
    const a = (i * 60 * Math.PI) / 180;
    line(x + Math.floor(w * 0.5), y + Math.floor(h * 0.42),
      x + Math.floor(w * 0.5) + Math.round(20 * Math.cos(a)), y + Math.floor(h * 0.42) + Math.round(20 * Math.sin(a)), GOLD);
  }
  rect(x + 10, y + h - 16, w - 20, 10, [90, 70, 30]);
  rect(x + Math.floor(w * 0.18), y + h - 34, 14, 18, [70, 55, 25]);
  rect(x + Math.floor(w * 0.68), y + h - 34, 14, 18, [70, 55, 25]);
}
function sceneTrump(x, y, w, h) {
  rect(x, y, w, h, NAVY);
  rect(x + Math.floor(w * 0.22), y + Math.floor(h * 0.30), Math.floor(w * 0.56), Math.floor(h * 0.55), WHITE);
  tri(x + Math.floor(w * 0.18), y + Math.floor(h * 0.30), x + Math.floor(w * 0.5), y + Math.floor(h * 0.10), x + Math.floor(w * 0.82), y + Math.floor(h * 0.30), WHITE);
  for (let i = 0; i < 4; i++) rect(x + Math.floor(w * 0.28) + i * Math.floor(w * 0.12), y + Math.floor(h * 0.42), 8, Math.floor(h * 0.38), NAVY);
  rect(x + Math.floor(w * 0.62), y + Math.floor(h * 0.14), 44, 22, RED);
  drawText(x + Math.floor(w * 0.62) + 5, y + Math.floor(h * 0.14) + 4, "AI", 2, WHITE);
}
function sceneChinaJapan(x, y, w, h) {
  rect(x, y, w, h, [238, 238, 232]);
  rect(x + 8, y + 10, Math.floor(w * 0.42), h - 20, [222, 40, 40]);
  disc(x + 8 + Math.floor(w * 0.10), y + 22, 4, [255, 214, 90]);
  disc(x + 8 + Math.floor(w * 0.10) + 12, y + 18, 2, [255, 214, 90]);
  disc(x + 8 + Math.floor(w * 0.10) + 14, y + 28, 2, [255, 214, 90]);
  rect(x + Math.floor(w * 0.52), y + 10, Math.floor(w * 0.42), h - 20, WHITE);
  rectBorder(x + Math.floor(w * 0.52), y + 10, Math.floor(w * 0.42), h - 20, GREY);
  disc(x + Math.floor(w * 0.52) + Math.floor(w * 0.21), y + Math.floor(h * 0.5), 12, [185, 28, 28]);
}
function sceneDavao(x, y, w, h) {
  rect(x, y, w, h, SKY);
  disc(x + Math.floor(w * 0.80), y + Math.floor(h * 0.22), 14, [255, 224, 130]);
  rect(x + Math.floor(w * 0.14), y + Math.floor(h * 0.42), Math.floor(w * 0.60), 14, WHITE);
  tri(x + Math.floor(w * 0.74), y + Math.floor(h * 0.42), x + Math.floor(w * 0.86), y + Math.floor(h * 0.49), x + Math.floor(w * 0.74), y + Math.floor(h * 0.56), WHITE);
  rect(x + Math.floor(w * 0.30), y + Math.floor(h * 0.30), 10, 12, WHITE);
  rect(x + Math.floor(w * 0.30), y + Math.floor(h * 0.56), 10, 12, WHITE);
  rect(x, y + h - 12, w, 6, [90, 90, 90]);
  for (let i = 0; i < 6; i++) rect(x + 8 + i * 30, y + h - 10, 14, 2, WHITE);
}
function sceneCopenhagen(x, y, w, h) {
  rect(x, y, w, h, [238, 232, 220]);
  rect(x + 8, y + 8, Math.floor(w * 0.55), Math.floor(h * 0.55), [198, 12, 48]);
  rect(x + 8 + Math.floor(w * 0.16), y + 8, 8, Math.floor(h * 0.55), WHITE);
  rect(x + 8, y + 8 + Math.floor(h * 0.24), Math.floor(w * 0.55), 8, WHITE);
  tri(x + 10, y + h - 22, x + 30, y + h - 44, x + 50, y + h - 22, [24, 52, 84]);
  tri(x + 56, y + h - 22, x + 76, y + h - 50, x + 96, y + h - 22, [120, 60, 40]);
  tri(x + 102, y + h - 22, x + 122, y + h - 44, x + 142, y + h - 22, [24, 52, 84]);
}
function sceneBitcoin(x, y, w, h) {
  rect(x, y, w, h, [247, 147, 26]);
  disc(x + Math.floor(w * 0.5), y + Math.floor(h * 0.46), 20, [255, 255, 255]);
  drawText(x + Math.floor(w * 0.5) - 12, y + Math.floor(h * 0.46) - 7, "BTC", 2, [247, 147, 26]);
  line(x + 8, y + 12, x + Math.floor(w * 0.35), y + 22, RED);
  line(x + Math.floor(w * 0.35), y + 22, x + Math.floor(w * 0.62), y + 34, RED);
  line(x + Math.floor(w * 0.62), y + 34, x + w - 8, y + h - 8, RED);
  disc(x + w - 8, y + h - 8, 3, RED);
}
function sceneRussell(x, y, w, h) {
  rect(x, y, w, h, [40, 40, 48]);
  for (let i = 0; i < 8; i++) rect(x + 6 + i * 22, y + h - 22, 11, 11, i % 2 === 0 ? WHITE : BLACK);
  for (let i = 0; i < 8; i++) rect(x + 6 + i * 22, y + h - 11, 11, 11, i % 2 === 0 ? BLACK : WHITE);
  line(x + 10, y + 14, x + Math.floor(w * 0.45), y + Math.floor(h * 0.5), [255, 214, 90]);
  line(x + Math.floor(w * 0.45), y + Math.floor(h * 0.5), x + w - 12, y + 18, [255, 214, 90]);
  rect(x + Math.floor(w * 0.45) - 16, y + Math.floor(h * 0.5) - 6, 32, 10, [0, 160, 220]);
  rect(x + Math.floor(w * 0.45) - 10, y + Math.floor(h * 0.5) - 10, 20, 4, [0, 160, 220]);
}
function sceneRahul(x, y, w, h) {
  rect(x, y, w, h, [34, 120, 60]);
  rect(x + Math.floor(w * 0.42), y + 6, Math.floor(w * 0.16), h - 12, [214, 186, 140]);
  for (let i = 0; i < 3; i++) rect(x + Math.floor(w * 0.44) + i * 6, y + 10, 3, 12, [240, 220, 160]);
  for (let i = 0; i < 3; i++) rect(x + Math.floor(w * 0.44) + i * 6, y + h - 22, 3, 12, [240, 220, 160]);
  rect(x + Math.floor(w * 0.72), y + Math.floor(h * 0.30), 6, 22, [150, 100, 50]);
  line(x + Math.floor(w * 0.72) + 3, y + Math.floor(h * 0.30), x + Math.floor(w * 0.72) + 3, y + Math.floor(h * 0.30) - 14, [150, 100, 50]);
  disc(x + Math.floor(w * 0.24), y + Math.floor(h * 0.32), 6, [185, 28, 28]);
  disc(x + Math.floor(w * 0.24), y + Math.floor(h * 0.32), 3, WHITE);
}

// ---------- layout helpers ----------
function chip(x, y, s, bg, fg, sc = 1) {
  const w = textWidth(s, sc) + 8;
  rect(x, y, w, 7 * sc + 4, bg);
  drawText(x + 4, y + 2, s, sc, fg);
  return w;
}
function sourceBar(x, y, w, s) {
  rect(x, y, w, 15, BLACK);
  drawText(x + 4, y + 4, s, 1, WHITE);
}
function kicker(x, y, n, place, topic) {
  drawText(x, y, n + " " + place + " - " + topic, 1, RED);
}

// ---------- story data ----------
const HEROES = [
  {
    n: "1", place: "ANTALYA, TURKIYE", topic: "CLIMATE",
    chip: "COP31: OVERTIME", sub: "No deal - day 13", bar: "Ongoing - AFP, Al Jazeera",
    scene: sceneCOP31,
    head: "Climate summit runs into Saturday with no deal",
    deck: "COP31 missed its Friday close; a draft with no mention of fossil fuels split nearly 200 countries; a third text is promised.",
    src: "(AFP, Al Jazeera)",
  },
  {
    n: "2", place: "RIYADH - JIZAN", topic: "WAR",
    chip: "SAUDI: MISSILES", sub: "5 shot down", bar: "Coalition's count - AFP",
    scene: sceneSaudi,
    head: "Five Houthi missiles shot down over Saudi Arabia",
    deck: "The Saudi-led coalition said three were destroyed over Riyadh before dawn and two over Jizan, a day after it bombed Hodeideh port.",
    src: "(Coalition, AFP)",
  },
  {
    n: "3", place: "JUNIN, PERU", topic: "EARTHQUAKE",
    chip: "PERU: QUAKE 6.7", sub: "00:09 UTC - 108 km deep", bar: "USGS - IGP",
    scene: scenePeru,
    head: "Magnitude 6.7 earthquake shakes central Peru",
    deck: "The deep quake near Carhuamayo was felt in Lima and along the coast; Peru's institute reported no deaths, damage or tsunami risk.",
    src: "(USGS, IGP)",
  },
];
const MIDS = [
  { n: "4", place: "KYIV", topic: "WAR", chip: "KYIV: WARNING", bar: "Interview - NBC", scene: sceneKyiv,
    head: "Zelensky: Crimea bridge 'will not stay'", deck: "He warns of more double-tap strikes." },
  { n: "5", place: "STRAIT OF HORMUZ", topic: "WAR", chip: "HORMUZ: DRONE", bar: "Iran's claim - IRIB", scene: sceneHormuz,
    head: "Iran says it shot down a US drone", deck: "IRGC claims an MQ-9 downed over the strait." },
  { n: "6", place: "TEHRAN", topic: "DIPLOMACY", chip: "IRAN: URANIUM", bar: "Statement - Reuters", scene: sceneIran,
    head: "Iran: uranium stock stays in the country", deck: "Minister still seeks a 'fair solution'." },
  { n: "7", place: "WASHINGTON", topic: "TECHNOLOGY", chip: "TRUMP: AI TAX", bar: "Briefing - Reuters", scene: sceneTrump,
    head: "Trump vows tax on data centres abroad", deck: "'Tremendous penalty'; no details yet." },
  { n: "8", place: "BEIJING", topic: "DIPLOMACY", chip: "CHINA-JAPAN", bar: "Ministry - AFP", scene: sceneChinaJapan,
    head: "China tells Japan to 'correct' Taiwan words", deck: "Tokyo says its stance is unchanged." },
  { n: "9", place: "DAVAO", topic: "AVIATION", chip: "DAVAO: 146 SAFE", bar: "Airline - AP", scene: sceneDavao,
    head: "Jet lands safely after engine fire alert", deck: "Air Niugini 767 diverts after midnight." },
  { n: "10", place: "COPENHAGEN", topic: "ESPIONAGE", chip: "COPENHAGEN: EXPULSION", bar: "Al Jazeera", scene: sceneCopenhagen,
    head: "Denmark expels Russian diplomat", deck: "Alleges plot to kill a US-Ukrainian rapper." },
  { n: "11", place: "WORLD", topic: "MARKETS", chip: "BITCOIN: $58,810", bar: "CoinGecko - 01:30 UTC", scene: sceneBitcoin,
    head: "Bitcoin trades below $59,000 on Saturday", deck: "Down 4.1% in 24 hours; lowest since Sept 2024." },
  { n: "12", place: "LAS VEGAS", topic: "FORMULA ONE", chip: "RUSSELL: P1", bar: "Timing - FIA", scene: sceneRussell,
    head: "Russell fastest in final Las Vegas practice", deck: "1:34.041 in a damp, messy session." },
  { n: "13", place: "WELLINGTON", topic: "CRICKET", chip: "RAHUL: 136", bar: "Tea, day 3 - IANS", scene: sceneRahul,
    head: "Rahul hits 136 as India take charge", deck: "India 486/4, lead 118 at stumps." },
];
const BRIEFS = [
  "RUTTE TO WARSAW - NATO CHIEF DUE SATURDAY (ISW)",
  "INDIA SHARES RECORD - FPI 1.22 LAKH CR (DEPOSITORIES)",
  "GAZA DRONES KILL 7 - CENTRAL GAZA STRIKES (AL JAZEERA)",
  "GUPTA GETS 19Y7M - US SENTENCE, PANNUN PLOT (COURT)",
  "HAITI: 2 TROOPS KILLED - HANDLING EXPLOSIVES (AP)",
  "ESTONIA TO SHUT RUSSIA CROSSINGS DEC 1 (REUTERS)",
  "US WARNS SINGAPORE, MALAYSIA ON IRAN (REUTERS)",
  "22,000 GAZA CHILDREN DEAD - MINISTRY (AL JAZEERA)",
  "TAIWAN FLAGS CHINA ACCOUNTS - TO META (REUTERS)",
  "UKMTO: INCIDENT OFF YEMEN COAST (UKMTO)",
  "BUKELE SEEKS THIRD TERM TO 2033 (AP)",
  "NEPAL PM TO VISIT DELHI SUNDAY (ANI)",
  "DEPARDIEU PROBED OVER SEX CLAIMS (AFP)",
  "EU: COP31 MUST NOT BE FOSSIL SUMMIT (REUTERS)",
  "BESSENT: HUMANS MUST RUN AI WEAPONS (REUTERS)",
  "IRAQ TO DEPLOY IN HEZBOLLAH AREA (REUTERS)",
  "CHINA SEEKS ROHINGYA SOLUTION (XINHUA)",
  "WINTER CEASEFIRE CALL FROM EUROPE (AFP)",
  "VERSTAPPEN: WARNING, NO PENALTY (FIA)",
  "GILL FALLS FOR 98 - INDIA 486/4 AT STUMPS (IANS)",
  "PANAMA TO BLOCK COP31 TEXT - 8 DEMANDS (AP)",
  "ANTONELLI P2 - 0.911S BEHIND RUSSELL (FIA)",
];
const NUMBERS = [
  { v: "DAY 13", l: "OF A COP31 SUMMIT PLANNED TO CLOSE ON DAY 12" },
  { v: "5", l: "MISSILES SHOT DOWN OVER RIYADH AND JIZAN" },
  { v: "6.7", l: "MAGNITUDE OF THE QUAKE IN JUNIN, PERU" },
  { v: "146", l: "PEOPLE SAFE AFTER A JET'S EMERGENCY LANDING" },
  { v: "$58,810", l: "BITCOIN EARLY SATURDAY, DOWN 4.1% IN A DAY" },
  { v: "136", l: "K L RAHUL'S SCORE AT TEA IN WELLINGTON" },
];
const REGIONS = [
  { n: "EUROPE 7", w: 199, c: BLUE }, { n: "ASIA 7", w: 199, c: RED },
  { n: "MIDDLE EAST 7", w: 199, c: GOLD }, { n: "AMERICAS 10", w: 285, c: PURPLE },
  { n: "OCEANIA 2", w: 57, c: TEAL }, { n: "GLOBAL 2", w: 57, c: DARKGREY },
];
const PINS = [
  [1, 190, 748], [2, 205, 762], [3, 75, 812], [4, 180, 732], [5, 210, 758],
  [8, 255, 742], [9, 268, 782], [10, 168, 726], [12, 48, 762], [13, 282, 862],
  [15, 232, 752], [18, 82, 772], [24, 68, 782], [25, 238, 748], [29, 200, 752],
];

// ---------- render ----------
function render() {
  rect(0, 0, W, H, PAPER);
  // masthead
  drawText(512, 8, "THE WORLD IN ONE DAY  |  35 STORIES  |  7 REGIONS  |  EVERY ONE DATED SATURDAY 21 NOVEMBER 2026", 1, RED, "c");
  drawText(512, 22, "SATURDAY 21 NOVEMBER 2026", 6, INK, "c");
  drawText(512, 70, "Climate summit runs past its deadline  |  Five missiles shot down over Saudi Arabia  |  Strong quake shakes Peru", 1, DARKGREY, "c");
  hline(14, 1010, 86, INK); hline(14, 1010, 87, INK);
  // number strip
  for (let i = 0; i < 6; i++) {
    const x0 = 14 + i * 166, cx = x0 + 83;
    if (i > 0) vline(x0, 92, 138, GREY);
    drawText(cx, 94, NUMBERS[i].v, 3, INK, "c");
    const ll = wrap(NUMBERS[i].l, 26);
    drawLines(cx - Math.floor(textWidth(ll[0], 1) / 2), 118, ll, 1, DARKGREY, 8);
  }
  hline(14, 1010, 140, GREY);
  // region strip
  let rx = 14;
  for (const r of REGIONS) {
    rect(rx, 143, r.w, 18, r.c);
    drawText(rx + Math.floor(r.w / 2), 147, r.n, 1, WHITE, "c");
    rx += r.w;
  }
  // heroes
  const HX = [14, 352, 690], HW = 320;
  HEROES.forEach((hh, i) => {
    const x = HX[i], y = 166;
    hh.scene(x, y, HW, 150);
    chip(x, y, hh.chip, RED, WHITE);
    chip(x, y + 17, hh.sub, WHITE, BLACK);
    sourceBar(x, y + 135, HW, hh.bar);
    kicker(x, y + 156, hh.n, hh.place, hh.topic);
    drawLines(x, y + 168, wrap(hh.head, 26), 2, INK, 16);
    drawLines(x, y + 204, wrap(hh.deck, 52), 1, DARKGREY, 9);
    drawText(x, y + 236, hh.src, 1, GREY);
  });
  // mids: 2 rows x 5
  const MX = [14, 214, 414, 614, 814], MW = 192, MY = [420, 556];
  MIDS.forEach((m, i) => {
    const row = Math.floor(i / 5), col = i % 5;
    const x = MX[col], y = MY[row];
    m.scene(x, y, MW, 64);
    chip(x, y, m.chip, RED, WHITE);
    sourceBar(x, y + 49, MW, m.bar);
    kicker(x, y + 70, m.n, m.place, m.topic);
    drawLines(x, y + 80, wrap(m.head, 31), 1, INK, 8);
    drawLines(x, y + 98, wrap(m.deck, 31), 1, GREY, 8);
  });
  hline(14, 1010, 692, GREY);
  // map
  drawText(14, 700, "WHERE IT HAPPENED", 1, INK);
  const mapX = 14, mapY = 712, mapW = 286, mapH = 180;
  rect(mapX, mapY, mapW, mapH, [238, 230, 205]);
  rect(mapX + 10, mapY + 14, 58, 34, TAN); tri(mapX + 10, mapY + 48, mapX + 26, mapY + 78, mapX + 46, mapY + 48, TAN);
  tri(mapX + 52, mapY + 88, mapX + 68, mapY + 126, mapX + 84, mapY + 88, TAN);
  rect(mapX + 74, mapY + 10, 14, 10, TAN);
  rect(mapX + 146, mapY + 16, 26, 16, TAN); rect(mapX + 136, mapY + 30, 16, 12, TAN);
  tri(mapX + 144, mapY + 48, mapX + 164, mapY + 88, mapX + 182, mapY + 48, TAN);
  rect(mapX + 148, mapY + 46, 28, 14, TAN);
  rect(mapX + 186, mapY + 12, 84, 44, TAN); tri(mapX + 186, mapY + 56, mapX + 226, mapY + 88, mapX + 270, mapY + 56, TAN);
  rect(mapX + 244, mapY + 114, 30, 16, TAN);
  for (const [n, px2, py2] of PINS) {
    disc(px2, py2, 7, RED);
    drawText(px2, py2 - 3, String(n), 1, WHITE, "c");
  }
  drawLines(14, 898, wrap("Each number is the story with that number on this page.", 44), 1, GREY, 8);
  // briefs
  drawText(312, 700, "ALSO ON SATURDAY 21 NOVEMBER 2026 - 22 MORE STORIES", 1, INK);
  BRIEFS.forEach((b, i) => {
    const col = Math.floor(i / 11), row = i % 11;
    const x = col === 0 ? 312 : 668, y = 716 + row * 21;
    const n = String(14 + i);
    drawText(x, y, n + " ", 1, RED);
    drawText(x + textWidth(n + " ", 1), y, b, 1, INK);
  });
  // date check
  rectBorder(14, 966, 996, 22, RED, 1);
  drawText(20, 973, "DATE CHECK", 1, RED);
  drawText(20 + textWidth("DATE CHECK  ", 1), 973, "Left out as Friday 20 November's news: Kyiv barrage, Poland missile, UK-EU deal, Akvan landfall, Wall St correction, Voyager 1 (18 Nov).", 1, INK);
  drawText(512, 993, "Every story here happened, or was first reported, on Saturday 21 November 2026. Officials' counts and claims are attributed.", 1, GREY, "c");
  drawText(14, 1008, "Sources named beside each story - original drawings", 1, GREY);
}

mkdirSync(process.env.MAKEFUN_OUTPUT_DIR || "/tmp/news21-v2-out", { recursive: true });
render();
const out = (process.env.MAKEFUN_OUTPUT_DIR || "/tmp/news21-v2-out") + "/entry.png";
writeFileSync(out, encodePNG(fb, W, H));
console.log("wrote " + out);
