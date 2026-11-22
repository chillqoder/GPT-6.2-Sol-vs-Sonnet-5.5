/* ======================================================================
   STAGE 2 — FLIGHT MODEL, PILOT CONTROLS, CHASE CAMERA
   Arcade-but-grounded model: thrust sets a target speed, climbing bleeds
   energy and diving adds it, control authority follows a speed curve with a
   corner speed, the velocity vector lags the nose (inertia) and aircraft bank
   into turns on their own. Mouse = where the nose should point.
   ====================================================================== */
const GAME = {
  state: 'menu', t: 0, planes: [], teams: [], player: null, view: null, playerTeam: 0, race: 'human',
  over: false, stats: { kills: 0, shots: 0, hits: 0, time: 0 }, shake: 0, flash: 0,
};
const WORLD_LIM = 1560;                     // soft edge of the battlefield (the world map is +/-1500)
const UP = new THREE.Vector3(0, 1, 0), FWD0 = new THREE.Vector3(0, 0, 1);

/* ---------------- plane object ---------------- */
let _planeId = 0;
function createPlane(race, teamIdx, slot) {
  const cfg = RACE[race], obj = makeAircraftObject(TPL[race]);
  const a = {
    id: _planeId++, race, cfg, F: cfg.flight, team: teamIdx, slot, obj, tpl: TPL[race],
    pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3(), speed: cfg.flight.idle * 1.2, throttle: .6,
    rate: { p: 0, y: 0, r: 0 }, ctl: { pitch: 0, yaw: 0, roll: 0 },
    fwd: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), left: new THREE.Vector3(1, 0, 0),
    aim: new THREE.Vector3(0, 0, 1), aimYaw: 0, aimPitch: 0,                    // pilot's commanded direction (world)
    hp: cfg.hp, maxHp: cfg.hp, alive: true, dying: 0, name: '', isPlayer: false, mode: 'pilot', lastHitT: -99, lastHitBy: null, kills: 0,
    bank: 0, g: 0, climb: 0, inCloud: 0, speedKmh: 0, alt: 0, radius: cfg.hitR,
  };
  a.name = `${cfg.teamName.slice(0, -1)} ${slot + 1}`;
  scene.add(obj.root);
  return a;
}
function placePlane(a, x, y, z, headingRad) {
  a.pos.set(x, y, z);
  a.quat.setFromAxisAngle(UP, headingRad);
  a.fwd.set(0, 0, 1).applyQuaternion(a.quat); a.up.set(0, 1, 0).applyQuaternion(a.quat); a.left.set(1, 0, 0).applyQuaternion(a.quat);
  a.speed = a.F.idle + (a.F.max - a.F.idle) * a.throttle;
  a.vel.copy(a.fwd).multiplyScalar(a.speed);
  a.aim.copy(a.fwd); a.aimYaw = headingRad; a.aimPitch = 0;
  syncPlane(a);
}
function syncPlane(a) { a.obj.root.position.copy(a.pos); a.obj.root.quaternion.copy(a.quat); }

/* ---------------- autopilot / steering (used by the player's mouse AND by every bot) ---------------- */
const _l = new THREE.Vector3(), _iq = new THREE.Quaternion();
/** Convert a wanted world direction into pitch / yaw / roll commands. */
function steerToward(a, dir, manualRoll = 0, gain = 1) {
  _iq.copy(a.quat).invert();
  _l.copy(dir).applyQuaternion(_iq);                         // direction in body axes (x = left, y = up, z = forward)
  const lat = Math.atan2(_l.x, _l.z);                        // > 0: target is to the left
  const vert = Math.asin(clamp(_l.y, -1, 1));                // > 0: target is above the nose
  const bank = Math.atan2(a.left.y, a.up.y);                 // > 0: banked right
  a.bank = bank;
  const wantBank = clamp(-lat * 1.35, -1.3, 1.3) * smooth01(0.02, 0.22, Math.abs(lat));
  const c = a.ctl;
  c.pitch = clamp(vert * 2.4 * gain, -1, 1);
  c.yaw = clamp(lat * 1.4 * gain, -1, 1);
  c.roll = manualRoll !== 0 ? manualRoll : clamp((wantBank - bank) * 3.2, -1, 1);
  // when the target is far off to the side the nose should come round with the roll, not against it
  if (Math.abs(lat) > 1.0 && manualRoll === 0) c.pitch = clamp(c.pitch + Math.abs(Math.sin(bank)) * .6, -1, 1);
  a.errAngle = Math.acos(clamp(_l.z, -1, 1));
}

/* ---------------- flight physics ---------------- */
const _vd = new THREE.Vector3(), _dq = new THREE.Quaternion(), _de = new THREE.Euler();
function flightStep(a, dt) {
  const F = a.F, c = a.ctl;
  // ---- thrust / energy
  const target = F.idle + (F.max - F.idle) * a.throttle;
  let acc = (target - a.speed) * F.accel - a.fwd.y * F.grav;
  if (a.speed > F.max) acc -= (a.speed - F.max) * 2.4 + (a.speed - F.max) * (a.speed - F.max) * .02;
  const ceil = 1350; if (a.pos.y > ceil) acc -= (a.pos.y - ceil) * .08;
  a.speed = Math.max(10, a.speed + acc * dt);
  // ---- authority (corner speed): sluggish when slow, a little stiff when very fast
  const auth = smooth01(F.stall * .6, F.corner, a.speed) * (1 - .4 * smooth01(F.corner, F.max * 1.25, a.speed));
  const stall = clamp((F.stall - a.speed) / (F.stall * .35), 0, 1);
  const k = 1 - Math.exp(-F.agility * dt);
  a.rate.p += ((c.pitch * F.pitch * auth) - stall * .9 - a.rate.p) * k;
  a.rate.y += ((c.yaw * F.yaw * auth) - a.rate.y) * k;
  a.rate.r += ((c.roll * F.roll * (.35 + .65 * auth)) - a.rate.r) * k;
  // ---- integrate orientation in body axes: nose-up = -X, turn-left = +Y, roll-right = +Z
  _de.set(-a.rate.p * dt, a.rate.y * dt, a.rate.r * dt, 'XYZ');
  _dq.setFromEuler(_de); a.quat.multiply(_dq).normalize();
  a.fwd.set(0, 0, 1).applyQuaternion(a.quat); a.up.set(0, 1, 0).applyQuaternion(a.quat); a.left.set(1, 0, 0).applyQuaternion(a.quat);
  // a banked aircraft slips towards the low wing a little less than it turns; the velocity vector chases the nose
  _vd.copy(a.fwd).multiplyScalar(a.speed);
  a.vel.lerp(_vd, 1 - Math.exp(-F.grip * dt));
  a.vel.y -= stall * 20 * dt;
  a.pos.addScaledVector(a.vel, dt);
  a.bank = Math.atan2(a.left.y, a.up.y);
  a.speedKmh = a.vel.length() * 3.6; a.alt = a.pos.y - groundH(a.pos.x, a.pos.z);
}

/* ---------------- ground / building / out-of-bounds ---------------- */
function terrainCheck(a) {
  const x = a.pos.x, z = a.pos.z, r = a.radius * .55;
  let h = solidH(x, z);
  const hs = Math.max(h, solidH(x + r, z), solidH(x - r, z), solidH(x, z + r), solidH(x, z - r));
  a.groundAlt = a.pos.y - hs;
  return a.pos.y - r * .6 < hs;
}
/** Predicted clearance along the velocity vector (used for "PULL UP" and by bot terrain avoidance). */
function clearanceAhead(a, t) {
  const px = a.pos.x + a.vel.x * t, pz = a.pos.z + a.vel.z * t, py = a.pos.y + a.vel.y * t;
  return py - solidH(px, pz);
}

/* ---------------- input ---------------- */
const INPUT = { keys: Object.create(null), lmb: false, locked: false, dx: 0, dy: 0, pressed: Object.create(null) };
addEventListener('keydown', (e) => {
  if (e.repeat) { if (GAME.state === 'play' && /^(Key[WASDCQE]|Space|Tab|Arrow.*)$/.test(e.code)) e.preventDefault(); return; }
  INPUT.keys[e.code] = true; INPUT.pressed[e.code] = true;
  if (GAME.state === 'play' && /^(Key[WASDCQEH]|Space|Tab|Arrow.*)$/.test(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { INPUT.keys[e.code] = false; });
addEventListener('blur', () => { for (const k in INPUT.keys) INPUT.keys[k] = false; INPUT.lmb = false; });
const consumeKey = (code) => { const v = INPUT.pressed[code]; INPUT.pressed[code] = false; return !!v; };
addEventListener('mousedown', (e) => {
  if (GAME.state !== 'play' || e.target.closest && e.target.closest('.btn')) return;
  if (e.button === 0) INPUT.lmb = true;
  if (!INPUT.locked && renderer.domElement.requestPointerLock) { try { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) {} }
});
addEventListener('mouseup', (e) => { if (e.button === 0) INPUT.lmb = false; });
addEventListener('contextmenu', (e) => { if (GAME.state === 'play') e.preventDefault(); });
document.addEventListener('pointerlockchange', () => {
  INPUT.locked = document.pointerLockElement === renderer.domElement;
  if (INPUT.locked) INPUT.hadLock = true;
  if (GAME.state !== 'play') return;
  const cap = $('capture');
  if (GAME.over) { cap.classList.add('hidden'); return; }
  if (!INPUT.locked && INPUT.hadLock) { GAME.paused = true; cap.textContent = 'Paused — click to resume'; cap.classList.remove('hidden'); }
  else if (INPUT.locked) { GAME.paused = false; cap.classList.add('hidden'); }
});
const SENS = 0.0021;
addEventListener('mousemove', (e) => {
  if (GAME.state !== 'play' || !INPUT.locked) return;
  INPUT.dx += e.movementX; INPUT.dy += e.movementY;
});

/* ---------------- player pilot control ---------------- */
const _aimTmp = new THREE.Vector3(), _aimAxis = new THREE.Vector3();
function setAimFromAngles(a) {
  const cp = Math.cos(a.aimPitch);
  a.aim.set(Math.sin(a.aimYaw) * cp, Math.sin(a.aimPitch), Math.cos(a.aimYaw) * cp);
}
function updatePilotAim(a, dx, dy) {
  a.aimYaw -= dx * SENS; a.aimPitch = clamp(a.aimPitch - dy * SENS, -1.4, 1.4);
  setAimFromAngles(a);
  // the target direction may not run away from the nose by more than ~75 deg, otherwise it is pulled back
  const d = a.aim.dot(a.fwd), lim = Math.cos(75 * DEG);
  if (d < lim) {
    _aimTmp.copy(a.aim).addScaledVector(a.fwd, -d);
    if (_aimTmp.lengthSq() < 1e-6) _aimTmp.copy(a.up);
    _aimTmp.normalize();
    a.aim.copy(a.fwd).multiplyScalar(lim).addScaledVector(_aimTmp, Math.sqrt(1 - lim * lim));
    a.aimYaw = Math.atan2(a.aim.x, a.aim.z); a.aimPitch = Math.asin(clamp(a.aim.y, -1, 1));
  }
}
function playerPilotControl(a, dt) {
  const K = INPUT.keys;
  if (K.KeyW) a.throttle = Math.min(1, a.throttle + dt * .55);
  if (K.KeyS) a.throttle = Math.max(0, a.throttle - dt * .55);
  updatePilotAim(a, INPUT.dx, INPUT.dy); INPUT.dx = INPUT.dy = 0;
  // without a captured mouse the arrow keys steer (handy for trackpads / testing)
  if (!INPUT.locked) { updatePilotAim(a, (K.ArrowLeft ? -1 : 0) * 520 * dt + (K.ArrowRight ? 1 : 0) * 520 * dt, (K.ArrowUp ? -1 : 0) * 520 * dt + (K.ArrowDown ? 1 : 0) * 520 * dt); }
  steerToward(a, a.aim, (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0));
}

/* ---------------- chase camera ---------------- */
const cam = { q: new THREE.Quaternion(), pos: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), look: new THREE.Vector3(), fov: 62, init: false, target: null };
const _co = new THREE.Vector3(), _cl = new THREE.Vector3(), _cu = new THREE.Vector3();
const _cwq = new THREE.Quaternion(), _cwe = new THREE.Euler(0, 0, 0, 'YXZ');
function updateChaseCamera(a, dt) {
  let tq = a.quat;
  if (!a.alive) {                                   // a falling wreck tumbles: follow its flight path, not its spin
    const v = a.vel; _cwe.set(-Math.atan2(v.y, Math.hypot(v.x, v.z)) * .6, Math.atan2(v.x, v.z), 0); tq = _cwq.setFromEuler(_cwe);
  }
  if (!cam.init || cam.target !== a) { cam.q.copy(tq); cam.init = true; cam.target = a; cam.pos.copy(a.pos); }
  cam.q.slerp(tq, 1 - Math.exp(-(a.alive ? 5.2 : 2.5) * dt));
  const sp = clamp(a.vel.length() / a.F.max, 0, 1.2);
  _co.set(0, 3.9 + sp * .5, -(17 + sp * 4.5)).applyQuaternion(cam.q);
  cam.pos.copy(a.pos).add(_co);
  _cl.set(0, 1.4, 34).applyQuaternion(cam.q).add(a.pos);                          // look slightly ahead of the aircraft
  _cu.set(0, 1, 0).applyQuaternion(cam.q).multiplyScalar(.55).addScaledVector(UP, .45).normalize();
  // keep the camera out of the ground
  const gh = solidH(cam.pos.x, cam.pos.z) + 3; if (cam.pos.y < gh) cam.pos.y = gh;
  camera.position.copy(cam.pos);
  if (GAME.shake > .001) { camera.position.x += (Math.random() - .5) * GAME.shake * 1.4; camera.position.y += (Math.random() - .5) * GAME.shake * 1.4; camera.position.z += (Math.random() - .5) * GAME.shake * 1.4; }
  camera.up.copy(_cu); camera.lookAt(_cl);
  const fov = 60 + sp * 12 + (a.boost || 0);
  if (Math.abs(fov - camera.fov) > .05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
}

/* ---------------- visuals that depend on the flight state ---------------- */
const LOD_DIST = 280;
const _camP = new THREE.Vector3();
function updatePlaneVisual(a, dt) {
  const o = a.obj; syncPlane(a);
  const d = camera.position.distanceTo(a.pos);
  const near = d < LOD_DIST || a === GAME.view;
  o.lod0.visible = near; o.lod1.visible = !near;
  if (near) {
    const run = a.alive ? (.55 + a.throttle * .45) : .25;
    for (const r of o.rotors) r.node.rotation.z += r.spin * run * dt * (.7 + a.throttle * .6);
    for (const b of o.blurs) b.material.opacity = .3 * run;
  }
}
