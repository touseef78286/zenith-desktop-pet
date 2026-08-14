import type {
  BehaviorHooks,
  BehaviorInput,
  BehaviorOutput,
  KeyEventData,
  PointerState,
  PoseId,
} from './types';

const CENTER_X = 70;
const CENTER_Y = 70;
const SOUND_GAP = 0.8;
const KEY_WINDOW_MS = 1500;
const TYPING_MS = 800;
const KPS_WINDOW_MS = 1000;
const SUSTAIN_MS = 600;
const HUNT_RADIUS = 60;
const HUNT_SPEED = 30;
const HUNT_COOLDOWN = 1.5;
const HUNT_DURATION = 0.6;
const BLINK_DURATION = 0.15;
const BLINK_MIN = 3;
const BLINK_MAX = 5;
const EAR_TWITCH_MIN = 9;
const EAR_TWITCH_MAX = 13;
const EAR_TWITCH_DURATION = 0.18;
const SLEEP_AFTER_S = 40;
const BREATH_FREQ = (2 * Math.PI) / 3.5; // ~3.5s breathe cycle (reference)
const EYE_LERP = 8;
const EYE_LIMIT = 5;
const TOAST_SECONDS = 3;
const OVERHEAT_RISE = 1.25;
const OVERHEAT_FALL = 0.5;
const PET_DECAY = 0.5;
const PET_MODE_MS = 0.8;
const PURR_GAP = 1.5;
const PURR_LEVEL = 0.6;
const HAPPY_DURATION = 1.3;
const HAPPY_PHASE = 0.5;
const OVERHEAT_POSE_LEVEL = 0.01;

interface KeyStamp {
  ts: number;
  key: string;
}

interface HistPoint {
  x: number;
  y: number;
  t: number;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export class BehaviorManager {
  private hooks: BehaviorHooks;
  private time = 0;
  private destroyed = false;

  private recentKeys: KeyStamp[] = [];
  private seenKeyIds = new Set<string>();
  private lastKeyTs = 0;

  private overheat = 0;
  private blinkAt = BLINK_MIN + Math.random() * (BLINK_MAX - BLINK_MIN);
  private blinkT = 0;
  private earAt = EAR_TWITCH_MIN + Math.random() * (EAR_TWITCH_MAX - EAR_TWITCH_MIN);
  private earT = 0;
  private lastInteract = -Infinity;

  private eyeOffsetX = 0;
  private eyeOffsetY = 0;

  private mousePos: { x: number; y: number } | null = null;
  private pointerState: PointerState | null = null;
  private mouseHistory: HistPoint[] = [];

  private lastHuntAt = -Infinity;
  private huntT = 0;

  private facing: 1 | -1 = 1;

  private draggingActive = false;
  private lastDragPos: { x: number; y: number } | null = null;
  private dragSpeed = 0;

  private petHappiness = 0;
  private wasPetting = false;
  private pettingSince = -Infinity;
  private lastPurrAt = -Infinity;

  private lastSoundAt = -Infinity;
  private pendingSound: BehaviorOutput['sound'] = null;

  private lastReminder: string | null = null;
  private toast: string | null = null;
  private toastExpiry = -Infinity;
  private happySeq = 0;

  constructor(hooks: BehaviorHooks) {
    this.hooks = hooks;
  }

  update(input: BehaviorInput): BehaviorOutput {
    const out: BehaviorOutput = {
      pose: 'idle',
      frame: 0,
      facing: this.facing,
      squash: 1,
      stretch: 1,
      bob: 0,
      eyeOffsetX: 0,
      eyeOffsetY: 0,
      petHappiness: 0,
      overheat: 0,
      toast: null,
      sound: null,
    };
    if (this.destroyed) return out;

    const dt = input.dt > 0 ? input.dt : 0;
    this.time += dt;

    const pointer = input.pointer ?? this.pointerState ?? this.emptyPointer();
    const mouse = input.mouse ?? this.mousePos;

    for (const e of input.keyEvents) {
      if (e.type === 'keydown') this.recordKey(e.key, e.timestamp);
    }
    this.pruneKeys();

    const typing = this.recentTyping();
    this.updateOverheat(dt, typing);

    if (typing || pointer.dragging || pointer.petting || pointer.overCat) this.lastInteract = this.time;

    if (input.mouse !== null) this.updateEyes(dt, input.mouse);
    this.updateHunt(dt, input.mouse);

    if (mouse !== null && !pointer.dragging) this.updateFacing(mouse.x);
    this.updateDrag(pointer, mouse);
    this.updatePet(dt, pointer);
    this.updateBlink(dt);
    this.updateEar(dt);

    if (this.happySeq > 0) this.happySeq = Math.max(0, this.happySeq - dt);

    this.updateReminder(input.activeReminder);

    if (this.toast !== null && this.time >= this.toastExpiry) this.toast = null;

    out.pose = this.selectPose(typing);
    out.facing = this.facing;
    out.stretch = this.computeStretch();
    out.squash = this.computeSquash() * this.breathPhase();
    out.bob = 0.5 + 0.5 * Math.sin(this.time * BREATH_FREQ);
    out.eyeOffsetX = this.eyeOffsetX;
    out.eyeOffsetY = this.eyeOffsetY;
    out.petHappiness = this.petHappiness;
    out.overheat = this.overheat;
    out.toast = this.toast;
    out.sound = this.pendingSound;
    this.pendingSound = null;
    return out;
  }

  setMouse(x: number, y: number): void {
    this.mousePos = { x, y };
  }

  onKeyEvent(e: KeyEventData): void {
    if (e.type === 'keydown') this.recordKey(e.key, e.timestamp);
  }

  setPointer(p: PointerState): void {
    this.pointerState = p;
  }

  triggerHappiness(): void {
    this.happySeq = HAPPY_DURATION;
    this.showToast('Purrr!');
    this.requestSound('meow');
  }

  destroy(): void {
    this.destroyed = true;
    this.recentKeys.length = 0;
    this.seenKeyIds.clear();
    this.mouseHistory.length = 0;
    this.lastDragPos = null;
  }

  private emptyPointer(): PointerState {
    return {
      overCat: false,
      dragging: false,
      draggingFrom: null,
      petting: false,
      lastPetAt: 0,
    };
  }

  private recordKey(key: string, ts: number): void {
    const id = ts + ':' + key;
    if (this.seenKeyIds.has(id)) return;
    this.seenKeyIds.add(id);
    this.recentKeys.push({ ts, key });
    if (ts > this.lastKeyTs) this.lastKeyTs = ts;
  }

  private pruneKeys(): void {
    const cutoff = this.lastKeyTs - KEY_WINDOW_MS;
    while (this.recentKeys.length > 0 && this.recentKeys[0].ts < cutoff) {
      this.recentKeys.shift();
    }
    if (this.recentKeys.length === 0) this.seenKeyIds.clear();
  }

  private recentTyping(): boolean {
    if (this.recentKeys.length === 0) return false;
    const now = this.lastKeyTs;
    for (const k of this.recentKeys) {
      if (k.ts > now - TYPING_MS) return true;
    }
    return false;
  }

  private sustainedTyping(): boolean {
    if (this.recentKeys.length < 7) return false;
    const now = this.lastKeyTs;
    let count = 0;
    let first = this.recentKeys[this.recentKeys.length - 1].ts;
    for (let i = this.recentKeys.length - 1; i >= 0; i--) {
      const k = this.recentKeys[i];
      if (k.ts <= now - KPS_WINDOW_MS) break;
      count++;
      if (k.ts < first) first = k.ts;
    }
    return count > 6 && this.lastKeyTs - first > SUSTAIN_MS;
  }

  private updateOverheat(dt: number, typing: boolean): void {
    if (typing && this.sustainedTyping()) {
      this.overheat = Math.min(1, this.overheat + dt * OVERHEAT_RISE);
    } else {
      this.overheat = Math.max(0, this.overheat - dt * OVERHEAT_FALL);
    }
  }

  private updateEyes(dt: number, mouse: { x: number; y: number }): void {
    const k = 1 - Math.exp(-dt * EYE_LERP);
    const tx = clamp(mouse.x - CENTER_X, -EYE_LIMIT, EYE_LIMIT);
    const ty = clamp(mouse.y - CENTER_Y, -EYE_LIMIT, EYE_LIMIT);
    this.eyeOffsetX += (tx - this.eyeOffsetX) * k;
    this.eyeOffsetY += (ty - this.eyeOffsetY) * k;
  }

  private updateHunt(dt: number, mouse: { x: number; y: number } | null): void {
    this.huntT = Math.max(0, this.huntT - dt);
    if (mouse === null) return;
    this.mouseHistory.push({ x: mouse.x, y: mouse.y, t: this.time });
    const cutoff = this.time - 0.1;
    while (this.mouseHistory.length > 0 && this.mouseHistory[0].t < cutoff) {
      this.mouseHistory.shift();
    }
    if (this.mouseHistory.length < 2) return;
    const a = this.mouseHistory[this.mouseHistory.length - 2];
    const b = this.mouseHistory[this.mouseHistory.length - 1];
    if (!a || !b) return;
    const speed = Math.hypot(b.x - a.x, b.y - a.y);
    const dx = b.x - CENTER_X;
    const dy = b.y - CENTER_Y;
    if (
      Math.hypot(dx, dy) <= HUNT_RADIUS &&
      speed > HUNT_SPEED &&
      this.time - this.lastHuntAt >= HUNT_COOLDOWN
    ) {
      this.huntT = HUNT_DURATION;
      this.lastHuntAt = this.time;
      this.showToast('!');
      this.requestSound('meow');
    }
  }

  private updateFacing(mx: number): void {
    if (mx > CENTER_X) this.facing = 1;
    else if (mx < CENTER_X) this.facing = -1;
  }

  private updateDrag(pointer: PointerState, mouse: { x: number; y: number } | null): void {
    if (pointer.dragging && mouse !== null) {
      if (!this.draggingActive) {
        this.draggingActive = true;
        const from = pointer.draggingFrom;
        this.lastDragPos =
          from !== null ? { x: from.x, y: from.y } : { x: mouse.x, y: mouse.y };
      }
      const prev = this.lastDragPos;
      if (prev !== null) {
        const dx = mouse.x - prev.x;
        const dy = mouse.y - prev.y;
        this.dragSpeed = Math.hypot(dx, dy);
        this.hooks.onDrag(dx, dy);
      }
      this.lastDragPos = { x: mouse.x, y: mouse.y };
    } else {
      this.draggingActive = false;
      this.lastDragPos = null;
      this.dragSpeed = 0;
    }
  }

  private updatePet(dt: number, pointer: PointerState): void {
    if (pointer.petting) {
      if (!this.wasPetting) this.pettingSince = this.time;
      this.wasPetting = true;
    } else {
      this.wasPetting = false;
    }
    const active = pointer.petting || this.time - this.pettingSince < PET_MODE_MS;
    if (active) {
      this.petHappiness = Math.min(1, this.petHappiness + dt);
      if (this.petHappiness > PURR_LEVEL && this.time - this.lastPurrAt >= PURR_GAP) {
        this.lastPurrAt = this.time;
        this.requestSound('purr');
      }
    } else {
      this.petHappiness = Math.max(0, this.petHappiness - dt * PET_DECAY);
    }
  }

  private updateBlink(dt: number): void {
    if (this.blinkT > 0) {
      this.blinkT -= dt;
      return;
    }
    if (this.time >= this.blinkAt) {
      this.blinkT = BLINK_DURATION;
      this.blinkAt = this.time + BLINK_MIN + Math.random() * (BLINK_MAX - BLINK_MIN);
    }
  }

  // Occasional ear flick (reference ~11s / 13s apart).
  private updateEar(dt: number): void {
    if (this.earT > 0) {
      this.earT -= dt;
      return;
    }
    if (this.time >= this.earAt) {
      this.earT = EAR_TWITCH_DURATION;
      this.earAt = this.time + EAR_TWITCH_MIN + Math.random() * (EAR_TWITCH_MAX - EAR_TWITCH_MIN);
    }
  }

  private updateReminder(rem: string | null): void {
    if (rem !== this.lastReminder) {
      if (rem !== null) this.activateReminder(rem);
      this.lastReminder = rem;
    }
  }

  private activateReminder(rem: string): void {
    if (rem === 'stretch') {
      this.showToast('Stretch with me!');
      this.requestSound('stretch');
    } else if (rem === 'water') {
      this.showToast('Time to drink water!');
      this.requestSound('meow');
    } else if (rem === 'pomodoro' || rem === 'message') {
      const sep = rem.indexOf(':');
      const payload = sep >= 0 ? rem.slice(sep + 1) : '';
      this.showToast(
        payload.length > 0
          ? payload
          : rem === 'pomodoro'
            ? 'Pomodoro time!'
            : 'New message!',
      );
    } else if (rem !== 'peek' && rem !== 'think') {
      this.showToast(rem);
    }
  }

  private selectPose(typing: boolean): PoseId {
    if (this.draggingActive) return 'drag';
    if (this.overheat > OVERHEAT_POSE_LEVEL) return 'overheat';
    if (this.lastReminder === 'stretch') return 'stretch';
    if (this.huntT > 0) return 'hunt';
    if (this.lastReminder === 'peek') return 'peek';
    if (this.lastReminder === 'think') return 'think';
    if (this.happySeq > 0) return this.happySeq > HAPPY_PHASE ? 'happy' : 'jump';
    if (typing) return 'knead';
    if (this.time - this.lastInteract > SLEEP_AFTER_S) return 'sleep';
    if (this.blinkT > 0) return 'blink';
    if (this.earT > 0) return 'ear';
    return 'idle';
  }

  private computeStretch(): number {
    if (this.draggingActive) return clamp(1 + this.dragSpeed / 400, 1, 1.6);
    return 1;
  }

  private computeSquash(): number {
    if (this.draggingActive) return 1 / this.computeStretch();
    if (this.petHappiness > PURR_LEVEL) return 1.02;
    return 1;
  }

  // Subtle inhale/exhale: body gently widens/narrows in sync with bob (1.015/0.985).
  private breathPhase(): number {
    return 1 + 0.015 * Math.sin(this.time * BREATH_FREQ - Math.PI / 2);
  }

  private showToast(text: string): void {
    this.toast = text;
    this.toastExpiry = this.time + TOAST_SECONDS;
  }

  private requestSound(s: BehaviorOutput['sound']): void {
    if (!s || this.time - this.lastSoundAt < SOUND_GAP) return;
    this.lastSoundAt = this.time;
    this.pendingSound = s;
    this.hooks.onSound(s);
  }
}
