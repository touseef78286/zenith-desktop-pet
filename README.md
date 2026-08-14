# Zenith — a pixel cat desktop companion

A cozy desktop pet (in the spirit of Comnyang / Desktop Goose) that sits on top of
your other apps. Electron + TypeScript + Vite. Hand-drawn pixel art, rendered into a
small frameless, always-on-top, transparent window.

## Features
- **3 cat breeds** (Classic, Chonky, Sleek), each with its own shape and colors.
- **Realistic idle animations**: breathing (~3.5 s), blinking (~4 s), tail sway (~4 s),
  ear twitch (~9–13 s), auto-sleep with drifting Zzz after 40 s idle, plus knead /
  hunt / stretch / overheat by typing.
- **🐾 Click or hotkey (Ctrl+Shift+S)** to open the breed picker.
- **⚙ Gear menu (top-left)** listing every action in sequence (Choose Cat, Settings,
  Stretch, Water, Pomodoro, Peek, Follow cursor, About, Quit). Panels grow the window
  so everything is easy to read.
- **🎯 Follow-cursor mode** — trail your pointer, or keep the cat parked in a corner.
  A clickable **"● FOLLOW ON"** badge appears so you can turn it off from the cat itself.
- **Reminders**: stretch, drink water, pomodoro focus timer, fixed message.
- **Petting & dragging**: hover to pet, click-drag to move your cat.
- **Polish**: soft drop shadow + silhouette outline so the cat pops on any wallpaper,
  pattern (tabby/calico/tuxedo) clipped cleanly to the body.

## Quick start
```bash
npm install
npm run dev            # vite + electron
npx tsc --noEmit       # typecheck
npm run build          # typecheck + build + package (electron-builder)
```
Packaged installer output lands in `release/` (e.g. `Zenith Setup 2.0.0.exe`).

## Controls
| Action | How |
| ------ | --- |
| Open picker | Click the cat, or **Ctrl+Shift+S** |
| Open menu | Click **⚙** (top-left) |
| Follow cursor toggle | Tray **"Follow Cursor"**, **Ctrl+Shift+F** (fallback Ctrl+Alt+F), the ⚙ menu, or the **● FOLLOW ON** badge |
| Move cat | Click-drag the cat |
| Pet | Hover over the cat |
| Reminders | Tray menu / ⚙ menu |

> In follow-cursor mode the cat never blocks a click; the **● FOLLOW ON** badge
> (bottom-right) is always clickable, with tray + hotkey as backups.

## Tech notes
- Pixel grid is 30 columns wide, drawn at SCALE 3 into a 140×130 transparent window
  (190×250 while a menu/settings/picker panel is open).
- Settings persist to `userData/settings.json` (atomic write, validated on load/save).
- Key hook (`uiohook-napi`) is filtered to typing-only keys to stay lightweight and safe.

## License
MIT
Zenith is a hand-drawn pixel cat desktop companion for Windows. It sits quietly
on top of your other apps, keeps you company, and nudges you to stay healthy.

• 3 cat breeds — Classic, Chonky, Sleek, each with its own shape & palette
• Realistic idle animations — breathing, blinking, tail sway, ear twitches,
  and it falls asleep with drifting "Zzz" after a while
• Stretch / water / pomodoro reminders so you don't forget breaks
• Follow-cursor mode that trails your pointer but never blocks a click
  (turn it off from the cat itself, the tray, or Ctrl+Shift+F)
• In-window gear menu (⚙) with every feature one click away
• Pet it (hover) and drag it anywhere on your desktop
• Color, pattern, name, timer — all customizable & persisted

Built with Electron, TypeScript and Vite. Frameless, transparent, always-on-top.
