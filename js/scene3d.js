/* ============================================================
   Space scene: a starfield with nebula, toon planets and low-poly rocks, and the head landing on a floating asteroid.
   One fixed canvas behind the page. Everything degrades: no WebGL -> painted CSS stars, reduced motion -> no animation.
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

(function main() {
  const root = document.documentElement;
  const hero = document.getElementById('top');
  const host = document.getElementById('scene3d');
  const meter = document.getElementById('launch-meter');
  const meterBar = document.getElementById('launch-bar');
  const meterTxt = document.getElementById('launch-text');
  const replayBtn = document.getElementById('replay-landing');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // the landing plays once per visit; coming back (or arriving on a link like /#contact) shows the head already landed
  let skipIntro = root.classList.contains('skip-intro');

  function fallback() {
    root.classList.remove('has-3d', 'boot'); root.classList.add('no-3d');
    if (hero) hero.classList.remove('hero-wait');
    if (meter) meter.remove();
    if (host) host.remove();
    window.dispatchEvent(new CustomEvent('hero:landed'));
  }

  let renderer;
  try {
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('no webgl');
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'default' });
  } catch (e) { return fallback(); }
  root.classList.add('has-3d'); root.classList.remove('no-3d');

  // Resolution is what decides how hard this runs (the scene itself is light), so it adapts: measured once at start, then watched.
  let dprCap = 1.5, probed = false, lite = false, storedQuality = false;
  try {
    const v = parseFloat(sessionStorage.getItem('jw-dprcap')); if (v > 0.5 && v < 4) { dprCap = v; probed = true; storedQuality = true; }
    if (sessionStorage.getItem('jw-lite') === '1') lite = true;
  } catch (e) {}
  if (navigator.connection && navigator.connection.saveData) { lite = true; dprCap = Math.min(dprCap, 1.0); probed = true; storedQuality = true; }
  let DPR = Math.min(window.devicePixelRatio || 1, dprCap);
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x080A14, 1);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const FOV = 24;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);

  /* ---------- palette: shadow / mid / light / rim (the rim is a cool back-light on the dark side) ---------- */
  const PAL = {
    cobalt: [0x1B2C9E, 0x3F66F5, 0x9DB6FF, 0xB8CBFF], coral: [0x8E2147, 0xF2552F, 0xFF9C7C, 0xFFC2A8], sun: [0x9A5B12, 0xF5C443, 0xFFE9A8, 0xFFF0C4],
    violet: [0x35207A, 0x7C5CFF, 0xC4B6FF, 0xD8CEFF], mint: [0x0E5560, 0x2EC4B6, 0xA9F3E6, 0xC4FFF4], slate: [0x171A2B, 0x343A57, 0x7E86AE, 0x9FB0FF],
    stone: [0x332A3F, 0x6B5A70, 0xB5A3AE, 0xB7C4FF], cream: [0xB9B3C9, 0xEFEBE2, 0xFFFFFF, 0xDCE6FF]
  };
  const INK = 0x10132A, CREAM = 0xF3F0E8;
  const FIRE = { deep: 0xD6301A, orange: 0xFF7A1C, yellow: 0xFFC62D, core: 0xFFF3C8, hot: 0xFF8A2A, hotCore: 0xFFC74A };
  const LIGHT = new THREE.Vector3(-0.45, 0.55, 0.7).normalize();
  // shared by every lit material: the light, and a little atmospheric fade so far things sit back in the dark
  const SU = { uL: { value: LIGHT }, uFogCol: { value: new THREE.Color(0x0B0D1C) }, uFogD: { value: 2.4 }, uFogK: { value: 0.42 } };

  const CEL_VERT = `varying vec3 vN; varying vec3 vV; varying float vDepth; varying vec3 vP;
    void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; vDepth = -mv.z; vP = position; gl_Position = projectionMatrix * mv; }`;
  const CEL_FUNCS = `uniform vec3 uL, uFogCol; uniform float uFogD, uFogK; varying vec3 vN; varying vec3 vV; varying float vDepth; varying vec3 vP;
    vec3 finish(vec3 c, vec3 n, float d, vec3 cR){
      float rim = 1.0 - max(dot(n, normalize(vV)), 0.0);
      c = mix(c, cR, step(0.76, rim) * step(d, 0.30));
      return mix(c, uFogCol, clamp((vDepth - uFogD) * uFogK, 0.0, 0.86));
    }`;

  const celCache = {};
  function celMat(name) {
    if (celCache[name]) return celCache[name];
    const t = PAL[name];
    return celCache[name] = new THREE.ShaderMaterial({
      uniforms: { ...SU, cS: { value: new THREE.Color(t[0]) }, cM: { value: new THREE.Color(t[1]) }, cL: { value: new THREE.Color(t[2]) }, cR: { value: new THREE.Color(t[3]) } },
      vertexShader: CEL_VERT,
      fragmentShader: `${CEL_FUNCS} uniform vec3 cS, cM, cL, cR;
        void main(){ vec3 n = normalize(vN); float d = dot(n, uL); vec3 c = d > 0.5 ? cL : (d > -0.05 ? cM : cS);
          gl_FragColor = vec4(finish(c, n, d, cR), 1.0);
          #include <colorspace_fragment>
        }`
    });
  }
  const hullCache = {};
  function hullMat(t, radial) {
    const key = t + (radial ? 'r' : 'n');
    if (hullCache[key]) return hullCache[key];
    return hullCache[key] = new THREE.ShaderMaterial({
      uniforms: { t: { value: t }, ink: { value: new THREE.Color(INK) } }, side: THREE.BackSide,
      vertexShader: `uniform float t; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position + ${radial ? 'normalize(position)' : 'normal'} * t, 1.0); }`,
      fragmentShader: `uniform vec3 ink; void main(){ gl_FragColor = vec4(ink, 1.0);
        #include <colorspace_fragment>
      }`
    });
  }
  function solid(geo, name, thick = 0.006, radial = false) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, celMat(name)), new THREE.Mesh(geo, hullMat(thick, radial)));
    return g;
  }

  /* ---------- shapes ---------- */
  const hash3 = (x, y, z, s) => { const j = Math.sin(x * 41.3 + y * 29.7 + z * 17.1 + s) * 43758.5453; return j - Math.floor(j) - 0.5; };
  function rockGeo(seed, jag = 0.3, squash = 0.88) {          // a faceted lump: low-poly on purpose
    const g = new THREE.IcosahedronGeometry(0.5, 1), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const n = Math.sin(v.x * 3.7 + seed) * Math.sin(v.y * 3.1 + seed * 1.9) * Math.sin(v.z * 4.3 + seed * 0.7) + 0.55 * Math.sin(v.x * 8.1 + v.y * 6.7 + v.z * 5.3 + seed * 2.3);
      const r = 0.5 * (1 + jag * n); p.setXYZ(i, v.x * r, v.y * r * squash, v.z * r);
    }
    g.computeVertexNormals(); return g;
  }
  function crystalGeo() { const g = new THREE.OctahedronGeometry(0.5, 0); g.scale(0.62, 1.25, 0.62); g.computeVertexNormals(); return g; }
  function islandGeo(topR, h, seed) {                          // the rocky underside: a craggy cone, point down
    const g = new THREE.CylinderGeometry(topR, topR * 0.1, h, 10, 4, true).toNonIndexed(), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); const t = (v.y + h / 2) / h, jr = hash3(v.x, v.y, v.z, seed), k = 1 + 0.34 * jr * (1 - t * 0.7);
      p.setXYZ(i, v.x * k, v.y + 0.07 * jr * (1 - t), v.z * k);
    }
    g.computeVertexNormals(); return g;
  }
  const ROCKS = [rockGeo(1.3), rockGeo(4.1, 0.34, 0.8), rockGeo(7.7, 0.28, 0.95), rockGeo(2.2, 0.36, 0.84)];
  const GEO = {
    cube: new RoundedBoxGeometry(1, 1, 1, 4, 0.14), sphere: new THREE.SphereGeometry(0.5, 48, 32), crystal: crystalGeo(),
    cyl: new THREE.LatheGeometry([[0.0001, -0.5], [0.4, -0.5], [0.47, -0.43], [0.47, 0.43], [0.4, 0.5], [0.0001, 0.5]].map(p => new THREE.Vector2(p[0], p[1])), 48),
    ring: new THREE.RingGeometry(0.68, 1.06, 96, 1), billboard: new THREE.PlaneGeometry(2, 2)
  };

  /* ---------- planets: toon-lit spheres with a pattern, optional ring, moon and a soft atmosphere ---------- */
  const PLANET_FRAG = `${CEL_FUNCS} uniform int uKind; uniform float uSeed; uniform vec3 aS, aM, aL, bS, bM, bL, cR;
    float h(float n){ return fract(sin(n * 91.345 + uSeed * 17.31) * 43758.5453); }
    vec3 band3(vec3 S, vec3 M, vec3 L, float d){ return d > 0.5 ? L : (d > -0.05 ? M : S); }
    void main(){
      vec3 n = normalize(vN); float d = dot(n, uL), p3 = 0.0; vec3 p = normalize(vP); float w = 0.0;
      if (uKind == 1) {
        float y = p.y + 0.07 * sin(p.x * 6.0 + uSeed) + 0.05 * sin(p.z * 8.0 + uSeed * 2.0);
        w = mod(floor(y * 4.5 + uSeed), 2.0);
      } else if (uKind == 2) {
        for (int i = 0; i < 6; i++) {
          float fi = float(i); vec3 c = normalize(vec3(h(fi * 3.1) - 0.5, h(fi * 5.3 + 1.0) - 0.5, h(fi * 7.7 + 2.0) - 0.5));
          float r = 0.20 + 0.16 * h(fi * 9.1 + 3.0), cd = dot(p, c);
          if (cd > cos(r)) w = 1.0;
          if (cd > cos(r) && cd < cos(r * 0.8)) w = 2.0;
        }
      } else if (uKind == 3) {
        float land = sin(p.x * 3.2 + uSeed) * sin(p.y * 3.8 + 1.0) * sin(p.z * 3.4 + 2.0) + 0.45 * sin(p.x * 6.5 + p.y * 5.0 + uSeed * 1.7) + 0.2 * sin(p.z * 9.0 + p.x * 4.0);
        w = step(0.22, land); if (abs(p.y) > 0.88) w = 2.0;
      }
      vec3 c;
      if (w < 0.5) c = band3(aS, aM, aL, d);
      else if (w < 1.5) c = band3(bS, bM, bL, d);
      else c = (uKind == 2) ? band3(mix(aS, aM, 0.5), mix(aM, aL, 0.5), aL, d) : band3(vec3(0.62, 0.66, 0.82), vec3(0.93, 0.94, 0.98), vec3(1.0), d);
      gl_FragColor = vec4(finish(c, n, d, cR), 1.0);
      #include <colorspace_fragment>
    }`;
  const KINDS = { plain: 0, bands: 1, moon: 2, earth: 3 };
  function planetMat(kind, a, b, seed) {
    const A = PAL[a], B = PAL[b || a], C = n => new THREE.Color(n);
    return new THREE.ShaderMaterial({
      uniforms: { ...SU, uKind: { value: KINDS[kind] }, uSeed: { value: seed }, aS: { value: C(A[0]) }, aM: { value: C(A[1]) }, aL: { value: C(A[2]) }, bS: { value: C(B[0]) }, bM: { value: C(B[1]) }, bL: { value: C(B[2]) }, cR: { value: C(A[3]) } },
      vertexShader: CEL_VERT, fragmentShader: PLANET_FRAG
    });
  }
  function ringMat(a, b) {
    const A = PAL[a], B = PAL[b], C = n => new THREE.Color(n);
    return new THREE.ShaderMaterial({
      uniforms: { ...SU, aM: { value: C(A[1]) }, aS: { value: C(A[0]) }, bM: { value: C(B[1]) }, bS: { value: C(B[0]) } }, side: THREE.DoubleSide,
      vertexShader: CEL_VERT,
      fragmentShader: `${CEL_FUNCS} uniform vec3 aM, aS, bM, bS;
        void main(){
          float r = length(vP.xy); if (r > 0.80 && r < 0.84) discard; if (r > 0.955 && r < 0.985) discard;
          vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0); float d = dot(n, uL), lit = step(-0.05, d);
          vec3 c = r < 0.80 ? mix(aS, aM, lit) : (r < 0.955 ? mix(bS, bM, lit) : mix(aS, aM, lit * 0.6));
          gl_FragColor = vec4(finish(c, n, d, c), 1.0);
          #include <colorspace_fragment>
        }`
    });
  }
  const haloMat = (hex, a) => new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(hex) }, a: { value: a } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; float s = length(modelMatrix[0].xyz); vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy * s; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 c; uniform float a; varying vec2 vP; void main(){ float g = smoothstep(1.0, 0.375, length(vP)); gl_FragColor = vec4(c * g * g * g * a, 1.0);
      #include <colorspace_fragment>
    }`
  });
  const sparkleMat = (hex, ph) => new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(hex) }, uTime: sparkleTime, ph: { value: ph } }, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; float s = length(modelMatrix[0].xyz); vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy * s; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 c; uniform float uTime, ph; varying vec2 vP;
      void main(){ float v = sqrt(abs(vP.x)) + sqrt(abs(vP.y)); float a = (1.0 - smoothstep(0.88, 1.0, v)) * (0.55 + 0.45 * sin(uTime * 2.2 + ph)); if (a < 0.02) discard; gl_FragColor = vec4(c, a);
        #include <colorspace_fragment>
      }`
  });
  var sparkleTime = { value: 0 };

  function makeObj(d) {
    const root3 = new THREE.Group(); let spin = root3, moonP = null;
    if (d.kind === 'rock' || d.kind === 'crystal') {
      const geo = d.kind === 'rock' ? ROCKS[(d.rk || 0) % ROCKS.length] : GEO.crystal;
      root3.add(new THREE.Mesh(geo, celMat(d.pal)), new THREE.Mesh(geo, hullMat(0.03, true)));
    } else if (d.kind === 'sparkle') {
      const m = new THREE.Mesh(GEO.billboard, sparkleMat(d.pal === 'coral' ? PAL.coral[2] : (d.pal === 'sun' ? PAL.sun[2] : CREAM), Math.random() * 6.28)); root3.add(m); spin = null;
    } else {                                                    // planets: moon / bands / earth / ring
      const [a, b] = Array.isArray(d.pal) ? d.pal : [d.pal, d.pal];
      const kind = d.kind === 'ring' ? 'bands' : d.kind;
      const body = new THREE.Group(); spin = body;
      body.add(new THREE.Mesh(GEO.sphere, planetMat(kind, a, b, d.seed || 1.0)), new THREE.Mesh(GEO.sphere, hullMat(d.s > 0.3 ? 0.012 : 0.02, true)));
      root3.add(body);
      if (d.kind === 'ring') {
        const r = new THREE.Mesh(GEO.ring, ringMat(d.ringPal ? d.ringPal[0] : 'cream', d.ringPal ? d.ringPal[1] : 'sun')); r.rotation.set(-1.22, 0.16, -0.36); root3.add(r);
      }
      if (d.moon) {
        moonP = new THREE.Group(); const mm = new THREE.Group();
        mm.add(new THREE.Mesh(GEO.sphere, planetMat('moon', 'slate', 'stone', 3.3)), new THREE.Mesh(GEO.sphere, hullMat(0.04, true)));
        mm.scale.setScalar(0.26); mm.position.set(0.92, 0.12, 0); moonP.add(mm); moonP.rotation.z = 0.25; root3.add(moonP);
      }
      if (d.halo) { const h = new THREE.Mesh(GEO.billboard, haloMat(PAL[a][3], d.halo)); h.scale.setScalar(1.16); h.renderOrder = -2; h.userData.isHalo = true; root3.add(h); }
    }
    root3.userData = { ...d, spinT: spin, moonP };
    return root3;
  }

  /* ---------- the background: the nebula is baked once into a small texture and the stars are plain points, so the whole sky costs almost nothing per frame ---------- */
  const NOISE_GLSL = `float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
    float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(7.1, 3.7); a *= 0.5; } return s; }`;
  const nebRT = new THREE.WebGLRenderTarget(64, 64, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  const nebMat = new THREE.ShaderMaterial({
    uniforms: { uExt: { value: new THREE.Vector2(1, 1) } }, depthTest: false, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `precision highp float; uniform vec2 uExt; varying vec2 vUv; ${NOISE_GLSL}
      void main(){ vec2 np = vUv * uExt; gl_FragColor = vec4(fbm(np * 1.1), vnoise(np * 3.0 + 11.0) * 0.65 + vnoise(np * 6.0) * 0.35, 0.0, 1.0); }`
  });
  const bakeScene = new THREE.Scene(), bakeCam = new THREE.Camera(), bakeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), nebMat);
  bakeQuad.frustumCulled = false; bakeScene.add(bakeQuad);
  const BGU = { uRes: { value: new THREE.Vector2(1, 1) }, uDpr: { value: DPR }, uScroll: { value: 0 }, uTime: { value: 0 }, uPage: { value: 0 }, uNeb: { value: nebRT.texture }, uExt: nebMat.uniforms.uExt };
  let nebKey = '';
  function bakeNebula() {
    const U = Math.round(state.aspect * 125) / 100, V = Math.ceil((1 + 0.10 * state.maxScroll / state.vh) * 1.25 * 4) / 4, key = U + '|' + V;
    if (key === nebKey) return; nebKey = key;
    const d = 260, w = Math.min(2048, Math.max(64, Math.round(U * d))), h = Math.min(2048, Math.max(64, Math.round(V * d)));
    nebRT.setSize(w, h); nebMat.uniforms.uExt.value.set(U, V);
    const prev = renderer.getRenderTarget(); renderer.setRenderTarget(nebRT); renderer.render(bakeScene, bakeCam); renderer.setRenderTarget(prev);
  }
  const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: BGU, depthTest: false, depthWrite: false,
    vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `precision highp float; uniform vec2 uRes, uExt; uniform float uDpr, uScroll, uPage; uniform sampler2D uNeb;
      void main(){
        vec2 frag = gl_FragCoord.xy / uDpr, p = vec2(frag.x, uRes.y - frag.y), uvn = p / uRes;
        vec3 col = vec3(0.031, 0.039, 0.078);
        col += vec3(0.060, 0.080, 0.230) * smoothstep(1.0, 0.0, length((uvn - vec2(0.78, 0.0)) * vec2(1.0, 1.35)));
        col += vec3(0.060, 0.025, 0.090) * smoothstep(0.9, 0.0, length((uvn - vec2(0.0, 0.62)) * vec2(1.2, 1.0)));
        vec2 nz = texture2D(uNeb, vec2(p.x, p.y + uScroll * 0.10) / uRes.y * 1.25 / uExt).rg;
        vec3 neb = mix(vec3(0.10, 0.16, 0.52), vec3(0.50, 0.17, 0.58), smoothstep(0.35, 0.75, nz.g));
        neb = mix(neb, vec3(0.95, 0.36, 0.22), smoothstep(0.62, 1.0, uPage) * 0.7);
        float na = smoothstep(0.40, 0.88, nz.r) * 0.34;
        col = mix(col, neb, na * 0.55) + neb * na * 0.10;
        col *= 1.0 - 0.38 * smoothstep(0.55, 1.25, length(uvn - 0.5) * 1.4);
        col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
      }`
  }));
  bgQuad.frustumCulled = false; bgQuad.renderOrder = -100; scene.add(bgQuad);
  // three parallax layers of stars: a jittered grid each (even, never clumped), shuffled so any prefix is evenly spread
  const STAR_LAYERS = [{ gx: 26, gy: 19, keep: 0.30, par: 0.05, size: 0.95 }, { gx: 15, gy: 11, keep: 0.30, par: 0.12, size: 1.3 }, { gx: 8, gy: 6, keep: 0.32, par: 0.26, size: 1.9 }];
  const starList = [];
  STAR_LAYERS.forEach(L => { for (let cy = 0; cy < L.gy; cy++) for (let cx = 0; cx < L.gx; cx++) if (Math.random() < L.keep) starList.push([(cx + 0.2 + 0.6 * Math.random()) / L.gx, (cy + 0.2 + 0.6 * Math.random()) / L.gy, L.size * (0.6 + 0.9 * Math.random()), Math.random() * 6.283, Math.random(), L.par]); });
  for (let i = starList.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [starList[i], starList[j]] = [starList[j], starList[i]]; }
  const starPos = new Float32Array(starList.length * 3), starAtt = new Float32Array(starList.length * 4);
  starList.forEach((q, i) => { starPos.set([q[0], q[1], 0], i * 3); starAtt.set([q[2], q[3], q[4], q[5]], i * 4); });
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3)); starGeo.setAttribute('aS', new THREE.BufferAttribute(starAtt, 4));
  // warp: when the page moves fast (a nav jump, a flick on a phone), every star smears along its path like a long exposure.
  // Nearer layers (more parallax) smear more. At reading speed nothing changes.
  const WARP = { uWarp: { value: 0 }, uMaxPt: { value: 64 } };
  try { const gl = renderer.getContext(), r = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE); if (r && r[1]) WARP.uMaxPt.value = Math.min(r[1], 256); } catch (e) {}
  const stars = new THREE.Points(starGeo, new THREE.ShaderMaterial({
    uniforms: { uRes: BGU.uRes, uDpr: BGU.uDpr, uScroll: BGU.uScroll, uTime: BGU.uTime, ...WARP }, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform vec2 uRes; uniform float uDpr, uScroll, uTime, uWarp, uMaxPt; attribute vec4 aS; varying vec3 vC; varying float vSt;
      void main(){
        float tileH = uRes.y * 1.12, y = mod(position.y * tileH - uScroll * aS.w, tileH);
        float tw = 0.72 + 0.28 * sin(uTime * (0.8 + 2.4 * fract(aS.y * 7.0)) + aS.y * 60.0);
        float base = aS.x * 8.0 * uDpr;
        float st = clamp(1.0 + uWarp * aS.w * uDpr / base, 1.0, max(1.0, uMaxPt / base));
        vSt = st;
        vC = mix(vec3(0.74, 0.82, 1.0), vec3(1.0, 0.85, 0.70), aS.z) * tw * (1.0 - 0.3 * smoothstep(1.5, 8.0, st));
        gl_Position = vec4(position.x * 2.0 - 1.0, 1.0 - 2.0 * y / uRes.y, 0.0, 1.0);
        gl_PointSize = base * st;
      }`,
    fragmentShader: `varying vec3 vC; varying float vSt;
      void main(){ vec2 p = gl_PointCoord - 0.5; p.x *= vSt; float r = length(p) * 2.0;
        float k = (1.0 - smoothstep(0.16, 0.30, r)) + exp(-r * r * 9.0) * 0.30; gl_FragColor = vec4(vC * k, 1.0); }`
  }));
  stars.frustumCulled = false; stars.renderOrder = -99; scene.add(stars);

  /* ---------- the landing: a floating asteroid with a pad on top (the top of the pad is y = 0) ---------- */
  const heroG = new THREE.Group(); scene.add(heroG);
  const platform = new THREE.Group(); heroG.add(platform);
  function layer(w, h, d, y, name, r = 0.03) {
    const m = solid(new RoundedBoxGeometry(w, h, d, 4, r), name, 0.007); m.position.y = y - h / 2; platform.add(m); return m;
  }
  layer(0.60, 0.060, 0.46, -0.045, 'cobalt');     // trim
  layer(0.55, 0.045, 0.42, 0.0, 'cream');         // the pad
  const rock1 = islandGeo(0.31, 0.27, 2.0), rock2 = islandGeo(0.14, 0.2, 9.0);
  { const m = new THREE.Group(); m.add(new THREE.Mesh(rock1, celMat('stone')), new THREE.Mesh(rock1, hullMat(0.008, true))); m.scale.set(1, 1, 0.78); m.position.y = -0.095 - 0.135; platform.add(m); }
  { const m = new THREE.Group(); m.add(new THREE.Mesh(rock2, celMat('slate')), new THREE.Mesh(rock2, hullMat(0.006, true))); m.position.set(-0.17, -0.12 - 0.1, 0.07); m.rotation.y = 0.8; platform.add(m); }
  { const m = new THREE.Group(); m.add(new THREE.Mesh(rock2, celMat('stone')), new THREE.Mesh(rock2, hullMat(0.006, true))); m.position.set(0.15, -0.11 - 0.1, -0.05); m.scale.set(0.8, 0.9, 0.8); platform.add(m); }
  const pad = new THREE.Mesh(new THREE.CircleGeometry(0.21, 64), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    uniforms: { c: { value: new THREE.Color(PAL.coral[1]) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 c; varying vec2 vUv;
      void main(){ vec2 p = (vUv - 0.5) * 0.42; float r = length(p);
        float ring = step(abs(r - 0.172), 0.0058), dash = step(0.5, fract(atan(p.y, p.x) * 14.0 / 6.2831853)), ring2 = step(abs(r - 0.125), 0.003) * dash;
        if (ring + ring2 < 0.5) discard; gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`
  }));
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.002; platform.add(pad);
  // props on the pad: a crate, a beacon, a little crystal cluster
  const crate = solid(GEO.cube, 'coral', 0.0045); crate.scale.setScalar(0.07); crate.position.set(-0.225, 0.037, -0.12); crate.rotation.y = 0.5; platform.add(crate);
  const beacon = new THREE.Group();
  { const b = solid(GEO.cyl, 'cobalt', 0.0045); b.scale.set(0.05, 0.085, 0.05); b.position.y = 0.0425; const t = solid(GEO.sphere, 'sun', 0.0045, true); t.scale.setScalar(0.045); t.position.y = 0.105; beacon.add(b, t); }
  beacon.position.set(0.23, 0.0, -0.115); platform.add(beacon);
  for (const [x, z, s, r] of [[0.225, 0.13, 0.085, 0.2], [0.265, 0.1, 0.055, -0.3], [0.19, 0.16, 0.05, 0.5]]) {
    const c = solid(GEO.crystal, 'mint', 0.03, true); c.scale.setScalar(s); c.position.set(x, s * 0.6, z); c.rotation.set(0.1, r, r * 0.5); platform.add(c);
  }

  /* ---------- the rocket (head + flame) ---------- */
  const rocket = new THREE.Group(), yawG = new THREE.Group(); rocket.add(yawG); heroG.add(rocket);
  const T_L = 1.9, T_DESC = 2.05, T_FOLLOW = 3.7, Y0 = 1.7;
  const NECK_A = 0.118, NECK_B = 0.168;
  const sstep = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
  const easeOutCubic = x => 1 - Math.pow(1 - x, 3);
  const rocketY = t => t >= T_L ? 0 : Y0 * Math.pow(1 - Math.min(Math.max(t / T_DESC, 0), 1), 2.2);
  const thrust = t => sstep(0, 0.2, t) * (1 - sstep(1.45, 2.0, t));
  const GLSL_PATH = `
    float sstepG(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
    float rocketY(float t){ if (t >= 1.9) return 0.0; return 1.7 * pow(1.0 - clamp(t / 2.05, 0.0, 1.0), 2.2); }
    float thrust(float t){ return sstepG(0.0, 0.2, t) * (1.0 - sstepG(1.45, 2.0, t)); }`;

  // flame: four nested solid tongues, rooted inside the neck. Each is a lathe whose cross-section is the neck's own ellipse and which turns with the head,
  // so it reads as a real volume (not a flat card). It is painted outside-in so the hot core sits inside the cooler skin, and the pad clips it at its own height.
  const FL_N = 48, FL_S = 44, FLAME_STEM = 0.07;
  const flameGeo = (() => {
    const g = new THREE.BufferGeometry(), V = (FL_N + 2) * (FL_S + 1);
    const pos = new Float32Array(V * 3), aT = new Float32Array(V), aA = new Float32Array(V), idx = [];
    for (let i = 0; i <= FL_N + 1; i++) for (let j = 0; j <= FL_S; j++) {
      const k = i * (FL_S + 1) + j, a = (j / FL_S) * Math.PI * 2;
      aT[k] = i === 0 ? -1 : (i - 1) / FL_N;
      aA[k] = a; pos.set([Math.cos(a) * 0.1, -Math.max(aT[k], 0) * 0.7, Math.sin(a) * 0.1], k * 3);
      if (i <= FL_N && j < FL_S) { const b = k + 1, c = k + FL_S + 1, d = c + 1; idx.push(k, b, c, b, d, c); }
    }
    const aR = new Float32Array(V); for (let k = 0; k < V; k++) { const a = aA[k], A = NECK_A * 0.86 - 0.0068, B = NECK_B * 0.86 - 0.0068; aR[k] = (A * B) / Math.sqrt((B * Math.cos(a)) ** 2 + (A * Math.sin(a)) ** 2); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aT', new THREE.BufferAttribute(aT, 1)); g.setAttribute('aA', new THREE.BufferAttribute(aA, 1)); g.setAttribute('aRad', new THREE.BufferAttribute(aR, 1)); g.setAttribute('aRad0', new THREE.BufferAttribute(aR.slice(), 1));
    g.setIndex(idx); return g;
  })();
  const FU = { uTime: { value: 0 }, uLen: { value: 0 }, uPadY: { value: -99 }, uC0: { value: new THREE.Vector2(0, 0) }, uA: { value: NECK_A * 0.86 - 0.0068 }, uB: { value: NECK_B * 0.86 - 0.0068 } };
  const flameShells = [];
  function flameShell(hex, wk, lk, seed, hull, order) {
    const geo = flameGeo.clone(); geo.setAttribute('aTop', new THREE.BufferAttribute(new Float32Array(geo.attributes.aT.count).fill(FLAME_STEM), 1)); flameShells.push({ geo, wk, hull });
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { ...FU, uCol: { value: new THREE.Color(hex) }, uWk: { value: wk }, uLk: { value: lk }, uSeed: { value: seed }, uHull: { value: hull ? 1 : 0 } },
      side: hull ? THREE.BackSide : THREE.FrontSide, transparent: true, depthWrite: false,
      vertexShader: `uniform float uTime, uLen, uA, uB, uWk, uLk, uSeed, uHull, uPadY; uniform vec2 uC0; attribute float aRad0; attribute float aT; attribute float aA; attribute float aTop; attribute float aRad; varying float vWy;
        float prof(float t, float yy){
          float flare = 1.0 + 0.10 * smoothstep(0.02, 0.10, yy) * (1.0 - smoothstep(0.10, 0.45, yy));
          float flick = 1.0 + 0.12 * (sin(uTime * 34.0 + uSeed + yy * 9.0) - 1.0) * smoothstep(0.0, 0.2, t);
          float lick = 1.0 + 0.07 * smoothstep(0.06, 0.30, yy) * sin(yy * 26.0 - uTime * 36.0 + uSeed * 2.0);
          return pow(max(1.0 - t, 0.0), 0.9) * flare * flick * lick;
        }
        void main(){
          float len = max(uLen * uLk, 0.001), t = max(aT, 0.0), yy = t * len;
          float R = prof(t, yy);
          float sw = yy / max(uLen, 0.2) * 0.31;
          vec2 sway = vec2(sin(yy * 9.0 - uTime * 28.0) * 0.08, sin(yy * 7.0 - uTime * 23.0 + 1.3) * 0.05) * sw;
          float ow = uHull * mix(0.0068, 0.0155, smoothstep(0.0, 0.3, t)) * (1.0 - smoothstep(0.9, 1.0, t));
          vec2 dir = vec2(cos(aA), sin(aA));
          float bloom = smoothstep(0.0, 0.11, yy);        // the fire starts snug against the lowest part of the head, then opens out like a nozzle
          vec3 p = vec3(sway + uC0 * (1.0 - bloom) + dir * (mix(aRad0, aRad, bloom) * R * uWk + ow), 0.0).xzy;
          p.y = (aT < 0.0 ? aTop : 0.0) - yy - uHull * 0.0155 * smoothstep(0.85, 1.0, t);
          vec4 wp = modelMatrix * vec4(p, 1.0); vWy = wp.y;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `uniform vec3 uCol; uniform float uPadY; varying float vWy;
        void main(){ if (vWy < uPadY) discard; gl_FragColor = vec4(uCol, 1.0);
          #include <colorspace_fragment>
        }`
    }));
    m.renderOrder = order; m.frustumCulled = false; return m;
  }
  const flameG = new THREE.Group(); flameG.position.set(-0.015, 0, -0.02); yawG.add(flameG);
  flameG.visible = false;
  flameG.add(
    flameShell(INK, 1.0, 1.0, 0.0, true, 2.0), flameShell(FIRE.deep, 1.0, 1.0, 0.0, false, 2.1), flameShell(FIRE.orange, 0.74, 0.82, 1.7, false, 2.2),
    flameShell(FIRE.yellow, 0.48, 0.62, 3.1, false, 2.3), flameShell(FIRE.core, 0.24, 0.38, 4.3, false, 2.4)
  );

  // sparks
  const NS = 140, sSeed = new Float32Array(NS * 4), sVel = new Float32Array(NS * 3), sPos = new Float32Array(NS * 3);
  for (let i = 0; i < NS; i++) { sSeed.set([Math.random(), Math.random(), 0, 0], i * 4); sVel.set([(Math.random() - 0.5) * 0.7, -(0.9 + Math.random() * 0.9), (Math.random() - 0.5) * 0.4], i * 3); }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3)); sGeo.setAttribute('aS', new THREE.BufferAttribute(sSeed, 4)); sGeo.setAttribute('aV', new THREE.BufferAttribute(sVel, 3));
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPx: { value: 800 } },
    vertexShader: `uniform float uTime, uPx; attribute vec4 aS; attribute vec3 aV; varying vec3 vC; ${GLSL_PATH}
      void main(){
        float life = 0.5 + aS.y * 0.45, age = fract(uTime * 1.6 + aS.x), emitT = uTime - age * life;
        float on = step(0.03, thrust(emitT));
        vec3 p = vec3(0.0, rocketY(emitT) - 0.02, 0.0) + aV * age * life;
        p.x += (fract(aS.x * 37.7) - 0.5) * 0.17; p.z += (fract(aS.y * 23.1) - 0.5) * 0.10;
        p.y = max(p.y, 0.012);
        int k = int(mod(floor(aS.x * 4.0 + aS.y * 8.0), 4.0));
        vC = k == 0 ? vec3(0.67, 0.03, 0.01) : (k == 1 ? vec3(1.0, 0.19, 0.012) : (k == 2 ? vec3(1.0, 0.56, 0.026) : vec3(1.0, 0.90, 0.58)));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = 0.016 * (1.0 - age) * on * uPx / -mv.z; gl_Position = projectionMatrix * mv;
        if (gl_PointSize < 0.8) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: `varying vec3 vC; void main(){ if (length(gl_PointCoord - 0.5) > 0.5) discard; gl_FragColor = vec4(vC, 1.0);
      #include <colorspace_fragment>
    }`
  });
  const sparks = new THREE.Points(sGeo, sparkMat); sparks.frustumCulled = false; heroG.add(sparks);

  // speed lines behind the head while it falls
  const speedLines = Array.from({ length: 30 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: i % 5 === 0 ? PAL.coral[1] : 0xB8C4FF, transparent: true, depthWrite: false }));
    m.userData = { x: (Math.random() * 2 - 1) * 0.55, z: -0.35 - Math.random() * 0.4, off: Math.random() * 3.0, k: 0.8 + Math.random() * 0.9 }; m.visible = false; heroG.add(m); return m;
  });

  // landing: action lines, rings, smoke, confetti, shadow blob, ground blast
  const impact = new THREE.Group(); impact.position.y = 0.006; impact.scale.setScalar(0.52); heroG.add(impact);
  const BURST_COL = [PAL.coral[1], PAL.sun[1], CREAM];
  const burstLines = Array.from({ length: 26 }, (_, i) => {
    const g = new THREE.Group(); g.rotation.y = (i / 26) * Math.PI * 2 + (i % 2) * 0.05;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: BURST_COL[i % 3], transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.visible = false; g.add(m); impact.add(g); m.userData = { seed: 0.7 + Math.random() * 0.6 }; return m;
  });
  const ringMatFlat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const ring1 = new THREE.Mesh(new THREE.RingGeometry(0.965, 1.0, 96), ringMatFlat(0x9DB6FF)), ring2 = new THREE.Mesh(new THREE.RingGeometry(0.96, 1.0, 96), ringMatFlat(PAL.coral[1]));
  ring1.rotation.x = ring2.rotation.x = -Math.PI / 2; ring1.visible = ring2.visible = false; impact.add(ring1, ring2);

  const smokeFrag = `uniform float uProg, uSeed; uniform vec3 cFill, cShade, cInk; varying vec2 vUv;
    float h(float n){ return fract(sin(n * 91.345 + uSeed * 17.31) * 43758.5453); }
    float cloud(vec2 p, float erode){
      float d = 1e5;
      for (int i = 0; i < 8; i++) {
        float fi = float(i), a = h(fi * 3.1) * 6.2831853, rr = 0.10 + 0.40 * h(fi * 5.7 + 1.0);
        vec2 c = vec2(cos(a) * rr * 1.15, sin(a) * rr * 0.72 + 0.04);
        d = min(d, length(p - c) - (0.21 + 0.19 * h(fi * 7.3 + 2.0) - erode));
      }
      return d;
    }
    void main(){
      vec2 p = (vUv - 0.5) * 2.0;
      float life = clamp(uProg, 0.0, 1.0), erode = smoothstep(0.25, 1.0, life) * 0.40, aa = 0.014;
      float d = cloud(p, erode);
      float edge = 1.0 - smoothstep(0.075 - aa, 0.075 + aa, d), fill = 1.0 - smoothstep(-aa, aa, d);
      float lit = 1.0 - smoothstep(-aa, aa, cloud(p - vec2(-0.13, 0.15), erode));
      vec3 col = mix(cInk, mix(cShade, cFill, lit), fill);
      float a = edge * (1.0 - smoothstep(0.82, 1.0, life));
      if (a < 0.01) discard;
      gl_FragColor = vec4(col, a);
      #include <colorspace_fragment>
    }`;
  const puffs = Array.from({ length: 14 }, (_, i) => {
    const back = i < 10, rnd = Math.random;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: { uProg: { value: 0 }, uSeed: { value: i * 1.37 + 0.5 }, cFill: { value: new THREE.Color(0xFFF8EA) }, cShade: { value: new THREE.Color(0xB9B5D6) }, cInk: { value: new THREE.Color(INK) } },
      transparent: true, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: smokeFrag
    }));
    m.renderOrder = 3;
    const g = new THREE.Group(); g.add(m);
    g.userData = back ? { a: Math.PI - 0.5 + (i / 9) * (Math.PI + 1.0), s: 0.8 + rnd() * 0.55, spin: (rnd() - 0.5) * 0.7, delay: rnd() * 0.06, front: false }
                      : { a: (0.30 + (i - 10) * 0.13) * Math.PI, s: 0.55 + rnd() * 0.2, spin: (rnd() - 0.5) * 0.7, delay: 0.05 + (i - 10) * 0.03, front: true };
    g.visible = false; heroG.add(g); return g;
  });
  const shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: INK, transparent: true, depthWrite: false }));
  shadowBlob.rotation.x = -Math.PI / 2; shadowBlob.position.y = 0.004; shadowBlob.visible = false; heroG.add(shadowBlob);
  const blast = [FIRE.deep, FIRE.orange, FIRE.yellow].map((c, i) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: c, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.006 + i * 0.0007; m.renderOrder = 1 + i; m.visible = false; heroG.add(m); return m;
  });
  const NB = 110, bVel = new Float32Array(NB * 3), bS = new Float32Array(NB * 2), bPos = new Float32Array(NB * 3);
  for (let i = 0; i < NB; i++) {
    const a = Math.random() * Math.PI * 2, sp = 0.35 + Math.random() * 0.85;
    bVel.set([Math.cos(a) * sp, 0.55 + Math.random() * 1.15, Math.sin(a) * sp * 0.8], i * 3); bS.set([Math.random(), Math.floor(Math.random() * 4)], i * 2);
  }
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3)); bGeo.setAttribute('aV', new THREE.BufferAttribute(bVel, 3)); bGeo.setAttribute('aS', new THREE.BufferAttribute(bS, 2));
  const burstMat = new THREE.ShaderMaterial({
    uniforms: { uTL: { value: -1 }, uPx: { value: 800 } },
    vertexShader: `uniform float uTL, uPx; attribute vec3 aV; attribute vec2 aS; varying vec3 vC;
      void main(){
        float t = max(uTL, 0.0);
        vec3 p = vec3(0.0, 0.03, 0.0) + aV * t * 0.9 + vec3(0.0, -1.6 * t * t, 0.0); p.y = max(p.y, 0.012);
        int k = int(aS.y);
        vC = k == 0 ? vec3(0.10, 0.28, 1.0) : (k == 1 ? vec3(1.0, 0.10, 0.04) : (k == 2 ? vec3(1.0, 0.58, 0.04) : vec3(0.95, 0.93, 0.88)));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = 0.02 * (1.0 - smoothstep(0.6, 1.5, t)) * step(0.0, uTL) * (0.7 + aS.x * 0.6) * uPx / -mv.z; gl_Position = projectionMatrix * mv;
        if (gl_PointSize < 0.8) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: `varying vec3 vC; void main(){ if (length(gl_PointCoord - 0.5) > 0.5) discard; gl_FragColor = vec4(vC, 1.0);
      #include <colorspace_fragment>
    }`
  });
  const burst = new THREE.Points(bGeo, burstMat); burst.frustumCulled = false; heroG.add(burst);

  /* ---------- things floating around the head (they ride with the asteroid) ---------- */
  const heroDefs = [
    { kind: 'ring', pal: ['sun', 'coral'], ringPal: ['cream', 'sun'], s: 0.15, p: [0.35, 0.50, 0.0], spin: 0.5 },
    { kind: 'moon', pal: 'slate', s: 0.10, p: [-0.31, 0.50, -0.10], spin: 0.4, seed: 2.0 },
    { kind: 'rock', pal: 'stone', rk: 0, s: 0.13, p: [-0.37, 0.20, -0.12], spin: [0.2, 0.35, 0.1] },
    { kind: 'rock', pal: 'coral', rk: 1, s: 0.075, p: [0.41, 0.17, 0.05], spin: [0.5, 0.3, 0.4] },
    { kind: 'rock', pal: 'slate', rk: 3, s: 0.055, p: [0.13, 0.64, -0.20], spin: [0.4, 0.6, 0.2] },
    { kind: 'crystal', pal: 'violet', s: 0.075, p: [-0.20, 0.66, 0.02], spin: [0.2, 0.7, 0.1] },
    { kind: 'rock', pal: 'cream', rk: 2, s: 0.04, p: [-0.28, -0.30, 0.10], spin: [0.5, 0.2, 0.5] },
    { kind: 'sparkle', pal: 'cream', s: 0.025, p: [0.20, 0.38, 0.12] }, { kind: 'sparkle', pal: 'sun', s: 0.02, p: [-0.38, 0.40, 0.1] },
    { kind: 'sparkle', pal: 'cream', s: 0.018, p: [0.43, 0.30, -0.05] }, { kind: 'sparkle', pal: 'coral', s: 0.02, p: [-0.12, 0.74, -0.1] }
  ];
  const heroObjs = heroDefs.map((d, i) => {
    const o = makeObj(d); o.userData.i = i; o.userData.base = new THREE.Vector3(...d.p); o.position.copy(o.userData.base); o.scale.setScalar(d.s); heroG.add(o); return o;
  });

  /* ---------- the big planet looming behind the head (a long way back, so it drifts slower than the page) ---------- */
  const backdrop = makeObj({ kind: 'bands', pal: ['violet', 'cobalt'], s: 1, seed: 3.0, halo: 0.28 });
  scene.add(backdrop);

  /* ---------- scenery down the page, anchored to sections ---------- */
  const ambientDefs = [
    { sec: 'about', f: 0.30, ex: 1.2, ey: 0.0, kind: 'earth', pal: ['cobalt', 'mint'], s: 0.36, z: -0.9, m: 1, moon: true, halo: 0.26, seed: 2.0 },
    { sec: 'about', f: 0.90, ex: -1.05, kind: 'rock', pal: 'stone', rk: 0, s: 0.11, z: -0.4, m: 0 },
    { sec: 'work', f: 0.05, ex: -1.24, kind: 'ring', pal: ['sun', 'coral'], ringPal: ['cream', 'sun'], s: 0.34, z: -1.7, m: 1, halo: 0.24, seed: 1.0 },
    { sec: 'work', f: 0.36, ex: 1.04, kind: 'rock', pal: 'coral', rk: 1, s: 0.13, z: -0.5, m: 1 },
    { sec: 'work', f: 0.60, ex: -1.04, kind: 'rock', pal: 'stone', rk: 2, s: 0.09, z: -0.3, m: 0 },
    { sec: 'work', f: 0.84, ex: 1.10, kind: 'moon', pal: 'slate', s: 0.24, z: -1.0, m: 1, seed: 4.0 },
    { sec: 'skills', f: 0.30, ex: -1.24, kind: 'bands', pal: ['mint', 'cobalt'], s: 0.40, z: -1.9, m: 1, halo: 0.26, seed: 2.0 },
    { sec: 'skills', f: 0.80, ex: 1.04, kind: 'rock', pal: 'stone', rk: 3, s: 0.12, z: -0.4, m: 0 },
    { sec: 'skills', f: 0.12, ex: 1.06, kind: 'crystal', pal: 'mint', s: 0.11, z: -0.3, m: 1 },
    { sec: 'testimonial', f: 0.5, ex: -1.06, kind: 'moon', pal: 'cream', s: 0.17, z: -0.7, m: 1, seed: 1.0 },
    { sec: 'testimonial', f: 0.3, ex: 1.05, kind: 'rock', pal: 'violet', rk: 0, s: 0.08, z: -0.3, m: 0 },
    { sec: 'contact', f: 0.18, ex: 1.06, kind: 'rock', pal: 'coral', rk: 2, s: 0.10, z: -0.4, m: 1 },
    { sec: 'contact', f: 0.55, ex: -1.07, kind: 'crystal', pal: 'violet', s: 0.10, z: -0.4, m: 0 },
    { sec: 'about', f: 0.16, ex: 0.95, kind: 'sparkle', pal: 'cream', s: 0.03, z: -0.2, m: 1 }, { sec: 'about', f: 0.62, ex: 0.95, kind: 'sparkle', pal: 'sun', s: 0.026, z: -0.2, m: 0 },
    { sec: 'work', f: 0.22, ex: 0.96, kind: 'sparkle', pal: 'cream', s: 0.026, z: -0.2, m: 1 }, { sec: 'work', f: 0.72, ex: -0.96, kind: 'sparkle', pal: 'coral', s: 0.03, z: -0.2, m: 0 },
    { sec: 'skills', f: 0.55, ex: 0.95, kind: 'sparkle', pal: 'cream', s: 0.03, z: -0.2, m: 1 }, { sec: 'testimonial', f: 0.7, ex: 0.95, kind: 'sparkle', pal: 'sun', s: 0.026, z: -0.2, m: 0 }
  ];
  // other pages (all projects, case studies) have no hero: just scenery, spread down the page
  const SUB = [
    { kind: 'ring', pal: ['sun', 'coral'], ringPal: ['cream', 'sun'], s: 0.30, z: -1.5, halo: 0.24, seed: 1.0 }, { kind: 'rock', pal: 'stone', rk: 0, s: 0.12, z: -0.4 },
    { kind: 'moon', pal: 'slate', s: 0.22, z: -0.9, seed: 4.0 }, { kind: 'bands', pal: ['mint', 'cobalt'], s: 0.36, z: -1.7, halo: 0.26, seed: 2.0 },
    { kind: 'rock', pal: 'coral', rk: 1, s: 0.11, z: -0.4 }, { kind: 'earth', pal: ['cobalt', 'mint'], s: 0.32, z: -1.0, moon: true, halo: 0.26, seed: 2.0 },
    { kind: 'crystal', pal: 'violet', s: 0.1, z: -0.3 }, { kind: 'rock', pal: 'slate', rk: 2, s: 0.09, z: -0.3 },
    { kind: 'moon', pal: 'cream', s: 0.18, z: -0.8, seed: 1.0 }, { kind: 'sparkle', pal: 'cream', s: 0.03, z: -0.2 }, { kind: 'rock', pal: 'stone', rk: 3, s: 0.1, z: -0.4 }, { kind: 'sparkle', pal: 'sun', s: 0.03, z: -0.2 }
  ].map((d, i) => ({ ...d, sec: 'main', f: 0.5, ex: i % 2 ? 1.16 : -1.16, m: i % 2, sub: true }));
  const ambientG = new THREE.Group(); scene.add(ambientG);
  const ambient = (hero ? ambientDefs : SUB).map((d, i) => {
    const o = makeObj(d); Object.assign(o.userData, { i, aspin: [0.12 + (i % 3) * 0.06, 0.18 + (i % 4) * 0.05, 0.08], phase: i * 1.7 }); ambientG.add(o); return o;
  });

  /* ---------- the head (async) ---------- */
  let head = null, headReady = false;
  function smoothNormals(geo, iters) {
    const pos = geo.attributes.position, nrm = geo.attributes.normal, idx = geo.index.array, n = pos.count;
    // weld vertices that share a position, then average normals over the neighbours (typed arrays throughout: this used to cost a visible hitch)
    const key = i => Math.round(pos.getX(i) * 1e5) + ',' + Math.round(pos.getY(i) * 1e5) + ',' + Math.round(pos.getZ(i) * 1e5);
    const groupOf = new Int32Array(n), map = new Map(); let G = 0;
    for (let i = 0; i < n; i++) { const k = key(i); let g = map.get(k); if (g === undefined) { g = G++; map.set(k, g); } groupOf[i] = g; }
    const T = idx.length / 3, ea = new Int32Array(T * 6), eb = new Int32Array(T * 6), deg = new Int32Array(G + 1); let e = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const a = groupOf[idx[t]], b = groupOf[idx[t + 1]], c = groupOf[idx[t + 2]];
      ea[e] = a; eb[e++] = b; ea[e] = b; eb[e++] = a; ea[e] = b; eb[e++] = c; ea[e] = c; eb[e++] = b; ea[e] = c; eb[e++] = a; ea[e] = a; eb[e++] = c;
    }
    for (let i = 0; i < e; i++) deg[ea[i] + 1]++;
    for (let g = 0; g < G; g++) deg[g + 1] += deg[g];
    const fill = deg.slice(0, G), raw = new Int32Array(e);
    for (let i = 0; i < e; i++) raw[fill[ea[i]]++] = eb[i];
    const start = new Int32Array(G + 1), nb = new Int32Array(e), stamp = new Int32Array(G).fill(-1); let m = 0;
    for (let g = 0; g < G; g++) { start[g] = m; for (let k = deg[g]; k < deg[g + 1]; k++) { const o = raw[k]; if (o !== g && stamp[o] !== g) { stamp[o] = g; nb[m++] = o; } } }
    start[G] = m;
    let cur = new Float32Array(G * 3), nxt = new Float32Array(G * 3);
    for (let i = 0; i < n; i++) { const g = groupOf[i] * 3; cur[g] += nrm.getX(i); cur[g + 1] += nrm.getY(i); cur[g + 2] += nrm.getZ(i); }
    const norm = a => { for (let g = 0; g < G; g++) { const x = a[g*3], y = a[g*3+1], z = a[g*3+2], l = 1 / (Math.sqrt(x * x + y * y + z * z) || 1); a[g*3] = x * l; a[g*3+1] = y * l; a[g*3+2] = z * l; } };
    norm(cur);
    for (let it = 0; it < iters; it++) {
      for (let g = 0; g < G; g++) {
        let x = cur[g*3], y = cur[g*3+1], z = cur[g*3+2];
        for (let k = start[g]; k < start[g + 1]; k++) { const o = nb[k] * 3; x += cur[o]; y += cur[o+1]; z += cur[o+2]; }
        nxt[g*3] = x; nxt[g*3+1] = y; nxt[g*3+2] = z;
      }
      norm(nxt); const tmp = cur; cur = nxt; nxt = tmp;
    }
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const g = groupOf[i] * 3; out[i*3] = cur[g]; out[i*3+1] = cur[g+1]; out[i*3+2] = cur[g+2]; }
    geo.setAttribute('aN', new THREE.BufferAttribute(out, 3));
  }
  // The neck is a closed, uneven underside tucked under the chin, not a flat cut. So the flame does not start from a flat plane inside it:
  // its top edge is set, point by point, to the height of the head's lowest surface at that spot (measured here from the mesh itself),
  // which is what makes it grow out of the head instead of poking through the front.
  function fitFlameToHead() {
    yawG.updateMatrixWorld(true);
    const M = yawG.matrixWorld.clone().invert().multiply(head.matrixWorld), pos = head.geometry.attributes.position, idx = head.geometry.index.array, n = pos.count;
    const X0 = -0.24, X1 = 0.20, Z0 = -0.26, Z1 = 0.22, N = 72, cx = (X1 - X0) / N, cz = (Z1 - Z0) / N, H = new Float32Array(N * N).fill(Infinity), v = new THREE.Vector3(), P = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(M); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      if (P[a + 1] > 0.35 && P[b + 1] > 0.35 && P[c + 1] > 0.35) continue;
      const ax = P[a], az = P[a + 2], bx = P[b], bz = P[b + 2], cxp = P[c], czp = P[c + 2], den = (bz - czp) * (ax - cxp) + (cxp - bx) * (az - czp);
      if (Math.abs(den) < 1e-9) continue;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cxp) - X0) / cx)), i1 = Math.min(N - 1, Math.floor((Math.max(ax, bx, cxp) - X0) / cx));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz, czp) - Z0) / cz)), j1 = Math.min(N - 1, Math.floor((Math.max(az, bz, czp) - Z0) / cz));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = X0 + (i + 0.5) * cx, pz = Z0 + (j + 0.5) * cz;
        const w0 = ((bz - czp) * (px - cxp) + (cxp - bx) * (pz - czp)) / den, w1 = ((czp - az) * (px - cxp) + (ax - cxp) * (pz - czp)) / den, w2 = 1 - w0 - w1;
        if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
        const y = w0 * P[a + 1] + w1 * P[b + 1] + w2 * P[c + 1]; if (y < H[j * N + i]) H[j * N + i] = y;
      }
    }
    const heightAt = (x, z) => {                 // nearest measured cell (searching outward a little if the spot is not covered)
      const i = Math.round((x - X0) / cx - 0.5), j = Math.round((z - Z0) / cz - 0.5);
      for (let r = 0; r < 7; r++) { let best = Infinity; for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue; best = Math.min(best, H[jj * N + ii]); } if (best < Infinity) return best; }
      return FLAME_STEM;
    };
    // where the underside is low is where the fire can leave the head. The root of the flame is the very lowest part (a snug footprint),
    // and it opens out to the full width just below. Both footprints are read from the head itself.
    const footprint = lim => {
      let sx = 0, sz = 0, sn = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (H[j * N + i] <= lim) { sx += X0 + (i + 0.5) * cx; sz += Z0 + (j + 0.5) * cz; sn++; }
      const inLow = (x, z) => { const i = Math.floor((x - X0) / cx), j = Math.floor((z - Z0) / cz); return i >= 0 && j >= 0 && i < N && j < N && H[j * N + i] <= lim; };
      const ox = sx / sn, oz = sz / sn, NA = 72; let reach = new Float32Array(NA);
      for (let k = 0; k < NA; k++) { const a = (k / NA) * Math.PI * 2; let r = 0; while (r < 0.3 && inLow(ox + Math.cos(a) * r, oz + Math.sin(a) * r)) r += 0.002; reach[k] = r; }
      for (let pass = 0; pass < 4; pass++) { const nx = new Float32Array(NA); for (let k = 0; k < NA; k++) nx[k] = (reach[(k + NA - 1) % NA] + 2 * reach[k] + reach[(k + 1) % NA]) / 4; reach = nx; }
      const r = a => { const f = ((a / (Math.PI * 2)) % 1 + 1) % 1 * NA, k = Math.floor(f), t = f - k; return Math.min(0.15, Math.max(0.03, 0.86 * (reach[k % NA] * (1 - t) + reach[(k + 1) % NA] * t) - 0.0068)); };
      return { ox, oz, r, cells: sn };
    };
    const full = footprint(0.075), root = footprint(0.040);
    flameG.position.set(full.ox, 0, full.oz); FU.uC0.value.set(root.ox - full.ox, root.oz - full.oz);
    flameShells.forEach(sh => {
      const top = sh.geo.attributes.aTop, rad = sh.geo.attributes.aRad, rad0 = sh.geo.attributes.aRad0, aA = sh.geo.attributes.aA.array, ow = sh.hull ? 0.0068 : 0;
      for (let k = 0; k < rad.count; k++) { rad.array[k] = full.r(aA[k]); rad0.array[k] = root.r(aA[k]); }
      for (let j = 0; j <= FL_S; j++) {
        const a = (j / FL_S) * Math.PI * 2, rr = root.r(a) * sh.wk + ow;
        top.array[j] = Math.min(0.1, Math.max(0, heightAt(root.ox + rr * Math.cos(a), root.oz + rr * Math.sin(a)) + 0.005));
      }
      top.needsUpdate = true; rad.needsUpdate = true; rad0.needsUpdate = true;
    });
    perf.flameFit = { full: [+full.ox.toFixed(3), +full.oz.toFixed(3), full.cells], root: [+root.ox.toFixed(3), +root.oz.toFixed(3), root.cells] };
  }
  let headMat = null;
  function buildHead(gltf) {
    gltf.scene.traverse(o => { if (o.isMesh) head = o; });
    const orig = head.material;
    const tS = performance.now(); smoothNormals(head.geometry, 30); perf.smooth = performance.now() - tS;
    headMat = new THREE.ShaderMaterial({
      uniforms: { uShadow: { value: new THREE.Color(PAL.cobalt[1]) }, uMid: { value: new THREE.Color(0xFF5A36) }, uLight: { value: new THREE.Color(0xFFC93C) },
                  uInk: { value: new THREE.Color(INK) }, map: { value: orig.map }, uL: { value: LIGHT }, uGlow: { value: 0 }, uRim: { value: new THREE.Color(0x9DB6FF) },
                  uHot: { value: new THREE.Color(FIRE.hot) }, uHotCore: { value: new THREE.Color(FIRE.hotCore) } },
      vertexShader: `attribute vec3 aN; varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec2 vYZ;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * aN); vV = -mv.xyz; vUv = uv; vYZ = position.yz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uShadow, uMid, uLight, uInk, uL, uHot, uHotCore, uRim; uniform float uGlow; uniform sampler2D map; varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec2 vYZ;
        void main(){ vec3 n = normalize(vN); float d = dot(n, uL);
          vec3 c = d > 0.45 ? uLight : (d > -0.10 ? uMid : uShadow);
          float lum = dot(texture2D(map, vUv).rgb, vec3(0.2126, 0.7152, 0.0722));
          float above = vYZ.x - max(0.0, 0.30 * (0.035 - vYZ.y));
          c = mix(c, uHot, uGlow * (1.0 - smoothstep(0.026, 0.031, above)));
          c = mix(c, uHotCore, uGlow * (1.0 - smoothstep(0.009, 0.013, above)));
          c = mix(c, uInk, 1.0 - smoothstep(0.10, 0.17, lum));
          float rim = 1.0 - max(dot(n, normalize(vV)), 0.0);              // a cool back-light, so the dark hair keeps its shape against the dark sky
          c = mix(c, uRim, step(0.80, rim) * step(d, 0.30));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`
    });
    head.material = headMat;
    head.add(new THREE.Mesh(head.geometry, new THREE.ShaderMaterial({
      uniforms: { t: { value: 0.0065 }, ink: { value: new THREE.Color(INK) } }, side: THREE.BackSide,
      vertexShader: `uniform float t; attribute vec3 aN; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position + aN * t, 1.0); }`,
      fragmentShader: `uniform vec3 ink; void main(){ gl_FragColor = vec4(ink, 1.0);
        #include <colorspace_fragment>
      }`
    })));
    yawG.add(gltf.scene); fitFlameToHead(); headReady = true;
  }
  const setMeter = p => { if (meterBar) meterBar.style.transform = `scaleX(${p})`; if (meterTxt) meterTxt.textContent = `Preparing launch ${Math.round(p * 100)}%`; };
  if (hero) {
    setMeter(0);
    let fake = 0; const fakeTimer = setInterval(() => { fake = Math.min(fake + 0.04, 0.9); if (!headReady) setMeter(Math.max(fake, 0)); }, 120);
    new GLTFLoader().load('assets/head-web.glb', g => { clearInterval(fakeTimer); setMeter(1); buildHead(g); startLaunch(); },
      x => { if (x.total) { clearInterval(fakeTimer); setMeter(Math.min(x.loaded / x.total, 0.98)); } }, () => { clearInterval(fakeTimer); fallback(); });
    // on a very slow connection the page doesn't wait for the head: everything shows, and the head pops onto its pad when it arrives
    setTimeout(() => { if (!launched && !skipIntro) { skipIntro = true; root.classList.add('skip-intro'); clearInterval(fakeTimer); if (meter) meter.classList.add('done'); reveal(); } }, 6000);
  } else { heroG.visible = false; backdrop.visible = false; root.classList.add('hero-landed'); }

  /* ---------- layout: head big on the right (desktop) / on top (phone); scroll moves the camera ---------- */
  const state = { vw: 1, vh: 1, aspect: 1, HV: 1, D: 3, PXW: 0.001, mobile: false, maxScroll: 1 }, perf = {};
  function updatePx() {
    const px = state.vh * DPR / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    sparkMat.uniforms.uPx.value = px; burstMat.uniforms.uPx.value = px;
  }
  function setDpr(v) { DPR = v; renderer.setPixelRatio(v); BGU.uDpr.value = v; updatePx(); }
  function updateStars() {
    const area = Math.min(1, Math.max(0.3, state.vw * state.vh / (1440 * 1035)));
    starGeo.setDrawRange(0, Math.round(starList.length * area * (lite ? 0.6 : 1)));
  }
  function setLite(v) {                        // a lighter look for weak machines: no atmosphere glow, no sparkles, fewer stars
    lite = v; try { sessionStorage.setItem('jw-lite', v ? '1' : '0'); } catch (e) {}
    scene.traverse(o => { if (o.userData && o.userData.isHalo) o.visible = !v; });
    updateStars(); if (state.vh > 1) placeAmbient();
  }
  const basePos = new THREE.Vector3(), baseLook = new THREE.Vector3(), rayCaster = new THREE.Raycaster();
  const planeAt = z => new THREE.Plane(new THREE.Vector3(0, 0, 1), -z);
  function poseCamera(scrollPx) {
    const dy = -scrollPx * state.PXW;
    camera.position.set(basePos.x, basePos.y + dy, basePos.z); camera.lookAt(baseLook.x, baseLook.y + dy, baseLook.z); camera.updateMatrixWorld();
  }
  function worldAtNdc(ndcX, ndcY, z) {
    rayCaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const pt = new THREE.Vector3(); rayCaster.ray.intersectPlane(planeAt(z), pt); return pt;
  }
  // right-most pixel of any headline/paragraph/button in the hero (tight to the text, not the box it sits in)
  function heroTextRight() {
    const copy = hero && hero.querySelector('.hero-copy'); if (!copy) return 0;
    let right = 0; const range = document.createRange(), walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width) right = Math.max(right, r.right);
    }
    copy.querySelectorAll('.status-pill, .btn').forEach(el => { right = Math.max(right, el.getBoundingClientRect().right); });
    return right;
  }
  let hero0 = { ndcX: 0.36, ndcY: -0.28 };
  function layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    renderer.setSize(vw, vh); state.vw = vw; state.vh = vh; state.aspect = vw / vh; state.mobile = state.aspect < 1.05 || vw < 760;
    BGU.uRes.value.set(vw, vh);
    { const want = Math.min(window.devicePixelRatio || 1, dprCap); if (Math.abs(want - DPR) > 0.01) setDpr(want); }
    state.HV = state.mobile ? Math.max(1.05, 1.28 / state.aspect) : 1.0;
    let ndcX = state.mobile ? 0 : 0.36; const ndcY = state.mobile ? 0.24 : -0.28;
    if (!state.mobile && hero) {
      // The head and the headline must never overlap. Fit the whole diorama (pad, props, floating things) into the space right of the text,
      // shrinking it a little on narrower windows rather than sliding under the words.
      const EXT_L = 0.38, EXT_R = 0.38;
      const left = heroTextRight() + 36, right = vw - 18, span = Math.max(right - left, 260);
      state.HV = Math.min(Math.max(1.0, (EXT_L + EXT_R) * vh / span), 1.9);
      const pxu = vh / state.HV, cx = Math.min(Math.max(0.68 * vw, left + EXT_L * pxu), right - EXT_R * pxu);
      ndcX = (cx / vw) * 2 - 1;
    }
    camera.aspect = state.aspect; camera.updateProjectionMatrix();
    state.D = state.HV / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    state.PXW = state.HV / vh;
    SU.uFogD.value = state.D;
    baseLook.set(0, 0, 0); basePos.set(0, state.D * 0.30, state.D * 0.954);
    poseCamera(0);
    hero0 = { ndcX, ndcY };
    const pt = worldAtNdc(ndcX, ndcY, 0); heroG.position.set(pt.x, pt.y, 0);
    const zb = -2.4, comp = (state.D - zb) / state.D, bp = worldAtNdc(ndcX + (state.mobile ? 0.22 : 0.30), ndcY + (state.mobile ? 0.52 : 0.62), zb);
    backdrop.position.copy(bp); backdrop.scale.setScalar((state.mobile ? 0.8 : 0.66) * comp);
    updatePx();
    if (meter) { meter.style.left = ((ndcX + 1) / 2 * vw) + 'px'; meter.style.top = ((1 - (ndcY + 0.42)) / 2 * vh) + 'px'; }
    placeAmbient();
  }
  function placeAmbient() {
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - state.vh); state.maxScroll = maxScroll;
    BGU.uPage.value = maxScroll > 0 ? Math.min(window.scrollY / maxScroll, 1) : 0;
    const mainEl = document.getElementById('main'), subN = hero || !mainEl ? 0 : Math.max(3, Math.min(SUB.length, Math.round(mainEl.getBoundingClientRect().height / 700)));
    ambient.forEach(o => {
      const d = o.userData, sec = document.getElementById(d.sec);
      if (!sec || (state.mobile && !d.m) || (d.sub && d.i >= subN) || (lite && d.kind === 'sparkle')) { o.visible = false; return; }
      o.visible = true;
      const f = d.sub ? (d.i + 0.5) / subN : d.f;
      const r = sec.getBoundingClientRect(), pagePx = r.top + window.scrollY + f * r.height;
      const sA = Math.min(Math.max(pagePx - state.vh * 0.5, 0), maxScroll);
      poseCamera(sA);
      const ex = state.mobile ? Math.sign(d.ex) * Math.min(Math.abs(d.ex), 1.04) : d.ex;      // peek in from the edge, partly cropped, so they never sit under text
      const pt = worldAtNdc(ex, d.ey || 0, d.z);
      o.position.copy(pt); d.base = pt.clone(); d.anchorScroll = sA;
      const comp = (state.D - d.z) / state.D, k = state.mobile ? (d.s > 0.3 ? 0.55 : 0.7) : 1.0;
      o.scale.setScalar(d.s * comp * k);
    });
    poseCamera(window.scrollY);
    bakeNebula(); updateStars();
  }
  addEventListener('resize', layout);
  addEventListener('load', layout);                                  // text widths settle once the page has loaded
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  if (window.ResizeObserver) new ResizeObserver(() => placeAmbient()).observe(document.body);
  layout();

  /* ---------- pointer (parallax + the head follows you) ---------- */
  const mouse = { x: 0, y: 0, last: -1e9 };
  addEventListener('pointermove', e => { mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = (e.clientY / window.innerHeight) * 2 - 1; mouse.last = performance.now(); });

  /* ---------- timeline ---------- */
  let launched = false, vt = 0, revealed = false, landedStored = false, headIn = -1;
  const easeOutBack = x => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
  function startLaunch() {
    launched = true; poke(); vt = (reduce || skipIntro) ? 99 : 0;
    if (meter) meter.classList.add('done');
    if (reduce || skipIntro) { reveal(); if (!reduce) headIn = performance.now(); }   // already landed: the head just pops onto its pad
  }
  function reveal() {
    if (revealed) return; revealed = true;
    root.classList.add('hero-landed'); if (hero) hero.classList.remove('hero-wait');
    window.dispatchEvent(new CustomEvent('hero:landed'));
  }
  if (hero && (reduce || skipIntro)) reveal();          // nobody waits for the model to download when there is no landing to watch
  if (replayBtn) replayBtn.addEventListener('click', () => { if (launched && !reduce) { vt = 0; headIn = -1; } });

  function apply(T, t, dt) {
    const y = rocketY(T), tl = T - T_L, h = y;
    rocket.position.y = y;
    const speed = Math.max(0, (rocketY(T - 0.03) - rocketY(T + 0.03)) / 0.06);
    const bounce = tl > 0 ? Math.exp(-tl * 7) * Math.cos(tl * 21) : 0;
    const stretch = tl > 0 ? 0 : 0.045 * sstep(0, 0.4, T);
    rocket.scale.set(1 + 0.10 * bounce - stretch * 0.4, 1 - 0.15 * bounce + stretch, 1 + 0.10 * bounce - stretch * 0.4);
    if (headIn > 0) { const k = Math.min((performance.now() - headIn) / 650, 1); rocket.scale.multiplyScalar(Math.max(easeOutBack(k), 0.0001)); if (k >= 1) headIn = -1; }
    if (!landedStored && T > T_L + 1.2) { landedStored = true; try { sessionStorage.setItem('jw-landed', '1'); } catch (e) {} }
    const fall = 1 - sstep(0, T_L, T);
    rocket.rotation.z = Math.sin(T * 7.2) * 0.11 * Math.pow(fall, 1.2) + (tl > 0 ? Math.sin(tl * 16) * 0.025 * Math.exp(-tl * 6) : 0);
    if (T < T_FOLLOW) yawG.rotation.y = (1 - easeOutCubic(Math.min(T / T_L, 1))) * 1.4;
    else {
      const idle = performance.now() - mouse.last > 2500;
      const ty = idle ? Math.sin(t * 0.6) * 0.28 : mouse.x * 0.6; yawG.rotation.y += (ty - yawG.rotation.y) * 0.07;
    }
    FU.uTime.value = T; FU.uLen.value = thrust(T) * 0.78; flameG.visible = FU.uLen.value > 0.01;
    headMat.uniforms.uGlow.value = sstep(0.15, 0.6, thrust(T));
    sparkMat.uniforms.uTime.value = T;
    // the asteroid squishes a little on touchdown
    const pb = tl > 0 ? Math.exp(-tl * 9) * Math.cos(tl * 24) : 0;
    platform.scale.set(1 + 0.02 * pb, 1 - 0.06 * pb, 1 + 0.02 * pb);
    const near = 1 - Math.min(h / 1.4, 1);
    shadowBlob.scale.setScalar(0.05 + 0.11 * near); shadowBlob.material.opacity = 0.2 * near * sstep(0, 0.5, T); shadowBlob.visible = shadowBlob.material.opacity > 0.004;
    const bl = thrust(T) * (1 - sstep(0.0, 0.8, h));
    blast.forEach((m, i) => { const r = (0.20 - i * 0.057) * bl * (0.93 + 0.07 * Math.sin(T * 41 + i * 2.3)); m.visible = bl > 0.03; m.scale.set(r, r * 0.92, 1); });
    const fallen = Y0 - y;
    speedLines.forEach(m => {
      const d = m.userData, len = Math.min(0.85, speed * 0.22 * d.k), yy = ((d.off + fallen * d.k * 0.9) % 3.0) - 0.9;
      m.visible = speed > 0.05; m.position.set(d.x, yy, d.z); m.scale.set(0.006, Math.max(len, 0.0001), 1); m.material.opacity = Math.min(speed / 1.2, 1) * 0.40;
    });
    const e = easeOutCubic(Math.min(Math.max(tl / 0.6, 0), 1)), live = tl > 0 && tl < 1.4;
    burstLines.forEach((m, i) => {
      m.visible = live; if (!live) return;
      const inner = 0.13 + 0.40 * e * m.userData.seed, len = 0.17 * (1 - e) + 0.02;
      m.position.x = inner + len / 2; m.scale.set(len, 0.011 + 0.006 * (i % 3), 1); m.material.opacity = 1 - e * e;
    });
    ring1.visible = ring2.visible = live;
    if (live) {
      ring1.scale.setScalar(0.12 + 0.62 * e); ring1.material.opacity = 1 - e;
      const e2 = easeOutCubic(Math.min(Math.max((tl - 0.08) / 0.6, 0), 1)); ring2.scale.setScalar(0.10 + 0.5 * e2); ring2.material.opacity = (1 - e2) * 0.95;
    }
    puffs.forEach(g => {
      const d = g.userData, tp = tl - d.delay, life = Math.min(Math.max(tp / 1.55, 0), 1), pe = easeOutCubic(Math.min(Math.max(tp / 1.0, 0), 1));
      g.visible = tp > 0 && life < 1; if (!g.visible) return;
      const R = (d.front ? 0.30 + 0.17 * pe : 0.09 + 0.36 * pe * d.s);
      g.position.set(Math.cos(d.a) * R, 0.03 + (d.front ? 0.04 : 0.09) * pe * d.s + 0.05 * life, Math.sin(d.a) * R * 0.9);
      g.scale.setScalar((d.front ? 0.10 : 0.12) * (0.55 + 1.15 * pe) * d.s * 1.15);
      g.quaternion.copy(camera.quaternion); g.children[0].rotation.z = d.spin * tp; g.children[0].material.uniforms.uProg.value = life;
    });
    burstMat.uniforms.uTL.value = tl;
    if (T >= T_L - 0.3) reveal();
  }

  let lastTs = performance.now(), lastRender = 0, lastActive = performance.now(), frameCount = 0, gSum = 0, gN = 0, gPrev = 0, govOn = true, settled = false, shown = false;
  let lastSy = window.scrollY, scrollVel = 0;
  function poke() { lastActive = performance.now(); }
  ['scroll', 'wheel', 'touchmove', 'pointermove', 'keydown', 'resize'].forEach(ev => addEventListener(ev, poke, { passive: true }));
  // how long a frame really takes on this GPU (forces the GPU to finish, so it is measured, not just queued)
  function gpuMs(frames, batches) {
    const gl = renderer.getContext(), px = new Uint8Array(4); let best = 1e9;
    for (let b = 0; b < batches; b++) {
      const t0 = performance.now(); for (let i = 0; i < frames; i++) renderer.render(scene, camera);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); best = Math.min(best, (performance.now() - t0) / frames);
      if (best > 40) break;
    }
    return best;
  }
  function storeQuality() { try { sessionStorage.setItem('jw-dprcap', dprCap.toFixed(2)); } catch (e) {} }
  function runProbe(final) {                    // pick the sharpest resolution this machine can hold at 60 fps (budget: 7 ms of GPU per frame)
    probed = true;
    const native = window.devicePixelRatio || 1, base = Math.min(native, 1.25);
    if (Math.abs(DPR - base) > 0.01) setDpr(base);
    gpuMs(3, 1);                                 // warm-up: compile programs, allocate buffers
    const t = Math.max(gpuMs(4, 4), 0.5), want = Math.max(0.75, Math.min(Math.min(native, 1.75), base * Math.sqrt(7 / t)));
    // the first look happens while the page is still loading and can only be pessimistic; the second one (after the landing) is the one to trust
    dprCap = final || t > 14 ? want : Math.max(want, Math.min(native, 1.5));
    setDpr(Math.min(native, dprCap));
    perf[final ? 'probe2Ms' : 'probe1Ms'] = t; perf.dprCap = dprCap;
    if (final && (want < 1.0 || t > 14)) setLite(true);
    if (final) storeQuality();
  }
  function downgrade() {                        // still slow while it matters: render fewer pixels
    dprCap = Math.max(0.75, Math.min(DPR, dprCap) * 0.82); setDpr(Math.min(window.devicePixelRatio || 1, dprCap));
    if (dprCap < 1.0) setLite(true);
    if (dprCap <= 0.76) govOn = false;
    storeQuality(); gSum = 0; gN = 0;
  }
  function loop() {
    const now = performance.now();
    // full speed while something is happening (loading, landing, scrolling, moving the pointer); about 30 fps when it's just drifting; nothing at all if motion is reduced
    const active = !launched || now - lastActive < 400 || (!reduce && vt < T_L + 3);
    if (!active && (reduce || now - lastRender < (lite ? 46 : 31))) return;
    lastRender = now;
    const dt = Math.min((now - lastTs) / 1000, 0.05), t = now / 1000; lastTs = now;
    if (!probed && ++frameCount === 20) runProbe(false);
    else if (probed && !settled && !storedQuality && launched && vt > T_L + 2.2) { settled = true; runProbe(true); }
    const sy = window.scrollY;
    if (launched) { if (!reduce) vt += dt; apply(vt, t, dt); }
    // scroll speed (smoothed) drives the warp streaks; a teleport (restored scroll position, an instant jump) is ignored
    { const d = sy - lastSy; lastSy = sy;
      const inst = Math.abs(d) > state.vh * 1.5 ? 0 : Math.max(-9000, Math.min(9000, d / Math.max(dt, 1 / 120)));
      scrollVel += (inst - scrollVel) * Math.min(1, dt * 10);
      WARP.uWarp.value = reduce ? 0 : Math.min(400, Math.max(0, Math.abs(scrollVel) - 650) * 0.075); }
    // scroll: the camera rides down the page; deeper objects move slower (parallax)
    poseCamera(sy);
    BGU.uScroll.value = sy; BGU.uPage.value = Math.min(sy / Math.max(1, state.maxScroll), 1); BGU.uTime.value = reduce ? 0 : t; sparkleTime.value = reduce ? 0 : t;
    if (hero) { heroG.visible = sy < state.vh * 1.8; backdrop.visible = sy < state.vh * 2.6; }     // not drawn once scrolled well past
    if (!reduce) {
      // the asteroid and everything around it float a little
      const bob = Math.sin(t * 1.1) * 0.006; platform.position.y = bob; rocket.position.y += bob;
      heroObjs.forEach(o => {
        const d = o.userData; if (d.spinT) { if (Array.isArray(d.spin)) o.rotation.set(t * d.spin[0], t * d.spin[1], t * d.spin[2]); else d.spinT.rotation.y = t * d.spin; }
        if (d.moonP) d.moonP.rotation.y = t * 0.5;
        o.position.y = d.base.y + Math.sin(t * 0.9 + d.i * 1.3) * 0.02;
      });
      backdrop.userData.spinT.rotation.y = t * 0.03; backdrop.rotation.z = Math.sin(t * 0.15) * 0.02;
      ambient.forEach(o => {
        if (!o.visible) return; const d = o.userData;
        if (d.spinT) { if (d.kind === 'rock' || d.kind === 'crystal') o.rotation.set(t * d.aspin[0], t * d.aspin[1], t * d.aspin[2]); else d.spinT.rotation.y = t * (0.08 + (d.i % 3) * 0.03); }
        if (d.moonP) d.moonP.rotation.y = t * 0.35;
        o.position.set(d.base.x + mouse.x * 0.03 * (1 - d.z), d.base.y + Math.sin(t * 0.8 + d.phase) * 0.03 - mouse.y * 0.02, d.base.z);
      });
    }
    // the things around the head pop in around the landing
    const pop = headIn > 0 ? sstep(0, 1, (performance.now() - headIn) / 700) : sstep(T_L - 0.2, T_L + 0.9, launched ? vt : 0);
    heroObjs.forEach(o => { o.visible = pop > 0.01 && !(lite && o.userData.kind === 'sparkle'); o.scale.setScalar(o.userData.s * (0.2 + 0.8 * pop)); });
    FU.uPadY.value = heroG.position.y + platform.position.y + 0.004;      // the flame stops at the top of the pad, wherever the pad sits on screen
    renderer.render(scene, camera);
    if (!shown) { shown = true; requestAnimationFrame(() => host.classList.add('ready')); }
    // watch the frame rate while it matters; if it really is slow (not just a throttled display), render fewer pixels
    if (govOn && active && launched && vt > T_L + 0.8 && !document.hidden) {
      if (gPrev) { const d = now - gPrev; if (d < 120 && ++gN && (gSum += d) && gN >= 60) { const avg = gSum / gN; gSum = 0; gN = 0; if (avg > 24) { if (gpuMs(4, 1) > 9) downgrade(); else govOn = false; } } }
      gPrev = now;
    } else gPrev = 0;
  }
  if (lite) setLite(true);
  renderer.setAnimationLoop(loop);
})();
