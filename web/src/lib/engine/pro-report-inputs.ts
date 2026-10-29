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
 * produced, the screenshot the DOM was asked for,
 * and `t`. None of those can be read from a store without the module deciding something that is
 * not its to decide.
 *
 */

import { shellText, surfaceValueText, surfaceHowText } from '../model/loads/surface-load-text';
import { definitionName, type DefinitionModel } from '../model/loads/floor-definitions';
import { deflectionChecks } from '../store/serviceability';
import { seismicDrifts } from './seismic-drift';
import { regulationsStore } from '../store/regulations.svelte';
import { findBehaviour } from '../codes/cirsoc103/behaviour';
import type { DestinationGroup } from '../codes/cirsoc103/spectrum';
import { shouldEmbedFlat2DModelIn3D } from './solver-service';
import { activePerCombo3D } from '../store/active-results';
import { modelStore, resultsStore } from '../store';
import { i18n } from '../i18n';
import type { ReportData, ReportConfig } from './pro-report';
import { projectQuantities } from './quantities';
import { staticsRows } from '../store/statics-rows';
import { resultSetName } from '../export/figure';
import { ruleLabel } from './deflection-limits';
import { detailingStore } from '../store/detailing.svelte';
import {
  get2DDisplayNodalLoadMoment, get2DDisplayNodalLoadVertical,
} from '../geometry/coordinate-system';

/**
 * The inter-story drift ratio the report calls a failure.
 *
 * A REPORTING threshold, not a code check: 1.5 % is the common serviceability limit, and the
 * warn band is 80 % of it. It is named here rather than written inline so a reader can see that
 * the three-colour status comes from one number and not from a verification the app did not run.
 */


type Translate = (key: string) => string;

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
        tipo = d.strain && !d.dtUniform && !d.dtGradient && !d.dtGradientY ? t('loads.strain') : t('file.loadThermal');
        destino = `${t('report.loadMember')} ${d.elementId}`;
        valores = [
          d.dtUniform || !d.strain ? `ΔT=${n(d.dtUniform)} °C` : '',
          d.dtGradient ? `ΔTgz=${n(d.dtGradient)} °C` : '',
          d.dtGradientY ? `ΔTgy=${n(d.dtGradientY)} °C` : '',
          d.strain ? `ε₀=${n(d.strain * 1000)} ‰` : '',
        ].filter(Boolean).join(', ');
        break;
      }
      case 'prestress3d': {
        const d = load.data;
        tipo = t('loads.prestress'); destino = `${t('report.loadMember')} ${d.elementId}`;
        valores = `P=${n(d.force)} kN, e=${n(d.eI)} / ${n(d.eM)} / ${n(d.eJ)} m`;
        break;
      }
      case 'displacement3d': {
        const d = load.data;
        tipo = t('loads.imposedDisplacement'); destino = `${t('report.loadNode')} ${d.nodeId}`;
        valores = [
          ...(['dx', 'dy', 'dz'] as const).filter((k) => d[k]).map((k) => `${k}=${n(d[k]! * 1000)} mm`),
          ...(['drx', 'dry', 'drz'] as const).filter((k) => d[k]).map((k) => `${k}=${n(d[k]!)} rad`),
        ].join(', ');
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
        const g = d.frame === 'global';
        const forces = parts('kN', [[g ? 'PX' : 'Px', d.px], [g ? 'PY' : 'Py', d.py], [g ? 'PZ' : 'Pz', d.pz]]);
        const moments = [d.mx, d.my, d.mz].some((v) => v) ? `, ${parts('kN·m', [[g ? 'MX' : 'Mx', d.mx], [g ? 'MY' : 'My', d.my], [g ? 'MZ' : 'Mz', d.mz]])}` : '';
        valores = `${forces}${moments}, a=${n(d.a)} m${g ? ` (${t('report.loadGlobal')})` : ''}`;
        break;
      }
      case 'surface3d': {
        const d = load.data;
        tipo = t('report.loadSurface'); destino = shellText(d);
        const how = surfaceHowText(d, (id) => definitionName(modelStore.model as unknown as DefinitionModel, id));
        valores = `q=${surfaceValueText(d)} kN/m²${how ? `, ${how}` : ''}`;
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
 * Story drift under the seismic cases, the check the Results panel shows: INPRES-CIRSOC 103
 * §6.4, the elastic displacements scaled by Cd/γr and the limit of Tabla 6.4 for the project's
 * group, on the stricter condition D (the panel lets the reader switch to ND).
 *
 * This read the result on screen with no Cd, a fixed 0,015 and a clause that does not state
 * it, so the report and the panel gave two different checks. Without the seismic settings, or
 * with no seismic case solved, there is no check to print.
 */
export function reportStoryDrifts(): { drifts: ReportData['storyDrifts']; basis?: ReportData['storyDriftBasis'] } {
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
    const out = seismicDrifts({ nodes: modelStore.nodes, elements: modelStore.elements.values(), displacements: r.displacements, cd, group, condition: 'D', embedded2D, levels: modelStore.grid?.levels });
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
 * there is no honest version of it without one. An empty model has nothing to solve, and its
 * report comes out empty. The design is reported by the memoria
 * (`store/memoria-inputs.ts`), which reads the design's own results.
 */
export function buildProReportData(opts: {
  config: ReportConfig;
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
  const { config, advancedResults, screenshot, t } = opts;
  const results = resultsStore.results3D
    ?? (modelStore.nodes.size === 0 ? { displacements: [], reactions: [], elementForces: [] } : null);
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
    combinations: serializeCombinations(),
    advancedResults,
    diagnostics: resultsStore.diagnostics3D.length > 0 ? resultsStore.diagnostics3D : undefined,
    screenshot,
    t,
    config,
  };

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
  const drift = reportStoryDrifts();
  data.storyDrifts = drift.drifts;
  if (drift.basis) data.storyDriftBasis = drift.basis;
  return data;
}
