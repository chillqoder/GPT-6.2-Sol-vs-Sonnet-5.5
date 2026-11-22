#!/usr/bin/env python3
"""Assembles game/index.html from: the world showcase, the aircraft/crew showcase and src/*.js (the game itself).
   Usage: python3 build.py   (run from the game/ folder)"""
import os, re, sys, glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WORLD = os.path.join(ROOT, 'world', 'index.html')
CHARS = os.path.join(ROOT, 'characters', 'index.html')

def rd(p):
    with open(p, encoding='utf-8') as f: return f.read()

def sub1(text, old, new, what):
    n = text.count(old)
    if n != 1:
        sys.exit(f'[build] patch "{what}" matched {n} times (expected 1)')
    return text.replace(old, new)

# ------------------------------------------------------------------ world
w = rd(WORLD)
body = w[w.index('<script type="module">') + len('<script type="module">'):]
body = body[:body.index('/* ======================================================================\n   7. HUD + MAIN LOOP')]
body = sub1(body, "import * as THREE from 'three';", '', 'world import')

# replace the free-flight camera (section 5) by a stub: the game drives the camera itself
a = body.index('const flight = {')
b = body.rindex('/* ====', 0, body.index('   6. WORLD OBJECTS'))
body = body[:a] + '''const flight = { yaw: 0, pitch: 0 };
const canvasEl = renderer.domElement;
canvasEl.tabIndex = 0;
camera.position.set(-40, 260, 340);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

''' + body[b:]

# mark instanced building batches so the game can derive collision volumes from them
body = sub1(body, 'scene.add(mesh); this.meshes.push(mesh);', 'mesh.userData.isBatch = true; scene.add(mesh); this.meshes.push(mesh);', 'batch mark')
# keep a handle on the static merged meshes too
body = sub1(body, "m.matrixAutoUpdate = false; scene.add(m); return m;", "m.matrixAutoUpdate = false; m.userData.isStatic = true; scene.add(m); return m;", 'static mark')
# world loading text uses its own element; harmless. Remove the artificial wait (we show our own loader)
body = sub1(body, "await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 40)));", "await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 60)));", 'startup wait')

# ------------------------------------------------------------------ aircraft / crew library
c = rd(CHARS)
i0 = c.index('/* ====================================================================\n *  0. CORE UTILITIES')
i1 = c.index('/* ====================================================================\n *  STAGE 1 — SCENE SETUP')
lib = c[i0:i1]
# resolution-aware primitive helpers (the game builds lighter variants of crews / aircraft)
lib = sub1(lib, "const cyl = (rt, rb, h, mat, seg = 24) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);",
                "let SEG = 1; const sg = (n, m = 3) => SEG >= 1 ? n : Math.max(m, Math.round(n * SEG)); const setSeg = (v) => { SEG = v; };\nconst cyl = (rt, rb, h, mat, seg = 24) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, sg(seg, 5)), mat);", 'cyl')
lib = sub1(lib, "const g = new THREE.CylinderGeometry(rt, rb, len, seg); g.rotateX(Math.PI / 2);", "const g = new THREE.CylinderGeometry(rt, rb, len, sg(seg, 5)); g.rotateX(Math.PI / 2);", 'cylZ')
lib = sub1(lib, "const g = new THREE.CylinderGeometry(r1, r2, len, seg); g.rotateZ(-Math.PI / 2);", "const g = new THREE.CylinderGeometry(r1, r2, len, sg(seg, 5)); g.rotateZ(-Math.PI / 2);", 'cylX')
lib = sub1(lib, "new THREE.SphereGeometry(r, ws, hs)", "new THREE.SphereGeometry(r, sg(ws, 6), sg(hs, 4))", 'sphere')
lib = sub1(lib, "new THREE.TorusGeometry(R, r, rs, ts)", "new THREE.TorusGeometry(R, r, sg(rs, 4), sg(ts, 8))", 'torus')
lib = sub1(lib, "new THREE.ConeGeometry(r, h, seg)", "new THREE.ConeGeometry(r, h, sg(seg, 4))", 'cone')
lib = sub1(lib, "new THREE.CapsuleGeometry(r, Math.max(.001, len - 2 * r), 4, seg)", "new THREE.CapsuleGeometry(r, Math.max(.001, len - 2 * r), SEG >= 1 ? 4 : 2, sg(seg, 5))", 'capsule')
lib = '/* ===== Aircraft & crew library (from the "hangar" showcase) ===== */\nconst AIR = (() => {\n' + lib + '\nreturn { createAircraft, createCrew, createPilot, createGunner, RACES, RACE_BUILDERS, M, canvasTexture, softDotTexture, finalize, metal, matte, setSeg, rng };\n})();\n'

# ------------------------------------------------------------------ game
parts = sorted(glob.glob(os.path.join(HERE, 'src', '[1-9][0-9]_*.js')))
game = '\n'.join(f'/* >>>>>>>>>> {os.path.basename(p)} <<<<<<<<<< */\n' + rd(p) for p in parts)

head = rd(os.path.join(HERE, 'src', '00_head.html'))
if '--cdn' not in sys.argv:
    # Embed Three.js (r169) so the game runs offline by just opening the file: the import map points at data: URLs.
    import base64
    def b64(path): return base64.b64encode(open(os.path.join(HERE, 'vendor', path), 'rb').read()).decode()
    imap = ('<script type="importmap">\n{ "imports": {\n  "three": "data:text/javascript;base64,%s",\n'
            '  "three/addons/utils/BufferGeometryUtils.js": "data:text/javascript;base64,%s"\n} }\n</script>') % (b64('three.module.min.js'), b64('BufferGeometryUtils.js'))
    a = head.index('<script type="importmap">'); b = head.index('</script>', a) + len('</script>')
    head = head[:a] + imap + head[b:]
out = head + '\n/* ===== World (from the "steampunk world" showcase) ===== */\n' + body + '\n' + lib + '\n' + game + '\n</script>\n</body>\n</html>\n'
dst = os.path.join(HERE, 'index.html')
with open(dst, 'w', encoding='utf-8') as f: f.write(out)
print(f'[build] {dst}  {len(out)/1024:.0f} KB  ({len(parts)} game parts: {", ".join(os.path.basename(p) for p in parts)})')
