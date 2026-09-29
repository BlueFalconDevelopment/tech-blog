# Learning x86-64 Assembly, Part 7: From Battle Sim to Game

2026-09-26 · @Someone

<YouTubeEmbed id="TODO" title="TODO - pick the song" />

## Overview

[Part 6](/blog/bare-metal-deathmatch-6) ended with a pretty sim: two gangs, a hundred soldiers, pixel art, day and night, and a camera. You could watch it, but you couldn't play it. This post covers two stages and a lot of steps:

- **Stage 9 (scale):** a map sixteen screens big, then a real city's streets from OpenStreetMap, then the same games five times faster
- **Stage 10 (the game):** you, a courier on a bicycle, making deliveries through the gang war for money, and a shop to spend it in. It ends with a vehicle ladder, a gun shop and grenades.

The game has a name now: **MY CITY IS A WARZONE BUT I NEED MONEY!!!1:4thwall break: Help I need to fix my van.** The typos are on purpose, a nod to *I MAED A GAM3 W1TH ZOMB1ES 1N IT!!!1*. The van part is a joke about real life, not the game.

Everything is still hand-written NASM. The game binary imports 16 SDL2 functions and five from libc (the startup routine, `getenv`, `atoi`, `strtoull`, `strcmp`), and the save file is written with raw Linux syscalls.

Repo: https://github.com/BlueFalconDevelopment/assembly-simulation (`stage9/`, `stage10/`)

## Stage 9.01 — A world bigger than the window

Stage 8's camera could zoom in, but the whole world was the size of the screen. The first step was a map sixteen screens big, 5120 × 2880: a stand-in, stage 8's neighborhood tiled 4 × 4, so any bug would be a scale bug, not a map bug.

Two things had to change. The background used to be one screen-sized buffer copied to the window each frame. Now it's the whole map in memory (59 MB), and each frame copies **only the camera's view** into the back buffer, then draws the soldiers, effects and lights on top of that. And the map data moved out of the program into its own files: an `.inc` for the walls and props, and a `.bin` of pre-drawn rectangles that the program pulls in with NASM's `incbin`.

A game on a map sixteen times bigger took 7–9 seconds headless instead of 0.85. That came back to bite.

## Stage 9.02 — A real city's south side

I wanted the city to be real, so the map is modeled on the south side of a real city, from one OpenStreetMap snapshot: the streets, the commercial buildings, parks and parking lots. (I'm keeping the city's name out of it for now.)

**Compression.** The real area is about 3.2 × 1.6 km. At the game's own scale that would be a map 30,000 px wide, so it's squeezed to 5120 × 2608, about 1.56 px a metre. Distances shrink and things don't: every street is where it really is, but at the game's widths, and a block holds four to six houses instead of a dozen.

**What's real and what's made up.** The streets, the diagonal road, the expressway, the commercial strip, the parks and the parking lots are real. The 595 houses are generated along the real streets, two rows back to back in each block, facing their street, with gable roofs, parked cars, trees and streetlights. Where the data was empty but the place isn't, I made things up: a big park in the south-west, an airport with a runway and hangars in the middle south, and wrecker lots full of junk cars in the south-east.

The generator is Python with PIL. It draws the ground as an image, turns it into 188,000 rectangles, places everything against an occupancy mask so nothing overlaps, and **checks** the result before writing it: every walkable cell connected, each lobby able to pack 50 soldiers, every pickup reachable.

**What the batches found.** The map passed every check, and the first batch of 144 games still had a stalemate. Replaying its seed showed two Crips standing in a 19 px gap between two houses, where nobody could reach them. A soldier (16 px) fits in a gap that narrow, but the pathfinding grid can't see into it: a 9 px cell only counts as walkable if a 24 × 24 window round it is clear. The next batches found a worse version. A 40 px passage holds exactly one lane of cells, and soldiers going opposite ways jammed in it for thousands of ticks. That only showed up as the west home winning **86%** of games.

The fix went in the generator, not the game. It finds every gap between two solid things that's 16–47 px wide and plugs it with a hedge (or drops the parked car that made it). They read as what they'd be anyway: hedges between yards.

Then it was 78%, and a gdb script sampling the game every 400 ticks found the next cause: 30 knife carriers crowded round the last gun on their side, which lay *behind* their home. So the guns went into 40 mirrored pairs, all between the homes. That left a steady 62%, with nothing jammed. It looked like the lie of the land, and it became Stage 10's first real problem.

## Stage 9.03 — Five times faster, the same games

Eight seconds a game made a 48-game batch take two minutes. `perf` was blocked on this machine and gdb couldn't attach to a running process, but gdb *can* stop a game it started itself. So the profiler is a gdb Python script that runs the game while a shell loop sends it SIGINT every 20 ms, and it counts where each stop lands. Two traps: `handle SIGINT stop noprint` quietly means *don't* stop, and a Python thread can't do the ticking, because gdb's Python holds its lock while the game runs.

The profile said 92% of the time went on the flow-field searches: three breadth-first searches a tick, each over the whole map, 120,000 cells.

1. **No divide.** For every cell it expanded, the search divided the index by the grid width to find the column (to keep neighbours inside the grid). Walkability never changes during a game, so each cell's walkable neighbours are worked out once, as four bits in a byte. That only saved 17%: at 4 ns a cell, it was waiting on memory, not arithmetic.
2. **Search only as far as needed.** The only reader of a field is a soldier asking "which way from here?". So a search now starts from its sources and stops the moment the asking soldier's cell has its distance, keeping its queue so the next soldier's question carries on from there. Most ticks, most of the map is never touched.

8.3 s became 1.6 s a game, and it's **the same games, byte for byte**: for 12 fixed seeds, the whole end state (every soldier, every pickup, the RNG, the tick count) is identical to the slow version's.

## Stage 10 — Turning it into a game

Before any code, a plan, with questions for me along the way. **You're a courier.** You take delivery jobs through the gang war for money, and spend it on guns, armor, vehicles and abilities. Everyone but civilians is hostile, and the war never ends during a shift. You start on a bicycle. New factions come later: Biker packs, cartel hit teams, and the good ole boys in a pickup truck.

And some ground rules, because the program was about to double in size:

- **One change = one step**, and each step is its own folder, so every step still builds.
- **The sim stays alive as a test harness.** `MODE=watch` is the old last-gang-standing sim, and every step has to leave it **byte-identical** (same seeds, same end state) unless the step means to change the sim.
- **Your code never touches the sim's random numbers.** You get your own RNG, so a replay or a fairness batch means what it meant.
- **I play every step,** and anything that feels wrong gets reworked in that step before it's committed.

## 10.01–10.04 — Foundations

**10.01, modules.** The source was one 12,000-line file. It's now a `main.asm` that `%include`s modules (AI, pathfinding, the HUD, events, drawing...). The split was checked by comparing the assembled machine code, not just the games: identical.

**10.02, factions.** "Team 0 and team 1" was baked in everywhere: two scores, two homes, two flow fields, a win check for two. Now a soldier has a faction, and a **hostility table** says who attacks whom, read with one macro. With just the two gangs, the game is byte-identical. The police and the player became rows of that table later, without new special cases.

**10.03, fair homes.** The 62% from 9.02 got a proper fix. The generator now proposes six possible home sites. A batch script plays 480 games on each pair of sites, and only the pairs that come out near 50/50 go in the map. Each game picks one of those pairs, and the unused sites become walled-up buildings.

**10.04, the endless war.** In `MODE=game`, lives are unlimited, nobody wins, the losing gang's Big Homie can come back again, and guns that lie unclaimed too long move somewhere else.

## 10.05–10.06 — You, on foot, then on a bike

**10.05, on foot.** You're a soldier slot of your own, in your own faction. So the rest of the game handles you for free: gangs target you, their shots hit you, you collide. W A S D walks, the camera follows, and you click to shoot.

The first play test was blunt: *"Aiming feels hard... You feel INCREDIBLY underpowered."* So the step was reworked:

- **Right-click locks on,** and yellow brackets show the lock.
- **You're much tougher than a gangster:** 150 health, you heal when left alone, and you hit harder and more often.
- **Walking over a gun on the ground takes its ammo.**
- **Gangsters only chase you up close,** so the whole city doesn't converge on you.

The bug of the step: `imul r8d, edx, edx` assembled fine and crashed with SIGILL. NASM's three-operand `imul` wants an *immediate* third operand; with a register it emits bytes the CPU rejects.

**10.06, the bicycle.** One physics routine for every vehicle, driven by a row in a vehicle table: top speed, acceleration, braking, turn rate, mass, health. Position is kept in 1/16 px and heading is 0..255, with a sine table. The first version used tank steering (A and D turn, W pedals), and the play test said: *"The bike feels INSANELY hard to control."* So now W A S D point where you want to go, and the bike turns toward it. Riding into a soldier bumps him aside instead of stopping you, and at speed it's a ram.

## 10.07–10.09 — The job

**10.07, deliveries.** A board of three jobs. Each is a package to pick up at a real business on the main road and drop at a generated house, on the clock. Pay depends on distance, plus a danger bonus for how many gangsters sit near the route.

A string I'd been building for the end-of-game line had been overflowing a 160-byte buffer for four steps, silently. `nm -n` showed what lived after it.

**10.08, shifts and saving.** A title screen, 3-minute shifts, a summary at the end, and dying costs a fifth of your cash. The save file is 64 bytes, written with raw `open`/`write`/`rename` syscalls: to a temporary file first, then renamed over the real one, so a crash can't leave half a save. A checksum catches a damaged save, and the title screen says so.

**10.09, the police leave you alone.** *"The police shouldn't shoot you and they should avoid running you over."* The police became a row in the hostility table, and their car now waits if you're in the lane ahead. Then I ran Claude Code's `/code-review` on the step, and it found eight real problems my tests had missed, because they only tested the case I'd intended. The worst was that the car waited *forever*: standing in front of it made a safe zone, with police turrets. Now it gives up after two seconds and turns round. I've run a code review on the bigger steps since.

## 10.10 — A shop, and a name

Between shifts there's a shop: W/S to choose, E to buy. Everything is an upgrade you keep: body armor, toughness, bigger mags, the shotgun, a pistol upgrade, a sturdier frame. The shop list is data, one macro call per item, and the levels live in the save file's spare bytes, so older saves still load.

This is where the game got its name. The 5×7 font only has capital letters, so the title screen shouts it; the window title has it as written.

## 10.11–10.14 — Making the city dangerous

A play test said the city was *"relatively easy to avoid"*, and a sampler showed why. Every gangster heads for the nearest enemy, so **all hundred fought in one strip** between the two homes. Only 20–50% of houses had a gangster within 450 px, and the west third of the map never had one.

**10.11, turf crews.** Each gang posts five crews of three at random houses around the city. They stand guard, fight anyone who comes within 400 px, and walk back to their post. Houses within reach of a gangster went from 21–47% to 76–87%. Two things went wrong on the way:

- **One crew member couldn't get home.** Walking straight back and side-stepping works round a house, but not round the fenced expressway: he paced along it for the rest of the game. Each crew now gets a flow field of its own toward its post. A post never moves, so that field is searched once, whole, at the start.
- **The crews slowed everything by 55%.** A gang's field is one search from all its enemies at once, and 30 sources scattered round the map made every search spread from each of them. The crews aren't field sources any more.

The same play test asked for stronger guns and a pistol upgrade. The pistol now kills a gangster in two hits.

**10.12, weed, dispensaries and your health.** *"We need health pickups... I would like the health pickup to be prescription marijuana."* It's an orange pill bottle with a white cap and a green leaf on the label.

- **Five random businesses become dispensaries,** with a green cross painted on the roof and a bottle at the door that restocks.
- **Gangsters drop one** now and then when they're killed or arrested.
- **You get a health bar,** and the scoreboard counts how many gang hits you can take.

The drop chance started at 20%. The war kills three or four gangsters a second, so about 40 bottles lay round the map at any time. At 10%, with a 45-second life, it's 10–20.

**10.13, encounters in town.** The police drove only roads that cross the whole map, which meant mostly its edges, and the dog was walked along the top and bottom. So the generator now exports a **road network**: 84 straight stretches of road where both lanes are clear for a whole car, and the 210 places they cross.

![The road network drawn over the map: east-west runs in magenta, north-south runs in cyan, crossings in yellow](https://raw.githubusercontent.com/BlueFalconDevelopment/assembly-simulation/main/docs/road_network.png)

The police car now appears somewhere you can't see it and patrols: it turns at a third of the crossings, turns onto the cross street where its road ends, and goes off duty after 90 seconds, out of sight. It's out 92% of the time, and it never once clipped a wall. Arrests went from 6 to 22 a war, so arrested gangsters are now replaced, or the gangs would slowly vanish.

**10.14, the Bikers.** A motorcycle club with a clubhouse in town: a black roof with an orange winged wheel, and bikes parked out front. Every 90 seconds or so, five armored riders ride out to a random gang's turf, shoot everyone (you included) for 25 seconds, and ride home.

- **They drive the road network.** A breadth-first search over the crossings, from the target, gives every crossing its next hop.
- **One virtual leader rides crossing to crossing.** The riders replay its trail 45 px apart, so the pack turns where it turned.

The crash of the step: after moving the leader, a macro that looks up the next crossing reused `rax`, which still held the leader's new position. So "are we there yet?" compared a memory address. The leader rode off the top of the map, and as a field source it sent a search outside the grid.

## 10.15–10.16 — Things to buy

**10.15, the vehicle ladder.** A moped, a motorcycle, a car and a van: four more rows of the vehicle table, and art drawn once and rendered at 16 headings by a Python script. The car and van have a **body**: half (or 60%) of what's shot at you comes off the vehicle's health instead, and you're hidden inside. A car ram at full speed kills. The shop got a RIDES page: you keep everything you buy and pick one before each shift. Speeds top out at 6 px a tick, because I'd asked back in 10.06 that the ladder not get silly.

**10.16, guns.** An SMG, a rifle, a bat and grenades, on a new GUNS page. How each weapon fires is one row of a table, and Q cycles through what you have. A grenade arcs to where you aim and blows up: 250 damage at the middle of a 90 px blast, a scorch mark on the road, and half damage to you if you're too close. It started at 150 in 70 px, and the play test asked for *"a little more devastating."*

![The shop's GUNS page, and a grenade's flight, blast and scorch](https://raw.githubusercontent.com/BlueFalconDevelopment/assembly-simulation/main/docs/guns.png)

## What I learned this time

- **Play-testing finds what batches can't.** Every rework in Stage 10 came from a sentence of feel: "insanely hard", "incredibly underpowered", "easy to avoid". The numbers only told me what to fix once a play test said what was wrong.
- **Byte-identical checks let the game grow without breaking the sim.** Sixteen steps of player features, and the old sim still plays exactly the same games, checked every step. When a step broke it, I found out at once.
- **Measure the thing, not the symptom.** "The west home wins 86%" was really a jam in a 40 px passage. "The city is easy to avoid" was really every gangster standing in one strip. A sampler found both in minutes.
- **Registers don't survive macros either.** Two of the worst bugs this time were a macro or a call quietly reusing a register the code still needed.
- **A code review is worth the time.** It found eight real problems in a step my tests said was fine.

## What's next

- **Abilities:** nitro, a smoke bomb, adrenaline
- **Price scaling,** carrying more than one package, and delivery pay tuned against the prices
- **A pause menu, an inventory screen, and lore and a story**
- **Box art, and music** (I'm writing it)
