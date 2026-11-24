/**
 * A vehicle as static load cases, one per position along its path, a step apart: alternatives of
 * one group, so each combination takes one position at a time (`combination-cases.ts`), and the
 * envelope over the combinations is the vehicle's own over those positions. Traffic cases (Tr),
 * combined as imposed loads. One undo step.
 *
 * Every train the vehicle stands for (each spacing of its variable gap, `vehicleTrains`) and, for a
 * train that is not symmetric, both ways along the path (`positionPasses`): the sweep's positions.
 * They used to be the first spacing's forward pass alone, so a continuous beam's pier moment, which
 * the longer spacings govern, came out short of the sweep (HS20 over 2 × 10 m: −244,8 kN·m for
 * −289,2). All of them go in one group: a combination takes one train at one position.
 *
 * The count is checked before anything is built: a step of a few millimetres made the list first.
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { t, tp } from '../i18n';
import { buildSolverInput3D } from '../engine/solver-service';
import { withoutSettlement } from '../engine/settlement-case';
import { buildPath3D } from '../engine/moving-loads-3d';
import { alignSecondLine, passCount, positionPasses, trainModelLoads } from '../engine/vehicles';
import { errorText } from '../utils/error-text';
import type { LoadTrain } from '../engine/moving-loads';

/** The most cases one run writes: more is a step to widen. */
export const MAX_POSITION_CASES = 150;

/** The alternatives group of a vehicle's position cases. */
export const movingGroup = (vehicle: string) => `move:${vehicle}`;

/**
 * Writes the cases of `trains` (one vehicle's, named `vehicle`) along the path, the second wheel
 * line run the first one's way (`alignSecondLine`). `notes` says what the second line does not
 * match, and when another vehicle's group multiplies the combinations.
 */
export function addPositionCases(
  vehicle: string, trains: readonly LoadTrain[], pathIds: number[], path2Ids: number[], step: number, gauge?: number | null,
): { cases: number; notes: Array<{ key: string; params: Record<string, number> }> } | { error: string } {
  if (trains.length === 0 || trains.every((tr) => tr.axles.every((a) => a.weight === 0))) return { error: t('moving.noAxles') };
  let base: ReturnType<typeof buildSolverInput3D>;
  try {
    base = buildSolverInput3D({ ...modelStore.model, supports: withoutSettlement(modelStore.model.supports) } as never, false, uiStore.axisConvention3D === 'leftHand');
  } catch (e) {
    // What the builder refuses (a semi-rigid end it cannot model) is said, not thrown past the panel.
    return { error: errorText(e, 'Error') };
  }
  if (!base) return { error: t('moving.noModel') };
  const path = buildPath3D(base, pathIds);
  if (!path) return { error: t('moving.notAChain') };
  const raw2 = path2Ids.length ? buildPath3D(base, path2Ids) : null;
  if (path2Ids.length && !raw2) return { error: t('moving.notAChain') };
  const line2 = raw2 ? alignSecondLine(base.nodes, path, raw2, gauge) : null;
  const total = path.reduce((s, p) => s + p.length, 0);
  const n = trains.reduce((s, tr) => s + passCount(tr, total, step), 0);
  if (n > MAX_POSITION_CASES) return { error: tp('moving.tooManyPositions', { n, max: MAX_POSITION_CASES, spacings: trains.length }) };
  const group = movingGroup(vehicle);
  // Raw (an i18n key and its values in SI): the panel words them in the display units.
  const notes = [...(line2?.notes ?? [])];
  // Another vehicle's group multiplies the combinations: each takes one position of every group.
  const others = new Map<string, number>();
  for (const lc of modelStore.model.loadCases) {
    if (lc.alternatives?.startsWith('move:') && lc.alternatives !== group) others.set(lc.alternatives, (others.get(lc.alternatives) ?? 0) + 1);
  }
  if (others.size > 0) {
    const mine = n + modelStore.model.loadCases.filter((lc) => lc.alternatives === group).length;
    notes.push({ key: 'moving.groupsMultiply', params: { groups: others.size + 1, n: [...others.values()].reduce((p, k) => p * k, mine) } });
  }
  modelStore.batch(() => {
    for (const train of trains) {
      for (const pass of positionPasses(train, total, step)) {
        for (const r of pass.refs) {
          const id = modelStore.addLoadCase(tp(pass.reversed ? 'moving.positionCaseBack' : 'moving.positionCase', { name: train.name, x: r.toFixed(2) }), 'Tr', { alternatives: group });
          for (const l of trainModelLoads(pass.train, r, path, line2?.path2 ?? null, id)) modelStore.addLoadEntry(l);
        }
      }
    }
  });
  return { cases: n, notes };
}
