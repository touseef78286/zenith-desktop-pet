import type { PaletteKey, PoseDef, SpriteFrame, SpriteSet } from './types';

export const SPRITE_W = 30;

const PALETTE_CHARS: Record<string, PaletteKey> = {
  F: 'fur',
  D: 'furDark',
  B: 'belly',
  E: 'innerEar',
  N: 'nose',
  O: 'eye',
  S: 'stripe',
  P: 'paw',
  W: 'belly',
};

const CLASSIC_BASE: SpriteFrame = [
  '........DED........DED........',
  '.......DEEE........EEED....DDD',
  '......DEEEED......DEEEED...DDD',
  '......DEEEEED....DEEEEED....DD',
  '......EEEEEED....DEEEEEE....DD',
  '......EEEEEEFDDDDFEEEEEE.....D',
  '......EEEEEEFFFFFFEEEEEE.....D',
  '......DEEEEFFFFFFFFEEEED..DDD.',
  '.....DFFFFFFFFFFFFFFFFFFD.DDD.',
  '....DFFFFFFFFFFFFFFFFFFFFD.DD.',
  '....DFFFFWWWFFFFFFWWWFFFFD..D.',
  '....DFFFWOOOWFFFFWOOOWFFFD...D',
  '...DFFFFWOOOWFFFFWOOOWFFFFD..D',
  '...DFFFFWOOOWFFFFWOOOWFFFFDDDD',
  'DDDDDDDFFWWWFFFFFFWWWFFDDDDDDD',
  'DDDDDDDFFFFFFFFNNFFFFFFFDDDDDD',
  '...DFFFFFFFFFFNNFFFFFFFFFFD...',
  'DDDDDDDFFFFFFNFFNFFFFFFDDDDDDD',
  'DDDDFFFFFFFFFFBBBFFFFFFFFFDDDD',
  '....DFFFFFFFFBBBBBFFFFFFFD....',
  '....DFFFFFFFBBBBBFFFFFFFD.....',
  '.....DFFFFFFBBBFFFFFFFD.......',
  '.......DDFFFFFFFFFFFFDD.......',
  '.........DDDDDDDDDDDD.........',
];

const CHONKY_BASE: SpriteFrame = [
  '.......DDD.........DDD........',
  '......DDDDD.......DDDDD.....DD',
  '......DDEED.......DDEED......D',
  '....DDDEEDD......DDDEEDD....DD',
  '....DEEEEDD......DEEEEDD......',
  '....DEEEEED......DEEEEED.....D',
  '..DDEEEEEEEDD..DDEEEEEEEDD..DD',
  '..DEEEEEEEEEDDDEEEEEEEEED..DD.',
  '.DDEEEEEEEEFFFFFFEEEEEEEEED.D.',
  '.DFFFFFFFFFFFFFFFFFFFFFFFFD..D',
  '..DFFFFFFFFFFFFFFFFFFFFFFD....',
  '..DFFFFWWWFFFFFFWWWFFFFFD.....',
  '..DFFFWOOOWFFFFWOOOWFFFFD.....',
  '.DFFFFWOOOWFFFFWOOOWFFFFFD..DD',
  '.DFFFFWOOOWFFFFWOOOWFFFFFD..DD',
  'DDDDDDFFWWWFFFFFFWWWFFDDDDDDD.',
  'DDDDDDFFFFFFFFNNFFFFFFFDDDDDDD',
  '.DDFFFFFFFFFFNNFFFFFFFFFFDDD..',
  'DDDDDDFFFFFFNFFNFFFFFFDDDDDDD.',
  'DDDDFFFFFFFFFFBBBFFFFFFFFFDDD.',
  '..DDFFFFFFFFBBBBBFFFFFFFDDD...',
  '...DFFFFFFFFBBBBBFFFFFFFD.....',
  '...DDFFFFFFFBBBBBFFFFFFDD.....',
  '.....DDDDFFFFFFFFDDDDDD.......',
];

const SLEEK_BASE: SpriteFrame = [
  '........D.D..........D.D......',
  '........D.E..........E.D....DD',
  '........DE..........ED.....DDD',
  '........DE..........ED.....DD.',
  '........DEEE.......EEEED......',
  '.......DEEEE.......EEEED....DD',
  '.......DEEEEE.......EEEED....D',
  '......DEEEEEEE......EEEEDD..DD',
  '.....DFFFFFFFFFFFFFFFFFFDD.DDD',
  '....DFFFFFFFFFFFFFFFFFFFFD..DD',
  '....DFFFFWWWFFFFFFWWWFFFFD...D',
  '....DFFFWOOOWFFFFWOOOWFFFD.DD.',
  '...DFFFFWOOOWFFFFWOOOWFFFFD.D.',
  '...DFFFFWOOOWFFFFWOOOWFFFFD.D.',
  '....DFFFWWWFFFFFFWWWFFFFFD.DDD',
  '...DFFFFFFFFFFNNFFFFFFFFFFFD..',
  '....DFFFFFFFFFNNFFFFFFFFFFD...',
  'DDDDFFFFFFFFFNNFFFFFFFDDDDDD..',
  'DDDDFFFFFFFFNFFNFFFFFFFDDDDDD.',
  '.DDFFFFFFFFFFBBBFFFFFFFFFDDD..',
  '....DFFFFFFFFBBBBBFFFFFFFD....',
  '.....DFFFFFFFBBBBBFFFFFFD.....',
  '.....DDFFFFFFBBBFFFFFFDD......',
  '.......DDDFFFFFFFFDDDD........',
];

function mapChar(frame: SpriteFrame, fn: (c: string) => string): SpriteFrame {
  return frame.map((row) =>
    row
      .split('')
      .map(fn)
      .join(''),
  );
}

function replaceRows(frame: SpriteFrame, index: number, replacement: string): SpriteFrame {
  const next = frame.slice();
  next[index] = replacement;
  return next;
}

function rowWithCenter(edgeChar: string, center: string): string {
  const edge = Math.floor((SPRITE_W - center.length) / 2);
  return edgeChar.repeat(edge) + center + edgeChar.repeat(SPRITE_W - edge - center.length);
}

function steamRow(positions: number[]): string {
  const cells: string[] = new Array<string>(SPRITE_W).fill('.');
  for (const p of positions) cells[p] = 'S';
  return cells.join('');
}

function paperRow(dotEvery: number, offset: number): string {
  const cells: string[] = new Array<string>(SPRITE_W).fill('W');
  for (let i = 0; i < SPRITE_W; i++) {
    if ((i - offset) % dotEvery === 0) cells[i] = 'D';
  }
  cells[0] = '.';
  cells[SPRITE_W - 1] = '.';
  return cells.join('');
}

function pose(frames: SpriteFrame[], fps: number, loop: boolean): PoseDef {
  return { frames, fps, loop };
}

// Raise the tail tip one cell so idle can sway base → raised over ~4s (reference).
function raiseTailTip(frame: SpriteFrame): SpriteFrame {
  const next = frame.map((row) => row.split(''));
  let top = -1;
  for (let r = 0; r < next.length; r++) {
    for (let c = 26; c < SPRITE_W; c++) {
      if (next[r][c] !== '.' && next[r][c] !== 'E' && next[r][c] !== 'O' && next[r][c] !== 'W') {
        top = r;
        break;
      }
    }
    if (top >= 0) break;
  }
  if (top <= 0) return frame;
  for (let c = 26; c < SPRITE_W; c++) {
    if (next[top][c] !== '.' && next[top - 1][c] === '.') {
      next[top - 1][c] = next[top][c];
    }
  }
  return next.map((row) => row.join(''));
}

// Build the full pose set for a given base breed shape.
function buildSpriteSet(base: SpriteFrame): SpriteSet {
  const withEyesClosed = (f: SpriteFrame) =>
    mapChar(f, (c) => (c === 'O' || c === 'W' ? 'F' : c));

  const headOnly = base.slice(0, 8);

  // Ear-twitch: briefly flash the left ear tip to inner-ear pink so it reads as a
  // fast ear flick (reference ~9–13s apart). Safe for every breed (tips sit on row 0).
  const twitchLeftEar = (f: SpriteFrame): SpriteFrame => {
    let tipRow = -1;
    let tipCols: number[] = [];
    outer: for (let r = 0; r < f.length; r++) {
      for (let c = 0; c < 13; c++) {
        const ch = f[r][c];
        if (ch === 'D') {
          tipRow = r;
          tipCols = [];
          for (let cc = 0; cc < 13; cc++) {
            if (f[r][cc] === 'D') tipCols.push(cc);
          }
          break outer;
        }
      }
    }
    if (tipRow < 0) return f;
    const arr = f.map((row) => row.split(''));
    for (const c of tipCols) {
      if (arr[tipRow][c] === 'D') arr[tipRow][c] = 'E';
    }
    return arr.map((row) => row.join(''));
  };

  // Sleep Zzz: closed eyes + 2 drifting "Z" bubbles near the head.
  const sleepZ = (step: number): SpriteFrame => {
    const closed = withEyesClosed(base);
    const arr = closed.map((row) => row.split(''));
    const zz = [
      { x: 24, y: 1 },
      { x: 25, y: 0 },
      { x: 26, y: -1 },
    ];
    for (let i = 0; i < 2; i++) {
      const p = zz[(step + i) % zz.length];
      if (p.y >= 0 && p.y < arr.length && p.x >= 0 && p.x < SPRITE_W) {
        arr[p.y][p.x] = 'B';
      }
    }
    return arr.map((row) => row.join(''));
  };

  const stretchBody: SpriteFrame = [
    ...base.slice(0, 18),
    rowWithCenter('F', 'BB'),
    rowWithCenter('F', 'BB'),
    rowWithCenter('F', 'BB'),
    rowWithCenter('F', 'BB'),
    rowWithCenter('F', 'BB'),
    rowWithCenter('F', 'BB'),
    ...base.slice(18, 24),
  ];

  const kneadUp = base.slice();
  const kneadDown = replaceRows(base, 17, rowWithCenter('F', 'PPPP'));

  const steamOver = [
    steamRow([4, 7, 12, 17, 20, 25]),
    steamRow([3, 7, 11, 12, 16, 20, 26]),
    ...base,
  ];

  const huntFrame = replaceRows(base, 17, rowWithCenter('F', 'DD'));

  const happyFrame = mapChar(base, (c) => (c === 'O' ? 'N' : c === 'W' ? 'F' : c));

  const thinkFrame = ['......WWW.....................', '......WWW.....................', ...base];

  const paperFrames: SpriteFrame = [
    ...base,
    paperRow(4, 0),
    paperRow(4, 0),
    paperRow(4, 2),
    paperRow(4, 0),
    paperRow(4, 0),
  ];

  return {
    idle: pose([base, raiseTailTip(base)], 0.5, true),
    blink: pose([withEyesClosed(base)], 1, false),
    sit: pose([base], 2, true),
    stretch: pose([stretchBody], 1, false),
    hunt: pose([huntFrame], 2, false),
    knead: pose([kneadUp, kneadDown], 6, true),
    overheat: pose([steamOver], 2, true),
    drag: pose([base], 2, true),
    sleep: pose([sleepZ(0), sleepZ(1), sleepZ(2), sleepZ(1)], 0.8, true),
    happy: pose([happyFrame], 2, false),
    peek: pose([headOnly], 2, true),
    paper: pose([paperFrames], 2, false),
    think: pose([thinkFrame], 1, true),
    jump: pose([happyFrame], 4, false),
    ear: pose([twitchLeftEar(base), base], 6, true),
  };
}

export type CatId = 'classic' | 'chonky' | 'sleek';

export const CAT_BREEDS: { id: CatId; name: string; color: string }[] = [
  { id: 'classic', name: 'Classic', color: '#f5a05a' },
  { id: 'chonky', name: 'Chonky', color: '#8e7cc3' },
  { id: 'sleek', name: 'Sleek', color: '#5b8fb9' },
];

export const CATS: Record<CatId, SpriteSet> = {
  classic: buildSpriteSet(CLASSIC_BASE),
  chonky: buildSpriteSet(CHONKY_BASE),
  sleek: buildSpriteSet(SLEEK_BASE),
};

// Backward-compatible default set.
export const SPRITES: SpriteSet = CATS.classic;

export function cellKey(c: string): PaletteKey {
  return PALETTE_CHARS[c] ?? 'fur';
}

export function validateSprites(): string[] {
  const problems: string[] = [];
  const valid = new Set(['.', ...Object.keys(PALETTE_CHARS)]);
  for (const [catId, cat] of Object.entries(CATS) as [string, SpriteSet][]) {
    for (const [poseId, def] of Object.entries(cat) as [string, PoseDef][]) {
      def.frames.forEach((frame, fi) => {
        frame.forEach((row, ri) => {
          if (row.length !== SPRITE_W) {
            problems.push(`${catId}.${poseId}[${fi}][${ri}] width ${row.length} != ${SPRITE_W}`);
          }
          for (const c of row) {
            if (!valid.has(c)) {
              problems.push(`${catId}.${poseId}[${fi}][${ri}] invalid char '${c}'`);
              break;
            }
          }
        });
      });
    }
  }
  return problems;
}