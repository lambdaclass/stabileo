import type { ProvidedReinforcement, StirrupDef } from '../../design-contract/reinforcement';
import type { MemberContext } from '../design/member-context';
import { SPACING_GRID, STANDARD_STIRRUP_DIAS } from '../design/objective';
import { BEAM_LIMITS } from '../design/candidate-enumerate-beam';
import type { BeamContinuityAlternative } from './beam-continuity-alternatives';

/** Equal longitudinal bars need compatible seats inside their neighbours' stirrup bends.
 * Offer a common transverse diameter without reducing legs or steel area per unit length,
 * widening spacing, or changing longitudinal steel. This is a proposal: effective depth and
 * changed bends/anchors still require nominal and full-geometry verification.
 */
export function* beamStirrupContinuityAlternatives(
  contexts: readonly MemberContext[], current: readonly ProvidedReinforcement[],
): Generator<BeamContinuityAlternative> {
  if (!contexts.length || contexts.length !== current.length
    || contexts.some(c => c.elementType !== 'beam' || c.span)
    || current.some(r => !r.regions || r.regions.continuity)) return;
  const valid = (s: StirrupDef | undefined): s is StirrupDef => !!s
    && Number.isFinite(s.diameter) && s.diameter > 0 && Number.isSafeInteger(s.legs) && s.legs >= 2
    && Number.isFinite(s.spacing) && s.spacing > 0;
  const zones = current.map(r => ({ support: r.regions!.stirrupsSupport ?? r.stirrups,
    span: r.regions!.stirrupsSpan ?? r.stirrups }));
  if (zones.some(z => !valid(z.support) || !valid(z.span))
    || current.some(r => r.stirrups && !valid(r.stirrups))) return;
  const diameters = new Set(zones.flatMap((z, i) => [z.support!.diameter, z.span!.diameter,
    ...(current[i].stirrups ? [current[i].stirrups!.diameter] : [])]));
  if (diameters.size < 2) return;
  const largestCurrent = Math.max(...diameters);
  const allowed = contexts[0].material.stirrupDiametersMm ?? STANDARD_STIRRUP_DIAS;
  const options = [...new Set(allowed)].filter(d => Number.isFinite(d) && d > 0);
  const ordered = [largestCurrent, ...options.filter(d => d < largestCurrent).sort((a, b) => b - a),
    ...options.filter(d => d > largestCurrent).sort((a, b) => a - b)];
  for (const diameter of ordered) {
    if (contexts.some(c => !(c.material.stirrupDiametersMm ?? STANDARD_STIRRUP_DIAS).includes(diameter))) continue;
    const resize = (s: StirrupDef): StirrupDef => ({ ...s, diameter,
      spacing: diameter >= s.diameter ? s.spacing
        : +(Math.floor((s.spacing * (diameter / s.diameter) ** 2 + 1e-10) / SPACING_GRID) * SPACING_GRID).toFixed(4) });
    const reinforcement = current.map((r, i) => ({ ...r,
      ...(r.stirrups ? { stirrups: resize(r.stirrups) } : {}),
      regions: { ...r.regions,
        stirrupsSupport: resize(zones[i].support!),
        stirrupsSpan: resize(zones[i].span!),
      },
    }));
    if (reinforcement.some(r => [r.regions.stirrupsSupport, r.regions.stirrupsSpan, r.stirrups]
      .some(s => s && s.spacing < BEAM_LIMITS.minSpacing - 1e-9))) continue;
    yield { layers: [], stirrupDiameterMm: diameter, reinforcement };
  }
}
