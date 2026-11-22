/* ======================================================================
   GAME FLOW: spawning, per-frame update order, victory / defeat, restart
   ====================================================================== */
const SOLO = /[?&]solo/.test(location.search);                 // dev switch: only the player's team
function spawnSpot(race, slot) {
  const z = ZONES[race];
  // a loose "vic" formation over the zone, pointing at the middle of the map
  const heading = Math.atan2(-z.x, -z.z);
  const side = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));      // lateral axis of the formation
  const back = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
  const off = [[0, 0], [-1, 1], [1, 1]][slot];
  const x = z.x * .95 + side.x * off[0] * 80 + back.x * off[1] * 70, zz = z.z * .95 + side.z * off[0] * 80 + back.z * off[1] * 70;
  const y = Math.max(solidH(x, zz) + 240, 300 + slot * 25 + (RACES.indexOf(race) * 35));
  return { x, y, z: zz, heading };
}

function startBattle(race) {
  hideMenu(); clearBattle();
  GAME.race = race; GAME.state = 'play'; GAME.over = false; GAME.overT = 0; GAME.t = 0; GAME.lastKillT = 0; GAME.log = [];
  GAME.stats = { kills: 0, shots: 0, hits: 0, time: 0 };
  GAME.playerTeam = RACES.indexOf(race);
  GAME.teams = RACES.map((r, i) => ({ id: i, race: r, color: RACE[r].team, name: RACE[r].teamName, alive: 0, total: 0 }));
  GAME.planes = [];
  for (const r of RACES) {
    if (SOLO && r !== race) continue;
    const ti = RACES.indexOf(r);
    for (let s = 0; s < 3; s++) {
      const p = createPlane(r, ti, s), sp = spawnSpot(r, s);
      p.id = GAME.planes.length;
      placePlane(p, sp.x, sp.y, sp.z, sp.heading);
      initWeapons(p); initBot(p);
      GAME.planes.push(p); GAME.teams[ti].alive++; GAME.teams[ti].total++;
    }
  }
  GAME.player = GAME.planes.find((p) => p.team === GAME.playerTeam && p.slot === 0);
  GAME.player.isPlayer = true; GAME.player.mode = 'pilot'; GAME.player.name = 'You';
  GAME.view = GAME.player; cam.init = false; GAME.flash = 0; GAME.shake = 0;
  camera.clearViewOffset(); camera.fov = 62; camera.updateProjectionMatrix();
  $('hud').classList.remove('hidden'); $('overlay').classList.remove('hidden'); $('end').classList.add('hidden');
  GAME.paused = false; $('capture').textContent = 'Click to capture the mouse · Esc to release'; $('capture').classList.remove('hidden');
  onBattleStart();
  showToast(`${RACE[race].craft} — ${GAME.planes.length === 12 ? 'four teams, twelve aircraft. Last team flying wins.' : 'solo test'}`, 4);
}
function clearBattle() {
  for (const p of GAME.planes) { scene.remove(p.obj.root); }
  GAME.planes = []; GAME.player = null; GAME.view = null;
  for (let i = 0; i < PJ.N; i++) PJ.alive[i] = 0; PJ.nAlive = 0;
  onBattleClear();
}
function onBattleStart() { if (!pjMesh) initProjectileRender(); fxReset(); resetHud(); }
function onBattleClear() { }

/* ---- dying aircraft: tumble, burn, explode on impact ---- */
function updateDying(a, dt) {
  a.dyingT += dt;
  a.vel.y -= 26 * dt; a.vel.multiplyScalar(1 - .08 * dt);
  _de.set(a.spin.x * dt * .5, a.spin.y * dt * .5, a.spin.z * dt, 'XYZ'); _dq.setFromEuler(_de); a.quat.multiply(_dq).normalize();
  a.pos.addScaledVector(a.vel, dt);
  a.fwd.set(0, 0, 1).applyQuaternion(a.quat); a.up.set(0, 1, 0).applyQuaternion(a.quat);
  a.speedKmh = a.vel.length() * 3.6;
  if (terrainCheck(a) || a.dyingT > 9) { a.dying = 0; a.gone = true; a.obj.root.visible = false; fxCrash(a); }
}

/* ---- aircraft vs aircraft ---- */
function collidePlanes() {
  const P = GAME.planes;
  for (let i = 0; i < P.length; i++) {
    const a = P[i]; if (!a.alive) continue;
    for (let j = i + 1; j < P.length; j++) {
      const b = P[j]; if (!b.alive) continue;
      const r = (a.radius + b.radius) * .6;
      const dx = a.pos.x - b.pos.x; if (dx > r || dx < -r) continue;
      if (a.pos.distanceToSquared(b.pos) < r * r) {
        fxExplosion((a.pos.x + b.pos.x) / 2, (a.pos.y + b.pos.y) / 2, (a.pos.z + b.pos.z) / 2, 9, 1);
        damagePlane(a, 260, b, true); damagePlane(b, 260, a, true);
        if (a.alive) a.vel.addScaledVector(a.pos.clone().sub(b.pos).normalize(), 25);
        if (b.alive) b.vel.addScaledVector(b.pos.clone().sub(a.pos).normalize(), 25);
      }
    }
  }
}

function updateGame(dt, t) {
  GAME.t += dt; GAME.stats.time += dt;
  GAME.shake = Math.max(0, GAME.shake - dt * 1.8); GAME.flash = Math.max(0, GAME.flash - dt * 1.4);
  const planes = GAME.planes;
  updateCloudCache(t);
  for (const a of planes) {
    if (a.alive) {
      const pilotHuman = a.isPlayer && a.mode === 'pilot', gunnerHuman = a.isPlayer && a.mode === 'gunner';
      if (pilotHuman) { playerPilotControl(a, dt); a.wantFire = INPUT.lmb && !a.gun.locked; } else botPilot(a, dt);
      if (gunnerHuman) playerGunnerControl(a, dt); else botGunner(a, dt);
      flightStep(a, dt);
      a.hitFlash = Math.max(0, (a.hitFlash || 0) - dt * 3);
      if (terrainCheck(a)) { fxCrash(a); a.gone = true; a.obj.root.visible = false; a.hp = 0; killPlane(a, a.lastHitT > GAME.t - 6 ? a.lastHitBy : null, 'crash'); a.dying = 0; continue; }
      const out = Math.max(Math.abs(a.pos.x), Math.abs(a.pos.z));
      if (out > WORLD_LIM) { a.outT = (a.outT || 0) + dt; if (a.isPlayer) showWarn('Leaving the battlefield — turn back!', .3); if (a.outT > 9) killPlane(a, null, 'lost'); } else a.outT = 0;
      updateTurret(a, dt); updateGuns(a, dt); updateTurretFire(a, dt);
      if (a.isPlayer) groundWarning(a);
    } else if (a.dying) updateDying(a, dt);
  }
  collidePlanes();
  updateProjectiles(dt);
  updateFx(dt);
  updateViewTarget(dt);
  const V = GAME.view;
  if (V) { if (V.isPlayer && V.mode === 'gunner' && V.alive) updateGunnerCamera(V, dt); else updateChaseCamera(V, dt); }
  for (const a of planes) { updatePlaneVisual(a, dt); updatePlaneFx(a, dt); }
  checkEnd(dt);
  updateHud(dt); tickMessages(dt);
}

/* ---- who the camera follows ---- */
function updateViewTarget(dt) {
  const P = GAME.player;
  if (P.alive || (P.dying && P.dyingT < 3)) { if (GAME.view !== P) { GAME.view = P; cam.init = false; } return; }
  if (GAME.view && GAME.view.alive && GAME.view.team === P.team) return;          // keep following the chosen ally
  const ally = GAME.planes.find((p) => p.alive && p.team === P.team);
  if (ally) { GAME.view = ally; cam.init = false; showToast('Your aircraft is down — following ' + ally.name, 3); }
  else if (!GAME.over) { const any = GAME.planes.find((p) => p.alive); if (any) GAME.view = any; }
}
function cycleSpectate(dir) {
  const P = GAME.player; if (P.alive) return;
  const allies = GAME.planes.filter((p) => p.alive && p.team === P.team); if (!allies.length) return;
  const i = Math.max(0, allies.indexOf(GAME.view));
  GAME.view = allies[(i + dir + allies.length) % allies.length]; cam.init = false;
}
function groundWarning(a) {
  if (clearanceAhead(a, 2.2) < 25 && a.vel.y < 4 && clearanceAhead(a, 1.2) < 70) showWarn('PULL UP!', .25);
}

/* ---- victory / defeat ---- */
function checkEnd(dt) {
  if (GAME.over) { GAME.overT += dt; if (GAME.overT > 2.2 && $('end').classList.contains('hidden')) showEnd(); return; }
  const alive = GAME.teams.filter((t) => t.alive > 0);
  const mine = GAME.teams[GAME.playerTeam];
  if (mine.alive <= 0 || alive.length <= 1) {
    GAME.over = true; GAME.overT = 0; GAME.won = mine.alive > 0 && alive.length <= 1;
    GAME.winner = alive.length === 1 ? alive[0] : null;
  }
}
function showEnd() {
  const e = $('end'); e.classList.remove('hidden', 'win', 'lose'); e.classList.add(GAME.won ? 'win' : 'lose');
  $('end-title').textContent = GAME.won ? 'Victory' : 'Defeat';
  $('end-sub').textContent = GAME.won ? 'Your team rules the sky.' : (GAME.winner ? `${GAME.winner.name} hold the skies. Your team is gone.` : 'Your team has been shot from the sky.');
  const s = GAME.stats, m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60);
  $('end-stats').innerHTML = `<div><small>Time</small>${m}:${String(sec).padStart(2, '0')}</div><div><small>Your kills</small>${s.kills}</div><div><small>Accuracy</small>${s.shots ? Math.round(100 * s.hits / s.shots) : 0}%</div><div><small>Survivors</small>${GAME.teams[GAME.playerTeam].alive}/3</div>`;
  if (document.pointerLockElement) document.exitPointerLock();
  $('capture').classList.add('hidden');
}
$('btn-restart').addEventListener('click', () => startBattle(GAME.race));
$('btn-menu').addEventListener('click', () => { GAME.state = 'menu'; clearBattle(); showMenu(); });

addEventListener('keydown', (e) => {
  if (GAME.state !== 'play' || e.repeat) return;
  if (e.code === 'KeyC' && !GAME.over) switchRole();
  else if (e.code === 'KeyH') $('hud-br').classList.toggle('hidden');
  else if (e.code === 'Tab' || e.code === 'ArrowRight') cycleSpectate(1);
  else if (e.code === 'ArrowLeft' && !INPUT.locked) cycleSpectate(-1);
  else if (e.code === 'KeyR' && GAME.over) startBattle(GAME.race);
});
