/**
 * Notional loads in the combinations: to each combination without lateral load (no wind, no
 * earthquake), one variant per direction the model has notional cases for, each notional case
 * with the factor its source case has in the combination. A notional case is a fraction of its
 * source's gravity (`case-effects.ts`), so the variant carries that fraction of the combination's
 * own gravity, as the notional loads of a direct analysis are defined.
 *
 * Pure.
 */
import type { CaseCombination } from './combination-cases';
import type { LoadCase } from '../../store/model.svelte';

const LATERAL = new Set(['W', 'WA', 'E']);

export function withNotionalVariants(combos: readonly CaseCombination[], cases: readonly Pick<LoadCase, 'id' | 'type' | 'notional'>[]): CaseCombination[] {
  const notional = cases.filter((c) => c.notional);
  if (!notional.length) return [...combos];
  const typeOf = new Map(cases.map((c) => [c.id, (c.type ?? '').toUpperCase()]));
  const dirs = [...new Set(notional.map((c) => c.notional!.dir))];
  const out: CaseCombination[] = [];
  for (const c of combos) {
    out.push(c);
    if (c.factors.some((f) => f.factor !== 0 && LATERAL.has(typeOf.get(f.caseId) ?? ''))) continue;
    for (const dir of dirs) {
      const extra = notional.filter((n) => n.notional!.dir === dir).flatMap((n) => {
        const f = c.factors.find((x) => x.caseId === n.notional!.sourceCaseId)?.factor ?? 0;
        return f !== 0 ? [{ caseId: n.id, factor: f }] : [];
      });
      if (!extra.length) continue;
      out.push({ ...c, name: `${c.name} + N ${dir}`, factors: [...c.factors, ...extra] });
    }
  }
  return out;
}
