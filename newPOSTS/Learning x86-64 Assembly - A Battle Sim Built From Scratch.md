# Learning x86-64 Assembly: Building a Two-Team Battle Simulation From Scratch

2026-09-21 · @Someone

## Overview

Chris Sawyer wrote 99% of RollerCoaster Tycoon (1999) in hand-coded x86 assembly using MASM, with just 1% C to glue it to Windows/DirectX. This project chases the same spirit at a much smaller scale: learn x86-64 assembly from a standing start — total beginner, never written a line of asm — by building toward a capstone simulation almost entirely by hand. The target: a two-team deathmatch, soldiers armed with knives, pistols, and shotguns, fighting until one side has nobody left standing.

The stack:

- **NASM** — the assembler
- **System V AMD64 ABI** — the calling convention (args in `rdi, rsi, rdx, rcx, r8, r9`) — this is what makes calling SDL2 from hand-written asm possible
- **gcc** — used *only* as a linker driver, to get a working C-runtime entry point and dynamic linking, without writing a single line of C
- **gdb** — debugger, though for a simulation running at 60 ticks/second, plain `write()` syscalls redirected to a file turned out to be the more useful debugging tool more often than gdb itself (more on that below)
- **SDL2** — window/input/pixel-blit, called directly from assembly

Repo: https://github.com/BlueFalconDevelopment/assembly-simulation

This write-up covers one long session that went from a bare Ubuntu desktop with no toolchain installed, through registers-and-syscalls fundamentals, opening an SDL2 window, drawing raw pixels by hand, animation, input, and then the capstone: an 8-vs-8 battle sim with weapon pickups, obstacles, and line-of-sight — including several real, reproducible bugs found and fixed along the way. The bug hunts are the most interesting part and get the most space here.

## Stage 0 — Toolchain

Straightforward apt install, plus one smoke test to prove the whole chain (assemble → link → run → debug) actually works before trusting it for anything real:

```bash
sudo apt update
sudo apt install -y nasm gdb build-essential libsdl2-dev
```

Versions confirmed: NASM 3.01, GDB 17.1, GCC 15.2.0, SDL2 2.32.10.

The smoke test was a pure-syscall "hello world" — no libc, no gcc, just `nasm` and `ld` directly:

```nasm
; Stage 0 smoke test: pure syscalls, no libc, no gcc.
section .data
    msg     db "toolchain works", 10
    msg_len equ $ - msg

section .text
    global _start

_start:
    mov rax, 1          ; syscall number: write
    mov rdi, 1          ; fd: stdout
    mov rsi, msg        ; buffer
    mov rdx, msg_len    ; length
    syscall

    mov rax, 60         ; syscall number: exit
    mov rdi, 0
    syscall
```

```bash
nasm -f elf64 -g -F dwarf hello.asm -o hello.o
ld hello.o -o hello
./hello
```

Then a quick gdb pass to confirm debug symbols actually work end-to-end:

```bash
gdb -q -batch -ex "break _start" -ex "run" -ex "info registers rax rdi" -ex "continue" ./hello
```

## Stage 1 — Registers, the stack, jumps, calling convention

Four small, heavily-commented programs, each isolating one concept before combining them:

1. **Registers/mov/arithmetic** — `mov`, `add`/`sub`/`imul`, `idiv` (and the `cqo` sign-extension gotcha — `idiv` divides the 128-bit value in `rdx:rax` by its operand, so forgetting to sign-extend `rax` into `rdx` first divides by garbage), bitwise ops.
2. **The stack** — `push`/`pop`, and manual scratch space via `sub rsp, N` / `add rsp, N`.
3. **`cmp` and jumps** — `cmp` computes `a - b` and throws the result away, keeping only the flags; every conditional jump after it is just reading those flags. Paired with a hand-rolled integer-to-decimal-string conversion (build the digits back-to-front by repeatedly dividing by 10) to actually print a computed result via `write()`.
4. **The System V calling convention** — first six integer/pointer args in `rdi, rsi, rdx, rcx, r8, r9`, return value in `rax`, caller-saved vs. callee-saved registers, and the 16-byte stack alignment rule (at the instant a `call` executes, `rsp` must be 16-byte aligned — the kernel guarantees this at process start, and from there every `push` without a matching `pop` before a `call` flips that alignment). Demonstrated with a recursive `factorial` and a proper `rbp`-based `print_uint` function with its own local stack frame.

This alignment rule matters for the whole rest of the project — SDL2 (and libc) are ordinary C functions that assume it, and getting it wrong doesn't fail loudly, it corrupts something subtly later.

## Stage 2 — Opening a window

This is where the project's entry-point strategy changes for good. Stage 0/1 used `global _start` and linked with plain `ld`, making raw syscalls directly — that only works because those programs need nothing from libc. SDL2 depends on libc, pthreads, and dynamic linking machinery that isn't worth hand-rolling. From here on:

- `global main` instead of `global _start`
- link with `gcc`, not `ld` — gcc supplies the real C runtime startup (`crt1.o`), which does real setup (TLS, etc.) before calling `main`
- every SDL function declared `extern` and called with the exact System V convention from Stage 1

```nasm
extern SDL_Init
extern SDL_CreateWindow
extern SDL_CreateRenderer

SDL_INIT_VIDEO           equ 0x00000020
SDL_WINDOWPOS_UNDEFINED  equ 0x1FFF0000
SDL_WINDOW_SHOWN         equ 0x00000004
SDL_RENDERER_ACCELERATED equ 0x00000002

main:
    push rbp
    mov rbp, rsp
    push r12
    push r13
    ; ...

    mov edi, SDL_INIT_VIDEO
    call SDL_Init

    lea rdi, [title]
    mov esi, SDL_WINDOWPOS_UNDEFINED
    mov edx, SDL_WINDOWPOS_UNDEFINED
    mov ecx, 800
    mov r8d, 600
    mov r9d, SDL_WINDOW_SHOWN
    call SDL_CreateWindow
    mov r12, rax                ; save SDL_Window*

    mov rdi, r12
    mov esi, -1
    mov edx, SDL_RENDERER_ACCELERATED
    call SDL_CreateRenderer
    mov r13, rax                ; save SDL_Renderer*
```

### The PIE relocation gotcha

Building this the naive way:

```bash
nasm -f elf64 -g -F dwarf window.asm -o window.o
gcc window.o -o window -lSDL2
```

fails:

```
relocation R_X86_64_PC32 against symbol `SDL_Init' can not be used when making a PIE object; recompile with -fPIE
```

Modern gcc defaults to building a Position-Independent Executable, which requires every external-symbol reference to go through the GOT/PLT with a different relocation form than plain `call SDL_Init`. Fix: link non-PIE explicitly.

```bash
gcc -no-pie window.o -o window -lSDL2
```

This one-line fix went into every Makefile from Stage 2 onward.

### Frame timing

The naive main loop (poll events, clear, render, present, repeat with no delay) pegs a CPU core near 100%. Fixed with `SDL_GetTicks`/`SDL_Delay`:

```nasm
.loop:
    call SDL_GetTicks
    mov ebx, eax                  ; frame start time

    ; ... poll events, render ...

    call SDL_GetTicks
    sub eax, ebx                  ; elapsed ms this frame
    cmp eax, FRAME_BUDGET_MS      ; 16 -- targets ~60fps
    jge .loop                     ; already over budget, skip the delay
    mov ecx, FRAME_BUDGET_MS
    sub ecx, eax
    mov edi, ecx
    call SDL_Delay
    jmp .loop
```

Measured with `top` side by side: the unpaced version sat around 80-100% CPU; the paced version sat around 1-6%, for visually identical output.

## Stage 3 — Drawing a scene by hand

This is where the project stops leaning on `SDL_RenderClear`/`SDL_SetRenderDrawColor` and starts writing raw pixels. A streaming `SDL_Texture`, locked each frame, gives direct read/write access to a block of memory. Each pixel is 4 bytes; each row is `pitch` bytes (not necessarily `width * 4` — a driver is allowed to pad rows, so the code always uses the pitch SDL actually reports, confirmed via gdb to be exactly `800 * 4 = 3200` on this machine/driver, but never assumed).

```
address of pixel (col, row) = base + row * pitch + col * 4
```

To prove the offset math was actually right (not just "looks like a flat color"), the first test filled the buffer with a gradient where red cycled with column and green cycled with row — if row/col were ever swapped, the image would visibly rotate 90°, a bug you can *see* instead of merely suspect.

### The color-packing trick

`SDL_PIXELFORMAT_RGBA32` guarantees in-memory byte order R, G, B, A regardless of CPU endianness. Since a little-endian 32-bit store writes its low byte to the lowest address:

```
value = R | (G << 8) | (B << 16) | (A << 24)
```

Written as a hex literal `0xAABBGGRR`, the digit *pairs* read left to right as A, B, G, R — which is why color constants throughout the project look "backwards" from RGBA order at a glance:

```nasm
; R=100 G=170 B=255 A=255 (light blue sky)
COLOR_SKY equ 0xFFFFAA64
```

The exact numeric value of `SDL_PIXELFORMAT_RGBA32` was looked up, not guessed, with a tiny throwaway C probe against the real headers:

```c
#include <SDL2/SDL.h>
#include <stdio.h>
int main() {
    printf("SDL_PIXELFORMAT_RGBA32 = 0x%08X\n", SDL_PIXELFORMAT_RGBA32);
    return 0;
}
```
```bash
gcc /tmp/pf.c -o /tmp/pf $(pkg-config --cflags --libs sdl2) && /tmp/pf
# SDL_PIXELFORMAT_RGBA32 = 0x16762004
```

This "don't guess, compile a probe against the real header" technique got reused later for scancode constants and struct field offsets — much cheaper than debugging a wrong hardcoded constant an hour later.

### `set_pixel`, `fill_rect`, and NASM's `struc`

A `FrameBuffer` struct (pointer, pitch, width, height) bundles what every drawing function needs, using NASM's `struc`/`endstruc` — there's no real struct type at the machine level, just a pointer and a promise to interpret the bytes at fixed offsets consistently:

```nasm
struc FrameBuffer
    .pixels: resq 1
    .pitch:  resd 1
    .w:      resd 1
    .h:      resd 1
endstruc

; void set_pixel(FrameBuffer* fb: rdi, int x: esi, int y: edx, u32 color: ecx)
set_pixel:
    cmp esi, 0
    jl .done
    cmp esi, [rdi + FrameBuffer.w]
    jge .done
    cmp edx, 0
    jl .done
    cmp edx, [rdi + FrameBuffer.h]
    jge .done
    mov eax, edx
    imul eax, [rdi + FrameBuffer.pitch]
    lea eax, [eax + esi*4]          ; offset = y*pitch + x*4
    mov r10, [rdi + FrameBuffer.pixels]
    mov dword [r10 + rax], ecx
.done:
    ret
```

`fill_rect` is the same idea with clipping against the far/bottom edges (a documented precondition: it assumes `x >= 0` and `y >= 0`, only clips the far side — this precondition gets violated by accident later, see Stage 6b bug #1).

### `draw_line` — the payoff that pays off twice

Bresenham's line algorithm, integer-only, walking from one point to another one step at a time deciding whether to move in x, y, or both:

```nasm
.plot_loop:
    mov rdi, [rbp + L_FB]
    mov esi, [rbp + L_X0]
    mov edx, [rbp + L_Y0]
    mov ecx, [rbp + L_COLOR]
    call set_pixel

    mov eax, [rbp + L_X0]
    cmp eax, [rbp + L_X1]
    jne .continue_loop
    mov eax, [rbp + L_Y0]
    cmp eax, [rbp + L_Y1]
    je .plot_done
.continue_loop:
    mov eax, [rbp + L_ERR]
    add eax, eax                    ; e2 = 2*err

    cmp eax, [rbp + L_DY]
    jl .skip_x
    ; err += dy; x0 += sx
    ...
.skip_x:
    cmp eax, [rbp + L_DX]
    jg .skip_y
    ; err += dx; y0 += sy
    ...
.skip_y:
    jmp .plot_loop
```

The comment left in the code at the time said this line-stepping logic would get reused three stages later for line-of-sight checks. It did, unchanged in algorithm — see Stage 6b.

Also worth noting: this function needs ~9 live values (both endpoints, deltas, sign, error term, color) to survive repeated calls to `set_pixel`. Rather than fight for callee-saved registers, it uses a proper `rbp`-based stack frame with one named local per value (`L_X0 equ -16`, etc.) — memory survives a `call` for free, which is a much simpler mental model than juggling which registers a callee is allowed to clobber.

## Stage 4 — Animation and double buffering

Two programs: a bouncing ball whose position/velocity live in `.data` and get updated once per tick before drawing (state *is* the simulation; rendering is a side effect of it), then an upgrade to a real back buffer.

The upgrade matters: drawing straight into the locked texture (as Stage 3 did) means drawing logic is entangled with lock/unlock timing and an unpredictable pitch. The fix is a persistent CPU-owned buffer in `.bss`, described by a `FrameBuffer` struct that's **compile-time initialized** via NASM's `istruc`/`at`/`iend`:

```nasm
section .data
    back_fb:
    istruc FrameBuffer
        at FrameBuffer.pixels, dq back_buffer
        at FrameBuffer.pitch,  dd OUR_PITCH
        at FrameBuffer.w,      dd SCREEN_W
        at FrameBuffer.h,      dd SCREEN_H
    iend

section .bss
    back_buffer resb SCREEN_W * SCREEN_H * 4
```

Once a frame, after the whole scene is drawn into that stable buffer, it's blitted into the locked texture row by row using `rep movsb` — an x86 string instruction that copies `rcx` bytes from `[rsi]` to `[rdi]`, advancing both pointers itself:

```nasm
.blit_row_loop:
    cmp r15d, SCREEN_H
    jge .blit_done

    lea rsi, [back_buffer]
    mov eax, r15d
    imul eax, OUR_PITCH
    add rsi, rax

    mov rdi, r10                  ; texture pixel base
    mov eax, r15d
    imul eax, r11d                ; texture's REAL pitch (may differ from ours)
    add rdi, rax

    mov ecx, SCREEN_W * 4
    cld
    rep movsb

    inc r15d
    jmp .blit_row_loop
```

The row-by-row copy (not one giant `memcpy`) matters because the back buffer's own stride is fixed at assembly time, but the texture's pitch is decided by the driver at lock time and might not match.

**A caught bug:** while writing this, the row counter used `r15` without pushing/pop it in the prologue, silently breaking the callee-saved convention that had been consistent throughout the whole project up to that point. Caught during verification, before committing — a reminder that a project's own established conventions are exactly the kind of thing that's easy to slip on under time pressure.

## Stage 5 — Input

Two mechanisms, deliberately kept distinct:

- **`SDL_GetKeyboardState(NULL)`** — returns a pointer to a live-updating array of `Uint8`, one per key, indexed by `SDL_SCANCODE_*`. This pointer is stable for the whole program; call it once, keep reading through it. Used for continuous movement (arrow keys).
- **`SDL_PollEvent`** — a queue you drain, one discrete event at a time, needed every frame. Used for one-off things: the window's close button, and mouse clicks.

```nasm
xor edi, edi
call SDL_GetKeyboardState
mov r15, rax                       ; called ONCE, outside the loop

; each frame:
cmp byte [r15 + SDL_SCANCODE_LEFT], 0
je .no_left
sub dword [player_x], MOVE_SPEED
.no_left:
```

Mixing these up — polling for held-key state, or snapshotting for a one-off click — is a real category of bug, not a style choice.

Left-click-to-place used the event-queue path, reading the mouse button's payload out of the same buffer once `event.type == SDL_MOUSEBUTTONDOWN` — field offsets looked up via the same "compile a C probe" technique from Stage 3, not guessed:

```c
printf("offsetof button = %zu\n", offsetof(SDL_MouseButtonEvent, button)); // 16
printf("offsetof x      = %zu\n", offsetof(SDL_MouseButtonEvent, x));      // 20
printf("offsetof y      = %zu\n", offsetof(SDL_MouseButtonEvent, y));      // 24
```

Each click appended a permanent obstacle-marker to a growing `.bss` array — the first taste of "input that mutates persistent simulation state," not just moves something that was already there. Direct rehearsal for the capstone's weapon pickups.

## Stage 6a — The capstone core loop

This is where the project shifts from "one object" to "an array of structs, looped over." A `Soldier` struct:

```nasm
struc Soldier
    .x:        resd 1
    .y:        resd 1
    .health:   resd 1
    .team:     resd 1
    .weapon:   resd 1      ; 0=knife 1=pistol 2=shotgun
    .state:    resd 1
    .target:   resd 1
    .cooldown: resd 1
endstruc
```

...spawned into two lines (8 per team), each drawn as a small colored square. `find_nearest_enemy` scans the opposing team, ranking candidates by **squared distance** — `dx*dx + dy*dy` orders candidates exactly as well as the true distance would, without ever computing a square root:

```nasm
mov eax, [r10 + Soldier.x]
sub eax, [rbp + FNE_MY_X]
imul eax, eax
mov ecx, eax

mov eax, [r10 + Soldier.y]
sub eax, [rbp + FNE_MY_Y]
imul eax, eax
add ecx, eax                       ; ecx = dist_sq

cmp ecx, [rbp + FNE_BEST_DIST]
jge .scan_next                     ; strictly smaller only
mov [rbp + FNE_BEST_DIST], ecx
```

Combat added `rand()`/`srand()` from libc (called via `extern`, same pattern as SDL — no headers, just the real function signatures), an attack-cooldown field (without it, two soldiers in range would resolve a fight within a single 1/60-second frame), and a win check that freezes the sim and prints the result with a raw `write()` syscall.

### Bug hunt #1: the "team 0 always wins" mystery

Running the combat sim once looked fine. Running it a dozen times in a row did not: **team 0 won 11 of 12 games.**

The cause: soldiers were always processed in a fixed loop order (team 0, indices 0-7, before team 1, indices 8-15), every tick. When two soldiers were mutually in attack range on the same tick, whoever's turn came first in the loop struck first — and if that killed its target, the target's own turn later in that *same* tick never happened, because the dead-check at the top of the loop skipped it. Team 0 always went first, so team 0 always got the first strike, in every mutual engagement, for the entire fight.

**First fix attempt** — alternate which end of the soldier array gets processed first, toggled once per tick:

```nasm
xor dword [pass_reverse], 1     ; flip for next tick
```

This made things *worse*: team 1 then won 9 of 10. The reason took a moment to find: `KNIFE_COOLDOWN_TICKS` is 30, an **even** number, so a soldier's attack always lands back on the same tick parity it started on, forever (30 mod 2 == 0). A period-2 alternation *resonates* with any other even period in the simulation instead of averaging it out — it just swapped which fixed parity, and therefore which team, was permanently favored.

**The actual fix** — pick the direction with `rand()` once per tick instead of a deterministic toggle:

```nasm
call rand
and eax, 1
mov [pass_reverse], eax
```

A random choice has no period, so it can't resonate with anything. Verified afterward across a fresh 12-game batch: 4 wins for team 0, 8 for team 1 — well within normal variance for an actually fair fight.

**The lesson, worth stating plainly:** a consistent, lopsided outcome from a "random" simulation is a signal to go looking for deterministic structure hiding behind the randomness — and a fix that just relocates the bias isn't a fix. Single test runs cannot catch this class of bug; only running the same simulation repeatedly and looking at the *distribution* of outcomes can.

### Weapon pickups

A `Pickup` struct array (same pattern as `Soldier`), four fixed spawns near the field's center. An unarmed soldier compares squared distance to its nearest active pickup against squared distance to its nearest living enemy, and goes for whichever's closer:

```nasm
cmp dword [rbp + US_TARGET], -1
je .use_pickup_goal                    ; no living enemy at all -- pickup wins
...
cmp ecx, edx                           ; ecx=pickup_dist_sq, edx=enemy_dist_sq
jl .use_pickup_goal
jmp .use_enemy_goal
```

Once armed, combat stats depend on weapon: pistol trades the knife's guaranteed close-range damage for range; the shotgun has real distance-based falloff, decided by the *actual* distance at the moment of firing, not by whichever range got it into combat in the first place:

```nasm
.atk_shotgun:
    mov eax, [rbp + US_DIST_SQ]
    cmp eax, SHOTGUN_CLOSE_RANGE * SHOTGUN_CLOSE_RANGE
    jg .shotgun_far
    mov r12d, SHOTGUN_CLOSE_DAMAGE      ; 50 dmg, 85% hit
    mov r13d, SHOTGUN_CLOSE_HIT
    jmp .shotgun_cd
.shotgun_far:
    mov r12d, SHOTGUN_FAR_DAMAGE        ; 25 dmg, 40% hit
    mov r13d, SHOTGUN_FAR_HIT
```

An armed soldier that dies drops its weapon back onto the field at its death position, recycling a free `Pickup` slot — it stays in circulation for anyone to grab, matching the original design goal.

## Stage 6b — Obstacles and line of sight

This stage generated more real bugs than everything before it combined — five, found only by testing hard. All five are worth walking through, because each is a genuinely different *class* of bug that looks fine in a single test run, or even looks fine in isolation before the next piece is added.

An `Obstacle` struct (x, y, w, h) placed one wall, split into two segments with a gap in the middle. The movement rule, straight from the plan: before stepping toward a goal, check whether the straight line to it is blocked. If clear, move directly. If blocked, don't pathfind — step perpendicular to the goal direction, try one side then the other, take whichever is clear.

`line_blocked` is literally Stage 3's `draw_line`, with `set_pixel` swapped for a per-step obstacle check and an early return the moment any step is blocked:

```nasm
.step_loop:
    mov edi, [rbp + LB_X0]
    mov esi, [rbp + LB_Y0]
    call is_box_blocked
    test eax, eax
    jz .not_blocked_here
    mov eax, 1                    ; blocked -- return immediately
    mov rsp, rbp
    pop rbp
    ret
.not_blocked_here:
    ; ... same Bresenham stepping as draw_line ...
```

### Bug #1: a crash from an unclamped side-step

The perpendicular side-step applied a raw `add`/`sub` to `Soldier.x`/`y` with no bound of its own — unlike the normal clamped-toward-goal move, which never wanders off-screen because goals are always on-screen. With a wall segment sitting right at the top edge (`y=0`), a soldier repeatedly routed "up" around it walked into negative `y`, and `fill_rect`'s `row * pitch + col * 4` write only clips the *far* edge (a documented precondition from Stage 3, silently violated here) — corrupting the write address into unmapped memory:

```
Thread 1 "01_obstacles" received signal SIGSEGV, Segmentation fault.
fill_rect.col_loop () at 01_obstacles.asm:1367
1367	    mov dword [r10 + r8], r9d
```

**Fix:** `is_box_blocked` also treats anything off the `SCREEN_W x SCREEN_H` field as blocked, since every side-step decision already funnels through it.

### Bug #2: a regression in the fair-turn-order fix

While building this stage, `stage6a/04_weapons.asm` had been rewritten "fresh" at one point, and the `call rand` / `and eax, 1` / `mov [pass_reverse], eax` line — the fix from the bug hunt above — silently went missing. `pass_reverse` was still declared, still *read*, just never *written*, so it stayed permanently 0 and team 0's original first-strike advantage came right back. Already committed and pushed to GitHub before anyone noticed.

**Caught by** the same discipline as before: running the game repeatedly and tracking the win distribution. A 4-run batch showed 1 team-1 win out of 4 — plausible-looking, actually just unlucky enough to mask an 80-90% structural bias. A larger batch (10, then 24 total) made it unmistakable.

### Bug #3: a symmetry mismatch, amplified by the wall

Even with `pass_reverse` fixed, the obstacles build was winning **24 of 24** test games for team 0. This one took real digging (see the "how this was actually debugged" section below for the full method). The cause: soldiers spawn with **left-right mirror symmetry** — both teams use identical row y-values. The four pickups, though, were placed with **180-degree rotational symmetry** instead:

```nasm
; pickup 0: (300, 200, PISTOL)   -- west, top
; pickup 3: (500, 400, PISTOL)   -- east, bottom  <- rotational mirror of 0, not left-right
```

That meant team 0's top rows picked up pistols, while team 1's *matching* top rows — same y, same distance, the soldiers who actually fight each other — picked up shotguns. A genuinely asymmetric matchup, not a coincidence. Combined with the wall's processing delay for rows stuck near it (regardless of team), whichever side's delayed, exposed rows held the longer-ranged pistol could snipe the other side's shotgun-wielders, who couldn't shoot back from that distance.

**Fix:** make weapon *type* mirror left-right too — both top pickups pistols, both bottom pickups shotguns, matching the spawn layout's actual symmetry:

```nasm
mov dword [r10 + 1*Pickup_size + Pickup.type], WEAPON_PISTOL   ; was WEAPON_SHOTGUN
...
mov dword [r10 + 3*Pickup_size + Pickup.type], WEAPON_SHOTGUN  ; was WEAPON_PISTOL
```

Verified afterward with a fresh batch: 10 of 21 for one obstacles-file run, 12 of 24 on the weapons file — both consistent with an actually fair fight.

### Bug #4: a collision check that only tested a point

Visually — just from watching the window — soldiers could walk partway *into* wall segments before stopping. The collision check tested only the soldier's tracked `(x, y)` corner, not the `SOLDIER_SIZE x SOLDIER_SIZE` box `fill_rect` actually draws, so up to 15 pixels of the soldier's visible body could overlap an obstacle before the tracked corner itself registered as blocked.

**Fix:** rewritten as a proper box-vs-box (AABB) overlap test:

```nasm
; NOT overlapping (skip this obstacle) if the soldier box is
; entirely left of, right of, above, or below the obstacle box
mov eax, edi
add eax, SOLDIER_SIZE
cmp eax, [r10 + Obstacle.x]
jle .iio_next                        ; soldier box entirely left of obstacle

mov eax, [r10 + Obstacle.x]
add eax, [r10 + Obstacle.w]
cmp edi, eax
jge .iio_next                        ; soldier box entirely right of obstacle
; ... same for y ...
```

Verified with direct unit tests right after `spawn_obstacles` in `main`, printing results via a raw `write()` syscall (gdb can't cleanly call hand-written asm functions like typed C functions without extra ceremony, so this was more reliable):

```nasm
mov edi, 355          ; box [355,371) -- overlaps obstacle starting at x=370
mov esi, 100
call is_box_blocked
; expected 1, got 1

mov edi, 350           ; box [350,366) -- right edge 366<=370, entirely clear
mov esi, 100
call is_box_blocked
; expected 0, got 0
```

### Bug #5: a permanent 2-tick oscillation

Adding line-of-sight for ranged attacks (file `02`) surfaced the nastiest bug of the session. `01` alone always resolved fights in 10-20 seconds. With LOS added, fights started taking 90+ seconds — some never finished at all.

Debugging this took several layered attempts:

1. A coarse position sample (soldier's x/y once a second) showed a soldier frozen at `(286, 0)` for 12+ seconds straight — looked like a plain deadlock.
2. Adding a "which code branch fired last" trace character alongside the position showed the trace alternating between "moved up" and "moved down" — but the position itself wasn't moving. That was the first hint this wasn't a freeze at all.
3. **Tracing every single tick** (not sampled) for a short window was what actually cracked it:

```
S0 x=286 y=000 hp=100 wp=1 br=U atk=085
S0 x=286 y=002 hp=100 wp=1 br=D atk=068
S0 x=286 y=000 hp=100 wp=1 br=U atk=085
S0 x=286 y=002 hp=100 wp=1 br=D atk=068
S0 x=286 y=000 hp=100 wp=1 br=U atk=085
... (repeats forever)
```

A perfect, permanent 2-tick oscillation. The side-step always tried "up" first, unconditionally. At `y=0` (the screen edge), "up" is blocked, so it falls back to "down" and moves to `y=2`. At `y=2`, "up" is no longer blocked — `y=0` is back on-screen — so the very next tick it takes "up" again, immediately undoing the step it just made. Forever. `01` alone mostly dodged this because a soldier could often resolve combat *through* a wall before ever getting trapped at exactly that boundary; adding LOS forced every ranged soldier to actually complete the physical detour, making the trap both more likely to hit and impossible to escape once caught.

**Fix:** give each soldier a sticky direction preference instead of a hardcoded "always try up/left first":

```nasm
struc Soldier
    ; ...
    .avoid_dir: resd 1   ; 0 = prefer up/left first, 1 = prefer down/right
endstruc
```

```nasm
mov eax, [r10 + Soldier.avoid_dir]
test eax, eax
jnz .prefer_down

cmp dword [rbp + US_NEG_BLOCKED], 0
jne .fallback_down
mov dword [r10 + Soldier.avoid_dir], 0      ; up worked again -- keep preferring it
sub dword [r10 + Soldier.y], MOVE_SPEED
jmp .update_next
.fallback_down:
cmp dword [rbp + US_POS_BLOCKED], 0
jne .update_next                            ; both blocked -- hold position
mov dword [r10 + Soldier.avoid_dir], 1      ; up failed, down worked -- switch preference
add dword [r10 + Soldier.y], MOVE_SPEED
```

Once a direction starts working, the soldier keeps trying it first on future ticks, only switching if that direction stops working too — breaking the flip-flop entirely. Verified by re-running the exact same per-tick trace (clean monotonic movement, zero oscillation) and confirming fight times dropped back to 9-14 seconds across repeated runs, with zero crashes. The same flawed logic had originated in file `01`, so the identical fix went into both files.

## How this was actually debugged: the methods that mattered

A few techniques did most of the real work this session, worth naming explicitly since none of them are "just use gdb":

**Repeated-run statistics, not single playthroughs.** Both fairness bugs (the iteration-order bias and the symmetry mismatch) were invisible in one game, and *nearly* invisible in a 4-game batch by sheer luck. The only reliable signal was running 10-24 games in a row and counting the win split.

**Direct unit tests via a raw `write()` syscall**, inserted temporarily right after a function's normal call site:

```nasm
mov edi, 100
mov esi, 80
mov edx, 700
mov ecx, 80
call line_blocked
add eax, '0'
mov [test1_result], al
mov eax, 1
mov edi, 1
lea rsi, [test1_msg]
mov edx, test1_msg_len
syscall
```

This was more reliable than trying to get gdb to call hand-written asm functions the way it calls typed C functions, and gave an unambiguous expected-vs-actual answer for exact boundary cases.

**A small C probe compiled against the real headers**, whenever a numeric constant or struct offset mattered (pixel formats, scancodes, event struct field offsets) — cheaper than debugging a wrong hand-computed constant an hour later, and used repeatedly across Stages 3, 5, and implicitly throughout 6a/6b.

**Per-tick tracing, not sampled tracing, once something looks "stuck."** Sampling once a second turned a perfect 2-tick oscillation into what looked like a plain freeze. Only tracing every single tick for a short window revealed the actual cycle.

**A couple of genuine self-inflicted debugging bugs**, worth naming since they cost real time:

- A raw `syscall` clobbers `rcx` and `r11` (the instruction's own mechanism for saving return state) — a debug print stuffed into the middle of existing code corrupted `r11` while it was still holding a live pointer the surrounding code needed, causing a crash that looked completely unrelated to the actual change.
- Placeholder-string offset bugs — searching a debug message string like `"DIED team=T weapon=W"` for the letter `T` to compute a write offset, when the message *also* contains a `T` earlier in "victimTeam." Fixed by using an unambiguous placeholder character (`?`) and computing offsets with a one-line Python snippet instead of counting by hand.

## What's left

Stages 0 through 6b are done. Stage 6c — scaling from 8v8 to 50v50 — is the only remaining item on the original roadmap, expected to be mostly "bump `NUM_PER_TEAM`, confirm nothing else needs to change" (the whole project was already written in terms of `TOTAL_SOLDIERS`/`NUM_PER_TEAM`, not hardcoded team sizes, specifically to make this painless), plus re-running the same fairness/crash-safety verification discipline at the new scale rather than assuming what held at 8v8 automatically holds at 50v50.
