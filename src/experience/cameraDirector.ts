import * as THREE from "three";
import type { ExperienceContext } from "./experienceContext";
import type { World } from "./world/createWorld";

const MOVE_SECONDS = 1.7;
const INTRO_SECONDS = 4.2;
const CIRCLE_IGNITE_TIMES = [1.8, 2.2, 2.6, 3.0];
const ORB_IGNITE_TIME = 3.5;
const INTRO_CAMERA_FROM = { x: -14, y: 34, z: 92 };
const INTRO_CAMERA_LOOK = { x: 0, y: 14, z: -50 };
const REDUCED_MOTION_VIEW = {
  from: { x: 0, y: 16.5, z: 44 },
  look: { x: 0, y: 4, z: -3 },
};

const easeInOutCubic = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const isNarrow = () => innerWidth <= 760;

export function createCameraDirector(context: ExperienceContext) {
  const { lifecycle, device, sound } = context;
  let mode: "intro" | "move" | "idle" = "intro";
  let moveStart = 0;
  let moveFromPosition = new THREE.Vector3();
  let moveFromLook = new THREE.Vector3();
  let moveSeconds = MOVE_SECONDS;
  const currentLook = new THREE.Vector3();
  const shotPosition = new THREE.Vector3();
  const shotLook = new THREE.Vector3();
  /** Scratch copy of the portal's position for the join shot, reused every frame. */
  const portalPoint = new THREE.Vector3();

  const circlesIgnited = [false, false, false, false];
  let orbIgnited = false;
  const markIntroFinished = () => {
    circlesIgnited.fill(true);
    orbIgnited = true;
  };

  const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
  lifecycle.listen<PointerEvent>(window, "pointermove", (event) => {
    mouse.targetX = event.clientX / innerWidth - 0.5;
    mouse.targetY = event.clientY / innerHeight - 0.5;
  });

  function computeShot(
    world: World,
    time: number,
    position: THREE.Vector3,
    look: THREE.Vector3,
  ) {
    const name = context.screen;
    const mouseX = mouse.x;
    const mouseY = mouse.y;
    if (name === "title") {
      const angle = Math.sin(time * 0.05) * 0.2 + mouseX * 0.16;
      position.set(
        Math.sin(angle) * 44,
        16.5 + Math.sin(time * 0.13) * 1.2 - mouseY * 4,
        Math.cos(angle) * 44,
      );
      look.set(mouseX * 3, 4 - mouseY * 1.5, -3);
    } else if (name === "lobby" || name === "training") {
      // Spell practice watches the same arena as the lobby, so each wizard can be seen casting.
      if (isNarrow()) {
        position.set(Math.sin(time * 0.06) * 2, 46, 30);
        look.set(0, -8, -2);
      } else {
        position.set(
          6 + Math.sin(time * 0.06) * 2 + mouseX * 2,
          36 - mouseY * 2,
          36,
        );
        look.set(-11, 0, -1);
      }
    } else if (name === "join") {
      world.getPortalPosition(look);
      const portal = portalPoint.copy(look);
      if (isNarrow()) {
        position.set(
          portal.x + 16,
          portal.y + 6 + Math.sin(time * 0.1) * 0.6,
          portal.z + 22,
        );
        look.set(portal.x, portal.y - 4, portal.z);
      } else {
        position.set(
          portal.x + 20 + mouseX * 2,
          portal.y + 4 + Math.sin(time * 0.1) * 0.6 - mouseY,
          portal.z + 18,
        );
        look.set(portal.x + 6, portal.y, portal.z - 4);
      }
    }
  }

  return {
    openingView: () =>
      device.prefersReducedMotion
        ? REDUCED_MOTION_VIEW
        : { from: INTRO_CAMERA_FROM, look: INTRO_CAMERA_LOOK },

    prepareIntro(world: World) {
      currentLook.set(
        INTRO_CAMERA_LOOK.x,
        INTRO_CAMERA_LOOK.y,
        INTRO_CAMERA_LOOK.z,
      );
      world.setCirclesLit([0, 0, 0, 0]);
      world.state.orbTarget = 0.15;
      if (device.prefersReducedMotion) {
        mode = "idle";
        world.setCirclesLit([1, 1, 1, 1]);
        world.state.orbTarget = 1;
        markIntroFinished();
      }
    },

    /** Leaving the title screen early finishes the intro's orb ignition straight away. */
    skipIntroIfRunning() {
      if (context.world && !orbIgnited) {
        markIntroFinished();
        context.world.state.orbTarget = 1;
      }
    },

    beginMoveToCurrentScreen(world: World) {
      mode = "move";
      moveStart = world.state.time;
      moveFromPosition = world.camera.position.clone();
      moveFromLook = currentLook.clone();
      moveSeconds = device.prefersReducedMotion ? 0.01 : MOVE_SECONDS;
    },

    easeMouse() {
      mouse.x += (mouse.targetX - mouse.x) * 0.04;
      mouse.y += (mouse.targetY - mouse.y) * 0.04;
    },

    updateIntroIgnition(world: World, time: number) {
      if (mode !== "intro") return;
      CIRCLE_IGNITE_TIMES.forEach((igniteAt, i) => {
        if (!circlesIgnited[i] && time > igniteAt) {
          circlesIgnited[i] = true;
          world.setCirclesLit(circlesIgnited);
          sound.ignite();
        }
      });
      if (!orbIgnited && time > ORB_IGNITE_TIME) {
        orbIgnited = true;
        world.state.orbTarget = 1;
        world.triggerShockwave(1);
        sound.surge();
      }
    },

    updateCamera(world: World, time: number) {
      const { camera, state } = world;
      computeShot(world, time, shotPosition, shotLook);
      if (mode === "intro") {
        const k = Math.min(time / INTRO_SECONDS, 1);
        const eased = easeInOutCubic(k);
        camera.position.set(
          INTRO_CAMERA_FROM.x + (shotPosition.x - INTRO_CAMERA_FROM.x) * eased,
          INTRO_CAMERA_FROM.y + (shotPosition.y - INTRO_CAMERA_FROM.y) * eased,
          INTRO_CAMERA_FROM.z + (shotPosition.z - INTRO_CAMERA_FROM.z) * eased,
        );
        currentLook.set(
          INTRO_CAMERA_LOOK.x + (shotLook.x - INTRO_CAMERA_LOOK.x) * eased,
          INTRO_CAMERA_LOOK.y + (shotLook.y - INTRO_CAMERA_LOOK.y) * eased,
          INTRO_CAMERA_LOOK.z + (shotLook.z - INTRO_CAMERA_LOOK.z) * eased,
        );
        if (k >= 1) mode = "idle";
      } else if (mode === "move") {
        const k = Math.min((time - moveStart) / moveSeconds, 1);
        const eased = easeInOutCubic(k);
        camera.position.lerpVectors(moveFromPosition, shotPosition, eased);
        // lift the path into a gentle arc
        camera.position.y += Math.sin(k * Math.PI) * 4;
        currentLook.lerpVectors(moveFromLook, shotLook, eased);
        if (k >= 1) mode = "idle";
      } else {
        camera.position.lerp(shotPosition, 0.06);
        currentLook.lerp(shotLook, 0.08);
      }
      if (state.shake > 0) {
        camera.position.x += (Math.random() - 0.5) * state.shake;
        camera.position.y += (Math.random() - 0.5) * state.shake;
        state.shake *= 0.88;
        if (state.shake < 0.01) state.shake = 0;
      }
      camera.lookAt(currentLook);
    },
  };
}

export type CameraDirector = ReturnType<typeof createCameraDirector>;
