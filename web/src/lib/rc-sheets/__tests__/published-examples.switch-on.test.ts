/**
 * The sheets' design rules against worked examples published by others, with their numbers as
 * printed. Units are converted exactly (1 in = 25.4 mm, 1 kip = 4.448222 kN, 1 psi = 6.894757 kPa).
 *
 * - JRC EUR 26566, "Eurocode 2: worked examples" of a building, §3.2.1, pp. 58–60 and pp. 71–74.
 *   Reproduction authorised provided the source is acknowledged.
 * - StructurePoint, "Reinforced Concrete Beam Design (ACI 318)", simply supported beam: flexure
 *   clauses unchanged in ACI 318-19.
 * - Dlubal Knowledge Base 001666, ACI 318-19 shear design of a beam.
 * - INTI-CIRSOC, "Ejemplos de aplicación del Reglamento CIRSOC 201-2005", Ejemplo 2.I.1, p. 17.
 */
import { describe, it, expect } from 'vitest';
import { EC2_RECOMMENDED } from '../../engine/design/eurocode/ec2-params';
import { flexuralSteel, matOf, shearCapacity } from '../ec2/basis';
import { punchingPerimeters } from '../ec2/punching-row';
import { evaluateBeamSection } from '../../engine/codes/argentina/cirsoc201-beam-kernel';

const IN = 0.0254, KIP = 4.448222, PSI = 6.894757e-3;
const p = EC2_RECOMMENDED;

describe('EN 1992-1-1, JRC worked examples of a building (EUR 26566)', () => {
  const m = matOf(25, 500, p);

  it('support B: MEd = 132.9 kN·m on a 250 mm web, d = 372 mm, needs As = 947 mm² at z = 0.867·d', () => {
    const r = flexuralSteel(132.9, 0, { b: 0.25, h: 0.42 }, 0.372, 0.05, m, p);
    expect(r.as2).toBe(0);
    expect(r.z / 0.372).toBeCloseTo(0.867, 3);
    expect(r.as * 1e6).toBeCloseTo(947, -1);
  });

  it('midspan: MEd = 89.3 kN·m on a T-section with beff = 2611 mm, d = 372 mm, needs As = 556 mm² at z = 0.9925·d', () => {
    const r = flexuralSteel(89.3, 0, { b: 0.25, h: 0.42, bf: 2.611, hf: 0.16 }, 0.372, 0.05, m, p);
    expect(r.z / 0.372).toBeCloseTo(0.9925, 3);
    expect(r.as * 1e6).toBeCloseTo(556, -1);
  });

  it('shear at support A: ρl = 0.61 %, k = 1.73, VRd,c = 47.90 kN; Asw/s = 317 mm²/m carries VEd = 115.52 kN at cotθ = 2.5, VRd,max = 259.8 kN', () => {
    const asl = 0.0061 * 0.25 * 0.372;
    const s = shearCapacity(0.25, 0.372, asl, 317e-6, m, p);
    expect(s.k).toBeCloseTo(1.73, 2);
    expect(s.vrdc).toBeCloseTo(47.9, 0);
    expect(s.cot).toBeCloseTo(2.5, 6);
    expect(s.nu1).toBeCloseTo(0.54, 3);
    expect(s.vrds).toBeCloseTo(115.52, 0);
    expect(s.vrdMax).toBeCloseTo(259.8, 0);
  });

  it('punching at an interior 500 × 500 mm column, d = 164 mm: u1 = 4061 mm at 2d', () => {
    const g = punchingPerimeters(0.5, 0.5, 0.164, { position: 'interior' } as never);
    expect(g.u1 * 1000).toBeCloseTo(4061, -1);
  });
});

describe('ACI 318-19, through the rules CIRSOC 201-2025 adopts from it', () => {
  it('StructurePoint: b = 12 in, d = 17.56 in, f\'c = 4350 psi, fy = 60 ksi, As = 2.872 in² gives φMn = Mu = 201.88 kip·ft with εt = 0.0083', () => {
    const r = evaluateBeamSection({
      edition: '2025', fc: 4350 * PSI * 1e6, fy: 60000 * PSI * 1e6, b: 12 * IN, h: 20 * IN, d: 17.56 * IN,
      As: 2.872 * IN * IN, AsComp: 0, dPrime: 0.05, Ag: 12 * 20 * IN * IN, NuCompression: 0,
    })!;
    expect(r.phi).toBeCloseTo(0.9, 6);
    expect(r.epsilonT).toBeCloseTo(0.0083, 3);
    expect(r.phiMn / 1e3 / (KIP * 0.3048)).toBeCloseTo(201.88, -0.5);
  });

  it('Dlubal: bw = 11 in, d = 22.5 in, f\'c = 5000 psi, with the minimum stirrups Vc = 2·√f\'c·bw·d = 35.0 kip, and Av/s = 0.41 in²/ft carries Vu = 61.10 kip', () => {
    const avS = 0.41 * IN * IN / 0.3048;
    const r = evaluateBeamSection({
      edition: '2025', fc: 5000 * PSI * 1e6, fy: 60000 * PSI * 1e6, b: 11 * IN, h: 25 * IN, d: 22.5 * IN,
      As: 0.00536 * 11 * 22.5 * IN * IN, AsComp: 0, dPrime: 0.05, Ag: 11 * 25 * IN * IN, NuCompression: 0,
      Av: avS * 0.2, s: 0.2, fyt: 60000 * PSI * 1e6,
    })!;
    expect(r.avBelowMin).toBe(false);
    // The SI form of the code (0.17·√f'c, MPa) against the inch-pound one (2·√f'c, psi ≡ 0.1661·√f'c): 2.4 % apart.
    expect(r.Vc / 1e3 / KIP).toBeCloseTo(35.0 * 0.17 / (2 * Math.sqrt(PSI)), 1);
    expect(r.phiVn / 1e3 / KIP).toBeGreaterThanOrEqual(61.10 - 0.3);
    expect(r.phiVn / 1e3 / KIP).toBeLessThan(61.10 * 1.02);
  });
});

describe('CIRSOC 201, INTI-CIRSOC worked examples', () => {
  it('Ejemplo 2.I.1: H-25, ADN 420, bw = 0.12 m, d = 0.366 m, As = 415 mm² gives φMn = Mu = 52 kN·m', () => {
    const r = evaluateBeamSection({ edition: '2025', fc: 25e6, fy: 420e6, b: 0.12, h: 0.4, d: 0.366, As: 415e-6, AsComp: 0, dPrime: 0.03, Ag: 0.12 * 0.4, NuCompression: 0 })!;
    expect(r.phiMn / 1e3).toBeCloseTo(52, -0.3);
  });
});
