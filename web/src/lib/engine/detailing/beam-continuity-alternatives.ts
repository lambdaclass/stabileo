/** Atomic longitudinal patterns for an adjacent beam pair or line. */
import type { ProvidedReinforcement, RebarLayer } from '../../design-contract/reinforcement';
import type { MemberContext } from '../design/member-context';
import { STANDARD_LONG_DIAS } from '../design/objective';
import { BEAM_LIMITS, maxBarsPerRow } from '../design/candidate-enumerate-beam';

export interface BeamContinuityAlternative {
  layers: RebarLayer[];
  bottomLayers?: RebarLayer[];
  reinforcement: ProvidedReinforcement[];
}

/**
 * Joint top/bottom alternatives: the widest face supplies the shared layout's pitch.
 * Changing only the top can therefore leave its larger bars on a smaller bottom pitch,
 * forcing extra rows and shorter hooks. Try one catalog diameter on both faces, with
 * independent area seeds. Every member still needs nominal and full-detail verification.
 */
export function* beamCageContinuityAlternatives(
  contexts: readonly MemberContext[], current: readonly ProvidedReinforcement[],
): Generator<BeamContinuityAlternative> {
  for (const top of beamContinuityAlternatives(contexts, current, 'top', 'catalog')) {
    for (const bottom of beamContinuityAlternatives(contexts, top.reinforcement, 'bottom', 'catalog')) {
      if (bottom.layers[0].diameter !== top.layers[0].diameter) continue;
      yield { layers: top.layers, bottomLayers: bottom.layers, reinforcement: bottom.reinforcement };
    }
  }
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
  patterns: 'existing' | 'catalog' = 'existing',
): Generator<BeamContinuityAlternative> {
  if (contexts.length < 2 || contexts.length !== current.length) return;
  if (contexts.some(c => c.elementType !== 'beam' || c.span)) return;
  if (current.some(r => !r.regions || r.regions.continuity || (face === 'top'
    ? r.regions.topStartGroups || r.regions.topEndGroups
    : r.regions.bottomGroups && r.regions.bottomGroups.length !== 1))) return;
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
    const area = Math.max(...orderedExisting.map(ls => ls.reduce((sum, l) => sum + l.count * l.diameter ** 2, 0)));
    const allowed = contexts[0].material.longDiametersMm ?? STANDARD_LONG_DIAS;
    for (const dia of [...new Set([16, 12, 20, 10, ...allowed])]) {
      if (contexts.some(c => !(c.material.longDiametersMm ?? STANDARD_LONG_DIAS).includes(dia))) continue;
      const limit = Math.min(...contexts.map((c, i) => maxBarsPerRow(c.axes.bFlex, c.material.cover,
        Math.max(c.material.stirrupDia, current[i].regions!.stirrupsSupport?.diameter ?? 0,
          current[i].regions!.stirrupsSpan?.diameter ?? 0, current[i].stirrups?.diameter ?? 0), dia)));
      if (limit < BEAM_LIMITS.minBarsPerRow) continue;
      const minimum = Math.max(BEAM_LIMITS.minBarsPerRow, Math.ceil(area / dia ** 2));
      for (const count of [minimum, minimum + 1]) {
        const rows = Math.ceil(count / limit);
        if (rows > BEAM_LIMITS.maxRows || count < rows * BEAM_LIMITS.minBarsPerRow) continue;
        let remaining = count;
        const layers = Array.from({ length: rows }, (_, row) => {
          const take = Math.min(limit, remaining - (rows - row - 1) * BEAM_LIMITS.minBarsPerRow);
          remaining -= take;
          return { row, count: take, diameter: dia };
        });
        yield layers;
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
      const stirrup = Math.max(ctx.material.stirrupDia,
        current[i].regions!.stirrupsSupport?.diameter ?? 0,
        current[i].regions!.stirrupsSpan?.diameter ?? 0, current[i].stirrups?.diameter ?? 0);
      return !(ctx.material.longDiametersMm ?? STANDARD_LONG_DIAS).includes(dia)
        || ordered.some(l => l.count > maxBarsPerRow(ctx.axes.bFlex, ctx.material.cover, stirrup, dia));
    })) continue;
    const key = JSON.stringify(ordered);
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
