// Shared contracts for the pixel cat app.
// Every module (sprites, behaviors, reminders, cat renderer, main) imports from here
// so that independently-written modules integrate without drift.

export type PaletteKey =
  | 'fur'
  | 'furDark'
  | 'belly'
  | 'innerEar'
  | 'nose'
  | 'eye'
  | 'stripe'
  | 'paw';

export interface CatPalette {
  fur: string;
  furDark: string;
  belly: string;
  innerEar: string;
  nose: string;
  eye: string;
  stripe: string;
  paw: string;
}

// A single animation frame. `rows[r][c]` is a palette key char or '.' for transparent.
// char map: F=fur D=furDark B=belly E=innerEar N=nose O=eye S=stripe P=paw W=white(->belly)
export type SpriteFrame = string[];

export type PoseId =
  | 'idle'
  | 'blink'
  | 'sit'
  | 'stretch'
  | 'hunt'
  | 'knead'
  | 'overheat'
  | 'drag'
  | 'sleep'
  | 'happy'
  | 'peek'
  | 'paper'
  | 'think'
  | 'jump';

export interface PoseDef {
  frames: SpriteFrame[];
  fps: number;
  loop: boolean;
}

export type SpriteSet = Record<PoseId, PoseDef>;

// ---- Behavior system contract ---------------------------------------------

export interface PointerState {
  overCat: boolean;
  dragging: boolean;
  draggingFrom: { x: number; y: number } | null;
  petting: boolean;
  lastPetAt: number;
}

export interface KeyEventData {
  key: string;
  type: 'keydown' | 'keyup';
  timestamp: number;
}

// What the BehaviorManager outputs each frame; the renderer consumes this.
export interface BehaviorOutput {
  pose: PoseId;
  frame: number; // computed by renderer from pose.fps/loop, set by behavior as hint
  facing: 1 | -1; // 1 = right, -1 = left
  squash: number; // scaleY multiplier, 1 = normal
  stretch: number; // scaleX multiplier
  bob: number; // idle vertical bob in px (0..1 normalized, renderer scales)
  eyeOffsetX: number; // pixels
  eyeOffsetY: number;
  petHappiness: number; // 0..1, rises while petting, drives purr/closed eyes
  overheat: number; // 0..1 steam intensity
  toast: string | null; // transient message shown above cat
  sound: 'purr' | 'meow' | 'stretch' | 'jump' | null; // one-shot sound request
}

export interface BehaviorHooks {
  onDrag: (dx: number, dy: number) => void; // rendered movement of the window
  onSpeak: (text: string, ms: number) => void;
  onSound: (s: BehaviorOutput['sound']) => void;
}

export interface BehaviorInput {
  mouse: { x: number; y: number } | null;
  keyEvents: KeyEventData[];
  pointer: PointerState;
  activeReminder: string | null; // non-null when a reminder is showing
  dt: number;
}

// ---- Reminder system contract ---------------------------------------------

export type ReminderKind = 'stretch' | 'water' | 'pomodoro' | 'message' | 'fixed';

export interface ReminderSpec {
  kind: ReminderKind;
  label: string;
  emoji: string;
  intervalMin: number; // for stretch/water: minutes between nudges
  durationMin: number; // pomodoro work duration
  breakMin: number; // pomodoro break duration
}

export interface ReminderState {
  kind: ReminderKind;
  active: boolean;
  secondsLeft: number; // for pomodoro countdown
  message: string | null;
}

export interface ReminderSystemHandle {
  tick: (dt: number) => void;
  setSpec: (spec: ReminderSpec) => void;
  setEnabled: (kind: ReminderKind, enabled: boolean) => void;
  getState: () => ReminderState[];
  notify: (kind: ReminderKind) => void; // force-trigger
  destroy: () => void;
}

// ---- Settings --------------------------------------------------------------

export interface Settings {
  name: string;
  catId: 'classic' | 'chonky' | 'sleek';
  followCursor: boolean;
  color: string; // primary fur hex
  pattern: 'solid' | 'tabby' | 'calico' | 'tuxedo';
  stretchMin: number;
  waterMin: number;
  pomodoroMin: number;
  pomodoroBreakMin: number;
  pomodoroEnabled: boolean;
  fixedMessage: string;
  peekMode: boolean;
  peekWhenFullscreen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  name: 'Zenith',
  catId: 'classic',
  followCursor: false,
  color: '#f5a05a',
  pattern: 'solid',
  stretchMin: 30,
  waterMin: 60,
  pomodoroMin: 25,
  pomodoroBreakMin: 5,
  pomodoroEnabled: true,
  fixedMessage: '',
  peekMode: false,
  peekWhenFullscreen: true,
};

export const SCALE = 4; // pixels per sprite cell
export const SPRITE_W = 30; // sprite grid width (cols)
export const SPRITE_H = 24; // sprite grid height (rows)
export const WIN_W = 140;
export const WIN_H = 130;
