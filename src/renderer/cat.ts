import {
  ANCHOR_BOTTOM,
  ANCHOR_X,
  SCALE,
  WIN_H,
  WIN_W,
  type BehaviorOutput,
  type CatPalette,
  type PoseId,
  type SpriteFrame,
} from './types';
import { CATS, SPRITE_W, cellKey, type CatId } from './sprites';

interface EyeRoom {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface EyeSpec {
  room: EyeRoom;
  pupil: { x: number; y: number; w: number; h: number };
}

// Compute eye bounding boxes from the actual 'O' cells in the frame so eyes
// stay glued to each breed's art regardless of breed shape or pose edits.
function eyeBoxes(cells: SpriteFrame): EyeSpec[] {
  const rooms: EyeRoom[] = [
    { x: -1, y: -1, w: 0, h: 0 },
    { x: -1, y: -1, w: 0, h: 0 },
  ];
  for (let r = 0; r < cells.length; r++) {
    const row = cells[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== 'O') continue;
      const i = c < SPRITE_W / 2 ? 0 : 1;
      const b = rooms[i];
      if (b.x === -1) {
        b.x = c;
        b.y = r;
        b.w = 1;
        b.h = 1;
      } else {
        b.x = Math.min(b.x, c);
        b.y = Math.min(b.y, r);
        b.w = Math.max(b.x + b.w, c + 1) - b.x;
        b.h = Math.max(b.y + b.h, r + 1) - b.y;
      }
    }
  }
  return rooms
    .filter((r) => r.x >= 0)
    .map((r) => ({
      room: r,
      pupil: {
        x: r.x + Math.floor(r.w / 2),
        y: r.y + Math.floor(r.h / 2),
        w: 1,
        h: 1,
      },
    }));
}

const CLOSED_POSES = new Set<PoseId>(['blink', 'sleep', 'happy', 'jump']);

export class CatRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  private catId: CatId = 'classic';
  private pattern: 'solid' | 'tabby' | 'calico' | 'tuxedo' = 'solid';

  constructor(private canvas: HTMLCanvasElement) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = WIN_W * this.dpr;
    canvas.height = WIN_H * this.dpr;
    canvas.style.width = `${WIN_W}px`;
    canvas.style.height = `${WIN_H}px`;
    this.ctx = canvas.getContext('2d')!;
  }

  setCat(id: CatId): void {
    this.catId = id;
  }

  setPattern(p: 'solid' | 'tabby' | 'calico' | 'tuxedo'): void {
    this.pattern = p;
  }

  draw(out: BehaviorOutput, palette: CatPalette, time: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, WIN_W, WIN_H);

    const def = CATS[this.catId][out.pose];
    const frame =
      def.loop && def.frames.length > 1
        ? Math.floor(time * def.fps) % def.frames.length
        : 0;
    const cells = def.frames[frame];

    const h = cells.length * SCALE;
    const w = SPRITE_W * SCALE;
    const x0 = ANCHOR_X - w / 2;
    let yTop = ANCHOR_BOTTOM - h - out.bob * 4;
    const cx = ANCHOR_X;
    const cy = ANCHOR_BOTTOM - h / 2;

    // Soft ground shadow so the cat "sits" on the desktop instead of floating.
    this.drawShadow(cx, ANCHOR_BOTTOM, w, out.squash);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(out.facing * out.stretch, out.squash);
    ctx.translate(-cx, -cy);

    this.drawOutline(cells, palette, x0, yTop);

    this.drawCells(cells, palette, x0, yTop);

    this.drawPattern(cells, palette, x0, yTop);

    this.drawEyes(out, palette, x0, yTop, cells);
    ctx.restore();

    if (out.overheat > 0.01) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(255,60,30,${(out.overheat * 0.4).toFixed(3)})`;
      ctx.fillRect(0, 0, WIN_W, WIN_H);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  private drawCells(
    cells: string[],
    palette: CatPalette,
    x0: number,
    yTop: number,
  ): void {
    const ctx = this.ctx;
    for (let r = 0; r < cells.length; r++) {
      const row = cells[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.') continue;
        ctx.fillStyle = palette[cellKey(ch)];
        ctx.fillRect(x0 + c * SCALE, yTop + r * SCALE, SCALE, SCALE);
      }
    }
  }

  private drawShadow(cx: number, feetY: number, w: number, squash: number): void {
    const ctx = this.ctx;
    const halfW = w / 2 + 4;
    const rad = Math.max(halfW * (3 - squash), 3);
    const g = ctx.createRadialGradient(cx, feetY + 4, 1, cx, feetY + 4, rad);
    g.addColorStop(0, 'rgba(10,10,10,0.22)');
    g.addColorStop(1, 'rgba(10,10,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, feetY + 5, rad, rad * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // One-cell dark outline around the silhouette so the cat pops against any
  // desktop background (kills the washed-out "boxed" look).
  private drawOutline(
    cells: string[],
    palette: CatPalette,
    x0: number,
    yTop: number,
  ): void {
    const ctx = this.ctx;
    const outline = palette.furDark;
    ctx.save();
    ctx.globalAlpha = 0.55;
    for (let r = 0; r < cells.length; r++) {
      const row = cells[r];
      for (let c = 0; c < row.length; c++) {
        if (row[c] === '.') continue;
        ctx.fillStyle = outline;
        ctx.fillRect(x0 + (c - 1) * SCALE, yTop + r * SCALE, SCALE, SCALE);
        ctx.fillRect(x0 + (c + 1) * SCALE, yTop + r * SCALE, SCALE, SCALE);
        ctx.fillRect(x0 + c * SCALE, yTop + (r - 1) * SCALE, SCALE, SCALE);
        ctx.fillRect(x0 + c * SCALE, yTop + (r + 1) * SCALE, SCALE, SCALE);
      }
    }
    ctx.restore();
  }

  private drawPattern(
    cells: SpriteFrame,
    palette: CatPalette,
    x0: number,
    yTop: number,
  ): void {
    const ctx = this.ctx;

    // Clip every pattern shape to the cat's silhouette so stripes/patches never
    // spill outside the fur — this kills the old "boxed / edge-cut" look.
    ctx.save();
    ctx.beginPath();
    for (let r = 0; r < cells.length; r++) {
      const row = cells[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.' || ch === 'O' || ch === 'N' || ch === 'B') continue;
        ctx.rect(x0 + c * SCALE, yTop + r * SCALE, SCALE, SCALE);
      }
    }
    ctx.clip();

    if (this.pattern === 'tabby') {
      ctx.fillStyle = palette.stripe;
      const stripeRows = this.catId === 'chonky' ? [16, 18, 20, 22] : [16, 18, 20];
      for (const row of stripeRows) {
        ctx.globalAlpha = 0.35;
        ctx.fillRect(x0 - SCALE, yTop + row * SCALE, SPRITE_W * SCALE + SCALE * 2, SCALE);
        ctx.globalAlpha = 0.15;
        ctx.fillRect(x0 - SCALE, yTop + (row + 1) * SCALE, SPRITE_W * SCALE + SCALE * 2, SCALE * 0.6);
      }
      ctx.globalAlpha = 1;
    } else if (this.pattern === 'calico') {
      ctx.fillStyle = palette.stripe;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(x0 + 4 * SCALE, yTop + 4 * SCALE, 5 * SCALE, 4 * SCALE);
      ctx.fillRect(x0 + 20 * SCALE, yTop + 4 * SCALE, 5 * SCALE, 4 * SCALE);
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x0 + 11 * SCALE, yTop + 16 * SCALE, 7 * SCALE, 4 * SCALE);
      ctx.globalAlpha = 1;
    } else if (this.pattern === 'tuxedo') {
      // White bib + belly stripe, clipped to silhouette.
      ctx.fillStyle = palette.belly;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x0 + 12 * SCALE, yTop + 17 * SCALE, 6 * SCALE, 6 * SCALE);
      ctx.globalAlpha = 0.3;
      ctx.fillRect(x0 + 13 * SCALE, yTop + 8 * SCALE, 4 * SCALE, 3 * SCALE);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private drawEyes(
    out: BehaviorOutput,
    palette: CatPalette,
    x0: number,
    yTop: number,
    cells: SpriteFrame,
  ): void {
    if (CLOSED_POSES.has(out.pose)) return;
    const ctx = this.ctx;
    const white = palette.belly;
    const dark = palette.furDark;

    for (const eye of eyeBoxes(cells)) {
      const rx = x0 + eye.room.x * SCALE;
      const ry = yTop + eye.room.y * SCALE;
      const rw = eye.room.w * SCALE;
      const rh = eye.room.h * SCALE;
      ctx.fillStyle = white;
      ctx.fillRect(rx, ry, rw, rh);

      const dx = Math.round(out.eyeOffsetX / 5);
      const dy = Math.round(out.eyeOffsetY / 5);
      const ox = Math.max(-1, Math.min(1, dx));
      const oy = Math.max(-1, Math.min(1, dy));

      const px = x0 + (eye.pupil.x + ox) * SCALE;
      const py = yTop + (eye.pupil.y + oy) * SCALE;
      const pw = eye.pupil.w * SCALE;
      const ph = eye.pupil.h * SCALE;

      if (out.petHappiness > 0.5) {
        ctx.fillStyle = dark;
        ctx.fillRect(
          x0 + eye.room.x * SCALE + SCALE,
          yTop + (eye.room.y + eye.room.h - 1) * SCALE,
          (eye.room.w - 2) * SCALE,
          SCALE,
        );
      } else {
        ctx.fillStyle = dark;
        ctx.fillRect(px, py, pw, ph);
      }
    }
  }
}
