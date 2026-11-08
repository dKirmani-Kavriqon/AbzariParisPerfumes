import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Scent made visible: three plumes, one per note tier, curling out of the open atomiser.
// Every particle's path is computed on the GPU from a seed, so there is no per-frame CPU work.

const vertex = /* glsl */ `
  attribute float aSeed;
  attribute float aTier;
  uniform float uTime;
  uniform vec3 uReveal;
  uniform float uPixel;
  varying float vAlpha;
  varying float vTier;
  void main() {
    float speed = 0.09 + fract(aSeed * 13.7) * 0.07;
    float t = fract(uTime * speed + aSeed);
    float tierPhase = aTier * 2.094;
    float ang = aSeed * 6.2831 + t * (3.2 + aTier * 0.6) + tierPhase;
    float rad = 0.03 + t * (0.55 + 0.35 * fract(aSeed * 7.1)) ;
    vec3 p = vec3(
      cos(ang) * rad + sin(t * 5.0 + aSeed * 20.0) * 0.08 * t,
      t * (2.4 + aTier * 0.25),
      sin(ang) * rad * 0.8
    );
    // a slow lean, like air moving through a room
    p.x += t * t * 0.35 * sin(uTime * 0.2 + aTier);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float reveal = aTier < 0.5 ? uReveal.x : (aTier < 1.5 ? uReveal.y : uReveal.z);
    vAlpha = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.55, 1.0, t)) * reveal;
    vTier = aTier;
    gl_PointSize = uPixel * (6.0 + 30.0 * t) * (0.6 + fract(aSeed * 3.3)) / -mv.z;
  }
`

const fragment = /* glsl */ `
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec3 uColC;
  varying float vAlpha;
  varying float vTier;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    float soft = smoothstep(0.5, 0.0, r);
    vec3 col = vTier < 0.5 ? uColA : (vTier < 1.5 ? uColB : uColC);
    gl_FragColor = vec4(col, soft * soft * vAlpha * 0.075);
  }
`

export type VapourRig = { reveal: THREE.Vector3 }

export function NoteVapour({ rig, count = 1400 }: { rig: VapourRig; count?: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const seeds = new Float32Array(count)
    const tiers = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      seeds[i] = Math.random()
      tiers[i] = i % 3
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    g.setAttribute('aTier', new THREE.BufferAttribute(tiers, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.5, 0), 3)
    return g
  }, [count])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uReveal: { value: new THREE.Vector3() },
      uPixel: { value: 1 },
      uColA: { value: new THREE.Color('#e8c98a') }, // top: woody, balsamic, powdery
      uColB: { value: new THREE.Color('#c98a58') }, // heart: musk, spice, tobacco
      uColC: { value: new THREE.Color('#a48a6a') }, // base: oud, amber, metallic
    }),
    [],
  )

  useFrame((state) => {
    if (!mat.current) return
    mat.current.uniforms.uTime.value = state.clock.elapsedTime
    mat.current.uniforms.uReveal.value.copy(rig.reveal)
    mat.current.uniforms.uPixel.value = state.gl.getPixelRatio() * state.size.height * 0.045
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
