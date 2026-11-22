/* ======================================================================
   STAGE 7 — EFFECTS
   two pooled billboard particle systems (alpha: steam / smoke / dust,
   additive: fire / sparks / flashes) + pooled instanced debris.
   Nothing is allocated per frame: fixed typed-array pools, one draw call each.
   ====================================================================== */
class ParticlePool {
  constructor(N, additive) {
    this.N = N; this.additive = additive; this.cursor = 0; this.nAlive = 0;
    const f = (k) => new Float32Array(N * k);
    this.px = f(1); this.py = f(1); this.pz = f(1); this.vx = f(1); this.vy = f(1); this.vz = f(1);
    this.life = f(1); this.maxLife = f(1); this.s0 = f(1); this.s1 = f(1); this.a0 = f(1);
    this.c0 = f(3); this.c1 = f(3); this.drag = f(1); this.buoy = f(1); this.rot = f(1); this.rotv = f(1); this.seed = f(1); this.pw = f(1);
    this.alive = new Uint8Array(N);
    const q = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
    geo.index = q.index; geo.setAttribute('position', q.attributes.position);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPos', this.aPos); geo.setAttribute('aCol', this.aCol); geo.setAttribute('aRot', this.aRot);
    geo.instanceCount = 0;
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]);
    for (const k in G) uniforms[k] = G[k];
    const mat = new THREE.ShaderMaterial({
      uniforms, fog: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      defines: additive ? { NEARA: '3.0', NEARB: '14.0' } : { NEARA: '9.0', NEARB: '48.0' },
      vertexShader: `
        attribute vec4 aPos; attribute vec4 aCol; attribute vec2 aRot;
        varying vec2 vUv; varying vec4 vCol; varying float vSeed;
        #include <fog_pars_vertex>
        void main(){
          vec4 mvPosition = viewMatrix * vec4(aPos.xyz, 1.0);
          float c = cos(aRot.x), s = sin(aRot.x);
          vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
          float dist = -mvPosition.z;
          mvPosition.xy += q * aPos.w;
          gl_Position = projectionMatrix * mvPosition;
          vUv = position.xy * 2.0; vCol = aCol; vCol.a *= smoothstep(NEARA, NEARB, dist); vSeed = aRot.y;
          #include <fog_vertex>
        }`,
      fragmentShader: additive ? `
        varying vec2 vUv; varying vec4 vCol; varying float vSeed;
        #include <fog_pars_fragment>
        void main(){
          float d2 = dot(vUv, vUv); if (d2 > 1.0) discard;
          float g = exp(-d2 * 3.2) * (1.0 - d2) + exp(-d2 * 18.0) * 0.9;
          vec3 col = vCol.rgb * g * vCol.a;
          #ifdef USE_FOG
            float ff = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
            col *= (1.0 - ff);
          #endif
          gl_FragColor = vec4(col, 1.0);
        }` : `
        uniform float uDayLight; uniform float uNight;
        varying vec2 vUv; varying vec4 vCol; varying float vSeed;
        ${GLSL_NOISE}
        #include <fog_pars_fragment>
        void main(){
          float d2 = dot(vUv, vUv); if (d2 > 1.0) discard;
          float n = vnoise(vUv * 2.3 + vSeed * 40.0);
          float a = exp(-d2 * 2.3) * (0.5 + 0.9 * n) * (1.0 - smoothstep(0.5, 1.0, d2));
          a = clamp(a, 0.0, 1.0) * vCol.a;
          vec3 col = vCol.rgb * (0.14 + 0.86 * uDayLight);
          gl_FragColor = vec4(col, a);
          #include <fog_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 8 : 6;
    scene.add(this.mesh);
  }
  spawn(x, y, z, vx, vy, vz, s0, s1, life, c0, c1, a0, drag = 1, buoy = 0, pw = 1.2) {
    let i = -1; const N = this.N;
    for (let k = 0; k < N; k++) { const j = (this.cursor + k) % N; if (!this.alive[j]) { i = j; this.cursor = (j + 1) % N; break; } }
    if (i < 0) { i = this.cursor; this.cursor = (i + 1) % N; this.nAlive--; }       // recycle the oldest slot when full
    this.alive[i] = 1; this.nAlive++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = 0; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0;
    this.c0[i * 3] = c0[0]; this.c0[i * 3 + 1] = c0[1]; this.c0[i * 3 + 2] = c0[2];
    this.c1[i * 3] = c1[0]; this.c1[i * 3 + 1] = c1[1]; this.c1[i * 3 + 2] = c1[2];
    this.drag[i] = drag; this.buoy[i] = buoy; this.rot[i] = Math.random() * 6.283; this.rotv[i] = (Math.random() - .5) * 1.6; this.seed[i] = Math.random(); this.pw[i] = pw;
  }
  update(dt) {
    let n = 0; const N = this.N, P = this.aPos.array, C = this.aCol.array, R = this.aRot.array;
    for (let i = 0; i < N; i++) {
      if (!this.alive[i]) continue;
      const l = (this.life[i] += dt), ml = this.maxLife[i];
      if (l >= ml) { this.alive[i] = 0; this.nAlive--; continue; }
      const f = l / ml, dg = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= dg; this.vz[i] *= dg; this.vy[i] = this.vy[i] * dg + this.buoy[i] * dt;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.rotv[i] * dt;
      const o = n * 4, o3 = i * 3, e = 1 - Math.pow(1 - f, 2);
      P[o] = this.px[i]; P[o + 1] = this.py[i]; P[o + 2] = this.pz[i]; P[o + 3] = this.s0[i] + (this.s1[i] - this.s0[i]) * e;
      const fade = (f < .1 ? f / .1 : 1) * Math.pow(1 - f, this.pw[i]);
      C[o] = this.c0[o3] + (this.c1[o3] - this.c0[o3]) * f; C[o + 1] = this.c0[o3 + 1] + (this.c1[o3 + 1] - this.c0[o3 + 1]) * f; C[o + 2] = this.c0[o3 + 2] + (this.c1[o3 + 2] - this.c0[o3 + 2]) * f;
      C[o + 3] = this.a0[i] * fade;
      R[n * 2] = this.rot[i]; R[n * 2 + 1] = this.seed[i];
      n++;
    }
    this.mesh.geometry.instanceCount = n;
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aRot.needsUpdate = true;
  }
  clear() { this.alive.fill(0); this.nAlive = 0; this.mesh.geometry.instanceCount = 0; }
}

let smokeFx = null, fireFx = null, debrisMesh = null;
const DEB = { N: 150, n: 0, cursor: 0, alive: new Uint8Array(150), px: new Float32Array(150), py: new Float32Array(150), pz: new Float32Array(150), vx: new Float32Array(150), vy: new Float32Array(150), vz: new Float32Array(150),
  q: Array.from({ length: 150 }, () => new THREE.Quaternion()), ax: new Float32Array(150 * 3), av: new Float32Array(150), sx: new Float32Array(150), sy: new Float32Array(150), sz: new Float32Array(150), life: new Float32Array(150), trail: new Float32Array(150), rest: new Uint8Array(150), col: new Float32Array(150 * 3) };
const BURN = { N: 14, x: new Float32Array(14), y: new Float32Array(14), z: new Float32Array(14), t: new Float32Array(14), dur: new Float32Array(14), size: new Float32Array(14), cur: 0, acc: new Float32Array(14) };
const C_ = (r, g, b) => [r, g, b];
const FXC = {
  smokeDark: C_(.06, .055, .05), smokeGrey: C_(.34, .33, .32), smokeLight: C_(.6, .6, .6), steam: C_(.92, .94, .96), dust: C_(.5, .42, .3), soot: C_(.015, .015, .015),
  fireY: C_(1.0, .82, .35), fireO: C_(1.0, .42, .08), fireR: C_(.55, .08, .02), white: C_(1, .95, .8), spark: C_(1, .72, .3),
};
const _fp = new THREE.Vector3(), _fd = new THREE.Vector3();

function initFx() {
  if (smokeFx) return;
  smokeFx = new ParticlePool(2800, false); fireFx = new ParticlePool(1500, true);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff }); mat.onBeforeCompile = hookGlobals;
  debrisMesh = new THREE.InstancedMesh(geo, mat, DEB.N);
  debrisMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DEB.N * 3).fill(1), 3);
  debrisMesh.frustumCulled = false; debrisMesh.count = 0; scene.add(debrisMesh);
  debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
}
function fxReset() {
  initFx(); smokeFx.clear(); fireFx.clear(); DEB.alive.fill(0); DEB.n = 0; debrisMesh.count = 0; BURN.t.fill(0); BURN.dur.fill(0);
}
const camDist2 = (x, y, z) => { const c = camera.position, dx = x - c.x, dy = y - c.y, dz = z - c.z; return dx * dx + dy * dy + dz * dz; };

/* ---------------- one-shot effects ---------------- */
function fxMuzzle(p, dir, scale = 1) {
  if (camDist2(p.x, p.y, p.z) > 900 * 900) return;
  const s = 1.7 * scale;
  fireFx.spawn(p.x, p.y, p.z, dir.x * 8, dir.y * 8, dir.z * 8, s, s * .5, .07, FXC.fireY, FXC.fireO, .95, 2);
  if (scale > 2) {                                       // cannon / scatter-gun: smoke ring + more flash
    fireFx.spawn(p.x + dir.x * 2, p.y + dir.y * 2, p.z + dir.z * 2, dir.x * 20, dir.y * 20, dir.z * 20, s * 1.5, s * 2.2, .16, FXC.fireO, FXC.fireR, .8, 3);
    smokeFx.spawn(p.x, p.y, p.z, dir.x * 10, dir.y * 10 + 2, dir.z * 10, 1.5, 6, 1.1, FXC.smokeGrey, FXC.smokeLight, .5, 1.2, 2);
  }
}
function fxHit(x, y, z, style, onPlane) {
  if (camDist2(x, y, z) > 1500 * 1500) return;
  if (onPlane) {
    for (let i = 0; i < 5; i++) fireFx.spawn(x, y, z, rrand(-22, 22), rrand(-8, 24), rrand(-22, 22), rrand(.35, .7), .08, rrand(.2, .5), FXC.spark, FXC.fireR, 1, .4, -14);
    fireFx.spawn(x, y, z, 0, 0, 0, 3.2, 5, .12, FXC.white, FXC.fireO, .85, 3);
    smokeFx.spawn(x, y, z, rrand(-3, 3), rrand(0, 4), rrand(-3, 3), 1.2, 3.6, .9, FXC.smokeDark, FXC.smokeGrey, .55, 1.5, 1);
  } else {
    smokeFx.spawn(x, y + .4, z, rrand(-2, 2), rrand(3, 7), rrand(-2, 2), 1.6, 6.5, 1.5, FXC.dust, FXC.smokeLight, .5, 1.2, 1.6);
    for (let i = 0; i < 3; i++) fireFx.spawn(x, y + .3, z, rrand(-12, 12), rrand(6, 20), rrand(-12, 12), rrand(.25, .5), .06, rrand(.2, .45), FXC.spark, FXC.fireR, .95, .4, -16);
  }
}
function fxExplosion(x, y, z, size = 8, power = 1) {
  const d2 = camDist2(x, y, z); if (d2 > 3200 * 3200) return;
  const k = size / 8;
  fireFx.spawn(x, y, z, 0, 0, 0, size * 1.1, size * 3.2, .22, FXC.white, FXC.fireO, 1, 2, 0, 1);              // flash
  const n = Math.min(18, Math.round(8 + size * .6));
  for (let i = 0; i < n; i++) {                                                                                 // fireball
    const a = Math.random() * 6.283, b = (Math.random() - .3) * 1.4, sp = rrand(.8, 2.3) * size, cb = Math.cos(b);
    fireFx.spawn(x + rrand(-1, 1) * k, y + rrand(-1, 1) * k, z + rrand(-1, 1) * k, Math.cos(a) * cb * sp, Math.sin(b) * sp + size * .6, Math.sin(a) * cb * sp, size * rrand(.7, 1.2), size * rrand(1.4, 2.4), rrand(.45, 1.0), FXC.fireY, FXC.fireR, .95, 2.6, 2, 1.4);
  }
  for (let i = 0; i < Math.min(16, 6 + size * .5); i++) {                                                       // smoke
    const a = Math.random() * 6.283, sp = rrand(.2, 1.4) * size * .55;
    smokeFx.spawn(x + rrand(-1, 1) * k, y + rrand(-.5, 1.5) * k, z + rrand(-1, 1) * k, Math.cos(a) * sp, rrand(.4, 1.6) * size * .5, Math.sin(a) * sp, size * rrand(.7, 1.2), size * rrand(2.2, 3.6), rrand(2.2, 4.2), FXC.smokeDark, FXC.smokeGrey, .62, .9, 3, .9);
  }
  for (let i = 0; i < 12 * Math.min(2, power); i++) {                                                           // sparks
    const sp = rrand(.6, 2.4) * size * 2.6, a = Math.random() * 6.283, b = (Math.random() - .2) * 1.5, cb = Math.cos(b);
    fireFx.spawn(x, y, z, Math.cos(a) * cb * sp, Math.sin(b) * sp, Math.sin(a) * cb * sp, rrand(.4, .9), .05, rrand(.5, 1.3), FXC.spark, FXC.fireR, 1, .3, -16);
  }
}
function spawnDebris(x, y, z, vx, vy, vz, n, size, race, spread = 1) {
  const pal = { human: [[.76, .56, .22], [.9, .83, .66], [.15, .28, .45], [.45, .27, .12]], dwarf: [[.2, .2, .22], [.55, .3, .16], [.45, .12, .1], [.35, .35, .38]], elf: [[.85, .75, .5], [.35, .6, .45], [.6, .46, .25], [.95, .93, .85]], orc: [[.4, .26, .16], [.3, .31, .2], [.2, .2, .22], [.5, .2, .15]] }[race] || [[.5, .5, .5]];
  const col = DEB.col;
  for (let k = 0; k < n; k++) {
    let i = -1;
    for (let j = 0; j < DEB.N; j++) { const q = (DEB.cursor + j) % DEB.N; if (!DEB.alive[q]) { i = q; DEB.cursor = (q + 1) % DEB.N; break; } }
    if (i < 0) { i = DEB.cursor; DEB.cursor = (i + 1) % DEB.N; }
    DEB.alive[i] = 1; DEB.rest[i] = 0;
    DEB.px[i] = x + rrand(-1, 1) * size * .4; DEB.py[i] = y + rrand(-.5, 1) * size * .3; DEB.pz[i] = z + rrand(-1, 1) * size * .4;
    DEB.vx[i] = vx * .6 + rrand(-1, 1) * 24 * spread; DEB.vy[i] = vy * .4 + rrand(2, 26) * spread; DEB.vz[i] = vz * .6 + rrand(-1, 1) * 24 * spread;
    DEB.q[i].set(Math.random() - .5, Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize();
    DEB.ax[i * 3] = Math.random() - .5; DEB.ax[i * 3 + 1] = Math.random() - .5; DEB.ax[i * 3 + 2] = Math.random() - .5; DEB.av[i] = rrand(2, 10);
    const s = size * rrand(.12, .5);
    DEB.sx[i] = s * rrand(.5, 2.2); DEB.sy[i] = s * rrand(.1, .8); DEB.sz[i] = s * rrand(.6, 1.8);
    DEB.life[i] = rrand(8, 16); DEB.trail[i] = Math.random() < .55 ? rrand(1.2, 3.2) : 0;
    const c = pal[(Math.random() * pal.length) | 0], sh = rrand(.7, 1.1);
    col[i * 3] = c[0] * sh; col[i * 3 + 1] = c[1] * sh; col[i * 3 + 2] = c[2] * sh;
  }
}
const _dM = new THREE.Matrix4(), _dP = new THREE.Vector3(), _dS = new THREE.Vector3(), _dA = new THREE.Vector3(), _dQ = new THREE.Quaternion();
function updateDebris(dt) {
  let n = 0; const col = debrisMesh.instanceColor.array;
  for (let i = 0; i < DEB.N; i++) {
    if (!DEB.alive[i]) continue;
    DEB.life[i] -= dt;
    if (DEB.life[i] <= 0) { DEB.alive[i] = 0; continue; }
    if (!DEB.rest[i]) {
      DEB.vy[i] -= 22 * dt; DEB.vx[i] *= (1 - .15 * dt); DEB.vz[i] *= (1 - .15 * dt);
      DEB.px[i] += DEB.vx[i] * dt; DEB.py[i] += DEB.vy[i] * dt; DEB.pz[i] += DEB.vz[i] * dt;
      _dA.set(DEB.ax[i * 3], DEB.ax[i * 3 + 1], DEB.ax[i * 3 + 2]).normalize(); _dQ.setFromAxisAngle(_dA, DEB.av[i] * dt); DEB.q[i].premultiply(_dQ);
      const g = solidH(DEB.px[i], DEB.pz[i]);
      if (DEB.py[i] < g + .2) {
        DEB.py[i] = g + .2;
        if (DEB.vy[i] < -4) { DEB.vy[i] *= -.28; DEB.vx[i] *= .5; DEB.vz[i] *= .5; DEB.av[i] *= .5; if (Math.random() < .5 && camDist2(DEB.px[i], DEB.py[i], DEB.pz[i]) < 1200 * 1200) smokeFx.spawn(DEB.px[i], g + .5, DEB.pz[i], 0, 2, 0, 1.2, 4, 1.2, FXC.dust, FXC.smokeLight, .4, 1, 1); }
        else { DEB.rest[i] = 1; DEB.vy[i] = 0; }
      }
      if (DEB.trail[i] > 0) {
        DEB.trail[i] -= dt;
        if (Math.random() < dt * 14 && camDist2(DEB.px[i], DEB.py[i], DEB.pz[i]) < 1500 * 1500) smokeFx.spawn(DEB.px[i], DEB.py[i], DEB.pz[i], 0, 1, 0, .9, 3.4, 1.8, FXC.smokeDark, FXC.smokeGrey, .55, 1, .5);
        if (Math.random() < dt * 8) fireFx.spawn(DEB.px[i], DEB.py[i], DEB.pz[i], 0, 0, 0, 1.2, .3, .35, FXC.fireO, FXC.fireR, .8, 1);
      }
    }
    const s = DEB.life[i] < 1 ? DEB.life[i] : 1;
    _dP.set(DEB.px[i], DEB.py[i], DEB.pz[i]); _dS.set(DEB.sx[i] * s, DEB.sy[i] * s, DEB.sz[i] * s);
    _dM.compose(_dP, DEB.q[i], _dS); debrisMesh.setMatrixAt(n, _dM);
    col[n * 3] = DEB.col[i * 3]; col[n * 3 + 1] = DEB.col[i * 3 + 1]; col[n * 3 + 2] = DEB.col[i * 3 + 2];
    n++;
  }
  debrisMesh.count = n; debrisMesh.instanceMatrix.needsUpdate = true; debrisMesh.instanceColor.needsUpdate = true;
}

function fxCrash(a) {                                  // aircraft hits the ground (or burns out)
  const g = solidH(a.pos.x, a.pos.z);
  const p = a.pos, y = Math.max(p.y, g + 2);
  fxExplosion(p.x, y, p.z, 15, 2);
  spawnDebris(p.x, y, p.z, a.vel.x, a.vel.y * .2, a.vel.z, 16, 4.5, a.race, 1.25);
  const i = BURN.cur++ % BURN.N; BURN.x[i] = p.x; BURN.y[i] = g; BURN.z[i] = p.z; BURN.t[i] = 0; BURN.dur[i] = 28; BURN.size[i] = 1;
  const cd = Math.sqrt(camDist2(p.x, y, p.z)); if (cd < 260) GAME.shake = Math.max(GAME.shake, (1 - cd / 260) * .8);
}
function onPlaneKilled(a, attacker, cause) {
  fxExplosion(a.pos.x, a.pos.y, a.pos.z, 7, 1);
  spawnDebris(a.pos.x, a.pos.y, a.pos.z, a.vel.x, a.vel.y, a.vel.z, 7, 3.2, a.race, 1);
  (GAME.log || (GAME.log = [])).push({ t: +GAME.t.toFixed(1), v: a.name + '/' + a.race, by: attacker ? attacker.name + '/' + attacker.race : null, cause, alt: Math.round(a.alt), hp: Math.round(a.hp) });
  addKillFeed(a, attacker, cause);
  if (a.isPlayer) { showToast('Your aircraft is going down!', 2.5); if (document.pointerLockElement) { /* keep the lock; spectating continues */ } }
}

/* ---------------- continuous effects ---------------- */
function updateBurners(dt) {
  for (let i = 0; i < BURN.N; i++) {
    if (BURN.dur[i] <= 0) continue;
    BURN.t[i] += dt; if (BURN.t[i] > BURN.dur[i]) { BURN.dur[i] = 0; continue; }
    const k = 1 - BURN.t[i] / BURN.dur[i];
    if (camDist2(BURN.x[i], BURN.y[i], BURN.z[i]) > 2600 * 2600) continue;
    BURN.acc[i] += dt * (10 + 26 * k);
    while (BURN.acc[i] >= 1) {
      BURN.acc[i] -= 1;
      const x = BURN.x[i] + rrand(-3, 3), z = BURN.z[i] + rrand(-3, 3);
      smokeFx.spawn(x, BURN.y[i] + 1.5, z, rrand(-1, 1) + G.uWind.value.x * .2, rrand(5, 10), rrand(-1, 1) + G.uWind.value.z * .2, 3 + 3 * k, 14 + 8 * k, rrand(3.2, 5.5), FXC.smokeDark, FXC.smokeGrey, .75 * (.4 + .6 * k), .5, 2.2, .9);
      if (Math.random() < .7 * k + .1) fireFx.spawn(x, BURN.y[i] + .8, z, rrand(-1, 1), rrand(3, 7), rrand(-1, 1), rrand(2.4, 4.2), .5, rrand(.4, .8), FXC.fireY, FXC.fireR, .8, 1.2, 1.5);
    }
  }
}
function planeEngineLocal(a, out) { return out.set(0, a.tpl.box.max.y * .15, a.tpl.box.max.z * .3); }
function updatePlaneFx(a, dt) {
  if (a.gone) return;
  const T = GAME.t, d2 = camDist2(a.pos.x, a.pos.y, a.pos.z);
  const fa = a.fxAcc || (a.fxAcc = { e: new Float32Array(12), dmg: 0, fire: 0, spark: 0 });
  const hpf = a.hp / a.maxHp, alive = a.alive;
  // ---- pipes: steam / chimney smoke (only worth it close to the camera)
  if (alive && d2 < 620 * 620) {
    const em = a.tpl.emitters, thr = .45 + a.throttle * .55;
    for (let i = 0; i < em.length && i < 12; i++) {
      const e = em[i];
      let rate = e.rate * thr * (d2 > 330 * 330 ? .5 : 1);
      if (e.intermittent) rate *= Math.sin(T * 2.2 + i * 1.7) > .35 ? 2.2 : 0;
      fa.e[i] += rate * dt;
      while (fa.e[i] >= 1) {
        fa.e[i] -= 1;
        _fp.copy(e.pos).multiplyScalar(AC_SCALE).applyQuaternion(a.quat).add(a.pos);
        if (e.dir) _fd.copy(e.dir).normalize().multiplyScalar(e.speed * 3).applyQuaternion(a.quat); else _fd.set(0, e.speed * 3, 0).applyQuaternion(a.quat);
        const sm = e.kind === 'smoke', s = e.size * AC_SCALE;
        smokeFx.spawn(_fp.x, _fp.y, _fp.z, a.vel.x * .93 + _fd.x + rrand(-.6, .6), a.vel.y * .93 + _fd.y + rrand(-.2, .8), a.vel.z * .93 + _fd.z + rrand(-.6, .6),
          s * .7, s * (sm ? 3.4 : 3.0), e.life * (sm ? 1.3 : 1.0), sm ? FXC.smokeDark : FXC.steam, sm ? FXC.smokeGrey : FXC.steam, sm ? .55 : .42, .9, sm ? .5 : .25, 1.0);
      }
    }
  }
  // ---- damage: grey smoke at 55% hull, black smoke + flames at 30%, wreck: inferno
  const dmgLevel = !alive ? 3 : hpf < .3 ? 2 : hpf < .55 ? 1 : 0;
  if (dmgLevel > 0 && d2 < 2600 * 2600) {
    planeEngineLocal(a, _fd).multiplyScalar(AC_SCALE).applyQuaternion(a.quat).add(a.pos);
    const near = d2 < 900 * 900 ? 1 : .55;
    fa.dmg += dt * (dmgLevel === 1 ? 16 : dmgLevel === 2 ? 30 : 42) * near;
    while (fa.dmg >= 1) {
      fa.dmg -= 1;
      const sz = a.radius * (dmgLevel === 1 ? .32 : .45);
      smokeFx.spawn(_fd.x, _fd.y, _fd.z, a.vel.x * .9 + rrand(-1.5, 1.5), a.vel.y * .9 + rrand(0, 3), a.vel.z * .9 + rrand(-1.5, 1.5), sz, sz * 3.4, rrand(2.2, 3.6), dmgLevel === 1 ? FXC.smokeGrey : FXC.soot, dmgLevel === 1 ? FXC.smokeLight : FXC.smokeGrey, dmgLevel === 1 ? .6 : .85, .7, 1.4, .9);
    }
    if (dmgLevel >= 2) {
      fa.fire += dt * (dmgLevel === 2 ? 26 : 44) * near;
      while (fa.fire >= 1) {
        fa.fire -= 1;
        fireFx.spawn(_fd.x + rrand(-1, 1), _fd.y + rrand(-.5, 1), _fd.z + rrand(-1, 1), a.vel.x * .9 + rrand(-3, 3), a.vel.y * .9 + rrand(0, 4), a.vel.z * .9 + rrand(-3, 3), rrand(1.8, 3.4), .6, rrand(.25, .55), FXC.fireY, FXC.fireR, .85, 2.2, 3, 1.2);
      }
      fa.spark += dt;
      if (fa.spark > .12 && Math.random() < .5) { fa.spark = 0; fireFx.spawn(_fd.x, _fd.y, _fd.z, rrand(-14, 14), rrand(-4, 12), rrand(-14, 14), rrand(.3, .5), .05, rrand(.4, .9), FXC.spark, FXC.fireR, 1, .4, -14); }
    }
  }
}
function updateFx(dt) {
  if (!smokeFx) return;
  updateBurners(dt); updateDebris(dt);
  smokeFx.update(dt); fireFx.update(dt);
}
