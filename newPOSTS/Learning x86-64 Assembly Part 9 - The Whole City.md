# Learning x86-64 Assembly, Part 9: The Whole City

2026-09-29 · @Someone

<YouTubeEmbed id="S2WPyjKTvHM" title="Jet Set 1999 - Keifer Gr33n" />

## Overview

[Part 8](/blog/bare-metal-deathmatch-8) ended with a game that had menus, abilities and an economy, all on one neighbourhood: a city's south side, 3.2 by 1.6 km of real OpenStreetMap streets. My goal from the very beginning had been the whole city. So before the story and the balancing, I asked whether that was even possible.

It was. This post covers seven steps, 10.22 to 10.28:

- **10.22:** the whole city as the map
- **10.23:** deliveries from named businesses
- **10.24:** convenience stores to shop at mid-shift
- **10.25:** the gangs living all over town
- **10.26:** a minimap
- **10.27:** fullscreen
- **10.28:** people on the sidewalks and cars on the roads

And one rename at the end: the city is Lawton, Oklahoma, and the game says so now.

Repo: https://github.com/BlueFalconDevelopment/assembly-simulation (`stage10/22_city` to `stage10/28_civilians`)

## Is the whole city feasible?

Claude measured it before writing any code. The built-up part of the city is about 16 by 12 km, roughly 35–40 times the south side. At the south side's scale (1.56 px per metre) the map would be about 25,000 by 19,000 pixels. The game keeps the whole map in fixed memory, about 7 bytes a pixel for the background, the blockmap and the pathfinding grid, so that's over 3 GB.

That breaks something more basic than performance. The game is linked the plain way, and in x86-64's default code model all static data has to sit within 2 GB, so the addresses fit in 32 bits. A 3 GB map doesn't fit, whatever the machine has.

So the city is squeezed about three times harder: **0.55 px per metre**, 11,104 by 6,704 px, 5.6 times the south side. About 460 MB, well under the limit.

The catch at that scale: real residential streets are about 110 m apart, which is 60 px, and a road is 36 px wide. There's no room left for houses. So the generator **thins the residential streets** to about one in three and keeps every main road. Blocks come out about the south side's size.

![The whole city: the grid downtown, the suburbs, the airport and the raceway at the bottom, the army post fenced off at the top](https://raw.githubusercontent.com/BlueFalconDevelopment/assembly-simulation/main/docs/city.png)

## 10.22 — The whole city

The thinning took three tries, each fixing what the one before got wrong:

- **Keep a street if it's far from the streets already kept.** Almost nothing survived. OpenStreetMap splits a street at nearly every crossing, into pieces shorter than a block, and short pieces were thrown out.
- **Join the pieces into whole streets first.** Now the east-west streets survived and the north-south ones all vanished. Every avenue crosses an east-west street every block, so every point on it counted as "near a kept street".
- **Only count kept streets running the same way.** That gave a clean grid.

A dropped street doesn't just disappear. A row of houses goes where it was, back to back, so each neighbourhood keeps its real shape. Out in the country, where there's less than 4 km of street per square km, a lot only gets a house 6% of the time: a farmhouse now and then along the section roads.

The army post in the north is **fenced shut**. The fence runs across its roads too, and the inside is filled with invisible blocking props. Without them the ground in there would still count as walkable, and the player's spawn, which picks any walkable spot, could have started you inside a sealed army post.

The engine barely changed: the map size comes from the generated include file. One thing did break. Watch mode's police drove "lanes", roads running straight across the whole map, and the city has none. A random pick from an empty table would have divided by zero. One flag sends watch mode's police onto the road network the game already used.

The cost: a watch-mode war went from 1.6 s to 12 s headless, since the pathfinding has 5 times the cells to search. That's still about 2.5 ms of game logic per tick, and a frame at 60 fps has 16.7.

The play tests were about looks:

- *"The lines in the middle look a little weird in places."* A divided road is two ways a few metres apart, so it got two rows of dashes, and every slightly bent piece of road wobbled. Now each straight stretch is one line at its median, the two halves of a divided road merge, and the dashes keep one rhythm across the whole map and stop at crossings.
- *"Make sure no houses and structures clip into the roadways."* I'd assumed none did. A measure of every wall and prop against the road pixels said the walls were fine. But houses were sitting on real **parking lots**, which look just like asphalt from above, and in one place the post's fence lay along a sidewalk.

## Planning: a town, not a map

The next session started with a plan. I wanted deliveries to come from real businesses, not any building:

- **Food**, two or three places each: God's Chicken, Good Tacos, Crotcho Smell, Aunt Debbies Indian Tacos, Queen Burger, Wacky D's.
- **Groceries**, one store each: Ballin' World SuperCenter and Bibsons.
- **Convenience stores** throughout the map, Circle-Stripes, to replace the garage as the place to buy goods. The garages stay for repairs and rides.
- **Gangsters spawning from more places.**
- **Minigames later:** racing at a dirt oval west of the airport, fishing in the ponds, and golf by the airport.

One map version holds everything the next three steps need, including the raceway's oval and the golf course, so the map doesn't have to change again when the minigames come.

## 10.23 — The businesses

The generator picks the two biggest real buildings in town for the grocery stores, and the restaurants from the medium-sized buildings on main roads, each chain's places as far apart as possible. The first pick looked wrong: most "restaurants" were real buildings smaller than the houses around them. So a restaurant has to be at least house-sized now. Where the city ran out of those, the generator builds a small one on a free lot by a main road.

Each brand gets its roof colours and a sign by the door, and the game writes its name over the door. The job board reads `1) QUEEN BURGER $34 !!`, and picking up says `PICKED UP AT AUNT DEBBIES INDIAN TACOS`.

![Every brand's places, and the Circle-Stripes stores](https://raw.githubusercontent.com/BlueFalconDevelopment/assembly-simulation/main/docs/businesses.png)

Two small things. The font had no apostrophe, so "GOD'S" would have drawn as "GOD S". And job distances had been reading three times too long since 10.22, because the code still used the south side's pixels per km.

## 10.24 — Circle-Stripes

Eight stores, white roofs with red stripes. ENTER at one opens the shop's gear and guns pages, and your ammo is topped up on the way out. The garages keep rides (buy one or switch) and the repair at the door. The shop now knows which counter you're at, and shows only that counter's pages.

The test that found the stuck van in Part 8 ran again, because the garages had moved with the new map: the van got stuck 0 times out of 75. The same idea tested the stores: every spot you can press ENTER from, 200 in all, opens the right store.

## 10.25 — Eight homes

In game mode, every one of the map's eight apartment complexes is lived in now, four per gang, and each member respawns at its own. Three tables replace "the gang's home" everywhere: who owns each site, each soldier's home, and this game's gun pickups. Watch mode fills them the old way, one home per gang, and its wars came out byte for byte the same.

Houses with a gangster within 450 px went from 49% to 56%. The kill split over 24 test wars was 48/52, but one gang was ahead in 22 of the 24, which is too lopsided to be chance. It turned out to be the test seeds. The coin that decides which gang gets which four homes came up 0 for every seed from 1 to 24: xorshift's first numbers after a tiny seed aren't well mixed. So the same gang always got the same homes, and a small difference between the two sets of homes looked like a difference between the gangs. Real games seed from the clock.

## 10.26 — The minimap

For filling the town I picked, in order: a minimap, civilians and traffic, then new trouble.

The minimap is a 240 by 150 picture in the corner. The generator draws the whole map at 1/16 scale as the game's pixel format, and each frame the game copies the window around you and draws on it: the stores, garages and dispensaries, every gangster and Biker, the police car flashing, your jobs, and you. After the play test (*"the minimap marker for deliveries should be a little more easy to see"*) the job markers got bigger, got a dark rim, and flash.

![The minimap in the corner, with a job's marker pinned to its edge](https://raw.githubusercontent.com/BlueFalconDevelopment/assembly-simulation/main/docs/minimap.png)

## 10.27 — Fullscreen

*"I dont know if we can do this now but it would be nice to be able to fullscreen this game."* F11. The game still draws 1280 by 784, and one SDL call scales that to the screen, letterboxed. The only thing that needed care was the mouse: SDL reports it in window pixels, so your aim would drift once the picture was scaled. It's converted back into the game's pixels now, and a test with the window doubled in size put the window's middle exactly at the game's middle.

## 10.28 — People and traffic

Just flavour, I decided: nothing happens if you hit a civilian.

- **28 people** walk the sidewalks. They run from gangsters and get knocked down by your ride for a few seconds.
- **8 cars** drive the roads. They use the police car's driving code without a copy of it: each car's state is swapped into the police car's variables for its tick, and swapped back out. So they turn at crossings, stop for you, and turn around if you stand there.

They only exist around you: they appear just outside the camera's view and vanish when they're far away. The first version used the police's "700 px away" rule for appearing, and at the normal zoom you'd almost never have seen one.

A frame of the test caught a bug from 10.23: with three long business names, the job board ran into the shift clock. The distance came off the board, since the minimap shows where the job is. And after the play test: *"We should not use kilometers because this place is in america."* Distances are in miles now.

![People on the sidewalks and a car coming up the road](https://raw.githubusercontent.com/BlueFalconDevelopment/assembly-simulation/main/docs/town.png)

## Lawton

Until now I'd kept the city's name out of everything: the code, the commits, these posts. I looked into it, and the name and the street names are fine to use. Real-world trademarks aren't, which is why every business in the game is made up.

So the map is called Lawton, the raceway is the Lawton Raceway, and the real street names went back into the map data. They had been stored as one-way hashes, so they came back by downloading the city again and matching each name to its hash. All 1,054 matched, and the regenerated map came out byte for byte the same apart from its name.

## What I learned this time

- **Measure before you promise.** The whole-city question had a real answer, including a hard limit (2 GB of static data) that no amount of optimising would have got around.
- **A rule that works at one scale can be wrong at another.** "Keep a street if it's far from the others" was fine until crossing streets counted as close.
- **Measure what the player sees, not what you think you placed.** No house touched a road, but houses sat on parking lots, which look like road.
- **A small test seed isn't random.** Twenty-four seeds all gave the same coin toss, and that looked exactly like a biased game.
- **Reuse can mean borrowing state.** Traffic got the police car's driving for free by swapping each car into its variables for a tick.

## What's next

- **Trouble:** the cartel's hit squad, the good ole boys in a pickup truck, and street events by district.
- **The minigames:** racing at the Lawton Raceway, fishing, and golf.
- **The story,** and then a balance pass.
