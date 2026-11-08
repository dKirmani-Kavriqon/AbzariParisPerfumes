import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { innerProfile, latheSquashed, outerProfile } from './profile'
import { createLiquidMaterial, LiquidSpring } from './liquidMaterial'
import { makeLabelGeometry, makeLabelTextures } from './label'
import { motion } from './motion'

export type BottleRig = {
  /** 0 closed, 1 fully lifted away */
  cap: number
  /** extra slosh push, e.g. from a drag gesture */
  push: number
  /** how far the cap swings sideways once lifted (smaller on phones) */
  swing: number
}

type Props = {
  liquid: string
  name: string
  rig: BottleRig
  onSpring?: (s: LiquidSpring) => void
}

const glass = new THREE.MeshPhysicalMaterial({
  color: '#ffffff',
  transmission: 1,
  thickness: 0.45,
  roughness: 0.035,
  ior: 1.5,
  clearcoat: 1,
  clearcoatRoughness: 0.02,
  specularIntensity: 1,
  envMapIntensity: 0.9,
  attenuationColor: new THREE.Color('#fff6e6'),
  attenuationDistance: 3,
})

const lacquer = new THREE.MeshPhysicalMaterial({
  color: '#050505',
  roughness: 0.12,
  metalness: 0.0,
  clearcoat: 1,
  clearcoatRoughness: 0.03,
  envMapIntensity: 1.6,
})

const brass = new THREE.MeshStandardMaterial({ color: '#cfae6a', metalness: 1, roughness: 0.22, envMapIntensity: 1.3 })
const tube = new THREE.MeshStandardMaterial({ color: '#e9e4da', roughness: 0.2, metalness: 0, transparent: false })

export function Bottle({ liquid, name, rig, onSpring }: Props) {
  const body = useRef<THREE.Group>(null)
  const cap = useRef<THREE.Group>(null)
  const nozzle = useRef<THREE.Group>(null)
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
          roughness: 0.3,
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
    u.uRipple.value = motion.reduced ? 0 : 0.004 + spring.energy * 0.03

    // Cap: a short unscrewing twist, then it lifts clear and drifts up and back.
    const c = rig.cap
    const twist = Math.min(1, c / 0.35)
    const lift = Math.max(0, (c - 0.2) / 0.8)
    const l = 1 - Math.pow(1 - lift, 3)
    // lifts, then swings out to the right so the plume has the space above the atomiser
    cap.current.position.set(Math.sin(l * Math.PI * 0.5) * rig.swing, 1.21 + twist * 0.05 + Math.sin(l * Math.PI) * 0.7 + l * 0.15, l * 0.35)
    cap.current.rotation.set(-l * 0.5, twist * Math.PI * 1.5 + l * 0.6, -l * 0.5)
    if (nozzle.current) nozzle.current.visible = c > 0.05
  })

  return (
    <group ref={body} dispose={null}>
      {/* liquid first: it has to be opaque so the glass transmission pass can see it */}
      <mesh geometry={innerGeo} material={liquidMat} renderOrder={0} />
      {/* dip tube */}
      <mesh position={[0.02, 0.1, 0]} material={tube}>
        <cylinderGeometry args={[0.011, 0.011, 1.4, 8]} />
      </mesh>
      <mesh geometry={outerGeo} material={glass} />
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
        <mesh position={[0, 0.17, 0]} material={lacquer}>
          <cylinderGeometry args={[0.1, 0.1, 0.12, 40]} />
        </mesh>
        <mesh position={[0, 0.18, 0.1]} rotation={[Math.PI / 2, 0, 0]} material={brass}>
          <cylinderGeometry args={[0.014, 0.014, 0.02, 12]} />
        </mesh>
      </group>
      <group ref={cap}>
        <mesh material={lacquer}>
          <sphereGeometry args={[0.47, 64, 48]} />
        </mesh>
      </group>
    </group>
  )
}
