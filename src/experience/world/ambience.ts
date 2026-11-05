import * as THREE from "three";
import {
  hdrColor,
  type FrameTime,
  type WorldBuildContext,
} from "./buildContext";
import { canvasToTexture, createShootingStarTexture } from "./canvasTextures";
import type { WorldMaterials } from "./materials";
import { createRockGeometry } from "./proceduralGeometry";
import { createCloudCanvas } from "./proceduralTextures";
import { createNoiseGlsl, TO_LINEAR_GLSL } from "./shaderChunks";

const ADDITIVE = THREE.AdditiveBlending;

export function buildDebrisRing(
  { scene, lowQuality, noise, random }: WorldBuildContext,
  materials: WorldMaterials,
  arena: THREE.Group,
) {
  const rand = random.next;
  const DEBRIS_COUNT = lowQuality ? 16 : 32;
  const stretches: [number, number, number][] = [
    [1, 0.7, 1.25],
    [1.1, 0.55, 0.9],
    [0.8, 1.0, 0.85],
    [1.3, 0.6, 1.0],
  ];
  const meshes = stretches.map((stretch, k) => {
    const mesh = new THREE.InstancedMesh(
      createRockGeometry(noise, {
        detail: lowQuality ? 2 : 3,
        seed: 40 + k * 5,
        cuts: 5 + k,
        stretch,
        amplitude: 0.3,
      }),
      materials.boulder,
      DEBRIS_COUNT / 4,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  });
  const rocks = Array.from({ length: DEBRIS_COUNT }, (_, i) => ({
    mesh: meshes[i % 4],
    instanceIndex: Math.floor(i / 4),
    angle: rand() * 6.28,
    radius: 20 + rand() * 11,
    y: -7 + rand() * 13,
    orbitSpeed: 0.04 + rand() * 0.07,
    phase: rand() * 6.28,
    size: 0.3 + Math.pow(rand(), 2.2) * 1.9,
    rotationX: rand() * 6,
    rotationY: rand() * 6,
    rotationZ: rand() * 6,
    spin: 0.1 + rand() * 0.25,
  }));
  const placement = new THREE.Object3D();

  return function updateDebris({
    delta,
    animationTime,
    motionScale,
  }: FrameTime) {
    rocks.forEach((rock) => {
      rock.angle += rock.orbitSpeed * delta * motionScale * 0.5;
      placement.position.set(
        Math.sin(rock.angle) * rock.radius,
        arena.position.y +
          rock.y +
          Math.sin(animationTime * 0.8 + rock.phase) * 0.8,
        Math.cos(rock.angle) * rock.radius,
      );
      placement.rotation.set(
        rock.rotationX + animationTime * rock.spin,
        rock.rotationY + animationTime * rock.spin * 0.7,
        rock.rotationZ,
      );
      placement.scale.setScalar(rock.size);
      placement.updateMatrix();
      rock.mesh.setMatrixAt(rock.instanceIndex, placement.matrix);
    });
    meshes.forEach((mesh) => {
      mesh.instanceMatrix.needsUpdate = true;
    });
  };
}

export function buildDragons(
  { scene }: WorldBuildContext,
  materials: WorldMaterials,
) {
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.9);
  wingShape.lineTo(2.6, 1.7);
  wingShape.lineTo(7.6, 0.5);
  wingShape.quadraticCurveTo(6.4, -0.4, 5.8, -1.7);
  wingShape.quadraticCurveTo(4.6, -0.7, 3.7, -1.6);
  wingShape.quadraticCurveTo(2.6, -0.5, 1.5, -1.3);
  wingShape.quadraticCurveTo(0.8, -0.6, 0, -1.0);
  wingShape.lineTo(0, 0.9);
  const wingGeometry = new THREE.ShapeGeometry(wingShape, 8);
  wingGeometry.rotateX(-Math.PI / 2);
  const bodyGeometry = new THREE.LatheGeometry(
    (
      [
        [0, -3.2],
        [0.25, -2.8],
        [0.6, -1.6],
        [0.85, 0],
        [0.7, 1.4],
        [0.45, 2.4],
        [0.5, 3.0],
        [0.3, 3.8],
        [0, 4.2],
      ] as const
    ).map(([x, y]) => new THREE.Vector2(x, y)),
    8,
  );
  bodyGeometry.rotateX(Math.PI / 2);
  const tailGeometry = new THREE.ConeGeometry(0.28, 6, 6);
  tailGeometry.rotateX(-Math.PI / 2);
  tailGeometry.translate(0, 0, -6);

  /** [center x, y, z, flight radius, speed, scale] */
  const flightPaths: [number, number, number, number, number, number][] = [
    [0, 60, -150, 120, 0.09, 1.1],
    [30, 75, -220, 160, -0.06, 0.8],
    [-40, 45, -120, 90, 0.11, 0.7],
  ];
  const dragons = flightPaths.map(
    ([centerX, centerY, centerZ, radius, speed, scale], i) => {
      const body = new THREE.Group();
      body.add(new THREE.Mesh(bodyGeometry, materials.dragon));
      body.add(new THREE.Mesh(tailGeometry, materials.dragon));
      const leftWing = new THREE.Mesh(wingGeometry, materials.dragon);
      const rightWing = new THREE.Mesh(wingGeometry, materials.dragon);
      leftWing.position.z = 0.6;
      rightWing.position.z = 0.6;
      rightWing.scale.x = -1;
      body.add(leftWing);
      body.add(rightWing);
      body.scale.setScalar(scale);
      scene.add(body);
      return {
        body,
        leftWing,
        rightWing,
        centerX,
        centerY,
        centerZ,
        radius,
        speed,
        angle: i * 2.1,
      };
    },
  );

  return function updateDragons({
    delta,
    animationTime,
    motionScale,
  }: FrameTime) {
    dragons.forEach((dragon) => {
      dragon.angle += dragon.speed * delta * motionScale;
      const x = dragon.centerX + Math.cos(dragon.angle) * dragon.radius;
      const z = dragon.centerZ + Math.sin(dragon.angle) * dragon.radius;
      const y = dragon.centerY + Math.sin(dragon.angle * 2) * 4;
      const nextAngle = dragon.angle + Math.sign(dragon.speed) * 0.05;
      dragon.body.position.set(x, y, z);
      dragon.body.lookAt(
        dragon.centerX + Math.cos(nextAngle) * dragon.radius,
        dragon.centerY + Math.sin(nextAngle * 2) * 4,
        dragon.centerZ + Math.sin(nextAngle) * dragon.radius,
      );
      const flap = Math.sin(animationTime * 3.2 + dragon.centerX) * 0.65;
      dragon.leftWing.rotation.z = flap;
      dragon.rightWing.rotation.z = -flap;
    });
  };
}

export function buildSkyLife(
  context: WorldBuildContext,
  moonDirection: THREE.Vector3,
) {
  const { scene, lowQuality, reducedMotion, glowTexture, timedMaterials } =
    context;
  const rand = context.random.next;

  const cloudTextures = [5, 9, 13].map((seed) =>
    canvasToTexture(createCloudCanvas(seed, lowQuality ? 128 : 256)),
  );
  const clouds = Array.from({ length: lowQuality ? 45 : 80 }, (_, i) => {
    const isLow = i < (lowQuality ? 32 : 58);
    const cloud = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: cloudTextures[i % 3],
        color: isLow ? 0x9d8ccc : 0xc4b8ee,
        transparent: true,
        opacity: isLow ? 0.62 : 0.3,
        depthWrite: false,
      }),
    );
    cloud.material.rotation = (rand() - 0.5) * 0.15;
    const size = (isLow ? 44 : 30) + rand() * 50;
    cloud.scale.set(size, size * 0.55, 1);
    cloud.position.set(
      -240 + rand() * 480,
      isLow ? -36 + rand() * 16 : 2 + rand() * 30,
      -280 + rand() * 320,
    );
    cloud.userData.driftSpeed = 0.6 + rand() * 1.4;
    scene.add(cloud);
    return cloud;
  });

  const cloudSeaMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uMoon: { value: moonDirection } },
    vertexShader:
      "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `${TO_LINEAR_GLSL} ${createNoiseGlsl(lowQuality)} uniform float uTime; uniform vec3 uMoon; varying vec3 vW;
      void main(){
        vec3 q = vec3(vW.xz * 0.011 + vec2(uTime * 0.008, uTime * 0.003), uTime * 0.012);
        float d = fbm3(q); float dl = fbm3(q + vec3(uMoon.x, 0.0, uMoon.z) * 0.06);
        float den = smoothstep(0.32, 0.72, d);
        float lit = clamp(0.55 + (d - dl) * 3.5, 0.15, 1.25);
        vec3 c = mix(vec3(0.13, 0.11, 0.28), vec3(0.62, 0.56, 0.86), den * lit);
        float fade = 1.0 - smoothstep(380.0, 860.0, length(vW.xz));
        gl_FragColor = vec4(toLin(c), (0.35 + den * 0.6) * fade); }`,
  });
  const cloudSea = new THREE.Mesh(
    new THREE.PlaneGeometry(1800, 1800, 1, 1),
    cloudSeaMaterial,
  );
  cloudSea.rotation.x = -Math.PI / 2;
  cloudSea.position.y = -52;
  scene.add(cloudSea);
  timedMaterials.push(cloudSeaMaterial);

  const MOTE_COUNT = lowQuality ? 260 : 500;
  const motePositions = new Float32Array(MOTE_COUNT * 3);
  const moteColors = new Float32Array(MOTE_COUNT * 3);
  const moteMotion: { speed: number; phase: number }[] = [];
  const motePalette = [
    hdrColor(0xfadc98, 2),
    hdrColor(0x94e1f3, 2),
    hdrColor(0xc4b2ff, 2),
  ];
  for (let i = 0; i < MOTE_COUNT; i++) {
    const angle = rand() * 6.28;
    const distance = 4 + rand() * 48;
    motePositions.set(
      [
        Math.sin(angle) * distance,
        -30 + rand() * 70,
        Math.cos(angle) * distance - 10,
      ],
      i * 3,
    );
    const color = motePalette[i % 3];
    moteColors.set([color.r, color.g, color.b], i * 3);
    moteMotion.push({ speed: 0.8 + rand() * 2.2, phase: rand() * 6.28 });
  }
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(motePositions, 3),
  );
  moteGeometry.setAttribute("color", new THREE.BufferAttribute(moteColors, 3));
  scene.add(
    new THREE.Points(
      moteGeometry,
      new THREE.PointsMaterial({
        size: 0.9,
        map: glowTexture,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: ADDITIVE,
      }),
    ),
  );

  const shootingStar = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 0.7),
    new THREE.MeshBasicMaterial({
      map: createShootingStarTexture(),
      color: hdrColor(0xffffff, 2),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: ADDITIVE,
      fog: false,
    }),
  );
  const shootingDirection = new THREE.Vector3(1, -0.4, 0).normalize();
  shootingStar.rotation.z = Math.atan2(
    shootingDirection.y,
    shootingDirection.x,
  );
  scene.add(shootingStar);
  let shootingStarAge = -1;
  let nextShootingStarAt = 3;

  return function updateSkyLife({
    delta,
    elapsed,
    animationTime,
    motionScale,
  }: FrameTime) {
    clouds.forEach((cloud) => {
      cloud.position.x += cloud.userData.driftSpeed * delta * motionScale;
      if (cloud.position.x > 240) cloud.position.x = -240;
    });
    const positions = moteGeometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < MOTE_COUNT; i++) {
      let y = positions.getY(i) + moteMotion[i].speed * delta * motionScale;
      if (y > 40) y = -30;
      positions.setY(i, y);
      positions.setX(
        i,
        positions.getX(i) +
          Math.sin(animationTime * 0.7 + moteMotion[i].phase) * 0.01,
      );
    }
    positions.needsUpdate = true;

    if (!reducedMotion) {
      if (shootingStarAge < 0 && elapsed > nextShootingStarAt) {
        shootingStarAge = 0;
        shootingStar.position.set(-200 + rand() * 260, 150 + rand() * 60, -380);
      }
      if (shootingStarAge >= 0) {
        shootingStarAge += delta;
        shootingStar.position.addScaledVector(shootingDirection, 230 * delta);
        shootingStar.material.opacity = Math.sin(
          Math.min(shootingStarAge / 1.1, 1) * Math.PI,
        );
        if (shootingStarAge > 1.1) {
          shootingStarAge = -1;
          shootingStar.material.opacity = 0;
          nextShootingStarAt = elapsed + 4 + rand() * 5;
        }
      }
    }
  };
}
