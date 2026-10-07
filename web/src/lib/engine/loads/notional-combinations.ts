/**
 * Notional loads in the combinations: to each combination without lateral load (no wind, no
 * earthquake), one variant per direction the model has notional cases for, each notional case
 * with the factor its source case has in the combination. A notional case is a fraction of its
 * source's gravity (`case-effects.ts`), so the variant carries that fraction of the combination's
 * own gravity, as the notional loads of a direct analysis are defined. A service combination takes
 * none: notional loads stand for the imperfections a strength check accounts for, and a deflection
 * read under them would be a deflection no load makes.
 *
 * Pure.
 */
import type { CaseCombination } from './combination-cases';
import type { LoadCase } from '../../store/model.svelte';

const LATERAL = new Set(['W', 'WA', 'E']);

export function withNotionalVariants(combos: readonly CaseCombination[], cases: readonly Pick<LoadCase, 'id' | 'type' | 'notional' | 'includes'>[]): CaseCombination[] {
  const notional = cases.filter((c) => c.notional);
  if (!notional.length) return [...combos];
  const byId = new Map(cases.map((c) => [c.id, c]));
  /*
   * A composite case is lateral when something it takes in is, at any depth; its own type is a
   * label, and the generator leaves composites out of the type symbols for the same reason.
   */
  const lateral = (id: number, seen = new Set<number>()): boolean => {
    const c = byId.get(id);
    if (!c || seen.has(id)) return false;
    seen.add(id);
    if (c.includes?.length) return c.includes.some((i) => i.factor !== 0 && lateral(i.caseId, seen));
    return LATERAL.has((c.type ?? '').toUpperCase());
  };
  const dirs = [...new Set(notional.map((c) => c.notional!.dir))];
  const out: CaseCombination[] = [];
  for (const c of combos) {
    out.push(c);
    if (c.purpose === 'service') continue;
    if (c.factors.some((f) => f.factor !== 0 && lateral(f.caseId))) continue;
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
