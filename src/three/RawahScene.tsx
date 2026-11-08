import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import { Bottle, type BottleRig } from './Bottle'
import { SprayMist, type SprayRig } from './SprayMist'
import { ACTUATOR_R, ACTUATOR_Y, NOZZLE_DIR } from './spray'
import { easeInOut, motion, range, window4 } from './motion'

// Scroll choreography for the Rawah story. Progress p runs 0..1 over the pinned section.
//   0.00 to 0.12  arrival, slow breathing turn
//   0.12 to 0.34  one full 360 turn so the label passes the camera
//   0.34 to 0.46  the cap unscrews and lifts
//   0.46 to 0.64  the atomiser sprays sideways, top notes described
//   0.62 to 0.80  heart notes
//   0.78 to 0.94  base notes
//   0.92 to 1.00  cap returns, the bottle settles for purchase

function Choreography() {
  const group = useRef<THREE.Group>(null)
  const smooth = useRef(0)
  const drag = useRef({ x: 0, y: 0 })
  const rig = useMemo<BottleRig>(() => ({ cap: 0, push: 0, swing: 1.5, spray: 0 }), [])
  const mist = useMemo<SprayRig>(() => ({ origin: new THREE.Vector3(), dir: new THREE.Vector3(-1, 0, 0), active: new THREE.Vector3() }), [])
  const nozzleLocal = useMemo(() => new THREE.Vector3(NOZZLE_DIR.x * ACTUATOR_R, ACTUATOR_Y + 0.01, NOZZLE_DIR.z * ACTUATOR_R), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
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
    const open = range(rig.cap, 0.9, 1)
    mist.active.set(top * open, heart * open, base * open)
    rig.spray = Math.max(top, heart, base) * open
    // the nozzle rides on the bottle, so the spray follows any turn or drag
    g.updateMatrixWorld()
    mist.origin.copy(nozzleLocal).applyMatrix4(g.matrixWorld)
    mist.origin.y -= 0.02 * rig.spray
    mist.dir.copy(NOZZLE_DIR).applyQuaternion(g.getWorldQuaternion(q))

    // camera: arrives close, then eases back a touch to frame the spray
    const arrive = range(t, 0, 2.2)
    const lift = window4(p, 0.38, 0.5, 0.9, 0.98)
    const camZ = (narrow ? 11.5 : 8.4) + (1 - easeInOut(arrive)) * 2.5 + lift * 0.9
    camera.position.set(lift * -0.3, 0.9 + lift * 0.25, camZ)
    look.set(xShift * 0.45, (narrow ? 0.95 : 1.15) + lift * 0.1, 0)
    camera.lookAt(look)
  })

  return (
    <>
      <group ref={group}>
        <Bottle liquid="#a9721e" name="Rawah" rig={rig} />
      </group>
      <SprayMist rig={mist} />
      <ContactShadows position={[0, -0.7, 0]} scale={5} blur={2.4} opacity={0.85} far={1} color="#000" />
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
    <mesh position={[0, 0.8, -7]} material={mat}>
      <planeGeometry args={[18, 12]} />
    </mesh>
  )
}

function Lights() {
  return (
    <>
      <Halo />
      <ambientLight intensity={0.15} />
      <directionalLight position={[-3, 4, 3]} intensity={1.4} color="#fff2dc" />
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#0b0907']} />
        {/* tall softbox key, left */}
        <Lightformer form="rect" intensity={3.2} color="#fff4e2" position={[-4, 1.5, 3]} scale={[2.5, 7, 1]} target={[0, 0, 0]} />
        {/* strip rim, right, for the edge highlight on the glass */}
        <Lightformer form="rect" intensity={4} color="#ffd9a0" position={[4.5, 0.5, -1]} scale={[0.6, 6, 1]} target={[0, 0, 0]} />
        {/* thin front strips: streak highlights that make the empty glass read as glass */}
        <Lightformer form="rect" intensity={2.2} color="#fff8ec" position={[-1.6, 1, 5]} scale={[0.25, 5, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.2} color="#fff8ec" position={[1.2, 1.2, 5]} scale={[0.12, 4, 1]} target={[0, 0, 0]} />
        {/* warm backlight, the classic perfume-shot trick that makes the juice glow */}
        <Lightformer form="rect" intensity={2.4} color="#ffcf8a" position={[0, 0.6, -4]} scale={[3, 2.5, 1]} target={[0, 0, 0]} />
        {/* top panel */}
        <Lightformer form="rect" intensity={0.5} color="#ffffff" position={[0, 5, 0]} scale={[6, 2, 1]} rotation-x={Math.PI / 2} />
        {/* grazing side strips: bright edges along the silhouette, where thick glass catches light */}
        <Lightformer form="rect" intensity={3} color="#fff6e6" position={[-5, 0.5, -0.5]} scale={[0.5, 6, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={3} color="#fff6e6" position={[5, 0.5, 0.5]} scale={[0.5, 6, 1]} target={[0, 0, 0]} />
        {/* faint floor bounce */}
        <Lightformer form="circle" intensity={0.25} color="#8a6a40" position={[0, -4, 1]} scale={4} rotation-x={-Math.PI / 2} />
      </Environment>
    </>
  )
}

export default function RawahScene() {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ fov: 30, position: [0, 0.4, 8], near: 0.1, far: 50 }}
      gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.0 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Suspense fallback={null}>
        <Lights />
        <Choreography />
      </Suspense>
    </Canvas>
  )
}
