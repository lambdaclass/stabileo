/** Small repairs of an existing beam cage; each proposal still needs full verification. */
import type { ProvidedReinforcement } from '../../design-contract/reinforcement';
import type { MemberContext } from '../design/member-context';
import { BEAM_LIMITS, maxBarsPerRow } from '../design/candidate-enumerate-beam';

const REGIONS = [
  ['bottomSpanLayers', 'bottomGroups'],
] as const;

export interface BeamLayerAlternative {
  reinforcement: ProvidedReinforcement;
  region: typeof REGIONS[number][0];
  counts: number[];
}

/**
 * Transfer one bar between adjacent existing rows, preserving steel area, diameter,
 * row elevations and end treatments. The centroid can change: no capacity is reused.
 * Multiple curtailment groups need a joint layout operator and are left untouched.
 * The first operator covers bottom steel only: top steel is reconciled across the
 * member and needs a coordinated proposal. At most four alternatives for three rows.
 * `preserveCurrent` instead offers only the existing populations with explicit physical
 * placement, because the shared coordination slots may have repacked them during generation.
 */
export function* beamLayerAlternatives(ctx: MemberContext, current: ProvidedReinforcement, preserveCurrent = false): Generator<BeamLayerAlternative> {
  if (ctx.elementType !== 'beam' || ctx.span || !current.regions) return;
  for (const [region, groupKey] of REGIONS) {
    const groups = current.regions[groupKey];
    if (groups && groups.length !== 1) continue;
    const original = groups?.[0].layers ?? current.regions[region];
    if (!original || original.length < 2 || original.length > BEAM_LIMITS.maxRows) continue;
    const layers = [...original].sort((a, b) => a.row - b.row);
    const dia = layers[0].diameter;
    if (!Number.isFinite(dia) || dia <= 0) continue;
    if (layers.some((l, i) => l.row !== i || l.diameter !== dia || !Number.isSafeInteger(l.count)
      || l.count < BEAM_LIMITS.minBarsPerRow)) continue;
    if (ctx.material.longDiametersMm && !ctx.material.longDiametersMm.includes(dia)) continue;
    const stirrupDia = Math.max(ctx.material.stirrupDia,
      current.regions.stirrupsSupport?.diameter ?? 0, current.regions.stirrupsSpan?.diameter ?? 0,
      current.stirrups?.diameter ?? 0);
    // This is an enumeration bound. Aggregate, bend seats, spacing and strength
    // are evaluated by the authoritative verifier and materialized detail below.
    const limit = maxBarsPerRow(ctx.axes.bFlex, ctx.material.cover, stirrupDia, dia);
    if (preserveCurrent) {
      // Coordination can repack a certified 8+5 cage onto the top group's slots.
      // First offer the certified populations themselves, before changing steel or rows.
      // It is still a physical proposal: both end joints and the full detail must pass.
      if (!current.regions.preserveBottomRows
        && layers.every((l, i) => l.count <= limit && (i === 0 || l.count <= layers[i - 1].count))) yield {
        region, counts: layers.map(l => l.count),
        reinforcement: { ...current, regions: { ...current.regions, preserveBottomRows: true } },
      };
      continue;
    }
    for (let row = 0; row + 1 < layers.length; row++) {
      for (const [from, to] of [[row, row + 1], [row + 1, row]]) {
        if (layers[from].count <= BEAM_LIMITS.minBarsPerRow || layers[to].count >= limit) continue;
        const changed = layers.map((l, i) => ({ ...l, count: l.count + (i === from ? -1 : i === to ? 1 : 0) }));
        if (changed.some((l, i) => i > 0 && l.count > changed[i - 1].count)) continue;
        yield {
          region, counts: changed.map(l => l.count),
          reinforcement: { ...current, regions: { ...current.regions,
            preserveBottomRows: true,
            [region]: changed,
            ...(groups ? { [groupKey]: [{ ...groups[0], layers: changed }] } : {}),
          } },
        };
      }
    }
  }
}
