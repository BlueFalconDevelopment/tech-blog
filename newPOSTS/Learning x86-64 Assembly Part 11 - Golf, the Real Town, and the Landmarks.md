# Bare Metal Deathmatch XI: Golf, the Real Town, and the Landmarks

2026-10-20 · @Someone

<YouTubeEmbed id="01KciMaf330" title="Of Malice and the Magnum Heart (Full Album) - Misery Signals" />

## Previously

[Part 10](/blog/bare-metal-deathmatch-10) brought trouble to town (the cartel, the good ole boys, street events), a controller for the whole game, and two minigames in a first-person Mode 7 view: racing and fishing.

This post covers three steps, 10.35 to 10.37:

- **10.35:** golf at Runway Nine, the last of the planned minigames
- **10.36:** the businesses where the real ones are
- **10.37:** the real landmarks, each with a use, and waking up at the Lawton Indian Hospital when you die

Repo: private now — this project is on its way to becoming a game on Steam.
(`stage10/35_golf` to `stage10/37_landmarks`)

## 10.35: Golf at Runway Nine

There's a real nine-hole course by the airport. Only its north-east corner is on the map: 444 by 307 px, about 810 by 560 m, with roads to the north and east, the army post's fence to the west, and the map's edge to the south. So Claude laid the nine holes out by hand inside it at real lengths, 2,880 m and par 35, and I looked over the plan first (*"seems good"*).

My picks for the golf:

- **The swing:** the classic three-click meter. Press to start it, press to set the power, and press again on the snap line. Early hooks, late slices.
- **The golf:** club choice, wind, lies that matter, and sloped greens. All four.
- **Between shots:** the camera follows the ball, then cuts to behind it.
- **The money:** $100 to play nine. Par gives your $100 back, and each stroke under pays $75 more. Over par, it's gone. Practice is free.
- **The prize:** a run of holes in one wins a ride, and a caddie comes with it.

It was built in three parts, each play-tested.

## The course and the swing

The map generator draws the course into the city: rough, fairways, tees, greens with a fringe, 21 bunkers, three ponds and 176 trees. It also writes a **lie map** for the game: a byte for every quarter pixel saying what the ball's sitting on (out of bounds, rough, fairway, green, tee, sand, water, fringe). That's 2.2 MB.

In the game the course is built once at 4 texels a map pixel, the fairway mown in squares and the green in stripes, and drawn in fishing's Mode 7 view, 6 px behind the ball with the eye 3 px up. The trees stand up as billboards, every hole's flag stands at its pin, and a tracer follows the ball.

**The flight is in floats:** 60 to 180 ticks in the air by the power, curving by the swing, then bounces and a roll, each by the lie. Sand stops the ball dead, the rough soon, the green least.

![A tee with the hole map top right and the wind disc top left](/images/bare-metal-deathmatch/golf_tee.png)

My first play test: *"couldnt get into the minigame. no prompt showed up."* The prompt only came up on foot, fishing's rule, and the test bot had opened golf directly, so it never noticed. Riding works too now, like the raceway.

The second: *"the meter's speed needs to be slowed down it seems unfair,"* and I asked for *"either a line showing where your ball is going to land or a minimap that shows a predictive line."* I got both: dots on the ground out to where a full shot of the club lands, and a hole map in the corner, turned along the hole, with your ball, the pin and the line out to the landing spot.

The third: *"There is a little stutter in the image as the camera follows the ball though."* This one took measuring. The camera's heading came from the game's integer angle lookup, which works in 1/256ths, and near the best angle about 12 headings tied. So the camera sat still, then lurched. Logged a tick at a time, it was still for 70 ticks, then jumped 12, 9, 7. The fix was a real atan2 in floats, with the camera turning a quarter of the way toward it each tick. *"camera is smooth."*

## Wind, lies and sloped greens

- **The lie** cuts a full shot's carry: the rough 20%, the sand 45% (the sand wedge only 10%), the fringe 5%. The scoreboard says "IN THE ROUGH: -20%".
- **Trees:** hit the leaves or the trunk and you get "IN THE TREES!", with the ball knocked back.
- **The wind** is 0 to 25 mph from any way, new on each tee. A disc in the corner shows which way it blows as you look.
- **The greens slope,** and putting, the hole map zooms to the green with an arrow downhill every so often.

![Putting: the hole map zoomed to the green, its slope arrows](/images/bare-metal-deathmatch/golf_putt.png)

My note: *"wind feels good but I think we need arrows for the wind and green directions. It's kind of hard to read as a human."* Each had been a line with a dot at its tip. Now they're real arrows, 2 px thick with a V head. *"arrows are easy to read."*

![The card after nine: one under par, $175 won](/images/bare-metal-deathmatch/golf_card.png)

## Fifty holes in one, the cart and the Caddie

The prize was ten holes in one, until I played: *"can we up the amount of holes in one to get the legendary to 50? some of these holes are kind of easy to get a hole in one."* So it's fifty, counted in rounds for money only, since practice lets you repeat a hole for free. The count is saved.

The fiftieth wins **the Hot-Rod Golf Cart**: short and boxy, red, fat back tyres, a chrome V8 blower through the front, side pipes, and the Caddie's bag of clubs on the back. It's a seventh ride, never for sale, with the car's speed, the best acceleration and the tightest turn in the game, and room for three jobs because **the Caddie** carries one. Out in a shift on the cart, he hands you 50 health once a minute if you're hurt, or a fresh bag of ammo if you're not.

![50 HOLES IN ONE! THE HOT-ROD GOLF CART IS YOURS](/images/bare-metal-deathmatch/golf_win.png)

My play test: *"cart felt good. can we have the caddie shoot from his side as well?"* He does now: every 45 ticks, at the nearest of your enemies in sight, 60% to hit. His kills count as yours. *"he feels about right."*

![The Hot-Rod Golf Cart in town, the Caddie aboard](/images/bare-metal-deathmatch/golf_cart.png)

The code review found nine things, all fixed. One I liked: the shop counted the won rides with `popcnt`, the first use of that instruction in the code, and on a CPU without it the shop would crash. It's a `bt` and an `adc` now.

## 10.36: The businesses where the real ones are

My ask: *"put the fake businesses where the real businesses are."* OpenStreetMap had too few of them, so Claude looked up the real chains' store locators and directories, and turned each street address into a point with the US Census geocoder. Only our made-up names and the points go in the repo.

- **19 brand places,** as many as the real town has of each: five Wacky D's, four Crotcho Smells, three Queen Burgers and so on. Bibsons stands at its old store on Lee Blvd, closed in 2003.
- **43 Circle-Stripes** convenience stores (there were 8), at every real convenience store whatever its chain.
- **Corners crowd** like the real ones. Lee and 11th has a Queen Burger, a Wacky D's, Bibsons and two Circle-Stripes.

That crowding found a bug: the names over the doors overlapped. Now each name's box is kept for the frame, and a name that would land on one already drawn moves up a line, and again, until it's clear. The places you're standing at go first, so your own name stays over your own door and the others stack above it.

![Lee and 11th: the names stacked over their doors](/images/bare-metal-deathmatch/town_names.png)

## 10.37: The landmarks

The town had businesses and houses, but none of the places you'd give directions by. I picked them: the downtown civic block, the Elmer Thomas Park area, the college and the hospitals, the mall and the casino. Public places keep their real names, and I named the rest: SOUTHWEST UNIVERSITY, ST. COPAY'S, THE MALL, INDIAN CASINO. Seventeen in all.

Each got a use, or was scenery:

- **Police HQ:** bounties.
- **The library:** the lore, later.
- **The university:** classes.
- **The Lawton Indian Hospital:** where you wake when you die.
- **The casino:** a minigame, its own step (Part 12).

![The first landmarks downtown: boxes with a sign on the roof](/images/bare-metal-deathmatch/landmarks_boxes.png)

For now each one was a box of a set size with a sign painted on its roof: a dome, bars, a star, books, a red cross. My verdict on the looks was that they're *"not true to real life,"* and *"we can leave that for later."* Later turned out to be Part 12.

## Waking up at the Indian hospital

For the lore, I decided the courier is Comanche. So dying no longer ends your shift. After a three-second countdown, you wake up at the **Lawton Indian Hospital's** door with full health and ammo and your ride brought round, and the shift goes on. The job line says "YOU WOKE UP AT THE LAWTON INDIAN HOSPITAL". You lose the packages you were carrying, but there's no cash penalty any more.

![Awake at the Lawton Indian Hospital's door](/images/bare-metal-deathmatch/indian_hospital.png)

## Classes and bounties

**Southwest University** sells three classes, paid for and yours at once:

- **Business:** deliveries pay 10% more a level.
- **First Aid:** weed heals 20 more a level.
- **Marksmanship:** your shots do 10% more a level.

![Southwest University's classes](/images/bare-metal-deathmatch/classes.png)

**Police HQ** keeps a tab. Every Big Homie you kill puts $125 on it, and every cartel hitman $12. The tab's saved between shifts until you cash it in at HQ's door. The hard part was finding every place a kill of yours is counted: your gun, a ram, a grenade and the Caddie. Each one calls the bounty check now.

## What I learned this time

- **A float can be the simple answer.** The camera's stutter came from the integer angle lookup's ties, and a real atan2 fixed it outright.
- **A bot that skips the front door misses the front door's bugs.** The golf test opened the minigame directly and never saw the missing prompt.
- **Generous numbers come from playing.** Ten holes in one sounded rare until I'd played the course.
- **Crowding finds layout bugs.** Putting businesses where the real ones are is what showed the overlapping names.
- **A new instruction is a new requirement.** One `popcnt` would have made the game need a newer CPU.

## What's next

- **The casino,** with four games.
- **The landmarks' real looks.**
