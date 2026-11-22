/* ======================================================================
   STAGE 4 — GUNNER: turret kinematics inside a firing arc, mouse aiming,
   C key pilot <-> gunner switching (the other seat is taken over by a bot)
   ====================================================================== */
// Arcs are in aircraft axes: az = atan2(left, forward) (0 = nose, +pi/2 = left side, pi = tail), el = elevation.
const TUR = {
  human: { az: null, el: [-1.50, 0.22], slew: 3.6, pivotUp: -.05 },                    // belly ball: everything below the horizon
  dwarf: { az: null, el: [-0.12, 1.50], slew: 1.9, pivotUp: .3 },                      // roof drum: full circle, upper hemisphere
  elf: { az: [Math.PI, 1.75], el: [-0.60, 1.05], slew: 4.0, pivotUp: .3 },            // tail: ~100 deg either side of straight aft
  orc: { az: [Math.PI / 2, 1.25], el: [-0.90, 1.15], slew: 2.7, pivotUp: .3 },        // outrigger on the left flank
};
const TUR_NAME = { human: 'underneath', dwarf: 'on top', elf: 'at the rear', orc: 'on the side' };
const _tl = new THREE.Vector3(), _td = new THREE.Vector3(), _tZ = new THREE.Vector3(0, 0, 1), _tQ = new THREE.Quaternion(), _tiq = new THREE.Quaternion();
const _clampOut = { az: 0, el: 0, limited: false };

function clampTurretAim(race, az, el) {
  const T = TUR[race]; let lim = false;
  if (T.az) { const d = wrapPI(az - T.az[0]), c = clamp(d, -T.az[1], T.az[1]); if (c !== d) lim = true; az = T.az[0] + c; }
  const e2 = clamp(el, T.el[0], T.el[1]); if (e2 !== el) lim = true;
  _clampOut.az = az; _clampOut.el = e2; _clampOut.limited = lim;
  return _clampOut;
}
function azElToLocal(az, el, out) { const c = Math.cos(el); return out.set(Math.sin(az) * c, Math.sin(el), Math.cos(az) * c); }
/** Does the aircraft's turret arc contain this world direction? (used by the gunner bot) */
function inTurretArc(a, dirW) {
  _tiq.copy(a.quat).invert(); _tl.copy(dirW).applyQuaternion(_tiq);
  const az = Math.atan2(_tl.x, _tl.z), el = Math.asin(clamp(_tl.y, -1, 1));
  clampTurretAim(a.race, az, el);
  return !_clampOut.limited;
}

function updateTurret(a, dt) {
  const t = a.tur, T = TUR[a.race], o = a.obj;
  _tiq.copy(a.quat).invert();
  _tl.copy(t.aimW).applyQuaternion(_tiq);
  const taz0 = Math.atan2(_tl.x, _tl.z), tel0 = Math.asin(clamp(_tl.y, -1, 1));
  const c = clampTurretAim(a.race, taz0, tel0), taz = c.az, tel = c.el; t.limited = c.limited;
  const s = T.slew * dt;
  t.az += clamp(wrapPI(taz - t.az), -s, s);
  t.el += clamp(tel - t.el, -s, s);
  azElToLocal(t.az, t.el, _td);                                  // actual gun direction, aircraft axes
  t.dirW.copy(_td).applyQuaternion(a.quat);
  azElToLocal(taz, tel, _tl);                                    // wanted (clamped) direction
  t.err = Math.acos(clamp(_td.dot(_tl), -1, 1));
  // ---- visuals
  const gun = o.guns[0];
  if (o.hasYaw) {
    o.yawNode.rotation.y = t.az;
    _td.set(0, Math.sin(t.el), Math.cos(t.el));
    gun.node.quaternion.setFromUnitVectors(_tZ, _td);
  } else {
    gun.node.quaternion.setFromUnitVectors(_tZ, _td);
    o.gunnerPivot.rotation.y = t.az;
  }
}

/* ---------------- player as gunner ---------------- */
const SENS_G = 0.0016;
function playerGunnerControl(a, dt) {
  const t = a.tur;
  t.yaw -= INPUT.dx * SENS_G; t.pitch = clamp(t.pitch - INPUT.dy * SENS_G, -1.5, 1.5);
  if (!INPUT.locked) { t.yaw += ((INPUT.keys.ArrowLeft ? 1 : 0) - (INPUT.keys.ArrowRight ? 1 : 0)) * 1.4 * dt; t.pitch = clamp(t.pitch + ((INPUT.keys.ArrowUp ? 1 : 0) - (INPUT.keys.ArrowDown ? 1 : 0)) * 1.0 * dt, -1.5, 1.5); }
  INPUT.dx = INPUT.dy = 0;
  const cp = Math.cos(t.pitch);
  t.aimW.set(Math.sin(t.yaw) * cp, Math.sin(t.pitch), Math.cos(t.yaw) * cp);
  // keep the aim inside the firing arc (the view sticks to the limit instead of drifting out of it)
  _tiq.copy(a.quat).invert(); _tl.copy(t.aimW).applyQuaternion(_tiq);
  const c = clampTurretAim(a.race, Math.atan2(_tl.x, _tl.z), Math.asin(clamp(_tl.y, -1, 1)));
  if (c.limited) {
    azElToLocal(c.az, c.el, _tl); t.aimW.copy(_tl).applyQuaternion(a.quat);
    t.yaw = Math.atan2(t.aimW.x, t.aimW.z); t.pitch = Math.asin(clamp(t.aimW.y, -1, 1));
  }
  t.want = INPUT.lmb;
  const K = INPUT.keys;
  if (K.KeyW) a.throttle = Math.min(1, a.throttle + dt * .4);       // throttle still answers while gunning (the bot pilot may overrule)
}

const _gcp = new THREE.Vector3();
function updateGunnerCamera(a, dt) {
  const t = a.tur, o = a.obj;
  o.root.updateMatrixWorld(true);
  o.guns[0].node.getWorldPosition(_gcp);
  const len = (a.race === 'elf' ? 2.4 : a.race === 'dwarf' ? 2.2 : a.race === 'orc' ? 2.0 : 1.5) * AC_SCALE + 1.6;
  camera.position.copy(_gcp).addScaledVector(t.aimW, len).addScaledVector(a.up, .5);
  if (GAME.shake > .001) { camera.position.x += (Math.random() - .5) * GAME.shake; camera.position.y += (Math.random() - .5) * GAME.shake; camera.position.z += (Math.random() - .5) * GAME.shake; }
  camera.up.copy(Math.abs(t.aimW.y) > .93 ? a.fwd : UP);
  camera.lookAt(_gcp.copy(camera.position).add(t.aimW));
  const fov = 56;
  if (Math.abs(fov - camera.fov) > .05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 6); camera.updateProjectionMatrix(); }
}

function switchRole() {
  const a = GAME.player;
  if (!a || !a.alive || GAME.over) return;
  const t = a.tur;
  if (a.mode === 'pilot') {
    a.mode = 'gunner';
    t.aimW.copy(t.dirW); t.yaw = Math.atan2(t.aimW.x, t.aimW.z); t.pitch = Math.asin(clamp(t.aimW.y, -1, 1));
    a.wantFire = false;
    if (typeof botReset === 'function') botReset(a);
    showToast('You are the gunner — ' + WEAP[a.race].tur.name + ' ' + TUR_NAME[a.race]);
  } else {
    a.mode = 'pilot';
    a.aim.copy(a.fwd); a.aimYaw = Math.atan2(a.fwd.x, a.fwd.z); a.aimPitch = Math.asin(clamp(a.fwd.y, -1, 1));
    t.want = false;
    showToast('You are the pilot');
  }
  cam.init = false; camera.fov = a.mode === 'gunner' ? 56 : 62; camera.updateProjectionMatrix();
  INPUT.dx = INPUT.dy = 0;
}
