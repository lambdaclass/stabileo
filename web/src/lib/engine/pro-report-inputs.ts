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

import { modelStore, resultsStore } from '../store';
import type { ReportData, ReportConfig } from './pro-report';
import type { AnalysisResults3D } from './types-3d';
import type { ElementVerification } from './codes/argentina/cirsoc201';
import { checkCrackWidth, checkDeflection } from './codes/argentina/serviceability';
import { estimateQuantitiesFromVerification } from './quantity-takeoff';
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
export const REPORT_DRIFT_LIMIT = 0.015;

/** Nodes within this many metres of each other in Y are read as the same story. */
const STORY_Y_TOLERANCE = 0.05;

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
 * The load list, as sentences.
 *
 * Only the four types the report tabulates produce a row; anything else falls through with empty
 * strings rather than being dropped, so the count in the table still matches `loadCount`.
 */
export function serializeLoads(t: Translate): NonNullable<ReportData['loads']> {
  const loads: NonNullable<ReportData['loads']> = [];
  for (const load of modelStore.model.loads) {
    let tipo = '', destino = '', valores = '';
    switch (load.type) {
      case 'nodal': {
        const d = load.data;
        tipo = t('file.loadNodal'); destino = `Nodo ${d.nodeId}`;
        valores = `Fx=${d.fx} kN, Fz=${get2DDisplayNodalLoadVertical(d)} kN, My=${get2DDisplayNodalLoadMoment(d)} kN·m`;
        break;
      }
      case 'distributed': {
        const d = load.data;
        tipo = t('file.loadDistributed'); destino = `Elem ${d.elementId}`;
        valores = d.qI === d.qJ ? `q=${d.qI} kN/m` : `qI=${d.qI}, qJ=${d.qJ} kN/m`;
        break;
      }
      case 'pointOnElement': {
        const d = load.data;
        tipo = t('file.loadPointOnElement'); destino = `Elem ${d.elementId}`;
        valores = `P=${d.p} kN, a=${d.a} m`;
        break;
      }
      case 'thermal': {
        const d = load.data;
        tipo = t('file.loadThermal'); destino = `Elem ${d.elementId}`;
        valores = `ΔT=${d.dtUniform} °C, ΔTg=${d.dtGradient} °C`;
        break;
      }
    }
    loads.push({ type: tipo, target: destino, values: valores, caseLabel: (load as any).caseLabel });
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
 * Crack width and deflection per verified member.
 *
 * `Ms` is the factored moment divided back by 1.4 — the service moment the serviceability checks
 * want, recovered from the ultimate one the design produced. Members that yield neither check are
 * dropped, so an empty section means "nothing was checkable", not "everything passed".
 */
function serviceabilityRows(
  verifications: readonly ElementVerification[],
  results: AnalysisResults3D,
): ReportData['serviceability'] {
  if (verifications.length === 0) return undefined;
  const maxDisp = results.displacements.reduce((mx, d) => Math.max(mx, Math.abs(d.uz)), 0);
  const rows = verifications.map((v) => {
    const Ms = v.Mu / 1.4;
    const crack = (v.elementType === 'beam' && v.flexure.AsProv > 0)
      ? checkCrackWidth(v.b, v.h, v.flexure.d, v.flexure.AsProv, Ms, v.cover, v.flexure.barDia, v.flexure.barCount)
      : undefined;
    const L = elementLength(v.elementId) ?? 0;
    const defl = (L > 0 && v.elementType === 'beam') ? checkDeflection(L, maxDisp) : undefined;
    return {
      elementId: v.elementId,
      elementType: v.elementType,
      crack: crack ? { wk: crack.wk, wkLimit: crack.wLimit, status: crack.status } : undefined,
      deflection: defl ? { ratio: defl.ratio, limit: defl.limit, status: defl.status } : undefined,
    };
  }).filter((s) => s.crack || s.deflection);
  return rows.length > 0 ? rows : undefined;
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

/** The governing envelope of each member across every solved combination. */
function comboForces(): ReportData['comboForces'] {
  if (resultsStore.perCombo3D.size === 0 || modelStore.model.combinations.length === 0) return undefined;
  const out = new Map<number, Array<{ comboId: number; comboName: string; Mu: number; Vu: number; Nu: number }>>();
  for (const combo of modelStore.model.combinations) {
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
 * Inter-story drift, from the story levels the nodes imply.
 *
 * Levels are the distinct Y coordinates within `STORY_Y_TOLERANCE`; anything closer than 0.1 m
 * apart is not a story and is skipped, which is what keeps a beam's own nodes from being read as
 * a 40 mm floor with an enormous drift ratio.
 */
function storyDrifts(results: AnalysisResults3D): ReportData['storyDrifts'] {
  const yLevels: number[] = [];
  for (const [, node] of modelStore.nodes) {
    if (!yLevels.some((lv) => Math.abs(lv - node.y) < STORY_Y_TOLERANCE)) yLevels.push(node.y);
  }
  yLevels.sort((a, b) => a - b);
  if (yLevels.length < 2) return undefined;

  const drifts: NonNullable<ReportData['storyDrifts']> = [];
  for (let i = 1; i < yLevels.length; i++) {
    const level = yLevels[i], prevLevel = yLevels[i - 1];
    const storyH = level - prevLevel;
    if (storyH < 0.1) continue;
    let maxUxCur = 0, maxUzCur = 0, maxUxPrev = 0, maxUzPrev = 0;
    for (const d of results.displacements) {
      const node = modelStore.nodes.get(d.nodeId);
      if (!node) continue;
      if (Math.abs(node.y - level) < STORY_Y_TOLERANCE) {
        maxUxCur = Math.max(maxUxCur, Math.abs(d.ux));
        maxUzCur = Math.max(maxUzCur, Math.abs(d.uz));
      } else if (Math.abs(node.y - prevLevel) < STORY_Y_TOLERANCE) {
        maxUxPrev = Math.max(maxUxPrev, Math.abs(d.ux));
        maxUzPrev = Math.max(maxUzPrev, Math.abs(d.uz));
      }
    }
    const deltaX = Math.abs(maxUxCur - maxUxPrev), deltaZ = Math.abs(maxUzCur - maxUzPrev);
    const ratioX = deltaX / storyH, ratioZ = deltaZ / storyH;
    const maxRatio = Math.max(ratioX, ratioZ);
    drifts.push({
      level, height: storyH, driftX: deltaX, driftZ: deltaZ, ratioX, ratioZ,
      status: maxRatio > REPORT_DRIFT_LIMIT ? 'fail'
        : maxRatio > REPORT_DRIFT_LIMIT * 0.8 ? 'warn' : 'ok',
    });
  }
  return drifts.length > 0 ? drifts : undefined;
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
    date: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
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
    serviceability: serviceabilityRows(verifications, results),
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
    data.quantities = estimateQuantitiesFromVerification(verifications as ElementVerification[], lengths);
    data.elementLengths = lengths;
  }

  data.storyDrifts = storyDrifts(results);
  return data;
}
