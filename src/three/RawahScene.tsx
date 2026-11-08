import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import { Bottle, type BottleRig } from './Bottle'
import { NoteVapour, type VapourRig } from './NoteVapour'
import { easeInOut, motion, range, window4 } from './motion'

// Scroll choreography for the Rawah story. Progress p runs 0..1 over the pinned section.
//   0.00 to 0.12  arrival, slow breathing turn
//   0.12 to 0.34  one full 360 turn so the label passes the camera
//   0.34 to 0.46  the cap unscrews and lifts
//   0.46 to 0.64  top notes rise
//   0.62 to 0.80  heart notes
//   0.78 to 0.94  base notes
//   0.92 to 1.00  cap returns, the bottle settles for purchase

function Choreography() {
  const group = useRef<THREE.Group>(null)
  const plume = useRef<THREE.Group>(null)
  const smooth = useRef(0)
  const drag = useRef({ x: 0, y: 0 })
  const rig = useMemo<BottleRig>(() => ({ cap: 0, push: 0, swing: 1.5 }), [])
  const vapour = useMemo<VapourRig>(() => ({ reveal: new THREE.Vector3() }), [])
  const { camera, size } = useThree()
  const look = useMemo(() => new THREE.Vector3(), [])
  const narrow = size.width < 820

  useFrame((state, dt) => {
    const g = group.current
    if (!g) return
    const k = 1 - Math.exp(-dt * 5)
    smooth.current += (motion.progress - smooth.current) * k
    const p = smooth.current
    const t = state.clock.elapsedTime

    drag.current.y += (motion.dragY - drag.current.y) * (1 - Math.exp(-dt * 8))
    drag.current.x += (motion.dragX - drag.current.x) * (1 - Math.exp(-dt * 8))

    const spin = easeInOut(range(p, 0.12, 0.34)) * Math.PI * 2
    const idle = motion.reduced ? 0 : Math.sin(t * 0.45) * 0.22
    g.rotation.y = -0.35 + spin + idle * (1 - range(p, 0.1, 0.14)) + drag.current.y
    g.rotation.x = drag.current.x * 0.6 + (motion.reduced ? 0 : Math.sin(t * 0.7) * 0.02)
    g.rotation.z = motion.reduced ? 0 : Math.sin(t * 0.5) * 0.015

    // the bottle steps aside for copy during the notes, then comes back to centre
    const aside = range(p, 0.4, 0.5)
    const xShift = narrow ? 0 : aside * 1.25
    g.position.x = xShift
    g.position.y = (motion.reduced ? 0 : Math.sin(t * 0.9) * 0.025) - (narrow ? aside * 0.55 : 0)

    rig.swing = narrow ? 0.85 : 1.5
    rig.cap = Math.min(easeInOut(range(p, 0.34, 0.46)), 1 - easeInOut(range(p, 0.9, 0.97)))

    const top = window4(p, 0.44, 0.5, 0.62, 0.68)
    const heart = window4(p, 0.6, 0.66, 0.78, 0.84)
    const base = window4(p, 0.76, 0.82, 0.92, 0.96)
    vapour.reveal.set(top, heart, base)
    if (plume.current) {
      plume.current.position.set(g.position.x, g.position.y + 1.05, 0)
      plume.current.visible = top + heart + base > 0.001
    }

    // camera: arrives close, pulls back and up to frame the plume
    const arrive = range(t, 0, 2.2)
    const lift = window4(p, 0.38, 0.5, 0.9, 0.98)
    const camZ = (narrow ? 11.5 : 8.4) + (1 - easeInOut(arrive)) * 2.5 + lift * 1.4
    camera.position.set(lift * -0.15, 0.9 + lift * 0.9, camZ)
    look.set(xShift * 0.55, (narrow ? 0.95 : 1.18) + lift * 0.5, 0)
    camera.lookAt(look)
  })

  return (
    <>
      <group ref={group}>
        <Bottle liquid="#c99a2e" name="Rawah" rig={rig} />
      </group>
      <group ref={plume}>
        <NoteVapour rig={vapour} />
      </group>
      <ContactShadows position={[0, -0.71, 0]} scale={6} blur={2.6} opacity={0.65} far={1.4} color="#000" />
    </>
  )
}

// Warm halo behind the flacon. Lives in the scene (not CSS) so the glass refracts it.
function Halo() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        depthWrite: false,
        uniforms: {},
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `varying vec2 vUv;
          void main(){
            float d = length((vUv - 0.5) * vec2(1.0, 1.25));
            vec3 c = mix(vec3(0.028, 0.017, 0.006), vec3(0.0035, 0.0028, 0.002), smoothstep(0.0, 0.5, d));
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  )
  return (
    <mesh position={[0, 0.6, -4]} material={mat}>
      <planeGeometry args={[11, 8]} />
    </mesh>
  )
}

function Lights() {
  return (
    <>
      <color attach="background" args={['#0b0907']} />
      <Halo />
      <ambientLight intensity={0.15} />
      <directionalLight position={[-3, 4, 3]} intensity={1.4} color="#fff2dc" />
      <pointLight position={[2.5, 0.5, -2]} intensity={14} color="#ffb85c" distance={8} />
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#0b0907']} />
        {/* tall softbox key, left */}
        <Lightformer form="rect" intensity={3.2} color="#fff4e2" position={[-4, 1.5, 3]} scale={[2.5, 7, 1]} target={[0, 0, 0]} />
        {/* strip rim, right, for the edge highlight on the glass */}
        <Lightformer form="rect" intensity={4} color="#ffd9a0" position={[4.5, 0.5, -1]} scale={[0.6, 6, 1]} target={[0, 0, 0]} />
        {/* thin front strips: streak highlights that make the empty glass read as glass */}
        <Lightformer form="rect" intensity={2.2} color="#fff8ec" position={[-1.6, 1, 5]} scale={[0.25, 5, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.2} color="#fff8ec" position={[1.2, 1.2, 5]} scale={[0.12, 4, 1]} target={[0, 0, 0]} />
        {/* top panel */}
        <Lightformer form="rect" intensity={0.5} color="#ffffff" position={[0, 5, 0]} scale={[6, 2, 1]} rotation-x={Math.PI / 2} />
        {/* warm floor bounce */}
        <Lightformer form="circle" intensity={0.8} color="#c98b3a" position={[0, -4, 1]} scale={4} rotation-x={-Math.PI / 2} />
      </Environment>
    </>
  )
}

export default function RawahScene() {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ fov: 30, position: [0, 0.4, 8], near: 0.1, far: 50 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Suspense fallback={null}>
        <Lights />
        <Choreography />
      </Suspense>
    </Canvas>
  )
}
