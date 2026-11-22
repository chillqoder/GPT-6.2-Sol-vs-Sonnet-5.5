/* ======================================================================
   GAME  ·  STAGE 1 — MERGE: shared constants, race data, aircraft baking
   (the showcase aircraft / crews are baked into a handful of merged
   meshes per aircraft so 12 of them cost very few draw calls),
   solid-height field (terrain + buildings), race-selection screen.
   ====================================================================== */
const AC_SCALE = 1.6;                       // model units -> metres
const RACES = AIR.RACES;                    // ['human','dwarf','elf','orc']
const $ = (id) => document.getElementById(id);
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
const DEG = Math.PI / 180;
const setLoadingMsg = (s) => { const e = $('loading-msg'); if (e) e.textContent = s; };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

/* ---------------- race data: look, flight model, hull, weapons ---------------- */
const RACE = {
  human: {
    name: 'Humans', craft: 'Brass Kestrel', type: 'Steam biplane', accent: '#d9a441', team: '#4aa8ff', teamName: 'Humans',
    desc: 'Inventive and adaptable, humans build quick, easy-to-mend biplanes around a roaring steam boiler. The Kestrel is a balanced dogfighter, with a ball turret slung beneath to guard its belly.',
    weapons: '<b>Pilot:</b> twin synchronised machine guns.<br><b>Gunner (belly ball):</b> <i>Twin Gatling</i> — a storm of fast, light bullets.',
    stats: { speed: 7, armor: 5, maneuver: 6, firepower: 6 },
    hp: 380, taken: 1.0, hitR: 5.2,
    flight: { max: 112, idle: 52, stall: 40, corner: 70, accel: .55, grip: 2.4, pitch: 1.35, yaw: .5, roll: 3.2, agility: 5.2, grav: 24 },
  },
  dwarf: {
    name: 'Dwarves', craft: 'Deepforge Bulwark', type: 'Gunship', accent: '#e0703c', team: '#ff9a2e', teamName: 'Dwarves',
    desc: 'Master smiths who would rather armour a mountain than fly around one. The Bulwark is a riveted flying fortress: slow and ponderous, nearly unbreakable, with a heavy cannon on its roof.',
    weapons: '<b>Pilot:</b> two heavy nose cannons.<br><b>Gunner (roof, 360°):</b> <i>Mortar Cannon</i> — slow arcing shells that burst in a fireball.',
    stats: { speed: 3, armor: 10, maneuver: 2, firepower: 7 },
    hp: 760, taken: .62, hitR: 6.4,
    flight: { max: 88, idle: 42, stall: 33, corner: 55, accel: .42, grip: 1.7, pitch: .82, yaw: .34, roll: 1.7, agility: 3.4, grav: 22 },
  },
  elf: {
    name: 'Elves', craft: 'Silverwing Gossamer', type: 'Dragonfly', accent: '#5fd0a0', team: '#3fe0a8', teamName: 'Elves',
    desc: 'Ancient craftsfolk who weave birch wood and silk canvas into impossibly light, dragonfly-winged flyers. The Gossamer outruns and outturns anything in the sky, but a single hit can tear it apart.',
    weapons: '<b>Pilot:</b> twin rapid-fire needle guns.<br><b>Gunner (tail):</b> <i>Moonthorn Lance</i> — fast glowing bolts that seek their prey.',
    stats: { speed: 10, armor: 2, maneuver: 9, firepower: 4 },
    hp: 240, taken: 1.2, hitR: 5.4,
    flight: { max: 140, idle: 66, stall: 46, corner: 84, accel: .7, grip: 3.2, pitch: 1.9, yaw: .7, roll: 4.0, agility: 6.5, grav: 26 },
  },
  orc: {
    name: 'Orcs', craft: 'Gutter Fang', type: 'Scrap raider', accent: '#a7c24a', team: '#ff4a3a', teamName: 'Orcs',
    desc: 'Brutal raiders who weld whatever they can scavenge into war machines, then bolt on more spikes. The Fang is crude, loud and smoky, but its outrigger gunner hits like a rockslide.',
    weapons: '<b>Pilot:</b> two crude chain-bound barrels.<br><b>Gunner (side outrigger):</b> <i>Scrap Scatter-gun</i> — a triple-barrel burst of heavy slugs.',
    stats: { speed: 6, armor: 6, maneuver: 4, firepower: 9 },
    hp: 520, taken: .84, hitR: 5.4,
    flight: { max: 102, idle: 48, stall: 38, corner: 64, accel: .5, grip: 2.1, pitch: 1.05, yaw: .42, roll: 2.4, agility: 4.4, grav: 24 },
  },
};
const STAT_LABELS = { speed: 'Speed', armor: 'Armor', maneuver: 'Maneuverability', firepower: 'Firepower' };

/* ---------------- environment map for the metallic aircraft ---------------- */
let ENV_TEX = null;
function makeEnvMap() {
  const es = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vD; void main(){
      vec3 d = normalize(vD); float h = d.y;
      vec3 zen = vec3(.16,.34,.70), hor = vec3(.78,.84,.90), gnd = vec3(.20,.17,.12);
      vec3 c = h > 0. ? mix(hor, zen, pow(h, .5)) : mix(hor * .55, gnd, smoothstep(0., -.6, h));
      vec3 sd = normalize(vec3(.55,.62,.35));
      float s = max(dot(d, sd), 0.);
      c += vec3(1.0,.93,.8) * (pow(s, 40.) * 3.5 + pow(s, 6.) * .35);
      c += vec3(.5,.6,.8) * pow(max(dot(d, normalize(vec3(-.6,.25,-.5))), 0.), 8.) * .5;
      gl_FragColor = vec4(c, 1.); }`,
  });
  es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat));
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(es, 0.02).texture; pm.dispose();
  return tex;
}
const _hookedMats = new WeakSet(), ENV_MATS = [];
function prepMaterial(m, env = true) {          // fog-chunk hook + environment for the shared / baked aircraft materials
  if (_hookedMats.has(m)) return m;
  _hookedMats.add(m);
  if (m.isMeshStandardMaterial) { if (env) { m.envMap = ENV_TEX; m.envMapIntensity = 0.9; ENV_MATS.push(m); } m.onBeforeCompile = hookGlobals; }
  else if (m.isMeshBasicMaterial) m.onBeforeCompile = hookGlobals;
  return m;
}
const vcMatte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7, metalness: .05 });
const vcMetal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .38, metalness: .85 });
let _envT = 0;
/** The reflection probe is a daytime sky: dim it as the sun goes down so metal does not glow at night. */
function updateEnvIntensity(dt) {
  _envT -= dt; if (_envT > 0) return; _envT = .4;
  const k = .12 + .88 * G.uDayLight.value;
  for (let i = 0; i < ENV_MATS.length; i++) ENV_MATS[i].envMapIntensity = .9 * k;
}

/* ---------------- baking: collapse a model into merged meshes ---------------- */
const _avgCache = new Map();
function avgTexColor(tex) {
  let c = _avgCache.get(tex);
  if (c) return c;
  c = new THREE.Color(1, 1, 1);
  try {
    const img = tex.image, cv = document.createElement('canvas'); cv.width = cv.height = 8;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0, 8, 8);
    const d = g.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, b = 0;
    for (let i = 0; i < 256; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    c.setRGB(r / 64 / 255, gg / 64 / 255, b / 64 / 255, THREE.SRGBColorSpace);
  } catch (e) { /* tainted / missing: keep white */ }
  _avgCache.set(tex, c); return c;
}
const _tmpCol = new THREE.Color();
function matColor(mat) { _tmpCol.copy(mat.color || new THREE.Color(1, 1, 1)); if (mat.map) _tmpCol.multiply(avgTexColor(mat.map)); return _tmpCol; }

function flipWinding(g) {
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const a = g.attributes[name]; if (!a) continue;
    const n = a.itemSize, arr = a.array;
    for (let i = 0; i < a.count; i += 3) for (let k = 0; k < n; k++) { const t = arr[(i + 1) * n + k]; arr[(i + 1) * n + k] = arr[(i + 2) * n + k]; arr[(i + 2) * n + k] = t; }
  }
}
function sliceGeo(g, start, count) {
  const o = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.attributes[name], n = a.itemSize;
    o.setAttribute(name, new THREE.BufferAttribute(a.array.slice(start * n, (start + count) * n), n));
  }
  return o;
}
/**
 * Collect every Mesh below `root` (except `skip` subtrees), express it in the frame of `frame` (default: root),
 * and merge by material. vc = true -> bake colours into vertex colours (two buckets: matte / metal).
 */
function bakeParts(root, { skip = null, frame = root, minR = 0, vc = false, instanced = false } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert();
  const buckets = new Map(), M4 = new THREE.Matrix4(), stack = [root];
  while (stack.length) {
    const o = stack.pop();
    if (skip && skip.has(o)) continue;
    if (!o.visible) continue;
    for (const c of o.children) stack.push(c);
    if (!o.isMesh || (o.isInstancedMesh && !instanced)) continue;
    M4.multiplyMatrices(inv, o.matrixWorld);
    const multi = Array.isArray(o.material), mats = multi ? o.material : [o.material];
    const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const groups = multi && src.groups.length ? src.groups : [{ start: 0, count: src.attributes.position.count, materialIndex: 0 }];
    for (const gr of groups) {
      const mat = mats[gr.materialIndex]; if (!mat) continue;
      if (vc && (mat.transparent || mat.isMeshBasicMaterial)) continue;
      let g = (groups.length === 1 && gr.count === src.attributes.position.count) ? src : sliceGeo(src, gr.start, gr.count);
      if (g === src) { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k); }
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(M4);
      if (M4.determinant() < 0) flipWinding(g);
      g.computeBoundingSphere();
      if (g.boundingSphere.radius < minR) { continue; }
      let key = mat;
      if (vc) {
        const col = matColor(mat), n = g.attributes.position.count, ca = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { ca[i * 3] = col.r; ca[i * 3 + 1] = col.g; ca[i * 3 + 2] = col.b; }
        g.setAttribute('color', new THREE.BufferAttribute(ca, 3)); g.deleteAttribute('uv');
        key = (mat.metalness > .5) ? 'metal' : 'matte';
      }
      let list = buckets.get(key); if (!list) buckets.set(key, list = []);
      list.push(g);
    }
  }
  const out = [];
  for (const [key, list] of buckets) {
    const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (!geo) continue;
    geo.computeBoundingSphere();
    out.push({ geo, mat: key === 'metal' ? vcMetal : key === 'matte' ? vcMatte : key });
  }
  return out;
}
const countTris = (parts) => parts.reduce((s, p) => s + p.geo.attributes.position.count / 3, 0);

/* ---------------- aircraft templates (one per race) ---------------- */
const TPL = {};
const _wp = new THREE.Vector3(), _wq = new THREE.Quaternion(), _ws = new THREE.Vector3();
function worldPosIn(obj, frame) { obj.updateWorldMatrix(true, false); const v = new THREE.Vector3(); obj.getWorldPosition(v); return frame ? frame.worldToLocal(v) : v; }

function buildCrewParts(race, role) {
  AIR.setSeg(0.5);
  const crew = AIR.createCrew(race, role);
  AIR.setSeg(1);
  const rig = crew.userData.rig, skip = new Set();
  for (const l of rig.legs) skip.add(l.hip);                      // legs are hidden in the cockpit anyway
  rig.arms.forEach((a, i) => {                                    // hands on the controls
    const s = i ? 1 : -1;
    a.shoulder.rotation.set(role === 'pilot' ? -1.02 : -.85, 0, s * .16);
    a.elbow.rotation.set(role === 'pilot' ? -.8 : -.55, 0, 0);
  });
  rig.spine.rotation.x = .08;
  crew.updateMatrixWorld(true);
  const parts = bakeParts(crew, { skip, vc: true, minR: .012 });
  return { parts, legLen: rig.dims.legLen, rig };
}

function buildTemplate(race) {
  AIR.setSeg(0.8);
  const ac = AIR.createAircraft(race);
  AIR.setSeg(1);
  ac.updateMatrixWorld(true);
  const ud = ac.userData, tpl = { race, name: ud.name };
  const skip = new Set();

  // --- propellers: spinning rotor + static spinner + blur disc
  tpl.props = ud.props.map((p) => {
    skip.add(p);
    const rot = p.userData.rotor, blur = p.userData.blur;
    const pskip = new Set([rot, blur]);
    return {
      pos: p.position.clone(), quat: p.quaternion.clone(), spin: p.userData.spin, radius: p.userData.radius,
      rotor: bakeParts(rot, { frame: rot, minR: .01 }),
      stat: bakeParts(p, { skip: pskip, frame: p, minR: .01 }),
      blurGeo: blur.geometry, blurMat: blur.material, blurPos: blur.position.clone(),
    };
  });

  // --- turret: gun groups swing, the rest sits still (or yaws for the ball / roof turrets)
  const T = ud.turret, gunGroups = [...new Set(ud.muzzles.turret.map((m) => m.parent))];
  gunGroups.forEach((g) => skip.add(g));
  const yawTurret = race === 'human' || race === 'dwarf';
  tpl.turret = { yaw: yawTurret, pos: T.position.clone(), parts: null, guns: [] };
  if (yawTurret) { skip.add(T); tpl.turret.parts = bakeParts(T, { skip: new Set(gunGroups), frame: T, minR: .01 }); }
  const gframe = yawTurret ? T : ac;
  for (const g of gunGroups) {
    const mz = ud.muzzles.turret.filter((m) => m.parent === g);
    tpl.turret.guns.push({
      pos: yawTurret ? g.position.clone() : worldPosIn(g, null),
      quat: yawTurret ? g.quaternion.clone() : g.getWorldQuaternion(new THREE.Quaternion()),
      parts: bakeParts(g, { frame: g, minR: .006 }),
      muzzles: mz.map((m) => m.position.clone()),
    });
  }
  tpl.seatPilot = worldPosIn(ud.seats.pilot, null);
  tpl.seatGunner = yawTurret ? worldPosIn(ud.seats.gunner, T) : worldPosIn(ud.seats.gunner, null);

  // --- forward guns + steam / smoke emitters (aircraft frame)
  tpl.fwdMuzzles = ud.muzzles.forward.map((m) => worldPosIn(m, null));
  tpl.emitters = ud.emitters.map((e) => ({ pos: worldPosIn(e.anchor, null), kind: e.kind, rate: e.rate ?? 6, size: e.size ?? .5, life: e.life ?? 1.4, speed: e.speed ?? 1, dir: e.dir ? e.dir.clone() : null, intermittent: !!e.intermittent }));

  // --- hull (everything not split off above)
  tpl.hull = bakeParts(ac, { skip, minR: .035 });
  tpl.far = bakeParts(ac, { vc: true, minR: .2 });
  const bb = new THREE.Box3().setFromObject(ac), size = bb.getSize(new THREE.Vector3());
  tpl.size = size; tpl.box = bb;
  tpl.cockpitTop = tpl.seatPilot.y;

  // --- crew
  tpl.pilot = buildCrewParts(race, 'pilot'); tpl.gunner = buildCrewParts(race, 'gunner');
  // gunner faces the rest direction of the gun
  const g0 = tpl.turret.guns[0], d0 = new THREE.Vector3(0, 0, 1).applyQuaternion(g0.quat);
  tpl.gunnerYaw = yawTurret ? 0 : Math.atan2(d0.x, d0.z);         // yawing turrets carry the gunner along; the others turn him by hand
  tpl.stats = { hullDraws: tpl.hull.length, hullTris: countTris(tpl.hull), farTris: countTris(tpl.far), crewTris: countTris(tpl.pilot.parts) };
  tpl.hull.forEach((p) => prepMaterial(p.mat)); tpl.props.forEach((p) => { p.rotor.forEach((q) => prepMaterial(q.mat)); p.stat.forEach((q) => prepMaterial(q.mat)); prepMaterial(p.blurMat, false); });
  if (tpl.turret.parts) tpl.turret.parts.forEach((p) => prepMaterial(p.mat));
  tpl.turret.guns.forEach((g) => g.parts.forEach((p) => prepMaterial(p.mat)));
  // hit radius from the model
  tpl.hitR = RACE[race].hitR;
  return tpl;
}

/** Runtime object graph for one aircraft (cheap: shares geometry + materials with its template). */
function makeAircraftObject(tpl) {
  const root = new THREE.Group(); root.scale.setScalar(AC_SCALE);
  const lod0 = new THREE.Group(); root.add(lod0);
  const mk = (p) => { const m = new THREE.Mesh(p.geo, p.mat); m.matrixAutoUpdate = true; return m; };
  for (const p of tpl.hull) lod0.add(mk(p));
  const rotors = [], blurs = [];
  for (const pt of tpl.props) {
    const g = new THREE.Group(); g.position.copy(pt.pos); g.quaternion.copy(pt.quat); lod0.add(g);
    const rot = new THREE.Group(); g.add(rot); for (const p of pt.rotor) rot.add(mk(p));
    for (const p of pt.stat) g.add(mk(p));
    const bl = new THREE.Mesh(pt.blurGeo, pt.blurMat); bl.position.copy(pt.blurPos); g.add(bl);
    rotors.push({ node: rot, spin: pt.spin }); blurs.push(bl);
  }
  // turret
  const tr = tpl.turret, yawNode = new THREE.Group(); yawNode.position.copy(tr.pos);
  if (tr.yaw) { lod0.add(yawNode); if (tr.parts) for (const p of tr.parts) yawNode.add(mk(p)); }
  const guns = [], gunParent = tr.yaw ? yawNode : lod0;
  for (const gt of tr.guns) {
    const node = new THREE.Group(); node.position.copy(gt.pos); node.quaternion.copy(gt.quat); gunParent.add(node);
    for (const p of gt.parts) node.add(mk(p));
    const muzzles = gt.muzzles.map((v) => { const o = new THREE.Object3D(); o.position.copy(v); node.add(o); return o; });
    guns.push({ node, muzzles, restQuat: gt.quat.clone() });
  }
  // crew (vertex-coloured, no legs)
  const crewMat = (c) => { const g = new THREE.Group(); for (const p of c.parts) g.add(mk(p)); return g; };
  const pilot = crewMat(tpl.pilot); pilot.position.copy(tpl.seatPilot).y += .05 - tpl.pilot.legLen; lod0.add(pilot);
  const gunnerPivot = new THREE.Group(), gunner = crewMat(tpl.gunner); gunnerPivot.add(gunner);
  gunner.position.y = -tpl.gunner.legLen + .05; gunnerPivot.position.copy(tpl.seatGunner);
  (tr.yaw ? yawNode : lod0).add(gunnerPivot); gunnerPivot.rotation.y = tpl.gunnerYaw;
  const lod1 = new THREE.Group(); for (const p of tpl.far) lod1.add(mk(p));
  lod1.visible = false; root.add(lod1);
  return { root, lod0, lod1, rotors, blurs, yawNode, hasYaw: tr.yaw, guns, pilot, gunnerPivot, tpl };
}

/* ---------------- solid-height field: terrain + buildings ---------------- */
const SOLID = { cell: 6, half: 1800, n: 600, h: null };
SOLID.h = new Float32Array(SOLID.n * SOLID.n);
function groundH(x, z) {                          // bilinear terrain height (water surface = 0)
  const T = terrain, fx = (x + TERRAIN_HALF) / T.step, fz = (z + TERRAIN_HALF) / T.step;
  let i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0) i = 0; else if (i > T.N - 1) i = T.N - 1;
  if (j < 0) j = 0; else if (j > T.N - 1) j = T.N - 1;
  const u = clamp01(fx - i), v = clamp01(fz - j), H = T.Hs, s = T.stride, k = j * s + i;
  const h = (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + s] * (1 - u) + H[k + s + 1] * u) * v;
  return h > 0 ? h : 0;
}
function structH(x, z) {
  const S = SOLID, i = Math.floor((x + S.half) / S.cell), j = Math.floor((z + S.half) / S.cell);
  if (i < 0 || j < 0 || i >= S.n || j >= S.n) return 0;
  return S.h[j * S.n + i];
}
function solidH(x, z) { const g = groundH(x, z), s = structH(x, z); return s > g ? s : g; }

function buildSolidField() {
  const S = SOLID; let count = 0;
  const stampOBB = (cx, cz, ax, az, bx, bz, minX, maxX, minZ, maxZ, top) => {
    // local x axis = (ax,az) (scaled), local z axis = (bx,bz) (scaled); box = [minX,maxX]x[minZ,maxZ] in local units
    const la = ax * ax + az * az, lb = bx * bx + bz * bz; if (la < 1e-6 || lb < 1e-6) return;
    const corners = [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]];
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const [lx, lz] of corners) { const wx = cx + ax * lx + bx * lz, wz = cz + az * lx + bz * lz; x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); z0 = Math.min(z0, wz); z1 = Math.max(z1, wz); }
    const i0 = Math.max(0, Math.floor((x0 + S.half) / S.cell)), i1 = Math.min(S.n - 1, Math.floor((x1 + S.half) / S.cell));
    const j0 = Math.max(0, Math.floor((z0 + S.half) / S.cell)), j1 = Math.min(S.n - 1, Math.floor((z1 + S.half) / S.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = -S.half + (i + .5) * S.cell - cx, pz = -S.half + (j + .5) * S.cell - cz;
      const lx = (px * ax + pz * az) / la, lz = (px * bx + pz * bz) / lb;
      const mA = 2.5 / Math.sqrt(la), mB = 2.5 / Math.sqrt(lb);
      if (lx < minX - mA || lx > maxX + mA || lz < minZ - mB || lz > maxZ + mB) continue;
      const k = j * S.n + i; if (top > S.h[k]) S.h[k] = top;
    }
    count++;
  };
  scene.children.forEach((m) => {
    if (!m.isInstancedMesh || !m.userData.isBatch) return;
    const bb = m.geometry.boundingBox; if (!bb) return;
    const hgt = bb.max.y, ex = bb.max.x - bb.min.x, ez = bb.max.z - bb.min.z;
    const a = m.instanceMatrix.array, n = m.count;
    for (let i = 0; i < n; i++) {
      const o = i * 16;
      const sy = Math.hypot(a[o + 4], a[o + 5], a[o + 6]);
      const topH = hgt * sy;
      if (topH < 7) continue;
      const sx = Math.hypot(a[o], a[o + 1], a[o + 2]), sz = Math.hypot(a[o + 8], a[o + 9], a[o + 10]);
      if (ex * sx * ez * sz < 5) continue;                                  // lamp posts, masts' poles etc.
      stampOBB(a[o + 12], a[o + 14], a[o], a[o + 2], a[o + 8], a[o + 10], bb.min.x, bb.max.x, bb.min.z, bb.max.z, a[o + 13] + topH);
    }
  });
  // landmarks that are baked into merged meshes: clock tower, perimeter masts are tall but slender
  const c = CITY.toWorld(0, 0);
  stampOBB(c[0], c[1], 1, 0, 0, 1, -19, 19, -19, 19, groundH(c[0], c[1]) + 118);
  return count;
}

/* ---------------- generic helpers ---------------- */
const smooth01 = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const wrapPI = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAngle = (a, b, t) => a + wrapPI(b - a) * t;
const rnd = Math.random;
const rrand = (a, b) => a + (b - a) * Math.random();
