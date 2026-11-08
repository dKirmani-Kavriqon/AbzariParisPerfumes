import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SPRAY_BURST, SPRAY_PERIOD } from './spray'

// The atomiser's spritz, simulated on the GPU. Every droplet is launched from the nozzle in
// a narrow cone, slowed by air drag (closed-form exponential decay, so no per-frame CPU work),
// then drifts, spreads and fades as a mist. Fine droplets catch the light white; the mist
// takes the colour of the note tier being shown.

const vertex = /* glsl */ `
  attribute float aSeed;
  attribute float aTier;
  uniform float uTime;
  uniform vec3 uOrigin;
  uniform vec3 uDir;
  uniform vec3 uActive;
  uniform float uPixel;
  uniform float uPeriod;
  uniform float uBurst;
  varying float vAlpha;
  varying float vAge;
  varying float vTier;

  float h(float n) { return fract(sin(n) * 43758.5453); }

  void main() {
    float birth = h(aSeed * 11.0) * uBurst;
    float age = mod(uTime - birth, uPeriod);

    vec3 side = normalize(cross(uDir, vec3(0.0, 1.0, 0.0)));
    vec3 up = normalize(cross(side, uDir));
    float cone = 0.26 * sqrt(h(aSeed * 3.1));
    float ang = h(aSeed * 7.7) * 6.2831;
    vec3 d = normalize(uDir + side * cos(ang) * cone + up * sin(ang) * cone);

    float v0 = 2.5 + h(aSeed * 5.3) * 7.5;   // launch speed
    float k = 4.0 + h(aSeed * 9.1) * 2.5;    // air drag
    float travel = v0 / k * (1.0 - exp(-k * age));
    vec3 p = uOrigin + d * travel;

    // once slowed, the mist billows, rises a little in warm air and spreads
    float drift = smoothstep(0.15, 2.0, age);
    p += vec3(
      sin(age * 1.6 + aSeed * 40.0),
      cos(age * 1.2 + aSeed * 23.0) * 0.6 + 0.5,
      sin(age * 1.1 + aSeed * 11.0)
    ) * 0.55 * drift * (0.4 + h(aSeed * 2.3));
    // the cloud keeps spreading outward from the jet's axis as it diffuses
    p += (side * cos(ang) + up * sin(ang)) * drift * 0.45 * h(aSeed * 6.6);
    p.y -= age * age * 0.03;  // the heaviest droplets sink

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float on = aTier < 0.5 ? uActive.x : (aTier < 1.5 ? uActive.y : uActive.z);
    vAlpha = smoothstep(0.0, 0.02, age) * (1.0 - smoothstep(0.9, 2.4, age)) * on;
    vAge = age;
    vTier = aTier;
    float size = mix(1.2, 26.0 + 40.0 * h(aSeed * 4.4), smoothstep(0.0, 1.6, age));
    gl_PointSize = uPixel * size / -mv.z;
  }
`

const fragment = /* glsl */ `
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec3 uColC;
  varying float vAlpha;
  varying float vAge;
  varying float vTier;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float soft = smoothstep(0.5, 0.0, r);
    vec3 tint = vTier < 0.5 ? uColA : (vTier < 1.5 ? uColB : uColC);
    float droplet = 1.0 - smoothstep(0.0, 0.35, vAge);
    vec3 col = mix(tint, vec3(1.0, 0.97, 0.9), droplet * 0.8);
    float a = soft * soft * vAlpha * mix(0.022, 0.45, droplet * droplet);
    gl_FragColor = vec4(col, a);
  }
`

export type SprayRig = { origin: THREE.Vector3; dir: THREE.Vector3; active: THREE.Vector3 }

export function SprayMist({ rig, count = 3000 }: { rig: SprayRig; count?: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const seeds = new Float32Array(count)
    const tiers = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      seeds[i] = (i * 0.6180339887) % 1 // golden-ratio spread: deterministic, evenly mixed
      tiers[i] = i % 3
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    g.setAttribute('aTier', new THREE.BufferAttribute(tiers, 1))
    return g
  }, [count])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOrigin: { value: new THREE.Vector3() },
      uDir: { value: new THREE.Vector3(-1, 0, 0) },
      uActive: { value: new THREE.Vector3() },
      uPixel: { value: 1 },
      uPeriod: { value: SPRAY_PERIOD },
      uBurst: { value: SPRAY_BURST },
      uColA: { value: new THREE.Color('#ead2a0') }, // top: woody, balsamic, powdery
      uColB: { value: new THREE.Color('#d9a27a') }, // heart: musk, spice, tobacco
      uColC: { value: new THREE.Color('#b9a58a') }, // base: oud, amber, metallic
    }),
    [],
  )

  useFrame((state) => {
    const m = mat.current
    if (!m) return
    m.uniforms.uTime.value = state.clock.elapsedTime
    m.uniforms.uOrigin.value.copy(rig.origin)
    m.uniforms.uDir.value.copy(rig.dir)
    m.uniforms.uActive.value.copy(rig.active)
    m.uniforms.uPixel.value = state.gl.getPixelRatio() * state.size.height * 0.03
  })

  return (
    <points geometry={geo} frustumCulled={false}>
      <shaderMaterial
        ref={mat}
        vertexShader={vertex}
        fragmentShader={fragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
