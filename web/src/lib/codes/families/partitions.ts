/**
 * The partition allowance of each family, an imposed load added to the floors' live load, by the
 * code's own rule. CIRSOC 101-2025's is `partitionLiveAllowance` (§4.3.2): at least 0,75 kN/m²,
 * none above Lo = 3,85 kN/m².
 *
 *   EN 1991-1-1 6.3.1.2(8)  movable partitions: qk = 0,5, 0,8 or 1,2 kN/m² for a partition weight
 *                           up to 1,0, 2,0 or 3,0 kN/m of wall; heavier ones are designed for
 *                           where they stand (9). The UK annex keeps the clause.
 *   ASCE/SEI 7-22 §4.3.2    at least 15 psf where partitions may move; none where Lo ≥ 80 psf;
 *                           not reduced.
 *   TS 498 §0.2.1           light partitions are a live load, with no value: the project's.
 *
 * Every allowance is added unreduced (`load-plan.ts`).
 */
import type { PartitionLiveAllowance } from '../cirsoc101/live-loads';
import { msg, round } from '../message';
import { EN1991_1_1 } from '../eurocode/refs';
import { A7, PSF } from '../asce7/refs';
import { TS498 } from '../turkey/refs';

/** What the dialog offers for the allowance: a value over a minimum, the code's fixed values, or a value of the project's. */
export type PartitionInput = { kind: 'minimum'; min: number } | { kind: 'choices'; values: readonly number[]; walls: readonly number[] } | { kind: 'typed' };

export const EC_PARTITIONS = { values: [0.5, 0.8, 1.2], walls: [1.0, 2.0, 3.0] } as const;

export function ecPartition(_lo: number, requested: number): PartitionLiveAllowance {
  const refs = [EN1991_1_1('6.3.1.2(8)', 'movable partitions')];
  const q = requested > 0 ? requested : 0;
  if (q === 0) return { qKNm2: 0, exempt: false, refs, message: msg('loads.ec.live.partitionOff') };
  const k = EC_PARTITIONS.values.findIndex((v) => Math.abs(v - q) < 1e-9);
  return {
    qKNm2: q, exempt: false, refs,
    message: k >= 0 ? msg('loads.ec.live.partitionApplied', { q: round(q, 3), wall: EC_PARTITIONS.walls[k]! }) : msg('loads.ec.live.partitionTyped', { q: round(q, 3) }),
  };
}

export const ASCE7_PARTITION_MIN = 15 * PSF;
export const ASCE7_PARTITION_EXEMPT = 80 * PSF;

export function asce7Partition(lo: number, requested: number): PartitionLiveAllowance {
  const refs = [A7('4.3.2', 'provision for partitions')];
  if (lo >= ASCE7_PARTITION_EXEMPT - 1e-9) {
    return { qKNm2: 0, exempt: true, refs, message: msg('loads.asce7.live.partitionExempt', { lo: round(lo, 2), limit: round(ASCE7_PARTITION_EXEMPT, 2) }) };
  }
  const q = requested > 0 ? requested : 0;
  return {
    qKNm2: q, exempt: false, refs,
    message: q === 0
      ? msg('loads.asce7.live.partitionOff', { min: round(ASCE7_PARTITION_MIN, 2) })
      : q < ASCE7_PARTITION_MIN - 1e-9
        ? msg('loads.asce7.live.partitionBelowMinimum', { q: round(q, 3), min: round(ASCE7_PARTITION_MIN, 2) })
        : msg('loads.asce7.live.partitionApplied', { q: round(q, 3) }),
  };
}

export function ts498Partition(_lo: number, requested: number): PartitionLiveAllowance {
  const refs = [TS498('0.2.1', 'hareketli yük')];
  const q = requested > 0 ? requested : 0;
  return { qKNm2: q, exempt: false, refs, message: q === 0 ? msg('loads.tr.live.partitionOff') : msg('loads.tr.live.partitionApplied', { q: round(q, 3) }) };
}
