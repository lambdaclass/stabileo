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
  return {
    center,
    radius,
    sigma1: center + radius,
    sigma2: center - radius,
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
  const a = (2 * thetaDeg) / DEG;
  const c = Math.cos(a), s = Math.sin(a);
  const mean = (sx + sy) / 2, half = (sx - sy) / 2;
  return {
    sx: mean + half * c + txy * s,
    sy: mean - half * c - txy * s,
    txy: -half * s + txy * c,
  };
}
