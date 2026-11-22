Create a single HTML file using Three.js (loaded via importmap from a CDN) that runs by simply opening it in a browser. No external 3D models or textures: build everything procedurally from geometry and materials.

Theme: steampunk fantasy, aerial combat. Four races, each with its own combat aircraft and a crew of two:
- Humans: brass biplane with a steam boiler, propeller and rivets. Gunner turret underneath.
- Dwarves: heavy riveted armored flyer with thick pipes, copper and pressure gauges. Gunner turret on top.
- Elves: elegant craft of light wood and canvas, dragonfly-like wings, thin brass trim. Gunner turret at the rear.
- Orcs: welded aircraft of scrap metal sheets, spikes, skulls, lots of patches. Gunner turret on the side.

The aircraft must differ strongly in silhouette, proportions, materials and color, so the race is recognizable at first glance. Each aircraft has forward-fixed guns (fired by the pilot) and a separate, more powerful turret (fired by the gunner), plus a cockpit for the pilot and a seat for the gunner. Propellers spin, and steam or smoke comes out of the pipes.

Crew: a pilot and a gunner of the matching race (humans, stocky bearded dwarves, tall slender elves with pointed ears, massive green-skinned orcs with tusks), wearing steampunk gear: flight helmets, goggles, leather, brass.

Interface:
- Top left: four race portraits; clicking one switches the race. Below the selected portrait: the race name, a short description (2–3 sentences) and aircraft stats: speed, armor, maneuverability, firepower.
- Center of the scene: the selected race's aircraft on a steampunk podium.
- To the right of the aircraft: the pilot and the gunner standing in an A-pose.
- Free camera via OrbitControls: rotate, zoom, pan.
- An auto-rotate camera button.
- Smooth transition animation when switching races.

Good lighting, shadows, an atmospheric background. Structure the code so the aircraft and characters are created by separate functions (e.g. createAircraft(race), createPilot(race), createGunner(race)); they will be reused later in a game.

Work in stages. Complete each stage fully and make sure the file runs before moving to the next. Do not write everything in one go.
Stage 1: Scene setup — renderer, lighting, shadows, background, podium, OrbitControls, auto-rotate button.
Stage 2: Humans — aircraft, pilot and gunner.
Stage 3: Dwarves — aircraft, pilot and gunner.
Stage 4: Elves — aircraft, pilot and gunner.
Stage 5: Orcs — aircraft, pilot and gunner.
Stage 6: Interface — race portraits, descriptions, stats, race switching with transition animation.
Stage 7: Polish — propeller and steam animations, details, final check that everything works together.