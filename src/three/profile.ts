import * as THREE from 'three'

// Silhouette of the 50ml Rawah flacon, traced from product photography.
// (radius, height) pairs, body centred on y = 0. Lathed around Y then squashed in Z
// to get the flat oval "pebble" the bottle actually is.
const OUTER: [number, number][] = [
  [0.0, -0.7],
  [0.5, -0.7],
  [0.78, -0.665],
  [0.93, -0.56],
  [1.01, -0.36],
  [1.04, -0.1],
  [1.02, 0.14],
  [0.95, 0.34],
  [0.82, 0.5],
  [0.62, 0.63],
  [0.4, 0.71],
  [0.24, 0.75],
  [0.2, 0.77],
]

export const DEPTH = 0.5 // Z squash: the flacon is half as deep as it is wide

function smooth(points: [number, number][], samples = 72) {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([r, y]) => new THREE.Vector3(r, y, 0)),
    false,
    'centripetal',
  )
  return curve.getPoints(samples).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y))
}

export const outerProfile = smooth(OUTER)
// Liquid sits inside a thick glass wall and a heavy base.
export const innerProfile = smooth(
  OUTER.slice(0, -2).map(([r, y]) => [r * 0.88, y * 0.86 + 0.05] as [number, number]),
)

/** Half-width of the body at height y (front view). Used to wrap the label onto the glass. */
export function radiusAt(y: number) {
  const pts = outerProfile
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if ((y >= a.y && y <= b.y) || (y <= a.y && y >= b.y)) {
      const t = (y - a.y) / (b.y - a.y || 1)
      return a.x + (b.x - a.x) * t
    }
  }
  return 0
}

export function latheSquashed(profile: THREE.Vector2[], segments = 96) {
  const g = new THREE.LatheGeometry(profile, segments)
  g.scale(1, 1, DEPTH)
  g.computeVertexNormals()
  return g
}
