# FDC Dentist

A cartoon dental clinic game for Meta Quest 3. You are the dentist.

- Patients walk in through the door, say what hurts, sit in the chair and open wide.
- Pick the right instrument from the tray for each step of their treatment.
- A wrong instrument hurts them (tears) or annoys them (steam, red face). After 3 mistakes they walk out, disappointed.
- Each patient gets stars and points. A shift is 3 patients, and your best score is saved on the headset.

Built with Three.js + WebXR, in soft green, pink and white. Everything (room, characters, tools, sounds) is made in code: there are no model or audio files.

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install three.js and Vite (once) |
| `npm run dev` | Play on the Mac at http://localhost:5175 |
| `npm run build` | Build into `dist/` |
| `npm run quest:connect` | Let a Quest plugged in by USB open `http://localhost:5175` |
| `npm run pages:setup` | Install the GitHub Pages workflow (once) |

## Publish

1. Run `npm run pages:setup` once, then commit and push to `main`.
2. In GitHub → **Settings → Pages**, set **Source: GitHub Actions**.

It goes live at https://markzugenjer.github.io/fdc-vr-dentist/

On the headset, open it from the **FDC VR** app: Lobby → **FDC Dentist**. There's no separate APK. **Lobby FDC** in the game goes back.

## How to play

| | VR | Desktop |
| --- | --- | --- |
| Take a tool | Point the laser at the tray, pull the trigger | Click the tool |
| Use it | Bring the tool's tip to the patient's mouth and hold it there | Click and hold on the mouth |
| Put it back | Grip button, or take another tool | `Space`, or click another tool |
| Pause | B / Y | `M` or `Esc` |
| Walk / turn | Left stick / right stick | W A S D, drag to look |

## Treatments

| Treatment | Steps (tool) |
| --- | --- |
| Scaling | check (mirror) → remove tartar (scaler) → suck up water (suction) |
| Extraction | numb (syringe) → pull the loose tooth (forceps) → stop the bleeding (gauze) |
| Filling | find the cavity (mirror) → clean it (drill) → fill it (filling) → harden it (blue light) |

The patient card on the right shows what to do, not which tool to use. The nurse names the right tool after a mistake.

## Scoring

- **Completed patient:** 100 per step, +100 with no mistakes, a speed bonus, and −40 per wrong tool.
- **Stars:**
  - 3 stars: no mistakes and fast.
  - 2 stars: at most 1 mistake.
  - 1 star: everything else.
- **Patient walked out:** 0 stars and 50 points per finished step.

## Files

```
src/core/          shared VR base (renderer, laser pointers, walking, panels) from vr-games-1
src/game/game.js   the game: patient flow, treating, mistakes, scoring, panels
src/game/cases.js  treatments, steps, patient names and looks, all the lines they say
src/game/character.js  cartoon people: body, face, expressions, walk/sit/wave/cheer...
src/game/mouth.js  what the teeth look like for each treatment, and how they change
src/game/tools.js  the 9 instruments and the tray
src/game/room.js   the treatment room, chair, door, lamp
src/game/effects.js  sparkles, tears, steam, hearts
src/game/sfx.js    synthesized sounds (drill, scaler, suction, ouch, door...)
```

## Add a treatment

1. Add an entry to `CASES` in `src/game/cases.js`, with its steps and tools.
2. Add a `setup_<id>` method in `src/game/mouth.js`.
3. Add what each step changes in `progress()` and `done()`.
