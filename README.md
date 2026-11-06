# FDC Dentist

A dental clinic game for Meta Quest 3. You are the dentist at FDC Dental Clinic.

- Patients walk in through the door and wait on the bench, each with a patience bar.
- Call them to the chair, then pick the right instrument from the tray for each step of their treatment.
- A wrong instrument hurts them (tears) or annoys them (steam, red face). Too many mistakes, or too long a wait, and they walk out.
- Perfect patients in a row build a combo (×1.5, ×2, ×3). Stars add up over time to ranks and unlocks.

Built with Three.js + WebXR, in soft green, pink and white. Everything (room, characters, tools, sounds, music) is made in code: there are no model or audio files.

## Modes

| Mode | What it is |
| --- | --- |
| **Tutorial** | Suster Nana walks you through one scaling patient. The right tool glows on the tray, and mistakes don't count. |
| **Mulai kerja** (shift) | 5 patients. A result card after each one, with a dental fun fact. |
| **Mode Event** | 3 minutes, as many patients as you can. Made for events: the score and timer are on the room TV. |

## Patients

| Type | What's different |
| --- | --- |
| Normal | 3 hearts (wrong tools allowed). |
| Penakut (scared) | Shakes in the chair. Point the laser at them and pull the trigger 3 times to calm them first (+50). Only 2 hearts. |
| Cerewet (chatty) | Keeps talking while you work. More patient. |
| VIP | Sunglasses, double points, but very impatient. |
| Anak (kid) | Smaller, cries at every mistake, gets a star sticker at the end. Usually a kids' check-up. |

Funny moments can happen during treatment: a sneeze that knocks your tool back to the tray, a phone call that pauses the work, a patient falling asleep (+30 if you finish without waking them), or hiccups.

Some adults come with **two problems** (for example scaling + a filling). The card shows both treatments; you choose the order, and one mirror check covers both. +100 bonus.

If you hesitate too long on a step (about 9 seconds without the right tool), Suster Nana hands it to you, for −20 points.

## Life in the clinic

- Every character talks in a little gibberish voice (kids high, adults lower, louder when they're hurt or angry).
- Patients on the bench scroll their phone, yawn and stretch, swing their legs or chat with each other. Suster Nana tidies up between patients.
- After treatment, the patient checks their new smile in a hand mirror.
- The clock on the wall runs with the shift (from 08:00). Long shifts turn golden in the afternoon and dark in the evening, outside the window too.
- A fish tank with swimming fish under the TV.

## Dekorasi

Spend stars on the clinic: wall colour, poster, plants, Suster Nana's uniform and the chair colour. Open it from the title screen (**Dekorasi**) or by pointing at the pink mirror on the left wall. Each button shows the next option and its price; pressing it buys (if needed) and uses it. Spending stars doesn't lower your rank.

## Ranks and unlocks

Every star you earn is kept on the headset. The sign above the door shows your rank: Dokter Magang → Dokter Muda (8★) → Dokter Hebat (20★) → Dokter Spesialis (40★) → Dokter Gigi Legenda (70★).

| Stars | Unlock |
| --- | --- |
| 5 | Party balloons in the room |
| 12 | Gold drill |
| 25 | Trophy on the shelf |
| 40 | Confetti rain for every perfect patient |

The TV on the right wall shows today's top 5 scores.

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

## Its own Quest app (.apk)

FDC Dentist can also be installed as its own app, next to FDC VR and FDC Solo VR. Like the others, the APK only opens the published site, so after the first install a `git push` is enough to update it.

It shares the signing key of `../vr-games-1`. Pages must be live first.

```bash
npm run apk:setup     # adds id.co.fdc.vrdentist to ../vr-games-1/public/.well-known/assetlinks.json
cd ../vr-games-1 && git add -A && git commit -m "Add FDC Dentist to assetlinks" && git push && cd -
npm run apk:build     # → fdc-dentist.apk (wait for the vr-games-1 deploy to finish first)
adb install -r fdc-dentist.apk
```

In the stand-alone app there are no **Lobby FDC** buttons. They only appear when the game is opened from the FDC VR lobby.

## How to play

| | VR | Desktop |
| --- | --- | --- |
| Take a tool | Point the laser at the tray, pull the trigger | Click the tool |
| Use it | Bring the tool's tip to the patient's mouth and hold it there | Click and hold on the mouth |
| Put it back | Grip button, or take another tool | `Space`, or click another tool |
| Pause | B / Y | `M` or `Esc` |
| Music on / off | Pause menu → **Musik** | Pause menu → **Musik** |
| Walk / turn | Left stick / right stick | W A S D, drag to look |

## Treatments

| Treatment | Steps (tool) |
| --- | --- |
| Scaling | check (mirror) → remove tartar (scaler) → suck up water (suction) |
| Extraction | numb (syringe) → pull the loose tooth (forceps) → stop the bleeding (gauze) |
| Filling | find the cavity (mirror) → clean it (drill) → fill it (filling) → harden it (blue light) |
| Whitening | check the colour (mirror) → gel on each tooth (gel brush) → light it (blue light) → rinse (suction) |
| Braces | check (mirror) → a bracket on each tooth (bracket) → harden the glue (blue light) → the wire (braces wire) |
| Root canal | check the X-ray (press the screen on the left) → numb (syringe) → open the tooth (drill) → clean the canal **in rhythm** (root file: only file while the sign says GOSOK) → close it (filling) |
| Kids' check-up | count the teeth (mirror) → strawberry fluoride (gel brush) → suck it up (suction) |

The patient card on the right shows what to do, not which tool to use (except in the tutorial). The nurse names the right tool after a mistake. In VR, tooth-by-tooth steps show a pink ring: touch that tooth with the tool's tip.

## Scoring

- **Completed patient:** 100 per step, +100 with no mistakes, a speed bonus, calm/sleep bonuses, −40 per wrong tool, then × combo × patient type (VIP ×2, scared and kids ×1.2).
- **Stars:** 3 for no mistakes and fast, 2 for at most 1 mistake, 1 otherwise. 0 if they walk out.

## Files

```
src/core/          shared VR base (renderer, laser pointers, walking, panels) from vr-games-1
src/game/game.js   the game: patient flow, treating, mistakes, scoring, panels
src/game/cases.js  treatments, steps, patient names and looks, all the lines they say
src/game/character.js  cartoon people: body, face, expressions, walk/sit/wave/cheer...
src/game/mouth.js  what the teeth look like for each treatment, and how they change
src/game/tools.js  the 13 instruments and the tray
src/game/room.js   the treatment room, chair, door, lamp
src/game/effects.js  sparkles, tears, steam, hearts
src/game/sfx.js    synthesized sounds (drill, scaler, suction, ouch, door...)
src/game/music.js  cheerful background music, synthesized live (F major, 116 BPM)
src/game/boards.js X-ray screen, score TV, rank sign, FDC sign, unlockable decorations
src/game/progress.js  stars, ranks, unlocks and the score board (saved on the headset)
src/game/decor.js  Dekorasi: wall colours, posters, plants, uniform and chair colours
```

## Add a treatment

1. Add an entry to `CASES` in `src/game/cases.js`, with its steps and tools.
2. Add a `setup_<id>` method in `src/game/mouth.js`.
3. Add what each step changes in `progress()` and `done()`.
