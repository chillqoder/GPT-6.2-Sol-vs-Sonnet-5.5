/* ======================================================================
   BOOT + MAIN LOOP
   ====================================================================== */
const clock = new THREE.Clock();
const fpsEl = $('fps'), fpsState = { frames: 0, t: performance.now(), fps: 0 };
function updateFps(now) {
  fpsState.frames++;
  if (now - fpsState.t >= 500) {
    fpsState.fps = fpsState.frames * 1000 / (now - fpsState.t); fpsState.frames = 0; fpsState.t = now;
    const i = renderer.info.render;
    fpsEl.innerHTML = `FPS ${fpsState.fps.toFixed(0)} <small>· ${(1000 / Math.max(fpsState.fps, 1)).toFixed(1)} ms · draws ${i.calls} · tris ${(i.triangles / 1000).toFixed(0)}k · ×${perf.ratio.toFixed(2)}</small>`;
  }
}
/* adaptive resolution (kept from the world showcase): trades pixels for a steady frame rate */
const perf = { ratio: renderer.getPixelRatio(), max: renderer.getPixelRatio(), min: 0.55, ceiling: 99, acc: 0, n: 0, calm: 0, cool: 1, age: 0 };
function applyRatio(r) { perf.ratio = r; renderer.setPixelRatio(r); renderer.setSize(window.innerWidth, window.innerHeight); if (MENU.active) applyMenuView(); }
function adaptResolution(rawDt) {
  if (rawDt > 0.5) return;
  perf.acc += rawDt; perf.n++;
  if (perf.acc < 1.0) return;
  const avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0; perf.age++;
  if (perf.cool > 0) { perf.cool--; return; }
  if (avg > 0.0215 && perf.ratio > perf.min) { perf.ceiling = perf.ratio; applyRatio(Math.max(perf.min, perf.ratio * (avg > 0.034 ? 0.78 : 0.9))); perf.calm = 0; perf.cool = 2; }
  else if (avg < 0.0178 && perf.ratio < Math.min(perf.max, perf.ceiling * 0.94)) { if (++perf.calm >= 4) { applyRatio(Math.min(perf.max, perf.ratio * 1.07)); perf.calm = 0; perf.cool = 2; } }
  else perf.calm = 0;
  if (perf.age % 40 === 0) perf.ceiling = Math.min(99, perf.ceiling * 1.08);
}

function frame() {
  const rawDt = clock.getDelta(); adaptResolution(rawDt);
  const dt = Math.min(rawDt, 0.05);
  G.uTime.value += dt;
  if (GAME.paused && GAME.state === 'play') { renderer.render(scene, camera); updateFps(performance.now()); requestAnimationFrame(frame); return; }
  updateEnvIntensity(dt);
  if (MENU.active) updateMenu(dt, G.uTime.value);
  else if (GAME.state === 'play') updateGame(dt, G.uTime.value);
  for (let i = 0; i < updaters.length; i++) updaters[i](dt, G.uTime.value);
  renderer.render(scene, camera);
  updateFps(performance.now());
  requestAnimationFrame(frame);
}

async function boot() {
  try {
    setLoadingMsg('polishing the brass'); await nextFrame();
    ENV_TEX = makeEnvMap(); prepMaterial(vcMatte); prepMaterial(vcMetal);
    for (const r of RACES) { setLoadingMsg(`riveting the ${RACE[r].craft}`); await nextFrame(); TPL[r] = buildTemplate(r); }
    setLoadingMsg('surveying the rooftops'); await nextFrame();
    console.info('[game] solid field stamped:', buildSolidField(), 'structures');
    setLoadingMsg('painting the portraits'); await nextFrame();
    MENU.portraits = renderPortraits();
    TIME.hours = 15.2; TIME.rate = 0.004; setTime(TIME.hours);
    initMenu(); showMenu();
    $('loading').classList.add('done');
    requestAnimationFrame(frame);
    console.info('[game] ready', Object.fromEntries(RACES.map((r) => [r, TPL[r].stats])));
  } catch (err) {
    console.error(err);
    $('loading').innerHTML = '<div>Something jammed in the engine room.<small>' + String(err && err.message || err) + '</small></div>';
  }
}
window.game = { THREE, scene, camera, renderer, TPL, MENU, RACE, solidH, groundH, G, TIME, GAME, INPUT, startBattle, PJ, planeById, WEAP, damagePlane, killPlane, switchRole, TUR, cam, fxExplosion, fxCrash, spawnDebris };
boot();
