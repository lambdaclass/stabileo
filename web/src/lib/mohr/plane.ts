export interface MohrCircle {
  center: number;
  radius: number;
  sigma1: number;
  sigma2: number;
  /** Angle from x to the major principal direction, radians, counterclockwise positive. */
  thetaP: number;
  tauMax: number;
}

/** Plane stress Mohr circle; `sigmaY` defaults to the free surface of a beam fibre. */
export function computeMohrCircle(sigma: number, tau: number, sigmaY = 0): MohrCircle {
  const center = (sigma + sigmaY) / 2;
  const radius = Math.hypot((sigma - sigmaY) / 2, tau);
  const large = center >= 0 ? center + radius : center - radius;
  const diagonalProduct = Math.abs(sigma) >= Math.abs(sigmaY) ? (sigma / large) * sigmaY : (sigmaY / large) * sigma;
  const small = large === 0 ? 0 : diagonalProduct - (tau / large) * tau;
  return {
    center,
    radius,
    sigma1: center >= 0 ? large : small,
    sigma2: center >= 0 ? small : large,
    thetaP: 0.5 * Math.atan2(2 * tau, sigma - sigmaY),
    tauMax: radius,
  };
}

export interface PlaneStress {
  sx: number;
  sy: number;
  txy: number;
}

export interface PlanePrincipal {
  center: number;
  radius: number;
  sigma1: number;
  sigma2: number;
  theta1: number;
  theta2: number;
  tauMax: number;
}

const DEG = 180 / Math.PI;

/** Principal stresses of a plane state, angles in degrees, θ2 = θ1 + 90°. */
export function principalPlane({ sx, sy, txy }: PlaneStress): PlanePrincipal {
  const m = computeMohrCircle(sx, txy, sy);
  const theta1 = m.radius === 0 ? 0 : m.thetaP * DEG;
  return { center: m.center, radius: m.radius, sigma1: m.sigma1, sigma2: m.sigma2, theta1, theta2: theta1 + 90, tauMax: m.tauMax };
}

/** The state on axes rotated counterclockwise by `thetaDeg` from x, y. */
export function rotatePlane({ sx, sy, txy }: PlaneStress, thetaDeg: number): PlaneStress {
  const a = thetaDeg / DEG;
  const c = Math.cos(a), s = Math.sin(a);
  const cc = c * c, ss = s * s, sc = s * c;
  return {
    sx: sx * cc + sy * ss + 2 * txy * sc,
    sy: sx * ss + sy * cc - 2 * txy * sc,
    txy: (sy - sx) * sc + txy * (cc - ss),
  };
}
