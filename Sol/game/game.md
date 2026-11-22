Below is the code of your two previous works: a showcase of the aircraft and crews of four races, and a steampunk world. Combine them into a complete game — aerial combat. A single HTML file using Three.js that runs by simply opening it in a browser, no external assets.

[paste the code from Test 1]
[paste the code from Test 2]

Gameplay:
- A race selection screen at the start (humans, dwarves, elves, orcs) with an aircraft preview.
- Four teams of three aircraft, 12 in total. The player controls one aircraft of their race; the other two on the team are allied bots. The other three teams are bots, and they fight not only the player but each other too. Everyone within a team is allied.
- Each aircraft has a pilot and a gunner. The player can switch between them at any time with the C key. When the player is the pilot, the gunner works as a bot and fires at enemies on its own. When the player is the gunner, the pilot becomes a bot and flies the aircraft on its own.
- The pilot fires only the forward-fixed guns. The gunner controls the turret within its firing arc (dwarves on top, elves at the rear, orcs on the side, humans underneath) and fires a more powerful weapon, unique to each race.
- The battle lasts until one team remains. If the player's aircraft is shot down, the camera switches to a surviving ally. A victory or defeat screen with a restart button.

Pilot controls: mouse — flight direction, W/S — throttle, A/D — roll, LMB — fire. Gunner controls: mouse — aim the turret, LMB — fire. Controls hint on screen.

Mechanics and effects:
- Arcade but convincing flight physics: inertia, banking in turns, maneuverability depending on speed, aircraft stats differ by race.
- Projectiles with tracers, impacts with sparks, overheating or limited ammo.
- Steam and smoke from pipes, a smoke trail from damaged aircraft, fire, explosions, falling debris.
- Clouds reduce visibility and bot aiming; aircraft can hide in them.
- Collisions with the ground and buildings.
- Bots: target selection, getting on an enemy's tail, evasion, retreating at low health, avoiding terrain.

HUD: health, speed, altitude, weapon status, current role (pilot or gunner), radar or minimap, aircraft remaining per team, kill feed.

Optimization is mandatory: object pooling for projectiles and particles, instancing, minimal draw calls, no object creation inside the game loop. Target a stable 60 FPS with all 12 aircraft. FPS counter in the corner.

Work in stages. Complete each stage fully and make sure the file runs before moving to the next. Do not write everything in one go.
Stage 1: Merge — bring the world and the aircraft/crew code into one file, race selection screen, spawn the player's aircraft.
Stage 2: Flight model and pilot controls, chase camera.
Stage 3: Weapons — forward guns, race-specific turrets, projectiles with pooling, hits and damage.
Stage 4: Pilot/gunner switching with the C key, turret aiming within its firing arc.
Stage 5: Teams — spawn all 12 aircraft, allied and enemy logic.
Stage 6: Bot AI for pilots and gunners.
Stage 7: Effects — steam, smoke trails, fire, explosions, debris; cloud visibility.
Stage 8: HUD, radar, kill feed, win/lose conditions, spectating an ally, restart.
Stage 9: Optimization pass and final check with all 12 aircraft in battle.