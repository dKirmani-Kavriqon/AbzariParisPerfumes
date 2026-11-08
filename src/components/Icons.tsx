type P = { size?: number }
const base = (size = 20) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true })

export const BagIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></svg>
)
export const MenuIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 8h16M4 16h16" /></svg>
)
export const CloseIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M6 6l12 12M18 6 6 18" /></svg>
)
export const TruckIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" /></svg>
)
export const ReturnIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
)
export const LockIcon = ({ size }: P) => (
  <svg {...base(size)}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
)
export const SealIcon = ({ size }: P) => (
  <svg {...base(size)}><circle cx="12" cy="10" r="6" /><path d="m9.5 10 1.7 1.7 3.3-3.4M8.5 15 7 21l5-2 5 2-1.5-6" /></svg>
)
export const ArrowIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
)
