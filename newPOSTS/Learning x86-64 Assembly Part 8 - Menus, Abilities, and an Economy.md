# Learning x86-64 Assembly, Part 8: Menus, Abilities, and an Economy

2026-09-28 · @Someone

<YouTubeEmbed id="TODO" title="TODO - pick the song" />

## Overview

[Part 7](/blog/bare-metal-deathmatch-7) ended with a game: a courier on a bicycle, delivering packages through an endless gang war, with a shop full of guns and rides. What it didn't have was the stuff you'd expect from a game: you couldn't pause it, you couldn't see what you were carrying, the "abilities" were a line in a plan, and every price in the shop was a placeholder.

This post covers five steps, 10.17 to 10.21:

- **10.17:** a pause menu
- **10.18:** an inventory screen
- **10.19:** three abilities: nitro, a smoke bomb and adrenaline
- **10.20:** real prices, carrying more than one package, and garages to shop at mid-shift
- **10.21:** delivery pay, and then, after some honest play tests, a fairer start

It's still all hand-written NASM, one numbered step folder per change. The old last-gang-standing sim still runs underneath as a test harness, and it was **byte-identical** after every one of these steps.

Repo: https://github.com/BlueFalconDevelopment/assembly-simulation (`stage10/17_pause` to `stage10/21_pay`)

## Planning with questions

This batch started with a planning session rather than code. I had a list: a pause function, an inventory button, lore and story. Claude asked me the questions that change the code, one screen of multiple choice at a time:

- **What does pausing freeze?** Everything: the war, the shift clock, the job's clock, the Biker raids.
- **What's in the menu?** Resume, Controls, Options (a placeholder until there's music), and Quit to title.
- **What does quitting cost?** You keep what the shift earned, and the package you're carrying is lost.
- **How does the inventory work?** TAB opens an overlay that pauses the game, and you can equip a weapon from it.

The same session reordered the plan: pause first, then inventory, abilities, the economy, and the story after that.

## 10.17 — Pause

ESC or P pauses a shift. The interesting part was finding everything that moves.

The main loop was easy: while `paused` is set, it skips `update_player`, `update_soldiers` and the tick counter, and `update_game_state` runs the menu instead of the shift clock. The frame still gets drawn (under a dimmed overlay), and since the time of day comes from the tick counter, the day stops too.

But the **render pass had state of its own**. Hit flashes and death falls count down in the drawing loop. Attack effects age inside `draw_effects`, and they stamp blood and shell casings onto the map at set ages. Freeze the age without freezing the stamps and a paused frame would stamp the same casing sixty times a second. So those checks went into the drawing code too. The code review later flagged this as a design smell (game state shouldn't change while drawing), and there's a refactor in the plan for it.

A gdb bot checks it by pressing keys through SDL's own keyboard array: ESC pauses, then 300 frames later every soldier is byte-for-byte the same and the clock hasn't moved.

![The pause menu with QUIT TO TITLE chosen, and the controls page](https://raw.githubusercontent.com/BlueFalconDevelopment/assembly-simulation/main/docs/pause.png)

The frames caught two layout bugs first. One menu row was 15 characters where the table assumed 16, so the rows drifted: "QUIT TO TITLEYOU", ">PTIONS". And the controls page's last line ran under the scoreboard. The font also didn't have a `<`, so it got one.

Then `/code-review` found the real bug: **quitting while dead dodged the death penalty.** You're down for 3 seconds before the shift ends as a death. Pause in that window, pick QUIT TO TITLE, and the shift ended as a clean quit with no cash lost. Closing the window did the same, and that one had been there since 10.08. Now a shift that ends while you're down always counts as a death, however it ends, and ESC won't pause while you're dead.

## 10.18 — Inventory

TAB opens what you're carrying, as another page of the pause:

- **Your HP and money.**
- **Your weapons** with their ammo, and IN HAND by the one you're holding. W/S choose and E takes one in hand.
- **Your gear levels.**
- **Your ride and its health:** riding, parked, or wrecked in red.
- **The package** and its clock.

![The inventory with every gun bought, and again with a wrecked bike and a late package](https://raw.githubusercontent.com/BlueFalconDevelopment/assembly-simulation/main/docs/inventory.png)

The code review on 10.17 had pointed out that the pause menu copied the shop's key handling line for line. With a third menu coming, that became one routine, `menu_keys`: it returns a bit per key that was *pressed* this tick, not held, using last tick's bits to tell the difference. Every menu uses it now. That also fixed a subtle one: the E you press to pick RESUME is still down on the next tick, and without the edge check it would have knocked you off your bike.

The review on 10.18 found that TAB and ESC were folded into one "back" flag, so TAB in the pause menu resumed the game instead of opening the inventory. And the weapon in your hand wasn't listed if it was empty, leaving a blank section.

## 10.19 — Nitro, smoke, adrenaline

Three abilities, each on a key near WASD and a cooldown (my picks, from another round of questions):

| | Key | Does |
|---|---|---|
| Nitro | SHIFT | 2 s at 1.5x your ride's top speed, or a run on foot |
| Smoke bomb | F | a cloud round you, and nobody can target you for 3–5 s |
| Adrenaline | R | under a third of your health: half damage, double fire rate |

Each is a small hook in existing code:

- **Nitro** raises the top speed and acceleration in the vehicle physics. (A faster ride can't skip through a wall: collision checks the whole box at the destination, and the box is bigger than a wall cell.)
- **Adrenaline** halves damage in `armor_damage` and halves your fire cooldown.
- **Smoke** is a skip in `find_nearest_enemy`, the routine every gangster uses to pick a target.

My first play test: *"we need to let the player know which buttons to hit to use the abilities and also maybe a cooldown bar below the ability itself."* The abilities had been a line of text on the scoreboard's first row, which gets replaced by alerts ("THE BIKERS RIDE OUT") at exactly the moments you'd want them. So the scoreboard grew a third row just for them: key and name over a bar. It's green when ready, a yellow bar draining while it's on, and a grey-blue bar filling during the cooldown.

![The shop's ABILITIES page, nitro on, and the ability row in each state](https://raw.githubusercontent.com/BlueFalconDevelopment/assembly-simulation/main/docs/abilities.png)

The code review found that the smoke **didn't hide you from everyone**. The Bikers' guns and the dog each scan for targets with their own loop, and only `find_nearest_enemy` had the check. The fix is one macro, `SKIP_IF_HIDDEN`, used in every scan that can pick you. The dog test shows the difference: placed next to you and made to hunt 20 times, it bit for 420 damage without the smoke and 0 with it. (The police were a false alarm: since 10.09 they never target you.)

## 10.20 — Prices, capacity, and the garages

The economy had three parts, in my balance order: prices first, then package capacity, then pay tuned against the prices.

**Prices.** I picked a pace: everything in the shop, fully upgraded, in about an hour and a half, or 30 shifts. The prices became a curve: cheap first levels, each level about double, and the rides as the milestones.

**Capacity.** The vehicle table has had a capacity column since 10.07 that nothing read. Now it matters: **the car carries two jobs at once and the van three.** Each job gets a slot (A, B, C) with its own pickup, clock and pay. The board stays up while there's room, and each target's marker is labeled with its letter.

![The van carrying two jobs, and a garage's door](https://raw.githubusercontent.com/BlueFalconDevelopment/assembly-simulation/main/docs/economy.png)

Then the play test: *"we need a way to get into the store without dying. I left the store without buying powerups and needed to die to get them."* I picked the **garage** from four options. It was already in the plan, just further down.

- **Three of them,** always in the same places: the business doors nearest the map's west, middle and east, with an orange wrench sign on the roof.
- **ENTER at the door** opens the shop with the shift paused.
- **Coming out,** what you bought works at once, your ammo is restocked, and your ride waits at the door, repaired.

The second play test: *"my vehicle got stuck in the garage after I used it."* The ride was put down centered on you, and a garage door sits right against its building, so a van's 32 px box could land partly inside the wall. The collision code refuses every move out of a wall. My first garage test only tried the exact door spot, which happens to be clear. The test that found it tries every spot you can press ENTER from, 25 per garage, and the van got stuck **29 times out of 75**. The fix searches outward from the door for the nearest spot where the ride fits with room to move off. After it: 0 in 75. (A long run briefly showed two false failures: the courier had been shot dead partway through, and dead couriers don't drive.)

The code review on this step was the most useful yet:

- **A buffer overrun.** The van's job row on the scoreboard could run past the 64-byte string buffer, and the extra bytes landed in the sprite state.
- **Garage spending counted as a loss.** EARNED is money at the end minus money at the start, so buying the van mid-shift made it negative. Printed unsigned, it showed a shift that earned about 4.29 billion dollars.
- **Hidden jobs.** Swapping from the van to the bike at a garage while carrying three jobs showed only one.
- **Garages that moved.** Their placement dodged the dispensaries, which are random, so the garages were only "always in the same places" by luck.

## 10.21 — Pay, and a fairer start

A job paid $10, plus $1 per 60 px, plus $6 per level of danger. I wanted pay to reward four things: danger, distance, speed, and streaks.

The first constants were a guess, and a bot's first offers came back at $81–142, far over the estimate. So a script sampled **2,100 offers**. The average job is 1.8 km, and danger (0 to 5) averages 2.5, but it's mostly 0 or 5. Danger is a real lever. The final numbers:

- **Danger pays $10 a level,** so it's worth as much as distance. The average job is $64, up from $54.
- **A tip:** +25% for delivering inside the tip window.
- **A streak:** +10% for each delivery before it without dying, up to +50%. It shows as "STREAK 3 +30%" in the scoreboard's corner.

![A tipped delivery and a three-delivery streak on the scoreboard](https://raw.githubusercontent.com/BlueFalconDevelopment/assembly-simulation/main/docs/pay.png)

Then the play tests, where I learned more about the game than about the pay. Reading the test save's totals afterwards told the real story: **about one delivery a shift.** I said it plainly:

> "I think that abilities should be free from the beginning. This game is pretty hard right out of the box and I feel like players are going to need all the help they can get early game. Also the gangsters shouldn't be able to shoot you from so far away. It feels kind of unfair. I want it to be difficult but I think we'll be turning people away."

And after the next session: *"I died a lot. Also sometimes the delivery window isn't long enough if I have to evade gangsters too much."*

So the step turned into a difficulty pass:

- **Abilities are everyone's, at full power,** and they're gone from the shop.
- **Gang guns reach you from 150 px at most.** A gang pistol reaches 250 px, and at the normal zoom the screen is 360 px tall, so you could be shot from above or below the screen edge. Now they have to close in where you can see them. Their war with each other keeps the full range, which is how the watch-mode sim stays byte-identical.
- **200 HP** instead of 150, gangs only come after you within 300 px instead of 450, and dying costs 10% of your cash instead of 20%.
- **No delivery clock.** A job's old time limit is now just its tip window. Deliver inside it for the tip; after that you still get full pay. Nothing is ever late.
- **The gang score counters and the POLICE! notice** are gone from the game's scoreboard.

Measuring the range change was its own lesson. The first attempt broke into gdb every time anyone in the war fired at me and measured the distance. Conditional breakpoints on a routine called thousands of times a second made it crawl, and it timed out. The test that worked was small: clear everyone else out of the way, put one gangster with a pistol at a set distance with a clear line of sight, run one tick, and see whether a shot effect appears. Before, it fired at every distance tested, out to 240 px. After, it fires from 150 px and closer and holds at 160, 200 and 240.

The verdict after a full shift: *"Felt a lot better."*

## What I learned this time

- **Test the space, not the point.** The stuck van hid behind a test that tried the one spot I'd thought of. Trying every spot a player could actually stand on found it in one run.
- **A stuck test isn't always a stuck game.** Two "stuck" results were a dead courier. Check what the test itself assumed before trusting a failure.
- **Code review keeps paying.** I ran it on four of these five steps, and it found something every time: a penalty dodge, a buffer overrun, a negative EARNED, smoke that only half worked, and keys that did the wrong thing.
- **Save files are telemetry.** Reading the play-test save's totals after each session (shifts, deliveries, money) showed "one delivery a shift" before I said "I died a lot".
- **Hard isn't the same as fair.** Nothing here made the gangs weaker at fighting each other. It was about seeing the shot coming, and having room to take a detour.

## What's next

- **The story.** The courier is getting a name and a backstory, told through shift intro cards, flavor text on jobs, story beats at milestones, and radio chatter.
- **New trouble:** the cartel's hit teams, and the good ole boys in a pickup truck.
- **A graphics pass,** once the new content has brought its own sprites.
- **Box art, and music** (I'm writing it).
