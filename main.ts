// The World in One Day — Saturday 21 November 2026.
// A picture paper drawn entirely in code: hand-rolled PNG encoder,
// hand-drawn 5x7 bitmap type, hand-drawn scenes. Node 22 stdlib only,
// no network, no external assets. Deterministic: same bytes every run.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

export const W = 1024;
export const H = 1024;

// ---- palette ------------------------------------------------------------
const PAPER = [246, 241, 231];
const INK = [22, 35, 63];
const RED = [179, 38, 30];
const WHITE = [255, 255, 255];
const GREY = [107, 114, 128];
const SKY = [220, 232, 242];
const BLUE = [31, 78, 121];
const GREEN = [46, 107, 52];
const LIGHTGREEN = [120, 170, 90];
const GOLD = [201, 162, 39];
const SAND = [232, 224, 208];
const BROWN = [120, 85, 50];
const DARKGREEN = [30, 70, 40];

// ---- pixel buffer -------------------------------------------------------
const px = new Uint8Array(W * H * 3);
function setPixel(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
}
function fillRect(x, y, w, h, c) {
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * W + xx) * 3;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
    }
  }
}
function hline(x1, x2, y, c) {
  if (x2 < x1) { const t = x1; x1 = x2; x2 = t; }
  for (let x = x1; x <= x2; x++) setPixel(x, y, c);
}
function vline(x, y1, y2, c) {
  if (y2 < y1) { const t = y1; y1 = y2; y2 = t; }
  for (let y = y1; y <= y2; y++) setPixel(x, y, c);
}
function line(x1, y1, x2, y2, c) {
  const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
  let err = dx - dy, x = x1, y = y1;
  for (;;) {
    setPixel(x, y, c);
    if (x === x2 && y === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}
function fillCircle(cx, cy, r, c) {
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.floor(Math.sqrt(r * r - dy * dy));
    hline(cx - dx, cx + dx, cy + dy, c);
  }
}
// Even-odd scanline polygon fill. pts = [[x,y],...]
function fillPoly(pts, c) {
  let minY = H, maxY = 0;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  for (let y = Math.max(0, minY); y <= Math.min(H - 1, maxY); y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      hline(Math.ceil(xs[k]), Math.floor(xs[k + 1]), y, c);
    }
  }
}

// ---- PNG encoder --------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
function encodePNG() {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- 5x7 bitmap type (all caps) ------------------------------------------
// Each glyph: 7 rows of 5 cells, '#' = ink. Drawn by me for this entry.
const FONT = {
  'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  'I': ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  'J': ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  'W': ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  ';': ['00000', '01100', '01100', '00000', '01100', '00100', '01000'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '"': ['01010', '01010', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '$': ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '•': ['00000', '00000', '01100', '01100', '01100', '00000', '00000'],
  '·': ['00000', '00000', '00000', '00000', '01100', '01100', '00000'],
};
function textWidth(s, scale) {
  return s.length * 6 * scale - scale;
}
function drawText(s, x, y, scale, c) {
  let cx = x;
  for (const ch of s) {
    const g = FONT[ch] || FONT[' '];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === '1') fillRect(cx + col * scale, y + r * scale, scale, scale, c);
      }
    }
    cx += 6 * scale;
  }
  return cx;
}
function drawTextRight(s, xRight, y, scale, c) {
  drawText(s, xRight - textWidth(s, scale), y, scale, c);
}
function drawTextCenter(s, xCenter, y, scale, c) {
  drawText(s, xCenter - Math.floor(textWidth(s, scale) / 2), y, scale, c);
}
// Greedy word wrap to maxChars per line.
function wrap(s, maxChars) {
  const words = s.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if (cur.length + 1 + w.length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---- hero scenes (all drawn in code) --------------------------------------
// Each scene gets a 176x158 panel at (x, y).
function sceneCOP31(x, y) {
  fillRect(x, y, 176, 158, SKY);
  fillCircle(x + 148, y + 26, 16, GOLD);
  // Conference hall block.
  fillRect(x + 14, y + 62, 148, 96, BLUE);
  fillRect(x + 14, y + 62, 148, 10, INK);
  // Rows of delegate windows.
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 6; c++) {
      fillRect(x + 22 + c * 23, y + 84 + r * 22, 14, 12, [190, 210, 225]);
    }
  }
  // Podium + flags.
  fillRect(x + 76, y + 40, 24, 22, INK);
  for (let i = 0; i < 3; i++) {
    vline(x + 26 + i * 62, y + 18, y + 62, INK);
    fillRect(x + 27 + i * 62, y + 20, 16, 10, i === 0 ? GREEN : (i === 1 ? RED : GOLD));
  }
}
function sceneQuake(x, y) {
  fillRect(x, y, 176, 158, SAND);
  // Andes ridges.
  fillPoly([[x, y + 158], [x + 40, y + 60], [x + 80, y + 158]], [139, 115, 85]);
  fillPoly([[x + 60, y + 158], [x + 110, y + 44], [x + 176, y + 158]], [105, 85, 62]);
  fillPoly([[x + 96, y + 62], [x + 110, y + 44], [x + 124, y + 62]], WHITE);
  // Ground crack.
  line(x + 20, y + 158, x + 44, y + 132, INK);
  line(x + 44, y + 132, x + 30, y + 118, INK);
  line(x + 30, y + 118, x + 58, y + 104, INK);
  // Seismograph trace.
  const base = y + 138;
  const pts = [[0, 0], [14, 0], [20, -14], [26, 10], [32, -26], [38, 14], [46, -8], [54, 0], [66, 0], [72, -18], [78, 12], [86, -30], [94, 16], [102, -6], [112, 0], [130, 0], [138, -12], [146, 8], [154, 0], [176, 0]];
  for (let i = 0; i + 1 < pts.length; i++) {
    line(x + pts[i][0], base + pts[i][1], x + pts[i + 1][0], base + pts[i + 1][1], RED);
    line(x + pts[i][0], base + pts[i][1] + 1, x + pts[i + 1][0], base + pts[i + 1][1] + 1, RED);
  }
  // Small houses.
  fillRect(x + 120, y + 108, 26, 18, BROWN);
  fillPoly([[x + 118, y + 108], [x + 133, y + 96], [x + 148, y + 108]], RED);
}
function sceneDenmark(x, y) {
  fillRect(x, y, 176, 158, PAPER);
  // Danish flag.
  fillRect(x + 14, y + 12, 148, 84, RED);
  fillRect(x + 14, y + 44, 148, 18, WHITE);
  fillRect(x + 54, y + 12, 18, 84, WHITE);
  // Copenhagen rooftops.
  fillRect(x + 14, y + 112, 40, 46, INK);
  fillRect(x + 62, y + 104, 52, 54, BLUE);
  fillRect(x + 122, y + 118, 40, 40, INK);
  fillPoly([[x + 14, y + 112], [x + 34, y + 100], [x + 54, y + 112]], RED);
  fillPoly([[x + 62, y + 104], [x + 88, y + 90], [x + 114, y + 104]], GOLD);
  // Windows.
  for (let c = 0; c < 3; c++) fillRect(x + 72 + c * 14, y + 118, 8, 10, [190, 210, 225]);
}
function sceneCricket(x, y) {
  fillRect(x, y, 176, 158, GREEN);
  // Pitch strip.
  fillRect(x + 66, y + 10, 44, 138, [222, 200, 150]);
  // Crease lines.
  hline(x + 66, x + 110, y + 34, WHITE);
  hline(x + 66, x + 110, y + 124, WHITE);
  // Stumps.
  fillRect(x + 82, y + 18, 4, 18, GOLD);
  fillRect(x + 89, y + 18, 4, 18, GOLD);
  fillRect(x + 96, y + 18, 4, 18, GOLD);
  fillRect(x + 82, y + 14, 18, 3, GOLD);
  fillRect(x + 82, y + 122, 4, 18, GOLD);
  fillRect(x + 89, y + 122, 4, 18, GOLD);
  fillRect(x + 96, y + 122, 4, 18, GOLD);
  // Bat, swung.
  fillPoly([[x + 118, y + 60], [x + 130, y + 56], [x + 142, y + 96], [x + 130, y + 100]], BROWN);
  line(x + 124, y + 58, x + 112, y + 40, BROWN);
  line(x + 125, y + 58, x + 113, y + 40, BROWN);
  // Ball in flight.
  fillCircle(x + 40, y + 70, 8, WHITE);
  fillCircle(x + 40, y + 70, 8, RED);
  fillCircle(x + 40, y + 70, 6, WHITE);
  // Outfield dots (fielders).
  fillCircle(x + 24, y + 130, 4, WHITE);
  fillCircle(x + 150, y + 130, 4, WHITE);
  fillCircle(x + 150, y + 30, 4, WHITE);
}

// ---- page data ------------------------------------------------------------
const HEROES = [
  {
    kicker: 'ANTALYA - CLIMATE', headline: 'COP31: STILL NO DEAL',
    deck: 'TALKS RUN INTO THE WEEKEND. THIRD DRAFT DUE SATURDAY MORNING.',
    source: 'AL JAZEERA', scene: sceneCOP31,
  },
  {
    kicker: 'LIMA - DISASTER', headline: '6.8 QUAKE SHAKES PERU',
    deck: 'JUNIN TREMOR FELT IN LIMA. STREETS EMPTY, NO DEATHS REPORTED.',
    source: 'REUTERS', scene: sceneQuake,
  },
  {
    kicker: 'COPENHAGEN - ESPIONAGE', headline: 'DENMARK EXPELS RUSSIAN DIPLOMAT',
    deck: 'COPENHAGEN ALLEGES PLOT TO KILL US-UKRAINIAN RAPPER.',
    source: 'AL JAZEERA', scene: sceneDenmark,
  },
  {
    kicker: 'WELLINGTON - CRICKET', headline: 'RAHUL COMPLETES THE SENA SET',
    deck: 'FIRST INDIAN OPENER WITH TEST TONS IN ALL FOUR SENA LANDS.',
    source: 'DAILY SHORT', scene: sceneCricket,
  },
];
const MIDS = [
  {
    headline: 'RUTTE FLIES TO WARSAW AFTER POLAND INCURSION',
    deck: 'NATO CHIEF DUE SATURDAY; TUSK CALLS IT DELIBERATE', source: 'REUTERS',
  },
  {
    headline: 'RECORD RUSH INTO INDIAN SHARES',
    deck: 'FOREIGN FUNDS POUR 1.22 LAKH CRORE RUPEES INTO SHARES', source: 'DEPOSITORIES',
  },
  {
    headline: 'SAUDI COALITION DOWNS THREE HOUTHI MISSILES',
    deck: 'IRGC CLAIMS A US MQ-9 DRONE DOWNED OVER THE STRAIT OF HORMUZ', source: 'AL JAZEERA',
  },
  {
    headline: 'ISRAELI DRONES KILL SEVEN IN CENTRAL GAZA',
    deck: 'STRIKES HIT CENTRAL GAZA AS THE WAR GRINDS ON', source: 'AL JAZEERA',
  },
  {
    headline: 'GUPTA GETS 19 YEARS 7 MONTHS IN US PLOT CASE',
    deck: 'INDIAN MAN SENTENCED OVER PLOT TO KILL SIKH SEPARATIST PANNUN', source: 'US COURT',
  },
];
const BRIEFS = [
  'HAITI: 2 SALVADORAN TROOPS KILLED',
  'ESTONIA TO SHUT RUSSIA CROSSINGS',
  'US WARNS SINGAPORE, MALAYSIA ON IRAN',
  '22,000 GAZA CHILDREN DEAD, MINISTRY',
  'TAIWAN FLAGS CHINA ACCOUNTS TO META',
  'UKMTO: INCIDENT OFF YEMEN COAST',
  'BUKELE SEEKS THIRD TERM TO 2033',
  'NEPAL PM TO VISIT DELHI ON SUNDAY',
  'DEPARDIEU PROBED OVER SEX CLAIMS',
  'EU: COP31 MUST NOT BE FOSSIL SUMMIT',
  'BESSENT: HUMANS MUST RUN AI WEAPONS',
  'IRAQ TO DEPLOY IN HEZBOLLAH AREA',
  'CHINA SEEKS ROHINGYA SOLUTION',
  'WINTER CEASEFIRE CALL FROM EUROPE',
];
const STRIP = [
  ['6.8', 'PERU QUAKE'],
  ['1.22', 'FPI RECORD INFLOW'],
  ['19Y7M', 'GUPTA SENTENCE'],
  ['3', 'MISSILES DOWNED'],
  ['7', 'GAZA DEAD'],
];

// ---- layout ---------------------------------------------------------------
function drawMasthead() {
  fillRect(0, 0, W, 58, INK);
  drawText('THE WORLD IN ONE DAY', 16, 15, 4, WHITE);
  drawTextRight('SATURDAY 21 NOVEMBER 2026', 1008, 18, 3, WHITE);
}
function drawStrip() {
  fillRect(0, 58, W, 64, RED);
  for (let i = 0; i < STRIP.length; i++) {
    const cx = Math.floor((i + 0.5) * W / STRIP.length);
    drawTextCenter(STRIP[i][0], cx, 66, 4, WHITE);
    drawTextCenter(STRIP[i][1], cx, 100, 2, WHITE);
    if (i > 0) vline(Math.floor(i * W / STRIP.length), 66, 114, WHITE);
  }
}
function drawHeroes() {
  for (let i = 0; i < HEROES.length; i++) {
    const h = HEROES[i];
    const cx = (i % 2) * 512;
    const cy = 122 + Math.floor(i / 2) * 182;
    h.scene(cx + 12, cy + 12);
    const tx = cx + 198;
    drawText(h.kicker, tx, cy + 16, 2, RED);
    const hl = wrap(h.headline, 16);
    let y = cy + 38;
    for (const ln of hl) { drawText(ln, tx, y, 3, INK); y += 22; }
    const dk = wrap(h.deck, 25);
    y = cy + 92;
    for (const ln of dk) { drawText(ln, tx, y, 2, INK); y += 15; }
    drawText(h.source, tx, cy + 158, 2, GREY);
  }
  hline(0, W - 1, 304, GREY);
  vline(512, 122, 486, GREY);
}
function drawMids() {
  for (let i = 0; i < MIDS.length; i++) {
    const m = MIDS[i];
    const y = 486 + i * 48;
    if (i > 0) hline(0, W - 1, y, [200, 195, 180]);
    fillRect(16, y + 19, 10, 10, RED);
    drawText(m.headline, 36, y + 8, 3, INK);
    drawText(m.deck, 36, y + 30, 2, INK);
    drawTextRight(m.source, 1008, y + 30, 2, GREY);
  }
}
function drawBriefs() {
  hline(0, W - 1, 726, GREY);
  for (let i = 0; i < BRIEFS.length; i++) {
    const col = Math.floor(i / 7);
    const row = i % 7;
    const x = col === 0 ? 16 : 520;
    const y = 734 + row * 33;
    drawText('•', x, y, 2, RED);
    drawText(BRIEFS[i], x + 18, y, 2, INK);
  }
}
function drawDateCheck() {
  fillRect(0, 966, W, 58, RED);
  drawText('DATE CHECK: THESE ARE NOT 21 NOV NEWS:', 16, 972, 2, WHITE);
  drawText('KYIV BARRAGE, TRUMP PRESSER, HUANG, RIEMANN CLAIM, GEN Z MARCHES, EU 1BN AID,', 16, 988, 2, WHITE);
  drawText('ZECLER VERDICT, SA CRIME STATS, UFO FILES, AKVAN LANDFALL, PUTIN TRUCE NO', 16, 1004, 2, WHITE);
}

// ---- main -----------------------------------------------------------------
function main() {
  fillRect(0, 0, W, H, PAPER);
  drawMasthead();
  drawStrip();
  drawHeroes();
  drawMids();
  drawBriefs();
  drawDateCheck();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || 'out';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/entry.png`, encodePNG());
}

main();
