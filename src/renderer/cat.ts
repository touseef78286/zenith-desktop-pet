import type { BehaviorOutput, CatPalette, PoseId } from './types';
import { CATS, SPRITE_W, cellKey, type CatId } from './sprites';

const WIN_W = 140;
const WIN_H = 130;
const SCALE = 3;
const ANCHOR_X = 70;
const ANCHOR_BOTTOM = 118;

interface EyeSpec {
  room: { x: number; y: number; w: number; h: number };
  pupil: { x: number; y: number; w: number; h: number };
}

const EYES: EyeSpec[] = [
  { room: { x: 7, y: 10, w: 5, h: 5 }, pupil: { x: 8, y: 11, w: 3, h: 3 } },
  { room: { x: 16, y: 10, w: 5, h: 5 }, pupil: { x: 17, y: 11, w: 3, h: 3 } },
];

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

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(out.facing * out.stretch, out.squash);
    ctx.translate(-cx, -cy);

    this.drawCells(cells, palette, x0, yTop);

    this.drawPattern(palette, x0, yTop);

    this.drawEyes(out, palette, x0, yTop);
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

  private drawPattern(palette: CatPalette, x0: number, yTop: number): void {
    const ctx = this.ctx;
    if (this.pattern === 'tabby') {
      ctx.fillStyle = palette.stripe;
      ctx.globalAlpha = 0.3;
      for (const row of [16, 18, 20]) {
        ctx.fillRect(x0 + 4 * SCALE, yTop + row * SCALE, 22 * SCALE, SCALE);
      }
      ctx.globalAlpha = 1;
    } else if (this.pattern === 'calico') {
      ctx.fillStyle = palette.stripe;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(x0 + 5 * SCALE, yTop + 5 * SCALE, 4 * SCALE, 3 * SCALE);
      ctx.fillRect(x0 + 21 * SCALE, yTop + 5 * SCALE, 4 * SCALE, 3 * SCALE);
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x0 + 12 * SCALE, yTop + 17 * SCALE, 6 * SCALE, 3 * SCALE);
      ctx.globalAlpha = 1;
    }
  }

  private drawEyes(out: BehaviorOutput, palette: CatPalette, x0: number, yTop: number): void {
    if (CLOSED_POSES.has(out.pose)) return;
    const ctx = this.ctx;
    const white = palette.belly;
    const dark = palette.furDark;

    for (const eye of EYES) {
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
        ctx.fillRect(x0 + eye.room.x * SCALE + SCALE, yTop + (eye.room.y + 2) * SCALE, 3 * SCALE, SCALE);
      } else {
        ctx.fillStyle = dark;
        ctx.fillRect(px, py, pw, ph);
      }
    }
  }
}
