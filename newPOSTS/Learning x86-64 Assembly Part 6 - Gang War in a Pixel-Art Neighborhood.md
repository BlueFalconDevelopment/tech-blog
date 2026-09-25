# Learning x86-64 Assembly, Part 6: Gang War in a Pixel-Art Neighborhood

2026-09-24 · @Someone

<YouTubeEmbed id="AKZ1oa-LbjQ" title="Go - The Chemical Brothers" />

## Overview

[Part 5](/blog/bare-metal-deathmatch-5) ended with a sim that was finally solid: flow-field pathfinding, 6,240 games without a stalemate, and a scoreboard in a hand-made font. It was also still two teams of coloured squares on a test map. This post is what happened next, in one long day:

- **7.12–7.16:** respawns, a city neighborhood with two rival gangs, police and a loose pitbull, a miniboss, and some tuning
- **8.01–8.06:** graphics. Pixel-art sprites, props and shadows, blood that stays on the street, day and night, and a camera you can zoom

The first half changed the game. The second half changed nothing about the game, and each step proved it.

Repo: https://github.com/BlueFalconDevelopment/assembly-simulation (`stage7/`, `stage8/`)

## Stage 7.12 — Respawns

Dead soldiers now come back. A soldier who dies returns two seconds later in its own spawn area. It tries 8 random spots and takes the one farthest from any living enemy, then gets 1.5 seconds of spawn protection, where hits land but do no damage. It blinks while that lasts.

That turned "last team standing" into a choice, so the rules became environment variables: `SCORE_LIMIT=n` (first to n kills wins), `RESPAWNS=n` (a team's pool) and `LIVES=n` (per soldier). A kill is scored the moment it happens, not at the end of the tick. Soldiers are processed in a random direction each tick, so "whoever gets there first" is fair.

The nice property: with `RESPAWNS=0`, the respawn code never draws a random number and never changes anything. So for fixed seeds, the new build ended **byte-identical** to the previous one. That's the same proof Part 3 used for the tracers, and it came up again and again today.

Would matches last forever? No: 7,120 games under "respawns, first to 200" all finished, mostly in 40–50 seconds, and the loser usually got to 185–191.

**A bug that waited a day.** `read_rules` put the default number of lives in `ecx`, then called libc's `getenv`. `ecx` is caller-saved: `getenv` is free to change it, and did, leaving 69. So "unlimited" lives were really 68 respawns per soldier. Nobody noticed, because no first-to-200 game ever needs 68 respawns from one soldier. It only showed up in the next step, where the default was 3 lives and a game ran to 1,900 kills a side. The fix is to set the default *after* the call.

## Stage 7.13 — The neighborhood

The test arenas were fine for measuring, but the goal was a city. The new map is 1280×720: an avenue, cross streets, blocks of houses, a store and offices, a fenced parking lot, alleys with dumpsters, and row houses. Two rival gangs, the **Crips** in blue and the **Bloods** in red, each come out of their own **apartment complex**: a ring of walls around a tiled lobby, with two doorways. Soldiers spawn and respawn in the lobby, and the flow field routes them out of the doors with no special code.

**The map is data.** It's laid out in a Python generator that also *checks* it before writing anything. It confirms that every walkable cell connects to every other, that 50 soldiers can be packed into each lobby (300 random packings each, using the game's own spawn rule), and that every pickup sits on open ground. Then it writes the data block into the `.asm`.

**Fairness, the other way round.** Every map so far had been a mirror image, which makes fairness provable. A neighborhood isn't symmetric. So instead, each game draws one random bit to decide which gang gets which complex, and any home-turf advantage averages out over many games. The win line records where the Crips lived, so the advantage itself can be measured. It's real: over 960 games the gangs split 475–485, but whoever lived in the **east** complex won **59%**.

**Low cover.** Cars, dumpsters and fences block walking but not bullets: you can shoot over a car. That means two different questions, "can I stand here?" and "can a bullet pass here?". Both come from one precomputed **blockmap**: a byte for every possible soldier corner position (1265×705), with one bit for walls and props and another for walls only. Collision tests went from a loop over every wall to one byte lookup, which matters with 54 obstacles and a line-of-sight check that tests every point on every line.

## Stage 7.14 — The police and a pitbull

The gangs don't control everything.

**The police.** Every so often a police car drives the length of a street, in the proper lane. The officers shoot at the nearest soldier they can see. Soldiers nearby drop everything and run. And **anyone the car touches is arrested**: out of the game for good, whatever lives they had left.

**The pitbull.** Someone walks a dog along a sidewalk. At a random moment it slips the leash and goes for the nearest soldier of either gang, until animal control collects it.

One small trick made both easy to draw: `spawn_effect`, which records an attack for the tracer animation, used to take the shooter as a soldier index. Now −1 means "the position in `fx_src`", a stand-in laid out like a soldier's x and y. So police tracers and dog lunges reuse the existing animations.

It worked, but the numbers said something odd. Over 960 games there were **21.7 arrests** a game, and only 1.2 police shooting kills. The car mattered by running people over.

## Stage 7.15 — The Big Homie

When a gang is clearly losing, its **Big Homie** walks out of the complex: 400 health, already armed, double damage, harder to miss, not scared of the police. He's triggered by strength, not score. Everything a gang has left (soldiers alive, soldiers waiting to respawn, lives in reserve) is compared to the other gang's, and when it falls below `BOSS_AT` percent, he's due. He gets his own soldier slot after the two 50-soldier squads, so nothing about the squads changed.

Then the question was: does he actually turn games round? Headless batches answered it, 480 games per setting:

| `BOSS_AT` | His gang came back to win | Both gangs got one |
|---|---|---|
| 40 | 10% | 25 |
| 60 | 2% | 99 |
| 80 | 1% | 220 |

The earlier he came out, the *less* he helped. The reason was in the last column: the leading gang often dipped below the line at some point too, got its own Big Homie, and cancelled him out. One rule fixed it: **a gang can't get its Big Homie while the other gang's is alive.** Comebacks went to 15%.

## Stage 7.16 — Tuning, and a rule that looked right

Watching games, two things stood out: arrests, and the Big Homie appearing "at the last minute".

The last-minute feeling was measurable once the win line recorded *when* he came out. At `BOSS_AT=40` it was a median of 80% of the way through the game. At 60 it's 72%, so that's now the default.

The arrests were more interesting. The obvious fix was a bigger fear radius, and it did nothing: still about 24 arrests a game. Fleeing meant heading straight away from the car, and for a soldier standing *ahead* of the car in its lane, "straight away" is down the road in front of it, at 2 pixels a tick against the car's 3. The fix was to run *across* the car's path, off the road. **Arrests halved, to 11.7 a game.** The rule "run away from the danger" was fine in general and wrong in the one case that mattered, and only the numbers showed it.

## Stage 8 — Graphics, without changing the game

Stage 8 had one rule: **every step is drawing only.** For each one, fixed-seed games had to end byte-identical to the step before: the same soldiers, pickups, RNG state and tick count. That rule decided several designs.

### 8.01 — Sprites

The squares became hand-made 16×16 pixel art, exactly the hitbox, so what you see is what can be hit. The art is written as text, one character per pixel, in a Python tool that checks it and writes it into the `.asm`:

```
......BBBB......     B bandana   H hair    S skin
.....BBBBBB.....     T shirt     D shadow  P pants   F shoes
.....HHHHHH.....     a gun   b shotgun barrel   k knife
.....HSSSSH.....
```

Five poses are drawn (facing N, NE, E, SE, S), and the other three are mirror images, each with two walk frames. The letters are palette indices, and the game picks the colours per soldier: shirt and bandana from the gang, one of three skin tones, and **only the weapon it's carrying gets a colour**. The others are colour 0, which the drawing routine skips. One sprite serves knife, pistol and shotgun.

Facing and the walk cycle come from comparing each soldier's position with where it was drawn last frame. That's drawing-only state, which headless runs never touch.

### 8.02 and 8.03 — Everything else

The pickups became guns, the police car got a flashing light bar and four directions, and the dog got a run cycle. A general `draw_sprite_ex` draws any size, mirrored and/or upside down, so the police car driving north is its south-facing art read bottom to top. Parked cars are the same car art in their own colours, emitted as runs of pixels into the background.

Then came depth. **Shadows**, with light from the top left, for buildings, cars, dumpsters, fences, trees and lamps, baked into the background. A darkening pass has to come *after* the ground and *before* the object casting it, so the background became three generated layers: ground, shadows, objects. The darkening itself is a small bit trick that does all three colour channels at once:

```nasm
    mov eax, [r9 + rcx*4]       ; a pixel
    mov r8d, eax
    shr eax, 1
    and eax, 0x7F7F7F           ; half of each channel
    shr r8d, 3
    and r8d, 0x1F1F1F           ; an eighth of each
    add eax, r8d                ; 5/8 brightness
    or eax, 0xFF000000
```

The masks drop the bits that slide down from the channel above.

Moving things got small oval shadows too. The first version was a plain box, and it also left stray **brown dashes** on the lobby floors: the shadows of respawning soldiers during the "off" half of their protection blink, drawn while the soldier wasn't. Now the shadow blinks with the soldier.

### 8.04 — The street remembers

Blood where hits land, shell casings by shooters' feet, and a death animation: the fallen lie there for half a second, then leave a pool. Arrested soldiers just vanish, because the police took them.

Two design points came straight from "drawing only":

- **Persistence for free.** The pre-drawn background is copied to the screen every frame, so anything stamped *into* it stays for the rest of the game at no cost per frame.
- **No borrowing the game's dice.** Splat shapes and casing scatter need randomness, and one extra call to the game's RNG shifts every random number after it, which changes the whole game. So the look uses its own scrambler, `deco_hash`, a mix of position and frame count. The games stayed byte-identical.

### 8.05 — Day and night

A whole day passes in 4 minutes, so a one-minute game covers about six hours: some start in sunshine and end in the dark. Dusk turns orange and night dark blue. The light comes from 21 streetlights, the gangs' lit lobbies spilling out of their doors, the police car's headlights, and muzzle flashes.

Each frame builds a **light map** at half resolution (640×360). It starts at zero, and every light adds a round falloff kernel, `peak × (1 − d²/r²)`, with no square roots. Then every pixel is scaled per channel through lookup tables rebuilt for the time of day, from the night tint at level 0 to warm lamplight at 255. Tracers are drawn *after* the lighting, so gunfire is bright in the dark. A night game and a noon game with the same seed took identical wall time, so the pass fits inside the frame.

### 8.06 — A camera

The mouse wheel zooms toward the cursor (1× to 4×), and W A S D pan. The whole thing is a source rectangle. The frame is still drawn at full size, and `SDL_RenderCopy` is told which part of it to scale up. The pixel art stays crisp because SDL's default scaling is nearest-neighbour. It needed no changes to the game or to any of the drawing.

## A few more bugs worth keeping

- **`movzx r13d, dh`** is an assembler error. The old high-byte registers (`ah`, `bh`, `ch`, `dh`) can't be used in any instruction that needs a REX prefix, and naming `r13` needs one. Shift and mask instead.
- **Checking the check.** Pathfinding fields "failed" against Python because I dumped them mid-tick, and a side-swap fairness test "passed" because it broke the very symmetry it was testing. Both times the tool was wrong, not the code.
- **My own measuring.** A `pkill -f` pattern matched the shell running it and killed that too. And a line-count estimate in my notes was off by 2,000 until I counted.

## What this one was actually about

- **Some changes should change nothing, provably.** Six graphics steps, each checked byte-for-byte against the one before. That rule forced better designs: drawing-only randomness, drawing-only state, persistence in the background buffer.
- **When you can't mirror, swap.** A realistic map can't be symmetric. A random side swap keeps it fair over many games, and measuring the home advantage separately keeps everyone honest about the map.
- **Measure the thing you're tuning.** "The Big Homie comes out too late" and "the police arrest too many" were feelings until the win line recorded them. Then they were numbers, and one fix turned out to do nothing.
- **Rules can be right in general and wrong in the case that matters.** Running away from a car is sensible, unless you're standing in its lane.

## What's left

```
--[ WHAT'S LEFT ]---------------------------------------------------------
  [x] toolchain, registers, stack, calling convention
  [x] SDL2 window + raw pixel drawing, animation, input
  [x] capstone: combat, weapons, pickups, obstacles, line of sight
  [x] scale to 50v50, collision, mirrored spawns, our own RNG
  [x] attack animations, friendly fire, hold fire
  [x] arenas, headless mode, pathfinding, traffic, a scoreboard
  [x] respawns, lives and score limits
  [x] a city neighborhood, two gangs, apartment complexes
  [x] police, a pitbull, the Big Homie
  [x] pixel-art sprites, props, shadows, blood, day and night
  [x] a camera: zoom and pan
  [ ] more soldiers: how many before it hurts?
  [ ] more gangs: three or four complexes, everyone against everyone
  [ ] a bigger city you scroll around
-----------------------------------------------------------------------------
```

Stage 9 is scale. Headless mode says a game takes 0.85 seconds today, so I already have a way to measure what more soldiers cost. The camera from 8.06 is half of a scrolling city.
