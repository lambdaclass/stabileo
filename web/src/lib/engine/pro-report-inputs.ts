/**
 * Everything the PRO report is made of, gathered in one place.
 *
 * ── Why this is not in the panel any more ──────────────────────────
 *
 * `exportReport` was 230 lines inside `ProPanel.svelte`, and none of it was about the panel. It
 * walked the structural graph for joints, assembled beam frame lines and column stacks, read the
 * moment envelope, computed bar marks, took off quantities and derived story drifts — nine
 * distinct readings of the model, in one function, in a component whose other job is routing
 * sixteen tabs. Adding a section to the report meant editing the router.
 *
 * ── Why it reads the stores instead of taking them ─────────────────
 *
 * Same shape as `detailing-project-inputs.ts`, and for the same reason: these are readings OF the
 * current project, and threading nine maps through a parameter list would create a second way to
 * say what the project is — which is how a report ends up describing a model the user is not
 * looking at. What IS passed in is everything that is a choice or a moment: the config the dialog
 * produced, the verifications the caller decided to re-run, the screenshot the DOM was asked for,
 * and `t`. None of those can be read from a store without the module deciding something that is
 * not its to decide.
 *
 * ── The caps are deliberate, and they are stated ───────────────────
 *
 * Four joints, three beam frame lines, three column stacks. A report is a document somebody
 * reads, and forty near-identical joint details is not more information. The caps are the ones
 * the panel already applied; they are named as constants here so the number is visible rather
 * than buried in a `break`.
 */

import { deflectionChecks } from '../store/serviceability';
import { seismicDrifts } from './seismic-drift';
import { regulationsStore } from '../store/regulations.svelte';
import { findBehaviour } from '../codes/cirsoc103/behaviour';
import type { DestinationGroup } from '../codes/cirsoc103/spectrum';
import { shouldEmbedFlat2DModelIn3D } from './solver-service';
import { activeCombinations, activePerCombo3D } from '../store/active-results';
import { modelStore, resultsStore } from '../store';
import { i18n } from '../i18n';
import type { ReportData, ReportConfig } from './pro-report';
import type { ElementVerification } from './codes/argentina/cirsoc201';
import { checkCrackWidth } from './codes/argentina/serviceability';
import { projectQuantities } from './quantities';
import { staticsRows } from '../store/statics-rows';
import { resultSetName } from '../export/figure';
import { ruleLabel } from './deflection-limits';
import { memberKindOf } from './design/member-grouping';
import { detailingStore } from '../store/detailing.svelte';
import { computeBarMarks } from './bar-marks';
import { buildStructuralGraph } from './structural-graph';
import type { FrameLineElevationOpts, ColumnStackElevationOpts } from './reinforcement-svg';
import {
  get2DDisplayNodalLoadMoment, get2DDisplayNodalLoadVertical,
} from '../geometry/coordinate-system';

/** How many of each repeated detail the report carries. See the header. */
export const REPORT_JOINT_CAP = 4;
export const REPORT_FRAME_LINE_CAP = 3;
export const REPORT_COLUMN_STACK_CAP = 3;

/**
 * The inter-story drift ratio the report calls a failure.
 *
 * A REPORTING threshold, not a code check: 1.5 % is the common serviceability limit, and the
 * warn band is 80 % of it. It is named here rather than written inline so a reader can see that
 * the three-colour status comes from one number and not from a verification the app did not run.
 */


type Translate = (key: string) => string;

/** Straight-line length of an element, in three dimensions. */
function elementLength(elementId: number): number | undefined {
  const el = modelStore.elements.get(elementId);
  if (!el) return undefined;
  const a = modelStore.nodes.get(el.nodeI);
  const b = modelStore.nodes.get(el.nodeJ);
  if (!a || !b) return undefined;
  const dx = b.x - a.x, dy = b.y - a.y, dz = (b.z ?? 0) - (a.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** The verified members' lengths, by element id. Members whose nodes are missing are omitted. */
function verifiedLengths(verifications: readonly ElementVerification[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const v of verifications) {
    const len = elementLength(v.elementId);
    if (len !== undefined) out.set(v.elementId, len);
  }
  return out;
}

/**
 * The load list, as sentences, in SI as the report states. Every load type has its row; the 3D
 * ones, which are all a PRO model carries, used to fall through as empty rows, so the report
 * listed as many blank lines as the model had loads.
 */
export function serializeLoads(t: Translate): NonNullable<ReportData['loads']> {
  const loads: NonNullable<ReportData['loads']> = [];
  /** A component to four significant figures, never "-0". */
  const n = (v: number) => { const r = +v.toPrecision(4); return Object.is(r, -0) ? '0' : String(r); };
  /** The non-zero components, named; "0" when all are zero. */
  const parts = (unit: string, comps: Array<[string, number | undefined]>) => {
    const nz = comps.filter(([, v]) => v !== undefined && Math.abs(v) > 1e-12) as Array<[string, number]>;
    return nz.length ? nz.map(([k, v]) => `${k}=${n(v)}`).join(', ') + ` ${unit}` : `0 ${unit}`;
  };
  /** Where a partial line load sits, from node I; a start with no end runs to the end (`b=L`). */
  const range = (d: { a?: number; b?: number }) =>
    d.a !== undefined || d.b !== undefined ? `, a=${n(d.a ?? 0)} m, b=${d.b !== undefined ? `${n(d.b)} m` : 'L'}` : '';
  /** A 2D member load's angle from its base direction, and its axes when they are global. */
  const turn = (d: { angle?: number; isGlobal?: boolean }) =>
    (d.angle ? `, θ=${n(d.angle)}°` : '') + (d.isGlobal ? ` (${t('report.loadGlobal')})` : '');
  const caseName = (id: number | undefined) => modelStore.model.loadCases.find((c) => c.id === (id ?? 1))?.name;
  for (const load of modelStore.model.loads) {
    let tipo = '', destino = '', valores = '';
    switch (load.type) {
      case 'nodal': {
        const d = load.data;
        tipo = t('file.loadNodal'); destino = `${t('report.loadNode')} ${d.nodeId}`;
        valores = `Fx=${n(d.fx)} kN, Fz=${n(get2DDisplayNodalLoadVertical(d))} kN, My=${n(get2DDisplayNodalLoadMoment(d))} kN·m`;
        break;
      }
      case 'distributed': {
        const d = load.data;
        tipo = t('file.loadDistributed'); destino = `${t('report.loadMember')} ${d.elementId}`;
        valores = (d.qI === d.qJ ? `q=${n(d.qI)} kN/m` : `qI=${n(d.qI)}, qJ=${n(d.qJ)} kN/m`) + range(d) + turn(d);
        break;
      }
      case 'pointOnElement': {
        const d = load.data;
        tipo = t('file.loadPointOnElement'); destino = `${t('report.loadMember')} ${d.elementId}`;
        valores = `${parts('kN', [['P', d.p], ['Px', d.px]])}${Math.abs(d.my ?? d.mz ?? 0) > 1e-12 ? `, My=${n(d.my ?? d.mz!)} kN·m` : ''}, a=${n(d.a)} m` + turn(d);
        break;
      }
      case 'thermal': {
        const d = load.data;
        tipo = t('file.loadThermal'); destino = `${t('report.loadMember')} ${d.elementId}`;
        valores = `ΔT=${n(d.dtUniform)} °C, ΔTg=${n(d.dtGradient)} °C`;
        break;
      }
      case 'nodal3d': {
        const d = load.data;
        tipo = t('file.loadNodal'); destino = `${t('report.loadNode')} ${d.nodeId}`;
        valores = [parts('kN', [['Fx', d.fx], ['Fy', d.fy], ['Fz', d.fz]]), parts('kN·m', [['Mx', d.mx], ['My', d.my], ['Mz', d.mz]])].join('; ');
        break;
      }
      case 'distributed3d': {
        const d = load.data;
        tipo = t('file.loadDistributed'); destino = `${t('report.loadMember')} ${d.elementId}`;
        const axes = d.frame === 'global' || d.frame === 'projected' ? ['X', 'Y', 'Z'] : ['x', 'y', 'z'];
        valores = parts('kN/m', [
          [`q${axes[0]}I`, d.qXI], [`q${axes[0]}J`, d.qXJ], [`q${axes[1]}I`, d.qYI], [`q${axes[1]}J`, d.qYJ],
          [`q${axes[2]}I`, d.qZI], [`q${axes[2]}J`, d.qZJ],
        ]) + range(d)
          + (d.frame === 'projected' ? ` (${t('report.loadProjected')})` : d.frame === 'global' ? ` (${t('report.loadGlobal')})` : '');
        break;
      }
      case 'pointOnElement3d': {
        const d = load.data;
        tipo = t('file.loadPointOnElement'); destino = `${t('report.loadMember')} ${d.elementId}`;
        valores = `${parts('kN', [['Py', d.py], ['Pz', d.pz]])}, a=${n(d.a)} m`;
        break;
      }
      case 'surface3d': {
        const d = load.data;
        tipo = t('report.loadSurface'); destino = `${t('report.loadShell')} ${d.quadId}`;
        valores = `q=${n(d.q)} kN/m²`;
        break;
      }
      case 'thermalQuad3d': {
        const d = load.data;
        tipo = t('file.loadThermal'); destino = `${t('report.loadShell')} ${d.quadId}`;
        valores = `ΔT=${n(d.dtUniform)} °C, ΔTg=${n(d.dtGradient)} °C`;
        break;
      }
    }
    loads.push({ type: tipo, target: destino, values: valores, caseLabel: caseName((load.data as { caseId?: number }).caseId) });
  }
  return loads;
}

/** The load combinations, with each factor's case named rather than numbered. */
function serializeCombinations(): ReportData['combinations'] {
  if (modelStore.model.combinations.length === 0) return undefined;
  return modelStore.model.combinations.map((c) => ({
    id: c.id,
    name: c.name,
    factors: c.factors
      .map((f) => {
        const lc = modelStore.model.loadCases.find((lc2) => lc2.id === f.caseId);
        return lc ? { caseName: lc.name, factor: f.factor } : null;
      })
      .filter((f): f is { caseName: string; factor: number } => f !== null),
  }));
}

/**
 * Crack width per verified member; the deflection of every beam.
 *
 * `Ms` is the factored moment divided back by 1.4 — the service moment the crack check wants,
 * recovered from the ultimate one the design produced. The deflection is each beam's own, relative
 * to its chord, under the service loads `store/service-deflection.ts` chooses — the same number
 * the verification tab shows. It was the largest vertical displacement of the whole model, the
 * same for every beam. The verification set is concrete-only, so the beams it does not cover —
 * the steel ones — contribute their deflection as rows of their own: the check
 * (`store/serviceability.ts`) runs for every beam in the model, and a steel beam bends as much
 * as a concrete one. Members that yield neither check are dropped, so an empty section means
 * "nothing was checkable", not "everything passed".
 */
function serviceabilityRows(
  verifications: readonly ElementVerification[],
): ReportData['serviceability'] {
  const deflections = deflectionChecks().rows;
  const deflectionOf = (elementId: number) => {
    const defl = deflections.get(elementId)?.check;
    // Over the length the limit is taken over (2L for a cantilever), as the check reads it.
    const over = defl && defl.limitLength !== defl.span ? `${+(defl.limitLength / defl.span).toFixed(3)}L` : 'L';
    return defl
      ? { ratio: defl.ratio, limit: defl.limit, status: defl.status, spanOverDelta: defl.deltaTotal > 0 ? defl.limitLength / defl.deltaTotal : Infinity, limitDivisor: defl.limitDivisor, over }
      : undefined;
  };
  const rows = verifications.map((v) => {
    const Ms = v.Mu / 1.4;
    const crack = (v.elementType === 'beam' && v.flexure.AsProv > 0)
      ? checkCrackWidth(v.b, v.h, v.flexure.d, v.flexure.AsProv, Ms, v.cover, v.flexure.barDia, v.flexure.barCount)
      : undefined;
    return {
      elementId: v.elementId,
      elementType: v.elementType,
      crack: crack ? { wk: crack.wk, wkLimit: crack.wLimit, status: crack.status } : undefined,
      deflection: deflectionOf(v.elementId),
    };
  });
  const covered = new Set(verifications.map((v) => v.elementId));
  for (const [id] of deflections) {
    // A rule can bring in a column, or a member of a group: named for what it is, not as a beam.
    if (!covered.has(id)) rows.push({ elementId: id, elementType: memberKindOf(modelStore.model as never, id) ?? 'beam', crack: undefined, deflection: deflectionOf(id) });
  }
  const kept = rows.filter((s) => s.crack || s.deflection);
  return kept.length > 0 ? kept : undefined;
}

/** The structural graph, built from the plain shapes `buildStructuralGraph` expects. */
function graphOfModel() {
  const nodes = new Map<number, { id: number; x: number; y: number; z: number }>();
  for (const [id, n] of modelStore.nodes) nodes.set(id, { id, x: n.x, y: n.y, z: n.z ?? 0 });
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; type: string }>();
  for (const [id, e] of modelStore.elements) {
    elements.set(id, { id, nodeI: e.nodeI, nodeJ: e.nodeJ, sectionId: e.sectionId, type: e.type });
  }
  const sections = new Map<number, { id: number; b?: number; h?: number }>();
  for (const [id, s] of modelStore.sections) sections.set(id, { id, b: s.b, h: s.h });
  const supports = new Map<number, { nodeId: number; type: string }>();
  for (const [, s] of modelStore.supports) supports.set(s.nodeId, { nodeId: s.nodeId, type: s.type });
  return buildStructuralGraph(nodes, elements, sections, supports);
}

/**
 * One detail per distinct beam-column size pairing.
 *
 * De-duplicated on the four dimensions, because two joints with the same sections draw the same
 * detail and the second one tells the reader nothing. A joint missing either side is skipped
 * rather than drawn half — a beam-to-nothing detail is not a joint.
 */
function jointDetails(
  graph: ReturnType<typeof graphOfModel>,
  verifMap: Map<number, ElementVerification>,
  t: Translate,
): ReportData['jointDetailOpts'] {
  const seen = new Set<string>();
  const out: NonNullable<ReportData['jointDetailOpts']> = [];
  for (const joint of graph.joints) {
    const beam = joint.beamIds.map((id) => verifMap.get(id)).find((v) => v && v.elementType === 'beam');
    const col = joint.columnIds.map((id) => verifMap.get(id))
      .find((v) => v && (v.elementType === 'column' || v.elementType === 'wall'));
    if (!beam || !col) continue;
    const key = `${beam.b}_${beam.h}_${col.b}_${col.h}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      beamB: beam.b, beamH: beam.h, colB: col.b, colH: col.h, cover: beam.cover,
      beamBars: beam.flexure.bars,
      colBars: col.column?.bars ?? `${col.flexure.barCount} Ø${col.flexure.barDia}`,
      stirrupDia: col.shear.stirrupDia, stirrupSpacing: col.shear.spacing,
      beamDetailing: beam.detailing, colDetailing: col.detailing, nodeId: joint.nodeId,
      labels: {
        title: t('pro.jointDetail'), beam: t('pro.beam'), column: t('pro.column'),
        joint: t('pro.jointWord') !== 'pro.jointWord' ? t('pro.jointWord') : 'joint',
        splice: t('pro.lapSplice'),
      },
    });
    if (out.length >= REPORT_JOINT_CAP) break;
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Continuous beam elevations, with the moment envelope the UI draws.
 *
 * `envMap` carries the same `momentZ` envelope the panel plots, so the elevation and the diagram
 * on screen cannot disagree. Negative values are taken in absolute terms because the elevation
 * draws hogging as a magnitude on the top face — the side, not the sign, is what places the steel.
 *
 * A span whose member was not verified becomes a placeholder rather than shortening the line: a
 * frame line that silently loses its third span is a drawing of a different structure.
 */
function beamContinuity(
  graph: ReturnType<typeof graphOfModel>,
  verifMap: Map<number, ElementVerification>,
  lengths: Map<number, number>,
  t: Translate,
): FrameLineElevationOpts[] | undefined {
  const envMomentZ = resultsStore.envelope3D?.momentZ;
  const envMap = new Map<number, { t: number[]; posM: number[]; negM: number[] }>();
  if (envMomentZ) {
    for (const ed of envMomentZ.elements) {
      envMap.set(ed.elementId, {
        t: ed.tPositions, posM: ed.posValues, negM: ed.negValues.map((v) => Math.abs(v)),
      });
    }
  }

  const out: FrameLineElevationOpts[] = [];
  for (const fl of graph.frameLines) {
    if (fl.direction !== 'horizontal' || fl.elementIds.length < 2) continue;
    const spans = fl.elementIds.map((eid) => {
      const v = verifMap.get(eid); const len = lengths.get(eid);
      if (!v || !len) return null;
      const hasComp = v.flexure.isDoublyReinforced && !!v.flexure.barCountComp;
      return {
        length: len, bottomBars: v.flexure.bars,
        topBars: hasComp ? (v.flexure.barsComp ?? '2 Ø10') : '2 Ø10',
        hasCompSteel: hasComp, stirrupSpacing: v.shear.spacing, stirrupDia: v.shear.stirrupDia,
        detailing: v.detailing, momentStations: envMap.get(eid),
        barCount: v.flexure.barCount, barDia: v.flexure.barDia, asMin: v.flexure.AsMin,
        topBarCount: hasComp ? v.flexure.barCountComp : undefined,
        topBarDia: hasComp ? v.flexure.barDiaComp : undefined,
        sectionB: v.b, cover: v.cover,
      };
    });
    if (spans.filter(Boolean).length < 2) continue;
    const nodes = fl.nodeIds.map((nid) => {
      const c = graph.nodes.get(nid);
      return { hasColumn: (c?.columns.length ?? 0) > 0, hasSupport: !!c?.support, supportType: c?.support };
    });
    out.push({
      spans: spans.map((s) => s ?? {
        length: 1, bottomBars: '?', topBars: '2 Ø10', hasCompSteel: false,
        stirrupSpacing: 0.2, stirrupDia: 8,
      }),
      nodes, labels: { splice: t('pro.lapSplice') }, axis: fl.axis,
    });
    if (out.length >= REPORT_FRAME_LINE_CAP) break;
  }
  return out.length > 0 ? out : undefined;
}

/** Column stack elevations. Same placeholder rule as the beam lines, for the same reason. */
function columnStacks(
  graph: ReturnType<typeof graphOfModel>,
  verifMap: Map<number, ElementVerification>,
  lengths: Map<number, number>,
  t: Translate,
): ColumnStackElevationOpts[] | undefined {
  const out: ColumnStackElevationOpts[] = [];
  for (const fl of graph.frameLines) {
    if (fl.direction !== 'vertical' || fl.elementIds.length < 2) continue;
    const segData = fl.elementIds.map((eid) => {
      const v = verifMap.get(eid); const len = lengths.get(eid);
      return v && len && v.column ? { v, len } : null;
    });
    if (segData.filter(Boolean).length < 2) continue;
    const firstValid = segData.find(Boolean)!;
    const segments = fl.elementIds.map((_, i) => {
      const sd = segData[i];
      if (!sd) return { height: 3, bars: '?', barCount: 4, barDia: 16, stirrupSpacing: 0.2, stirrupDia: 8 };
      return {
        height: sd.len,
        bars: sd.v.column?.bars ?? sd.v.flexure.bars,
        barCount: sd.v.column?.barCount ?? sd.v.flexure.barCount,
        barDia: sd.v.column?.barDia ?? sd.v.flexure.barDia,
        stirrupSpacing: sd.v.shear.spacing, stirrupDia: sd.v.shear.stirrupDia,
        detailing: sd.v.detailing,
      };
    });
    const nodes = fl.nodeIds.map((nid) => {
      const c = graph.nodes.get(nid);
      return { hasBeam: (c?.beams.length ?? 0) > 0, hasSupport: !!c?.support, supportType: c?.support };
    });
    out.push({
      segments, nodes,
      sectionB: firstValid.v.b, sectionH: firstValid.v.h, cover: firstValid.v.cover,
      labels: { splice: t('pro.lapSplice') },
    });
    if (out.length >= REPORT_COLUMN_STACK_CAP) break;
  }
  return out.length > 0 ? out : undefined;
}

/** The governing envelope of each member across every active combination. */
function comboForces(): ReportData['comboForces'] {
  const combos = activeCombinations();
  if (resultsStore.perCombo3D.size === 0 || combos.length === 0) return undefined;
  const out = new Map<number, Array<{ comboId: number; comboName: string; Mu: number; Vu: number; Nu: number }>>();
  for (const combo of combos) {
    const comboResults = resultsStore.perCombo3D.get(combo.id);
    if (!comboResults) continue;
    for (const ef of comboResults.elementForces) {
      let arr = out.get(ef.elementId);
      if (!arr) { arr = []; out.set(ef.elementId, arr); }
      arr.push({
        comboId: combo.id,
        comboName: combo.name,
        Mu: Math.max(Math.abs(ef.mzStart), Math.abs(ef.mzEnd)),
        Vu: Math.max(Math.abs(ef.vyStart), Math.abs(ef.vyEnd)),
        Nu: Math.max(Math.abs(ef.nStart), Math.abs(ef.nEnd)),
      });
    }
  }
  return out.size > 0 ? out : undefined;
}

/**
 * Story drift under the seismic cases, the check the Results panel shows: INPRES-CIRSOC 103
 * §6.4, the elastic displacements scaled by Cd/γr and the limit of Tabla 6.4 for the project's
 * group, on the stricter condition D (the panel lets the reader switch to ND).
 *
 * This read the result on screen with no Cd, a fixed 0,015 and a clause that does not state
 * it, so the report and the panel gave two different checks. Without the seismic settings, or
 * with no seismic case solved, there is no check to print.
 */
function storyDrifts(): { drifts: ReportData['storyDrifts']; basis?: ReportData['storyDriftBasis'] } {
  const settings = regulationsStore.binding('seismic').settings as { destinationGroup?: DestinationGroup; systemKey?: string };
  const cd = settings.systemKey ? findBehaviour(settings.systemKey)?.cd ?? null : null;
  const group = settings.destinationGroup ?? null;
  if (cd === null || group === null) return { drifts: undefined };
  const embedded2D = shouldEmbedFlat2DModelIn3D(modelStore.model);
  const worst = new Map<number, NonNullable<ReportData['storyDrifts']>[number]>();
  let limit = 0;
  const cases: string[] = [];
  for (const c of modelStore.model.loadCases.filter((lc) => (lc.type || '').toUpperCase() === 'E')) {
    const r = resultsStore.perCase3D.get(c.id);
    if (!r) continue;
    const out = seismicDrifts({ nodes: modelStore.nodes, elements: modelStore.elements.values(), displacements: r.displacements, cd, group, condition: 'D', embedded2D });
    if (!out) continue;
    limit = out.limit; cases.push(c.name);
    for (const d of out.stories) {
      const key = Math.round(d.level * 1000);
      const prev = worst.get(key);
      if (!prev || Math.max(d.ratioX, d.ratioY) > Math.max(prev.ratioX, prev.ratioY)) worst.set(key, d);
    }
  }
  if (worst.size === 0) return { drifts: undefined };
  return { drifts: [...worst.values()].sort((a, b) => a.level - b.level), basis: { cd, group, limit, cases } };
}

/**
 * Assemble the whole report.
 *
 * Returns `null` when there are no 3-D results: the report is a document about a solve, and
 * there is no honest version of it without one. Every reinforcement section is guarded by
 * `verifications.length > 0` for the same reason — a design section built from an empty
 * verification set would be a page of zeros presented as a check.
 */
export function buildProReportData(opts: {
  config: ReportConfig;
  verifications: readonly ElementVerification[];
  /**
   * What the Advanced tab produced this session.
   *
   * Passed in and not read here, because it is not a property of the model: it is whatever the
   * user last ran in that tab, held by the panel that hosts it. There is no store to read it
   * from, and inventing one so this module could reach it would put a second copy of the modal
   * results beside the tab's own.
   */
  advancedResults?: ReportData['advancedResults'];
  screenshot?: string;
  t: Translate;
}): ReportData | null {
  const { config, verifications, advancedResults, screenshot, t } = opts;
  const results = resultsStore.results3D;
  if (!results) return null;

  const data: ReportData = {
    projectName: modelStore.model.name || 'Estructura',
    date: new Date().toLocaleDateString(i18n.locale, { year: 'numeric', month: 'long', day: 'numeric' }),
    provenance: modelStore.model.provenance,
    nodes: [...modelStore.nodes.values()],
    elements: [...modelStore.elements.values()],
    materials: [...modelStore.materials.values()],
    sections: [...modelStore.sections.values()],
    supports: [...modelStore.supports.values()],
    quads: modelStore.model.quads.size > 0 ? [...modelStore.model.quads.values()] : undefined,
    loadCount: modelStore.loads.length,
    loads: serializeLoads(t),
    results,
    verifications: verifications as ElementVerification[],
    combinations: serializeCombinations(),
    advancedResults,
    diagnostics: resultsStore.diagnostics3D.length > 0 ? resultsStore.diagnostics3D : undefined,
    serviceability: serviceabilityRows(verifications),
    screenshot,
    t,
    config,
  };

  if (verifications.length > 0) {
    const verifMap = new Map(verifications.map((v) => [v.elementId, v]));
    const lengths = verifiedLengths(verifications);
    const graph = graphOfModel();

    data.jointDetailOpts = jointDetails(graph, verifMap, t);
    data.beamContinuityOpts = beamContinuity(graph, verifMap, lengths, t);
    data.columnStackOpts = columnStacks(graph, verifMap, lengths, t);

    const slenderData = verifications.filter((v) => v.slender).map((v) => ({
      elementId: v.elementId, k: v.slender!.k, lu: v.slender!.lu, r: v.slender!.r,
      klu_r: v.slender!.klu_r, lambda_lim: v.slender!.lambda_lim, isSlender: v.slender!.isSlender,
      delta_ns: v.slender!.delta_ns, Cm: v.slender!.Cm, Mc: v.slender!.Mc,
    }));
    if (slenderData.length > 0) data.slenderSummary = slenderData;

    const marks = computeBarMarks(verifications as ElementVerification[], lengths);
    if (marks.length > 0) {
      data.barMarks = marks.map((m) => ({
        mark: m.mark, diameter: m.diameter, shape: m.shape, cuttingLength: m.cuttingLength,
        count: m.count, totalLength: m.totalLength, weight: m.weight, overStock: m.overStock,
        stockLength: m.stockLength, needsStockSplice: m.needsStockSplice,
        nStockSplices: m.nStockSplices,
      }));
    }

    data.comboForces = comboForces();
    data.elementLengths = lengths;
  }

  // From the geometry and the bar schedule of the detailing, whether or not a design ran.
  data.quantities = projectQuantities(
    { nodes: modelStore.nodes, elements: modelStore.elements, sections: modelStore.sections, materials: modelStore.materials, plates: modelStore.plates, quads: modelStore.quads } as never,
    detailingStore.assemblies.flatMap((a) => a.marks),
  );
  // The project's own data for the cover, and the project-scale sections.
  data.projectInfo = modelStore.projectInfo;
  data.resultSetName = resultSetName();
  const combos = activePerCombo3D();
  const cname = new Map(modelStore.combinations.map((c) => [c.id, c.name]));
  const kname = new Map(modelStore.loadCases.map((c) => [c.id, c.name]));
  data.resultSets = combos.size > 0
    ? [...combos].map(([id, r]) => ({ id, name: cname.get(id) ?? String(id), results: r }))
    : [...resultsStore.perCase3D].map(([id, r]) => ({ id, name: kname.get(id) ?? String(id), results: r }));
  data.statics = staticsRows();
  const seen = new Set<string>();
  data.deflections = [...deflectionChecks().rows.values()].flatMap((c) => {
    const key = c.deflection.span.join(',');
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      span: c.deflection.span.length > 1 ? `${c.deflection.span[0]}–${c.deflection.span[c.deflection.span.length - 1]}` : String(c.deflection.span[0]),
      L: c.deflection.L, delta: c.check.deltaTotal, limit: ruleLabel(c.rule, !!c.deflection.cantilever),
      direction: c.rule.direction, ratio: c.check.ratio, status: c.check.status, cantilever: !!c.deflection.cantilever,
    }];
  }).sort((a, b) => b.ratio - a.ratio);
  const drift = storyDrifts();
  data.storyDrifts = drift.drifts;
  if (drift.basis) data.storyDriftBasis = drift.basis;
  return data;
}
