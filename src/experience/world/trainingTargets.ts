import * as THREE from "three";
import {
  createGlowSprite,
  type FrameTime,
  type WorldBuildContext,
  type WorldState,
} from "./buildContext";
import type { CastingCircle } from "./arena";

const CRYSTAL_COLORS = [0x94e1f3, 0xc4a0ff, 0xfadc98, 0x7ff0d0];
const WORLD_UP = new THREE.Vector3(0, 1, 0);

interface Bolt {
  head: THREE.Sprite;
  trail: THREE.Sprite[];
  start: THREE.Vector3;
  mid: THREE.Vector3;
  end: THREE.Vector3;
  progress: number;
  duration: number;
  target: THREE.Mesh | null;
  onResult?: (hit: boolean) => void;
  history: THREE.Vector3[];
}

type Shard =
  | {
      object: THREE.Mesh;
      velocity: THREE.Vector3;
      life: number;
      spin: THREE.Vector3;
      flash?: false;
    }
  | {
      object: THREE.Sprite;
      velocity: THREE.Vector3;
      life: number;
      flash: true;
    };

const quadraticBezier = (
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  t: number,
  out: THREE.Vector3,
) =>
  out
    .copy(a)
    .multiplyScalar((1 - t) * (1 - t))
    .addScaledVector(b, 2 * (1 - t) * t)
    .addScaledVector(c, t * t);

export function buildTrainingTargets(
  { scene, lowQuality, reducedMotion, glowTexture }: WorldBuildContext,
  camera: THREE.PerspectiveCamera,
  circles: CastingCircle[],
  getPortalFrame: (
    outPosition: THREE.Vector3,
    outNormal: THREE.Vector3,
  ) => THREE.Vector3,
  state: WorldState,
) {
  const crystalGeometry = new THREE.OctahedronGeometry(1, 0);
  crystalGeometry.scale(0.8, 1.5, 0.8);
  const crystals = CRYSTAL_COLORS.map((color, i) => {
    const crystal = new THREE.Mesh(
      crystalGeometry,
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.9,
        roughness: 0.15,
        metalness: 0.2,
        flatShading: true,
        transparent: true,
        opacity: 0.92,
      }),
    );
    crystal.castShadow = true;
    crystal.add(createGlowSprite(color, 0.55, 3.4, glowTexture));
    crystal.visible = false;
    scene.add(crystal);
    crystal.userData = {
      index: i,
      alive: false,
      respawnAt: 0,
    };
    return crystal;
  });
  const bolts: Bolt[] = [];
  const shards: Shard[] = [];
  const shardGeometry = new THREE.TetrahedronGeometry(0.35, 0);
  const shardMaterials = crystals.map(
    (crystal) =>
      new THREE.MeshStandardMaterial({
        color: crystal.material.color,
        emissive: crystal.material.color,
        emissiveIntensity: 1.4,
        flatShading: true,
      }),
  );

  const scratchA = new THREE.Vector3();
  const scratchB = new THREE.Vector3();
  const portalPosition = new THREE.Vector3();
  const portalNormal = new THREE.Vector3();
  const portalTangent = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();

  function placeCrystal(crystal: THREE.Mesh) {
    const data = crystal.userData;
    data.angle = Math.random() * Math.PI * 2;
    data.orbitRadius = 3 + Math.random() * 4.5;
    data.height = -1.6 + Math.random() * 5.2;
    data.orbitSpeed =
      (0.2 + Math.random() * 0.35) * (Math.random() < 0.5 ? -1 : 1);
    data.alive = true;
    data.grow = 0;
    crystal.visible = true;
  }

  function getAimRay(ndcX: number, ndcY: number) {
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    return raycaster.ray;
  }

  function pickCrystal(ray: THREE.Ray) {
    let best: (typeof crystals)[number] | null = null;
    let bestDistance = Infinity;
    crystals.forEach((crystal) => {
      if (!crystal.userData.alive || crystal.userData.grow < 0.6) return;
      crystal.getWorldPosition(scratchA);
      const distanceToRay = ray.distanceToPoint(scratchA);
      const along = scratchB.copy(scratchA).sub(ray.origin).dot(ray.direction);
      if (distanceToRay < 2.1 && along > 0 && along < bestDistance) {
        bestDistance = along;
        best = crystal;
      }
    });
    return best as (typeof crystals)[number] | null;
  }

  function shatter(crystal: (typeof crystals)[number]) {
    const data = crystal.userData;
    data.alive = false;
    crystal.visible = false;
    data.respawnAt = state.time + 1.1;
    crystal.getWorldPosition(scratchA);
    for (let k = 0; k < (lowQuality ? 8 : 16); k++) {
      const shard = new THREE.Mesh(shardGeometry, shardMaterials[data.index]);
      shard.position.copy(scratchA);
      const velocity = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() * 0.8 + 0.2,
        Math.random() - 0.5,
      )
        .normalize()
        .multiplyScalar(6 + Math.random() * 8);
      scene.add(shard);
      shards.push({
        object: shard,
        velocity,
        life: 1.2,
        spin: new THREE.Vector3(
          Math.random() * 8,
          Math.random() * 8,
          Math.random() * 8,
        ),
      });
    }
    const flash = createGlowSprite(
      crystal.material.color.getHex(),
      2.2,
      5,
      glowTexture,
    );
    flash.position.copy(scratchA);
    scene.add(flash);
    shards.push({
      object: flash,
      velocity: new THREE.Vector3(),
      life: 0.35,
      flash: true,
    });
    state.shake = Math.max(state.shake, reducedMotion ? 0 : 0.35);
  }

  function updateCrystals({ delta, elapsed, animationTime }: FrameTime) {
    getPortalFrame(portalPosition, portalNormal);
    portalTangent.set(portalNormal.z, 0, -portalNormal.x);
    portalPosition.addScaledVector(portalNormal, 5);
    crystals.forEach((crystal) => {
      const data = crystal.userData;
      if (!data.alive) {
        if (
          data.respawnAt &&
          elapsed > data.respawnAt &&
          crystal.parent &&
          state.training
        ) {
          data.respawnAt = 0;
          placeCrystal(crystal);
        }
        return;
      }
      data.grow = Math.min(1, data.grow + delta * 1.6);
      data.angle += data.orbitSpeed * delta;
      const growth = Math.max(0, data.grow);
      const eased = 1 - Math.pow(1 - growth, 3);
      crystal.position
        .copy(portalPosition)
        .addScaledVector(portalTangent, Math.sin(data.angle) * data.orbitRadius)
        .addScaledVector(
          portalNormal,
          Math.cos(data.angle) * data.orbitRadius * 0.45,
        );
      crystal.position.y +=
        data.height + Math.sin(animationTime * 1.4 + data.index) * 0.5;
      crystal.rotation.y += delta * 1.2;
      crystal.scale.setScalar(Math.max(0.001, eased));
    });
  }

  function updateBolts({ delta }: FrameTime) {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const bolt = bolts[i];
      bolt.progress += delta / bolt.duration;
      const k = Math.min(1, bolt.progress);
      if (bolt.target && bolt.target.userData.alive)
        bolt.target.getWorldPosition(bolt.end);
      quadraticBezier(bolt.start, bolt.mid, bolt.end, k, bolt.head.position);
      bolt.history.unshift(bolt.head.position.clone());
      if (bolt.history.length > bolt.trail.length * 2) bolt.history.pop();
      bolt.trail.forEach((sprite, j) => {
        const point = bolt.history[Math.min(bolt.history.length - 1, j * 2)];
        if (point) sprite.position.copy(point);
      });
      if (k >= 1) {
        const hit = !!bolt.target && bolt.target.userData.alive;
        if (hit) shatter(bolt.target as (typeof crystals)[number]);
        bolt.onResult?.(hit);
        scene.remove(bolt.head);
        bolt.trail.forEach((sprite) => scene.remove(sprite));
        bolts.splice(i, 1);
      }
    }
  }

  function updateShards({ delta }: FrameTime) {
    for (let i = shards.length - 1; i >= 0; i--) {
      const shard = shards[i];
      shard.life -= delta;
      if (shard.flash) {
        shard.object.material.opacity = Math.max(0, shard.life / 0.35);
        shard.object.scale.multiplyScalar(1 + delta * 4);
      } else {
        shard.velocity.y -= 18 * delta;
        shard.object.position.addScaledVector(shard.velocity, delta);
        shard.object.rotation.x += shard.spin.x * delta;
        shard.object.rotation.y += shard.spin.y * delta;
        shard.object.scale.setScalar(Math.max(0.01, shard.life / 1.2));
      }
      if (shard.life <= 0) {
        scene.remove(shard.object);
        shards.splice(i, 1);
      }
    }
  }

  return {
    crystals,
    getAimRay,
    startTraining() {
      crystals.forEach((crystal, i) => {
        placeCrystal(crystal);
        crystal.userData.grow = -i * 0.25;
      });
    },
    stopTraining() {
      crystals.forEach((crystal) => {
        crystal.visible = false;
        crystal.userData.alive = false;
      });
      bolts.splice(0).forEach((bolt) => {
        scene.remove(bolt.head);
        bolt.trail.forEach((sprite) => scene.remove(sprite));
      });
    },
    castBolt(
      fromCircle: number,
      ndcX: number,
      ndcY: number,
      color: number,
      onResult: (hit: boolean) => void,
    ) {
      scene.updateMatrixWorld();
      const ray = getAimRay(ndcX, ndcY);
      const target = pickCrystal(ray);
      // bolts leave from just below the viewer, alternating hands, like a wand in front of the camera
      const forward = camera.getWorldDirection(new THREE.Vector3());
      const right = new THREE.Vector3()
        .crossVectors(forward, WORLD_UP)
        .normalize();
      const start = camera.position
        .clone()
        .addScaledVector(forward, 3)
        .addScaledVector(right, fromCircle % 2 ? 0.9 : -0.9)
        .addScaledVector(WORLD_UP, -1.3);
      const end = target
        ? target.getWorldPosition(new THREE.Vector3())
        : ray.at(70, new THREE.Vector3());
      const head = createGlowSprite(color, 4, 2.2, glowTexture);
      scene.add(head);
      head.position.copy(start);
      const trail = Array.from({ length: 8 }, (_, k) => {
        const sprite = createGlowSprite(
          color,
          2.5 - k * 0.25,
          1.6 - k * 0.15,
          glowTexture,
        );
        scene.add(sprite);
        return sprite;
      });
      const mid = start.clone().lerp(end, 0.5);
      mid.y += 1.2;
      bolts.push({
        head,
        trail,
        start,
        mid,
        end,
        progress: 0,
        duration: target ? 0.28 : 0.45,
        target,
        onResult,
        history: [],
      });
      circles[fromCircle].flashTime = state.time;
    },
    update(frame: FrameTime) {
      updateCrystals(frame);
      updateBolts(frame);
      updateShards(frame);
    },
  };
}
