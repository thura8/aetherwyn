// Renders the AETHERWYN title wordmark to public/title/aetherwyn-wordmark.webp: Cinzel Black outlines
// cut into V-chisel facets, lit as polished gold with three.js in headless Chrome.
//
// The output is committed, so this only runs when the logo changes. Its extra tools are deliberately
// not project dependencies; install them anywhere and point TITLE_TOOLS_DIR at that folder:
//   npm i --prefix /tmp/title-tools opentype.js sharp playwright
//   TITLE_TOOLS_DIR=/tmp/title-tools node scripts/render-title-wordmark.mjs
// Needs Google Chrome installed.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = process.env.TITLE_TOOLS_DIR;
if (!TOOLS) throw new Error('Set TITLE_TOOLS_DIR; see the note at the top of this file.');
const require = createRequire(path.join(path.resolve(TOOLS), 'package.json'));
const opentype = require('opentype.js');
const sharp = require('sharp');
const { chromium } = require('playwright');
const FONT = path.join(ROOT, 'node_modules/@fontsource/cinzel/files/cinzel-latin-900-normal.woff');
const OUTPUT = path.join(ROOT, 'public/title/aetherwyn-wordmark.webp');
const OUTPUT_WIDTH = 2400;
const PORT = 47395;

const WORD = 'AETHERWYN';
const TRACK = 34;                 // base letterspacing, font units
// hand kerning, applied after the left letter of each pair (font units)
const KERN = { AE: 10, ET: -10, TH: -14, HE: -24, ER: -16, RW: -34, WY: 84, YN: 26 };
const FIELD_W = 6000;             // distance-field width in texels
const SS_W = 7600;
const WORLD_W = 10;               // world units across the field

const font = opentype.parse(fs.readFileSync(FONT).buffer.slice(0));
const UPM = font.unitsPerEm;

function flatten(cmds) {
  const contours = []; let cur = null, x = 0, y = 0;
  const lerp = (a, b, t) => a + (b - a) * t;
  for (const c of cmds) {
    if (c.type === 'M') { cur = [[c.x, c.y]]; contours.push(cur); x = c.x; y = c.y; }
    else if (c.type === 'L') { cur.push([c.x, c.y]); x = c.x; y = c.y; }
    else if (c.type === 'Q') {
      for (let i = 1; i <= 24; i++) { const t = i / 24;
        cur.push([lerp(lerp(x, c.x1, t), lerp(c.x1, c.x, t), t), lerp(lerp(y, c.y1, t), lerp(c.y1, c.y, t), t)]); }
      x = c.x; y = c.y;
    } else if (c.type === 'C') {
      for (let i = 1; i <= 32; i++) { const t = i / 32, u = 1 - t;
        cur.push([u*u*u*x + 3*u*u*t*c.x1 + 3*u*t*t*c.x2 + t*t*t*c.x, u*u*u*y + 3*u*u*t*c.y1 + 3*u*t*t*c.y2 + t*t*t*c.y]); }
      x = c.x; y = c.y;
    }
  }
  return contours.map(c => { const l = c[c.length-1], f = c[0];
    if (Math.hypot(l[0]-f[0], l[1]-f[1]) < 1e-3) c.pop(); return c; });
}

// The one custom gesture: the leg of the R drops its serif and carries on through the baseline
// as a long tapered blade running beneath the W. Coordinates are R-local font units (y-up).
function rewriteRLeg(cmds) {
  const hit = (c, x, y) => c.x !== undefined && Math.round(c.x) === x && Math.round(-c.y) === y;
  const from = cmds.findIndex(c => c.type === 'L' && hit(c, 738, 86));
  const to = cmds.findIndex(c => hit(c, 618, 7));
  if (from < 0 || to < from) throw new Error('R leg not found');
  const C = (x1, y1, x2, y2, x, y) => ({ type: 'C', x1, y1: -y1, x2, y2: -y2, x, y: -y });
  return [...cmds.slice(0, from + 1),
    C(800, -6, 940, -60, 1275, -112),     // upper edge, passes beneath the W's first vertex
    C(1010, -122, 750, -46, 618, 7),    // lower edge, rejoins the leg underside
    ...cmds.slice(to + 1)];
}

// y-up font units; each shape = list of closed contours
const shapes = [];
let penX = 0;
const glyphBoxes = [];
for (let i = 0; i < WORD.length; i++) {
  const ch = WORD[i], g = font.charToGlyph(ch);
  const p = g.getPath(0, 0, UPM);          // opentype flips y: y-down
  let cmds = p.commands;
  if (ch === 'R') cmds = rewriteRLeg(cmds);
  cmds = cmds.map(c => { const o = { ...c }; for (const key of ['x', 'x1', 'x2']) if (key in o) o[key] += penX; return o; });
  const contours = flatten(cmds).map(c => c.map(([x, y]) => [x, -y]));
  shapes.push({ ch, contours });
  const xs = contours.flat().map(q => q[0]), ys = contours.flat().map(q => q[1]);
  glyphBoxes.push({ ch, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
  penX += g.advanceWidth + TRACK + (KERN[WORD.slice(i, i+2)] ?? 0);
}

const all = shapes.flatMap(s => s.contours.flat());
const fx0 = Math.min(...all.map(p => p[0])), fx1 = Math.max(...all.map(p => p[0]));
const fy0 = Math.min(...all.map(p => p[1])), fy1 = Math.max(...all.map(p => p[1]));
const PAD = 24;
const pxPerUnit = (FIELD_W - 2 * PAD) / (fx1 - fx0);
const W = FIELD_W, H = Math.ceil((fy1 - fy0) * pxPerUnit + 2 * PAD);
const toPx = ([x, y]) => [PAD + (x - fx0) * pxPerUnit, PAD + (fy1 - y) * pxPerUnit];
console.log('field', W, H, 'pxPerUnit', pxPerUnit.toFixed(3), 'glyph gaps',
  glyphBoxes.slice(1).map((b, i) => `${glyphBoxes[i].ch}${b.ch}:${Math.round(b.x0 - glyphBoxes[i].x1)}`).join(' '));

function buildField() {
  const mask = new Uint8Array(W * H);
  for (const s of shapes) {
    const polys = s.contours.map(c => c.map(toPx));
    for (let y = 0; y < H; y++) {
      const yc = y + 0.5; const xs = [];
      for (const poly of polys) for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        if ((a[1] <= yc) !== (b[1] <= yc)) {
          xs.push([a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]), a[1] < b[1] ? 1 : -1]);
        }
      }
      if (!xs.length) continue;
      xs.sort((p, q) => p[0] - q[0]);
      let w = 0;
      for (let k = 0; k < xs.length - 1; k++) {
        w += xs[k][1];
        if (w !== 0) {
          const from = Math.max(0, Math.ceil(xs[k][0] - 0.5)), to = Math.min(W - 1, Math.floor(xs[k + 1][0] - 0.5));
          for (let x = from; x <= to; x++) mask[y * W + x] = 1;
        }
      }
    }
  }
  const at = (x, y) => { const i = Math.floor(x), j = Math.floor(y);
    return i >= 0 && j >= 0 && i < W && j < H ? mask[j * W + i] : 0; };
  // boundary samples of the union only
  const sx = [], sy = [];
  for (const s of shapes) for (const c of s.contours) {
    const poly = c.map(toPx);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue;
      const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L, n = Math.max(1, Math.ceil(L / 0.3));
      for (let k = 0; k < n; k++) { const t = k / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
        if (at(x + nx * 1.6, y + ny * 1.6) !== at(x - nx * 1.6, y - ny * 1.6)) { sx.push(x); sy.push(y); } }
    }
  }
  const SX = Float32Array.from(sx), SY = Float32Array.from(sy);
  const seed = new Int32Array(W * H).fill(-1), best = new Float32Array(W * H).fill(1e12);
  for (let s = 0; s < SX.length; s++) {
    const cx = Math.floor(SX[s]), cy = Math.floor(SY[s]);
    for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
      if (i < 0 || j < 0 || i >= W || j >= H) continue;
      const dx = i + .5 - SX[s], dy = j + .5 - SY[s], d = dx * dx + dy * dy, id = j * W + i;
      if (d < best[id]) { best[id] = d; seed[id] = s; }
    }
  }
  const relax = (i, j, oi, oj) => {
    const ni = i + oi, nj = j + oj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) return;
    const s = seed[nj * W + ni]; if (s < 0) return;
    const dx = i + .5 - SX[s], dy = j + .5 - SY[s], d = dx * dx + dy * dy, id = j * W + i;
    if (d < best[id]) { best[id] = d; seed[id] = s; }
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) { relax(i,j,-1,0); relax(i,j,0,-1); relax(i,j,-1,-1); relax(i,j,1,-1); }
      for (let i = W - 1; i >= 0; i--) relax(i,j,1,0);
    }
    for (let j = H - 1; j >= 0; j--) {
      for (let i = W - 1; i >= 0; i--) { relax(i,j,1,0); relax(i,j,0,1); relax(i,j,1,1); relax(i,j,-1,1); }
      for (let i = 0; i < W; i++) relax(i,j,-1,0);
    }
  }
  const gx = new Float32Array(W * H), gy = new Float32Array(W * H), dist = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const id = j * W + i, s = seed[id]; if (s < 0) continue;
    const dx = i + .5 - SX[s], dy = j + .5 - SY[s], d = Math.sqrt(best[id]) || 1e-4;
    if (mask[id]) { gx[id] = dx / d; gy[id] = dy / d; dist[id] = d; }
    else { gx[id] = -dx / d; gy[id] = -dy / d; dist[id] = -d; }
  }
  return { mask, gx, gy, dist };
}

function boxBlur(src, r, passes = 2) {
  let a = src, b = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < H; j++) { let s = 0, o = j * W;
      for (let i = -r; i <= r; i++) s += a[o + Math.min(W - 1, Math.max(0, i))];
      for (let i = 0; i < W; i++) { b[o + i] = s / n;
        s += a[o + Math.min(W - 1, i + r + 1)] - a[o + Math.max(0, i - r)]; } }
    const c = new Float32Array(src.length);
    for (let i = 0; i < W; i++) { let s = 0;
      for (let j = -r; j <= r; j++) s += b[Math.min(H - 1, Math.max(0, j)) * W + i];
      for (let j = 0; j < H; j++) { c[j * W + i] = s / n;
        s += b[Math.min(H - 1, j + r + 1) * W + i] - b[Math.max(0, j - r) * W + i]; } }
    a = c;
  }
  return a;
}

const k = WORLD_W / W;                       // world units per field px
const DN = 0.075 * UPM * pxPerUnit;          // distance over which the flank steepens
const A0 = 27 * Math.PI / 180, A1 = 43 * Math.PI / 180;
const FILLET = 2;                            // px radius of the micro-round on ridge and rim
const slopeAt = d => { const t = Math.min(1, d / DN), e = t * t * (3 - 2 * t); return Math.tan(A0 + (A1 - A0) * e); };
const LUT = new Float32Array(4096); { let h = 0; for (let i = 0; i < 4096; i++) { LUT[i] = h; h += slopeAt(i * 0.25) * 0.25; } }
const heightAt = d => { if (d <= 0) return 0; const f = d * 4, i = Math.min(4094, Math.floor(f)); return LUT[i] + (LUT[i + 1] - LUT[i]) * (f - i); };

console.time('field');
const F = buildField();
// Grow every stroke by offsetting the signed distance field. Thick stems barely change; hairlines
// and serifs gain the most, which keeps the H bar and E arms alive at menu and phone sizes.
const STROKE_GAIN = 6 * pxPerUnit;
for (let i = 0; i < W * H; i++) F.dist[i] += STROKE_GAIN;
const sxRaw = new Float32Array(W * H), syRaw = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) { const d = F.dist[i]; if (d > 0) { const s = slopeAt(d); sxRaw[i] = F.gx[i] * s; syRaw[i] = F.gy[i] * s; } }
const sxB = boxBlur(sxRaw, FILLET), syB = boxBlur(syRaw, FILLET);
const fieldBuf = new Float32Array(W * H * 4), heightBuf = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) {
  const d = F.dist[i], o = i * 4;
  fieldBuf[o] = sxB[i]; fieldBuf[o + 1] = syB[i]; fieldBuf[o + 2] = d;
  // ridge proximity: how much the fillet has collapsed the slope (1 on the knife edge)
  const raw = Math.hypot(sxRaw[i], syRaw[i]), blurred = Math.hypot(sxB[i], syB[i]);
  fieldBuf[o + 3] = d > FILLET * 2 && raw > 1e-3 ? Math.min(1, Math.max(0, 1 - blurred / raw)) : 0;
  heightBuf[i] = heightAt(d);
}
console.timeEnd('field');

// polygons for the exact extruded body (world coords, built in page)
const shapePolys = shapes.map(s => s.contours.map(c => c.map(toPx).map(([x, y]) => [(x - W / 2) * k, (H / 2 - y) * k])));

const HTML = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:transparent}</style>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js"}}</script>
<script type="module" src="/main.js"></script>`;

const MAIN = `
import * as THREE from 'three';
const cfg = await (await fetch('/cfg')).json();
const field = new Float32Array(await (await fetch('/field')).arrayBuffer());
const height = new Float32Array(await (await fetch('/height')).arrayBuffer());
const polys = await (await fetch('/polys')).json();
const {W,H,k,ssW,ssH} = cfg;

const renderer = new THREE.WebGLRenderer({antialias:true,alpha:true,premultipliedAlpha:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1); renderer.setSize(ssW,ssH); renderer.setClearColor(0x000000,0);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = cfg.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
if(!renderer.extensions.has('OES_texture_float_linear')) throw new Error('no float linear');

const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50,64,32), new THREE.ShaderMaterial({
  side:THREE.BackSide, depthWrite:false, toneMapped:false,
  vertexShader:'varying vec3 vD; void main(){vD=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:\`
  varying vec3 vD;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.03+7.1;a*=.5;}return s;}
  // angular soft box: az = azimuth around the view axis in degrees, width w, softness s
  float lobe(float phi,float c,float w){float d=abs(mod(phi-c+540.,360.)-180.)/w;return exp(-d*d);}
  float az(float phi,float c,float w,float s){float d=abs(mod(phi-c+540.,360.)-180.);return 1.-smoothstep(w,w+s,d);}
  void main(){
    vec3 d=normalize(vD);
    float phi=degrees(atan(d.y,d.x)); // 90 = up, 180 = left, 270/-90 = down, 0 = right
    float z=d.z;                      // +1 toward the camera, -1 behind the word
    // base sky: indigo below, violet above, clouds breaking it up
    float up=d.y*.5+.5;
    vec3 sky=mix(vec3(.03,.025,.11),vec3(.18,.10,.36),smoothstep(.15,.9,up));
    float cl=fbm(vec2(phi*.035,z*4.));
    sky*=.5+1.0*cl;
    vec3 c=sky*.30+vec3(.05,.035,.02);
    float keyBand=smoothstep(-.12,.1,z)*(1.-smoothstep(.74,.94,z));
    // a flank spans z=.59 (outer edge) to z=.07 (ridge). Streaks give polished metal something to mirror.
    float toRidge=1.-smoothstep(.05,.62,z);
    float streak=.5+1.0*fbm(vec2(phi*.22,z*5.));
    // hard horizon line across each flank: a cloud bank seen in the metal
    float horizon=smoothstep(.235,.27,z);
    float bandLift=mix(1.75,.62,horizon)+.5*smoothstep(.40,.56,z);
    vec3 warm=vec3(1.,.80,.50), hot=vec3(1.,.90,.70);
    c+=warm*lobe(phi,92.,13.)*keyBand*1.5*bandLift*streak;
    c+=hot*lobe(phi,128.,17.)*keyBand*3.1*bandLift*streak;
    c+=warm*lobe(phi,162.,17.)*keyBand*1.02*bandLift*streak;
    c+=vec3(.95,.60,.42)*lobe(phi,190.,17.)*keyBand*.40*bandLift*streak;
    c+=vec3(.86,.62,.46)*lobe(phi,246.,30.)*keyBand*.20;
    // low right: cold arena light strip over a soft pool
    c+=vec3(.92,.92,1.)*lobe(phi,318.,5.)*keyBand*1.5;
    c+=vec3(.80,.62,.50)*lobe(phi,312.,32.)*keyBand*.15;
    // right: ember bounce so these flanks go deep bronze, not dead grey
    c+=vec3(1.,.70,.40)*lobe(phi,0.,28.)*keyBand*(.18+.34*toRidge)*streak;
    // thin aurora line through the dark side
    c+=vec3(1.,.97,.86)*lobe(phi,20.,4.)*smoothstep(.2,.28,z)*(1.-smoothstep(.44,.52,z))*.8;
    float aur=lobe(phi,58.,13.)*keyBand*(.3+.9*fbm(vec2(phi*.14,z*1.5)));
    c+=vec3(1.,.90,.72)*aur*.30;   // pale sky, not teal: teal x gold mirrors as olive
    // the frontal hemisphere (what the fillets and rim see): warm studio card
    c+=vec3(1.,.84,.60)*smoothstep(.86,.97,z)*1.7;
    // behind the word (what the side walls see): dim bronze world with a soft arena glow from below
    float back=smoothstep(.0,-.5,z);
    c=mix(c,vec3(.34,.21,.09)+vec3(1.,.62,.28)*smoothstep(.0,-.5,d.y)*.5,back);
    gl_FragColor=vec4(c,1.);
  }\`
})));
const pm = new THREE.PMREMGenerator(renderer);
const envRT = pm.fromScene(envScene,0,0.1,200,{size:512});

const scene = new THREE.Scene();
scene.environment = envRT.texture;
const fieldTex = new THREE.DataTexture(field,W,H,THREE.RGBAFormat,THREE.FloatType);
fieldTex.minFilter=fieldTex.magFilter=THREE.LinearFilter; fieldTex.generateMipmaps=false; fieldTex.flipY=false; fieldTex.needsUpdate=true;

const GOLD = new THREE.Color().setRGB(1.0,0.69,0.235);
const relief = new THREE.MeshPhysicalMaterial({color:GOLD,metalness:1,roughness:.11,clearcoat:.16,clearcoatRoughness:.14,envMapIntensity:1});
relief.onBeforeCompile = (s)=>{
  s.uniforms.uField={value:fieldTex};
  s.uniforms.uPxW={value:1/k};
  s.vertexShader = s.vertexShader
    .replace('#include <common>','#include <common>\\nattribute vec2 fuv; varying vec2 vFuv; varying vec3 vWp;')
    .replace('#include <begin_vertex>','#include <begin_vertex>\\nvFuv=fuv; vWp=position;');
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>',\`#include <common>
    uniform sampler2D uField; uniform float uPxW; uniform mat3 normalMatrix;
    varying vec2 vFuv; varying vec3 vWp;
    float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
    float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.07+vec2(3.1,1.7);a*=.5;}return s;}
    vec2 gField; float gD,gRidge,gWear,gPatina,gTool; vec2 gNoiseSlope;
    \`)
    .replace('#include <color_fragment>',\`#include <color_fragment>
    vec4 fld=texture2D(uField,vFuv);
    if(fld.b<0.) discard;
    gField=fld.rg; gD=fld.b/uPxW; gRidge=fld.a;     // gD in world units
    vec2 P=vWp.xy;
    // file marks: bands running ALONG each stroke (they follow distance from the edge)
    float bandCoord=gD*105.+ (fbm(P*1.3)-.5)*1.3;
    gTool=vn(vec2(bandCoord,P.x*.4+P.y*.4))-.5;
    float tool2=vn(vec2(bandCoord*3.3,P.x*1.1-P.y*.8))-.5;
    // uneven hand-finishing: low frequency waviness and finer hammer
    vec2 wav=vec2(fbm(P*2.2+11.),fbm(P*2.2+37.))-.5;
    vec2 fine=vec2(fbm(P*24.+5.),fbm(P*24.+71.))-.5;
    vec2 dirn=length(gField)>1e-3?normalize(gField):vec2(0.);
    float ding=smoothstep(.72,.84,fbm(P*42.+9.));
    gNoiseSlope=wav*.11+fine*.03+dirn*(gTool*.028+tool2*.014)+(vec2(fbm(P*90.),fbm(P*90.+40.))-.5)*ding*.16;
    // wear: rubbed ridges, tarnish in the low margins and in blotches
    float blot=smoothstep(.40,.70,fbm(P*5.5+2.));
    float low=1.-smoothstep(.0,.055,gD);
    gPatina=clamp(blot*.75*(1.-smoothstep(.02,.16,gD))+low*.08,0.,1.);
    gWear=smoothstep(.05,.6,gRidge)+smoothstep(.09,.15,gD)*.0;
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.62,.34,.13),gPatina*.8);
    float tint=fbm(P*1.4+19.);
    diffuseColor.rgb*=mix(vec3(1.05,.97,.90),vec3(.96,1.0,1.06),tint);
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.,.82,.5),gWear*.65);
    \`)
    .replace('#include <roughnessmap_fragment>',\`
    float roughnessFactor=roughness;
    float rn=fbm(vWp.xy*38.);
    roughnessFactor+= (rn-.5)*.12 + gTool*.04 + gPatina*.20 - gWear*.12;
    roughnessFactor=clamp(roughnessFactor,.07,.75);
    \`)
    .replace('#include <normal_fragment_maps>',\`
    {
      // field stores slope in image axes (y down). height rises toward the ridge, so the
      // outward normal is (-dh/dx,-dh/dy,1) with y flipped back to world.
      vec2 sl=gField+gNoiseSlope*smoothstep(0.,.02,gD)+vec2(vWp.x*.016,-vWp.y*.62);
      vec3 objN=normalize(vec3(-sl.x,sl.y,1.));
      normal=normalize(normalMatrix*objN);
    }\`);
};
const plain = new THREE.MeshPhysicalMaterial({color:new THREE.Color().setRGB(.58,.36,.13),metalness:1,roughness:.42,envMapIntensity:1});

const group = new THREE.Group(); scene.add(group);
const area = c=>{let a=0;for(let i=0;i<c.length;i++){const p=c[i],q=c[(i+1)%c.length];a+=p[0]*q[1]-q[0]*p[1];}return a/2;};
const inside=(pt,c)=>{let r=false;for(let i=0,j=c.length-1;i<c.length;j=i++){const a=c[i],b=c[j];
  if((a[1]>pt[1])!==(b[1]>pt[1])&&pt[0]<(b[0]-a[0])*(pt[1]-a[1])/(b[1]-a[1])+a[0])r=!r;}return r;};
const toV2=c=>c.map(p=>new THREE.Vector2(p[0],p[1]));
const body=[];
for(const contours of polys){
  const biggest=Math.max(...contours.map(c=>Math.abs(area(c))));
  const outerSign=Math.sign(area(contours.find(c=>Math.abs(area(c))===biggest)));
  const outers=contours.filter(c=>Math.sign(area(c))===outerSign);
  const holes=contours.filter(c=>Math.sign(area(c))!==outerSign);
  for(const o of outers){
    const sh=new THREE.Shape(toV2(o));
    for(const h of holes) if(inside(h[0],o)) sh.holes.push(new THREE.Path(toV2(h)));
    const g=new THREE.ExtrudeGeometry(sh,{depth:cfg.depth,bevelEnabled:false,curveSegments:1,steps:1});
    g.translate(0,0,-cfg.depth-.0012);
    body.push(new THREE.Mesh(g,plain));
  }
}
body.forEach(m=>group.add(m));

const STEP=cfg.step;
const nx=Math.floor((W-1)/STEP)+1, ny=Math.floor((H-1)/STEP)+1;
const vid=new Int32Array(nx*ny).fill(-1); const pos=[],fuv=[],idx=[];
const dAt=(i,j)=>field[(j*W+i)*4+2];
const getV=(gi,gj)=>{const key=gj*nx+gi; if(vid[key]>=0) return vid[key];
  const i=Math.min(W-1,gi*STEP), j=Math.min(H-1,gj*STEP); const id=j*W+i;
  const x=i+.5,y=j+.5;
  pos.push((x-W/2)*k,(H/2-y)*k,height[id]*k+.0006);
  fuv.push(x/W,y/H); vid[key]=pos.length/3-1; return vid[key];};
for(let gj=0;gj<ny-1;gj++) for(let gi=0;gi<nx-1;gi++){
  const i0=gi*STEP,j0=gj*STEP,i1=Math.min(W-1,i0+STEP),j1=Math.min(H-1,j0+STEP);
  if(Math.max(dAt(i0,j0),dAt(i1,j0),dAt(i0,j1),dAt(i1,j1))<-1.5) continue;
  const a=getV(gi,gj),b=getV(gi+1,gj),c=getV(gi,gj+1),d=getV(gi+1,gj+1);
  idx.push(a,c,b, b,c,d);
}
const rg=new THREE.BufferGeometry();
rg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
rg.setAttribute('fuv',new THREE.Float32BufferAttribute(fuv,2));
rg.setIndex(idx); rg.computeVertexNormals();
group.add(new THREE.Mesh(rg,relief));

// analytic sun for tight glints the PMREM cannot hold
const sun=new THREE.DirectionalLight(0xfff0d8,cfg.sun); sun.position.set(-4,7,6); scene.add(sun);

const wWorld=W*k, hWorld=H*k;
const aspect=ssW/ssH, dist=cfg.dist;
const halfV=Math.atan((wWorld*cfg.fill/aspect/2)/dist);
const cam=new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(halfV)*2,aspect,dist-6,dist+6);
cam.position.set(cfg.camX,cfg.camY,dist); cam.lookAt(0,0,0);
renderer.render(scene,cam);
const gl=renderer.getContext();
const px=new Uint8Array(ssW*ssH*4);
gl.bindFramebuffer(gl.FRAMEBUFFER,null);
gl.readPixels(0,0,ssW,ssH,gl.RGBA,gl.UNSIGNED_BYTE,px);
await fetch('/result',{method:'POST',body:px});
window.__done=true;
`;

const ssH = Math.ceil(SS_W * (H / W) * 1.28);
const CFG = { W, H, k, ssW: SS_W, ssH, depth: 0.12, step: 3, exposure: 1.0, sun: .75, dist: 42, camX: -0.5, camY: -3.0, fill: 1.03 };
let resolveResult; const resultP = new Promise(r => { resolveResult = r; });
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const send = (b, t = 'application/octet-stream') => { res.writeHead(200, { 'content-type': t }); res.end(b); };
  if (u === '/') return send(HTML, 'text/html');
  if (u === '/main.js') return send(MAIN, 'text/javascript');
  if (u === '/cfg') return send(JSON.stringify(CFG), 'application/json');
  if (u === '/polys') return send(JSON.stringify(shapePolys), 'application/json');
  if (u === '/field') return send(Buffer.from(fieldBuf.buffer));
  if (u === '/height') return send(Buffer.from(heightBuf.buffer));
  if (u === '/result') { const parts = []; req.on('data', d => parts.push(d)); req.on('end', () => { res.end('ok'); resolveResult(Buffer.concat(parts)); }); return; }
  if (u.startsWith('/three/')) {
    const f = path.join(ROOT, 'node_modules', u);
    if (fs.existsSync(f)) return send(fs.readFileSync(f), 'text/javascript');
  }
  res.writeHead(404); res.end();
});
await new Promise(r => server.listen(PORT, r));

console.time('render'); let TIMER;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 400 } });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text().slice(0, 600)); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.goto(`http://localhost:${PORT}/`).catch(() => {});
const raw = await Promise.race([resultP, new Promise((_, rej) => { TIMER = setTimeout(() => rej(new Error('render timeout')), 150000); })]);
clearTimeout(TIMER); await browser.close(); server.close();
console.timeEnd('render');

const OW = SS_W >> 1, OH = ssH >> 1;
const premul = new Float32Array(OW * OH * 4);
for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
  const oo = ((OH - 1 - y) * OW + x) * 4; // flip vertically: GL is bottom-up
  for (let c = 0; c < 4; c++) {
    let s = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) s += raw[((y * 2 + j) * SS_W + x * 2 + i) * 4 + c];
    premul[oo + c] = s / 4 / 255;
  }
}
function blur1(src, w, h, r, passes = 3) {
  let a = Float32Array.from(src), b = new Float32Array(src.length); const n = 2 * r + 1;
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < h; j++) { let s = 0, o = j * w;
      for (let i = -r; i <= r; i++) s += a[o + Math.min(w - 1, Math.max(0, i))];
      for (let i = 0; i < w; i++) { b[o + i] = s / n; s += a[o + Math.min(w - 1, i + r + 1)] - a[o + Math.max(0, i - r)]; } }
    for (let i = 0; i < w; i++) { let s = 0;
      for (let j = -r; j <= r; j++) s += b[Math.min(h - 1, Math.max(0, j)) * w + i];
      for (let j = 0; j < h; j++) { a[j * w + i] = s / n; s += b[Math.min(h - 1, j + r + 1) * w + i] - b[Math.max(0, j - r) * w + i]; } }
  }
  return a;
}
const alpha = new Float32Array(OW * OH), glareSrc = [new Float32Array(OW * OH), new Float32Array(OW * OH), new Float32Array(OW * OH)];
for (let i = 0; i < OW * OH; i++) {
  const o = i * 4; alpha[i] = premul[o + 3];
  const l = 0.3 * premul[o] + 0.6 * premul[o + 1] + 0.1 * premul[o + 2];
  const g = Math.max(0, l - 0.80) / 0.2;
  for (let c = 0; c < 3; c++) glareSrc[c][i] = premul[o + c] * g;
}
const sh = blur1(alpha, OW, OH, 9);
const contact = blur1(alpha, OW, OH, 2, 2);
const CONTACT_DROP = 5;
const glare = glareSrc.map(c => blur1(c, OW, OH, 8));
const out = Buffer.alloc(OW * OH * 4);
for (let i = 0; i < OW * OH; i++) {
  const o = i * 4;
  // start with shadow (deep indigo, premultiplied), then glare, then the object itself
  const above = i - CONTACT_DROP * OW;
  const sa = Math.min(1, Math.max(sh[i] * 0.42, (above >= 0 ? contact[above] : 0) * 0.72));
  let pr = 0.03 * sa, pg = 0.015 * sa, pb = 0.09 * sa, pa = sa;
  const gs = 0.16;
  const gr = glare[0][i] * gs, gg = glare[1][i] * gs, gb = glare[2][i] * gs;
  const ga = Math.min(1, Math.max(gr, gg, gb));
  pr = gr + pr * (1 - ga); pg = gg + pg * (1 - ga); pb = gb + pb * (1 - ga); pa = ga + pa * (1 - ga);
  const A = premul[o + 3];
  pr = premul[o] + pr * (1 - A); pg = premul[o + 1] + pg * (1 - A); pb = premul[o + 2] + pb * (1 - A); pa = A + pa * (1 - A);
  if (pa > 1e-4) {
    out[o] = Math.min(255, Math.round(pr / pa * 255)); out[o + 1] = Math.min(255, Math.round(pg / pa * 255));
    out[o + 2] = Math.min(255, Math.round(pb / pa * 255)); out[o + 3] = Math.round(pa * 255);
  }
}
let x0 = OW, x1 = 0, y0 = OH, y1 = 0;
for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) if (out[(y * OW + x) * 4 + 3] > 3) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
const M = 6; x0 = Math.max(0, x0 - M); y0 = Math.max(0, y0 - M); x1 = Math.min(OW - 1, x1 + M); y1 = Math.min(OH - 1, y1 + M);
const cw = x1 - x0 + 1, chh = y1 - y0 + 1;
await sharp(out, { raw: { width: OW, height: OH, channels: 4 } })
  .extract({ left: x0, top: y0, width: cw, height: chh })
  .resize({ width: OUTPUT_WIDTH, kernel: 'lanczos3' })
  .webp({ quality: 90, alphaQuality: 100, effort: 6 })
  .toFile(OUTPUT);
console.log('wrote', OUTPUT, 'source size', cw, chh);
process.exit(0);
