import { contextBridge, ipcRenderer } from 'electron';
import type { KeyEventData, Settings } from '../src/renderer/types';

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (s: Settings): void => ipcRenderer.send('settings:set', s),
  moveWindowBy: (dx: number, dy: number): void => ipcRenderer.send('move-window-by', dx, dy),
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }): void =>
    ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  setPeek: (on: boolean): void => ipcRenderer.send('set-peek', on),
  setFollow: (on: boolean): void => ipcRenderer.send('set-follow', on),
  setMenuOpen: (on: boolean): void => ipcRenderer.send('set-menu-open', on),
  setUiMode: (mode: 'none' | 'menu' | 'settings' | 'picker'): void =>
    ipcRenderer.send('set-ui-mode', mode),
  quitApp: (): void => ipcRenderer.send('app-quit'),
  onWindowSize: (cb: (size: { width: number; height: number }) => void): (() => void) => {
    const listener = (_e: unknown, size: { width: number; height: number }) => cb(size);
    ipcRenderer.on('window-size', listener);
    return () => ipcRenderer.off('window-size', listener);
  },
  onMouseMove: (cb: (pos: { x: number; y: number }) => void): (() => void) => {
    const listener = (_e: unknown, pos: { x: number; y: number }) => cb(pos);
    ipcRenderer.on('mouse-move', listener);
    return () => ipcRenderer.off('mouse-move', listener);
  },
  onKeyEvent: (cb: (e: KeyEventData) => void): (() => void) => {
    const listener = (_e: unknown, data: KeyEventData) => cb(data);
    ipcRenderer.on('key-event', listener);
    return () => ipcRenderer.off('key-event', listener);
  },
  onOpenSettings: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on('open-settings', listener);
    return () => ipcRenderer.off('open-settings', listener);
  },
  onOpenPicker: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on('open-picker', listener);
    return () => ipcRenderer.off('open-picker', listener);
  },
  onToggleFollow: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on('toggle-follow', listener);
    return () => ipcRenderer.off('toggle-follow', listener);
  },
  onNudge: (cb: (kind: string) => void): (() => void) => {
    const listener = (_e: unknown, kind: string) => cb(kind);
    ipcRenderer.on('nudge', listener);
    return () => ipcRenderer.off('nudge', listener);
  },
  onPeekStart: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on('peek-start', listener);
    return () => ipcRenderer.off('peek-start', listener);
  },
  onPeekEnd: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on('peek-end', listener);
    return () => ipcRenderer.off('peek-end', listener);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
