/**
 * A favourable LOCAL check is never read as the member's or the project's approval.
 *
 * The rule (`member-verdict.ts`): a check row (flexure, shear, an anchorage row, …) may read ok
 * only labelled as a local check of the section; the member's verdict and the project's are
 * separate fields that read held, with the reason, whenever something that is not one of the
 * member's own section checks holds it: its slab joined to the columns at one node, a condition the detailing left
 * open (anchorage, cover, clash, splice), its deflection over the limit, a refusal, seismic checks
 * run only as a substitute. Counts of verified members count verdicts; colours follow the verdict.
 *
 * Which members are held is computed here from the primary facts, never through the verdict under
 * test: each context's analysis verdict, the persisted assemblies' open conditions, the deflection
 * checks, the design outcomes and the seismic report. Then every surface that states a member or
 * the project is read as it prints, and a held member reading an approval anywhere is a violation:
 *
 *   desk rows · display status (table, overview chips, viewport) · the labels' three-way status ·
 *   the viewport's colour and label · the rebar workspace's state · the overview counts and the
 *   DISEÑAR stage · the desk's level report · memoria summary row (and another code's entry) ·
 *   workbook element state · IFC DesignState · document readiness, banner, report certificate
 *   table · the project's verdict in the memoria, the workbook and the IFC.
 *
 * Three fixtures: (a) the span building on 40×40 columns at 6 m, its slab joined to the columns at one node;
 * (b) qa-8 with the beams' lateral role not declared, two beams refused and the others verified,
 * then (b′) the same with its seismic checks run (substitutes); (c) the span building with no
 * slab, whose upper column lifts carry an open splice condition.
 *
 * Written so it runs on the tree before the rule (the APIs it needs that did not exist are read
 * optionally and their absence is itself a violation): `HELD_PRINT=1` prints what each read.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore } from '..';
import { verificationStore } from '../verification.svelte';
import { designRunStore } from '../design-run.svelte';
import { detailingStore } from '../detailing.svelte';
import { deskMembers, finalReport } from '../design-desk';
import { memoriaInput } from '../memoria-inputs';
import { designSheets } from '../design-exchange';
import { projectIfcInput } from '../ifc-export';
import { deflectionChecks } from '../serviceability';
import { seismicState, runSeismicChecks } from '../seismic-design.svelte';
import { setForeignCodes } from '../foreign-design';
import { buildOutcomeSummaries } from '../element-status-join';
import { statusOf } from '../../engine/detailing/element-status';
import { readinessBanner, renderReportHtml } from '../../engine/detailing/document-render';
import { familySummary } from '../../report/memoria/render';
import { renderMemoriaHtml } from '../../report/memoria/render';
import { ALL_CHAPTERS } from '../../report/memoria/types';
import { seismicMemberCheckRows } from '../../engine/design/check-rows-families';
import { rcStages, type RcFlowReadings } from '../../flow/rc-stages';
import * as helpers from '../../three/selection-helpers';
import type { DocumentModel } from '../../engine/detailing/document-model';
import { solveCombinations3D, validateAndSolve3D } from '../../engine/solver-service';
import * as wasmSolver from '../../engine/wasm-solver';
import qa8 from '../../templates/fixtures/rc-design-qa-8.json';
import { building, designAndDocument } from './span-fixture';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const PRINT = !!process.env.HELD_PRINT;
const tr = (k: string, p?: Record<string, string | number>) => (p ? `${k}[${Object.entries(p).map(([a, b]) => `${a}=${b}`).join(',')}]` : k);
const ctxRender = { tr: (k: string) => k, msg: (x: { key: string }) => x.key, fmt: (v: number, d: number) => v.toFixed(d) } as never;
const DETAILING_OPEN = new Set(['detailing.anchorage.unresolved', 'detailing.cover.violated', 'detailing.clash.unresolved']);
/** The colours `verificationColor` paints a ratio ≤ 1 with: a pass. */
const PASS_COLOURS = new Set([0x22cc66, 0x88cc22, 0xbfcc11, 0xddaa00]);
const APPROVAL = new Set(['ok', 'warn']);

type Kind = 'analysis' | 'detailing' | 'deflection' | 'refused' | 'seismic';

/** What holds each design member, from the primary facts. */
function heldMembers(): Map<number, Set<Kind>> {
  const out = new Map<number, Set<Kind>>();
  const add = (id: number, k: Kind) => { if (verificationStore.contexts.has(id)) out.set(id, new Set([...(out.get(id) ?? []), k])); };
  for (const [id, c] of verificationStore.contexts) if (c.slabColumnJoint?.verdict === 'pointJoint') add(id, 'analysis');
  for (const a of modelStore.model.detailing?.assemblies ?? detailingStore.assemblies ?? []) for (const u of a.unsupported ?? []) {
    if (DETAILING_OPEN.has(u.key) || u.key.startsWith('detailing.lapCheck.')) for (const id of u.scope.elementIds ?? []) add(id, 'detailing');
  }
  for (const [id, r] of deflectionChecks().rows) if (r.check.status === 'fail') add(id, 'deflection');
  for (const id of verificationStore.contexts.keys()) {
    const o = verificationStore.outcomeFor(id)?.outcome;
    if (o && o !== 'VERIFIED' && o !== 'PROVISIONAL_BIAXIAL') add(id, 'refused');
  }
  const rep = seismicState.report;
  for (const m of rep?.members ?? []) if (seismicMemberCheckRows(m).length) add(m.id, 'seismic');
  for (const j of rep?.joints ?? []) if (!j.strongColumn.roof) for (const c of j.columns) add(c, 'seismic');
  return out;
}

/** What the viewport paints and writes for a member: the overlay's function, or the code it replaced. */
function overlayOf(id: number): { color: number; label: string | null } {
  const ratio = verificationStore.getDisplayRatio(id);
  const vs = (verificationStore as unknown as { memberVerdict?: (id: number) => { status: string; local: string } }).memberVerdict;
  const visual = (helpers as unknown as { verificationVisual?: (v: unknown) => { color: number; label: { text: string } | null } }).verificationVisual;
  if (vs && visual) { const v = vs.call(verificationStore, id); const x = visual({ status: v.status, local: v.local, ratio }); return { color: x.color, label: x.label?.text ?? null }; }
  // Before: `results-sync.ts` coloured by the display status's three states and the ratio, and
  // labelled with `getStatus`'s glyph (these lines, as they were).
  const ds = verificationStore.getDisplayStatus(id);
  const state = ds === 'unavailable' ? 'unavailable' : ds === 'stale' ? 'stale' : 'current';
  const color = helpers.verificationStateColor(state === 'unavailable' ? null : ratio, state);
  if (ds === 'unavailable' || ratio === null) return { color, label: null };
  const st = verificationStore.getStatus(id);
  const glyph = ds === 'stale' ? '⌛ ' : st === 'fail' ? '✗ ' : st === 'warn' ? '⚠ ' : '';
  return { color, label: `${glyph}${ratio.toFixed(2)}` };
}

interface Reading {
  held: Map<number, Set<Kind>>;
  violations: string[];
  /** Held members whose local rows read ok somewhere (the memoria's rows of their own entry). */
  localOkHeld: number;
  /** The scope labels the outputs carry (after: all true). */
  scope: { workbookLocalHeader: boolean; memoriaLegend: boolean; memoriaMemberState: boolean; reportLocalHeader: boolean };
  project: { memoria: string | null; workbook: string | null; ifc: string | null };
  counts: { ok: number; warn: number; total: number };
}

function readSurfaces(doc: DocumentModel): Reading {
  const held = heldMembers();
  const v: string[] = [];
  const bad = (surface: string, id: number | string, what: unknown) => v.push(`${surface} e${id} [${[...(held.get(Number(id)) ?? [])].join('+')}; ${verificationStore.getDisplayStatus(Number(id))}]: ${String(what)}`);

  // ── The UI's readers.
  const desk = new Map(deskMembers().map((m) => [m.id, m.status]));
  const summaries = buildOutcomeSummaries();
  for (const [id] of held) {
    if (APPROVAL.has(String(desk.get(id)))) bad('desk', id, desk.get(id));
    const ds = verificationStore.getDisplayStatus(id);
    if (APPROVAL.has(ds)) bad('displayStatus', id, ds);
    const gs = verificationStore.getStatus(id);
    if (gs === 'ok' || gs === 'warn') bad('labelStatus', id, gs);
    const o = overlayOf(id);
    if (PASS_COLOURS.has(o.color)) bad('viewportColour', id, o.color.toString(16));
    if (o.label !== null && !/[✗⊘⌛]/.test(o.label)) bad('viewportLabel', id, o.label);
    const rs = statusOf(true, summaries.get(id));
    if (rs === 'MODELLED' || rs === 'DESIGNED_NOT_MODELLED') bad('rebarWorkspace', id, rs);
  }
  const counts = verificationStore.providedSummary;
  const free = [...verificationStore.contexts.keys()].filter((id) => !held.has(id)).length;
  if (counts.ok + counts.warn > free) v.push(`overviewCounts: ${counts.ok} ok + ${counts.warn} warn > ${free} members nothing holds`);
  const levelOk = finalReport().reduce((n, l) => n + l.counts.ok + l.counts.warn, 0);
  const steelOk = finalReport().reduce((n, l) => n + l.steelOk, 0);
  if (levelOk - steelOk > free) v.push(`deskLevelReport: ${levelOk} ok/warn > ${free}`);
  const readings: RcFlowReadings = {
    hasModel: true, solved: true, analysisStale: false, codeChosen: true, hasDemands: true,
    designApplicable: counts.total, designProposed: counts.withReinforcement, designVerified: counts.ok,
    designUnresolved: counts.fail + counts.provisional + counts.unavailable + counts.stale, detailed: true, documented: true,
  } as RcFlowReadings;
  if (held.size > 0 && rcStages(readings).find((s) => s.id === 'design')?.complete) v.push('rcStage: DISEÑAR complete with held members');

  // ── The memoria, the workbook, the IFC.
  const memo = memoriaInput(tr, 'es');
  const sheets = designSheets(tr, 'es');
  const els = sheets.find((s) => s.name === 'Design elements')!;
  const checks = sheets.find((s) => s.name === 'Design checks')!;
  const ifc = projectIfcInput(tr, 'es', 'held');
  let localOkHeld = 0;
  for (const [id] of held) {
    const el = memo.elements.find((e) => e.id === `e${id}`);
    if (!el) continue;
    if (el.rows.some((r) => r.status === 'ok')) localOkHeld++;
    const row = familySummary([el], ctxRender, el.family);
    if (/memo\.state\.ok\b/.test(row)) bad('memoriaSummary', id, 'memo.state.ok');
    for (const r of els.rows.filter((x) => x[0] === el.name)) if (r[6] === 'memo.state.ok') bad('workbookState', id, r[6]);
    const c = verificationStore.contextFor(id)!;
    const m = ifc.members.find((x) => x.id === (c.span?.key ?? String(id)));
    if (m && m.props?.DesignState === 'satisfies') bad('ifcDesignState', id, 'satisfies');
  }
  // Another code's entry reads the same forces: an unvalidated analysis holds it too.
  for (const el of memo.elements) {
    const id = Number(/^fx-.+-(\d+)$/.exec(el.id)?.[1]);
    if (!held.get(id)?.has('analysis')) continue;
    if (/memo\.state\.ok\b/.test(familySummary([el], ctxRender, el.family))) bad('memoriaOtherCode', id, `${el.id} memo.state.ok`);
  }

  // ── The document.
  // The document reads the holds it carries (the analysis, the detailing, the deflection through
  // its certificates, a refusal through its missing certificate); the seismic report is the
  // session's, and the sheets say FOR REVIEW, NOT FOR CONSTRUCTION at best until a person reviews.
  const heldInDoc = doc.certificates.filter((c) => [...(held.get(c.elementId) ?? [])].some((k) => k !== 'seismic'));
  if (heldInDoc.length > 0) {
    if (['ISSUED', 'REVIEWED', 'FOR_REVIEW'].includes(doc.readiness)) v.push(`documentReadiness: ${doc.readiness}`);
    if (!/NO APTO/.test(readinessBanner(doc, 'es'))) v.push(`documentBanner: ${readinessBanner(doc, 'es')}`);
  }
  const report = renderReportHtml(doc, { locale: 'es', projectName: 'held' }, (k) => k);
  if (/class="banner ok"/.test(report) && heldInDoc.length > 0) v.push('reportBanner: ok');
  const certRows = [...report.matchAll(/<tr class="[^"]*"><td>(\d+)<\/td><td>[^<]*<\/td><td>([^<]*)<\/td><td[^>]*>[^<]*<\/td>(<td[^>]*>([^<]*)<\/td>)?<\/tr>/g)];
  for (const [, idText, status, , heldCell] of certRows) {
    const k = held.get(Number(idText));
    if (!k || !(k.has('analysis') || k.has('detailing'))) continue;
    if (status === 'ok' || status === 'warn') if (!heldCell || heldCell === '—') bad('reportCertificate', idText, `${status}, nothing beside it`);
  }

  // ── The project's verdict.
  const html = renderMemoriaHtml(memo, new Set(ALL_CHAPTERS), ctxRender, 'es');
  const memoProject = /verdict\.memo\.projectState:<\/b> ([^<]*)/.exec(html)?.[1] ?? null;
  const verdictSheet = sheets.find((s) => s.name === 'Design verdict');
  const wbProject = verdictSheet ? String(verdictSheet.rows[1]?.[0] ?? '') : null;
  const ifcProject = (ifc as { buildingProps?: Record<string, unknown> }).buildingProps?.ProjectDesignState;
  const projectHeld = held.size > 0;
  if (projectHeld) {
    if (!memoProject || !memoProject.startsWith('verdict.project.held')) v.push(`memoriaProject: ${memoProject}`);
    if (!wbProject || !wbProject.startsWith('verdict.project.held')) v.push(`workbookProject: ${wbProject}`);
    if (typeof ifcProject !== 'string' || !ifcProject.startsWith('not approved')) v.push(`ifcProject: ${String(ifcProject)}`);
  }

  return {
    held, violations: v, localOkHeld,
    scope: {
      workbookLocalHeader: checks.rows[0]?.[10] === 'local check status',
      memoriaLegend: html.includes('verdict.memo.localLegend'),
      memoriaMemberState: html.includes('verdict.memo.memberState'),
      reportLocalHeader: report.includes('Comprobaciones locales de la sección'),
    },
    project: { memoria: memoProject, workbook: wbProject, ifc: typeof ifcProject === 'string' ? ifcProject : null },
    counts: { ok: counts.ok, warn: counts.warn, total: counts.total },
  };
}

const kinds = (r: Reading) => {
  const c: Partial<Record<Kind, number>> = {};
  for (const s of r.held.values()) for (const k of s) c[k] = (c[k] ?? 0) + 1;
  return c;
};
const show = (name: string, r: Reading) => {
  if (!PRINT) return;
  console.log(`${name}: held ${r.held.size} ${JSON.stringify(kinds(r))}, counts ${JSON.stringify(r.counts)}, localOkHeld ${r.localOkHeld}, scope ${JSON.stringify(r.scope)}, project ${JSON.stringify(r.project)}`);
  console.log(`${name}: ${r.violations.length} violation(s)\n  ${r.violations.join('\n  ')}`);
};

function qa8Model(): void {
  modelStore.clear(); resultsStore.clear(); verificationStore.clear(); historyStore.clear(); detailingStore.clear();
  designRunStore.resetMarks();
  modelStore.restore({
    nodes: qa8.nodes.map((n: any) => [n.id, n]) as never, materials: qa8.materials.map((m: any) => [m.id, m]) as never,
    sections: qa8.sections.map((s: any) => [s.id, s]) as never, elements: qa8.elements.map((e: any) => [e.id, e]) as never,
    supports: qa8.supports.map((s: any) => [s.id, s]) as never, loads: qa8.loads as never, loadCases: qa8.loadCases as never,
    combinations: qa8.combinations as never, nextId: { node: 100, material: 10, section: 10, element: 100, support: 10, load: 100 },
  } as never);
  const combo = solveCombinations3D(modelStore.model as never, modelStore.model.loadCases, modelStore.model.combinations, true, false);
  if (typeof combo === 'string' || !combo) throw new Error(`solve: ${combo}`);
  resultsStore.setResults3D(validateAndSolve3D(modelStore.model as never, true, false) as never);
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
}

describe('(a) the span building on 40×40 columns at 6 m: its slab joined to the columns at one node', () => {
  let r: Reading;
  beforeAll(() => {
    building(6, { columnSide: 0.4 });
    setForeignCodes({ concrete: 'ec2-uk' });
    const doc = designAndDocument();
    r = readSurfaces(doc);
    show('A', r);
  }, 600_000);

  it('every design member is held by its analysis, and no surface reads it or the project as approved', () => {
    // 26 design members (14 spans, 12 columns), every one held by its analysis. Six were held by
    // the detailing too, their lifts' laps on one centreline, until the lower bars were cranked
    // (§10.7.4.1, `splice-span-fixture.test.ts`).
    expect(kinds(r)).toEqual({ analysis: 26 });
    expect(r.held.size).toBe(r.counts.total);
    expect(r.violations).toEqual([]);
    expect([r.counts.ok, r.counts.warn]).toEqual([0, 0]);
  });

  it('their local rows still read ok, labelled as local checks; the project reads held with its reason', () => {
    expect(r.localOkHeld).toBeGreaterThan(0);
    expect(r.scope).toEqual({ workbookLocalHeader: true, memoriaLegend: true, memoriaMemberState: true, reportLocalHeader: true });
    expect(r.project.memoria).toMatch(/^verdict\.project\.held\[n=0,total=\d+\]$/);
    expect(r.project.ifc).toMatch(/^not approved: 0 of \d+ concrete design members satisfy$/);
  });
});

describe('(b) qa-8, the beams\' lateral role not declared: two refused, the others verified', () => {
  let r: Reading;
  let seis: Reading;
  let free: Array<[number, string]> = [];
  beforeAll(() => {
    qa8Model();
    const doc = designAndDocument();
    r = readSurfaces(doc);
    free = [...verificationStore.contexts.keys()].filter((id) => !r.held.has(id)).map((id) => [id, verificationStore.getDisplayStatus(id)]);
    show('B', r);
    // (b′) the same project with its seismic checks run: chapter 18 only as a substitute.
    runSeismicChecks();
    seis = readSurfaces(doc);
    show('B-seismic', seis);
  }, 600_000);

  it('the two refused beams are held, the others read ok, and the project is not approved', () => {
    expect(kinds(r)).toEqual({ refused: 2 });
    expect(free.map(([, s]) => s)).toEqual(Array(free.length).fill('ok'));
    expect(r.counts.ok).toBe(free.length);
    expect(r.violations).toEqual([]);
    expect(r.project.memoria).toMatch(/^verdict\.project\.held\[n=6,total=8\]$/);
    expect(r.project.ifc).toBe('not approved: 6 of 8 concrete design members satisfy');
  });

  it('with its seismic checks run as substitutes, the members they cover are held and nothing reads them as approved', () => {
    expect(kinds(seis)).toEqual({ refused: 2, seismic: 6 });
    expect(seis.violations).toEqual([]);
    expect(seis.counts.ok).toBeLessThan(r.counts.ok);
  });
});

describe('(c) the span building with no slab: a member held by the detailing alone', () => {
  let r: Reading;
  let lifts: number[] = [];
  beforeAll(() => {
    building(null, { columnSide: 0.4 });
    const doc = designAndDocument();
    lifts = [...new Set((modelStore.model.detailing?.assemblies ?? []).flatMap((a) => a.unsupported)
      .filter((u) => u.key.startsWith('detailing.lapCheck.')).flatMap((u) => u.scope.elementIds ?? []))];
    r = readSurfaces(doc);
    show('C', r);
  }, 600_000);

  it('it is held by the detailing alone, and no surface reads it or the project as approved', () => {
    // One member holds a detailing condition. Seven before the lower column lifts were cranked
    // (§10.7.4.1): the six upper lifts held their laps open, each pair on one centreline
    // (`splice-span-fixture.test.ts`). Nine before the layers were stepped from the largest bar
    // above them (`stackedLayerDepth`): beam e20's second top row sat 5,1 mm inside the clear
    // distance it owed the continuous pair through e20/e25, two unresolved clashes that held both.
    expect(lifts).toEqual([]);
    expect(kinds(r)).toEqual({ detailing: 1 });
    expect([...r.held.values()].some((k) => k.has('analysis'))).toBe(false);
    expect(r.violations).toEqual([]);
    expect(r.localOkHeld).toBeGreaterThan(0);
    expect(r.project.memoria).toMatch(/^verdict\.project\.held/);
  });
});
