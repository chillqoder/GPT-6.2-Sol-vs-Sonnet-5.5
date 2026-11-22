/* ======================================================================
   STAGE 1 (cont.) — RACE SELECTION SCREEN
   rotating full-detail aircraft preview hovering over the world, crew
   portraits rendered from the real 3D pilots, stats, time-of-day buttons.
   ====================================================================== */
const MENU = { race: 'human', t: 0, active: false, sets: {}, anchor: new THREE.Vector3(0, 150, 0), portraits: {}, ready: false };
const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

function allMaterials(obj, fn) { obj.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(fn); }); }

function getPreviewSet(race) {
  let s = MENU.sets[race];
  if (s) return s;
  AIR.setSeg(1);
  const ac = AIR.createAircraft(race), wrap = new THREE.Group(), hold = new THREE.Group();
  hold.add(ac); wrap.add(hold);
  allMaterials(ac, (m) => prepMaterial(m, !!m.isMeshStandardMaterial));
  ac.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(ac), c = bb.getCenter(new THREE.Vector3());
  ac.position.sub(c);                                  // centre the model on the pivot
  wrap.scale.setScalar(1.65);
  wrap.visible = false;
  scene.add(wrap);
  s = MENU.sets[race] = { race, wrap, hold, ac, a: 0, bb };
  return s;
}

/* ---- portraits ---- */
function renderPortraits(size = 200) {
  const urls = {}, prevPR = renderer.getPixelRatio(), cam = new THREE.PerspectiveCamera(26, 1, .1, 60);
  const prevTone = renderer.toneMappingExposure;
  renderer.setPixelRatio(1); renderer.setSize(size, size, false); renderer.toneMappingExposure = 1.05;
  const savedFog = scene.fog;
  for (const race of RACES) {
    const info = RACE[race], ps = new THREE.Scene();
    ps.environment = ENV_TEX; ps.environmentIntensity = .9;
    ps.background = AIR.canvasTexture(64, 64, (g, w, h) => {
      const gr = g.createRadialGradient(w * .5, h * .42, 2, w * .5, h * .5, w * .75);
      gr.addColorStop(0, '#' + new THREE.Color(info.accent).lerp(new THREE.Color('#2a1d12'), .62).getHexString()); gr.addColorStop(1, '#120c07');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, { repeat: false });
    const pilot = AIR.createPilot(race, { gogglesUp: true });
    allMaterials(pilot, (m) => { if (m.isMeshStandardMaterial) { m.envMap = ENV_TEX; } });
    pilot.rotation.y = -.32; ps.add(pilot);
    const key = new THREE.DirectionalLight('#ffe0b0', 3.4); key.position.set(-2.5, 3, 4);
    const fl = new THREE.DirectionalLight('#8fb4e8', 1.0); fl.position.set(3, 1, 2);
    const rl = new THREE.DirectionalLight(info.accent, 3.0); rl.position.set(2.5, 2.5, -3);
    ps.add(key, fl, rl, new THREE.HemisphereLight('#ffd9b0', '#2a1c14', .5));
    pilot.updateMatrixWorld(true);
    const rig = pilot.userData.rig, hc = rig.head.hp.localToWorld(new THREE.Vector3(0, rig.head.cy, 0)), hh = rig.head.headH, d = hh * 4.7;
    cam.position.set(hc.x + d * .16, hc.y + hh * .06, hc.z + d); cam.lookAt(hc.x, hc.y - hh * .3, hc.z);
    renderer.render(ps, cam);
    const c = document.createElement('canvas'); c.width = c.height = size;
    c.getContext('2d').drawImage(renderer.domElement, 0, 0, size, size);
    urls[race] = c.toDataURL('image/jpeg', .9);
    ps.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  renderer.toneMappingExposure = prevTone;
  renderer.setPixelRatio(prevPR); renderer.setSize(innerWidth, innerHeight);
  return urls;
}

/* ---- UI ---- */
const portraitButtons = {}, statBars = {};
function initMenu() {
  const box = $('portraits');
  for (const race of RACES) {
    const b = document.createElement('button');
    b.className = 'portrait'; b.type = 'button'; b.dataset.race = race; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', 'false');
    b.title = `${RACE[race].name} — ${RACE[race].craft} (${RACES.indexOf(race) + 1})`;
    b.innerHTML = `<img alt="${RACE[race].name}" src="${MENU.portraits[race] || ''}"><span>${RACE[race].name}</span>`;
    b.addEventListener('click', () => selectRace(race));
    box.appendChild(b); portraitButtons[race] = b;
  }
  const stats = $('stats');
  for (const key of Object.keys(STAT_LABELS)) {
    const row = document.createElement('div'); row.className = 'stat';
    row.innerHTML = `<span>${STAT_LABELS[key]}</span><div class="bar"><i></i></div><b>0</b>`;
    stats.appendChild(row); statBars[key] = { bar: row.querySelector('i'), val: row.querySelector('b') };
  }
  $('btn-start').addEventListener('click', () => { if (MENU.active) startBattle(MENU.race); });
  document.querySelectorAll('#menu .times .btn').forEach((b) => b.addEventListener('click', () => { setTime(parseFloat(b.dataset.time)); b.blur(); }));
  addEventListener('keydown', (e) => {
    if (!MENU.active || e.ctrlKey || e.metaKey || e.altKey) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 4) selectRace(RACES[n - 1]);
    else if (e.code === 'ArrowRight') selectRace(RACES[(RACES.indexOf(MENU.race) + 1) % 4]);
    else if (e.code === 'ArrowLeft') selectRace(RACES[(RACES.indexOf(MENU.race) + 3) % 4]);
    else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); startBattle(MENU.race); }
  });
}

function selectRace(race, instant = false) {
  const info = RACE[race], root = document.documentElement.style;
  MENU.race = race;
  for (const [r, b] of Object.entries(portraitButtons)) b.setAttribute('aria-selected', String(r === race));
  const col = new THREE.Color(info.accent);
  root.setProperty('--accent', info.accent);
  root.setProperty('--accent-dim', '#' + col.clone().multiplyScalar(.45).getHexString());
  root.setProperty('--accent-glow', `rgba(${(col.r * 255) | 0}, ${(col.g * 255) | 0}, ${(col.b * 255) | 0}, .5)`);
  const apply = () => {
    $('info-name').textContent = info.name;
    $('info-craft').textContent = `${info.craft} · ${info.type}`;
    $('info-desc').textContent = info.desc;
    $('info-weap').innerHTML = info.weapons;
    for (const [k, v] of Object.entries(info.stats)) { statBars[k].bar.style.setProperty('--v', v / 10); statBars[k].val.textContent = v; }
    $('info-body').classList.remove('swap');
  };
  if (instant) apply(); else { $('info-body').classList.add('swap'); setTimeout(apply, 180); }
  const set = getPreviewSet(race);
  if (!set.shown) { set.shown = true; set.a = instant ? 1 : 0; }
  for (const s of Object.values(MENU.sets)) s.want = s === set ? 1 : 0;
}

function showMenu() {
  MENU.active = true; MENU.t = 0;
  $('menu').classList.remove('hidden'); $('hud').classList.add('hidden'); $('overlay').classList.add('hidden');
  $('end').classList.add('hidden'); $('capture').classList.add('hidden'); $('warn').classList.remove('show');
  if (document.pointerLockElement) document.exitPointerLock();
  selectRace(MENU.race, true);
  for (const s of Object.values(MENU.sets)) { s.a = s.want ? 1 : 0; }
  applyMenuView();
}
function hideMenu() {
  MENU.active = false; $('menu').classList.add('hidden');
  for (const s of Object.values(MENU.sets)) { s.wrap.visible = false; s.a = 0; s.shown = false; }
  camera.clearViewOffset();
  camera.fov = 62; camera.updateProjectionMatrix();
}
function applyMenuView() {
  camera.fov = 38; camera.aspect = innerWidth / innerHeight;
  const w = innerWidth, h = innerHeight, shift = innerWidth > 900 ? 200 : 0;
  camera.setViewOffset(w, h, -shift, 0, w, h);                       // pushes the scene right, away from the info panel
  camera.updateProjectionMatrix();
}
addEventListener('resize', () => { if (MENU.active) applyMenuView(); });

const _mAnchor = new THREE.Vector3();
function updateMenu(dt, t) {
  MENU.t += dt;
  const A = MENU.anchor, ang = MENU.t * .22 + .6, R = 31;
  for (const s of Object.values(MENU.sets)) {
    const target = s.want ? 1 : 0, rate = dt / (target ? .9 : .45);
    s.a = target > s.a ? Math.min(1, s.a + rate) : Math.max(0, s.a - rate);
    s.wrap.visible = s.a > .004;
    if (!s.wrap.visible) continue;
    const e = easeOutBack(s.a), dir = target ? -1 : 1;
    s.wrap.position.set(A.x, A.y + Math.sin(MENU.t * 1.1) * .45 + (1 - s.a) * dir * 6, A.z);
    s.wrap.scale.setScalar(Math.max(.0001, e * 1.65));
    s.hold.rotation.set(Math.sin(MENU.t * .8) * .02, MENU.t * .35 + (1 - s.a) * dir * 1.6, Math.sin(MENU.t * .6) * .04 + .02);
    for (const p of s.ac.userData.props) { const rr = p.userData.rotor; rr.rotation.z += p.userData.spin * dt; p.userData.blur.material.opacity = .42; }
  }
  camera.position.set(A.x + Math.cos(ang) * R, A.y + 3.4 + Math.sin(MENU.t * .3) * 1.2, A.z + Math.sin(ang) * R);
  camera.lookAt(A.x, A.y + .5, A.z);
}
