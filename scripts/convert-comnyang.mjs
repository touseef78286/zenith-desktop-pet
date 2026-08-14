// Rasterizes the comnyang-logo.svg (30x30 pixel cat) into our sprite char grid.
// Run: node scripts/convert-comnyang.mjs
const BODY_SILH = 'M10.5 2.5V4.5H11.5V5.5H12.5V7.5H17.5V5.5H18.5V3.5H19.5V2.5H21.5V3.5H22.5V4.5H23.5V10.5H24.5V11.5H25.5V14.5H26.5V16.5H29.5V18.5H26.5V19.5H29.5V21.5H25.5V22.5H24.5V23.5H23.5V24.5H22.5V25.5H20.5V26.5H9.5V25.5H7.5V24.5H6.5V23.5H4.5V21.5H0.5V19.5H3.5V18.5H0.5V16.5H3.5V13.5H4.5V11.5H5.5V6.5H6.5V4.5H7.5V3.5H8.5V2.5H10.5Z';
const EAR_L = 'M6 10V7H7V5H8V4H9V3H10V5H11V6H12V10H11V11H7V10H6Z';
const EAR_R = 'M19 6H18V10H19V11H22V10H23V5H22V4H21V3H20V4H19V6Z';
const BODY_BLACK = 'M8 10H6V12H5V14H4V19H5V23H7V24H8V25H10V26H20V25H22V24H23V23H24V22H25V19H26V15H25V12H24V11H23V10H21V9H19V8H11V9H8V10Z';
const LEGS = [
  [1, 17, 6, 1],
  [23, 17, 6, 1],
  [1, 20, 6, 1],
  [23, 20, 6, 1],
];
const EYE_WHITES = [
  [17, 14, 1, 3],
  [21, 14, 1, 3],
  [18, 13, 3, 5],
  [8, 14, 1, 3],
  [12, 14, 1, 3],
  [9, 13, 3, 5],
];
const PUPILS = [
  [18, 14, 3, 3],
  [9, 14, 3, 3],
];

function parsePoly(d) {
  const pts = [];
  const re = /([MHV])\s*([-\d.\s]+?)(?=[MHV]|$)/g;
  let m;
  let x = 0, y = 0;
  while ((m = re.exec(d)) !== null) {
    const cmd = m[1];
    const nums = m[2].trim().split(/\s+/).map(Number);
    if (cmd === 'M') {
      x = nums[0];
      y = nums[1];
      pts.push([x, y]);
    } else if (cmd === 'H') {
      x = nums[0];
      pts.push([x, y]);
    } else if (cmd === 'V') {
      y = nums[0];
      pts.push([x, y]);
    }
  }
  if (pts.length && (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1])) {
    pts.push([pts[0][0], pts[0][1]]);
  }
  return { pts, edges: ptsToEdges(pts) };
}

function ptsToEdges(pts) {
  const e = [];
  for (let i = 0; i < pts.length - 1; i++) e.push([pts[i], pts[i + 1]]);
  return e;
}

function inPoly(edges, px, py) {
  let inside = false;
  for (const [[x1, y1], [x2, y2]] of edges) {
    if ((y1 <= py) !== (y2 <= py)) {
      const xInt = x1 + ((py - y1) * (x2 - x1)) / (y2 - y1);
      if (xInt > px) inside = !inside;
    }
  }
  return inside;
}

const W = 30;
const H = 30;
const S = new Set();
const B = new Set();
const E = new Set();
const silh = parsePoly(BODY_SILH);
const body = parsePoly(BODY_BLACK);
const earL = parsePoly(EAR_L);
const earR = parsePoly(EAR_R);

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const px = x;
    const py = y;
    if (inPoly(silh.edges, px, py)) S.add(`${x},${y}`);
    if (inPoly(body.edges, px, py)) B.add(`${x},${y}`);
    if (inPoly(earL.edges, px, py) || inPoly(earR.edges, px, py)) E.add(`${x},${y}`);
  }
}

// Determine bounding rows of the silhouette to crop (rows 2..26)
let minRow = 99, maxRow = -1;
for (const k of S) {
  const [, y] = k.split(',').map(Number);
  if (y < minRow) minRow = y;
  if (y > maxRow) maxRow = y;
}

function cell(x, y) {
  const key = `${x},${y}`;
  for (const [rx, ry, rw, rh] of PUPILS) if (x >= rx && x < rx + rw && y >= ry && y < ry + rh) return 'O';
  for (const [rx, ry, rw, rh] of EYE_WHITES) if (x >= rx && x < rx + rw && y >= ry && y < ry + rh) return 'W';
  if (E.has(key)) return 'E';
  for (const [rx, ry, rw, rh] of LEGS) if (x >= rx && x < rx + rw && y >= ry && y < ry + rh) return 'D';
  if (S.has(key)) {
    const nb = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ].some(([nx, ny]) => !S.has(`${nx},${ny}`));
    if (B.has(key)) return nb ? 'D' : 'F';
    return nb ? 'D' : 'F';
  }
  return '.';
}

const rowsOut = [];
for (let y = minRow; y <= maxRow; y++) {
  let row = '';
  for (let x = 0; x < W; x++) row += cell(x, y);
  rowsOut.push(row);
}

// force left/right symmetry
const prio = { E: 6, F: 5, D: 4, W: 3, O: 2, '.': 0 };
function pick(a, b) {
  if (a === '.' && b === '.') return '.';
  if (a === '.') return b;
  if (b === '.') return a;
  return prio[a] >= prio[b] ? a : b;
}
const R = rowsOut.length;
const C = 30;
const grid = rowsOut.map((r) => r.split(''));
for (let r = 0; r < R; r++) {
  for (let c = 0; c < Math.floor(C / 2); c++) {
    const m = C - 1 - c;
    const ch = pick(grid[r][c], grid[r][m]);
    grid[r][c] = ch;
    grid[r][m] = ch;
  }
}

function set(r, c, ch) {
  if (r >= 0 && r < R && c >= 0 && c < C) grid[r][c] = ch;
}

// product face: pink nose + "w" mouth
set(15, 14, 'N'); set(15, 15, 'N');
set(16, 14, 'N'); set(16, 15, 'N');
set(17, 13, 'N'); set(17, 16, 'N');
// cream belly patch
for (const [r, c0, c1] of [
  [18, 14, 16],
  [19, 13, 17],
  [20, 13, 17],
  [21, 14, 16],
]) {
  for (let c = c0; c <= c1; c++) set(r, c, 'B');
}

console.log(JSON.stringify(grid.map((r) => r.join(''))));