/**
 * A T or L beam's flange as its sections draw it and its top bars over the supports where the
 * flange is in tension (§24.3.4; FIUBA p. 72 and p. 89): the extra top bars of a support spread in
 * the flange over the lesser of its effective width and ln/10, the continuous ones kept in the web.
 */

/** A span's flange: its effective width and thickness, the sides it stands on (+1 left of the line), and the width the top bars over a support spread across. */
export interface SpanFlange { bf: number; hf: number; sides: Array<1 | -1>; spread: number }

/** The flange of a span from its demand: none without one or with no slab side to stand on. */
export function spanFlange(d: { b: number; length: number; flange?: { bf: number; hf: number; kind?: 'T' | 'L'; own?: true }; slabs?: ReadonlyArray<{ side: 1 | -1 }> }): SpanFlange | null {
  const f = d.flange;
  if (!f || f.bf <= d.b + 1e-6) return null;
  const sides: Array<1 | -1> = f.own ? [1, -1] : [...new Set((d.slabs ?? []).map((s) => s.side))];
  if (!sides.length) return null;
  return { bf: f.bf, hf: f.hf, sides, spread: Math.min(f.bf, d.length / 10) };
}

/** Where `count` top bars over a support stand across, m from the web's axis, in the flange beside a web `b` wide; none where the flange is too narrow to take them. */
export function flangeTopAcross(fl: SpanFlange, b: number, cover: number, count: number): number[] | null {
  const room = fl.sides.length === 2 ? (fl.spread - b) / 2 : fl.spread - b;
  if (count <= 0 || room < 2 * cover + 0.05) return null;
  const perSide = fl.sides.map((_, i) => Math.floor(count / fl.sides.length) + (i < count % fl.sides.length ? 1 : 0));
  return fl.sides.flatMap((side, i) => {
    const n = perSide[i]!, lo = b / 2 + cover + 0.025, hi = b / 2 + room - cover;
    return Array.from({ length: n }, (_, k) => side * (n === 1 ? (lo + hi) / 2 : lo + ((hi - lo) * k) / (n - 1)));
  });
}
