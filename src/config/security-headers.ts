/**
 * Response headers applied to every page and API response (see next.config.ts), and to
 * static files through public/_headers. Keep the two in step.
 *
 * Content-Security-Policy notes:
 * - script-src needs 'unsafe-inline' because pre-rendered Next.js pages carry small inline
 *   bootstrap scripts. A nonce-based policy would force every page to render on each request,
 *   costing Worker CPU on the free plan. Revisit if pages become dynamic anyway.
 * - style-src needs 'unsafe-inline' for React style attributes used by the animations.
 * - Payment (Razorpay) origins are added in the payments phase, not before.
 */
export const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

export const securityHeaders: { key: string; value: string }[] = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(self)' },
  // Allows payment pop-ups later (UPI and bank pages) while isolating this window from others.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
]
