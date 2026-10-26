/** Atomic longitudinal patterns for a beam segment; demand-based repair also admits one member. */
import type { ProvidedReinforcement, RebarLayer } from '../../design-contract/reinforcement';
import { minClearSpacingInLayer } from '../../codes/cirsoc201/spacing';
import { seatedLongitudinalHalfExtents } from '../../codes/cirsoc201/transverse-cage';
import { DEFAULT_TOLERANCES } from './collision';
import type { MemberContext } from '../design/member-context';
import { STANDARD_LONG_DIAS } from '../design/objective';
import { BEAM_LIMITS, computeBeamSeed, maxBarsPerRow, seedAreaFor } from '../design/candidate-enumerate-beam';

export interface BeamContinuityAlternative {
  /** Longitudinal layers changed by this proposal; empty for transverse-only repair. */
  layers: RebarLayer[];
  bottomLayers?: RebarLayer[];
  stirrupDiameterMm?: number;
  reinforcement: ProvidedReinforcement[];
}

/**
 * Joint top/bottom alternatives: the widest face supplies the shared layout's pitch.
 * Changing only the top can therefore leave its larger bars on a smaller bottom pitch,
 * forcing extra rows and shorter hooks. Try common diameters or different families on
 * opposite faces (shorter bottom hooks can need smaller bars), with independent area seeds.
 * Every member still needs nominal and full-detail verification.
 */
export function* beamCageContinuityAlternatives(
  contexts: readonly MemberContext[], current: readonly ProvidedReinforcement[],
  diameters: 'common' | 'mixed' | 'all' = 'common',
  seed: 'retained' | 'demand' = 'retained',
): Generator<BeamContinuityAlternative> {
  const mixed: Array<{ proposal: BeamContinuityAlternative; topIndex: number; bottomIndex: number }> = [];
  let topIndex = 0;
  for (const top of beamContinuityAlternatives(contexts, current, 'top', seed === 'demand' ? 'demand' : 'catalog')) {
    let bottomIndex = 0;
    for (const bottom of beamContinuityAlternatives(contexts, top.reinforcement, 'bottom', seed === 'demand' ? 'demand' : 'catalog')) {
      const index = bottomIndex++;
      if (diameters !== 'all' && (bottom.layers[0].diameter === top.layers[0].diameter) !== (diameters === 'common')) continue;
      const proposal = { layers: top.layers, bottomLayers: bottom.layers, reinforcement: bottom.reinforcement };
      if (diameters === 'common') yield proposal;
      else mixed.push({ proposal, topIndex, bottomIndex: index });
    }
    topIndex++;
  }
  // Explore both faces' preferred families before exhausting one face's entire catalog
  // with the other's first pattern. These lists are bounded by diameter and count limits.
  mixed.sort((a, b) => Math.max(a.topIndex, a.bottomIndex) - Math.max(b.topIndex, b.bottomIndex)
    || a.topIndex + a.bottomIndex - b.topIndex - b.bottomIndex || a.topIndex - b.topIndex);
  if (seed === 'demand') {
    // Row/count variants must not consume the budget before another diameter family
    // gets a first trial. Keep the existing preference order within each face pair,
    // then round-robin the pairs; failed-check guidance may still reorder them later.
    const families = new Map<string, BeamContinuityAlternative[]>();
    for (const { proposal } of mixed) {
      const key = `${proposal.layers[0].diameter}/${proposal.bottomLayers![0].diameter}`;
      const family = families.get(key) ?? [];
      family.push(proposal); families.set(key, family);
    }
    const rounds = Math.max(0, ...[...families.values()].map(f => f.length));
    for (let index = 0; index < rounds; index++)
      for (const family of families.values()) if (family[index]) yield family[index];
    return;
  }
  for (const { proposal } of mixed) yield proposal;
}

/**
 * Reuse each existing pattern, or propose common catalog families, throughout the line. The generator may then
 * carry equal bars through their shared support. This is a proposal, not a continuity proof:
 * different sections, seats, demand and neighbours still require full detailing.
 * Explicit curtailment/groups and multi-element spans need a different operator.
 */
export function* beamContinuityAlternatives(
  contexts: readonly MemberContext[],
  current: readonly ProvidedReinforcement[],
  face: 'top' | 'bottom' = 'top',
  patterns: 'existing' | 'catalog' | 'demand' = 'existing',
): Generator<BeamContinuityAlternative> {
  if (contexts.length < (patterns === 'demand' ? 1 : 2) || contexts.length !== current.length) return;
  if (contexts.some(c => c.elementType !== 'beam' || c.span)) return;
  if (current.some(r => !r.regions || r.regions.continuity || (face === 'top'
    ? r.regions.topStartGroups || r.regions.topEndGroups
    : r.regions.bottomGroups && r.regions.bottomGroups.length !== 1))) return;
  // Preserved bottom rows must fit between the actual bend seats, not the straight
  // stirrup legs. Read the same aggregate/edition spacing and placement margin as the
  // generator; otherwise a nominally feasible row is silently repacked during detailing.
  const rowLimit = (ctx: MemberContext, r: ProvidedReinforcement, dia: number) => {
    const stirrup = Math.max(ctx.material.stirrupDia, r.regions!.stirrupsSupport?.diameter ?? 0,
      r.regions!.stirrupsSpan?.diameter ?? 0, r.stirrups?.diameter ?? 0);
    const limit = maxBarsPerRow(ctx.axes.bFlex, ctx.material.cover, stirrup, dia);
    if (face !== 'bottom') return limit;
    const half = seatedLongitudinalHalfExtents(ctx.axes.bFlex, ctx.axes.hFlex,
      ctx.material.cover, stirrup, dia).corner.halfAcross;
    const gap = minClearSpacingInLayer(ctx.codeEdition, {
      barDiameterMm: dia, maxAggregateSizeMm: ctx.material.maxAggregateSize.value,
    }).minClear + DEFAULT_TOLERANCES.placement;
    return Math.min(limit, Math.floor((2 * half + dia / 1000 + gap) / (dia / 1000 + gap)));
  };
  const seen = new Set<string>();
  const regions = face === 'top' ? ['topStart', 'topEnd'] as const : ['bottomSpan'] as const;
  const existing: RebarLayer[][] = [];
  for (const r of current) for (const region of regions) {
    const group = r.regions![region];
    const layers = (face === 'bottom' ? r.regions!.bottomGroups?.[0].layers : undefined)
      ?? r.regions![`${region}Layers`] ?? (group ? [{ ...group, row: 0 }] : []);
    existing.push(layers);
  }
  const valid = (layers: RebarLayer[]) => layers.length > 0 && layers.length <= BEAM_LIMITS.maxRows
    && layers.every((l, i) => l.row === i && Number.isFinite(l.diameter) && l.diameter > 0
      && l.diameter === layers[0].diameter && Number.isSafeInteger(l.count) && l.count >= BEAM_LIMITS.minBarsPerRow);
  const orderedExisting = existing.map(l => [...l].sort((a, b) => a.row - b.row));
  function* candidates(): Generator<RebarLayer[]> {
    if (patterns === 'existing') { yield* orderedExisting; return; }
    // Area is a seed, never a resistance certificate. Offer the smallest equal-or-larger
    // area in each common diameter family, and one extra bar to explore count parity.
    if (!orderedExisting.every(valid)) return;
    if (patterns === 'demand' && contexts.some(c => !c.stations?.comboResults.some(r => r.stations.length))) return;
    // A nearly passing final-depth design may lie below the approximate area seed.
    // Explore its existing rows and one-bar increments before replacing both faces.
    // These are bounded proposals; the same catalog/spacing and verification gates apply.
    if (patterns === 'demand' && contexts.some(c => c.finalGeometry)) {
      for (const layers of orderedExisting) {
        yield layers;
        for (let row = 0; row < layers.length; row++)
          yield layers.map((l, i) => ({ ...l, count: l.count + (i === row ? 1 : 0) }));
      }
    }
    // Retained steel is not a lower bound on required steel. Repeated area-preserving
    // repairs can ratchet up congestion. Demand seeds reopen lighter alternatives; only
    // the authoritative verifier, including opposite-sign moments and torsion, accepts them.
    const area = patterns === 'demand' ? Math.max(...contexts.map(c => {
      const demands = computeBeamSeed(c);
      const moment = face === 'top' ? Math.max(demands.MuStart, demands.MuEnd, demands.MuSpanHog)
        : Math.max(demands.MuSpan, demands.MuStartSag, demands.MuEndSag);
      // seedAreaFor is in cm²; the catalog below works in count × diameter(mm)².
      return seedAreaFor(moment, c) * 400 / Math.PI;
    })) : Math.max(...orderedExisting.map(ls => ls.reduce((sum, l) => sum + l.count * l.diameter ** 2, 0)));
    const allowed = contexts[0].material.longDiametersMm ?? STANDARD_LONG_DIAS;
    for (const dia of [...new Set([16, 12, 20, 10, ...allowed])]) {
      if (contexts.some(c => !(c.material.longDiametersMm ?? STANDARD_LONG_DIAS).includes(dia))) continue;
      const limit = Math.min(...contexts.map((c, i) => rowLimit(c, current[i], dia)));
      if (limit < BEAM_LIMITS.minBarsPerRow) continue;
      const minimum = Math.max(BEAM_LIMITS.minBarsPerRow, Math.ceil(area / dia ** 2));
      // The demand estimate orders alternatives; it is not a lower bound on required area.
      // One fewer bar can avoid an entire layer and its nested hooks. Verification decides.
      const counts = patterns === 'demand'
        ? [...new Set([minimum, minimum + 1, Math.max(BEAM_LIMITS.minBarsPerRow, minimum - 1)])]
        : [minimum, minimum + 1];
      for (const count of counts) {
        const rows = Math.ceil(count / limit);
        if (rows > BEAM_LIMITS.maxRows || count < rows * BEAM_LIMITS.minBarsPerRow) continue;
        let remaining = count;
        const layers = Array.from({ length: rows }, (_, row) => {
          const take = Math.min(limit, remaining - (rows - row - 1) * BEAM_LIMITS.minBarsPerRow);
          remaining -= take;
          return { row, count: take, diameter: dia };
        });
        yield layers;
        if (patterns === 'demand' && face === 'bottom') {
          // Bottom row populations are materialized by preserveBottomRows. Top rows
          // are still repacked by coordination, so do not offer fictitious top variants.
          // A packed outer row can be the joint bottleneck. Keep the same steel and
          // offer an even distribution, including one extra row to clear a crowded joint.
          // Its centroid changes, so this is only a proposal, never a reused capacity.
          for (const n of [rows, rows + 1]) {
            if (n > BEAM_LIMITS.maxRows || count < n * BEAM_LIMITS.minBarsPerRow) continue;
            yield Array.from({ length: n }, (_, row) => ({ row, diameter: dia,
              count: Math.floor(count / n) + (row < count % n ? 1 : 0) }));
            // Packed and balanced rows miss intermediate populations such as 6+3
            // between 7+2 and 5+4. An even outer row avoids a central column post
            // without adding steel. Enumerate non-increasing partitions, bounded by
            // the same three-row/twelve-bars-per-row limits and the common clear width.
            function* partitions(left: number, rowsLeft: number, cap: number): Generator<number[]> {
              if (rowsLeft === 0) { if (left === 0) yield []; return; }
              for (let take = Math.min(cap, left - (rowsLeft - 1) * BEAM_LIMITS.minBarsPerRow);
                take >= Math.max(BEAM_LIMITS.minBarsPerRow, Math.ceil(left / rowsLeft)); take--)
                for (const rest of partitions(left - take, rowsLeft - 1, take)) yield [take, ...rest];
            }
            for (const split of partitions(count, n, limit))
              yield split.map((count, row) => ({ row, count, diameter: dia }));
          }
        }
      }
    }
  }
  for (const layers of candidates()) {
    if (!layers.length || layers.length > BEAM_LIMITS.maxRows) continue;
    const ordered = [...layers].sort((a, b) => a.row - b.row);
    const dia = ordered[0].diameter;
    if (!Number.isFinite(dia) || dia <= 0 || ordered.some((l, i) => l.row !== i
      || l.diameter !== dia || !Number.isSafeInteger(l.count) || l.count < BEAM_LIMITS.minBarsPerRow)) continue;
    if (contexts.some((ctx, i) => {
      return !(ctx.material.longDiametersMm ?? STANDARD_LONG_DIAS).includes(dia)
        || ordered.some(l => l.count > rowLimit(ctx, current[i], dia));
    })) continue;
    const key = ordered.map(l => `${l.row}:${l.count}:${l.diameter}`).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const count = ordered.reduce((sum, l) => sum + l.count, 0);
    const copy = (r: ProvidedReinforcement): ProvidedReinforcement => ({ ...r, regions: face === 'top' ? {
      ...r.regions, topStart: { count, diameter: dia }, topEnd: { count, diameter: dia },
      topStartLayers: ordered.map(l => ({ ...l })), topEndLayers: ordered.map(l => ({ ...l })),
    } : {
      ...r.regions, bottomSpan: { count, diameter: dia }, bottomSpanLayers: ordered.map(l => ({ ...l })),
      preserveBottomRows: true,
      ...(r.regions!.bottomGroups ? { bottomGroups: [{ ...r.regions!.bottomGroups[0],
        layers: ordered.map(l => ({ ...l })) }] } : {}),
    } });
    yield { layers: ordered.map(l => ({ ...l })), reinforcement: current.map(copy) };
  }
}
