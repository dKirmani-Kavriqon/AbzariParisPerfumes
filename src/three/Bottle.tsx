import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshTransmissionMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { innerProfile, latheSquashed, outerProfile } from './profile'
import { createLiquidMaterial, LiquidSpring } from './liquidMaterial'
import { makeLabelGeometry, makeLabelTextures } from './label'
import { motion } from './motion'
import { ACTUATOR_R, NOZZLE_YAW, pressAt } from './spray'

export type BottleRig = {
  /** 0 closed, 1 fully lifted away */
  cap: number
  /** extra slosh push, e.g. from a drag gesture */
  push: number
  /** how far the cap swings sideways once lifted (smaller on phones) */
  swing: number
  /** 0..1, whether the atomiser is being pressed in a rhythm */
  spray: number
}

type Props = {
  liquid: string
  name: string
  rig: BottleRig
  onSpring?: (s: LiquidSpring) => void
}

// Small glass parts (the neck) use the built-in physical transmission. The body gets
// drei's MeshTransmissionMaterial below, which renders its own refraction buffer with
// chromatic aberration and a back face pass: the thing that makes glass read as glass.
const glass = new THREE.MeshPhysicalMaterial({
  color: '#ffffff',
  transmission: 1,
  thickness: 0.3,
  roughness: 0.02,
  ior: 1.5,
  clearcoat: 1,
  clearcoatRoughness: 0.02,
  specularIntensity: 1,
  envMapIntensity: 1.2,
})

const lacquer = new THREE.MeshPhysicalMaterial({
  color: '#030303',
  roughness: 0.08,
  metalness: 0.0,
  clearcoat: 1,
  clearcoatRoughness: 0.03,
  envMapIntensity: 1.6,
})

const brass = new THREE.MeshStandardMaterial({ color: '#d9b878', metalness: 1, roughness: 0.18, envMapIntensity: 1.5 })
const tube = new THREE.MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.15, metalness: 0 })

export function Bottle({ liquid, name, rig, onSpring }: Props) {
  const body = useRef<THREE.Group>(null)
  const cap = useRef<THREE.Group>(null)
  const nozzle = useRef<THREE.Group>(null)
  const actuator = useRef<THREE.Group>(null)
  const narrow = useThree((s) => s.size.width < 820)
  const spring = useMemo(() => new LiquidSpring(), [])
  const liquidMat = useMemo(() => createLiquidMaterial(liquid), [liquid])
  const outerGeo = useMemo(() => latheSquashed(outerProfile), [])
  const innerGeo = useMemo(() => latheSquashed(innerProfile), [])
  const labelGeo = useMemo(() => makeLabelGeometry(), [])
  const [label, setLabel] = useState<THREE.MeshStandardMaterial | null>(null)

  useEffect(() => {
    let alive = true
    makeLabelTextures(name).then(({ map, foil }) => {
      if (!alive) return
      setLabel(
        new THREE.MeshStandardMaterial({
          map,
          metalnessMap: foil,
          metalness: 1,
          roughness: 0.28,
          transparent: true,
          alphaTest: 0.4,
          envMapIntensity: 1.4,
        }),
      )
    })
    return () => {
      alive = false
    }
  }, [name])

  useEffect(() => onSpring?.(spring), [onSpring, spring])

  useFrame((state, dt) => {
    if (!body.current || !cap.current) return
    spring.step(body.current, dt, rig.push + motion.impulse)
    motion.impulse *= 0.85
    rig.push *= 0.9
    const u = liquidMat.uniforms
    u.uTime.value = state.clock.elapsedTime
    u.uTilt.value.copy(motion.reduced ? new THREE.Vector2() : spring.tilt)
    u.uRipple.value = motion.reduced ? 0 : 0.0015 + spring.energy * 0.025

    // Cap: a short unscrewing twist, then it lifts clear and drifts up and back.
    const c = rig.cap
    const twist = Math.min(1, c / 0.35)
    const lift = Math.max(0, (c - 0.2) / 0.8)
    const l = 1 - Math.pow(1 - lift, 3)
    // lifts, then swings out to the right so the plume has the space above the atomiser
    cap.current.position.set(Math.sin(l * Math.PI * 0.5) * rig.swing, 1.21 + twist * 0.05 + Math.sin(l * Math.PI) * 0.7 + l * 0.15, l * 0.35)
    cap.current.rotation.set(-l * 0.5, twist * Math.PI * 1.5 + l * 0.6, -l * 0.5)
    if (nozzle.current) nozzle.current.visible = c > 0.05
    if (actuator.current) actuator.current.position.y = 0.17 - pressAt(state.clock.elapsedTime) * rig.spray * 0.035
  })

  return (
    <group ref={body} dispose={null}>
      {/* liquid first: it has to be opaque so the glass transmission pass can see it */}
      <mesh geometry={innerGeo} material={liquidMat} renderOrder={0} />
      {/* dip tube */}
      <mesh position={[0.02, 0.1, 0]} material={tube}>
        <cylinderGeometry args={[0.011, 0.011, 1.4, 8]} />
      </mesh>
      <mesh geometry={outerGeo}>
        {/* transmissionSampler reuses three's opaque-only transmission pass, so the oil is
            refracted but the label (transparent, on the outside of the glass) is not */}
        <MeshTransmissionMaterial
          transmissionSampler
          thickness={0.35}
          roughness={0}
          ior={1.5}
          chromaticAberration={0.04}
          anisotropicBlur={0.05}
          distortion={0.06}
          distortionScale={0.4}
          temporalDistortion={0}
          clearcoat={1}
          clearcoatRoughness={0}
          envMapIntensity={1.3}
          attenuationColor="#fff4e0"
          attenuationDistance={2.5}
          samples={narrow ? 4 : 8}
        />
      </mesh>
      {label && <mesh geometry={labelGeo} material={label} />}
      {/* neck */}
      <mesh position={[0, 0.81, 0]} material={glass}>
        <cylinderGeometry args={[0.18, 0.2, 0.12, 40]} />
      </mesh>
      {/* crimp collar and actuator, revealed when the cap lifts */}
      <group ref={nozzle} position={[0, 0.9, 0]}>
        <mesh material={brass}>
          <cylinderGeometry args={[0.19, 0.2, 0.09, 48]} />
        </mesh>
        <mesh position={[0, 0.08, 0]} material={brass}>
          <cylinderGeometry args={[0.07, 0.08, 0.08, 32]} />
        </mesh>
        {/* actuator: presses down on every spritz; the hole faces the spray direction */}
        <group ref={actuator} position={[0, 0.17, 0]} rotation={[0, NOZZLE_YAW, 0]}>
          <mesh material={lacquer}>
            <cylinderGeometry args={[ACTUATOR_R, ACTUATOR_R, 0.12, 40]} />
          </mesh>
          <mesh position={[0, 0.01, ACTUATOR_R]} rotation={[Math.PI / 2, 0, 0]} material={brass}>
            <cylinderGeometry args={[0.016, 0.016, 0.012, 16]} />
          </mesh>
        </group>
      </group>
      <group ref={cap}>
        <mesh material={lacquer}>
          <sphereGeometry args={[0.47, 64, 48]} />
        </mesh>
      </group>
    </group>
  )
}
