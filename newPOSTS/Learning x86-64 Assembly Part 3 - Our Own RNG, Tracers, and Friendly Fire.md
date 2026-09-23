# Learning x86-64 Assembly, Part 3: Our Own RNG, Tracers, and Friendly Fire

2026-09-23 · @Someone

## Overview

Part 2 ended with the original roadmap finished: a 50-vs-50 battle sim in hand-written x86-64, fair over 96 headless games, plus soldier collision and random mirrored spawns. This part covers four more changes to how the battle plays and looks:

- **7.03:** libc's `rand()` replaced with a hand-rolled xorshift RNG, seeded from the CPU's cycle counter
- **7.04:** attack animations: knife thrusts, bullet tracers, shotgun fans, hit flashes
- **7.05:** friendly fire: shots hit whoever is actually in the way
- **7.06:** hold fire: soldiers stop shooting through their own team

Two of these were meant to change nothing about the fight, and I wanted proof that they didn't. The other two were meant to change it, and one of them came with a fairness bug one pixel wide.

Repo: https://github.com/BlueFalconDevelopment/assembly-simulation (`stage7/`)

## Stage 7.03 — Our own random numbers

Until now the sim linked libc for exactly three functions: `srand`, `rand` and `time`. That's a small amount of C in a project whose whole point is to avoid it, and `time()` had already cost me once: in Part 2, the batch harness's first result was one game played sixteen times, because games launched in the same second got the same seed.

### xorshift64 in eleven instructions

George Marsaglia's xorshift64 is three shift-and-xor steps on a 64-bit state:

```nasm
rng_next:
    mov rax, [rng_state]
    mov rdx, rax
    shl rdx, 13
    xor rax, rdx
    mov rdx, rax
    shr rdx, 7
    xor rax, rdx
    mov rdx, rax
    shl rdx, 17
    xor rax, rdx
    mov [rng_state], rax
    shr rax, 32
    ret
```

No multiply, no divide, and a period of 2^64 − 1: it visits every nonzero 64-bit value exactly once before repeating.

The last line is the one decision worth explaining. It returns the **high** 32 bits. A plain xorshift's low bits are its weakest, and `update_soldiers` uses exactly one bit of every draw (`and eax, 1`) to choose which direction to process soldiers in each tick. That's Part 1's fix for turn-order bias, the same one whose accidental removal was a real bug in 6b. It gets the best bit available, for the cost of one `shr`.

Every call site just changed `call rand` to `call rng_next`. The callers only ever did `and eax, 1` or an unsigned `div`, so a full 32-bit result instead of `rand()`'s 0..`RAND_MAX` needed no other changes. And `rng_next` clobbers only `rax` and `rdx`, fewer registers than `rand()` was allowed to, so every caller already assumed worse.

### Seeding from the cycle counter

`rdtsc` returns the CPU's timestamp counter in `edx:eax`, a value that changes billions of times a second. Using it raw would work, but xorshift is linear: two seeds a few cycles apart would produce early outputs that differ in only a few bits. So the seed goes through splitmix64's finalizer first, the standard way to seed the xorshift family:

```nasm
rng_seed:
    rdtsc
    shl rdx, 32
    or rax, rdx                          ; rax = full 64-bit timestamp

    mov rdx, 0x9E3779B97F4A7C15
    add rax, rdx
    mov rdx, rax
    shr rdx, 30
    xor rax, rdx
    mov rdx, 0xBF58476D1CE4E5B9
    imul rax, rdx
    mov rdx, rax
    shr rdx, 27
    xor rax, rdx
    mov rdx, 0x94D049BB133111EB
    imul rax, rdx
    mov rdx, rax
    shr rdx, 31
    xor rax, rdx

    test rax, rax
    jnz .seed_ok
    mov rax, 0x9E3779B97F4A7C15          ; any nonzero constant
.seed_ok:
    mov [rng_state], rax
    ret
```

The last four lines guard xorshift's one bad state. Zero maps to zero forever. After the mix, a zero seed is astronomically unlikely, but ruling it out costs two instructions.

### Checking it against a reference

Hand-written bit twiddling is exactly the kind of code that looks right and isn't. So in gdb I set `rng_state` to `0x0123456789abcdef`, called `rng_next` three times, and compared with a ten-line Python xorshift64. Outputs `0x3f2800d6, 0x606f949a, 0xc69bba40`, final state `0xc69bba40dddccad6`: identical. `rng_seed` got the same treatment, overwriting `rdtsc`'s result in gdb with a fixed value and comparing against Python's splitmix64. Bit for bit.

Distribution, from a million draws of the same algorithm: bit 0 set 50.01% of the time, and every one of the 100 hit-roll buckets (`% 100`) within normal spread of 10,000.

### The side effect I actually wanted

With seeds from `rdtsc`, games launched at the same instant get different seeds. `batch.sh` had been sleeping a second between launches purely because of `time()`. Now `STAGGER=0 ./batch.sh 48` launches all 48 at once. The proof it works: 40 distinct game lengths among 46 readable results. Under `time()` they'd all have been the same game.

Fairness: 25–23 and 24–24, **49–47**, 0 stuck, 0 crashed.

## Stage 7.04 — Making attacks visible

Watching a 50v50 battle, the only sign of combat was a square disappearing when it died. Nothing showed who was shooting whom. So:

- **Knife:** a short white blade slides out from the attacker into the target and pulls back over 10 frames.
- **Pistol:** a yellow tracer flies from shooter to target in 8 frames.
- **Shotgun:** three orange pellet tracers in a fan.
- **Hit:** a small spark at the end of each tracer, and the target flashes white for 6 frames when the bullet or blade reaches it.
- **Miss:** the tracer veers off to one side and overshoots, so you can see it fly past.

### Rule one: drawing only

The fight had been batch-verified fair several times over. I didn't want a cosmetic change to put that in question, so the design rule was **the effects code may not change the game**. It never calls the RNG and never writes to a soldier.

`update_soldiers` still makes the same hit roll at the same moment. It now also hands the result to `spawn_effect`, which records the attack in a 128-slot ring buffer:

```nasm
struc Effect
    .type:   resd 1      ; 0 = free, else FX_* (weapon + 1)
    .age:    resd 1      ; frames since the attack
    .target: resd 1      ; soldier index, for the hit flash
    .hit:    resd 1      ; 1 = the attack hit
    .x0:     resd 1      ; attacker centre
    .y0:     resd 1
    .x1:     resd 1      ; aim point: target centre, pushed aside on a miss
    .y1:     resd 1
    .px:     resd 1      ; perpendicular to the shot, for the pellet fan
    .py:     resd 1
endstruc
```

Why 128 is enough: a soldier attacks at most once per cooldown (at least 20 ticks), and every effect is finished in under 20 frames, so at most 100 are ever alive. A power of two means the ring index wraps with a single `and`.

`draw_effects` runs once per rendered frame, not per update tick, so tracers still finish flying after the game ends and updates stop.

The rule showed up in one small choice. A miss veers to one side, and the obvious way to pick the side is a coin flip. But a coin flip is a call to `rng_next`, and one extra draw shifts every random number after it, which would change every game from that point on. So the side alternates with the ring-buffer slot number instead.

### Everything is a fraction along a line

Every effect is a line segment somewhere along the path from `(x0, y0)` to `(x1, y1)`, with each end given as a fraction:

- **tracer:** head at `(age+1)/8` of the way, tail two steps behind. The segment slides along the path.
- **knife:** head at `f/5` of the way, with `f` counting 0, 1, … 5, … 1, 0, and the tail three steps behind. The blade slides out and back.

One helper does the arithmetic:

```nasm
; int lerp(int a: edi, int b: esi, int n: edx, int d: ecx)
;   -> eax = a + (b - a) * n / d
lerp:
    mov eax, esi
    sub eax, edi
    imul eax, edx
    cdq
    idiv ecx
    add eax, edi
    ret
```

The line itself is drawn by `draw_line`, Stage 3's Bresenham, copied unchanged. That's its third use in this project: drawing lines in Stage 3, then line of sight in 6b, and now tracers.

The shotgun fan needs a vector perpendicular to the shot, about 8px long. The exact version divides `(-dy, dx)` by the line's length, which means a square root. Dividing by `max(|dx|, |dy|)` instead gives a vector 1× to 1.41× too long depending on the angle, and nobody can see that in a spread of pellets.

### Bodies that disappear too early

Damage still lands on the tick of the attack, but a tracer takes 8 frames to arrive. So a killing shot would reach an empty patch of grass: the target vanished the moment the hit was rolled.

The fix is a render-only timer. On a hit, `spawn_effect` sets `death_linger[target]` long enough to cover the tracer's flight plus the flash. The soldier-drawing loop draws a dead soldier while its timer is running. Nothing else reads it: collision, targeting and the win check all still check `health`, so a lingering body can't block anyone or be shot twice.

### A bug that had been waiting since Stage 3

Sparks are small squares drawn with `fill_rect` at the end of each tracer. An outer shotgun pellet aimed at a soldier near the top or left edge of the screen can land at a slightly negative coordinate. And `fill_rect` only ever clipped the right and bottom edges:

- a negative `x` wraps into the end of the previous row
- a negative `y` writes **before the start of `back_buffer`**, into whatever `.bss` has there

Nothing had drawn at a negative coordinate in five stages, so it never mattered. Two `test`/`jns` pairs fixed it.

I also caught one bug of my own while re-reading the new code before running it. `spawn_effect` computes the fan vector with `cdq`/`idiv`, and both of those overwrite `edx`, which still held the target's index. The code after the division read the target from `edx` anyway. The fix was to read it from the stored struct instead. It's the same class of trap as Part 1's `syscall` clobbering `rcx` and `r11`: an instruction with a side effect on a register you're not thinking about.

### Proving the fight didn't change

Batches show fairness *on average*. "Drawing only" is a stronger claim: the game should be identical to 7.03 for the same seed. gdb can test that directly:

1. break at the first spawn function (right after `rng_seed`)
2. overwrite `rng_state` with a fixed value
3. put a hardware watchpoint on `game_over` and continue
4. when someone wins, dump the `soldiers` and `pickups` arrays to files

Run that on both binaries and compare the dumps. For three different seeds, 7.03 and 7.04 ended with **byte-identical** soldiers, pickups, and final `rng_state`. Same number of random draws, same outcomes, same final positions. The effects are provably cosmetic.

To actually see them I used Part 2's trick of dumping `back_buffer` from gdb, this time for ten consecutive frames mid-fight: tracers moving along their paths across the gap, the orange fan, sparks, white flashes, and a blade poking into a neighbour.

## Stage 7.05 — Friendly fire

Before this, a shot could only hit the soldier it was aimed at. It passed through anyone standing in between, teammates included. Now a pistol or shotgun shot hits whoever is *first* on the line of fire.

### Bresenham, fourth time

`first_in_line(shooter, target)` walks the line from the shooter's centre to the target's centre, the same Bresenham walk as `draw_line` and `line_blocked`. At each point it checks every living soldier's box, skipping the shooter (the line starts inside the shooter), and returns the first soldier whose box contains the point. If nobody's in the way, that's the target, whose box sits at the end of the line.

It makes no calls, so the whole walk lives in registers, and the box test uses an unsigned-compare trick:

```nasm
    ; inside the box when 0 <= x - box.x < SIZE. Compared unsigned, a
    ; negative difference becomes huge, so one jae covers both ends
    mov eax, r8d
    sub eax, [rdx + Soldier.x]
    cmp eax, SOLDIER_SIZE
    jae .fil_scan_next
```

`0 <= d < 16` is two comparisons in signed arithmetic. Reinterpreted as unsigned, a negative `d` becomes a number above 4 billion, so a single unsigned `d < 16` checks both ends.

The hit roll, damage and weapon drop are unchanged; they just apply to whoever `first_in_line` returns. The animation follows too, so the tracer ends at whoever actually got hit. The knife is unaffected: it's contact range, so the target is the only soldier it can reach.

### Printing a number in assembly

I wanted each game to report its friendly fire. That meant turning an integer into text, which the sim had never needed to do. `append_uint` divides by 10 repeatedly, which yields the digits last-first, so it writes them backwards into scratch space and then copies them forwards. The scratch space is the System V **red zone**: a leaf function (one that makes no calls) may use the 128 bytes below `rsp` without moving `rsp` at all.

The whole line goes out in **one** `write` syscall, built in a buffer first. That's for the batch harness, which kills each game the moment its output file isn't empty. With three separate writes it could read half a line.

```
Team 0 (blue) wins! (friendly fire: 128 hits, 18 kills)
```

### Results

Three 48-game batches: **72–72**, 0 stuck, 0 crashed. And a lot of friendly fire: an average of **128 friendly hits and 15 friendly kills per game**, the worst game 152 hits and 22 kills. Roughly one death in seven came from the soldier's own team. Nobody checks before firing, so soldiers at the back of a crowd shoot through the ones in front, mostly around the gap in the wall.

That was realistic, and the fix was obvious.

## Stage 7.06 — Hold fire

When a pistol or shotgun is ready to fire, the soldier now calls `first_in_line` *before* shooting. If a teammate would take the shot, it holds fire and side-steps instead:

```nasm
    call first_in_line

    ; a teammate first in the line -> hold fire and side-step for a
    ; clear shot. .side_step steps perpendicular to US_GOAL, which here
    ; is the target, so it moves the soldier across the line of fire
    mov ecx, eax
    imul ecx, Soldier_size
    lea rdx, [soldiers]
    mov ecx, [rdx + rcx + Soldier.team]
    mov r8d, [rbp + US_ACTUAL]
    imul r8d, Soldier_size
    cmp ecx, [rdx + r8 + Soldier.team]
    jne .fire_clear
    inc dword [ff_held]
    jmp .side_step
```

`.side_step` is the sticky perpendicular step from Part 1, originally written to route around walls. It steps perpendicular to the soldier's goal, and here the goal is the target, so the step goes *across* the line of fire, and the soldier checks again next tick. An enemy in the way is still fine: that enemy takes the shot.

Friendly fire dropped to zero. Soldiers held fire about 3,200 times a game, and games ran about 20% longer as they shuffled sideways for a clear shot. Watching it, groups spread out into wider firing lines instead of stacking up behind each other.

### The one-pixel bias

Then the batches came in: 22–26, 20–28, 21–27. Red ahead three times in a row. Seven more: red ahead in four of those too. Ten batches, **221–259**.

This is where honesty about statistics matters. 259 of 480 is 54%. If the game were perfectly fair, a split at least that lopsided would happen by chance about 1 time in 12. That's suspicious, not conclusive. But this project's history says one-sided results should be chased, and there was a candidate cause.

A soldier's box is 16px wide: pixels `x` through `x+15`. **It has no centre pixel.** `first_in_line` used `x+8`, which is 8 pixels in from the left edge but only 7 from the right.

Now mirror it. The teams are left-right mirror images: a box at `x` corresponds to one at `800-16-x`. The mirror image of pixel `x+8` is pixel `800-1-(x+8) = 791-x`. But the mirrored soldier's own "centre" is `(800-16-x) + 8 = 792-x`. One pixel off.

So every one of team 1's lines of fire was shifted 1px from the exact mirror of team 0's, while the boxes those lines were tested against mirrored exactly. In 7.05 that was harmless noise: one check per shot, and the answer only decided who got hit. In 7.06 it gets asked thousands of times a game and **decides whether a soldier fires or moves**. A tiny asymmetry gets thousands of chances to add up.

The Bresenham walk itself was fine. Its step decisions depend only on `|dx|` and `|dy|`; the signs only choose the direction of each step. So a mirrored line walks exactly the mirrored path, as long as its endpoints are exact mirrors.

### The fix: half pixels

Double every coordinate. In half-pixel units, a 16px box at `x` covers `[2x, 2x+30]` and its centre is exactly `2x + 15`:

```nasm
    ; half-pixel units: a box's true centre is 2x + SIZE - 1
    mov r8d, [rcx + Soldier.x]
    lea r8d, [r8d * 2 + SOLDIER_SIZE - 1]
```

Check it under the mirror. In half-pixel units, pixel `p` maps to `2(W-1) - p`. Team 0's centre `2x+15` maps to `2W - 2x - 17`. The mirrored soldier at `W-16-x` has centre `2(W-16-x) + 15 = 2W - 2x - 17`. Exact. The box is exact too. And two boxes side by side (16px = 32 half-pixel units apart) can't share a point, so no tie ever depends on which soldier comes first in the array.

`lea` does the doubling and the offset in one instruction. The box test becomes `0 <= X - 2*box.x <= 30`, with the same unsigned trick.

After the fix: **142–146** over 288 games. For comparison, the first 288 games before the fix had been 131–157. The same fix went into 7.05, which uses the same function, and it re-batched at 66–78 over 144 games, well within chance.

I want to be careful about what this proves. The fix is justified by the geometry alone: the old centre was not symmetric under the mirror, and the new one is. The before-and-after numbers agree with that. But the "before" lean was never strong evidence by itself, and I'm not claiming the batches proved causation.

## What this part was really about

- **"Cosmetic" is a claim you can test.** A fixed seed and a byte-for-byte comparison of the whole game state is stronger evidence than any number of batches. It also caught nothing, which is the point.
- **Deterministic replay is a debugging superpower.** Setting `rng_state` in gdb turns a random game into a reproducible one. The same trick verified the RNG against Python.
- **Latent bugs wait for new callers.** `fill_rect` was wrong at the top and left edges for five stages. It only mattered once something drew there.
- **"Symmetric under the mirror" goes all the way down to pixels.** Part 2's lesson was that a rule like "step left" means different things to mirrored teams. This time the rule was fine, but a single coordinate wasn't: a 16px box has no centre pixel.
- **The more often code asks a question, the more a small bias in the answer matters.** The 1px asymmetry sat harmlessly in 7.05 and became visible in 7.06 only because hold fire asks the same question thousands of times and acts on it.
- **Say how strong your evidence is.** 1 in 12 is "worth chasing," not "proven." The fix stands on the geometry; the batches just agree.

## What's next

- **Smarter repositioning for hold fire.** Side-stepping works, but a soldier with a teammate directly in front could also step back, or pick a different target with a clear line.
- **A scoreboard drawn in a hand-made pixel font,** instead of a win line on stdout. Now that `append_uint` exists, the digits are half done.
- **Profiling:** a mode with no rendering and no frame cap, to see how far hand-written assembly can push the soldier count. `first_in_line` checks every soldier's box at every point along the line, so it would be the first thing to show up.
