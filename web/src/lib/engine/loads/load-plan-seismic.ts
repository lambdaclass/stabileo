/**
 * The seismic action of a load plan, INPRES-CIRSOC 103-2018: the static method of Cap. 6 or the
 * modal response spectrum of Cap. 7, accidental torsion and a 45° direction. Moved out of
 * `load-plan.ts` as it was, behind the seismic module (`codes/families/cirsoc.ts`).
 */
import { modalStoryForces } from './seismic-modal';
import { seismicCases, ACCIDENTAL_ECCENTRICITY } from './seismic-cases';
import { clause, fromProject, type ProvenancedValue } from '../../codes/regulation';
import { designSpectrum, isBlocked, spectralOrdinate, SIMULTANEITY_F1 } from '../../codes/cirsoc103/spectrum';
import { designPeriod, designSeismicCoefficient, distributeInHeight, staticMethodApplicable } from '../../codes/cirsoc103/static-method';
import { findBehaviour, R_ELASTIC } from '../../codes/cirsoc103/behaviour';
import { msg, round } from '../../codes/message';
import { findCase, type LevelMass, type LoadPlanInput, type PlanSink, type SeismicPlanDetail } from './load-plan';

export function planSeismic(input: LoadPlanInput, levels: LevelMass[], sink: PlanSink): {
  seismicWeight: ProvenancedValue<number> | undefined; baseShear: ProvenancedValue<number> | undefined; seismicDetail: SeismicPlanDetail | undefined;
} {
  const { cases, nodal, derivation, refs, assumptions, unsupportedKeys, blockedKeys } = sink;
  let seismicWeight: ProvenancedValue<number> | undefined;
  let baseShear: ProvenancedValue<number> | undefined;
  let seismicDetail: SeismicPlanDetail | undefined;
  if (input.seismic?.enabled) {
    const elevated = levels.filter((l) => l.elevation > 0 && l.weightKN > 0);
    const W = elevated.reduce((s, l) => s + l.weightKN, 0);
    if (W <= 0) {
      unsupportedKeys.push(msg('loadPlan.unsupported.noSeismicMass'));
    } else {
      const code = input.seismic.code;
      let C = input.seismic.coefficient;
      let uncappedT = 0;
      let t2 = Infinity;
      seismicDetail = { source: 'manual', c: C };

      if (code) {
        const spectrum = designSpectrum({ zone: code.zone, site: code.site, na: code.na, nv: code.nv });
        if (isBlocked(spectrum)) {
          blockedKeys.push(spectrum.blocked);
          refs.push(...spectrum.refs);
        } else {
          const H = Math.max(...elevated.map((l) => l.elevation), 0);
          const period = designPeriod(
            { heightM: H, system: code.periodSystem, computedT: code.computedT },
            spectrum.as,
          );
          /* [6.12]/[6.13] test the period WITHOUT the [6.7] cap — the clause says so,
             and using the capped one would shorten it and skip the extra force. */
          uncappedT = code.computedT !== undefined && code.computedT > 0 ? code.computedT : period.ta;
          t2 = spectrum.t2;

          const applicability = staticMethodApplicable({
            zone: code.zone, group: code.group, heightM: H, levels: elevated.length,
            regularity: code.regularity, t: uncappedT, t2,
          });
          refs.push(...applicability.refs);
          // With the modal method the static one need not apply (§2.7.3 asks for the modal one
          // where it does not); it still gives Voe for §7.2.5.
          const modal = input.seismic.modal && input.seismic.modal.modes.length > 0;
          for (const r of applicability.reasons) {
            if (r.key.startsWith('seismic.blocked.')) (modal ? derivation : blockedKeys).push(r);
            else assumptions.push(r);
          }

          const entry = findBehaviour(code.systemKey);
          const R = code.elastic ? R_ELASTIC : entry?.r ?? null;
          if (R === null) {
            /* Tabla 5.1 row 1 prints a formula on the wall layout, not a value; an
               unknown key is the same hole. Either way there is no R to divide by. */
            blockedKeys.push(msg('loadPlan.blocked.seismicNoR', { system: code.systemKey }));
          } else if (applicability.allowed || modal) {
            const coeff = designSeismicCoefficient({
              spectrum, group: code.group, r: R, t: period.t,
            });
            C = coeff.c;
            refs.push(...period.refs, ...coeff.refs);
            derivation.push(period.derivation, ...coeff.derivation);
            assumptions.push(...spectrum.assumptions);
            seismicDetail = {
              source: 'cirsoc103', zone: spectrum.zone, spectralType: spectrum.type,
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

      const dist = distributeInHeight(
        elevated.map((l) => ({ h: l.elevation, w: l.weightKN })), V0, uncappedT, t2,
      );
      refs.push(...dist.refs);
      derivation.push(dist.derivation);
      if (seismicDetail) seismicDetail.topHeavy = dist.topHeavy;
      let forcesX = elevated.map((_, k) => dist.forces[k]?.f ?? 0);
      let forcesY = forcesX;

      // ── The modal response spectrum method, Cap. 7 ──
      const modes = input.seismic.modal?.modes ?? [];
      if (modes.length > 0 && seismicDetail?.source === 'cirsoc103' && code) {
        const spectrum = designSpectrum({ zone: code.zone, site: code.site, na: code.na, nv: code.nv });
        if (!isBlocked(spectrum)) {
          const r = seismicDetail.r!, gr = seismicDetail.gammaR!;
          refs.push(clause('inpres-cirsoc-103-i', '2018', '7.2', 'método modal espectral'));
          const byDir = (dir: 'x' | 'y') => {
            const m = modalStoryForces(elevated, modes, dir, (t) => (spectralOrdinate(t, spectrum) * gr) / r);
            // §7.2.5: no less than 85 % of the static base shear.
            const scale = m.baseShear > 0 && m.baseShear < 0.85 * V0 ? (0.85 * V0) / m.baseShear : 1;
            derivation.push(msg('loadPlan.derivation.modal', {
              dir: dir.toUpperCase(), modes: m.perMode.length, ratio: round(m.massRatio * 100, 1),
              vod: round(m.baseShear, 1), voe: round(V0, 1), scale: round(scale, 3),
            }));
            if (m.massRatio < 0.9) unsupportedKeys.push(msg('loadPlan.note.modalMassShort', { dir: dir.toUpperCase(), ratio: round(m.massRatio * 100, 1) }));
            return m.forces.map((f) => f * scale);
          };
          if (input.seismic.directions.x) forcesX = byDir('x');
          if (input.seismic.directions.y) forcesY = byDir('y');
        }
      }

      const torsion = input.seismic.torsion ?? 'low';
      if (torsion !== 'low') {
        refs.push(clause('inpres-cirsoc-103-i', '2018', '6.2.4.2', 'torsión accidental'));
        derivation.push(msg('loadPlan.derivation.accidentalTorsion', { e: ACCIDENTAL_ECCENTRICITY[torsion] * 100 }));
      }
      if (input.seismic.diagonal) refs.push(clause('inpres-cirsoc-103-i', '2018', '3.2', 'direcciones de análisis'));
      for (const c of seismicCases({
        nodes: input.model.nodes, levels: elevated, forcesX, forcesY,
        directions: input.seismic.directions, torsion, diagonal: input.seismic.diagonal,
      })) {
        const index = cases.length;
        const plain = c.nameKey === 'autoLoad.seismicCaseDir' && c.axis !== 'diagonal';
        cases.push({ existingId: plain ? findCase(input.model, 'E', c.axis) : null, type: 'E', nameKey: c.nameKey, nameParams: c.nameParams });
        for (const n of c.nodal) nodal.push({ nodeId: n.nodeId, caseType: 'E', caseIndex: index, fx: n.fx, fy: n.fy, fz: 0, ...(n.mz ? { mz: n.mz } : {}) });
      }

      derivation.push(msg('loadPlan.derivation.seismic', {
        weight: round(W, 1), coefficient: round(C, 4), baseShear: round(V0, 1),
      }));
    }
  }
  return { seismicWeight, baseShear, seismicDetail };
}
