/* ======================================================================
   STAGE 3 — WEAPONS
   forward guns (pilot, overheat) · race turret weapons (gunner, ammo +
   reload) · pooled projectiles with tracers · hit tests · damage
   ====================================================================== */
const D2R = Math.PI / 180;
const WEAP = {
  human: {
    gun: { rate: 22, dmg: 3.6, speed: 600, spread: .8 * D2R, life: 1.25, hps: .30, style: 0 },
    tur: { type: 'gatling', rate: 28, dmg: 4.6, speed: 660, spread: 1.5 * D2R, life: 1.3, ammo: 320, reload: 3.6, style: 4, name: 'Twin Gatling' },
  },
  dwarf: {
    gun: { rate: 15, dmg: 5.2, speed: 520, spread: .7 * D2R, life: 1.3, hps: .28, style: 1 },
    tur: { type: 'shell', rate: 1.5, dmg: 30, splash: 30, speed: 340, grav: 11, spread: .35 * D2R, life: 3.4, ammo: 10, reload: 4.6, style: 5, name: 'Mortar Cannon' },
  },
  elf: {
    gun: { rate: 30, dmg: 2.6, speed: 720, spread: .5 * D2R, life: 1.1, hps: .33, style: 2 },
    tur: { type: 'bolt', rate: 2.4, dmg: 26, speed: 780, homing: 1.7, spread: .2 * D2R, life: 2.0, ammo: 16, reload: 4.0, style: 6, name: 'Moonthorn Lance' },
  },
  orc: {
    gun: { rate: 16, dmg: 5.0, speed: 500, spread: 1.1 * D2R, life: 1.3, hps: .30, style: 3 },
    tur: { type: 'scatter', rate: 2.4, pellets: 5, dmg: 8, speed: 470, spread: 3.6 * D2R, life: .95, ammo: 18, reload: 4.0, style: 7, name: 'Scrap Scatter-gun' },
  },
};
const GUN_COOL = .36;
//            r    g    b   length width  glow
const STYLE = [
  [1.00, .82, .40, 11, .30, 3.2],   // 0 human guns
  [1.00, .55, .20, 12, .42, 3.4],   // 1 dwarf guns
  [.50, 1.0, .80, 16, .24, 3.2],    // 2 elf guns
  [1.00, .36, .16, 10, .46, 3.4],   // 3 orc guns
  [1.00, .95, .65, 14, .40, 3.8],   // 4 human gatling
  [1.00, .60, .18, 9, 1.5, 4.5],    // 5 dwarf shell
  [.45, 1.0, .85, 30, .55, 4.2],    // 6 elf bolt
  [1.00, .32, .12, 8, .85, 4.0],    // 7 orc slug
];

/* ---------------- projectile pool ---------------- */
const PJ = {
  N: 1100, nAlive: 0, cursor: 0,
  x: null, y: null, z: null, vx: null, vy: null, vz: null, life: null, dmg: null, splash: null, grav: null, homing: null, style: null, own: null, team: null, tgt: null, alive: null,
};
{
  const N = PJ.N;
  for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'dmg', 'splash', 'grav', 'homing']) PJ[k] = new Float32Array(N);
  PJ.style = new Uint8Array(N); PJ.alive = new Uint8Array(N); PJ.own = new Int16Array(N); PJ.team = new Int8Array(N); PJ.tgt = new Int16Array(N);
}
let pjMesh = null, pjA = null, pjB = null, pjC = null;
function initProjectileRender() {
  const q = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
  geo.index = q.index; geo.setAttribute('position', q.attributes.position);
  pjA = new THREE.InstancedBufferAttribute(new Float32Array(PJ.N * 4), 4).setUsage(THREE.DynamicDrawUsage);   // head xyz, length
  pjB = new THREE.InstancedBufferAttribute(new Float32Array(PJ.N * 4), 4).setUsage(THREE.DynamicDrawUsage);   // dir xyz, width
  pjC = new THREE.InstancedBufferAttribute(new Float32Array(PJ.N * 4), 4).setUsage(THREE.DynamicDrawUsage);   // rgb, glow
  geo.setAttribute('aHead', pjA); geo.setAttribute('aDir', pjB); geo.setAttribute('aCol', pjC);
  geo.instanceCount = 0;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]);
  for (const k in G) uniforms[k] = G[k];
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec4 aHead; attribute vec4 aDir; attribute vec4 aCol;
      varying vec2 vUv; varying vec4 vCol;
      #include <fog_pars_vertex>
      void main(){
        vec4 p0 = viewMatrix * vec4(aHead.xyz, 1.0);
        vec4 p1 = viewMatrix * vec4(aHead.xyz - aDir.xyz * aHead.w, 1.0);
        vec2 d = p1.xy - p0.xy; float dl = length(d);
        vec2 perp = dl > 1e-4 ? vec2(-d.y, d.x) / dl : vec2(0.0, 1.0);
        float t = position.y + 0.5;                       // 0 = head, 1 = tail
        vec4 mvPosition = mix(p0, p1, t);
        float dist = max(-mvPosition.z, 1.0);
        float w = max(aDir.w, dist * 0.0026);              // never thinner than ~2 px
        mvPosition.xy += perp * position.x * w;
        mvPosition.xy -= (dl > 1e-4 ? d / dl : vec2(1.0, 0.0)) * (1.0 - t) * 0.0;
        gl_Position = projectionMatrix * mvPosition;
        vUv = vec2(position.x * 2.0, t); vCol = aCol;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      varying vec2 vUv; varying vec4 vCol;
      #include <fog_pars_fragment>
      void main(){
        float across = 1.0 - abs(vUv.x);
        float along = pow(1.0 - vUv.y, 1.6);
        float core = pow(across, 3.0) * 0.9 + pow(across, 1.0) * 0.35;
        vec3 col = vCol.rgb * vCol.w * core * (0.35 + 0.9 * along) + vec3(1.0) * pow(across, 8.0) * along * 0.9;
        float a = along * across;
        #ifdef USE_FOG
          float ff = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          col *= (1.0 - ff);
        #endif
        gl_FragColor = vec4(col * a, 1.0);
      }`,
  });
  pjMesh = new THREE.Mesh(geo, mat); pjMesh.frustumCulled = false; pjMesh.renderOrder = 7;
  scene.add(pjMesh);
}
function spawnProj(style, x, y, z, vx, vy, vz, owner, dmg, life, splash = 0, grav = 0, homing = 0, tgt = -1) {
  let i = -1;
  for (let k = 0; k < PJ.N; k++) { const j = (PJ.cursor + k) % PJ.N; if (!PJ.alive[j]) { i = j; PJ.cursor = (j + 1) % PJ.N; break; } }
  if (i < 0) return -1;
  PJ.alive[i] = 1; PJ.x[i] = x; PJ.y[i] = y; PJ.z[i] = z; PJ.vx[i] = vx; PJ.vy[i] = vy; PJ.vz[i] = vz;
  PJ.life[i] = life; PJ.dmg[i] = dmg; PJ.splash[i] = splash; PJ.grav[i] = grav; PJ.homing[i] = homing; PJ.style[i] = style;
  PJ.own[i] = owner.id; PJ.team[i] = owner.team; PJ.tgt[i] = tgt; PJ.nAlive++;
  return i;
}
const planeById = (id) => GAME.planes[id];     // planes are never spliced during a battle -> id === index

/* ---------------- plane weapon state ---------------- */
function initWeapons(a) {
  const W = WEAP[a.race];
  a.gun = { heat: 0, locked: false, acc: 0, alt: 0, cfg: W.gun };
  a.wantFire = false;
  a.tur = { ammo: W.tur.ammo, max: W.tur.ammo, reload: 0, acc: 0, alt: 0, cfg: W.tur, az: 0, el: 0, aimW: new THREE.Vector3(0, 0, 1), dirW: new THREE.Vector3(0, 0, 1), limited: false, want: false, err: 0, ready: true };
  a.tur.az = TUR[a.race].az ? TUR[a.race].az[0] : 0; a.tur.el = 0;
}
const _mp = new THREE.Vector3(), _md = new THREE.Vector3(), _mq = new THREE.Vector3();
function muzzleWorldFwd(a, i, out) {                   // forward-gun muzzle in world space
  out.copy(a.tpl.fwdMuzzles[i % a.tpl.fwdMuzzles.length]).multiplyScalar(AC_SCALE).applyQuaternion(a.quat).add(a.pos);
  return out;
}
const _rsA = new THREE.Vector3(), _rsB = new THREE.Vector3();
function randSpread(dir, spread) {                     // perturb a unit vector inside a cone
  if (spread <= 0) return dir;
  const r = Math.sqrt(Math.random()) * spread, ang = Math.random() * Math.PI * 2;
  _rsA.set(Math.random() - .5, Math.random() - .5, Math.random() - .5).cross(dir);
  if (_rsA.lengthSq() < 1e-8) _rsA.set(1, 0, 0).cross(dir);
  _rsA.normalize();
  _rsB.copy(dir).cross(_rsA);
  dir.addScaledVector(_rsA, Math.cos(ang) * r).addScaledVector(_rsB, Math.sin(ang) * r).normalize();
  return dir;
}
function updateGuns(a, dt) {
  const g = a.gun, C = g.cfg;
  if (g.heat > 0) g.heat = Math.max(0, g.heat - GUN_COOL * dt * (g.locked ? .8 : 1) * (a.wantFire && !g.locked ? 0 : 1));
  if (g.locked && g.heat < .38) g.locked = false;
  if (!(a.wantFire && !g.locked && a.alive)) { g.acc = Math.min(g.acc, .99); return; }
  g.acc += dt * C.rate;
  const hpShot = C.hps / C.rate;
  while (g.acc >= 1 && !g.locked) {
    g.acc -= 1;
    const i = g.alt++ & 1;
    muzzleWorldFwd(a, i, _mp);
    _md.copy(a.fwd).multiplyScalar(420).add(a.pos).sub(_mp).normalize();                 // guns converge ~420 m ahead
    randSpread(_md, C.spread);
    spawnProj(C.style, _mp.x, _mp.y, _mp.z, _md.x * C.speed + a.vel.x * .92, _md.y * C.speed + a.vel.y * .92, _md.z * C.speed + a.vel.z * .92, a, C.dmg, C.life);
    g.heat += hpShot;
    if (a === GAME.player) GAME.stats.shots++;
    if (g.heat >= 1) { g.locked = true; g.heat = 1; fxToast(a, 'GUNS OVERHEATED'); }
    if (typeof fxMuzzle === 'function') fxMuzzle(_mp, a.fwd, 1);
  }
}
function updateTurretFire(a, dt) {
  const t = a.tur, C = t.cfg;
  if (t.reload > 0) { t.reload -= dt; if (t.reload <= 0) { t.ammo = t.max; t.reload = 0; } }
  const aligned = t.err < (a.isPlayer && a.mode === 'gunner' ? 1.2 : .09);
  if (!(t.want && a.alive && t.reload <= 0 && t.ammo > 0 && aligned)) { t.acc = Math.min(t.acc, .99); return; }
  t.acc += dt * C.rate;
  const obj = a.obj; obj.root.updateMatrixWorld(true);
  while (t.acc >= 1 && t.ammo > 0) {
    t.acc -= 1;
    const gun = obj.guns[0], mi = t.alt++ % gun.muzzles.length;
    gun.muzzles[mi].getWorldPosition(_mp);
    _md.copy(t.dirW);
    const base = _md.clone();
    const n = C.type === 'scatter' ? C.pellets : 1;
    for (let k = 0; k < n; k++) {
      _md.copy(base); randSpread(_md, C.spread);
      let tgt = -1;
      if (C.type === 'bolt') tgt = pickHomingTarget(a, base);
      spawnProj(C.style, _mp.x, _mp.y, _mp.z, _md.x * C.speed + a.vel.x * .85, _md.y * C.speed + a.vel.y * .85, _md.z * C.speed + a.vel.z * .85, a, C.dmg, C.life, C.splash || 0, C.grav || 0, C.homing || 0, tgt);
    }
    t.ammo--;
    if (a === GAME.player) GAME.stats.shots++;
    if (typeof fxMuzzle === 'function') fxMuzzle(_mp, base, C.type === 'shell' ? 3 : C.type === 'scatter' ? 2.4 : 1.4);
    if (a === GAME.view && C.type === 'shell') GAME.shake = Math.max(GAME.shake, .22);
    if (t.ammo <= 0) { t.reload = C.reload; fxToast(a, 'RELOADING'); break; }
  }
}
const _hv = new THREE.Vector3();
function pickHomingTarget(a, dir) {                    // enemy closest to the aim line within a ~20 degree cone
  let best = -1, bestD = Math.cos(20 * D2R);
  for (const e of GAME.planes) {
    if (!e.alive || e.team === a.team) continue;
    _hv.copy(e.pos).sub(a.pos); const d = _hv.length(); if (d > 1200) continue;
    const c = _hv.multiplyScalar(1 / d).dot(dir);
    if (c > bestD) { bestD = c; best = e.id; }
  }
  return best;
}
function fxToast(a, msg) { if (a === GAME.player && typeof showWarn === 'function') showWarn(msg, 1.2, true); }

/* ---------------- projectile update + hit tests ---------------- */
const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _dd = new THREE.Vector3(), _ff = new THREE.Vector3();
function segSphere(p0, d, c, R) {                      // returns t in [0,1] or -1
  _ff.copy(p0).sub(c);
  const a = d.lengthSq(), b = 2 * _ff.dot(d), cc = _ff.lengthSq() - R * R;
  if (cc < 0) return 0;
  const disc = b * b - 4 * a * cc; if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}
function updateProjectiles(dt) {
  let n = 0;
  const A = pjA.array, B = pjB.array, Cc = pjC.array;
  const planes = GAME.planes;
  for (let i = 0; i < PJ.N; i++) {
    if (!PJ.alive[i]) continue;
    let vx = PJ.vx[i], vy = PJ.vy[i], vz = PJ.vz[i];
    const px = PJ.x[i], py = PJ.y[i], pz = PJ.z[i];
    // gravity + homing
    if (PJ.grav[i]) vy -= PJ.grav[i] * dt;
    if (PJ.homing[i] && PJ.tgt[i] >= 0) {
      const e = planes[PJ.tgt[i]];
      if (e && e.alive) {
        _hv.copy(e.pos).addScaledVector(e.vel, .12).sub(_p0.set(px, py, pz));
        const dl = _hv.length(), sp = Math.hypot(vx, vy, vz);
        if (dl > 1) {
          _hv.multiplyScalar(1 / dl);
          const cur = _dd.set(vx / sp, vy / sp, vz / sp), turn = Math.min(1, PJ.homing[i] * dt);
          cur.lerp(_hv, turn).normalize(); vx = cur.x * sp; vy = cur.y * sp; vz = cur.z * sp;
        }
      }
    }
    PJ.vx[i] = vx; PJ.vy[i] = vy; PJ.vz[i] = vz;
    const nx = px + vx * dt, ny = py + vy * dt, nz = pz + vz * dt;
    PJ.life[i] -= dt;
    let hit = false, detonate = false, hx = nx, hy = ny, hz = nz, victim = null;
    // ---- aircraft
    _p0.set(px, py, pz); _dd.set(vx * dt, vy * dt, vz * dt);
    const sp = PJ.splash[i], team = PJ.team[i];
    let bestT = 2;
    for (let k = 0; k < planes.length; k++) {
      const e = planes[k];
      if (!e.alive || e.team === team) continue;
      const R = e.radius + (sp ? 5 : .6);
      const t = segSphere(_p0, _dd, e.pos, R);
      if (t >= 0 && t < bestT) { bestT = t; victim = e; }
    }
    if (victim) { hit = true; hx = px + _dd.x * bestT; hy = py + _dd.y * bestT; hz = pz + _dd.z * bestT; }
    // ---- terrain / buildings (check end point and middle of the step)
    if (!hit) {
      const mx = (px + nx) * .5, mz = (pz + nz) * .5;
      if (ny < solidH(nx, nz) + .3) { hit = true; hy = Math.max(ny, groundH(nx, nz)); }
      else if ((py + ny) * .5 < solidH(mx, mz) + .3) { hit = true; hx = mx; hz = mz; hy = (py + ny) * .5; }
    }
    if (hit || PJ.life[i] <= 0) {
      PJ.alive[i] = 0; PJ.nAlive--;
      const atk = planeById(PJ.own[i]);
      if (sp > 0) {
        explodeAt(hx, hy, hz, sp, PJ.dmg[i], atk, victim);
      } else if (hit) {
        if (victim) {
          damagePlane(victim, PJ.dmg[i], atk);
          if (atk === GAME.player) GAME.stats.hits++;
          if (typeof fxHit === 'function') fxHit(hx, hy, hz, PJ.style[i], true);
        } else if (typeof fxHit === 'function') fxHit(hx, hy, hz, PJ.style[i], false);
      }
      continue;
    }
    PJ.x[i] = nx; PJ.y[i] = ny; PJ.z[i] = nz;
    const s = STYLE[PJ.style[i]], spd = Math.hypot(vx, vy, vz) || 1, o = n * 4;
    A[o] = nx; A[o + 1] = ny; A[o + 2] = nz; A[o + 3] = s[3];
    B[o] = vx / spd; B[o + 1] = vy / spd; B[o + 2] = vz / spd; B[o + 3] = s[4];
    Cc[o] = s[0]; Cc[o + 1] = s[1]; Cc[o + 2] = s[2]; Cc[o + 3] = s[5];
    n++;
  }
  pjMesh.geometry.instanceCount = n;
  pjA.needsUpdate = pjB.needsUpdate = pjC.needsUpdate = true;
}

function explodeAt(x, y, z, radius, dmg, attacker, direct) {
  if (typeof fxExplosion === 'function') fxExplosion(x, y, z, radius * .55, 1);
  for (const e of GAME.planes) {
    if (!e.alive || (attacker && e.team === attacker.team)) continue;
    const d = Math.hypot(e.pos.x - x, e.pos.y - y, e.pos.z - z) - e.radius * .6;
    if (d > radius) continue;
    const f = 1 - clamp01(d / radius) * .75;
    damagePlane(e, dmg * f * (e === direct ? 1.0 : .85), attacker);
    if (attacker === GAME.player) GAME.stats.hits++;
  }
  // shake the camera when close
  const cd = camera.position.distanceTo(_p1.set(x, y, z));
  if (cd < 160) GAME.shake = Math.max(GAME.shake, (1 - cd / 160) * .5);
}

/* ---------------- damage + destruction ---------------- */
const DMG_SCALE = .38;                                  // global lethality knob (battles should last minutes, not seconds)
function damagePlane(a, amount, attacker, raw = false) {
  if (!a.alive) return;
  a.hp -= amount * a.cfg.taken * (raw ? 1 : DMG_SCALE);
  a.lastHitT = GAME.t; a.lastHitBy = attacker || a.lastHitBy; a.hitFlash = 1;
  if (a === GAME.view || a === GAME.player) { GAME.flash = Math.min(1, GAME.flash + amount * .02); GAME.shake = Math.max(GAME.shake, Math.min(.5, amount * .03)); }
  if (a.hp <= 0) { a.hp = 0; killPlane(a, attacker, 'shot'); }
}
function killPlane(a, attacker, cause) {
  if (!a.alive) return;
  a.alive = false; a.dying = 1; a.dyingT = 0; a.hp = 0;
  a.spin = { x: rrand(-1, 1), y: rrand(-.5, .5), z: (Math.random() < .5 ? -1 : 1) * rrand(1.8, 4.2) };
  const T = GAME.teams[a.team]; T.alive--; GAME.lastKillT = GAME.t;
  if (attacker && attacker !== a) { attacker.kills++; if (attacker === GAME.player) GAME.stats.kills++; }
  if (typeof onPlaneKilled === 'function') onPlaneKilled(a, attacker, cause);
}
