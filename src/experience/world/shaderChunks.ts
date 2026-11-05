/** Custom shaders write display-referred colours; this converts them to linear for the HDR pipeline. */
export const TO_LINEAR_GLSL = `vec3 toLin(vec3 c){ return pow(max(c, vec3(0.0)), vec3(2.2)); }`;

export const createNoiseGlsl = (
  lowQuality: boolean,
) => `float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float vn3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < ${lowQuality ? 3 : 5}; i++){ s += a * vn3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }`;

export const UV_VERTEX_GLSL = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

export const DIRECTION_VERTEX_GLSL = `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
