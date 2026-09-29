/**
 * The slenderness magnifier δns of a concrete column, for the verifier.
 *
 * The verifier multiplies a column's moments by `slenderDeltaNs`, and the capability matrix
 * says the check runs «with the value supplied». Nothing supplied it: the design run built its
 * contexts without it and every column was checked with δns = 1, while the older report did
 * amplify. This computes it with the same `checkSlender` the report uses (§6.6.4, non-sway),
 * per combination from the column's end forces, and keeps the largest.
 *
 * The section is read about its weaker axis (the smaller side as depth), which gives the larger
 * slenderness and the larger δns; the verifier applies the one value to both moment axes.
 */
import { checkSlender } from '../codes/argentina/cirsoc201';
import type { MemberContext } from './member-context';

export function columnDeltaNs(ctx: MemberContext, psi: { psiA: number; psiB: number }): number {
  if (ctx.elementType !== 'column' || !ctx.stations || !(ctx.L > 0)) return 1;
  const b = Math.max(ctx.section.b, ctx.section.h), h = Math.min(ctx.section.b, ctx.section.h);
  if (!(h > 0) || !(ctx.material.fc > 0)) return 1;
  const params = { fc: ctx.material.fc, fy: ctx.material.fy, cover: ctx.material.cover, b, h, stirrupDia: ctx.material.stirrupDia };
  let worst = 1;
  for (const combo of ctx.stations.comboResults) {
    const st = [...combo.stations].sort((x, y) => x.t - y.t);
    const i = st[0], j = st[st.length - 1];
    if (!i || !j) continue;
    const Nu = -Math.min(i.n, j.n); // compression positive
    if (!(Nu > 0.01)) continue;
    // The axis with the larger end moment in this combination.
    const useMy = Math.max(Math.abs(i.my), Math.abs(j.my)) >= Math.max(Math.abs(i.mz), Math.abs(j.mz));
    const mi = useMy ? i.my : i.mz, mj = useMy ? j.my : j.mz;
    const [big, small] = Math.abs(mi) >= Math.abs(mj) ? [mi, mj] : [mj, mi];
    const M2 = Math.abs(big);
    // The stations are the moment diagram: the same sign at both ends is single curvature,
    // M1/M2 positive; opposite signs are double curvature, negative.
    const M1 = Math.sign(mi) === Math.sign(mj) ? Math.abs(small) : -Math.abs(small);
    const r = checkSlender(params, Nu, M2, ctx.L, { M1, M2, psiA: psi.psiA, psiB: psi.psiB });
    if (r.isSlender && r.delta_ns > worst) worst = r.delta_ns;
  }
  return worst;
}
