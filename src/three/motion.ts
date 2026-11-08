// Shared, mutable motion state. Written by scroll and pointer handlers, read inside useFrame.
// Kept outside React so 60fps updates never trigger a re-render.
export const motion = {
  /** 0..1 progress through the Rawah story section */
  progress: 0,
  /** user drag rotation (radians), eased toward by the scene */
  dragY: 0,
  dragX: 0,
  /** pointer velocity impulse, consumed by the liquid spring each frame */
  impulse: 0,
  reduced: typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
/** maps v from [a,b] to [0,1], clamped */
export const range = (v: number, a: number, b: number) => clamp01((v - a) / (b - a))
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
/** rises over [a,b], holds, falls over [c,d] */
export const window4 = (v: number, a: number, b: number, c: number, d: number) =>
  Math.min(range(v, a, b), 1 - range(v, c, d))
