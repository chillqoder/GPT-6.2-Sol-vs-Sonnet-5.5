/* ======================================================================
   STAGES 5 + 6 — BOT AI
   pilots : target selection, tail-chasing with lead pursuit, break turns
            when someone is on their tail, retreat into clouds when hurt,
            terrain / building / edge / mid-air collision avoidance
   gunners: target selection inside the firing arc, lead + gravity
            compensation, human-like aim wobble that gets worse in cloud
   Clouds hide aircraft: spotting range collapses inside / through cloud.
   ====================================================================== */

/* ---------------- clouds as seen by the AI (same field the world renders) ---------------- */
const CL = { n: cloudClusters.length, x: new Float32Array(cloudClusters.length), z: new Float32Array(cloudClusters.length), y: new Float32Array(cloudClusters.length),
  R: new Float32Array(cloudClusters.length), f: new Float32Array(cloudClusters.length), d: new Float32Array(cloudClusters.length) };
cloudClusters.forEach((c, i) => { CL.y[i] = c.y; CL.R[i] = c.R; CL.f[i] = c.flat; CL.d[i] = c.dens; });
function updateCloudCache(t) {
  const wx = G.uWind.value.x * CLOUD_SPEED * t, wz = G.uWind.value.z * CLOUD_SPEED * t;
  for (let i = 0; i < CL.n; i++) { const c = cloudClusters[i]; CL.x[i] = wrapCloud(c.x + wx); CL.z[i] = wrapCloud(c.z + wz); }
}
function cloudDensityAt(x, y, z) {
  let d = 0;
  for (let i = 0; i < CL.n; i++) {
    const R = CL.R[i], dy = y - CL.y[i];
    if (dy > R * (CL.f[i] * 1.1 + .15) || dy < -R * (CL.f[i] * 1.1 + .15)) continue;
    const dx = x - CL.x[i]; if (dx > R || dx < -R) continue;
    const dz = z - CL.z[i]; if (dz > R || dz < -R) continue;
    d += CL.d[i] * (1 - smooth01(R * .3, R * .95, Math.hypot(dx, dz, dy * 1.6)));
  }
  return d > 1.2 ? 1.2 : d;
}
/** Cloud thickness between two points (density * length, in units of ~150 m). */
function cloudAlong(p, q) {
  const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, L = Math.hypot(dx, dy, dz);
  const n = Math.min(10, Math.max(3, Math.ceil(L / 130)));
  let s = 0;
  for (let i = 1; i < n; i++) { const f = i / n; s += cloudDensityAt(p.x + dx * f, p.y + dy * f, p.z + dz * f); }
  return s * (L / n) / 150;
}
const SPOT_RANGE = 1900;
/** "Lull": when nobody has been shot down for a while the sky clears — spotting improves so the fight always finishes. */
function lullFactor() { return clamp((GAME.t - (GAME.lastKillT || 0) - 50) / 60, 0, 1); }
/** Can `obs` see `tgt`? Aircraft inside a cloud are only seen from very close, cloud in between shrinks the range. */
function canSee(obs, tgt) {
  const lull = lullFactor(), d = obs.pos.distanceTo(tgt.pos);
  if (d > SPOT_RANGE * (1 + lull * 1.2)) return false;
  if (d < 140 + lull * 1000) return true;
  if (cloudDensityAt(tgt.pos.x, tgt.pos.y, tgt.pos.z) > .55) { tgt.cloudHidden = true; return false; }
  tgt.cloudHidden = false;
  const tau = cloudAlong(obs.pos, tgt.pos);
  return d < SPOT_RANGE * (1 + lull * 1.2) / (1 + tau * 2.2 * (1 - lull));
}

/* ---------------- bot state ---------------- */
function initBot(a) {
  a.bot = {
    skill: .4 + Math.random() * .42, target: null, thinkT: Math.random() * .4, gThinkT: Math.random() * .3, mode: 'attack', modeT: 0,
    evadeSide: Math.random() < .5 ? -1 : 1, evadeT: 0, jx: 0, jy: 0, jTx: 0, jTy: 0, jT: 0, lostT: 0, avoidT: 0, avoidDir: new THREE.Vector3(),
    goal: new THREE.Vector3(), hasGoal: false, lastKnown: new THREE.Vector3(), cloudGoal: null, gTarget: null, gx: 0, gy: 0, sweep: Math.random() * 6, phase: Math.random() * 6,
    attackT: 0, breakT: 0,
  };
}
function botReset(a) { const b = a.bot; b.target = null; b.thinkT = 0; b.mode = 'attack'; b.evadeT = 0; b.avoidT = 0; }

const _aD = new THREE.Vector3(), _aL = new THREE.Vector3(), _aR = new THREE.Vector3(), _aT = new THREE.Vector3(), _aV = new THREE.Vector3(), _aS = new THREE.Vector3();
/** Lead point for a projectile of speed `ps` fired from `from` (moving with `fvel`, inherit fraction k). */
function interceptDir(from, fvel, k, tpos, tvel, ps, out, grav = 0) {
  _aV.copy(tvel).addScaledVector(fvel, -k);
  let t = tpos.distanceTo(from) / ps;
  for (let i = 0; i < 3; i++) { out.copy(tpos).addScaledVector(_aV, t); out.y += .5 * grav * t * t; t = out.distanceTo(from) / ps; }
  return t;
}

/* ---------------- pilot brain ---------------- */
function botThink(a, bot) {
  const P = GAME.planes;
  // ---- threat scan (anyone pointing at me from behind / close)
  let threat = null, threatD = 1e9;
  for (const e of P) {
    if (!e.alive || e.team === a.team) continue;
    _aT.copy(e.pos).sub(a.pos); const d = _aT.length();
    if (d > 650 || d < 1) continue;
    _aT.multiplyScalar(1 / d);
    if (_aT.dot(a.fwd) > .35) continue;                                 // in front of me: not (yet) a tail threat
    if (-_aT.dot(e.fwd) < Math.cos(24 * D2R)) continue;                  // not pointing at me
    if (e.cloudHidden) continue;
    if (d < threatD) { threatD = d; threat = e; }
  }
  bot.threat = threat; bot.threatD = threatD;
  // ---- target selection
  bot.gThinkT = 0;
  let best = null, bs = 1e9;
  for (const e of P) {
    if (!e.alive || e.team === a.team) continue;
    if (!canSee(a, e)) continue;
    _aT.copy(e.pos).sub(a.pos); const d = _aT.length();
    let s = d;
    const cosA = _aT.dot(a.fwd) / d;
    s += (1 - cosA) * 260;                                              // prefers what is already in front
    if (e === bot.target) s -= 220;                                     // hysteresis
    if (e.lastHitBy === a && GAME.t - e.lastHitT < 5) s -= 120;
    if (e.hp < e.maxHp * .4) s -= 140;
    if (e.bot && e.bot.target === a) s -= 90;                           // revenge
    if (s < bs) { bs = s; best = e; }
  }
  if (best) { bot.target = best; bot.lostT = 0; bot.lastKnown.copy(best.pos); }
  else if (bot.target) { bot.lostT += .4; if (!bot.target.alive || bot.lostT > 3) bot.target = null; }
  // ---- mode
  const hpf = a.hp / a.maxHp;
  // a retreating pilot that has not seen anybody for a while turns back into a hunter (so cloud-hiders cannot stall the match)
  if (bot.mode === 'retreat') { if (best || threat) bot.calmT = 0; else bot.calmT = (bot.calmT || 0) + .4; if (bot.calmT > 9) { bot.noRetreat = GAME.t + 30; bot.mode = 'attack'; bot.calmT = 0; } }
  if (hpf < .27 && GAME.t > (bot.noRetreat || 0)) { if (bot.mode !== 'retreat') { bot.mode = 'retreat'; bot.cloudGoal = null; bot.calmT = 0; } }
  else if (threat && (threatD < 480 * (.7 + bot.skill * .5)) && Math.random() < .5 + bot.skill * .4 && bot.mode !== 'evade' && GAME.t - bot.breakT > 4) { bot.mode = 'evade'; bot.evadeT = 1.4 + Math.random() * 1.6; bot.evadeSide = Math.random() < .5 ? -1 : 1; bot.breakT = GAME.t; }
  else if (bot.mode !== 'evade') bot.mode = 'attack';
}

function botAvoid(a, bot, dt) {                              // terrain / building / edge protection: returns true when it takes over
  bot.avoidT = Math.max(0, bot.avoidT - dt);
  const F = a.F, v = a.vel, sp = Math.max(v.length(), 30);
  let worst = 1e9;
  for (const T of [.7, 1.5, 2.5, 3.6]) {
    const x = a.pos.x + v.x * T, z = a.pos.z + v.z * T, y = a.pos.y + v.y * T;
    const c = y - solidH(x, z); if (c < worst) worst = c;
  }
  const margin = (38 + sp * .42) * Math.sqrt(1.5 / F.pitch);
  if (worst < margin || a.pos.y < 70 + groundH(a.pos.x, a.pos.z)) { bot.avoidT = .9; }
  if (bot.avoidT > 0) {
    // pull up and away; hard pull when really close
    const urgent = worst < margin * .45;
    bot.avoidDir.set(a.fwd.x, urgent ? 1.6 : .8, a.fwd.z).normalize();
    return true;
  }
  return false;
}

function botPilot(a, dt) {
  const bot = a.bot; bot.modeT += dt;
  bot.thinkT -= dt; if (bot.thinkT <= 0) { bot.thinkT = .32 + Math.random() * .16; botThink(a, bot); }
  const F = a.F;
  let thr = .8, fire = false;
  // wobble noise (smooth), larger for weaker pilots
  bot.jT -= dt; if (bot.jT <= 0) { bot.jT = .35 + Math.random() * .5; bot.jTx = (Math.random() - .5); bot.jTy = (Math.random() - .5); }
  bot.jx += (bot.jTx - bot.jx) * Math.min(1, dt * 3); bot.jy += (bot.jTy - bot.jy) * Math.min(1, dt * 3);

  let handled = true;
  if (botAvoid(a, bot, dt)) {
    _aD.copy(bot.avoidDir); thr = 1;
  } else if (Math.max(Math.abs(a.pos.x), Math.abs(a.pos.z)) > 1330) {
    _aD.set(-a.pos.x, 0, -a.pos.z).normalize(); _aD.y = a.pos.y > 700 ? -.1 : .05; _aD.normalize(); thr = .9;
  } else if (bot.mode === 'retreat') {
    // run from whoever is closest, preferring cloud cover; once inside a cloud keep jinking quietly
    let nearest = null, nd = 1e9;
    for (const e of GAME.planes) { if (!e.alive || e.team === a.team) continue; const d = e.pos.distanceTo(a.pos); if (d < nd) { nd = d; nearest = e; } }
    if (!bot.cloudGoal || bot.modeT % 6 < dt) {
      let bi = -1, bd = 1100;
      for (let i = 0; i < CL.n; i++) { const dx = CL.x[i] - a.pos.x, dz = CL.z[i] - a.pos.z, dy = CL.y[i] - a.pos.y; if (Math.abs(dy) > 420) continue; const d = Math.hypot(dx, dz, dy); if (d < bd && CL.d[i] > .6) { bd = d; bi = i; } }
      bot.cloudGoal = bi >= 0 ? new THREE.Vector3(CL.x[bi], CL.y[bi], CL.z[bi]) : null;
    }
    const inCloud = cloudDensityAt(a.pos.x, a.pos.y, a.pos.z) > .5;
    if (bot.cloudGoal && !inCloud) { _aD.copy(bot.cloudGoal).sub(a.pos).normalize(); }
    else if (inCloud) { _aD.copy(a.fwd); _aD.x += Math.sin(GAME.t * .8 + bot.phase) * .35; _aD.z += Math.cos(GAME.t * .7 + bot.phase) * .35; _aD.y = Math.sin(GAME.t * .5) * .1; _aD.normalize(); }
    else if (nearest) { _aD.copy(a.pos).sub(nearest.pos).normalize(); _aD.y = .05; _aD.normalize(); }
    else _aD.copy(a.fwd);
    thr = inCloud ? .6 : 1;
    // cornered: shoot back
    if (bot.target && bot.target.alive) { const d = bot.target.pos.distanceTo(a.pos); if (d < 300 && a.errAngle < .06) fire = true; }
  } else if (bot.mode === 'evade') {
    bot.evadeT -= dt;
    const th = bot.threat;
    if (bot.evadeT <= 0 || !th || !th.alive) { bot.mode = 'attack'; }
    else {
      _aT.copy(th.pos).sub(a.pos).normalize();
      _aS.crossVectors(_aT, UP).normalize().multiplyScalar(bot.evadeSide);            // perpendicular to the threat
      _aD.copy(_aS).multiplyScalar(.9).addScaledVector(UP, -.3 + Math.sin(GAME.t * 2.6 + bot.phase) * .4).addScaledVector(a.fwd, .35).normalize();
      if (Math.floor(bot.evadeT * 1.6) % 2 === 0 && bot.evadeT < 1.2) bot.evadeSide *= (Math.random() < .02 ? -1 : 1);
      thr = 1;
    }
    handled = bot.mode === 'evade';
  } else handled = false;
  if (!handled) {
    const T = bot.target;
    if (T && T.alive) {
      const d = a.pos.distanceTo(T.pos);
      const W = WEAP[a.race].gun;
      const t = interceptDir(a.pos, a.vel, .92, T.pos, T.vel, W.speed, _aL);
      _aD.copy(_aL).sub(a.pos).normalize();
      // behave sensibly: when far, aim for a point behind the target so we end up on its tail
      if (d > 420) {
        _aT.copy(T.fwd).multiplyScalar(-90).add(T.pos); _aT.addScaledVector(T.vel, d / 900);
        _aS.copy(_aT).sub(a.pos).normalize(); _aD.lerp(_aS, smooth01(420, 900, d) * .65).normalize();
      }
      // head-on / too close: sheer off to avoid ramming
      const closing = -_aT.copy(T.vel).sub(a.vel).dot(_aS.copy(T.pos).sub(a.pos).normalize());
      if (d < 150 && _aS.dot(a.fwd) > .2 && closing > 20) { _aD.addScaledVector(a.up, .55).addScaledVector(a.left, bot.evadeSide * .5).normalize(); }
      // wobble
      const noise = (1 - bot.skill) * .1 * Math.min(1, d / 260);
      _aD.x += bot.jx * noise; _aD.y += bot.jy * noise; _aD.normalize();
      // speed: close the gap, then match
      const tf = clamp((T.speed - F.idle) / (F.max - F.idle), 0, 1);
      thr = d > 500 ? 1 : clamp(tf + (d - 220) / 500, .25, 1);
      if (d < 120) thr = Math.min(thr, .35);
      // fire
      _aR.copy(_aL).sub(a.pos).normalize();
      const ang = Math.acos(clamp(_aR.dot(a.fwd), -1, 1)), tol = Math.atan2(T.radius * .6, Math.max(d, 60));
      const range = Math.min(470, W.speed * W.life * .55);
      if (d < range && ang < tol && a.gun.heat < .92 && clearanceAhead(a, 1) > 15 && !(T.cloudHidden && d > 150)) fire = true;
    } else {
      // nothing in sight: head for the last known contact, else sweep the middle of the map
      let hunt = null;
      if (lullFactor() > .25) { let hd = 1e9; for (const e of GAME.planes) { if (!e.alive || e.team === a.team) continue; const d = e.pos.distanceToSquared(a.pos); if (d < hd) { hd = d; hunt = e; } } }
      if (hunt) { _aD.copy(hunt.pos).sub(a.pos); }
      else if (bot.lostT > 0 && bot.lastKnown.lengthSq() > 0) { _aD.copy(bot.lastKnown).sub(a.pos); }
      else {
        if (!bot.hasGoal || a.pos.distanceTo(bot.goal) < 200 || bot.modeT > 25) { bot.goal.set(rrand(-700, 700), rrand(260, 560), rrand(-700, 700)); bot.hasGoal = true; bot.modeT = 0; }
        _aD.copy(bot.goal).sub(a.pos);
      }
      _aD.normalize(); thr = .85;
    }
  }
  // keep inside a sane altitude band
  if (a.pos.y > 1150 && _aD.y > -.1) _aD.y = -.15;
  // mid-air collision avoidance (allies and enemies alike)
  for (const e of GAME.planes) {
    if (e === a || !e.alive) continue;
    _aS.copy(e.pos).sub(a.pos); const d = _aS.length();
    if (d > 140) continue;
    if (_aS.dot(a.fwd) / d > .1) { _aD.addScaledVector(_aS, -(2.6 + (140 - d) * .03) / d); }
  }
  _aD.normalize();
  steerToward(a, _aD, 0, 1);
  a.throttle += (thr - a.throttle) * Math.min(1, dt * 1.6);
  a.wantFire = fire && !a.gun.locked;
}

/* ---------------- gunner brain ---------------- */
function botGunner(a, dt) {
  const t = a.tur, bot = a.bot, T0 = TUR[a.race], C = t.cfg;
  bot.gThinkT -= dt;
  if (bot.gThinkT <= 0) {
    bot.gThinkT = .22 + Math.random() * .1;
    let best = null, bs = 1e9;
    const range = C.type === 'scatter' ? 430 : C.type === 'shell' ? 650 : C.type === 'bolt' ? 900 : 620;
    for (const e of GAME.planes) {
      if (!e.alive || e.team === a.team) continue;
      const d = e.pos.distanceTo(a.pos); if (d > range) continue;
      if (!canSee(a, e)) continue;
      _aT.copy(e.pos).sub(a.pos).normalize();
      if (!inTurretArc(a, _aT)) continue;
      let s = d - (e === bot.gTarget ? 120 : 0) - (e.hp < e.maxHp * .4 ? 90 : 0) + (e.bot && e.bot.target === a ? -60 : 0);
      if (s < bs) { bs = s; best = e; }
    }
    bot.gTarget = best;
  }
  const g = bot.gTarget;
  if (g && g.alive) {
    const d = g.pos.distanceTo(a.pos);
    const tau = cloudAlong(a.pos, g.pos);
    const t0 = interceptDir(a.pos, a.vel, .85, g.pos, g.vel, C.speed, _aL, C.grav || 0);
    // aim wobble: shrinks with skill, grows with cloud between us and with range
    const wob = (1 - bot.skill) * (d * .02) * (1 + tau * 2.5);
    bot.gx += (rrand(-1, 1) * wob - bot.gx) * Math.min(1, dt * 2.5); bot.gy += (rrand(-1, 1) * wob - bot.gy) * Math.min(1, dt * 2.5);
    _aL.x += bot.gx; _aL.y += bot.gy; _aL.z += bot.gx * .5;
    t.aimW.copy(_aL).sub(a.pos).normalize();
    // fire only inside the arc and once the barrel has swung round
    t.want = inTurretArc(a, t.aimW) && t.err < .085 && d < (C.type === 'scatter' ? 430 : 700) && !(g.cloudHidden && d > 150);
  } else {
    // idle sweep around the middle of the firing arc
    bot.sweep += dt * .7;
    const az = (T0.az ? T0.az[0] + Math.sin(bot.sweep) * T0.az[1] * .55 : bot.sweep * .8), el = (T0.el[0] + T0.el[1]) * .5 + Math.sin(bot.sweep * .7) * .25;
    azElToLocal(az, clamp(el, T0.el[0], T0.el[1]), _aT); t.aimW.copy(_aT).applyQuaternion(a.quat);
    t.want = false;
  }
}
