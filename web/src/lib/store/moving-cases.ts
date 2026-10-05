/**
 * A vehicle as static load cases, one per position along its path, a step apart: alternatives of
 * one group, so each combination takes one position at a time (`combination-cases.ts`), and the
 * envelope over the combinations is the vehicle's own over those positions. Traffic cases (Tr),
 * combined as imposed loads. One undo step.
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { t, tp } from '../i18n';
import { buildSolverInput3D } from '../engine/solver-service';
import { withoutSettlement } from '../engine/settlement-case';
import { buildPath3D } from '../engine/moving-loads-3d';
import { positionsAlong, trainModelLoads } from '../engine/vehicles';
import type { LoadTrain } from '../engine/moving-loads';

/** The most cases one run writes: more is a step to widen. */
export const MAX_POSITION_CASES = 150;

export function addPositionCases(train: LoadTrain, pathIds: number[], path2Ids: number[], step: number): { cases: number } | { error: string } {
  const base = buildSolverInput3D({ ...modelStore.model, supports: withoutSettlement(modelStore.model.supports) } as never, false, uiStore.axisConvention3D === 'leftHand');
  if (!base) return { error: t('moving.noModel') };
  const path = buildPath3D(base, pathIds);
  if (!path) return { error: t('moving.notAChain') };
  const path2 = path2Ids.length ? buildPath3D(base, path2Ids) : null;
  if (path2Ids.length && !path2) return { error: t('moving.notAChain') };
  const total = path.reduce((s, p) => s + p.length, 0);
  const refs = positionsAlong(train, total, step > 0 ? step : 1);
  if (refs.length > MAX_POSITION_CASES) return { error: tp('moving.tooManyPositions', { n: refs.length, max: MAX_POSITION_CASES }) };
  const group = `move:${train.name}`;
  modelStore.batch(() => {
    for (const r of refs) {
      const id = modelStore.addLoadCase(tp('moving.positionCase', { name: train.name, x: r.toFixed(2) }), 'Tr');
      modelStore.updateLoadCaseFields(id, { alternatives: group });
      for (const l of trainModelLoads(train, r, path, path2, id)) modelStore.addLoadEntry(l);
    }
  });
  return { cases: refs.length };
}
