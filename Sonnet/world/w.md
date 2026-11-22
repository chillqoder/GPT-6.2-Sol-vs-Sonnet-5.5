Create a single HTML file using Three.js (loaded via importmap from a CDN) that runs by simply opening it in a browser. No external models or textures: build everything procedurally.

Task: a large steampunk fantasy world where aerial battles will later take place. For now, only the world and a free camera are needed, no gameplay.

The world is divided into four race zones, with fields, hills and a river with bridges between them:
- Dwarves: mountains with factories, smoking chimneys, mines, smelters and glowing furnaces.
- Elves: a forest of giant trees and elegant towers, with walkways between them.
- Orcs: scrap metal junkyards, crude welded structures, bonfires, rusty cranes.
- Humans: a city of brick and brass with a clock tower, airship mooring masts, rooftops and chimneys.

Sky:
- Day/night cycle: the sun and moon move, sky color and lighting change, stars at night, lights turn on in windows and street lamps. A slider to set the time of day manually and a button to speed up time.
- Clouds at different altitudes that you can fly through and hide in (visibility drops inside a cloud).
- Several slowly drifting airships.

Camera: free flight. Mouse to look, WASD to move, Q/E down/up, Shift to boost. Controls hint on screen.

Performance matters: use instancing for repeated objects (trees, houses, debris), fog for draw distance, keep draw calls low. The world must hold a stable FPS. Show an FPS counter in the corner.

Work in stages. Complete each stage fully and make sure the file runs before moving to the next. Do not write everything in one go.
Stage 1: Base — renderer, terrain with hills, river, free-flight camera, FPS counter.
Stage 2: Day/night cycle — sun, moon, sky colors, stars, time slider and speed-up button.
Stage 3: Human city.
Stage 4: Dwarven mountains and factories.
Stage 5: Elven forest.
Stage 6: Orc junkyards.
Stage 7: Fields, bridges, connecting areas between zones.
Stage 8: Clouds and airships.
Stage 9: Night lighting (windows, lamps, furnaces, bonfires) and optimization pass, final check.