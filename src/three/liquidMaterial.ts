import * as THREE from 'three'

// A liquid that is cut by a world-space plane instead of being simulated as a volume.
// The plane tilts with a damped spring (see useLiquidSpring), so the oil stays level
// while the flacon spins, lags when it is moved and rings out when it stops.
// Back faces that survive the cut are painted as the liquid's surface, which sells the
// illusion of a real top surface without any extra geometry.

const vertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vCenter;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

const fragment = /* glsl */ `
  uniform float uFill;
  uniform vec2 uTilt;
  uniform float uRipple;
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uBright;
  uniform vec3 uSurface;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vCenter;

  void main() {
    vec3 rel = vWorld - vCenter;
    float wave = sin(rel.x * 9.0 + uTime * 3.1) * cos(rel.z * 11.0 - uTime * 2.3);
    float surface = uFill + rel.x * uTilt.x + rel.z * uTilt.y + wave * uRipple;
    if (rel.y > surface) discard;

    vec3 V = normalize(cameraPosition - vWorld);

    if (!gl_FrontFacing) {
      // Inside of the cut: the top surface of the oil. Brighter toward the rim, a soft
      // specular band that moves with the ripple.
      float rim = smoothstep(0.0, 0.9, length(rel.xz * vec2(1.0, 2.0)));
      float glint = pow(max(0.0, sin(rel.x * 4.0 - rel.z * 6.0 + uTime * 0.8 + wave * 2.0)), 24.0);
      vec3 c = mix(uSurface, uBright, rim * 0.6) + glint * 0.25;
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
      return;
    }

    vec3 N = normalize(vNormalW);
    float facing = max(dot(N, V), 0.0);
    // Light travels further through the oil at grazing angles, so the rim reads darker
    // and the centre glows: the opposite of a solid, which is what makes it look liquid.
    float path = 1.0 - facing;
    float depth = clamp((surface - rel.y) / 1.2, 0.0, 1.0);
    vec3 body = mix(uBright, uDeep, smoothstep(0.0, 1.0, depth * 0.7 + path * 0.65));
    // back light scattering through the middle of the flacon
    float glow = pow(facing, 3.0) * (1.0 - depth * 0.6);
    body += uBright * glow * 0.35;
    // caustic-like shimmer drifting through the oil
    float sh = sin(rel.x * 14.0 + rel.y * 9.0 + uTime * 0.9) * sin(rel.x * 7.0 - rel.y * 13.0 - uTime * 0.6);
    body += uBright * smoothstep(0.75, 1.0, sh) * 0.12 * (1.0 - depth);
    // bright meniscus where oil meets glass
    float meniscus = smoothstep(0.03, 0.0, surface - rel.y);
    body += uBright * meniscus * 0.6;
    gl_FragColor = vec4(body, 1.0);
    #include <colorspace_fragment>
  }
`

export function createLiquidMaterial(color: string) {
  const base = new THREE.Color(color)
  const hsl = { h: 0, s: 0, l: 0 }
  base.getHSL(hsl)
  const deep = new THREE.Color().setHSL(hsl.h * 0.9, Math.min(1, hsl.s * 1.1), hsl.l * 0.22)
  const bright = new THREE.Color().setHSL(hsl.h * 1.04, hsl.s * 0.9, Math.min(0.72, hsl.l * 1.2))
  const surface = new THREE.Color().setHSL(hsl.h, hsl.s * 0.8, Math.min(0.85, hsl.l * 1.5))
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    side: THREE.DoubleSide,
    uniforms: {
      uFill: { value: 0.28 },
      uTilt: { value: new THREE.Vector2() },
      uRipple: { value: 0 },
      uTime: { value: 0 },
      uDeep: { value: deep },
      uBright: { value: bright },
      uSurface: { value: surface },
    },
  })
}

/**
 * Damped spring for the liquid surface. Feed it the flacon's world transform each frame.
 * Angular and linear velocity become a target tilt; the surface chases it and overshoots.
 */
export class LiquidSpring {
  tilt = new THREE.Vector2()
  vel = new THREE.Vector2()
  private prevQ = new THREE.Quaternion()
  private prevP = new THREE.Vector3()
  private dq = new THREE.Quaternion()
  private started = false
  k = 95 // stiffness: ~1.5Hz slosh
  c = 2.2 // damping: rings for a couple of seconds

  step(obj: THREE.Object3D, dt: number, extra = 0) {
    dt = Math.min(dt, 1 / 30)
    const q = obj.getWorldQuaternion(new THREE.Quaternion())
    const p = obj.getWorldPosition(new THREE.Vector3())
    if (!this.started) {
      this.prevQ.copy(q)
      this.prevP.copy(p)
      this.started = true
    }
    // angular velocity from quaternion delta
    this.dq.copy(q).multiply(this.prevQ.clone().invert())
    const angle = 2 * Math.acos(Math.min(1, Math.abs(this.dq.w)))
    const s = Math.sqrt(1 - this.dq.w * this.dq.w) || 1
    const sign = this.dq.w < 0 ? -1 : 1
    const omega = new THREE.Vector3(this.dq.x / s, this.dq.y / s, this.dq.z / s).multiplyScalar((sign * angle) / dt)
    const v = p.clone().sub(this.prevP).divideScalar(dt)
    this.prevQ.copy(q)
    this.prevP.copy(p)

    // Inertia: oil piles up opposite to motion. Spin about Y throws it sideways a little.
    const tx = THREE.MathUtils.clamp(-v.x * 0.35 + omega.z * 0.22 + omega.y * 0.05 + extra, -0.65, 0.65)
    const tz = THREE.MathUtils.clamp(-v.z * 0.35 - omega.x * 0.22 + omega.y * 0.03, -0.65, 0.65)

    const ax = this.k * (tx - this.tilt.x) - this.c * this.vel.x
    const az = this.k * (tz - this.tilt.y) - this.c * this.vel.y
    this.vel.x += ax * dt
    this.vel.y += az * dt
    this.tilt.x += this.vel.x * dt
    this.tilt.y += this.vel.y * dt
    return this
  }

  get energy() {
    return Math.min(1, this.vel.length() * 0.25 + this.tilt.length() * 0.6)
  }
}
