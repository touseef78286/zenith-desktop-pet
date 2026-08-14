import type {
  ReminderKind,
  ReminderSpec,
  ReminderState,
  ReminderSystemHandle,
  Settings,
} from './types';

type NotifiableKind = ReminderKind | 'peek';

export interface ReminderOptions {
  container: HTMLElement;
  getSettings: () => Settings;
  onActivate: (kind: NotifiableKind) => void;
  onDeactivate: (kind: NotifiableKind) => void;
}

const TOAST_MS = 6000;
const PEEK_MS = 4000;
const MESSAGE_DEFAULT_LABEL = 'Reminder!';
const TRANSIENT: readonly NotifiableKind[] = ['stretch', 'water', 'message', 'peek'];

function formatMMSS(totalSeconds: number): string {
  const clamped = Math.max(0, Math.ceil(totalSeconds));
  const mm = Math.floor(clamped / 60);
  const ss = clamped % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function minutesToSeconds(min: number): number {
  return min > 0 ? min * 60 : 0;
}

export function createReminderSystem(opts: ReminderOptions): ReminderSystemHandle {
  const toastEl = opts.container.querySelector<HTMLElement>('#reminder-toast')!;
  const pomodoroEl = opts.container.querySelector<HTMLElement>('#pomodoro-timer')!;
  const nameEl = opts.container.querySelector<HTMLElement>('#name-label')!;
  const fixedEl = opts.container.querySelector<HTMLElement>('#fixed-message')!;

  const specs = new Map<ReminderKind, ReminderSpec>();
  const enabled = new Map<ReminderKind, boolean>([
    ['stretch', true],
    ['water', true],
    ['message', true],
    ['pomodoro', true],
  ]);

  let stretchElapsed = 0;
  let waterElapsed = 0;
  let messageElapsed = 0;

  let pomodoroActive = false;
  let pomodoroPhase: 'work' | 'break' = 'work';
  let pomodoroSeconds = 0;
  let pomodoroMessage: string | null = null;

  let toastKind: NotifiableKind | null = null;
  let toastTimer: number | null = null;

  let lastName: string | null = null;
  let lastFixed: string | null = null;
  let destroyed = false;

  function stretchIntervalSec(settings: Settings): number {
    const spec = specs.get('stretch');
    const min = spec && spec.intervalMin > 0 ? spec.intervalMin : settings.stretchMin;
    return minutesToSeconds(min);
  }

  function waterIntervalSec(settings: Settings): number {
    const spec = specs.get('water');
    const min = spec && spec.intervalMin > 0 ? spec.intervalMin : settings.waterMin;
    return minutesToSeconds(min);
  }

  function messageIntervalSec(): number {
    const spec = specs.get('message');
    return spec ? minutesToSeconds(spec.intervalMin) : 0;
  }

  function pomodoroWorkSec(settings: Settings): number {
    const spec = specs.get('pomodoro');
    const min = spec && spec.durationMin > 0 ? spec.durationMin : settings.pomodoroMin;
    return minutesToSeconds(min);
  }

  function pomodoroBreakSec(settings: Settings): number {
    const spec = specs.get('pomodoro');
    const min = spec && spec.breakMin > 0 ? spec.breakMin : settings.pomodoroBreakMin;
    return minutesToSeconds(min);
  }

  function messageLabel(): string {
    const spec = specs.get('message');
    return spec && spec.label ? spec.label : MESSAGE_DEFAULT_LABEL;
  }

  function isTransient(kind: NotifiableKind): boolean {
    return TRANSIENT.includes(kind);
  }

  function showToast(kind: NotifiableKind, text: string, ms: number): void {
    if (toastTimer !== null) {
      window.clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (toastKind !== null && toastKind !== kind && isTransient(toastKind)) {
      opts.onDeactivate(toastKind);
    }
    toastEl.textContent = text;
    toastEl.classList.remove('hidden');
    toastKind = kind;
    if (kind !== 'fixed') {
      opts.onActivate(kind);
    }
    toastTimer = window.setTimeout(() => {
      toastTimer = null;
      hideToast();
    }, ms);
  }

  function hideToast(): void {
    toastEl.classList.add('hidden');
    if (toastKind !== null && isTransient(toastKind)) {
      opts.onDeactivate(toastKind);
    }
    toastKind = null;
  }

  function firePeriodic(kind: 'stretch' | 'water' | 'message'): void {
    if (!enabled.get(kind)) return;
    const text =
      kind === 'stretch'
        ? 'Stretch with me!'
        : kind === 'water'
          ? 'Time to drink water!'
          : messageLabel();
    showToast(kind, text, TOAST_MS);
  }

  function updatePomodoro(dt: number, settings: Settings): void {
    if (!enabled.get('pomodoro') || !settings.pomodoroEnabled) {
      if (pomodoroActive) {
        pomodoroActive = false;
        opts.onDeactivate('pomodoro');
      }
      pomodoroEl.classList.add('hidden');
      return;
    }
    if (!pomodoroActive) {
      pomodoroActive = true;
      pomodoroPhase = 'work';
      pomodoroSeconds = pomodoroWorkSec(settings);
    }
    pomodoroSeconds -= dt;
    if (pomodoroSeconds <= 0) {
      if (pomodoroPhase === 'work') {
        pomodoroPhase = 'break';
        pomodoroSeconds = pomodoroBreakSec(settings);
        pomodoroMessage = 'Focus done — take a break!';
        showToast('pomodoro', pomodoroMessage, TOAST_MS);
      } else {
        pomodoroPhase = 'work';
        pomodoroSeconds = pomodoroWorkSec(settings);
        pomodoroMessage = 'Break over — back to focus!';
        showToast('pomodoro', pomodoroMessage, TOAST_MS);
      }
    }
    if (pomodoroPhase === 'work') {
      pomodoroEl.textContent = formatMMSS(pomodoroSeconds);
      pomodoroEl.classList.remove('hidden');
    } else {
      pomodoroEl.classList.add('hidden');
    }
  }

  function restartPomodoro(): void {
    const settings = opts.getSettings();
    if (!enabled.get('pomodoro') || !settings.pomodoroEnabled) return;
    pomodoroActive = true;
    pomodoroPhase = 'work';
    pomodoroSeconds = pomodoroWorkSec(settings);
    pomodoroMessage = null;
    pomodoroEl.textContent = formatMMSS(pomodoroSeconds);
    pomodoroEl.classList.remove('hidden');
  }

  function tick(dt: number): void {
    if (destroyed) return;
    const settings = opts.getSettings();

    if (settings.name !== lastName) {
      lastName = settings.name;
      nameEl.textContent = settings.name;
      nameEl.classList.remove('hidden');
    }
    if (settings.fixedMessage !== lastFixed) {
      lastFixed = settings.fixedMessage;
      if (settings.fixedMessage) {
        fixedEl.textContent = settings.fixedMessage;
        fixedEl.classList.remove('hidden');
      } else {
        fixedEl.classList.add('hidden');
      }
    }

    if (enabled.get('stretch')) {
      const interval = stretchIntervalSec(settings);
      if (interval > 0) {
        stretchElapsed += dt;
        if (stretchElapsed >= interval) {
          stretchElapsed = 0;
          firePeriodic('stretch');
        }
      } else {
        stretchElapsed = 0;
      }
    } else {
      stretchElapsed = 0;
    }

    if (enabled.get('water')) {
      const interval = waterIntervalSec(settings);
      if (interval > 0) {
        waterElapsed += dt;
        if (waterElapsed >= interval) {
          waterElapsed = 0;
          firePeriodic('water');
        }
      } else {
        waterElapsed = 0;
      }
    } else {
      waterElapsed = 0;
    }

    if (enabled.get('message')) {
      const interval = messageIntervalSec();
      if (interval > 0) {
        messageElapsed += dt;
        if (messageElapsed >= interval) {
          messageElapsed = 0;
          firePeriodic('message');
        }
      } else {
        messageElapsed = 0;
      }
    } else {
      messageElapsed = 0;
    }

    updatePomodoro(dt, settings);
  }

  function setSpec(spec: ReminderSpec): void {
    specs.set(spec.kind, spec);
    if (spec.kind === 'message') {
      messageElapsed = 0;
    }
  }

  function setEnabled(kind: ReminderKind, on: boolean): void {
    if (kind === 'fixed') return;
    const was = enabled.get(kind);
    if (was === on) return;
    enabled.set(kind, on);
    if (kind === 'pomodoro') {
      if (on) {
        pomodoroActive = false;
        pomodoroPhase = 'work';
        pomodoroSeconds = 0;
        pomodoroMessage = null;
      } else {
        if (pomodoroActive) {
          pomodoroActive = false;
          opts.onDeactivate('pomodoro');
        }
        pomodoroEl.classList.add('hidden');
        if (toastKind === 'pomodoro') {
          if (toastTimer !== null) {
            window.clearTimeout(toastTimer);
            toastTimer = null;
          }
          toastKind = null;
          toastEl.classList.add('hidden');
        }
      }
      return;
    }
    if (on) {
      if (kind === 'stretch') stretchElapsed = 0;
      else if (kind === 'water') waterElapsed = 0;
      else if (kind === 'message') messageElapsed = 0;
    } else if (toastKind === kind) {
      if (toastTimer !== null) {
        window.clearTimeout(toastTimer);
        toastTimer = null;
      }
      opts.onDeactivate(kind);
      toastKind = null;
      toastEl.classList.add('hidden');
    }
  }

  function getState(): ReminderState[] {
    const states: ReminderState[] = [];
    if (toastKind === 'stretch') {
      states.push({ kind: 'stretch', active: true, secondsLeft: 0, message: toastEl.textContent });
    }
    if (toastKind === 'water') {
      states.push({ kind: 'water', active: true, secondsLeft: 0, message: toastEl.textContent });
    }
    if (toastKind === 'message') {
      states.push({ kind: 'message', active: true, secondsLeft: 0, message: toastEl.textContent });
    }
    if (pomodoroActive) {
      states.push({
        kind: 'pomodoro',
        active: true,
        secondsLeft: Math.max(0, Math.ceil(pomodoroSeconds)),
        message: toastKind === 'pomodoro' ? pomodoroMessage : null,
      });
    }
    return states;
  }

  function notify(kind: NotifiableKind): void {
    if (destroyed) return;
    if (kind === 'peek') {
      showToast('peek', 'Peek!', PEEK_MS);
      return;
    }
    if (!enabled.get(kind)) return;
    if (kind === 'stretch' || kind === 'water' || kind === 'message') {
      firePeriodic(kind);
    } else if (kind === 'pomodoro') {
      restartPomodoro();
    }
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    if (toastTimer !== null) {
      window.clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (toastKind !== null && isTransient(toastKind)) {
      opts.onDeactivate(toastKind);
    }
    toastKind = null;
    if (pomodoroActive) {
      pomodoroActive = false;
      opts.onDeactivate('pomodoro');
    }
    toastEl.classList.add('hidden');
    pomodoroEl.classList.add('hidden');
    fixedEl.classList.add('hidden');
    nameEl.classList.add('hidden');
  }

  return {
    tick,
    setSpec,
    setEnabled,
    getState,
    notify,
    destroy,
  };
}
