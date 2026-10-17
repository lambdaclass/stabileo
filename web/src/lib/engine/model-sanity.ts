/**
 * The engine's model sanity review (`engine/src/sanity`), fed from the app and read back as
 * diagnostics.
 *
 * The solver computes the exact answer to the model it is given; the review catches the models
 * that are wrong in ways the solve cannot see — E in GPa typed as MPa, geometry in millimetres, a
 * dead load pointing up, self-weight left out, supports that only just hold. The checks and their
 * thresholds live in the engine, where they are tested with the solver; this file only gathers
 * what they read and translates what they say.
 *
 * What it gathers, and from where:
 *  - the structure as the solve builds it (`buildSolverInput3D`): nodes, members, sections,
 *    supports and springs, shells, constraints;
 *  - materials from the model, which carries the unit weight, the strength and the grade the
 *    solver input leaves out;
 *  - per load case, the applied side summed independently from the model (`statics-check.ts`,
 *    the same sum the statics table shows), each force with its point, and the case's results.
 *
 * A check that cannot run says so: the skipped checks come back as information, grouped by why,
 * so a short list is never read as a clean bill of health.
 *
 * Pure apart from the WASM call: the stores are read by the caller.
 */
import { buildSolverInput3D, shouldEmbedFlat2DModelIn3D, type ModelData } from './solver-service';
import { withCaseEffects, singleSolveModel } from './case-effects';
import { appliedResultant } from './statics-check';
import { catalogueGradeFamily } from './steel/grade-family';
import { reviewModelSanityWasm } from './wasm-solver';
import type { AnalysisResults3D } from './types-3d';
import type { ModalResult3D } from './result-types';
import type { SolverDiagnostic } from './types';

// ─── The engine's types, as JSON ─────────────────────────────────

export type SanitySeverity = 'error' | 'warning' | 'info';

export interface SanityFinding {
  code: string;
  check: string;
  severity: SanitySeverity;
  message: string;
  why: string;
  fix: string;
  elementIds?: number[];
  nodeIds?: number[];
  shellIds?: number[];
  caseId?: number;
  params: Record<string, number | string>;
}

export interface SanityCheckStatus {
  check: string;
  status: 'ran' | 'partial' | 'skipped';
  reason?: string;
  detail?: string;
  params?: Record<string, number | string>;
}

export interface SanityReport {
  findings: SanityFinding[];
  checks: SanityCheckStatus[];
}

type V6 = [number, number, number, number, number, number];

export interface SanityContext {
  model: ModelData & {
    loadCases: ReadonlyArray<{ id: number; name: string; type: string; category?: string; spectral?: unknown; includes?: unknown; notional?: unknown }>;
  };
  /** Results per load case (PRO), or the single solve's. */
  perCase: ReadonlyMap<number, AnalysisResults3D>;
  single?: AnalysisResults3D | null;
  modal?: ModalResult3D | null;
  includeSelfWeight: boolean;
  leftHand: boolean;
}

const KIND: Record<string, string> = {
  D: 'dead', L: 'live', Lr: 'roof_live', S: 'snow', W: 'wind', Wa: 'wind', E: 'seismic', T: 'temperature',
};
const KIND_OF_CATEGORY: Record<string, string> = {
  permanent: 'dead', imposed: 'live', roofImposed: 'roof_live', snow: 'snow', wind: 'wind', serviceWind: 'wind',
  seismic: 'seismic', thermal: 'temperature',
};

/** The nodes a constraint ties together, whatever its kind: every node id it names. */
function constraintNodes(c: unknown): number[] {
  const out: number[] = [];
  const walk = (v: unknown, key: string) => {
    if (typeof v === 'number' && /node/i.test(key)) out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(c, '');
  return [...new Set(out)];
}

/**
 * The review's input. Null when there is no structure to review (the solve could not be built:
 * the model's own checks already say why).
 */
export function buildSanityInput(ctx: SanityContext): { input: unknown; shellKeys: string[] } | null {
  const { model } = ctx;
  const si = buildSolverInput3D(model, false, ctx.leftHand);
  if (!si) return null;
  const shellKeys: string[] = [];
  const shells: unknown[] = [];
  for (const p of si.plates?.values() ?? []) {
    shells.push({ id: shellKeys.length, kind: 'plate', nodes: [...p.nodes], materialId: p.materialId, thickness: p.thickness });
    shellKeys.push(`p${p.id}`);
  }
  for (const q of si.quads?.values() ?? []) {
    shells.push({ id: shellKeys.length, kind: 'quad', nodes: [...q.nodes], materialId: q.materialId, thickness: q.thickness });
    shellKeys.push(`q${q.id}`);
  }
  const links: number[][] = [];
  for (const c of si.constraints ?? []) {
    const n = constraintNodes(c);
    if (n.length > 1) links.push(n);
  }
  for (const c of si.connectors?.values() ?? []) links.push([c.nodeI, c.nodeJ]);

  const solved = ctx.perCase.size > 0 || !!ctx.single;
  // Moments close about the origin in the model's own coordinates only: a flat 2D model is
  // solved turned into the XZ plane, and its moments are then about other axes than its loads'.
  const planar = shouldEmbedFlat2DModelIn3D(model);
  const momentsOpen = shellKeys.length > 0 || planar;
  const caseTypes = new Map(model.loadCases.map((c) => [c.id, c.type]));
  const base = model as never;
  const effects = withCaseEffects(base, model.loadCases as never, { includeSelfWeight: ctx.includeSelfWeight, leftHand: ctx.leftHand });

  const v6 = (o: { fx: number; fy: number; fz: number; mx: number; my: number; mz: number }): V6 => [o.fx, o.fy, o.fz, o.mx, o.my, o.mz];
  const resultsOf = (r: AnalysisResults3D | undefined | null) => r ? {
    solved: true,
    reactions: r.reactions.map((x) => ({ nodeId: x.nodeId, v: v6(x) })),
    displacements: r.displacements.map((d) => ({ nodeId: d.nodeId, v: [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz] })),
    memberAxial: r.elementForces.map((f) => ({ id: f.elementId, nStart: f.nStart, nEnd: f.nEnd })),
  } : { solved: false };
  const summed = (m: ModelData, id: number | null) => {
    const loadPoints: Array<{ p: number[]; f: number[] }> = [];
    const a = appliedResultant(m, id, {
      includeSelfWeight: ctx.includeSelfWeight, caseTypes, leftHand: ctx.leftHand,
      onForce: (F, p) => { loadPoints.push({ p: [...p], f: [...F] }); },
    });
    return { applied: v6(a.applied), uncovered: a.uncovered, selfWeight: a.selfWeightIncluded, loadPoints };
  };

  const cases: unknown[] = [];
  if (ctx.perCase.size === 0 && ctx.single) {
    // A single solve of every load: one case, of no particular kind.
    const s = summed(singleSolveModel(base, model.loadCases as never), null);
    cases.push({ id: 0, name: '', kind: 'other', ...s, momentsClose: !momentsOpen, ...resultsOf(ctx.single) });
  } else {
    for (const c of model.loadCases) {
      const r = ctx.perCase.get(c.id);
      const s = summed(effects, c.id);
      const notCheckable = c.spectral ? 'spectral' : r?.magnitude ? 'magnitude' : undefined;
      cases.push({
        id: c.id, name: c.name,
        kind: (c.category && KIND_OF_CATEGORY[c.category]) ?? KIND[c.type] ?? 'other',
        ...s,
        momentsClose: !momentsOpen && !r?.secondOrder,
        ...(notCheckable ? { notCheckable } : {}),
        ...resultsOf(r),
      });
    }
  }

  const input = {
    up: 'z',
    planar,
    nodes: [...si.nodes.values()].map((n) => ({ id: n.id, x: n.x, y: n.y, z: n.z })),
    materials: [...model.materials.values()].map((m) => {
      const family = m.gradeId ? catalogueGradeFamily(m.gradeId) : null;
      return { id: m.id, name: m.name, e: m.e, rho: m.rho, ...(m.fy ? { fy: m.fy } : {}), ...(family ? { family } : {}) };
    }),
    sections: [...si.sections.values()].map((s) => ({ id: s.id, name: model.sections.get(s.id)?.name ?? '', a: s.a, iz: s.iz, iy: s.iy })),
    members: [...si.elements.values()].map((e) => ({
      id: e.id, nodeI: e.nodeI, nodeJ: e.nodeJ, materialId: e.materialId, sectionId: e.sectionId, truss: e.type !== 'frame',
    })),
    shells,
    links,
    // The supports the project placed. The solve adds restraint of its own — tiny rotational
    // springs on rotations nothing holds (`orphan-rotations-3d.ts`) — which is not the
    // project's and would read as an absurdly soft spring: a spring counts only where the
    // project's support states one.
    supports: [...si.supports.values()].flatMap((s) => {
      const own = [...model.supports.values()].find((m) => m.nodeId === s.nodeId);
      if (!own) return [];
      const stated = (['kx', 'ky', 'kz', 'krx', 'kry', 'krz'] as const).some((k) => (own[k] ?? 0) > 0);
      return [{
        nodeId: s.nodeId,
        restraint: [s.rx, s.ry, s.rz, s.rrx, s.rry, s.rrz],
        spring: [s.kx, s.ky, s.kz, s.krx, s.kry, s.krz].map((k) => (stated && k && k > 0 ? k : null)),
      }];
    }),
    cases,
    modal: ctx.modal?.modes?.length
      ? { modes: ctx.modal.modes.map((m) => ({ period: m.period, massX: m.massRatioX ?? 0, massY: m.massRatioY ?? 0 })) }
      : null,
    solved,
  };
  return { input, shellKeys };
}

/** Run the review. Null when there is nothing to review or the WASM build has no review. */
export function reviewModelSanity(ctx: SanityContext): { report: SanityReport; shellKeys: string[] } | null {
  const built = buildSanityInput(ctx);
  if (!built) return null;
  const out = reviewModelSanityWasm(JSON.stringify(built.input));
  if (out === null) return null;
  return { report: JSON.parse(out) as SanityReport, shellKeys: built.shellKeys };
}

// ─── As diagnostics ──────────────────────────────────────────────

type T = (k: string) => string;

/** Params that are ids or counts: printed as integers, without grouping. */
const PLAIN = new Set(['node', 'member', 'column', 'storey', 'count', 'floors', 'members', 'shells', 'nodes']);
/** Params whose text is a word the app translates. */
const WORDS = new Set(['system', 'family', 'kind', 'what']);

function formatParam(k: string, v: number | string, t: T, locale: string): string {
  if (typeof v === 'string') {
    if (!WORDS.has(k)) return v;
    const key = `diag.sanity.word.${v}`;
    const w = t(key);
    return w === key ? v : w;
  }
  if (PLAIN.has(k)) return String(Math.round(v));
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e7)) return v.toExponential(2);
  return Number(v.toPrecision(3)).toLocaleString(locale);
}

function fill(template: string, params: Record<string, number | string>, t: T, locale: string): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? formatParam(k, params[k]!, t, locale) : m));
}

/** A finding in the app's language: what was found, with its numbers. */
export function findingMessage(f: SanityFinding, t: T, locale: string): string {
  const key = `diag.sanity.${f.code}`;
  const template = t(key);
  if (template === key) return f.message;
  let text = fill(template, f.params, t, locale);
  if (f.params.unit !== undefined) {
    const hint = t(`diag.sanity.hint.${f.code}`);
    if (hint !== `diag.sanity.hint.${f.code}`) text += ' ' + fill(hint, f.params, t, locale);
  }
  return text;
}

/**
 * The review as the Diagnostics panel's entries: each finding with its code (`SANITY_…`, whose
 * tooltip says why it matters and how to fix it), and one information entry per reason some
 * checks did not run.
 */
export function sanityDiagnostics(report: SanityReport, shellKeys: readonly string[], t: T, locale = 'en'): SolverDiagnostic[] {
  const out: SolverDiagnostic[] = [];
  for (const f of report.findings) {
    const d: SolverDiagnostic = {
      severity: f.severity,
      code: `SANITY_${f.code.toUpperCase()}`,
      message: findingMessage(f, t, locale),
      source: 'model',
    };
    if (f.elementIds?.length) d.elementIds = f.elementIds;
    if (f.nodeIds?.length) d.nodeIds = f.nodeIds;
    if (f.shellIds?.length) d.shellKeys = f.shellIds.map((i) => shellKeys[i]!).filter(Boolean);
    out.push(d);
  }
  // Checks that did not run, or ran on part of the model, grouped by why.
  const byReason = new Map<string, { checks: string[]; params: Record<string, number | string> }>();
  for (const c of report.checks) {
    if (c.status === 'ran' || !c.reason) continue;
    const g = byReason.get(c.reason) ?? { checks: [], params: {} };
    g.checks.push(t(`diag.sanity.check.${c.check}`));
    Object.assign(g.params, c.params ?? {});
    byReason.set(c.reason, g);
  }
  for (const [reason, g] of byReason) {
    const why = fill(t(`diag.sanity.reason.${reason}`), g.params, t, locale);
    out.push({
      severity: 'info',
      code: 'SANITY_NOT_CHECKED',
      message: fill(t('diag.sanity.notChecked'), { checks: g.checks.join(', '), why }, t, locale),
      source: 'model',
    });
  }
  return out;
}
