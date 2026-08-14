import { app, BrowserWindow, screen, Tray, Menu, nativeImage, ipcMain, globalShortcut } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { uIOhook, UiohookKey, type UiohookKeyboardEvent } from 'uiohook-napi';
import type { Settings } from '../src/renderer/types';

const DEFAULT_SETTINGS: Settings = {
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

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let peekEnabled = false;
let peekActive = false;
let followCursor = false;
let cursorTimer: NodeJS.Timeout | null = null;
let followSmooth = { x: 0, y: 0 };

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function isSettings(v: unknown): v is Settings {
  const s = v as Record<string, unknown>;
  if (!s || typeof s !== 'object') return false;
  return (
    typeof s.name === 'string' &&
    s.name.length <= 64 &&
    /^#[0-9a-fA-F]{6}$/.test(String(s.color)) &&
    ['solid', 'tabby', 'calico', 'tuxedo'].includes(String(s.pattern)) &&
    ['classic', 'chonky', 'sleek'].includes(String(s.catId)) &&
    typeof s.followCursor === 'boolean' &&
    [s.stretchMin, s.waterMin, s.pomodoroMin, s.pomodoroBreakMin].every(
      (n) => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 100000,
    ) &&
    typeof s.pomodoroEnabled === 'boolean' &&
    typeof s.fixedMessage === 'string' &&
    s.fixedMessage.length <= 120 &&
    typeof s.peekMode === 'boolean' &&
    typeof s.peekWhenFullscreen === 'boolean'
  );
}

function loadSettings(): Settings {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf-8')) as unknown;
    if (isSettings(raw)) {
      // Legacy guard: earlier builds could persist followCursor:true which made
      // the cat cover the cursor and block clicks. Always start disarmed.
      raw.followCursor = false;
      return { ...DEFAULT_SETTINGS, ...raw };
    }
    return { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s: Settings): void {
  try {
    const file = settingsFile();
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

function trayIcon(): Electron.NativeImage {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../assets/tray.png'));
  if (icon.isEmpty()) {
    return nativeImage.createEmpty();
  }
  return icon.resize({ width: 16, height: 16 });
}

function createWindow(): void {
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.workAreaSize;

  mainWindow = new BrowserWindow({
    width: 140,
    height: 130,
    x: width - 160,
    y: height - 150,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log(`[renderer:${level}] ${message}`);
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const current = mainWindow?.webContents.getURL();
    if (current && url !== current) e.preventDefault();
  });

  if (process.env['VITE_DEV_SERVER_URL']) {
    mainWindow.loadURL(process.env['VITE_DEV_SERVER_URL']);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/src/renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (cursorTimer) clearInterval(cursorTimer);
  });
}

function buildTrayMenu(): void {
  if (!tray) return;
  const toggleFollow = () => mainWindow?.webContents.send('toggle-follow');
  const menu = Menu.buildFromTemplate([
    {
      label: 'Show / Hide Cat',
      click: () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) mainWindow.hide();
        else mainWindow.show();
      },
    },
    {
      label: 'Settings',
      click: () => mainWindow?.webContents.send('open-settings'),
    },
    {
      label: 'Choose Cat…',
      click: () => mainWindow?.webContents.send('open-picker'),
    },
    {
      label: 'Follow Cursor',
      type: 'checkbox',
      checked: followCursor,
      click: toggleFollow,
    },
    {
      label: 'Nudge: Stretch',
      click: () => mainWindow?.webContents.send('nudge', 'stretch'),
    },
    {
      label: 'Nudge: Water',
      click: () => mainWindow?.webContents.send('nudge', 'water'),
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function createTray(): void {
  tray = new Tray(trayIcon());
  tray.setToolTip('Zenith');
  buildTrayMenu();
}

function startCursorPoll(): void {
  cursorTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const bounds = mainWindow.getBounds();

    if (followCursor) {
      // Trail the cursor with smoothing + a small offset so the cat sits just
      // below-right of the pointer tip instead of covering the exact click point.
      const target = {
        x: cursor.x - bounds.width / 2 + 18,
        y: cursor.y - bounds.height / 2 + 12,
      };
      const k = 0.25;
      followSmooth.x += (target.x - followSmooth.x) * k;
      followSmooth.y += (target.y - followSmooth.y) * k;
      mainWindow.setPosition(
        Math.round(cursor.x === 0 && cursor.y === 0 ? target.x : followSmooth.x),
        Math.round(target.y),
        false,
      );
    } else {
      followSmooth = { x: cursor.x, y: cursor.y };
    }

    mainWindow.webContents.send('mouse-move', {
      x: cursor.x - bounds.x,
      y: cursor.y - bounds.y,
    });

    const display = screen.getDisplayNearestPoint(cursor);
    const fullscreen = display.bounds.height > display.workArea.height + 10;
    if (peekEnabled && fullscreen && !peekActive) {
      peekActive = true;
      mainWindow.webContents.send('peek-start');
    } else if ((!peekEnabled || !fullscreen) && peekActive) {
      peekActive = false;
      mainWindow.webContents.send('peek-end');
    }
  }, 16);
}

const KEY_NAMES = new Map<number, string>();
for (const [name, code] of Object.entries(UiohookKey)) {
  if (typeof code === 'number') KEY_NAMES.set(code, name);
}

function keyName(keycode: number): string {
  const n = KEY_NAMES.get(keycode) ?? `key:${keycode}`;
  if (/^[A-Z0-9]$|^Numpad|^Space$|Backspace|Enter|Escape|^F\d{1,2}$/.test(n)) return n;
  return `key:${keycode}`;
}

function startKeyHook(): void {
  uIOhook.on('keydown', (e: UiohookKeyboardEvent) => {
    const key = keyName(e.keycode);
    if (key.startsWith('key:')) return; // only forward "typing-relevant" keys
    mainWindow?.webContents.send('key-event', {
      key,
      type: 'keydown',
      timestamp: Date.now(),
    });
  });
  uIOhook.on('keyup', (e: UiohookKeyboardEvent) => {
    const key = keyName(e.keycode);
    if (key.startsWith('key:')) return;
    mainWindow?.webContents.send('key-event', {
      key,
      type: 'keyup',
      timestamp: Date.now(),
    });
  });
  try {
    uIOhook.start();
  } catch {
    // hook unavailable; typing features degrade gracefully
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

const PICKER_HOTKEY = 'CommandOrControl+Shift+S';
const FOLLOW_HOTKEY = 'CommandOrControl+Shift+F';
const FOLLOW_HOTKEY_ALT = 'CommandOrControl+Alt+F';

  app.whenReady().then(() => {
    const pickerOk = globalShortcut.register(PICKER_HOTKEY, () => {
      mainWindow?.webContents.send('open-picker');
    });
    if (!pickerOk) console.warn('Hotkey already in use:', PICKER_HOTKEY);
    const followOk =
      globalShortcut.register(FOLLOW_HOTKEY, () => mainWindow?.webContents.send('toggle-follow')) ||
      globalShortcut.register(FOLLOW_HOTKEY_ALT, () => mainWindow?.webContents.send('toggle-follow'));
    if (!followOk) console.warn('Follow hotkey already in use');

    createWindow();
    createTray();
    startCursorPoll();
    startKeyHook();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  try {
    uIOhook.stop();
  } catch {
    // ignore
  }
});

ipcMain.handle('settings:get', () => loadSettings());

ipcMain.on('settings:set', (_event, s: unknown) => {
  if (isSettings(s)) {
    saveSettings(s);
    followCursor = s.followCursor;
    buildTrayMenu();
  }
});

ipcMain.on('set-ignore-mouse-events', (_event, ignore: unknown, options?: unknown) => {
  mainWindow?.setIgnoreMouseEvents(
    typeof ignore === 'boolean' && ignore,
    options && typeof options === 'object' ? (options as { forward: boolean }) : undefined,
  );
});

ipcMain.on('move-window-by', (_event, dx: unknown, dy: unknown) => {
  if (!mainWindow || typeof dx !== 'number' || typeof dy !== 'number') return;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const [x, y] = mainWindow.getPosition();
  const clampedDx = Math.max(-4000, Math.min(4000, dx));
  const clampedDy = Math.max(-4000, Math.min(4000, dy));
  mainWindow.setPosition(Math.round(x + clampedDx), Math.round(y + clampedDy), false);
});

ipcMain.on('set-peek', (_event, on: unknown) => {
  peekEnabled = on === true;
});

ipcMain.on('set-follow', (_event, on: unknown) => {
  followCursor = on === true;
  buildTrayMenu();
});

ipcMain.on('set-menu-open', (_event, on: unknown) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const open = on === true;
  const [x, y] = mainWindow.getPosition();
  const W = open ? 190 : 140;
  const H = open ? 250 : 130;
  mainWindow.setBounds({ x, y, width: W, height: H }, false);
  mainWindow.webContents.send('window-size', { width: W, height: H });
});

ipcMain.on('app-quit', () => {
  app.quit();
});

ipcMain.on('open-picker', () => {
  mainWindow?.webContents.send('open-picker');
});
