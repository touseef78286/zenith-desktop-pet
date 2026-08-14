import type { CatPalette, Settings } from './types';

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function mix(hex: string, target: number, amt: number): string {
  const [r, g, b] = parseHex(hex);
  const nr = clampByte(r + (target - r) * amt);
  const ng = clampByte(g + (target - g) * amt);
  const nb = clampByte(b + (target - b) * amt);
  return `#${[nr, ng, nb].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

export function darken(hex: string, amt = 0.3): string {
  return mix(hex, 0, amt);
}

export function lighten(hex: string, amt = 0.3): string {
  return mix(hex, 255, amt);
}

export function makePalette(settings: Settings): CatPalette {
  const fur = settings.color;
  switch (settings.pattern) {
    case 'tuxedo':
      return {
        fur: '#2c2c2c',
        furDark: '#141414',
        belly: '#f4f4f4',
        innerEar: '#e8a0a0',
        nose: '#e07a7a',
        eye: '#2b2b2b',
        stripe: '#1a1a1a',
        paw: '#3a3a3a',
      };
    case 'tabby':
      return {
        fur,
        furDark: darken(fur, 0.35),
        belly: lighten(fur, 0.35),
        innerEar: '#e8a0a0',
        nose: '#e07a7a',
        eye: '#2b2b2b',
        stripe: darken(fur, 0.45),
        paw: darken(fur, 0.2),
      };
    case 'calico':
      return {
        fur: '#f6d3a8',
        furDark: '#d9a86a',
        belly: '#fdf3e0',
        innerEar: '#e8a0a0',
        nose: '#e07a7a',
        eye: '#2b2b2b',
        stripe: '#c96a3a',
        paw: '#efc48f',
      };
    default:
      return {
        fur,
        furDark: darken(fur, 0.32),
        belly: lighten(fur, 0.28),
        innerEar: '#e8a0a0',
        nose: '#e07a7a',
        eye: '#2b2b2b',
        stripe: darken(fur, 0.4),
        paw: darken(fur, 0.18),
      };
  }
}
