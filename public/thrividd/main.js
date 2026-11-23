// Saga Explorer: Fab Lab SAGA as an explorable model. Guided tour, machine stations, dollhouse orbit, walk mode.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// requests cut off by leaving or reloading the page are not errors
let leaving = false;
addEventListener('pagehide', () => { leaving = true; });
addEventListener('beforeunload', () => { leaving = true; });
addEventListener('unhandledrejection', (e) => { if (leaving) e.preventDefault(); });
const never = new Promise(() => {});
function loadFailed() {                               // a failed or interrupted download: say so, stop quietly
  if (!leaving) { const t = document.getElementById('ltext'); if (t) t.textContent = 'Ekki tókst að hlaða smiðjunni. Reyndu að endurhlaða síðuna.'; }
  return never;
}
const getJSON = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(u)))).catch(loadFailed);
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
const params = new URLSearchParams(location.search);
if (params.has('clean')) document.body.classList.add('clean');      // UI-free frames for comparisons

// ------------------------------------------------------------ content
const SITE = 'https://fablab-saga.github.io/website';
const [content, logoSvg] = await Promise.all([
  getJSON('data/content.json'),
  fetch('fablab-saga.svg').then((r) => r.text()).catch(loadFailed),
]);
for (const id of ['logo', 'loadLogo']) $(id).innerHTML = logoSvg;
document.querySelectorAll('.fb-logo').forEach((e) => { e.innerHTML = logoSvg; });
const cats = Object.fromEntries(content.categories.map((c) => [c.slug, c]));
const machines = Object.fromEntries(content.machines.map((m) => [m.slug, m]));
const qty = (n) => `×${n}`;

function marker(cat) {
  const c = cats[cat];
  const s = el('span', `mk ${c.shape} c-${c.colour}`);
  s.setAttribute('aria-hidden', 'true');
  return s;
}

// ------------------------------------------------------------ WebGL check / fallback
let gpuName = '';
function webglOK() {
  if (params.has('nowebgl')) return false;
  try {
    const c = document.createElement('canvas');
    const gl = window.WebGL2RenderingContext && c.getContext('webgl2');
    if (!gl) return false;
    const e = gl.getExtension('WEBGL_debug_renderer_info');
    gpuName = String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    return true;
  } catch { return false; }
}
function showFallback() {
  const wrap = el('div', 'fb-grid');
  for (const c of content.categories) {
    const list = content.machines.filter((m) => m.category === c.slug);
    if (!list.length) continue;
    const g = el('section', 'group');
    const h = el('h3'); h.append(marker(c.slug), document.createTextNode(c.title)); g.append(h);
    const ul = el('ul');
    for (const m of list) {
      const li = el('li'); const a = el('a'); a.href = m.url;
      a.append(el('span', 'n', m.title), el('span', 'q', qty(m.quantity)));
      li.append(a); ul.append(li);
    }
    g.append(ul); wrap.append(g);
  }
  $('fbGroups').append(wrap);
  $('fallback').hidden = false;
  $('loading').remove();
  for (const id of ['tools', 'c']) $(id).hidden = true;
  window.sagaReady = true;
  window.saga = { fallback: true };
}
if (!webglOK()) { showFallback(); await new Promise(() => {}); }   // the fallback page is all there is
// Quality tier. Integrated and mobile GPUs (by renderer string) or ?quality=low get a conservative tier: render
// scale capped at 1, a 2048 px shadow map and a lower start scale while moving. ?quality=high forces the full tier.
// Firefox can report a generic renderer string, so a slow first minute also drops to the low tier (see the loop).
const IGPU = /Intel|Iris|UHD Graphics|HD Graphics|Radeon(\(TM\))? Graphics|Radeon \d{3,4}M|Radeon Vega|Vega \d|Mali|Adreno|PowerVR|Apple GPU|Xclipse|llvmpipe|SwiftShader|Basic Render/i;
let LOW = params.get('quality') === 'low' || (params.get('quality') !== 'high' && IGPU.test(gpuName));
const tierWhy = params.get('quality') ? 'url' : LOW ? 'renderer' : 'default';

// the model download starts right away; everything below runs while it arrives
const progress = { glb: 0, env: 0 };
const gltfPromise = new Promise((res, rej) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load('model/saga.glb', res, (e) => {
  // compressed transfer has no length header: the decoded size comes with the content file
  const total = e.total || content.modelBytes;
  if (total) { progress.glb = Math.min(1, e.loaded / total); showProgress(); }
}, rej)).catch(loadFailed);

// ------------------------------------------------------------ renderer
const canvas = $('c');
// Blender's "AgX - Punchy" look, as the film is graded (three.js ships plain AgX). Blender does it in AgX log space
// (a shadow tone curve plus power 1.0912, config.ocio); here it is approximated on the sigmoid's output by power 1.35,
// which matches the film's frames within a few percent in mean luminance (tools/lumdiff.mjs). Saturation
// 1.2 rather than Blender's 1.0: the baked interiors come out slightly cooler than the film's. The hook below
// warns if three.js drops the line it patches; without the look, shadows lift and whites wash out.
const AGX_HOOK = 'color = agxDefaultContrastApprox( color );';
if (!THREE.ShaderChunk.tonemapping_pars_fragment.includes(AGX_HOOK)) console.warn('AgX Punchy hook not found');
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(AGX_HOOK,
  AGX_HOOK + `
   { float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
     color = pow(max(color, vec3(0.0)), vec3(1.35));
     color = luma + AGX_SAT * (color - luma); }`.replace('AGX_SAT', (+params.get('sat') || 1.2).toFixed(3)));
// Baked light (export/bake_lighting.py): every exported vertex carries the film's lighting minus the sun's direct
// light, as irradiance in Cycles units: E = E_MAX * c^2.2 (8-bit colour attribute "bake"). It replaces the sky's
// diffuse light, and scales the sky's reflections down where little sky reaches (inside, under tables). The sun is
// added live with a shadow map. Meshes without a bake (or SAGA_BAKE=0 builds) keep the sky approximation.
THREE.ShaderChunk.common += '\nuniform float uCalm;\n#define CUT_SKY ' + (+params.get('cutsky') || 1.0).toFixed(3) + '\n';
THREE.ShaderChunk.color_pars_vertex += `
#ifdef USE_BAKE
#ifdef BAKE_CONST
uniform vec3 uBakeConst;
#else
attribute vec4 bake;
#endif
varying vec3 vBakeE;
varying float vBakeSO;
#endif`;
THREE.ShaderChunk.color_vertex += `
#ifdef USE_BAKE
#ifdef BAKE_CONST
vBakeE = PI * uBakeConst;
#else
vBakeE = PI * BAKE_EMAX * pow( bake.rgb, vec3( 2.2 ) );
#endif
vBakeSO = clamp( dot( vBakeE, vec3( 0.2126, 0.7152, 0.0722 ) ) / BAKE_SOREF, 0.04, 1.0 );
#endif`;
THREE.ShaderChunk.color_pars_fragment += `
#ifdef USE_BAKE
varying vec3 vBakeE;
varying float vBakeSO;
#endif`;
THREE.ShaderChunk.lights_fragment_maps = THREE.ShaderChunk.lights_fragment_maps.replace(
  'iblIrradiance += getIBLIrradiance( geometryNormal );', `
  #ifdef USE_BAKE
    // The bake has the ceiling in place; the film's dollhouse shot removes it and lets the sky in. In the dollhouse
    // (uCalm = 1) no surface gets less than the open sky would give it: up-facing surfaces all of it, walls part.
    vec3 skyOpen = getIBLIrradiance( geometryNormal ) * smoothstep( -0.3, 0.9, inverseTransformDirection( geometryNormal, viewMatrix ).y ) * CUT_SKY;
    iblIrradiance += max( vBakeE, uCalm * skyOpen );
  #else
    iblIrradiance += getIBLIrradiance( geometryNormal ) * mix( 0.18, 1.0, smoothstep( -0.9, 0.6, inverseTransformDirection( geometryNormal, viewMatrix ).y ) );
  #endif`).replace('radiance += iblRadiance;', `
  #ifdef USE_BAKE
    radiance += iblRadiance * vBakeSO;
  #else
    radiance += iblRadiance;
  #endif`);
// Calm (uCalm: 0 inside, 1 in the dollhouse): image textures drop a mip level or so, and dense dark framing
// (glazing mullions, shelf uprights) fades towards a light grey with distance, so the overview reads as space.
THREE.ShaderChunk.map_fragment = THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'texture2D( map, vMapUv, uCalm * 1.25 )') + `
#ifdef CALM_TINT
diffuseColor.rgb = mix( diffuseColor.rgb, CALM_TINT, uCalm * CALM_AMT * smoothstep( 9.0, 32.0, length( vViewPosition ) ) );
#endif`;
const calmU = { value: 0 }, bakeConstU = { value: new THREE.Vector3() };
const calmPatch = (sh) => { sh.uniforms.uCalm = calmU; sh.uniforms.uBakeConst = bakeConstU; };
// A material serves one bake variant; a mesh needing another variant of it gets a copy. Instanced props carry
// their baked irradiance per object (node extras), set per draw.
const variants = new Map();
function bakeVariant(m, v) {
  const key = m.uuid + v;
  if (variants.has(key)) return variants.get(key);
  let c = m;
  if (m.userData.variant && m.userData.variant !== v) {
    c = m.clone();
    c.userData = { ...m.userData, prepared: false };
    c.onBeforeCompile = m.onBeforeCompile;
    c.defines = { ...(m.defines || {}) };
    delete c.defines.USE_BAKE; delete c.defines.BAKE_CONST;
  }
  c.userData.variant = v;
  if (v !== 'none') Object.assign(c.defines ||= {}, { USE_BAKE: '', BAKE_EMAX: BAKE.e_max.toFixed(5), BAKE_SOREF: (+params.get('soref') || BAKE.so_ref || 3.0).toFixed(5) });
  if (v === 'const') c.defines.BAKE_CONST = '';
  variants.set(key, c);
  return c;
}
function setBakeConst(r, s, c, g, mat) { bakeConstU.value.fromArray(this.userData.bakeE); mat.uniformsNeedUpdate = true; }
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let BASE_DPR = Math.min(window.devicePixelRatio || 1, LOW ? 1 : 1.5) * (+params.get('dpr') || 1);
let dprScale = 1;
renderer.setPixelRatio(BASE_DPR);
renderer.toneMapping = THREE.AgXToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;

const scene = new THREE.Scene();
const BG = new THREE.Color(0xedebe6);
scene.background = BG;
scene.fog = new THREE.Fog(BG, 1e4, 2e4);              // kept on always (toggling fog recompiles shaders)
const camera = new THREE.PerspectiveCamera(37, 1, 0.05, 600);
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
orbit.dampingFactor = 0.1;
orbit.screenSpacePanning = true;
orbit.maxPolarAngle = Math.PI * 0.495;
orbit.minDistance = 0.6;
orbit.maxDistance = 120;
orbit.zoomToCursor = true;
const plc = new PointerLockControls(camera, canvas);

// lens shift: the film keeps verticals vertical (level camera, shifted lens); lensShift is the NDC y offset
let lensShift = 0;
camera.updateProjectionMatrix = function () {
  THREE.PerspectiveCamera.prototype.updateProjectionMatrix.call(this);
  if (lensShift) {
    this.projectionMatrix.elements[9] += lensShift;
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
};
// Blender shift (fraction of the wider frame side, 16:9 film) -> NDC offset at the viewer's vertical fov
const shiftNdc = (shift, filmVfov, fov, aspect = 16 / 9) =>
  2 * shift * aspect * Math.tan(THREE.MathUtils.degToRad(filmVfov) / 2) / Math.tan(THREE.MathUtils.degToRad(fov) / 2);

let mode = 'orbit';
const bracketMat = new LineMaterial({ color: 0x111111, linewidth: 3, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
const cutParts = [];                                 // hidden in the dollhouse, exactly as in the film
// lab extents in web coordinates (Blender x, z, -y): the hall set reaches x 44
const LAB = { min: new THREE.Vector3(19.5, 0, -39.5), max: new THREE.Vector3(44.5, 4.2, -13.5) };
const PIVOT = new THREE.Vector3(26.9, 0, -27.2);      // the film's overview pivot (build_walkthrough.py)

let info, envTex = null, dirty = true, shadowPending = false, cutOn = false;
const solids = [], machineMeshes = [];
const bySlug = {};                                   // slug -> { meshes, box, centre, size }
const keys = {};
let bvhDone; const bvhReady = new Promise((r) => { bvhDone = r; });
const clock = new THREE.Timer();
const ray = new THREE.Raycaster();
ray.firstHitOnly = true;
const setDirty = () => { dirty = true; };
orbit.addEventListener('change', setDirty);

// with a side panel open, the scene centres in the space the panel leaves free (desktop: left of it, phone: above it)
const view = { k: 0, target: 0, size: 0 };
const phone = () => innerWidth <= 640;
function sideSize() {
  if (mode === 'walk') return 0;
  const el = !$('panel').hidden ? $('panel') : !$('list').hidden ? $('list') : null;
  if (el) return phone() ? el.offsetHeight : el.offsetWidth;
  if (phone() && !$('tour').hidden) return $('tour').offsetHeight + $('tools').querySelector('.nav').offsetHeight;   // caption + nav
  return 0;
}
function applyView() {
  const w = innerWidth, h = innerHeight, s = view.size * view.k;
  if (s < 0.5) { camera.clearViewOffset(); camera.aspect = w / h; }
  else if (w > 640) { camera.aspect = (w + s) / h; camera.setViewOffset(w + s, h, s, 0, w, h); }
  else { camera.aspect = w / (h + s); camera.setViewOffset(w, h + s, 0, s, w, h); }
  camera.updateProjectionMatrix();
  dirty = true;
}
function syncView() { const s = sideSize(); if (s) view.size = s; view.target = s ? 1 : 0; dirty = true; }
const panelObserver = new MutationObserver(syncView);
for (const id of ['panel', 'list', 'tour']) panelObserver.observe($(id), { attributes: true, attributeFilter: ['hidden'] });
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  bracketMat.resolution.set(w, h);
  syncView();
  applyView();
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------ triplanar materials (apply_pbr.py, see export_glb.py)
const texLoader = new THREE.TextureLoader();
const ANISO = Math.min(LOW ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
const texCache = {};
let texPending = 0;
function tex(name, srgb) {
  if (!texCache[name]) {
    texPending++;
    const t = texLoader.load('model/tex/' + name, () => { texPending--; dirty = true; }, undefined, () => { texPending--; });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = ANISO;
    texCache[name] = t;
  }
  return texCache[name];
}
const TP_COMMON = /* glsl */`
uniform sampler2D tpDiff, tpRough;
uniform float tpScale, tpRot, tpTintMix, tpRMul, tpHasRough;
uniform vec3 tpHsv, tpTint, tpJoints;
varying vec3 vTpPos, vTpNrm;
vec3 tpB(vec3 w) { return vec3(w.x, -w.z, w.y); }
vec4 tpSample(sampler2D t, vec3 p, vec3 w, float b) {
  return texture2D(t, p.yz, b) * w.x + texture2D(t, p.xz, b) * w.y + texture2D(t, p.xy, b) * w.z;
}
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0., -1./3., 2./3., -1.);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6. * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1., 2./3., 1./3.)) * 6. - 3.);
  return c.z * mix(vec3(1.), clamp(p - 1., 0., 1.), c.y);
}`;
function triplanar(mat, p) {
  mat.map = null; mat.roughnessMap = null; mat.normalMap = null;
  mat.color.set(1, 1, 1);
  mat.roughness = 1; mat.metalness = 0;
  const u = {
    tpDiff: { value: tex(p.diff, true) },
    tpRough: { value: p.rough ? tex(p.rough, false) : tex(p.diff, false) },
    tpHasRough: { value: p.rough ? 1 : 0 },
    tpScale: { value: p.scale }, tpRot: { value: p.rot_z },
    tpHsv: { value: new THREE.Vector3(...(p.hsv || [0.5, 1, 1])) },
    tpTint: { value: new THREE.Vector3(...(p.tint || [1, 1, 1])) }, tpTintMix: { value: p.tint ? p.tint_mix : 0 },
    tpRMul: { value: p.rough_mul },
    tpJoints: { value: new THREE.Vector3(...(p.joints || [0, 0, 0])) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    calmPatch(sh);
    sh.vertexShader = 'varying vec3 vTpPos, vTpNrm;\n' + sh.vertexShader.replace('#include <fog_vertex>', `#include <fog_vertex>
      vec4 tpW = modelMatrix * vec4(transformed, 1.0);
      vTpPos = tpW.xyz;
      vTpNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + TP_COMMON)
      .replace('#include <map_fragment>', `
        vec3 tpP = tpB(vTpPos) * tpScale;
        float tc = cos(tpRot), ts = sin(tpRot);
        tpP.xy = mat2(tc, ts, -ts, tc) * tpP.xy;
        vec3 tpW8 = pow(abs(tpB(normalize(vTpNrm))), vec3(6.));
        tpW8 /= (tpW8.x + tpW8.y + tpW8.z + 1e-6);
        // in the dollhouse, distant scans (paving, floors) settle towards their mean colour: no moire, no busy pattern
        float tpFar = uCalm * smoothstep(10., 38., length(vViewPosition));
        vec3 tpCol = mix(tpSample(tpDiff, tpP, tpW8, uCalm * 1.25).rgb, textureLod(tpDiff, vec2(0.5), 12.).rgb, 0.85 * tpFar);
        vec3 hsv = rgb2hsv(tpCol);
        hsv.x = fract(hsv.x + tpHsv.x - 0.5); hsv.y = clamp(hsv.y * tpHsv.y, 0., 1.); hsv.z *= tpHsv.z;
        tpCol = hsv2rgb(hsv);
        if (tpJoints.x > 0.) {
          vec2 g = tpJoints.xy, f = mod(tpB(vTpPos).xy, g), d = min(f, g - f);
          float m = (1. - smoothstep(tpJoints.z * 0.5, tpJoints.z, min(d.x, d.y))) * (1. - tpFar);
          tpCol *= mix(1., 0.72, m);
        }
        tpCol = mix(tpCol, tpTint, tpTintMix);
        diffuseColor.rgb *= tpCol;`)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = tpHasRough > 0.5 ? clamp(tpSample(tpRough, tpP, tpW8, uCalm * 1.25).r * tpRMul, 0.05, 1.) : 0.6;`);
  };
  mat.customProgramCacheKey = () => 'tp';
  mat.needsUpdate = true;
}

// ------------------------------------------------------------ lighting
let sun, hemi, envPM = null;
const reflective = new Set();                        // glass and acrylic: env reflections independent of the room fill
const useEnvReflections = () => { for (const m of reflective) { m.envMap = envPM; m.envMapIntensity = 1.6; m.needsUpdate = true; } dirty = true; };
let LIGHT, BAKE = null;
function setupLights() {
  BAKE = params.has('nobake') ? null : info.bake;
  LIGHT = BAKE
    ? { hemi: 0, env: 1, envCut: 1, exposure: +(params.get('exp') ?? 1), expCut: +(params.get('expc') ?? 1.12), sun: +(params.get('sun') ?? 1) }
    : { hemi: 0.72, env: 0.32, envCut: 0.9, exposure: +(params.get('exp') ?? 0.66), expCut: 1, sun: 1 };
  const c = LAB.min.clone().add(LAB.max).multiplyScalar(0.5);
  const size = LAB.max.clone().sub(LAB.min).length();
  // three's Lambert divides by pi, Cycles' bake units don't: sun = pi * k * strength (k measured in the bake)
  const S = info.sun_strength || 4;
  sun = new THREE.DirectionalLight(BAKE ? 0xffffff : 0xfff0dc, (BAKE ? Math.PI * BAKE.sun_k * S : S) * LIGHT.sun);
  const d = new THREE.Vector3().fromArray(info.sun_dir).normalize();
  sun.position.copy(c).addScaledVector(d, size);
  sun.target.position.copy(c);
  sun.castShadow = true;
  sun.shadow.mapSize.set(LOW ? 2048 : 4096, LOW ? 2048 : 4096);
  const s = sun.shadow.camera;
  s.left = s.bottom = -size * 0.55; s.right = s.top = size * 0.55; s.near = 0.5; s.far = size * 2.2;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  // the LED arrays light the room from above: bright on floors and benches, dark under the ceiling
  hemi = new THREE.HemisphereLight(0xffe9d2, 0x2a241e, LIGHT.hemi);
  scene.add(hemi);
  setExposure();
  new HDRLoader().load('model/env.hdr', (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    envTex = hdr;
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromEquirectangular(hdr).texture;
    pm.dispose();
    scene.environmentIntensity = cutOn ? LIGHT.envCut : LIGHT.env;
    envPM = scene.environment;
    useEnvReflections();
    scene.backgroundRotation.y = scene.environmentRotation.y = -(info.hdri_rot_z || 0) - Math.PI / 2;
    applyBackdrop();
    progress.env = 1; showProgress();
  });
}

// interior views see the sky through the glass; the dollhouse sits on the site's off-white with distant fog
function setExposure() { renderer.toneMappingExposure = Math.pow(2, info.exposure || 0) * LIGHT.exposure * (cutOn ? LIGHT.expCut : 1); }
function applyBackdrop() {
  if (cutOn) { scene.background = BG; scene.fog.near = 55; scene.fog.far = 170; }
  else { scene.background = envTex || BG; scene.fog.near = 1e4; scene.fog.far = 2e4; }
  scene.environmentIntensity = cutOn ? LIGHT.envCut : LIGHT.env;
  calmU.value = cutOn ? 1 : 0;
  setExposure();
  dirty = true;
}
function setCut(on) {
  if (on === cutOn) return;
  cutOn = on;
  for (const o of cutParts) o.visible = !on;
  caps.visible = on;
  shadowPending = true;                              // shadows follow the cut: no ceiling shadow in the dollhouse
  applyBackdrop();
}

// ------------------------------------------------------------ loading
function showProgress() {
  const p = Math.min(1, progress.glb * 0.88 + progress.env * 0.07 + (texPending === 0 && progress.glb === 1 ? 0.05 : 0));
  $('prog').style.width = (p * 100).toFixed(1) + '%';
  $('ltext').textContent = `Smiðjan hleðst inn · ${Math.round(p * 100)}%`;
}
const T0 = performance.now();
info = await getJSON('model/scene.json');
setupLights();

const gltf = await gltfPromise;
progress.glb = 1;

const doorParts = [];
// dense dark framing that turns to noise from the dollhouse: glazing mullions and the shelving uprights
const CALM_TINTS = { Alu_Frame_Dark: 0.75, Material_0: 0.75, Alu_Black_Anodized: 0.45 };
gltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  for (const m of mats) {
    const name = m.name.replace(/\.\d+$/, '');
    if (info.triplanar[name] && !m.userData.tp) { m.userData.tp = 1; triplanar(m, info.triplanar[name]); }
    const base = name.split('~')[0];
    if (m.transmission > 0) {                         // screen-space transmission costs a full extra pass: fake it
      if (!(base in info.glass)) Object.assign(m, { transparent: true, opacity: Math.max(0.18, 1 - m.transmission * 0.9), depthWrite: false });
      m.transmission = 0;
    }
    if (base in info.glass) {
      const isGlass = /glass/i.test(base);
      Object.assign(m, { transparent: true, opacity: isGlass ? 0.16 : info.glass[base], roughness: isGlass ? 0.03 : 0.18, metalness: 0,
        depthWrite: false, side: THREE.DoubleSide });
      if (isGlass) { m.color.set(0xd4dfe0); o.castShadow = false; o.receiveShadow = false; o.userData.glass = true; }
      reflective.add(m);
    }
    if (base === 'Acrylic_Door') {                    // the print farm's smoked acrylic doors read as grey, glossy panels
      Object.assign(m, { opacity: 0.24, roughness: 0.08, depthWrite: false });
      m.color.set(0xb9bec0);
      reflective.add(m);
    }
  }
  if (!o.userData.glass) { o.castShadow = true; o.receiveShadow = true; }
  const g = o.geometry, m0 = mats[0];
  if (g.attributes.color) {                         // the bake rides in COLOR_0; three must not treat it as albedo
    if (BAKE && !m0.transparent && !o.userData.glass) g.setAttribute('bake', g.attributes.color);
    g.deleteAttribute('color');
  }
  // bake variant per mesh: per-corner attribute, one value per object (instanced props), or none (glass, no bake)
  const variant = g.attributes.bake ? 'attr' : BAKE && o.userData.bakeE && !m0.transparent && !o.userData.glass ? 'const' : 'none';
  if (variant === 'const') o.onBeforeRender = setBakeConst;
  const own = mats.map((m) => bakeVariant(m, variant));
  o.material = Array.isArray(o.material) ? own : own[0];
  for (const m of own) {
    if (m.userData.prepared) continue;
    m.userData.prepared = true;
    m.vertexColors = false;                         // COLOR_0 is the light bake, not a base-colour multiplier
    const tint = CALM_TINTS[m.name.replace(/\.\d+$/, '').split('~')[0]];
    if (tint) Object.assign(m.defines ||= {}, { CALM_TINT: 'vec3(0.40, 0.39, 0.37)', CALM_AMT: tint.toFixed(2) });
    if (!m.userData.tp) m.onBeforeCompile = calmPatch;
    if (m.userData.tp && variant !== 'none') m.customProgramCacheKey = () => 'tp-' + variant;
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) if (m[k]) m[k].anisotropy = ANISO;
    m.needsUpdate = true;
  }
  const tag = o.material.userData || {};             // role tags from tools/strip_names.mjs (glTF extras)
  if (tag.slug) {
    const slug = tag.slug;
    o.userData.slug = slug;
    o.userData.emissive0 = o.material.emissive.clone();
    o.userData.emissiveI0 = o.material.emissiveIntensity;
    (bySlug[slug] ||= { meshes: [] }).meshes.push(o);
    machineMeshes.push(o);
  } else if (tag.door) doorParts.push(o);
  else if (tag.cut) cutParts.push(o);
  solids.push(o);
});
scene.add(gltf.scene);
if (envPM) useEnvReflections();

// Staff-only rooms keep their ceiling in the dollhouse: the staff room with its entry bay and the store behind it,
// and the WC (Blender extents from build_staff_area.py). In walk mode the staff room door is closed to visitors.
const capMat = new THREE.MeshStandardMaterial({ color: 0xcfcbc3, roughness: 0.95 });
const caps = new THREE.Group(); caps.visible = false; scene.add(caps);
const bRect = (x0, x1, y0, y1, h0, h1) => {           // Blender x/y/z box -> web mesh
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h1 - h0, y1 - y0), capMat);
  m.position.set((x0 + x1) / 2, (h0 + h1) / 2, -(y0 + y1) / 2);
  m.castShadow = m.receiveShadow = true;
  m.updateMatrixWorld();
  return m;
};
for (const r of [[27.68, 32.56, 15.05, 20.03], [27.68, 29.57, 20.03, 21.68], [24.21, 25.79, 19.37, 21.71]]) caps.add(bRect(...r, 3.9, 4.02));
const walkBlockers = [bRect(27.6, 27.86, 20.25, 21.41, 0, 2.4)];   // the staff room door from the back hallway
for (const [slug, inst] of Object.entries(info.machines)) {
  const box = new THREE.Box3();
  for (const [lo, hi] of Object.values(inst)) box.union(new THREE.Box3(new THREE.Vector3(...lo), new THREE.Vector3(...hi)));
  Object.assign(bySlug[slug] ||= { meshes: [] }, { box, centre: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()) });
}

// the bank's bookcase door: re-hang its parts on a pivot at the hinge
const door = { pivot: null, angle: 0, target: 0 };
if (info.door && doorParts.length) {
  door.pivot = new THREE.Group();
  door.pivot.position.fromArray(info.door.hinge);
  scene.add(door.pivot);
  door.pivot.updateMatrixWorld();
  for (const o of doorParts) door.pivot.attach(o);
}
function setDoor(a) {
  if (!door.pivot || Math.abs(a - door.angle) < 1e-4) return;
  door.angle = a;
  door.pivot.rotation.y = THREE.MathUtils.degToRad(info.door.open_deg) * a;
  door.pivot.updateMatrixWorld(true);
  dirty = true; doorShadowTick++;
}
let doorShadowTick = 0;

// ------------------------------------------------------------ camera moves
const V = (a) => new THREE.Vector3(...a);
let move = null;           // { p0,t0,f0, p1,t1,f1, dur, t, ease, done }
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function pose() { return { pos: camera.position.clone(), target: orbit.target.clone(), fov: camera.fov, shift: lensShift }; }
function flyTo(p, { dur = 1.6, ease = easeIO, done = null } = {}) {
  userTook = false;
  const from = pose();
  if (reduceMotion.matches) dur = 0;
  if (dur <= 0) { applyPose(p); move = null; done && done(); return; }
  move = { a: from, b: p, dur, t: 0, ease, done };
}
function applyPose(p) {
  camera.position.copy(p.pos);
  orbit.target.copy(p.target);
  lensShift = p.shift || 0;
  if (p.fov) camera.fov = p.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(orbit.target);
  dirty = true;
}
function stepMove(dt) {
  if (!move) return;
  move.t = Math.min(1, move.t + dt / move.dur);
  const k = move.ease(move.t);
  camera.position.lerpVectors(move.a.pos, move.b.pos, k);
  orbit.target.lerpVectors(move.a.target, move.b.target, k);
  camera.fov = move.a.fov + (move.b.fov - move.a.fov) * k;
  lensShift = (move.a.shift || 0) + ((move.b.shift || 0) - (move.a.shift || 0)) * k;
  camera.updateProjectionMatrix();
  camera.lookAt(orbit.target);
  dirty = true;
  if (move.t >= 1) { const d = move.done; move = null; d && d(); }
}
function fovFor(baseFov) {
  // portrait screens: keep the film's horizontal framing
  const a = innerWidth / innerHeight, ref = 16 / 9;
  if (a >= ref * 0.85) return baseFov;
  const h = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) * ref / a);
  return Math.min(100, THREE.MathUtils.radToDeg(h) * 0.82);
}
// The dollhouse overview: the film's orbit direction (radius 24 m, height 21 m around its pivot), at a distance
// fitted so the whole lab shell, entrance bay included, sits inside the free part of the screen with a margin:
// below the header, above the tour caption or help line, left of an open panel. On tall screens the lab's long
// side runs up the screen instead.
const fitCam = new THREE.PerspectiveCamera();
// the lab's extent from the model itself: every mesh except the site (ground planes are tens of metres across)
const LAB_CORNERS = [];
{
  const lab = new THREE.Box3(), b = new THREE.Box3(), sz = new THREE.Vector3();
  for (const o of solids) { b.setFromObject(o); if (b.getSize(sz).x < 40 && sz.z < 40) lab.union(b); }
  lab.max.y = Math.min(lab.max.y, 3.9); lab.min.y = 0;
  for (const x of [lab.min.x, lab.max.x]) for (const y of [lab.min.y, lab.max.y]) for (const z of [lab.min.z, lab.max.z]) LAB_CORNERS.push(new THREE.Vector3(x, y, z));
  window.__labBox = lab;
}
function freeRect() {                               // the screen area the lab should fill, in NDC
  const w = innerWidth, h = innerHeight;
  const head = phone() ? 0 : $('tools').querySelector('.mark').getBoundingClientRect().bottom;
  let top = head + 12, bottom = h - 14, left = 14, right = w - 14;
  if (phone()) {
    top = $('tools').querySelector('.mark').getBoundingClientRect().bottom + 8;
    bottom = h - $('tools').querySelector('.nav').offsetHeight - (!$('tour').hidden ? $('tour').offsetHeight : 0) - 8;
  } else if (!$('tour').hidden) {
    // the tour caption sits bottom-left: keep the lab beside it or above it, whichever leaves more room
    const t = $('tour').getBoundingClientRect();
    const besideArea = (right - (t.right + 16)) * (bottom - top), aboveArea = (right - left) * (t.top - 16 - top);
    if (besideArea > aboveArea) left = t.right + 16; else bottom = t.top - 16;
  }
  const mx = (right - left) * 0.03, my = (bottom - top) * 0.03;
  return { x0: ((left + mx) / w) * 2 - 1, x1: ((right - mx) / w) * 2 - 1, y0: 1 - ((bottom - my) / h) * 2, y1: 1 - ((top + my) / h) * 2 };
}
function overviewPose(az = 0) {
  const tall = innerWidth / innerHeight < 1.1;
  const r = THREE.MathUtils.degToRad(tall ? az - 90 : az);
  const el = tall ? THREE.MathUtils.degToRad(60) : Math.atan2(21, 24);   // portrait: look down more, use the height
  const dir = new THREE.Vector3(Math.cos(r) * Math.cos(el), Math.sin(el), -Math.sin(r) * Math.cos(el));
  const fov = tall ? 50 : 37;
  const R = freeRect();
  fitCam.fov = fov; fitCam.aspect = innerWidth / innerHeight; fitCam.near = 0.1; fitCam.far = 800; fitCam.updateProjectionMatrix();
  const centre = new THREE.Vector3(27.0, 1.2, -27.8);
  const bounds = (d, c) => {
    fitCam.position.copy(c).addScaledVector(dir, d); fitCam.lookAt(c); fitCam.updateMatrixWorld();
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (const p of LAB_CORNERS) { const v = p.clone().project(fitCam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    return { x0, x1, y0, y1 };
  };
  let d = 40;
  for (let it = 0; it < 4; it++) {
    // fit: the projected size scales ~1/d; then re-centre the target so the box sits in the middle of the free rect
    for (let k = 0; k < 3; k++) {
      const b = bounds(d, centre);
      const s = Math.max((b.x1 - b.x0) / (R.x1 - R.x0), (b.y1 - b.y0) / (R.y1 - R.y0));
      d *= s;
    }
    const b = bounds(d, centre);
    const ex = ((b.x0 + b.x1) - (R.x0 + R.x1)) / 2, ey = ((b.y0 + b.y1) - (R.y0 + R.y1)) / 2;
    const tH = Math.tan(THREE.MathUtils.degToRad(fov) / 2) * d;
    const right = new THREE.Vector3().setFromMatrixColumn(fitCam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(fitCam.matrixWorld, 1);
    centre.addScaledVector(right, ex * tH * fitCam.aspect).addScaledVector(up, ey * tH);
  }
  return { pos: centre.clone().addScaledVector(dir, d * 1.0), target: centre, fov };
}
function overview(instant = false) {
  stopTour();
  setMode('orbit');
  setCut(true);
  flyTo(overviewPose(0), { dur: instant ? 0 : 1.8 });
}
// A view of a machine that actually sees it: try directions around it (dollhouse on, ceiling gone) and keep the one
// whose sight lines reach the machine past walls, shelves and people, from a point that is not inside anything.
function sight(from, to, slug) {
  const d = to.clone().sub(from); const dist = d.length(); d.divideScalar(dist);
  ray.set(from, d); ray.far = dist; ray.firstHitOnly = false;
  const hits = ray.intersectObjects(solids, false);
  ray.firstHitOnly = true;
  let v = 1;
  for (const h of hits) {
    const o = h.object;
    if (!o.visible || o.userData.slug === slug) { if (o.userData.slug === slug) return v; continue; }
    if (o.userData.glass) { v *= 0.6; continue; }
    if (o.material.transparent && o.material.opacity < 0.5) continue;
    return 0;
  }
  return v;
}
const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((a) => new THREE.Vector3(...a));
function roomy(p) {
  for (const a of AXES) { ray.set(p, a); ray.far = 0.35; if (ray.intersectObjects(solids, false).some((h) => h.object.visible)) return false; }
  return true;
}
const poseCache = {};
function machinePose(slug) {
  const key = `${slug}@${innerWidth}x${innerHeight}`;
  if (poseCache[key]) return poseCache[key];
  const m = bySlug[slug];
  const c = m.centre.clone(), sz = m.size;
  // the panel covers part of the frame: fit the machine into the part it leaves free (see applyView)
  const w = innerWidth, h = innerHeight, side = phone() ? Math.min(0.58 * h, 520) : Math.min(440, w);
  const fov = phone() ? 62 : 42;
  const t = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const tvFree = phone() ? t * (h - side) / (h + side) : t, thFree = phone() ? t * w / (h + side) : t * (w - side) / h;
  const r = Math.max(0.35, 0.5 * Math.hypot(sz.x, sz.y, sz.z));
  const dist = THREE.MathUtils.clamp(1.1 * r / Math.max(0.05, Math.min(tvFree, thFree)), 1.7, 12);
  const pts = [c, c.clone().setY(m.box.max.y - 0.02),
    new THREE.Vector3(m.box.min.x * 0.75 + m.box.max.x * 0.25, c.y, m.box.min.z * 0.75 + m.box.max.z * 0.25),
    new THREE.Vector3(m.box.min.x * 0.25 + m.box.max.x * 0.75, c.y, m.box.min.z * 0.25 + m.box.max.z * 0.75),
    new THREE.Vector3(m.box.min.x * 0.25 + m.box.max.x * 0.75, c.y, m.box.min.z * 0.75 + m.box.max.z * 0.25),
    new THREE.Vector3(m.box.min.x * 0.75 + m.box.max.x * 0.25, c.y, m.box.min.z * 0.25 + m.box.max.z * 0.75)];
  const yl = m.box.min.y + Math.min(0.25, sz.y * 0.3);   // lower corners: a wall top in front must count against a view
  for (const x of [0.15, 0.85]) for (const z of [0.15, 0.85])
    pts.push(new THREE.Vector3(m.box.min.x + sz.x * x, yl, m.box.min.z + sz.z * z));
  const toLab = new THREE.Vector3(PIVOT.x - c.x, 0, PIVOT.z - c.z).normalize();
  let best = null;
  for (const el of [30, 42, 56, 70]) {
    for (let k = 0; k < 16; k++) {
      const az = (k / 16) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(az) * Math.cos(THREE.MathUtils.degToRad(el)), Math.sin(THREE.MathUtils.degToRad(el)),
        Math.sin(az) * Math.cos(THREE.MathUtils.degToRad(el)));
      const pos = c.clone().addScaledVector(dir, dist);
      if (pos.y < 1.2) continue;
      if (!roomy(pos)) continue;
      let vis = 0;
      for (const p of pts) vis += sight(pos, p, slug);
      vis /= pts.length;
      const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
      const score = vis + 0.12 * flat.dot(toLab) - 0.004 * Math.abs(el - 40) + (pos.y < 3.3 ? 0.04 : 0);
      if (!best || score > best.score) best = { score, vis, pos };
    }
  }
  if (!best || best.vis < 0.34) {                    // nothing clear: look straight down into the room
    best = { pos: c.clone().add(new THREE.Vector3(toLab.x * 1.2, Math.max(dist, 4) + 1.5, toLab.z * 1.2)), vis: 0 };
  }
  return (poseCache[key] = { pos: best.pos, target: c, fov });
}

// ------------------------------------------------------------ guided tour
const W = Object.fromEntries((info.walk || []).map((w) => [w.name.replace(/^Walk_\d+_/, ''), w]));
const shot = (name, from = 'start', to = 'end') => ({ a: W[name][from], b: W[name][to] });
const STOPS = [
  { title: 'Inngangur', text: 'Fab Lab SAGA er í Sögu við Hagatorg. Gengið er inn úr anddyri hússins og vaktin situr beint á móti dyrunum.', ...shot('Hall') },
  { title: 'Vinnurými', text: 'Fjögur vinnuborð standa í miðri smiðjunni. Þar er teiknað, sett saman og prófað, og öll tækjasvæðin eru í nokkurra skrefa fjarlægð.', ...shot('Closing') },
  { title: 'Geislaskeri', text: 'Tveir Glowforge Pro HD, Glowforge Aura og xTool F1 Ultra standa á bekk við gluggann. Epilog Fusion Edge 24 tekur stærri plötur.', ...shot('Laser') },
  { title: 'Þrívíddarprentari', text: 'Prentstöðin er ein hilla með fimmtán hólfum. Sjö Prusa-prentarar eru hver í sínu hólfi, og þar eru líka prentarar frá Creality, Bambu Lab og Flashforge.', ...shot('PrintFarm') },
  { title: 'Fræsivél', text: 'ShopBot PRSalpha fræsir heilar plötur í fræsirýminu bak við glervegginn. Efnið kemur inn um hleðsludyr beint að fræsiborðinu.', ...shot('CNCGlass') },
  { title: 'Rafeindaverkstæði', text: 'Á rafeindabekknum eru tvær Roland SRM-20 fyrir rásaplötur, lóðstöðvar og mælitæki. Íhlutirnir eru í skúffum við gluggann.', ...shot('Electronics') },
  { title: 'Textílsvæði', text: 'Saumavél, útsaumsvél og overlock-vél eru á borðinu, ásamt hitapressum fyrir boli, töskur og bolla.', ...shot('Craft') },
  { title: 'Verkfæri', text: 'Handverkfærin hanga á glerveggnum ofan við borð og verkfærasafnið er í hillunum. Vínylskerar, Cricut-vélar og Mayku FormBox eru í horninu.', ...shot('ToolWide') },
  { title: 'Búnaðarbanki SFS', text: 'Búnaðarbanki SFS lánar skólum og frístundastarfi borgarinnar tæki og búnað. Hann er aðeins fyrir starfsfólk og inn í hann er gengið um bókaskáp.', ...shot('Bank'), door: true },
  { title: 'Yfirsýn', text: 'Smiðjan í heild. Veldu tæki til að lesa um það, eða opnaðu Tækjakost.', overview: true },
];
const camPose = (c) => { const fov = fovFor(c.vfov); return { pos: V(c.pos), target: V(c.level), fov, shift: shiftNdc(c.shift_y, c.vfov, fov, c.aspect) }; };
const lerpPose = (a, b, t) => ({ pos: a.pos.clone().lerp(b.pos, t), target: a.target.clone().lerp(b.target, t),
  fov: a.fov + (b.fov - a.fov) * t, shift: (a.shift || 0) + ((b.shift || 0) - (a.shift || 0)) * t });
const DRIFT = 9.0;                                   // s per stop (the film's moves, slowed down)
const tour = { active: false, playing: false, i: 0, phase: 'idle', t: 0 };

function showStop(i) {
  const s = STOPS[i];
  $('tCount').textContent = `${i + 1} / ${STOPS.length}`;
  $('tTitle').textContent = s.title;
  $('tText').textContent = s.text;
  $('tPrev').disabled = i === 0;
  $('tNext').textContent = i === STOPS.length - 1 ? 'Byrja aftur' : 'Næsta';
  $('tBar').style.width = '0%';
}
function stopPoses(s) {
  if (s.overview) {
    const a = overviewPose(-14), b = overviewPose(14);
    return { a, b };
  }
  return { a: camPose(s.a), b: camPose(s.b) };
}
function goStop(i, { play = tour.playing, instant = false, at = 0 } = {}) {
  closePanels();
  tour.active = true; tour.i = (i + STOPS.length) % STOPS.length; tour.playing = play;
  const s = STOPS[tour.i];
  setMode('orbit');
  $('tour').hidden = false;
  $('bTour').setAttribute('aria-pressed', 'true');
  showStop(tour.i);
  syncPlay();
  history.replaceState(null, '', '#stop=' + (tour.i + 1));
  const { a, b } = stopPoses(s);
  const start = lerpPose(a, b, at);
  tour.phase = 'move'; tour.t = at;
  door.target = 0;
  const arrive = () => {
    setCut(!!s.overview);
    tour.phase = 'drift';
  };
  // interior stops switch the cut off before the move lands, the overview switches it on at the start
  if (s.overview) setCut(true);
  const far = camera.position.distanceTo(start.pos) > 12 || instant || reduceMotion.matches;
  if (far && !s.overview) { setCut(false); }
  flyTo(start, { dur: instant ? 0 : (far ? 2.2 : 1.8), done: arrive });
  if (!s.overview && !instant && !far) setTimeout(() => { if (tour.active && STOPS[tour.i] === s) setCut(false); }, 900);
}
function stepTour(dt) {
  if (!tour.active || tour.phase !== 'drift') return;
  const s = STOPS[tour.i];
  if (tour.playing && !reduceMotion.matches) {
    tour.t = Math.min(1, tour.t + dt / DRIFT);
    const { a, b } = stopPoses(s);
    applyPose(lerpPose(a, b, tour.t));
  } else if (tour.playing) {
    tour.t = Math.min(1, tour.t + dt / DRIFT);       // reduced motion: hold the frame, advance by time
  }
  if (s.door) setDoor(THREE.MathUtils.smoothstep(tour.t, 0.12, 0.8));
  $('tBar').style.width = (tour.t * 100).toFixed(1) + '%';
  if (tour.playing && tour.t >= 1) {
    if (tour.i < STOPS.length - 1) goStop(tour.i + 1);
    else { tour.playing = false; syncPlay(); }
  }
}
function syncPlay() {
  $('tPlay').textContent = tour.playing ? 'Hlé' : 'Spila';
  $('tPlay').setAttribute('aria-pressed', String(tour.playing));
}
function pauseTour() {
  if (!tour.active || !tour.playing) return;
  tour.playing = false;
  if (tour.phase === 'move') move = null;            // input wins over the camera move
  syncPlay();
}
function playTour() {
  if (!tour.active) return startTour();
  tour.playing = true; syncPlay();
  if (tour.t >= 1 && tour.i === STOPS.length - 1) return goStop(0, { play: true });
  goStop(tour.i, { play: true, at: tour.t >= 1 ? 0 : tour.t });
}
function startTour(i = 0) { goStop(i, { play: true }); }
function stopTour() {
  if (!tour.active) return;
  tour.active = false; tour.playing = false; tour.phase = 'idle';
  if (move) move = null;
  door.target = 0;
  $('tour').hidden = true;
  $('bTour').setAttribute('aria-pressed', 'false');
  if (/^#stop=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
}
$('bTour').onclick = () => (tour.active ? stopTour() : startTour());
$('tPlay').onclick = () => (tour.playing ? pauseTour() : playTour());
$('tNext').onclick = () => goStop(tour.i === STOPS.length - 1 ? 0 : tour.i + 1);
$('tPrev').onclick = () => goStop(tour.i - 1);
$('tClose').onclick = () => { stopTour(); overview(); };

// ------------------------------------------------------------ machine stations: highlight, panel, list
let selected = null, hovered = null;
const tmpC = new THREE.Color();
const CAT_HEX = { red: 0xe03a3f, green: 0x009967, blue: 0x1245de, orange: 0xffa13d, yellow: 0xf2c200, pink: 0xe099ab };
function paint(slug) {
  const m = bySlug[slug]; if (!m) return;
  const sel = slug === selected, hov = slug === hovered;
  for (const o of m.meshes) {
    const mat = o.material;
    if (sel) { mat.emissive.set(CAT_HEX[cats[machines[slug].category].colour]); mat.emissiveIntensity = 0.32; }
    else if (hov) { mat.emissive.set(0xffffff); mat.emissiveIntensity = 0.16; }
    else { mat.emissive.copy(o.userData.emissive0); mat.emissiveIntensity = o.userData.emissiveI0; }
  }
  dirty = true;
}
// selection: ink corner marks on the surface each unit stands on, like marking tape (seven Prusas get seven)
const brackets = new THREE.Group(); brackets.renderOrder = 10;
scene.add(brackets);
function bracketGeometry(lo, hi) {
  const p = [], L = (a, b) => p.push(...a, ...b);
  const y = lo[1] + 0.035;                              // clears parquet, mats and bench tops
  const ex = Math.min(0.3, 0.3 * Math.min(hi[0] - lo[0], hi[2] - lo[2]) + 0.05);
  for (const x of [0, 1]) for (const z of [0, 1]) {
    const c = [x ? hi[0] : lo[0], y, z ? hi[2] : lo[2]];
    L(c, [c[0] + (x ? -ex : ex), y, c[2]]); L(c, [c[0], y, c[2] + (z ? -ex : ex)]);
  }
  const g = new LineSegmentsGeometry(); g.setPositions(p); return g;
}
function showBrackets(slug) {
  for (const c of brackets.children) c.geometry.dispose();
  brackets.clear();
  if (slug && info.machines[slug]) {
    for (const [lo, hi] of Object.values(info.machines[slug])) {
      const pad = 0.06;
      const l = new LineSegments2(bracketGeometry(lo.map((v, k) => (k === 1 ? v : v - pad)), hi.map((v, k) => (k === 1 ? v : v + pad))), bracketMat);
      l.renderOrder = 10; l.raycast = () => {};
      brackets.add(l);
    }
  }
  dirty = true;
}
function setHover(slug) {
  if (slug === hovered) return;
  const prev = hovered; hovered = slug;
  if (prev) paint(prev);
  if (slug) paint(slug);
  canvas.style.cursor = slug ? 'pointer' : '';
}
function fillPanel(m) {
  const cat = cats[m.category];
  const pc = $('pCat'); pc.replaceChildren(marker(m.category), document.createTextNode(cat.title));
  $('pTitle').replaceChildren(...m.title.split(/(\S*-\S*)/).filter(Boolean).map((t) => (t.includes('-') ? el('span', 'nw', t) : document.createTextNode(t))));
  if (m.image) { $('pImg').src = m.image.src; $('pImg').alt = m.image.alt; $('pFig').hidden = false; }
  else $('pFig').hidden = true;
  $('pDesc').textContent = m.description || cat.description || '';
  const dl = $('pSpecs'); dl.replaceChildren();
  const row = (k, v) => { const d = el('div'); d.append(el('dt', null, k), el('dd', null, v)); dl.append(d); };
  row('Fjöldi', String(m.quantity));
  if (m.location) row('Rými', m.location);
  for (const s of m.specs) row(s.label, s.value);
  const uses = $('pUses'); uses.replaceChildren();
  if (m.uses.length) {
    uses.append(el('p', 'sub', 'Hentar fyrir'));
    const ul = el('ul', 'plain'); for (const u of m.uses) ul.append(el('li', null, u)); uses.append(ul);
  }
  const cs = $('pCourses'); cs.replaceChildren();
  if (m.courses.length) {
    cs.append(el('p', 'sub', 'Námskeið'));
    const ul = el('ul', 'plain');
    for (const c of m.courses) { const li = el('li'); const a = el('a', null, c.title); a.href = c.url; a.target = '_blank'; a.rel = 'noopener'; li.append(a); ul.append(li); }
    cs.append(ul);
  }
  $('pLink').href = m.url;
}
function select(slug, { fly = true, focusPanel = false } = {}) {
  if (!machines[slug] || !bySlug[slug]?.box) return;
  stopTour();
  if (mode === 'walk') setMode('orbit');
  const prev = selected; selected = slug;
  if (prev && prev !== slug) paint(prev);
  paint(slug);
  fillPanel(machines[slug]);
  $('list').hidden = true; $('bList').setAttribute('aria-expanded', 'false');
  $('panel').hidden = false; $('panel').scrollTop = 0;
  document.body.classList.add('panel-open');
  markCurrent();
  history.replaceState(null, '', '#machine=' + slug);
  showBrackets(slug);
  if (fly) {
    setCut(true);
    bvhReady.then(() => { if (selected === slug) flyTo(machinePose(slug), { dur: 1.7 }); });
  }
  if (focusPanel) $('pTitle').focus({ preventScroll: true });
}
function deselect() {
  const prev = selected; selected = null;
  showBrackets(null);
  if (prev) paint(prev);
  $('panel').hidden = true;
  document.body.classList.toggle('panel-open', !$('list').hidden);
  markCurrent();
  if (/^#machine=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
}
function openList(focus = true) {
  stopTour();
  if (mode === 'walk') setMode('orbit');
  const prev = selected; if (prev) { selected = null; paint(prev); showBrackets(null); }
  $('panel').hidden = true;
  $('list').hidden = false; $('bList').setAttribute('aria-expanded', 'true');
  document.body.classList.add('panel-open');
  markCurrent();
  if (focus && canHover) $('q').focus({ preventScroll: true });
}
function closeList() {
  $('list').hidden = true; $('bList').setAttribute('aria-expanded', 'false');
  document.body.classList.toggle('panel-open', !$('panel').hidden);
}
function closePanels() { if (selected) deselect(); closeList(); }
$('pClose').onclick = () => { deselect(); $('bList').focus({ preventScroll: true }); };
$('pBack').onclick = () => { const s = selected; openList(false); const b = document.querySelector(`[data-slug="${s}"]`); b && b.focus(); };
$('bList').onclick = () => ($('list').hidden ? openList() : closeList());
$('listClose').onclick = () => { closeList(); $('bList').focus({ preventScroll: true }); };
$('bOverview').onclick = () => { closePanels(); overview(); };

// the list: grouped by category in the site's order, searchable
const norm = (s) => s.toLocaleLowerCase('is').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/æ/g, 'ae').replace(/ö/g, 'o');
const listItems = [];
for (const c of content.categories) {
  const list = content.machines.filter((m) => m.category === c.slug);
  if (!list.length) continue;
  const g = el('section', 'group');
  const h = el('h3'); h.append(marker(c.slug), document.createTextNode(c.title)); g.append(h);
  const ul = el('ul');
  for (const m of list) {
    const li = el('li'); const b = el('button'); b.type = 'button'; b.dataset.slug = m.slug;
    b.append(el('span', 'n', m.title), el('span', 'q', qty(m.quantity)));
    b.onclick = () => select(m.slug, { focusPanel: true });
    li.append(b); ul.append(li);
    listItems.push({ li, group: g, hay: norm([m.title, c.title, m.location || '', ...m.uses].join(' ')) });
  }
  g.append(ul); $('groups').append(g);
}
function markCurrent() { document.querySelectorAll('#groups button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.slug === selected))); }
$('q').addEventListener('input', () => {
  const q = norm($('q').value.trim());
  const shownGroups = new Set();
  for (const it of listItems) { const show = !q || it.hay.includes(q); it.li.hidden = !show; if (show) shownGroups.add(it.group); }
  document.querySelectorAll('#groups .group').forEach((g) => { g.hidden = !shownGroups.has(g); });
  const none = shownGroups.size ? '' : $('qEmpty').dataset.none;   // a status region, so screen readers hear an empty result
  if ($('qEmpty').textContent !== none) $('qEmpty').textContent = none;
});
$('q').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { const first = listItems.find((it) => !it.li.hidden); if (first) first.li.querySelector('button').click(); }
});

// ------------------------------------------------------------ picking
const ndc = new THREE.Vector2();
function pick(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  ray.far = 200;
  ray.firstHitOnly = false;
  const hits = ray.intersectObjects(solids, false);
  ray.firstHitOnly = true;
  for (const h of hits) {
    if (!h.object.visible) continue;
    if (h.object.userData.glass) continue;
    if (h.object.material.transparent && h.object.material.opacity < 0.5) continue;
    return h.object.userData.slug || null;
  }
  return null;
}
let hoverReq = null, lastPointer = null;
canvas.addEventListener('pointermove', (e) => {
  if (mode !== 'orbit' || e.pointerType !== 'mouse' || e.buttons) { if (e.buttons) setHover(null), ($('hover').hidden = true); return; }
  lastPointer = { x: e.clientX, y: e.clientY };
  if (hoverReq) return;
  hoverReq = requestAnimationFrame(() => {
    hoverReq = null;
    if (!lastPointer || move) return;
    const slug = pick(lastPointer.x, lastPointer.y);
    setHover(slug);
    const lab = $('hover');
    if (slug) {
      lab.textContent = machines[slug].title;
      lab.hidden = false;
      const w = lab.offsetWidth, h = lab.offsetHeight;
      const edge = innerWidth - (phone() ? 0 : sideSize()) - 16;     // never touches the panel or the screen edge
      const x = lastPointer.x + 16 + w > edge ? Math.max(16, lastPointer.x - 16 - w) : lastPointer.x + 16;
      const y = Math.min(innerHeight - h - 16, lastPointer.y + 18);
      lab.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    } else lab.hidden = true;
  });
});
canvas.addEventListener('pointerleave', () => { setHover(null); $('hover').hidden = true; lastPointer = null; });
let down = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
  userInput();
});
canvas.addEventListener('pointerup', (e) => {
  if (!down || mode !== 'orbit') return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t;
  down = null;
  if (moved > 6 || dt > 500) return;
  const slug = pick(e.clientX, e.clientY);
  if (slug) select(slug);
});
canvas.addEventListener('wheel', userInput, { passive: true });
orbit.addEventListener('start', () => { move = null; userInput(); });
let userTook = false, inputs = 0;
function userInput() {
  userTook = true; pauseTour(); if (move && !tour.active) move = null;
  if (++inputs === 3) hideHelp();                              // the hint has done its job
}

// ------------------------------------------------------------ walk mode (desktop)
const EYE = 1.6, RADIUS = 0.3, SPEED = 1.9, STEP = 0.35;
if (!canHover) document.body.classList.add('no-walk');
function inLab(p) { return p.x > 20.3 && p.x < 34.3 && p.z > -38.4 && p.z < -14.9; }
function setMode(m) {
  if (m === mode) return;
  mode = m;
  document.body.classList.toggle('walk', m === 'walk');
  $('bWalk').setAttribute('aria-pressed', String(m === 'walk'));
  orbit.enabled = m === 'orbit';
  if (m === 'walk') {
    stopTour(); closePanels(); move = null;
    setHover(null); $('hover').hidden = true;
    setCut(false);
    let p = camera.position.clone();
    if (!inLab(p) || p.y > 3) {                       // start just inside the door, facing the lab
      p = new THREE.Vector3(32.6, 0, -36.7);
      camera.position.set(p.x, floorAt(p.x, p.z, 2) + EYE, p.z);
      camera.lookAt(28.5, EYE, -34.8);
    } else {
      camera.position.y = floorAt(p.x, p.z, p.y + 0.2) + EYE;
      const look = new THREE.Vector3(); camera.getWorldDirection(look); look.y = 0;
      camera.lookAt(camera.position.clone().add(look.lengthSq() ? look.normalize() : new THREE.Vector3(-1, 0, 0)));
    }
    camera.fov = fovFor(68); camera.updateProjectionMatrix();
    plc.lock();
  } else {
    if (plc.isLocked) plc.unlock();
    const d = new THREE.Vector3(); camera.getWorldDirection(d);
    orbit.target.copy(camera.position).addScaledVector(d, 2.5);
  }
  helpText();
  dirty = true;
}
$('bWalk').onclick = () => setMode(mode === 'walk' ? 'orbit' : 'walk');
plc.addEventListener('unlock', () => { if (mode === 'walk') setMode('orbit'); });
plc.addEventListener('change', setDirty);
canvas.addEventListener('click', () => { if (mode === 'walk' && !plc.isLocked) plc.lock(); });
// one short line, shown when a mode starts and faded after a few seconds (or after a few inputs)
let helpTimer = 0;
function hideHelp() { clearTimeout(helpTimer); $('help').classList.add('gone'); }
function helpText() {
  $('help').textContent = mode === 'walk' ? 'WASD eða örvar til að ganga · Esc til að hætta'
    : canHover ? 'Dragðu til að snúa · smelltu á tæki' : 'Dragðu til að snúa · pikkaðu á tæki';
  $('help').classList.remove('gone');
  clearTimeout(helpTimer);
  helpTimer = setTimeout(hideHelp, mode === 'walk' ? 6000 : 8000);
}
helpText();
const DOWN = new THREE.Vector3(0, -1, 0);
function floorAt(x, z, fromY) {
  ray.set(new THREE.Vector3(x, fromY, z), DOWN);
  ray.far = 10;
  const h = ray.intersectObjects(solids, false).find((h) => !h.object.userData.glass);
  return h ? h.point.y : 0;
}
function blocked(pos, dir, dist) {
  for (const hgt of [0.45, 1.1, EYE - 0.1]) {
    ray.set(new THREE.Vector3(pos.x, pos.y - EYE + hgt, pos.z), dir);
    ray.far = dist + RADIUS;
    if (ray.intersectObjects(solids, false).length || ray.intersectObjects(walkBlockers, false).length) return true;
  }
  return false;
}
function walk(dt) {
  const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
  const r = new THREE.Vector3().crossVectors(f, camera.up).normalize();
  const mv = new THREE.Vector3();
  if (keys.KeyW || keys.ArrowUp) mv.add(f);
  if (keys.KeyS || keys.ArrowDown) mv.sub(f);
  if (keys.KeyD || keys.ArrowRight) mv.add(r);
  if (keys.KeyA || keys.ArrowLeft) mv.sub(r);
  if (!mv.lengthSq()) return false;
  const step = SPEED * (keys.ShiftLeft || keys.ShiftRight ? 2 : 1) * dt;
  mv.normalize();
  for (const axis of [mv, new THREE.Vector3(mv.x, 0, 0), new THREE.Vector3(0, 0, mv.z)]) {
    if (!axis.lengthSq()) continue;
    const d = axis.clone().normalize();
    if (!blocked(camera.position, d, step)) { camera.position.addScaledVector(d, step * axis.length()); break; }
  }
  const fl = floorAt(camera.position.x, camera.position.z, camera.position.y - EYE + STEP);
  camera.position.y += (fl + EYE - camera.position.y) * Math.min(1, dt * 10);
  return true;
}

// ------------------------------------------------------------ keyboard
const typing = (e) => /INPUT|TEXTAREA/.test(e.target.tagName);
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (typing(e)) { if (e.key === 'Escape') { closeList(); $('bList').focus(); } return; }
  if (e.key === 'Escape') {
    if (!$('hover').hidden) { setHover(null); $('hover').hidden = true; return; }   // dismiss the pointer label first
    if (mode === 'walk') { setMode('orbit'); $('bWalk').focus({ preventScroll: true }); }
    else if (!$('panel').hidden) { deselect(); $('bList').focus({ preventScroll: true }); }
    else if (!$('list').hidden) { closeList(); $('bList').focus({ preventScroll: true }); }
    else if (tour.active) stopTour();
    return;
  }
  if (mode === 'walk') return;
  if (tour.active && e.key === 'ArrowRight') { e.preventDefault(); goStop(tour.i + 1); return; }
  if (tour.active && e.key === 'ArrowLeft') { e.preventDefault(); goStop(tour.i - 1); return; }
  if (tour.active && e.key === ' ' && (e.target === document.body || e.target === canvas)) { e.preventDefault(); tour.playing ? pauseTour() : playTour(); return; }
  if (e.key === '/' && e.target === canvas) { e.preventDefault(); openList(); return; }   // single-key shortcut only while the scene has focus
  if (/^(Arrow|Page|Home|End)/.test(e.key) && (e.target === document.body || e.target === canvas)) pauseTour();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// ------------------------------------------------------------ deep links
function fromHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  let m;
  if ((m = /^machine=([\w-]+)/.exec(h)) && machines[m[1]]) { select(m[1], { fly: true }); return true; }
  if ((m = /^stop=(\d+)/.exec(h))) {
    const n = THREE.MathUtils.clamp(parseInt(m[1], 10), 1, STOPS.length) - 1;
    goStop(n, { play: false, instant: true, at: 0.5 });
    return true;
  }
  if ((m = /^view=([-\d.,]+)/.exec(h))) {             // px,py,pz,tx,ty,tz[,fov[,shift]] in Blender coordinates
    const n = m[1].split(',').map(Number);
    if (n.length >= 6 && n.every(Number.isFinite)) {
      stopTour(); closePanels(); setMode('orbit'); setCut(false);
      const fov = n[6] || 50;
      applyPose({ pos: new THREE.Vector3(n[0], n[2], -n[1]), target: new THREE.Vector3(n[3], n[5], -n[4]), fov,
        shift: shiftNdc(n[7] || 0, fov, fov, Math.max(1, innerWidth / innerHeight)) });
      return true;
    }
  }
  return false;
}
window.addEventListener('hashchange', () => { fromHash(); });

// ------------------------------------------------------------ first frame
if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
else renderer.compile(scene, camera);
if (!fromHash()) overview(true);
shadowPending = true;
const loadMs = performance.now() - T0;
setTimeout(() => {                                  // BVH for picking, framing and walking, off the critical path
  let i = 0;
  const chunk = () => {
    const t = performance.now();
    while (i < solids.length && performance.now() - t < 12) solids[i++].geometry.computeBoundsTree();
    if (i < solids.length) setTimeout(chunk, 0); else { window.saga.bvh = true; bvhDone(); }
  };
  chunk();
}, 400);

// ------------------------------------------------------------ loop
let frames = 0, fpsT = 0, fps = 0, slowT = 0, rendered = 0, restT = 0;
let motionScale = +(params.get('motion') || (LOW ? 0.8 : 1)), interacting = false;
function setScale(k) { dprScale = k; renderer.setPixelRatio(BASE_DPR * k); resize(); }
orbit.addEventListener('start', () => { interacting = true; });
orbit.addEventListener('end', () => { setTimeout(() => { interacting = false; }, 600); });   // damping tail
let readyShown = false;
renderer.setAnimationLoop((t) => {
  clock.update(t);
  const dt = Math.min(clock.getDelta(), 0.1);
  stepMove(dt);
  stepTour(dt);
  if (view.k !== view.target) {                      // ease the frame centre when a panel opens or closes
    const sp = reduceMotion.matches ? 1 : dt / 0.45;
    view.k = view.target > view.k ? Math.min(view.target, view.k + sp) : Math.max(view.target, view.k - sp);
    applyView();
  }
  if (!tour.active || !STOPS[tour.i].door) {          // the bookcase door closes when the tour moves on
    if (door.angle > 0) setDoor(Math.max(0, door.angle - dt / 1.2));
  }
  if (lensShift && !move && !(tour.active && tour.phase === 'drift' && tour.playing) && userTook) {
    lensShift = Math.abs(lensShift) < 0.002 ? 0 : lensShift * Math.pow(0.02, dt);   // ease back to a centred lens
    camera.updateProjectionMatrix(); dirty = true;
  }
  if (mode === 'orbit') orbit.update(dt);
  else if (walk(dt)) dirty = true;
  if (doorShadowTick >= 6 || (doorShadowTick && door.angle === 0) || (doorShadowTick && Math.abs(door.angle - 1) < 1e-3)) { shadowPending = true; doorShadowTick = 0; }
  if (shadowPending) { renderer.shadowMap.needsUpdate = true; shadowPending = false; dirty = true; }
  // Render scale: full resolution at rest; while the camera moves, a scale that keeps frames under ~22 ms on
  // small GPUs (lowered step by step, never below 0.6). A still view is redrawn crisp a moment after it stops.
  const moving = dirty && (!!move || (tour.active && tour.playing && tour.phase === 'drift') || mode === 'walk' || interacting);
  if (moving) { restT = 0; if (dprScale !== motionScale) setScale(motionScale); }
  else if (dprScale !== 1 && (restT += dt) > 0.35) { setScale(1); dirty = true; }
  if (!dirty) { if (texPending === 0 && !readyShown) finishLoading(); return; }
  dirty = false;
  renderer.render(scene, camera);
  rendered++;
  if (moving) {
    frames++; fpsT += dt;
    if (fpsT > 0.5) {
      fps = frames / fpsT; frames = 0; fpsT = 0;
      if (fps < 45) {
        if (++slowT >= 2 && motionScale > 0.6) { motionScale = Math.max(0.6, motionScale - 0.15); setScale(motionScale); slowT = 0; }
        else if (slowT >= 4 && !LOW && fps < 30) dropToLow();      // still slow at the lowest scale: the low tier
      } else slowT = 0;
    }
  }
  if (texPending === 0 && !readyShown) finishLoading();
});
function dropToLow() {
  LOW = true; window.saga.tier = 'low (slow frames)';
  BASE_DPR = Math.min(BASE_DPR, 1);
  sun.shadow.mapSize.set(2048, 2048);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  shadowPending = true; slowT = 0;
  setScale(motionScale);
}
// ?bench: full frame time (CPU + GPU, synchronised with a pixel read) along four views, shown in the corner
function bench() {
  const g = renderer.getContext(), px = new Uint8Array(4);
  const views = [['Yfirsýn'], ...[2, 3, 6].map((i) => [STOPS[i].title])];
  const out = [];
  for (const [name] of views) {
    const isOver = name === 'Yfirsýn';
    setCut(isOver);
    renderer.shadowMap.needsUpdate = true;
    const ps = isOver ? overviewPose(0) : camPose(STOPS.find((s) => s.title === name).a);
    applyPose(ps);
    const ms = [];
    for (let f = 0; f < 70; f++) {
      camera.position.x += Math.sin(f / 9) * 0.01;
      camera.lookAt(orbit.target);
      const t = performance.now();
      renderer.render(scene, camera);
      g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
      if (f >= 10) ms.push(performance.now() - t);
    }
    ms.sort((a, b) => a - b);
    out.push({ view: name, ms: ms[Math.floor(ms.length / 2)], p90: ms[Math.floor(ms.length * 0.9)], calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
  }
  const e = g.getExtension('WEBGL_debug_renderer_info');
  const res = { gpu: e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER), tier: window.saga.tier, width: renderer.domElement.width,
    height: renderer.domElement.height, views: out };
  overview(true);
  return res;
}
function finishLoading() {
  readyShown = true;
  progress.glb = 1; showProgress();
  $('loading').classList.add('done');
  setTimeout(() => $('loading').remove(), 600);
  window.sagaReady = true;
  window.saga.readyMs = performance.now() - T0;
  if (params.has('bench')) {
    bvhReady.then(() => setTimeout(() => {
      const r = bench(); window.saga.benchResult = r;
      const worst = Math.max(...r.views.map((v) => v.ms));
      $('help').classList.remove('gone');
      $('help').textContent = `${r.views.map((v) => `${v.view} ${v.ms.toFixed(1)} ms`).join(' · ')} · hægast ${Math.round(1000 / worst)} rammar/s · ` +
        `${r.width}×${r.height} · hlaðið á ${(window.saga.readyMs / 1000).toFixed(1)} s · ${r.gpu}`;
    }, 300));
  }
}
window.saga = {
  tier: (LOW ? 'low' : 'high') + ' (' + tierWhy + ')', gpuName, baked: !!BAKE,
  camera, renderer, scene, STOPS, tour, select, deselect, goStop, startTour, pauseTour, overview, openList, setMode,
  get mode() { return mode; }, get selected() { return selected; }, get fps() { return fps; }, get rendered() { return rendered; },
  get dpr() { return renderer.getPixelRatio(); }, get motionScale() { return motionScale; },
  get loopState() { return { restT, slowT, frames, fpsT, dprScale, interacting, move: !!move, phase: tour.phase, playing: tour.playing, dirty }; }, loadMs, pick, bySlug, machinePose,
  stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs.length,
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
  filmView(name) {                                   // the film's own camera at the middle of a shot (comparisons)
    const w = info.walk.find((x) => x.name === name);
    stopTour(); setMode('orbit'); setCut(/Overview/.test(name));
    flyTo(camPose(w.mid), { dur: 0 });
  },
  project(slug) {                                    // screen position of a machine's centre (tests)
    const v = bySlug[slug].centre.clone().project(camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, z: v.z };
  },
};
