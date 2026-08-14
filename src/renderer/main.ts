import './styles.css';
import { CatRenderer } from './cat';
import { BehaviorManager } from './behaviors';
import { createReminderSystem } from './reminders';
import { makePalette } from './palette';
import { validateSprites, CATS, CAT_BREEDS, SPRITE_W, cellKey } from './sprites';
import type { BehaviorOutput, KeyEventData, PointerState, Settings } from './types';
import { DEFAULT_SETTINGS, ANCHOR_X, ANCHOR_BOTTOM, SCALE, SPRITE_H } from './types';
import type { ElectronAPI } from '../../electron/preload';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

const spriteProblems = validateSprites();
if (spriteProblems.length > 0) {
  console.warn('Sprite problems:', spriteProblems.join(', '));
}

const api = window.electronAPI;

const canvas = document.getElementById('cat-canvas') as HTMLCanvasElement;
const overlay = document.getElementById('ui-overlay') as HTMLElement;
const speechEl = document.getElementById('speech-bubble') as HTMLElement;

let settings: Settings = { ...DEFAULT_SETTINGS };
let activeReminder: string | null = null;
let lastMouseRel = { x: 100, y: 100 };
let keyQueue: KeyEventData[] = [];
let time = 0;
let settingsOpen = false;
let pickerOpen = false;
let menuOpen = false;
let speechTimer: number | null = null;

const pointer: PointerState = {
  overCat: false,
  dragging: false,
  draggingFrom: null,
  petting: false,
  lastPetAt: 0,
};

let mouseDown = false;
let downPos: { x: number; y: number } | null = null;

function showSpeech(text: string, ms = 3000): void {
  speechEl.textContent = text;
  speechEl.classList.remove('hidden');
  if (speechTimer !== null) window.clearTimeout(speechTimer);
  speechTimer = window.setTimeout(() => {
    speechEl.classList.add('hidden');
  }, ms);
}

function makeSound() {
  const Ctx = window.AudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const state = { ctx, last: 0 };
  const tone = (
    freq: number,
    start: number,
    dur: number,
    type: OscillatorType,
    vol = 0.12,
  ) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + dur + 0.05);
  };
  const gap = () => (state.last = Math.max(state.last, state.ctx.currentTime + 0.02));
  return {
    resume: () => ctx.resume(),
    play: (kind: NonNullable<BehaviorOutput['sound']>) => {
      gap();
      const t = state.last;
      if (kind === 'meow') {
        tone(600, t - ctx.currentTime, 0.09, 'sine', 0.1);
        tone(460, t - ctx.currentTime + 0.1, 0.12, 'sine', 0.1);
      } else if (kind === 'purr') {
        for (let i = 0; i < 8; i++) tone(52, t - ctx.currentTime + i * 0.09, 0.08, 'square', 0.05);
      } else if (kind === 'stretch') {
        tone(220, t - ctx.currentTime, 0.25, 'sine', 0.1);
        tone(330, t - ctx.currentTime + 0.22, 0.25, 'sine', 0.08);
      } else if (kind === 'jump') {
        tone(440, t - ctx.currentTime, 0.08, 'triangle', 0.12);
        tone(660, t - ctx.currentTime + 0.08, 0.12, 'triangle', 0.1);
      }
    },
  };
}

const sound = makeSound();

function overCat(x: number, y: number): boolean {
  // Derive the cat hit-zone from the shared layout constants (no magic numbers).
  const halfW = (SPRITE_W * SCALE) / 2;
  const h = SPRITE_H * SCALE;
  const cx = ANCHOR_X;
  const cy = ANCHOR_BOTTOM - h / 2;
  const rx = halfW + 8;
  const ry = h / 2 + 4;
  const nx = (x - cx) / rx;
  const ny = (y - cy) / ry;
  return nx * nx + ny * ny <= 1;
}

function renderBreedPreview(canvas: HTMLCanvasElement, breed: (typeof CAT_BREEDS)[number]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cells = CATS[breed.id].idle.frames[0];
  const scale = 2;
  const w = SPRITE_W * scale;
  const h = cells.length * scale;
  const ox = Math.floor((canvas.width - w) / 2);
  const oy = Math.floor((canvas.height - h) / 2);
  const palette = makePalette({ ...settings, color: breed.color });
  for (let r = 0; r < cells.length; r++) {
    const row = cells[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      ctx.fillStyle = palette[cellKey(ch)];
      ctx.fillRect(ox + c * scale, oy + r * scale, scale, scale);
    }
  }
}

function openPicker(): void {
  if (settingsOpen) return;
  pickerOpen = true;
  const el = document.getElementById('breed-picker');
  el?.classList.remove('hidden');
  updatePickerSelection();
  applyUiMode();
  updateIgnore();
}

function closePicker(): void {
  pickerOpen = false;
  document.getElementById('breed-picker')?.classList.add('hidden');
  applyUiMode();
  updateIgnore();
}

function selectBreed(catId: Settings['catId']): void {
  const breed = CAT_BREEDS.find((b) => b.id === catId);
  settings = { ...settings, catId, color: breed ? breed.color : settings.color };
  renderer.setCat(catId);
  api.setSettings(settings);
  updatePickerSelection();
  showSpeech(`Meet ${settings.name || 'Zenith'} · ${breed?.name ?? ''}`, 2000);
}

function updatePickerSelection(): void {
  document.querySelectorAll<HTMLButtonElement>('.picker-option').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.breed === settings.catId);
  });
}

function overGear(x: number, y: number): boolean {
  return x >= 0 && x <= 20 && y >= 0 && y <= 20;
}

let lastIgnore: boolean | null = null;

function updateIgnore(): void {
  // UI open => must be clickable. Otherwise, while following the cursor the
  // cat is decorative and must never block clicks — but the FOLLOW badge stays
  // clickable so follow mode can always be switched off from the window itself.
  const ignore =
    !settingsOpen &&
    !pickerOpen &&
    !menuOpen &&
    !pointer.dragging &&
    !overFollowBadge(lastMouseRel.x, lastMouseRel.y) &&
    (settings.followCursor ||
      (!overCat(lastMouseRel.x, lastMouseRel.y) && !overGear(lastMouseRel.x, lastMouseRel.y)));
  if (ignore !== lastIgnore) {
    lastIgnore = ignore;
    api.setIgnoreMouseEvents(ignore, { forward: true });
  }
}

const behavior = new BehaviorManager({
  onDrag: (dx, dy) => api.moveWindowBy(dx, dy),
  onSpeak: (text, ms) => showSpeech(text, ms),
  onSound: (s) => {
    if (s) sound?.play(s);
  },
});

const reminder = createReminderSystem({
  container: overlay,
  getSettings: () => settings,
  onActivate: (kind) => {
    activeReminder = kind;
  },
  onDeactivate: (kind) => {
    if (activeReminder === kind) activeReminder = null;
  },
});

const renderer = new CatRenderer(canvas);
renderer.setPattern(settings.pattern);

function buildSettingsUI(): void {
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const name = get<HTMLInputElement>('cat-name');
  const color = get<HTMLInputElement>('cat-color');
  const pattern = get<HTMLSelectElement>('cat-pattern');
  const breed = get<HTMLSelectElement>('cat-breed');
  const follow = get<HTMLInputElement>('follow-cursor');
  const stretch = get<HTMLInputElement>('stretch-interval');
  const water = get<HTMLInputElement>('water-interval');
  const pomoOn = get<HTMLInputElement>('pomodoro-enabled');
  const pomoMin = get<HTMLInputElement>('pomodoro-min');
  const pomoBreak = get<HTMLInputElement>('pomodoro-break');
  const fixed = get<HTMLInputElement>('fixed-message-input');
  const peek = get<HTMLInputElement>('peek-toggle');

  name.value = settings.name;
  color.value = settings.color;
  pattern.value = settings.pattern;
  breed.value = settings.catId;
  follow.checked = settings.followCursor;
  stretch.value = String(settings.stretchMin);
  water.value = String(settings.waterMin);
  pomoOn.checked = settings.pomodoroEnabled;
  pomoMin.value = String(settings.pomodoroMin);
  pomoBreak.value = String(settings.pomodoroBreakMin);
  fixed.value = settings.fixedMessage;
  peek.checked = settings.peekWhenFullscreen;
}

function readSettingsUI(): void {
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const num = (id: string, fallback: number) => {
    const v = Number(get<HTMLInputElement>(id).value);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  settings = {
    ...settings,
    name: get<HTMLInputElement>('cat-name').value.trim() || DEFAULT_SETTINGS.name,
    catId: get<HTMLSelectElement>('cat-breed').value as Settings['catId'],
    followCursor: get<HTMLInputElement>('follow-cursor').checked,
    color: get<HTMLInputElement>('cat-color').value,
    pattern: get<HTMLSelectElement>('cat-pattern').value as Settings['pattern'],
    stretchMin: num('stretch-interval', 30),
    waterMin: num('water-interval', 60),
    pomodoroEnabled: get<HTMLInputElement>('pomodoro-enabled').checked,
    pomodoroMin: num('pomodoro-min', 25),
    pomodoroBreakMin: num('pomodoro-break', 5),
    fixedMessage: get<HTMLInputElement>('fixed-message-input').value.trim(),
    peekWhenFullscreen: get<HTMLInputElement>('peek-toggle').checked,
  };
}

function openSettings(): void {
  if (pickerOpen) closePicker();
  buildSettingsUI();
  settingsOpen = true;
  document.getElementById('settings-panel')!.classList.remove('hidden');
  applyUiMode();
  updateIgnore();
}

function closeSettings(): void {
  settingsOpen = false;
  document.getElementById('settings-panel')!.classList.add('hidden');
  applyUiMode();
  updateIgnore();
}

function openMenu(): void {
  if (settingsOpen || pickerOpen) return;
  menuOpen = true;
  const state = document.getElementById('menu-follow-state');
  if (state) state.textContent = settings.followCursor ? 'on' : 'off';
  document.getElementById('zenith-menu')!.classList.remove('hidden');
  applyUiMode();
  updateIgnore();
}

function closeMenu(): void {
  if (!menuOpen) return;
  menuOpen = false;
  document.getElementById('zenith-menu')!.classList.add('hidden');
  applyUiMode();
  updateIgnore();
}

// Keep the window size in sync with whichever panel is open.
function applyUiMode(): void {
  const mode: 'none' | 'menu' | 'settings' | 'picker' = menuOpen
    ? 'menu'
    : settingsOpen
      ? 'settings'
      : pickerOpen
        ? 'picker'
        : 'none';
  api.setUiMode(mode);
}

function toggleFollow(): void {
  const next = !settings.followCursor;
  setFollow(next);
  const state = document.getElementById('menu-follow-state');
  if (state) state.textContent = next ? 'on' : 'off';
}

function setFollow(on: boolean): void {
  settings = { ...settings, followCursor: on };
  api.setSettings(settings);
  api.setFollow(on);
  updateFollowBadge();
  updateIgnore();
}

function updateFollowBadge(): void {
  const badge = document.getElementById('follow-badge');
  if (!badge) return;
  badge.classList.toggle('hidden', !settings.followCursor);
}

// While following, the window is pass-through except over the badge — that's the
// guaranteed in-window escape hatch (plus tray checkbox + Ctrl+Shift+F hotkey).
function overFollowBadge(x: number, y: number): boolean {
  const badge = document.getElementById('follow-badge');
  if (!badge || badge.classList.contains('hidden')) return false;
  const r = badge.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function runMenuAction(action: string): void {
  switch (action) {
    case 'cat':
      closeMenu();
      openPicker();
      break;
    case 'settings':
      closeMenu();
      openSettings();
      break;
    case 'stretch':
      reminder.notify('stretch');
      closeMenu();
      break;
    case 'water':
      reminder.notify('water');
      closeMenu();
      break;
    case 'pomodoro':
      reminder.notify('pomodoro' as Parameters<typeof reminder.notify>[0]);
      closeMenu();
      break;
    case 'peek':
      reminder.notify('peek' as Parameters<typeof reminder.notify>[0]);
      closeMenu();
      break;
    case 'follow':
      toggleFollow();
      break;
    case 'about':
      showSpeech('Zenith · a pixel cat desktop pet', 2500);
      closeMenu();
      break;
    case 'quit':
      closeMenu();
      api.quitApp();
      break;
  }
}

async function init(): Promise<void> {
  settings = { ...DEFAULT_SETTINGS, ...(await api.getSettings()) };
  renderer.setPattern(settings.pattern);
  renderer.setCat(settings.catId);
  api.setPeek(settings.peekWhenFullscreen);
  api.setFollow(settings.followCursor);
  updateFollowBadge();

  CAT_BREEDS.forEach((breed) => {
    const cv = document.querySelector<HTMLCanvasElement>(`.picker-preview[data-breed="${breed.id}"]`);
    if (cv) renderBreedPreview(cv, breed);
  });

  document.querySelectorAll<HTMLButtonElement>('.picker-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.breed as Settings['catId'];
      if (id) {
        selectBreed(id);
        closePicker();
      }
    });
  });

  api.onMouseMove((pos) => {
    lastMouseRel = pos;
  });

  api.onWindowSize(({ width, height }) => {
    // Grow/shrink the document so panels (menu/settings/picker) fill the whole
    // window instead of a fixed 140×130 box.
    document.body.style.width = `${width}px`;
    document.body.style.height = `${height}px`;
    applyUiMode();
  });

  api.onKeyEvent((e) => {
    keyQueue.push(e);
    if (keyQueue.length > 512) keyQueue.shift();
  });

  api.onOpenSettings(() => openSettings());
  api.onOpenPicker(() => openPicker());
  api.onToggleFollow(() => toggleFollow());
  api.onNudge((kind) => reminder.notify(kind as Parameters<typeof reminder.notify>[0]));
  api.onPeekStart(() => {
    activeReminder = 'peek';
    reminder.notify('peek' as Parameters<typeof reminder.notify>[0]);
  });
  api.onPeekEnd(() => {
    if (activeReminder === 'peek') activeReminder = null;
  });

  const saveBtn = document.getElementById('save-settings');
  const closeBtn = document.getElementById('close-settings');
  saveBtn?.addEventListener('click', () => {
    readSettingsUI();
    api.setSettings(settings);
    api.setPeek(settings.peekWhenFullscreen);
    api.setFollow(settings.followCursor);
    updateFollowBadge();
    renderer.setPattern(settings.pattern);
    renderer.setCat(settings.catId);
    closeSettings();
  });
  closeBtn?.addEventListener('click', () => closeSettings());

  const menuBtn = document.getElementById('menu-btn');
  menuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menuOpen) closeMenu();
    else openMenu();
  });

  const followBadge = document.getElementById('follow-badge');
  followBadge?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFollow();
  });

  document.querySelectorAll<HTMLButtonElement>('#zenith-menu .menu-item').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action) runMenuAction(action);
    });
  });

  window.addEventListener('mousedown', (e) => {
    if (settingsOpen || pickerOpen || menuOpen) return;
    if (overCat(e.clientX, e.clientY)) {
      mouseDown = true;
      pointer.dragging = true;
      pointer.draggingFrom = { x: lastMouseRel.x, y: lastMouseRel.y };
      downPos = { x: lastMouseRel.x, y: lastMouseRel.y };
      sound?.resume();
      updateIgnore();
    }
  });

  window.addEventListener('mouseup', () => {
    if (!mouseDown) return;
    mouseDown = false;
    const wasDragging = pointer.dragging;
    pointer.dragging = false;
    pointer.draggingFrom = null;
    if (wasDragging && downPos) {
      const moved = Math.hypot(lastMouseRel.x - downPos.x, lastMouseRel.y - downPos.y);
      if (moved < 6) behavior.triggerHappiness();
      if (moved < 6) openPicker();
    }
    downPos = null;
    updateIgnore();
  });

  window.addEventListener('keydown', (e) => {
    if (settingsOpen && e.key === 'Escape') closeSettings();
    else if (pickerOpen && e.key === 'Escape') closePicker();
    else if (menuOpen && e.key === 'Escape') closeMenu();
  });

  requestAnimationFrame(frame);
}

let lastT = performance.now();

function frame(now: number): void {
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  time += dt;

  pointer.overCat = overCat(lastMouseRel.x, lastMouseRel.y);
  pointer.petting = pointer.overCat && !mouseDown;
  if (pointer.petting) pointer.lastPetAt = performance.now();

  const out = behavior.update({
    mouse: lastMouseRel,
    keyEvents: keyQueue.splice(0, keyQueue.length),
    pointer: { ...pointer },
    activeReminder,
    dt,
  });

  if (out.toast) showSpeech(out.toast);

  renderer.draw(out, makePalette(settings), time);
  reminder.tick(dt);
  updateIgnore();

  requestAnimationFrame(frame);
}

init().catch((err) => console.error(err));
