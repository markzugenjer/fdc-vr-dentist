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

## Pengaturan (settings)

Title screen → **Pengaturan**. Everything is saved on the headset.

| Setting | Choices (default first) |
| --- | --- |
| Ruangan | Klinik FDC, Kartun (lama). Switches the room right away |
| Pasien per shift | 5, 7, 10, 2, 3 |
| Mode Event | 3, 5, 1, 2 minutes |
| Kesabaran pasien | Normal, Cepat bosan, Santai |
| Salah alat maksimal | 3, 5, 2 (scared patients get one less) |
| Pasien 2 masalah | Kadang, Sering, Tidak ada |
| Petunjuk alat | 3, 5, 10, Mati, 1 per round |
| Momen lucu, Bantuan Suster Nana | on / off |
| Suara karakter | Suara asli, Bip lucu, Mati |
| Roda hadiah | Semua mode, Mode Event saja, Mulai kerja saja, Mati |
| Perawatan yang muncul | tick the treatments you want (at least one) |
| Tipe pasien | tick Penakut, Cerewet, VIP, Anak-anak (normal patients always come) |

**Kembali ke awal** restores the defaults. To change the defaults for every headset (for an event, say), edit `DEFAULTS` in `src/game/config.js` and push.

## Roda Hadiah (prize wheel)

After a round, the final board offers **Putar Roda Hadiah!** (once per round). The wheel takes the board's place: press **PUTAR!** (or point at the wheel and pull the trigger), it spins for about 5 seconds and stops on a prize with confetti and a fanfare. **Lanjut** goes back to the final board, which keeps showing the prize for the FDC staff.

### Prizes and chances

| Prize | Chance |
| --- | --- |
| Kipas FDC Fest | 70% |
| Gunting Kuku | 10% |
| Tumbler | 10% |
| Kipas Tangan Elektrik | 5% |
| Jersey FDC Fest | 2.5% |
| Racepack FDC Fest | 2.5% |

**On the headset:** Pengaturan → **Hadiah roda ›**.
- Press a prize's name to switch it on or off.
- Use **−** / **+** to change its chance.
- **Kembali ke awal** restores the list above.
- Changes save on that headset.

If the chances of the prizes that are on don't add up to 100%, the header says so and the wheel scales them to 100% automatically. For example, with Gunting Kuku off, the other prizes keep their proportions.

**Stock (stok):** in the same panel, set how many of each prize you brought. **∞** means unlimited. Press − on ∞ to start at 100; hold − or + to change quickly. The wheel counts down every win and skips a prize once it reaches 0, and the panel shows "(habis)". When every prize is out, the wheel doesn't appear.

**For every headset:** edit `PRIZES` in `src/game/config.js` (`text` and `chance` in %) and push. Renaming or adding prizes resets each headset's saved list to the new defaults.

```js
export const PRIZES = [
  { text: 'Kipas FDC Fest', chance: 70 },
  { text: 'Gunting Kuku', chance: 10 },
  ...
];
```

Up to 8 prizes fit the settings panel. Pengaturan → **Roda hadiah** picks which rounds end with the wheel: Semua mode, Mode Event saja, Mulai kerja saja, or Mati. Each headset also counts the prizes it has given out (localStorage key `fdc.dentist.prizes`).

## Papan Skor (leaderboard with names)

Before **Mulai kerja** or **Mode Event**, the player types their name on a big keyboard: point and pull the trigger. **Mulai!** starts the round. **Main tanpa nama** plays as "Dokter Tamu 12". Names are tidied automatically, so "BUDI santoso" becomes "Budi Santoso".

**Where it shows:**
- **Next to the title menu:** today's top 10 with medals for the first three. This is what the booth TV shows through casting between players.
- **After a round:**
  - the final board says "Budi: peringkat #3 dari 25 hari ini"
  - the leaderboard highlights the player's line
  - if the player is outside the top 10, they still get their own line at the bottom
- **The TV on the clinic wall:** the current player's name, plus today's top 10 in two columns.

**For booth staff:** Pengaturan → **Papan skor & nama ›**.
- **Tanya nama pemain:** turn the name step on or off.
- **Hapus ronde terakhir:** remove the most recent round, for example a rude name or a test round.
- **Hapus semua skor hari ini:** press twice to confirm.

Scores are saved on that headset only. Each Quest has its own board, and a new board starts every day.

## Character voices (ElevenLabs)

Patients and Suster Nana speak their lines with recorded voices.
- **Voices:** Suster Nana, kids, women and men. Each patient also gets a slightly different speed and pitch.
- **Any line without a recording** uses the cartoon "bip" voice, so the game always works.
- **Pengaturan → Suara karakter:** Suara asli / Bip lucu / Mati.

**Making the recordings (on the Mac):**
1. **Pick 4 voices** in ElevenLabs (Voices → Voice Library, filter Indonesian) and add them to My Voices. Copy each voice's **Voice ID** into `voices.config.json`:
   - `nana`: a friendly young nurse
   - `kid`: a child
   - `woman`
   - `man`

   `woman` and `man` can each list several IDs, like `["id1", "id2"]`. Each patient then gets one of them, so not every patient sounds the same. The kid voice is a girl's, so all kid patients are girls.
2. **API key:** ElevenLabs → Developers → API Keys. Create one with Text to Speech access. Put it in a file called `.env.local` in this folder:
   ```
   ELEVENLABS_API_KEY=sk_...
   ```
   `.env.local` is in `.gitignore`. Never commit it, and never paste the key in a chat.
3. **Check the lines:** `npm run voices:list` shows every line and the character count (about 11,000 characters) and writes them all to `voices-lines.csv`.
4. **Make the recordings:** `npm run voices` saves the audio files to `public/voices/` and takes a few minutes.
5. **Commit and push** `public/voices/`, then check on the Quest.

**Changing lines later:** run `npm run voices` again. Only new or changed lines are made (and cost credits). To redo a line, delete its file from `public/voices/<voice>/`; `voices-lines.csv` shows which file is which line.

**License:** recordings made on a free ElevenLabs account can't be used commercially. For FDC events, use a paid plan; Starter covers 11,000 characters.

## Booth extras

**Demo mode:**
- When nobody presses anything on the start screen for 45 seconds, the clinic plays itself:
  - patients come in
  - a blue-gloved hand treats them with the right tools
  - a pink "AYO MAIN!" banner floats above
- The booth TV (casting) shows movement instead of a still menu, and nothing is scored or saved.
- Any trigger press goes back to the start screen.
- The Quest pauses when nobody is wearing it, so for the demo to keep running on a headset lying on the table, turn off the proximity sensor:
  - in Meta Quest Developer Hub, or
  - with `adb shell am broadcast -a com.oculus.vrpowermanager.prox_close`. This lasts until the Quest restarts; undo it with `adb shell am broadcast -a com.oculus.vrpowermanager.automation_disable`.

**Foto kenangan:**
- During a round, the game takes a photo of the best happy patient cheering with their new smile, with Suster Nana clapping.
- On the final screen, **Foto kenangan** shows it as an FDC photo card with:
  - the player's name, score, place and prize
  - a QR code to FDC
- Visitors take a photo of the TV with their phone to share it.
- The event name and the QR link are `BOOTH` in `src/game/config.js`.

**Last 10 seconds of Mode Event:**
- a big red countdown floats above the patient
- the wall TV switches to one giant number for the crowd
- every second beeps, with higher beeps for 3-2-1
- the music speeds up

## Klinik FDC room

The default room is modelled on photos of a real FDC Dental Clinic treatment room:
- sage-green walls, glossy white tiles, a warm LED cove
- the misty jungle mural with the round FDC DENTAL CLINIC logo behind the chair
- the oak counter with drawers, sterilizer, double sink and towels, and the oak shelf with the two FDC art prints
- the curing light, the yellow biohazard box, black leather chairs, the oak desk with a monitor and tooth models, the tan office chair
- the AC unit, the white glass-panelled door, an olive-green dental chair

The original cartoon room is still there. Use **Pengaturan → Ruangan: Kartun (lama)**, or set `roomStyle: 'kartun'` in `DEFAULTS` in `src/game/config.js` to make it the default for every headset.

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
src/game/room.js   the cartoon treatment room (Ruangan: Kartun), chair, door, lamp
src/game/room-fdc.js  the Klinik FDC room, modelled on a real FDC treatment room (Ruangan: Klinik FDC)
src/game/effects.js  sparkles, tears, steam, hearts
src/game/sfx.js    synthesized sounds (drill, scaler, suction, ouch, door...)
src/game/music.js  cheerful background music, synthesized live (F major, 116 BPM)
src/game/boards.js X-ray screen, score TV, rank sign, FDC sign, unlockable decorations
src/game/progress.js  stars, ranks, unlocks and the score board (saved on the headset)
src/game/decor.js  Dekorasi: wall colours, posters, plants, uniform and chair colours
src/game/config.js settings and their defaults (patients per shift, treatments, patient types...) and the wheel prizes
src/game/wheel.js  Roda Hadiah, the prize wheel after a round
src/game/voice.js  plays the recorded character voices (public/voices)
src/game/voicekey.js  matches a line to its recording
src/game/photo.js  Foto kenangan: the snapshot camera and the FDC photo card (with QR)
src/game/leaderboard.js  Papan Skor: draws today's top 10 (title board, wall TV, staff panel)
```

## Add a treatment

1. Add an entry to `CASES` in `src/game/cases.js`, with its steps and tools.
2. Add a `setup_<id>` method in `src/game/mouth.js`.
3. Add what each step changes in `progress()` and `done()`.
