---
title: "Bare Metal Deathmatch XIII: A Bot That Plays Shifts, Seventy Dispensaries, and Sound"
description: "The balance pass, tuned against a bot that plays whole shifts; seventy dispensaries in place of a paid heal; and retro sound effects generated in code and mixed in assembly, from gunshots to a golf ball that goes weeEEEOOOooo."
pubDate: 2026-10-25
tags: ["assembly", "low-level", "gamedev", "audio"]
draft: false
---

import YouTubeEmbed from "../../components/YouTubeEmbed.astro";

<YouTubeEmbed id="YpgYUlTsy_g" title="Spookin' The Horses - Fred Eaglesmith" />

```text
--[ PREVIOUSLY ]----------------------------------------------------------
```

[Part 12](/blog/bare-metal-deathmatch-12) built the Indian Casino, added auto-aim, rebuilt the landmarks from their real outlines, and cleaned up the roads until the town's traffic stopped at the lights.

This post covers four steps, 10.42 to 10.45:

- **10.42:** the balance pass, part 1: a bot that plays whole shifts, and an 8-minute shift
- **10.43:** part 2: prices and pay
- **10.44:** seventy dispensaries
- **10.45:** sound, in four parts and a code review

Repo: private — this project is on its way to becoming a game on Steam.
(`stage10/42_balance` to `stage10/45_sound`)

```text
--[ 10.42: A BOT THAT PLAYS SHIFTS ]--------------------------------------
```

What felt off to me: *"I die too much,"* too few deliveries, and the money. I wanted it measured before anything changed, so Claude wrote a bot that plays whole shifts on the real build, in gdb's Python:

- It plans **A\* routes** on an 8 px grid built from the game's blockmap, and holds W A S D toward a point five cells along.
- It takes the job with the best pay for the distance, as many as the ride carries.
- It holds the fire button (auto-aim does the rest) when anything hostile is within 220 px.
- It logs **every hit on you by its source**, through a breakpoint on `armor_damage`, the one function every hit passes through.

With the frame delay patched out, a shift takes under three minutes. The first numbers, 8 minutes a shift:

| | the van | a new player on the bike |
|---|---|---|
| deliveries a shift | 13.1 | 13.9 |
| deaths a shift | 0.9 | **5.4** |
| deaths by | gangs 6, a dog 1 | **gangs 40**, your own rams 3 |

A new player died more than five times a shift, 94% of it to the gangs. My picks: the gangs aim worse at you (two thirds of their chance) and notice you later, the Bikers shoot you from 150 px at most, rams don't hurt you, every ride's health doubles, and the shift goes from 3 minutes to 8. After: **2.0 deaths a shift**, about the target.

My play test turned up a different bug. With a controller, I couldn't tell how to take a job. The D-pad took them, but the board only showed the keyboard's `1) 2) 3)`. Now, with a pad plugged in, it shows arrows, three new glyphs in the font past 'Z'.

```text
--[ 10.43: PRICES AND PAY ]-----------------------------------------------
```

My answer to "how long should it take to buy everything?": about 25 eight-minute shifts, not 40. And move the pay, not the prices.

- **Delivery pay ×1.6:** about $102 a job, up from $64. The bot went from $1,977 a shift to $3,383 (it routes perfectly; I don't).
- **The heavy frame** adds 25% of the ride's health a level, instead of a flat +30 that meant nothing next to the doubled rides.
- **Armor and toughness** got cheaper, since you need less of them now.

Then I wanted to feel the start of the game, so I played from a brand-new save. Two shifts in I'd bought armor, toughness and a second ride, and it felt too safe. *"Maybe we need to roll back some changes on the gangsters and make them a little more deadly."* They went half back: 85% aim at you, and they notice you from 250 px. A new save after that: 6 deliveries, 1 death, $1,483. *"That felt right."*

```text
--[ 10.44: SEVENTY DISPENSARIES ]-----------------------------------------
```

The plan had a paid heal at St. Copay's, the town's other hospital. I dropped it for something simpler: more dispensaries, St. Copay's one of them. There had been five, picked at random each game, from when the map was one side of town.

I wanted them where the real ones are, but there's no good list. OpenStreetMap has two in town, and the state's license lookup checks one license number at a time. So I went with a realistic spread of about 70.

The map generator places them once: St. Copay's door first, then each next one at the business door **farthest from all those already picked**, kept clear of the garages. That spreads them evenly without any randomness, and the map is otherwise identical to the last one, byte for byte.

![The town with its seventy dispensaries, St. Copay's in white](/images/bare-metal-deathmatch/dispensaries_map.png)

```text
--[ 10.45: SOUND ]--------------------------------------------------------
```

The game had no sound at all. I asked Claude to explain how we'd make some, and picked: **retro and chunky, generated in code**. And one rule: *"we don't want the soundscape to be too cluttered overall because we still need to add the radio that will be real recordings I have made."*

It was built in four parts, each play-tested.

```text
--[ MAKING A SOUND OUT OF NOTHING ]---------------------------------------
```

A Python tool, like the ones that draw the game's art, builds every sound from a few pieces:

- **Square waves**, often sweeping in pitch: a pistol's thump falls from 220 Hz to 80.
- **Noise held for a few samples.** Pick a random value and hold it for 1 sample and it hisses; hold it for 10 and it rumbles. A grenade is noise whose hold grows as it fades.
- **Fast envelopes**: everything decays quickly.
- **The crush:** every sound is rounded to 15 levels, about 4 bits, and stored as signed bytes at 22,050 samples a second. That's where the chunk comes from.

The noise is seeded, so the same sounds come out every build. Part 1's fifteen sounds came to 4 seconds of samples in all.

![Eight of the sounds: guns, a grenade, a heal, the pay, the dog, a horn, the moped's loop](/images/bare-metal-deathmatch/sound_waves.png)

Your pistol, shotgun, SMG and rifle:

<audio controls preload="none" src="/audio/bare-metal-deathmatch/pistol.wav"></audio>
<audio controls preload="none" src="/audio/bare-metal-deathmatch/shotgun.wav"></audio>
<audio controls preload="none" src="/audio/bare-metal-deathmatch/smg.wav"></audio>
<audio controls preload="none" src="/audio/bare-metal-deathmatch/rifle.wav"></audio>

A grenade, a bottle of weed, and getting paid:

<audio controls preload="none" src="/audio/bare-metal-deathmatch/boom.wav"></audio>
<audio controls preload="none" src="/audio/bare-metal-deathmatch/heal.wav"></audio>
<audio controls preload="none" src="/audio/bare-metal-deathmatch/cash.wav"></audio>

```text
--[ THE MIXER, IN ASSEMBLY ]----------------------------------------------
```

SDL can play audio two ways: a callback on its own thread, or a queue you fill. A thread in hand-written assembly is asking for trouble, so the game uses the queue. Once a frame, `sound_frame` tops SDL's queue up to 70 ms ahead, 256 samples at a time, all on the main loop like everything else.

- **8 voices.** A new sound takes a free one, or the quietest if it's louder. Otherwise it isn't heard.
- **A place in the city.** A sound is full volume within 120 px of the camera's middle and fades to nothing at 520, and it pans left or right. The gangs' guns are quieter than yours.
- **A gap per sound.** A war fires every tick; each sound waits a few frames before it plays again, so a firefight is a rattle and not a wall.
- **Headroom.** Effects mix at about 60%, leaving room for the radio.
- **It only reads the game.** It never touches the war's random numbers, and without a window it never runs, so the old watch mode stays byte-identical. That's checked after every change.

The hooks are a few lines each, dropped into the middle of existing code: a sound in `spawn_effect` for every shot, in `armor_damage` for every hit on you, in the kill code for deaths. So `sound_play` has to save every register it touches. It has to keep the CPU flags too, which the code review later found it didn't.

My play test: *"seems a little loud,"* so the whole mix came down 30%.

```text
--[ PART 2: THE STREETS ]-------------------------------------------------
```

Engines and sirens don't fit one-shot voices; they go on as long as you ride. So the mixer got **two loops**: a short wave played round and round at a pitch, as a 16.16 fixed-point step through the samples. A step of 1.0 plays it as written, 1.8 plays it 80% higher. Each loop's volume slides toward its target a little per chunk, so nothing clicks on or off.

Instead of more hooks, a new function, `snd_watch`, reads the game's state once a frame:

- **Your ride's engine**, its own for each ride: the moped's two-stroke, the motorcycle's V-twin, the van's slow thump, the golf cart's electric whine. The bike has none, since you're pedalling. Its pitch and volume follow your speed.
- **The police car's siren,** placed and panned like any sound, while it's out.
- **The dog barks** when it slips its leash, and when it bites.
- **Horns** when you stand in a car's way.
- **Crashes:** a crunch head-on into a wall, a scrape along one, a thud ramming someone, and a long crash when your ride is wrecked.

My play test: *"engine is too loud and grating."* The first engines were square-wave pops with a lot of noise. Now each pop is mostly a soft triangle wave, the loop is smoothed before the crush, the volume is less than half, and the pitch tops out lower. *"Much better."*

The moped revving up and back down:

<audio controls preload="none" src="/audio/bare-metal-deathmatch/engine_rev.wav"></audio>

The dog, a horn, and a crash:

<audio controls preload="none" src="/audio/bare-metal-deathmatch/bark.wav"></audio>
<audio controls preload="none" src="/audio/bare-metal-deathmatch/honk.wav"></audio>
<audio controls preload="none" src="/audio/bare-metal-deathmatch/crash.wav"></audio>

The city's sounds now play only while a shift is running. In Part 1 you could hear the war going on behind the shop screen.

```text
--[ PART 3: THE MINIGAMES ]-----------------------------------------------
```

Every minigame moves your money, so one rule covers them all: money going down is a chip clack, and money coming back is a jingle, or a fanfare from $1,000. On top of that: cards flicking, the slot reels' ratchet and clunk, the roulette ball rattling round and dropping into its pocket, the race's countdown beeps and engine, fishing's cast, plop, zing and snapped line.

Two play-test notes:

- Golf *"glitches and sounds like a bunch of repeating ball hits after you hit the ball."* The knock for hitting a tree was at the top of `gf_tree_hit`. That function is the check, run every tick of the ball's flight, so it knocked all the way down the fairway. Now it knocks only on an actual hit.
- In the same breath: *"It needs to have a sound like 'weeEEEEOOOOOOOooooo' similar to the ball sound in the old golf game for Nintendo."*

So the ball whistles. At the swing, the game works out how high that shot will go (the launch speed squared over twice gravity), and the whistle's pitch is how high the ball is right now, out of that top. It climbs as the ball rises and falls as it comes down, and fades to a third on the way down. A wedge and a driver both peak at the top of their own arc. The first version was a square wave up to twice the pitch, *"a little too aggressive and high pitched"*. Now it's a triangle, a bit lower. *"A lot better."*

<audio controls preload="none" src="/audio/bare-metal-deathmatch/golf_whistle.wav"></audio>

The race had *"no sounds"*. Under gdb, every race sound was firing. The engine was at 80 Hz, too low for small speakers, and at a volume of 8 out of 256 at idle. It moved up an octave and got louder.

Cards, chips, and a big win:

<audio controls preload="none" src="/audio/bare-metal-deathmatch/card.wav"></audio>
<audio controls preload="none" src="/audio/bare-metal-deathmatch/chip.wav"></audio>
<audio controls preload="none" src="/audio/bare-metal-deathmatch/fanfare.wav"></audio>

```text
--[ PART 4: A VOLUME, AND A CODE REVIEW ]---------------------------------
```

The pause menu's OPTIONS page had said *"VOLUME: COMES WITH THE MUSIC"* since 10.17. It has a real one now, OFF to 10, saved in a spare byte of the save file. Old saves load 7, which is exactly the level the game had been playing at.

Then a code review of the four sound commits. It found ten problems, and two of them explained things I'd heard:

- **The race engine never revved.** The car's speed is stored as an integer, speed times 256, and the sound code read it with `movss`, as a float. Flat out, about 690 read as a float is roughly 10⁻⁴², so the engine sat at idle pitch for the whole race. It had "sounded good" only because it was loud. The fix is one instruction, `cvtsi2ss`, which converts instead of reinterpreting.
- **The race's crash sound watched the controller's rumble timer,** which only counts down when a pad is plugged in. On the keyboard, one touch of the fence would have crashed forever. Now the crash plays at the bounce itself.
- **The flags.** `sound_play` checked whether sound was on before it saved the CPU's flags, so it handed back the flags from that compare. One roulette branch right after a sound depended on them.
- **A refund sounded like a win.** A blackjack push or cashing out of hold'em at a loss played the jingle. Now each round keeps its stake (the spin, the hand, the betting round, the race), and only money back past it is a win.
- Plus the caddie's shots using your gun's sound, stale state when you left a minigame mid-shot, and a store menu that ticked twice.

All fixed, and watch mode still byte-identical. My play test: *"sounds good."*

```text
--[ WHAT I LEARNED THIS TIME ]--------------------------------------------
```

- **Measure before tuning.** A bot that plays whole shifts and logs every hit by its source turned "I die too much" into "94% of it is the gangs".
- **Play from a new save.** The start of the game is where balance hides, and my long save was hiding it.
- **Sound is data, like art.** A seeded generator makes every sound reproducible and tweakable from one file.
- **Read the state, don't sprinkle hooks.** One function that looks at the game once a frame covered engines, sirens, dogs, horns and every minigame.
- **In assembly, a type is just a promise.** Nothing stopped an integer being read as a float; only a review caught it.
- **Leave room.** The mix stays sparse on purpose. The radio comes next.

```text
--[ WHAT'S NEXT ]---------------------------------------------------------
```

- **The radio,** my own recordings, over the top of all this.
- **The library's lore.**
- **More of the town.**
