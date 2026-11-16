export type Quadratic = [number, number, number];
export interface MemberMoments { x: Quadratic; y: Quadratic; z: Quadratic }
export const quadraticAt = (v: Quadratic, t: number) => 2 * (t - 0.5) * (t - 1) * v[0] + 4 * t * (1 - t) * v[1] + 2 * t * (t - 0.5) * v[2];
export function mapMoments(m: MemberMoments, f: (v: [number, number, number]) => [number, number, number]): MemberMoments {
  const values = [0, 1, 2].map(k => f([m.x[k]!, m.y[k]!, m.z[k]!]));
  return { x: values.map(v => v[0]) as Quadratic, y: values.map(v => v[1]) as Quadratic, z: values.map(v => v[2]) as Quadratic };
}
export function sliceMoments(m: MemberMoments, t0: number, t1: number): MemberMoments {
  const at = (v: Quadratic): Quadratic => [quadraticAt(v, t0), quadraticAt(v, (t0 + t1) / 2), quadraticAt(v, t1)];
  return { x: at(m.x), y: at(m.y), z: at(m.z) };
}
export function integrateQuadratic(v: Quadratic, a: number, b: number, x: number): number {
  const h = b - a;
  if (!(h > 0)) return 0;
  const t = Math.max(0, Math.min(1, (x - a) / h));
  return h * (v[0] * t + (-3 * v[0] + 4 * v[1] - v[2]) * t * t / 2 + (2 * v[0] - 4 * v[1] + 2 * v[2]) * t * t * t / 3);
}

export const hasMemberMoments = (m?: MemberMoments) => !!m && [m.x,m.y,m.z].some(v=>v.some(x=>x!==0));

export interface QuadraticProfilePiece { a: number; b: number; values: Quadratic[] }
export function coalesceQuadraticProfile(pieces: QuadraticProfilePiece[]): QuadraticProfilePiece[] {
  const at = (p: QuadraticProfilePiece, x: number) => p.values.map(v => quadraticAt(v, (x - p.a) / (p.b - p.a)));
  const forward = (ps: QuadraticProfilePiece[]) => {
    const out: QuadraticProfilePiece[] = [];
    for (const p of ps) {
      const last = out.at(-1);
      if (last && last.b === p.a) {
        const middle = (last.a + p.b) / 2, mid = at(middle <= last.b ? last : p, middle);
        const merged = { a: last.a, b: p.b, values: last.values.map((v, k) => [v[0], mid[k]!, p.values[k]![2]] as Quadratic) };
        const scale = last.values.flat().concat(p.values.flat()).reduce((sum, v) => sum + Math.abs(v), 0);
        if ([last, p].every(part => [part.a, (part.a + part.b) / 2, part.b].every(x => at(part, x).every((v, k) => Math.abs(v - at(merged, x)[k]!) <= 32 * Number.EPSILON * scale)))) {
          out[out.length - 1] = merged;
          continue;
        }
      }
      out.push(p);
    }
    return out;
  };
  const reverse = (ps: QuadraticProfilePiece[]) => [...ps].reverse().map(p => ({ a: -p.b, b: -p.a, values: p.values.map(v => [v[2], v[1], v[0]] as Quadratic) }));
  return reverse(forward(reverse(forward(pieces))));
}
