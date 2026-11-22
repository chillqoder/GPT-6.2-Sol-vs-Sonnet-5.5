/* ======================================================================
   STAGE 8 — HUD: health / speed / altitude / weapons / role, radar,
   target markers + reticles, team counters, kill feed, spectating
   ====================================================================== */
const HDG = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const ovCv = $('overlay'), ov = ovCv.getContext('2d'), radarCv = $('radar'), rg = radarCv.getContext('2d');
let ovW = 0, ovH = 0, hudFrame = 0, lastRole = '', lastSpec = null;
function resizeOverlay() { ovW = ovCv.width = innerWidth; ovH = ovCv.height = innerHeight; }
addEventListener('resize', resizeOverlay); resizeOverlay();

/* ---------------- toasts / warnings ---------------- */
let _toastT = 0, _warnT = 0;
function showToast(msg, secs = 2.4) { const e = $('toast'); e.textContent = msg; e.classList.add('show'); _toastT = secs; }
function showWarn(msg, secs = 1.2, force = false) { const e = $('warn'); if (!force && e.classList.contains('show') && e.textContent === msg) { _warnT = secs; return; } e.textContent = msg; e.classList.add('show'); _warnT = secs; }
function tickMessages(dt) {
  if (_toastT > 0) { _toastT -= dt; if (_toastT <= 0) $('toast').classList.remove('show'); }
  if (_warnT > 0) { _warnT -= dt; if (_warnT <= 0) $('warn').classList.remove('show'); }
}

/* ---------------- kill feed ---------------- */
const feedEl = $('feed');
function nameHtml(p) { return `<span style="color:${GAME.teams[p.team].color};font-weight:700">${p.isPlayer ? 'You' : p.name}</span>`; }
function addKillFeed(victim, attacker, cause) {
  const d = document.createElement('div');
  if (cause === 'crash' && !attacker) d.innerHTML = `${nameHtml(victim)} <span style="opacity:.8">crashed</span>`;
  else if (cause === 'lost') d.innerHTML = `${nameHtml(victim)} <span style="opacity:.8">was lost beyond the front</span>`;
  else if (attacker) d.innerHTML = `${nameHtml(attacker)} <span style="color:#ffd98a">✦ ${attacker.race === victim.race && attacker.team === victim.team ? 'friendly fire' : 'shot down'}</span> ${nameHtml(victim)}`;
  else d.innerHTML = `${nameHtml(victim)} <span style="opacity:.8">was destroyed</span>`;
  feedEl.appendChild(d);
  while (feedEl.children.length > 6) feedEl.removeChild(feedEl.firstChild);
  setTimeout(() => d.classList.add('out'), 6200); setTimeout(() => d.remove(), 6900);
  buildTeamBar();
}
function resetHud() {
  feedEl.innerHTML = ''; lastRole = ''; lastSpec = null; buildTeamBar(true); $('spec').classList.add('hidden'); $('dmg').style.opacity = 0;
}
let _teamEls = null;
function buildTeamBar(rebuild) {
  const box = $('hud-tc');
  if (rebuild || !_teamEls) {
    box.innerHTML = ''; _teamEls = [];
    GAME.teams.forEach((t) => { const e = document.createElement('div'); e.className = 'team'; e.innerHTML = `<i style="color:${t.color}"></i><span>${t.name}</span><b></b>`; box.appendChild(e); _teamEls.push(e); });
  }
  GAME.teams.forEach((t, i) => { const e = _teamEls[i]; e.querySelector('b').textContent = t.alive; e.classList.toggle('dead', t.alive <= 0); e.classList.toggle('me', i === GAME.playerTeam); });
}

/* ---------------- main HUD update ---------------- */
function updateHud(dt) {
  const a = GAME.view; if (!a) return;
  hudFrame++;
  const P = GAME.player, gunner = P.alive && P.mode === 'gunner' && a === P;
  const role = a !== P ? 'spec' : gunner ? 'gunner' : 'pilot';
  if (role !== lastRole) {
    lastRole = role;
    $('h-role').textContent = role === 'spec' ? 'Observer' : role === 'gunner' ? 'Gunner' : 'Pilot';
    $('hud-br').innerHTML = role === 'gunner'
      ? `<b>Mouse</b> aim turret<br><b>LMB</b> fire ${WEAP[P.race].tur.name}<br><b>C</b> back to pilot seat<br><b>H</b> hide hints`
      : role === 'spec' ? `<b>Tab / ←→</b> next ally<br><b>H</b> hide hints`
        : `<b>Mouse</b> steer · <b>LMB</b> fire<br><b>W / S</b> throttle · <b>A / D</b> roll<br><b>C</b> gunner seat<br><b>H</b> hide hints`;
  }
  const specEl = $('spec');
  if (role === 'spec') { if (lastSpec !== a) { lastSpec = a; specEl.innerHTML = `Following <b>${a.name}</b> · <span class="kbd">Tab</span> / <span class="kbd">←</span><span class="kbd">→</span> switch ally`; } specEl.classList.remove('hidden'); } else { specEl.classList.add('hidden'); lastSpec = null; }

  $('h-spd').textContent = (a.speedKmh | 0);
  $('h-alt').textContent = (a.alt | 0);
  const hd = ((Math.atan2(-a.fwd.x, a.fwd.z) * 180 / Math.PI) + 360) % 360;
  $('h-hdg').textContent = HDG[Math.round(hd / 45) % 8] + ' ' + (hd | 0);
  $('h-thr').style.transform = `scaleX(${a.throttle.toFixed(3)})`; $('h-thrn').textContent = Math.round(a.throttle * 100) + '%';
  const hpf = clamp01(a.hp / a.maxHp);
  const hpEl = $('h-hp'); hpEl.style.transform = `scaleX(${hpf.toFixed(3)})`; hpEl.style.background = hpf > .5 ? 'var(--ok)' : hpf > .25 ? 'var(--warn)' : 'var(--bad)';
  $('h-hpn').textContent = Math.ceil(a.hp);
  const g = a.gun, t = a.tur;
  $('h-w1n').textContent = 'Fwd guns'; $('h-w1').style.transform = `scaleX(${g.heat.toFixed(3)})`; $('h-w1t').textContent = g.locked ? 'HOT' : Math.round(g.heat * 100) + '%';
  $('h-w1m').classList.toggle('lock', g.locked);
  $('h-w2n').textContent = WEAP[a.race].tur.name.split(' ').slice(-1)[0];
  $('h-w2').style.transform = `scaleX(${(t.reload > 0 ? 1 - t.reload / t.cfg.reload : t.ammo / t.max).toFixed(3)})`;
  $('h-w2t').textContent = t.reload > 0 ? 'RELOAD' : t.ammo;
  $('dmg').style.opacity = (GAME.flash * .9 + (hpf < .28 && a.alive ? (.18 + .1 * Math.sin(GAME.t * 7)) : 0)).toFixed(3);

  drawOverlay(a, gunner);
  if ((hudFrame & 1) === 0) drawRadar(a);
}

/* ---------------- projection helpers ---------------- */
const _pv = new THREE.Vector3(), _pc = new THREE.Vector3();
function project(p, out) {                                // out = {x, y, front}
  _pc.copy(p).applyMatrix4(camera.matrixWorldInverse);
  out.front = _pc.z < -.1;
  _pv.copy(p).project(camera);
  out.x = (_pv.x * .5 + .5) * ovW; out.y = (-_pv.y * .5 + .5) * ovH;
  return out;
}
const _sp = { x: 0, y: 0, front: false }, _sp2 = { x: 0, y: 0, front: false };
const _wp1 = new THREE.Vector3(), _wp2 = new THREE.Vector3(), _wl = new THREE.Vector3();

function drawBracket(x, y, s, col, w = 2) {
  ov.strokeStyle = col; ov.lineWidth = w; const k = s * .38;
  ov.beginPath();
  ov.moveTo(x - s, y - s + k); ov.lineTo(x - s, y - s); ov.lineTo(x - s + k, y - s);
  ov.moveTo(x + s - k, y - s); ov.lineTo(x + s, y - s); ov.lineTo(x + s, y - s + k);
  ov.moveTo(x + s, y + s - k); ov.lineTo(x + s, y + s); ov.lineTo(x + s - k, y + s);
  ov.moveTo(x - s + k, y + s); ov.lineTo(x - s, y + s); ov.lineTo(x - s, y + s - k);
  ov.stroke();
}
function drawOverlay(view, gunner) {
  ov.clearRect(0, 0, ovW, ovH);
  const cx = ovW / 2, cy = ovH / 2;
  ov.font = '600 11px ui-monospace, Menlo, monospace'; ov.textAlign = 'center'; ov.lineJoin = 'round';
  const P = GAME.player;
  // ---------- markers
  let best = null, bestA = .5;
  for (const e of GAME.planes) {
    if (e === view || !e.alive) continue;
    const ally = e.team === view.team, col = GAME.teams[e.team].color;
    if (!ally && !canSee(view, e)) continue;
    const d = e.pos.distanceTo(view.pos);
    project(e.pos, _sp);
    if (_sp.front && _sp.x > 8 && _sp.x < ovW - 8 && _sp.y > 8 && _sp.y < ovH - 8) {
      const s = clamp(2600 / Math.max(d, 80) + 7, 9, 26);
      ov.globalAlpha = .95;
      if (ally) { ov.strokeStyle = col; ov.lineWidth = 2; ov.beginPath(); ov.moveTo(_sp.x, _sp.y - s - 5); ov.lineTo(_sp.x - 7, _sp.y - s - 15); ov.lineTo(_sp.x + 7, _sp.y - s - 15); ov.closePath(); ov.stroke(); drawBracket(_sp.x, _sp.y, s * .8, col, 1.5); }
      else drawBracket(_sp.x, _sp.y, s, col, 2);
      ov.fillStyle = col; ov.shadowColor = '#000'; ov.shadowBlur = 4;
      ov.fillText(`${d | 0} m`, _sp.x, _sp.y + s + 14);
      if (!ally || d < 600) {                                   // health bar
        const w = 34, f = clamp01(e.hp / e.maxHp);
        ov.shadowBlur = 0; ov.fillStyle = 'rgba(0,0,0,.6)'; ov.fillRect(_sp.x - w / 2, _sp.y + s + 18, w, 4);
        ov.fillStyle = f > .5 ? '#7be28a' : f > .25 ? '#ffc247' : '#ff5a4a'; ov.fillRect(_sp.x - w / 2, _sp.y + s + 18, w * f, 4);
      }
      ov.shadowBlur = 0; ov.globalAlpha = 1;
      if (!ally) { const dx = _sp.x - cx, dy = _sp.y - cy, an = Math.hypot(dx, dy) / ovH; if (an < bestA && d < 900) { bestA = an; best = e; } }
    } else if (!ally || d < 900) {                                // off-screen arrow
      _wl.copy(e.pos).applyMatrix4(camera.matrixWorldInverse);
      let dx = _wl.x, dy = -_wl.y; if (_wl.z > 0) { dx = -dx; dy = -dy; }
      const L = Math.hypot(dx, dy) || 1, r = Math.min(ovW, ovH) * .38, ax = cx + dx / L * r, ay = cy + dy / L * r, an = Math.atan2(dy, dx);
      ov.save(); ov.translate(ax, ay); ov.rotate(an); ov.globalAlpha = ally ? .55 : .85; ov.fillStyle = col;
      ov.beginPath(); ov.moveTo(11, 0); ov.lineTo(-7, -7); ov.lineTo(-3, 0); ov.lineTo(-7, 7); ov.closePath(); ov.fill(); ov.restore(); ov.globalAlpha = 1;
    }
  }
  if (view !== P && P && !P.alive) return;                        // spectating: no reticles
  if (!view.alive) return;
  // ---------- reticles
  if (!gunner) {
    // gun pipper (where the nose guns converge) + mouse steering marker + lead pip
    _wp1.copy(view.fwd).multiplyScalar(420).add(view.pos);
    project(_wp1, _sp);
    if (_sp.front) {
      ov.strokeStyle = 'rgba(255,230,160,.9)'; ov.lineWidth = 1.6;
      ov.beginPath(); ov.arc(_sp.x, _sp.y, 9, 0, 6.283); ov.moveTo(_sp.x - 16, _sp.y); ov.lineTo(_sp.x - 9, _sp.y); ov.moveTo(_sp.x + 9, _sp.y); ov.lineTo(_sp.x + 16, _sp.y); ov.moveTo(_sp.x, _sp.y - 16); ov.lineTo(_sp.x, _sp.y - 9); ov.moveTo(_sp.x, _sp.y + 9); ov.lineTo(_sp.x, _sp.y + 16); ov.stroke();
    }
    if (view.isPlayer) {
      _wp2.copy(view.aim).multiplyScalar(700).add(view.pos);
      project(_wp2, _sp2);
      if (_sp2.front) {
        ov.strokeStyle = 'rgba(160,230,255,.9)'; ov.lineWidth = 1.6; ov.beginPath(); ov.arc(_sp2.x, _sp2.y, 5.5, 0, 6.283); ov.stroke();
        ov.fillStyle = 'rgba(160,230,255,.9)'; ov.fillRect(_sp2.x - 1, _sp2.y - 1, 2, 2);
        if (_sp.front) { ov.globalAlpha = .28; ov.beginPath(); ov.moveTo(_sp.x, _sp.y); ov.lineTo(_sp2.x, _sp2.y); ov.stroke(); ov.globalAlpha = 1; }
      }
    }
    if (best) {                                                    // lead indicator for the enemy nearest to the crosshair
      const W = WEAP[view.race].gun;
      interceptDir(view.pos, view.vel, .92, best.pos, best.vel, W.speed, _wp1);
      project(_wp1, _sp2);
      if (_sp2.front) { ov.strokeStyle = 'rgba(255,90,70,.95)'; ov.lineWidth = 1.8; ov.beginPath(); ov.arc(_sp2.x, _sp2.y, 7, 0, 6.283); ov.stroke(); ov.beginPath(); ov.arc(_sp2.x, _sp2.y, 1.5, 0, 6.283); ov.fill(); }
    }
  } else {
    // turret view: aim cross in the middle, the barrel's actual direction slightly behind it, arc-limit warning
    const t = view.tur, lim = t.limited;
    ov.strokeStyle = lim ? 'rgba(255,90,70,.95)' : 'rgba(255,230,160,.95)'; ov.lineWidth = 1.8;
    ov.beginPath(); ov.arc(cx, cy, 14, 0, 6.283); ov.moveTo(cx - 26, cy); ov.lineTo(cx - 8, cy); ov.moveTo(cx + 8, cy); ov.lineTo(cx + 26, cy); ov.moveTo(cx, cy - 26); ov.lineTo(cx, cy - 8); ov.moveTo(cx, cy + 8); ov.lineTo(cx, cy + 26); ov.stroke();
    _wp1.copy(t.dirW).multiplyScalar(400).add(view.pos); project(_wp1, _sp);
    if (_sp.front) { ov.strokeStyle = 'rgba(160,230,255,.9)'; ov.lineWidth = 1.5; ov.strokeRect(_sp.x - 5, _sp.y - 5, 10, 10); }
    if (lim) { ov.fillStyle = 'rgba(255,90,70,.95)'; ov.font = '700 12px ui-monospace, Menlo, monospace'; ov.fillText('FIRING ARC LIMIT', cx, cy + 46); }
    // lead pip for the closest enemy near the crosshair
    if (best) { const C = t.cfg; interceptDir(view.pos, view.vel, .85, best.pos, best.vel, C.speed, _wp1, C.grav || 0); project(_wp1, _sp2); if (_sp2.front) { ov.strokeStyle = 'rgba(255,90,70,.95)'; ov.lineWidth = 1.8; ov.beginPath(); ov.arc(_sp2.x, _sp2.y, 7, 0, 6.283); ov.stroke(); } }
  }
}

/* ---------------- radar ---------------- */
const RADAR = { range: 1500 };
const ZONE_TINT = { elf: 'rgba(63,224,168,', dwarf: 'rgba(255,154,46,', human: 'rgba(74,168,255,', orc: 'rgba(255,74,58,' };
function drawRadar(view) {
  const S = radarCv.width, c = S / 2, R = c - 6, sc = R / RADAR.range;
  rg.clearRect(0, 0, S, S);
  rg.save();
  rg.beginPath(); rg.arc(c, c, R, 0, 6.283); rg.clip();
  rg.fillStyle = 'rgba(8,14,10,.82)'; rg.fillRect(0, 0, S, S);
  const psi = Math.atan2(view.fwd.x, view.fwd.z), cs = Math.cos(psi), sn = Math.sin(psi);
  const toR = (x, z, out) => { const dx = x - view.pos.x, dz = z - view.pos.z; out.x = c - (dx * cs - dz * sn) * sc; out.y = c - (dx * sn + dz * cs) * sc; return out; };
  const o = { x: 0, y: 0 };
  // battlefield zones (the four race territories)
  for (const k in ZONES) {
    const z = ZONES[k]; toR(z.x, z.z, o);
    const g = rg.createRadialGradient(o.x, o.y, 0, o.x, o.y, 700 * sc); g.addColorStop(0, ZONE_TINT[k] + '.28)'); g.addColorStop(1, ZONE_TINT[k] + '0)');
    rg.fillStyle = g; rg.fillRect(0, 0, S, S);
  }
  // world border
  rg.strokeStyle = 'rgba(255,120,80,.55)'; rg.lineWidth = 3; rg.beginPath();
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz], i) => { toR(sx * 1500, sz * 1500, o); i ? rg.lineTo(o.x, o.y) : rg.moveTo(o.x, o.y); });
  rg.closePath(); rg.stroke();
  // range rings + cross
  rg.strokeStyle = 'rgba(120,200,140,.25)'; rg.lineWidth = 1.5;
  for (const f of [.33, .66, 1]) { rg.beginPath(); rg.arc(c, c, R * f, 0, 6.283); rg.stroke(); }
  rg.beginPath(); rg.moveTo(c, c - R); rg.lineTo(c, c + R); rg.moveTo(c - R, c); rg.lineTo(c + R, c); rg.stroke();
  // north marker (north = world +Z, the direction the compass calls 'N')
  rg.fillStyle = '#ffd98a'; rg.font = '700 20px ui-monospace, Menlo, monospace'; rg.textAlign = 'center'; rg.textBaseline = 'middle';
  rg.fillText('N', c + sn * (R - 15), c - cs * (R - 15));
  // aircraft blips
  for (const e of GAME.planes) {
    if (e === view || !e.alive) continue;
    const ally = e.team === view.team;
    if (!ally && !canSee(view, e)) continue;
    toR(e.pos.x, e.pos.z, o);
    const dx = o.x - c, dy = o.y - c, dd = Math.hypot(dx, dy); if (dd > R - 6) { o.x = c + dx / dd * (R - 6); o.y = c + dy / dd * (R - 6); }
    const col = GAME.teams[e.team].color, rel = Math.atan2(e.fwd.x, e.fwd.z) - psi;
    rg.save(); rg.translate(o.x, o.y); rg.rotate(-rel + Math.PI); rg.fillStyle = col; rg.strokeStyle = 'rgba(0,0,0,.8)'; rg.lineWidth = 2;
    rg.beginPath(); rg.moveTo(0, 9); rg.lineTo(-6.5, -7); rg.lineTo(0, -3); rg.lineTo(6.5, -7); rg.closePath(); rg.stroke(); rg.fill(); rg.restore();
    const dh = e.pos.y - view.pos.y;
    if (Math.abs(dh) > 140) { rg.fillStyle = col; rg.font = '700 13px ui-monospace, monospace'; rg.fillText(dh > 0 ? '▲' : '▼', o.x + 12, o.y); }
  }
  // me
  rg.fillStyle = '#fff'; rg.strokeStyle = '#000'; rg.lineWidth = 2; rg.beginPath(); rg.moveTo(c, c - 10); rg.lineTo(c - 7, c + 8); rg.lineTo(c, c + 4); rg.lineTo(c + 7, c + 8); rg.closePath(); rg.stroke(); rg.fill();
  rg.restore();
  rg.strokeStyle = 'rgba(200,153,63,.9)'; rg.lineWidth = 3; rg.beginPath(); rg.arc(c, c, R, 0, 6.283); rg.stroke();
}
