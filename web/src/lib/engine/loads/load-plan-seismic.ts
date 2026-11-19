import { modalSeismicRefusal } from './seismic-generation';
import { staticSeismicCases, ACCIDENTAL_ECCENTRICITY } from './seismic-cases';
import { clause, fromProject, type ProvenancedValue } from '../../codes/regulation';
import { designSpectrum, isBlocked, SIMULTANEITY_F1 } from '../../codes/cirsoc103/spectrum';
import { designPeriod, designSeismicCoefficient, distributeInHeight, staticMethodApplicable } from '../../codes/cirsoc103/static-method';
import { findBehaviour, R_ELASTIC } from '../../codes/cirsoc103/behaviour';
import { msg, round } from '../../codes/message';
import { findCase, type LoadPlanInput, type SeismicPlanSink, type SeismicPlanDetail } from './load-plan';

import type { MassRefusal, SeismicLevel, SeismicModel } from './seismic-mass';

export function planSeismic(input: LoadPlanInput, model: SeismicModel, sink: SeismicPlanSink): {
  seismicWeight: ProvenancedValue<number> | undefined; baseShear: ProvenancedValue<number> | undefined; seismicDetail: SeismicPlanDetail | undefined;
} {
  const { cases, distributed, surface, derivation, refs, assumptions, unsupportedKeys, blockedKeys, levelRefusals } = sink;
  let seismicWeight: ProvenancedValue<number> | undefined;
  let baseShear: ProvenancedValue<number> | undefined;
  let seismicDetail: SeismicPlanDetail | undefined;
  const modalRefusal = modalSeismicRefusal(input.seismic);
  if (modalRefusal) {
    blockedKeys.push(modalRefusal);
    return { seismicWeight, baseShear, seismicDetail };
  }
  if (input.seismic?.enabled) {
    const { datum, levels } = model;
    if ('refusal' in datum) {
      blockedKeys.push(msg(`loadPlan.blocked.${datum.refusal}`));
      return { seismicWeight, baseShear, seismicDetail };
    }
    const refuse = (level: SeismicLevel, reason: MassRefusal) => {
      levelRefusals.push(msg(`loadPlan.blocked.seismicMass.${reason}`, { elevation: round(level.elevation, 3) }));
    };
    for (const l of levels) for (const reason of l.refusals) refuse(l, reason);
    if (levels.some(l => l.unresolvedWeight)) {
      return { seismicWeight, baseShear, seismicDetail };
    }
    const base = datum.elevation;
    const structuralStories = levels.filter(level => level.elevation > base);
    const massLevels = structuralStories.filter(level => level.weightKN > 0);
    const stories = massLevels.map(level => ({ h: level.elevation - base, w: level.weightKN }));
    const W = stories.reduce((sum, story) => sum + story.w, 0);
    if (W <= 0) {
      unsupportedKeys.push(msg('loadPlan.unsupported.noSeismicMass'));
    } else {
      const code = input.seismic.code;
      let C = input.seismic.coefficient;
      let uncappedT = 0;
      let t2 = Infinity;
      seismicDetail = { source: 'manual', c: C, stories };

      if (code) {
        const spectrum = designSpectrum({ zone: code.zone, site: code.site, na: code.na, nv: code.nv });
        if (isBlocked(spectrum)) {
          blockedKeys.push(spectrum.blocked);
          refs.push(...spectrum.refs);
        } else {
          const H = structuralStories.reduce((max, story) => Math.max(max, story.elevation - base), 0);
          const period = designPeriod(
            { heightM: H, system: code.periodSystem, computedT: code.computedT },
            spectrum.as,
          );
          /* [6.12]/[6.13] test the period WITHOUT the [6.7] cap — the clause says so,
             and using the capped one would shorten it and skip the extra force. */
          uncappedT = code.computedT !== undefined && code.computedT > 0 ? code.computedT : period.ta;
          t2 = spectrum.t2;

          const applicability = staticMethodApplicable({
            zone: code.zone, group: code.group, heightM: H, levels: structuralStories.length,
            regularity: code.regularity, t: uncappedT, t2,
          });
          refs.push(...applicability.refs);
          for (const r of applicability.reasons) {
            if (r.key.startsWith('seismic.blocked.')) blockedKeys.push(r);
            else assumptions.push(r);
          }

          const entry = findBehaviour(code.systemKey);
          const R = code.elastic ? R_ELASTIC : entry?.r ?? null;
          if (R === null) {
            /* Tabla 5.1 row 1 prints a formula on the wall layout, not a value; an
               unknown key is the same hole. Either way there is no R to divide by. */
            blockedKeys.push(msg('loadPlan.blocked.seismicNoR', { system: code.systemKey }));
          } else if (applicability.allowed) {
            const coeff = designSeismicCoefficient({
              spectrum, group: code.group, r: R, t: period.t,
            });
            C = coeff.c;
            refs.push(...period.refs, ...coeff.refs);
            derivation.push(period.derivation, ...coeff.derivation);
            assumptions.push(...spectrum.assumptions);
            seismicDetail = {
              source: 'cirsoc103', stories, zone: spectrum.zone, spectralType: spectrum.type,
              ca: spectrum.ca, cv: spectrum.cv, t1: spectrum.t1, t2: spectrum.t2,
              t3: spectrum.t3, t: period.t, ta: period.ta, periodCapped: period.capped,
              r: R, gammaR: coeff.gammaR, c: C, floorApplied: coeff.floorApplied,
              f1: SIMULTANEITY_F1[code.occupancy],
            };
          }
        }
      }

      const V0 = C * W;
      seismicWeight = fromProject(W, 'kN');
      baseShear = fromProject(V0, 'kN');

      const dist = distributeInHeight(stories, V0, uncappedT, t2);
      refs.push(...dist.refs);
      derivation.push(dist.derivation);
      if (seismicDetail) seismicDetail.topHeavy = dist.topHeavy;
      const staticForces = stories.map((_, k) => dist.forces[k]?.f ?? 0);
      const torsion = input.seismic.torsion ?? 'low';
      if (torsion !== 'low') {
        refs.push(clause('inpres-cirsoc-103-i', '2018', '6.2.4.2', 'torsión accidental'));
        derivation.push(msg('loadPlan.derivation.accidentalTorsion', { e: ACCIDENTAL_ECCENTRICITY[torsion] * 100 }));
      }
      if (input.seismic.diagonal) refs.push(clause('inpres-cirsoc-103-i', '2018', '3.2', 'direcciones de análisis'));
      for (const c of staticSeismicCases({
        levels: massLevels, forces: staticForces, diagonal: input.seismic.diagonal,
        directions: input.seismic.directions, torsion,
      }, refuse)) {
        const index = cases.length;
        const plain = c.nameKey === 'autoLoad.seismicCaseDir' && c.axis !== 'diagonal';
        cases.push({ existingId: plain ? findCase(input.model, 'E', c.axis) : null, type: 'E', nameKey: c.nameKey, nameParams: c.nameParams });
        for (const d of c.distributed) distributed.push({ ...d, caseType: 'E', caseIndex: index });
        for (const s of c.surface) surface.push({ ...s, caseType: 'E', caseIndex: index });
      }

      derivation.push(msg('loadPlan.derivation.seismic', {
        weight: round(W, 1), coefficient: round(C, 4), baseShear: round(V0, 1),
      }));
    }
  }
  return { seismicWeight, baseShear, seismicDetail };
}
