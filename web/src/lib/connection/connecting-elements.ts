/**
 * The connecting elements of a joint — plates, gussets, tabs, the parts of the members a joint
 * acts on — CIRSOC 301-2018 §J.4:
 *
 *   J.4.1  tension: yielding φ = 0,90, Rn = Fy·Ag; rupture φ = 0,75, Rn = Fu·Ae, Ae = An ≤ 0,85·Ag
 *          for a bolted plate;
 *   J.4.2  shear: yielding φ = 0,90, Rn = 0,60·Fy·Agv; rupture φ = 0,75, Rn = 0,60·Fu·Anv;
 *   J.4.3  block shear, φ = 0,75: Rn = 0,60·Fu·Anv + Ubs·Fu·Ant ≤ 0,60·Fy·Agv + Ubs·Fu·Ant.
 *
 * Areas in cm², stresses in MPa, forces in kN (the text's (10)⁻¹).
 */
export interface Strength { phiRn: number; governs: string }

export function tensionStrength(i: { Ag: number; An: number; Fy: number; Fu: number; boltedPlate?: boolean }): Strength {
  const y = 0.9 * i.Fy * i.Ag / 10;
  const Ae = i.boltedPlate ? Math.min(i.An, 0.85 * i.Ag) : i.An;
  const r = 0.75 * i.Fu * Ae / 10;
  return y <= r ? { phiRn: y, governs: 'J.4.1(a)' } : { phiRn: r, governs: 'J.4.1(b)' };
}

export function shearStrength(i: { Agv: number; Anv: number; Fy: number; Fu: number }): Strength {
  const y = 0.9 * 0.6 * i.Fy * i.Agv / 10, r = 0.75 * 0.6 * i.Fu * i.Anv / 10;
  return y <= r ? { phiRn: y, governs: 'J.4.2(a)' } : { phiRn: r, governs: 'J.4.2(b)' };
}

export function blockShear(i: { Agv: number; Anv: number; Ant: number; Fy: number; Fu: number; Ubs?: number }): Strength {
  const U = i.Ubs ?? 1;
  const rupture = 0.6 * i.Fu * i.Anv + U * i.Fu * i.Ant, cap = 0.6 * i.Fy * i.Agv + U * i.Fu * i.Ant;
  return { phiRn: 0.75 * Math.min(rupture, cap) / 10, governs: rupture <= cap ? 'J.4.3 (rotura)' : 'J.4.3 (tope de fluencia)' };
}

/**
 * The block of a line of bolts: `n` bolts at pitch `s`, end distance `le` along the force, edge
 * distance `lt` across it, in a plate `t` thick, holes `dh` (all cm). One shear plane along the
 * line and one tension plane at its end — a shear tab, a gusset's single line.
 */
export function boltLineBlock(i: { n: number; s: number; le: number; lt: number; t: number; dh: number }) {
  const lv = (i.n - 1) * i.s + i.le;
  return { Agv: lv * i.t, Anv: (lv - (i.n - 0.5) * i.dh) * i.t, Ant: (i.lt - 0.5 * i.dh) * i.t };
}
