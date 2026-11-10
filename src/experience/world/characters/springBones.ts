import * as THREE from "three";

interface SpringJoint {
  bone: THREE.Bone;
  restQuaternion: THREE.Quaternion;
  /** Where this joint's tip sits, in the bone's own space. */
  tipLocal: THREE.Vector3;
  tipDirection: THREE.Vector3;
  length: number;
  tip: THREE.Vector3;
  previousTip: THREE.Vector3;
  stiffness: number;
}

interface SpringChainOptions {
  /** Bones from the anchored end outwards; each must be the parent of the next. */
  bones: THREE.Bone[];
  /** Tip of the last bone, in that bone's space. */
  endOffset: THREE.Vector3;
  /** How strongly the chain returns to its rest shape. */
  stiffness: number;
}

const GRAVITY = 0.55;
const DRAG = 0.38;

const toModel = new THREE.Matrix4();
const parentMatrix = new THREE.Matrix4();
const restMatrix = new THREE.Matrix4();
const inverseRest = new THREE.Matrix4();
const origin = new THREE.Vector3();
const restTip = new THREE.Vector3();
const step = new THREE.Vector3();
const localDirection = new THREE.Vector3();
const swing = new THREE.Quaternion();

/**
 * Cloth-like follow-through for chains of bones (cloaks, coat tails). Each joint's tip is a
 * damped point that lags behind the body and is pulled back to its rest shape. It runs in the
 * character's own space, so moving or scaling the character doesn't disturb it.
 */
export function createSpringBones(
  character: THREE.Object3D,
  chains: SpringChainOptions[],
) {
  const joints: SpringJoint[] = chains.flatMap(
    ({ bones, endOffset, stiffness }) =>
      bones.map((bone, i) => {
        const tipLocal =
          i + 1 < bones.length ? bones[i + 1].position.clone() : endOffset;
        return {
          bone,
          restQuaternion: bone.quaternion.clone(),
          tipLocal,
          tipDirection: tipLocal.clone().normalize(),
          length: tipLocal.length(),
          tip: new THREE.Vector3(),
          previousTip: new THREE.Vector3(),
          stiffness,
        };
      }),
  );
  let isSettled = false;

  return {
    /** Snaps every chain to its rest shape on the next update. */
    reset() {
      isSettled = false;
    },

    /** Call after the animation has posed the skeleton and its world matrices are current. */
    update(delta: number, wind: THREE.Vector3) {
      if (delta <= 0) return;
      toModel.copy(character.matrixWorld).invert();
      for (const joint of joints) {
        const { bone } = joint;
        parentMatrix.multiplyMatrices(toModel, bone.parent!.matrixWorld);
        restMatrix
          .compose(bone.position, joint.restQuaternion, bone.scale)
          .premultiply(parentMatrix);
        origin.setFromMatrixPosition(restMatrix);
        restTip.copy(joint.tipLocal).applyMatrix4(restMatrix);
        if (!isSettled) {
          joint.tip.copy(restTip);
          joint.previousTip.copy(restTip);
        }

        step.subVectors(joint.tip, joint.previousTip).multiplyScalar(1 - DRAG);
        joint.previousTip.copy(joint.tip);
        joint.tip.add(step);
        step.subVectors(restTip, origin).normalize();
        joint.tip.addScaledVector(step, joint.stiffness * delta);
        joint.tip.y -= GRAVITY * delta;
        joint.tip.addScaledVector(wind, delta);
        // keep the joint its own length
        step.subVectors(joint.tip, origin).normalize();
        joint.tip.copy(origin).addScaledVector(step, joint.length);

        inverseRest.copy(restMatrix).invert();
        localDirection.copy(joint.tip).applyMatrix4(inverseRest).normalize();
        swing.setFromUnitVectors(joint.tipDirection, localDirection);
        bone.quaternion.copy(joint.restQuaternion).multiply(swing);
        bone.updateMatrix();
        bone.matrixWorld.multiplyMatrices(bone.parent!.matrixWorld, bone.matrix);
      }
      isSettled = true;
    },
  };
}

export type SpringBones = ReturnType<typeof createSpringBones>;
