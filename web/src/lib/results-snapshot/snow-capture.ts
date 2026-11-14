import type { SnapshotCase } from './corpus';
import { stepRoof } from '../engine/loads/__tests__/snow-step-fixture';
import { snow, skewRoof } from '../engine/loads/__tests__/snow-roof-plane-fixture';
import { asymmetric, concave, disjoint, twoPitch } from '../engine/loads/__tests__/snow-surface-round2-fixture';
import { snowLoadCases } from '../engine/loads/snow-loads';
import { gravityLayout } from '../engine/loads/plan-gravity';
import { flatten, FORMAT } from '../../../scripts/results-snapshot/compare.mjs';

export function captureSnow(c: SnapshotCase) {
  if (!('snowRoof' in c.source)) throw new Error('Expected a snow-roof snapshot');
  const extra = { asymmetric, concave, disjoint, 'two-pitch': twoPitch };
  const selected = c.source.snowRoof in extra ? extra[c.source.snowRoof as keyof typeof extra]() : undefined;
  const model = selected ?? (c.source.snowRoof === 'skew' ? skewRoof() : stepRoof(20, 0, 0.45, c.source.snowRoof === 'rotated-step' ? 0.37 : 0));
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const out = snowLoadCases({ model, snow: { ...snow, partial: true, roofKind: c.source.snowRoof === 'skew' ? 'mono' : 'gable' }, layout, tributaryWidth: 1 });
  if (!out || out.result.refused) throw new Error(out?.result.refused ?? 'Missing roof');
  const values: Record<string, number | string | boolean | null> = {};
  const indexed = <T>(list: T[]) => Object.fromEntries(list.map((v, k) => [`item${k}`, v]));
  flatten(indexed(out.cases.map(c => ({ ...c, distributed: indexed(c.distributed), nodal: indexed(c.nodal) }))), 'generatedLoads', values, new Set());
  flatten(out.derivation, 'snowDerivation', values);
  flatten(out.result, 'snowResult', values);
  return { case: c.name, covers: c.covers, format: FORMAT, values };
}
