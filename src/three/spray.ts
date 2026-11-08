import * as THREE from 'three'

/** One press of the atomiser every SPRAY_PERIOD seconds while a note tier is showing. */
export const SPRAY_PERIOD = 2.6
/** How long a single press keeps releasing droplets. */
export const SPRAY_BURST = 0.22

/** Atomiser actuator centre, in bottle space. */
export const ACTUATOR_Y = 1.07
export const ACTUATOR_R = 0.1

/**
 * Direction the nozzle hole faces, in bottle space. Chosen so that at the bottle's resting
 * angle during the notes chapters, the mist travels left and slightly toward the viewer,
 * across the note descriptions.
 */
export const NOZZLE_DIR = new THREE.Vector3(-0.7, 0.1, 0.7).normalize()
export const NOZZLE_YAW = Math.atan2(NOZZLE_DIR.x, NOZZLE_DIR.z)

/** 0..1 travel of the actuator for a given clock time: a quick press and a slower spring back. */
export function pressAt(t: number) {
  const ph = t % SPRAY_PERIOD
  if (ph < 0.08) return ph / 0.08
  if (ph < 0.35) return 1 - (ph - 0.08) / 0.27
  return 0
}
