import * as THREE from "three";
import { hdrColor, type WorldBuildContext } from "./buildContext";
import { createMoonTexture } from "./canvasTextures";
import {
  createNoiseGlsl,
  DIRECTION_VERTEX_GLSL,
  TO_LINEAR_GLSL,
} from "./shaderChunks";

const ADDITIVE = THREE.AdditiveBlending;

export function buildEnvironmentLighting(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
) {
  const environment = new THREE.Scene();
  environment.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(50, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader: DIRECTION_VERTEX_GLSL,
        fragmentShader: `${TO_LINEAR_GLSL} varying vec3 vP; void main(){ float h = vP.y;
        vec3 c = mix(vec3(0.42,0.34,0.62), vec3(0.12,0.12,0.30), smoothstep(0.0, 0.7, h));
        c = mix(c, vec3(0.08,0.07,0.18), smoothstep(0.0, 0.5, -h));
        gl_FragColor = vec4(toLin(c), 1.0); }`,
      }),
    ),
  );
  const addLightBlob = (
    color: number,
    intensity: number,
    position: THREE.Vector3,
    radius: number,
  ) => {
    const blob = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 16, 8),
      new THREE.MeshBasicMaterial({ color: hdrColor(color, intensity) }),
    );
    blob.position.copy(position);
    environment.add(blob);
  };
  addLightBlob(0xd6dcff, 6, new THREE.Vector3(20, 22, -30), 5); // moon
  addLightBlob(0x94e1f3, 2, new THREE.Vector3(-30, 8, 10), 8); // cyan bounce
  addLightBlob(0xfadc98, 2, new THREE.Vector3(0, -10, 30), 9); // warm floor bounce
  const environmentGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = environmentGenerator.fromScene(environment, 0.03).texture;
  scene.environmentIntensity = 0.55;
  environmentGenerator.dispose();
}

function buildStars(
  { scene, lowQuality, random, timedMaterials }: WorldBuildContext,
  pixelRatio: number,
) {
  const rand = random.next;
  const STAR_COUNT = lowQuality ? 1600 : 3000;
  const positions = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);
  const phases = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i++) {
    const angle = rand() * Math.PI * 2;
    const height = Math.pow(rand(), 0.7) * 0.95 + 0.04;
    const radius = 520;
    positions[i * 3] =
      Math.cos(angle) * Math.sqrt(1 - height * height) * radius;
    positions[i * 3 + 1] = height * radius - 30;
    positions[i * 3 + 2] =
      Math.sin(angle) * Math.sqrt(1 - height * height) * radius;
    sizes[i] = rand() < 0.04 ? 6 + rand() * 4 : 1.3 + rand() * 2.4;
    phases[i] = rand() * 6.28;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: ADDITIVE,
    fog: false,
    uniforms: { uTime: { value: 0 }, uPR: { value: pixelRatio } },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uPR; varying float vA; varying float vBig;
        void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          vA = 0.5 + 0.5 * sin(uTime * (0.8 + fract(aPhase) * 1.8) + aPhase); vBig = step(5.0, aSize); gl_PointSize = aSize * uPR; }`,
    fragmentShader: `${TO_LINEAR_GLSL} varying float vA; varying float vBig;
        void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p);
          float core = 1.0 - smoothstep(0.0, 0.5, d);
          float crs = vBig * ((1.0 - smoothstep(0.0, 0.05, abs(p.x))) + (1.0 - smoothstep(0.0, 0.05, abs(p.y)))) * (1.0 - smoothstep(0.1, 0.5, d));
          vec3 col = mix(vec3(0.8,0.85,1.0), vec3(1.0,0.92,0.75), vBig);
          gl_FragColor = vec4(toLin(col) * (1.0 + vBig * 1.5), (core * core + crs) * (0.3 + 0.7 * vA)); }`,
  });
  timedMaterials.push(material);
  scene.add(new THREE.Points(geometry, material));
}

function buildAurora({ scene, timedMaterials }: WorldBuildContext) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: ADDITIVE,
    fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `uniform float uTime; varying vec2 vUv;
      void main(){ vUv = uv; vec3 p = position;
        p.z += sin(p.x * 0.016 + uTime * 0.12) * 34.0; p.y += sin(p.x * 0.028 + uTime * 0.09) * 10.0 * uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }`,
    fragmentShader: `${TO_LINEAR_GLSL} uniform float uTime; varying vec2 vUv;
      void main(){ float x = vUv.x;
        float b = sin(x * 24.0 + uTime * 0.4 + sin(x * 7.0 + uTime * 0.22) * 2.6) * 0.5 + 0.5;
        b *= sin(x * 67.0 - uTime * 0.7) * 0.3 + 0.7; b = pow(b, 1.5);
        float v = smoothstep(0.0, 0.16, vUv.y) * pow(max(1.0 - vUv.y, 0.0), 1.3);
        float e = smoothstep(0.0, 0.15, x) * (1.0 - smoothstep(0.85, 1.0, x));
        vec3 c = mix(vec3(0.35,0.95,0.85), vec3(0.6,0.38,1.0), smoothstep(0.1, 0.8, vUv.y));
        gl_FragColor = vec4(toLin(c), b * v * e * 0.55); }`,
  });
  timedMaterials.push(material);
  const curtains: [number, number, number, number, number][] = [
    [80, 110, -360, -0.25, 480],
    [-120, 140, -400, 0.2, 380],
  ];
  curtains.forEach(([x, y, z, rotationY, width]) => {
    const curtain = new THREE.Mesh(
      new THREE.PlaneGeometry(width, 120, 120, 1),
      material,
    );
    curtain.position.set(x, y, z);
    curtain.rotation.y = rotationY;
    curtain.rotation.z = -0.12;
    scene.add(curtain);
  });
}

export function buildSky(context: WorldBuildContext, pixelRatio: number) {
  const { scene, lowQuality, glowTexture } = context;
  const moonDirection = new THREE.Vector3(0.55, 0.38, -1).normalize();
  scene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(650, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uMoon: { value: moonDirection } },
        vertexShader: DIRECTION_VERTEX_GLSL,
        fragmentShader: `${TO_LINEAR_GLSL} ${createNoiseGlsl(lowQuality)} uniform vec3 uMoon; varying vec3 vP;
      void main(){ float h = vP.y;
        vec3 top = vec3(0.04,0.05,0.13), mid = vec3(0.16,0.14,0.36), hor = vec3(0.55,0.44,0.76), low = vec3(0.10,0.09,0.24);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, h)); c = mix(c, top, smoothstep(0.22, 0.85, h)); c = mix(c, low, smoothstep(0.0, 0.35, -h));
        float m = max(dot(vP, uMoon), 0.0); c += vec3(0.7,0.65,1.0) * pow(m, 8.0) * 0.16;
        vec3 bn = normalize(vec3(0.35, 0.55, 0.76)); float bd = dot(vP, bn); float band = exp(-bd * bd * 12.0);
        float neb = fbm3(vP * 3.5); float dust = smoothstep(0.42, 0.72, fbm3(vP * 7.0 + 3.1));
        c += band * smoothstep(0.02, 0.3, h) * (vec3(0.5, 0.42, 0.85) * neb * 0.2 + vec3(0.6, 0.8, 1.0) * pow(neb, 3.0) * 0.3) * (1.0 - dust * 0.75);
        gl_FragColor = vec4(toLin(c), 1.0); }`,
      }),
    ),
  );

  const moonTexture = createMoonTexture();
  const moons: [THREE.Vector3, number][] = [
    [moonDirection, 34],
    [new THREE.Vector3(-0.2, 0.3, -1).normalize(), 16],
  ];
  moons.forEach(([direction, size]) => {
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: hdrColor(0x9f8acf, 0.6),
        transparent: true,
        fog: false,
        depthWrite: false,
        blending: ADDITIVE,
      }),
    );
    glow.position.copy(direction).multiplyScalar(500);
    glow.scale.set(size * 3.2, size * 3.2, 1);
    scene.add(glow);
    const moon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: moonTexture,
        color: hdrColor(0xffffff, 1.6),
        transparent: true,
        fog: false,
        depthWrite: false,
      }),
    );
    moon.position.copy(direction).multiplyScalar(505);
    moon.scale.set(size, size, 1);
    scene.add(moon);
  });

  buildStars(context, pixelRatio);
  buildAurora(context);

  scene.add(new THREE.HemisphereLight(0xb7a6ec, 0x1d2c55, 0.9));
  const moonLight = new THREE.DirectionalLight(0xc8d6ff, 2.2);
  moonLight.position.set(30, 55, -18);
  moonLight.castShadow = !lowQuality;
  moonLight.shadow.mapSize.set(2048, 2048);
  Object.assign(moonLight.shadow.camera, {
    left: -24,
    right: 24,
    top: 24,
    bottom: -24,
    near: 10,
    far: 120,
  });
  moonLight.shadow.bias = -0.0004;
  moonLight.shadow.normalBias = 0.04;
  moonLight.shadow.radius = 4;
  scene.add(moonLight);
  scene.add(moonLight.target);
  const fillLight = new THREE.DirectionalLight(0xa58fe0, 0.55);
  fillLight.position.set(-40, 20, 50);
  scene.add(fillLight);

  return { moonDirection, moonLight };
}
