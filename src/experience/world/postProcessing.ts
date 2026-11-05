import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

/** Ambient occlusion: contact darkening where stone meets stone, leaving out glow sprites and particles. */
class StoneAmbientOcclusionPass extends GTAOPass {
  /** Overrides an internal GTAOPass hook that isn't in the published types. */
  _overrideVisibility() {
    const hiddenObjects = (
      this as unknown as { _visibilityCache: THREE.Object3D[] }
    )._visibilityCache;
    this.scene.traverse((object) => {
      const { isPoints, isLine, isSprite, material } =
        object as THREE.Object3D & {
          isPoints?: boolean;
          isLine?: boolean;
          isSprite?: boolean;
          material?: THREE.Material & { isShaderMaterial?: boolean };
        };
      if (
        object.visible &&
        (isPoints ||
          isLine ||
          isSprite ||
          (material &&
            (material.transparent ||
              material.depthWrite === false ||
              material.isShaderMaterial)))
      ) {
        object.visible = false;
        hiddenObjects.push(object);
      }
    });
  }
}

export function createRenderPipeline(
  canvas: HTMLCanvasElement,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  lowQuality: boolean,
) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !lowQuality,
    powerPreference: "high-performance",
  });
  const maxPixelRatio = lowQuality ? 1.25 : 1.5;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = !lowQuality;
  renderer.shadowMap.type = THREE.PCFShadowMap; // soft by default since three r182

  // HDR, multisampled render target so edges stay clean through post-processing
  const renderTarget = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
    type: THREE.HalfFloatType,
    samples: lowQuality ? 0 : 4,
  });
  const composer = new EffectComposer(renderer, renderTarget);
  composer.addPass(new RenderPass(scene, camera));

  let ambientOcclusionPass: StoneAmbientOcclusionPass | null = null;
  if (!lowQuality) {
    ambientOcclusionPass = new StoneAmbientOcclusionPass(
      scene,
      camera,
      innerWidth,
      innerHeight,
    );
    ambientOcclusionPass.updateGtaoMaterial({
      radius: 2.2,
      distanceExponent: 1.6,
      thickness: 3,
      scale: 1.25,
      samples: 16,
      distanceFallOff: 1,
      screenSpaceRadius: false,
    });
    ambientOcclusionPass.updatePdMaterial({
      lumaPhi: 10,
      depthPhi: 2,
      normalPhi: 3,
      radius: 6,
      radiusExponent: 1,
      rings: 2,
      samples: 16,
    });
    ambientOcclusionPass.blendIntensity = 0.85;
    composer.addPass(ambientOcclusionPass);
  }
  composer.addPass(
    new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.86),
  );

  const gradePass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
    vertexShader:
      "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
      float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        c.rgb = mix(c.rgb * vec3(0.93, 0.95, 1.08), c.rgb * vec3(1.05, 1.0, 0.93), smoothstep(0.04, 0.9, l));
        c.rgb = max(mix(vec3(l), c.rgb, 1.05), 0.0);
        vec2 v = vUv - 0.5; c.rgb *= 1.0 - dot(v, v) * 0.5;
        c.rgb += (hh(vUv * vec2(1931.0, 1087.0) + fract(uTime) * 91.7) - 0.5) * 0.01 * (0.3 + l);
        gl_FragColor = c; }`,
  });
  composer.addPass(gradePass);
  composer.addPass(new OutputPass());

  function resize() {
    const width = innerWidth;
    const height = innerHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.fov = width / height < 0.8 ? 64 : 50;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  return {
    renderer,
    composer,
    maxPixelRatio,
    getPixelRatio: () => pixelRatio,
    setPixelRatio(value: number) {
      if (value !== pixelRatio) {
        pixelRatio = value;
        resize();
      }
    },
    setGradeTime(time: number) {
      gradePass.uniforms.uTime.value = time;
    },
    setAmbientOcclusion(enabled: boolean) {
      if (ambientOcclusionPass) ambientOcclusionPass.enabled = enabled;
    },
    isAmbientOcclusionOn: () => !!ambientOcclusionPass?.enabled,
    dispose() {
      window.removeEventListener("resize", resize);
      composer.dispose();
      renderer.dispose();
    },
  };
}
