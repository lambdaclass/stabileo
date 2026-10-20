/**
 * Hanging steel where a beam bears on another beam (an indirect support).
 *
 * The supported beam delivers its end shear low in the supporting beam's depth; the stirrups of
 * the supporting beam around the junction carry it up to its compression zone. The steel they
 * need there is Ah = Vu / (φ·fyt), placed within the supported beam's width plus the supporting
 * beam's depth (half each side of the junction). CIRSOC 201 has no article for it, so the rule
 * is stated as the practice it is, with φ = 0,75 as for the shear the force comes from.
 *
 * Pure: no store, no runes.
 */
import type { BeamLineReinforcement, BeamStirrupZone } from '../../design-contract/beam-line';

const PHI = 0.75;

/** Steel that hangs Vu (kN) at fyt (MPa), cm². */
export function hangerArea(Vu: number, fyt: number): number {
  return Vu > 0 && fyt > 0 ? (Vu / (PHI * Math.min(fyt, 420))) * 10 : 0;
}

/** The legs' area the line's stirrups place between `from` and `to`, cm². */
export function hangersPlaced(stirrups: readonly BeamStirrupZone[], from: number, to: number): number {
  let a = 0;
  for (const z of stirrups) {
    const s = Math.max(z.from, from), e = Math.min(z.to, to);
    if (e <= s || z.spacing <= 0) continue;
    const n = Math.floor((e - s) / z.spacing + 1e-9);
    a += n * z.legs * Math.PI * (z.diameter / 20) ** 2;
  }
  return a;
}

/**
 * The line with its stirrups closed up between `from` and `to` so they place at least `need` cm²:
 * the zones split at both ends and the ones between at the spacing that gives it (rounded down
 * to 2,5 cm), never wider than they were. With the legs and diameter they have; when that would
 * take a spacing under 5 cm, the line is returned with the spacing at 5 cm and the shortfall is
 * the caller's to say.
 */
export function withHangers(line: BeamLineReinforcement, from: number, to: number, need: number): BeamLineReinforcement {
  const cut = (zs: BeamStirrupZone[], x: number) => zs.flatMap((z) => (x > z.from + 1e-6 && x < z.to - 1e-6
    ? [{ ...z, id: `${z.id}a`, to: x }, { ...z, id: `${z.id}b`, from: x }] : [z]));
  let zs = cut(cut([...line.stirrups], from), to);
  const inside = zs.filter((z) => z.from >= from - 1e-6 && z.to <= to + 1e-6);
  const len = to - from;
  if (!inside.length || len <= 0) return line;
  // One spacing for the stretch, from its largest-leg zone: n stirrups of `legs` legs give need.
  const ref = inside.reduce((p, q) => (q.legs * q.diameter ** 2 > p.legs * p.diameter ** 2 ? q : p));
  const ab = ref.legs * Math.PI * (ref.diameter / 20) ** 2;
  const n = Math.max(1, Math.ceil(need / ab - 1e-9));
  const s = Math.max(0.05, Math.floor((len / n) * 40 + 1e-9) / 40);
  zs = zs.map((z) => (inside.includes(z) ? { ...z, spacing: Math.min(z.spacing, s) } : z));
  return { ...line, stirrups: zs.sort((p, q) => p.from - q.from), memberHashes: undefined };
}
