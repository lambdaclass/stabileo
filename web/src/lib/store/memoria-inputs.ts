/**
 * The memoria de cálculo, read from the project as it stands: its codes and what they cover, the
 * modelling hypotheses, the actions and their basis, the global analysis, every designed element
 * with its check rows, the notices and the quantities. The data is built here once; the document
 * (`report/memoria/render.ts`) only prints it.
 *
 * Measuring rules for the quantities, stated once: a beam is formed on its soffit and two sides
 * (b + 2h, the slab not deducted), a column on its perimeter, a slab on its soffit, a wall on both
 * faces and a footing on its sides. Steel members weigh A·L·ρ; bars weigh what their marks weigh,
 * shared equally among the elements a mark belongs to.
 */
import { modelStore } from './model.svelte';
import { verificationStore } from './verification.svelte';
import { detailingStore } from './detailing.svelte';
import { holdText, projectVerdict, projectVerdictLines } from './member-verdict';
import { designRunStore } from './design-run.svelte';
import { jointDesignStore } from './joint-design.svelte';
import { steelJoints } from './joint-typology';
import { jointChecks } from './joint-checks';
import { seismicState, modelStoreyStiffness } from './seismic-design.svelte';
import { designData } from './design-data';
import { regulationsStore } from './regulations.svelte';
import { resultsStore } from './results.svelte';
import { reportStoryDrifts } from '../engine/pro-report-inputs';
import { materialCheckState } from './material-check.svelte';
import { headChecks, matChecks, pileChecks, specialPanels } from './special-floors';
import { ptPanels, stairChecks } from './stairs-pt';
import { fireChecks } from './fire';
import { FOREIGN_MATRIX, foreignCodes, foreignRun } from './foreign-design';
import { offeredStatus, type ForeignCodeId } from '../engine/design/foreign/matrix';
import { corbelChecks, couplingChecks, openingChecks } from './special-elements';
import { infillChecks, masonryWallChecks } from './masonry-infill';
import { dowelChecks, hssJointChecks } from './special-connections';
import { deflectionChecks } from './serviceability';
import { concreteCheckRows, steelCheckRows } from '../engine/design/check-rows';
import { currentFloorReadings, currentFootingReadings } from './floor-readings';
import { jointShearCheckRows, seismicJointCheckRows, seismicMemberCheckRows } from '../engine/design/check-rows-families';
import { CIRSOC201_CAPABILITIES_2025 } from '../engine/design/adapters/cirsoc201-capabilities';
import { CIRSOC301_CAPABILITIES } from '../engine/design/adapters/cirsoc301-capabilities';
import { materialFamilyOf } from '../engine/steel/material-family';
import { catalogueGradeFamily } from '../engine/steel/grade-family';
import { reinforcementTakeoff } from '../engine/quantities';
import { steelTakeoff } from '../engine/steel/takeoff';
import { currentRevision } from '../model/project-info';
import { teAt } from '../i18n/engine-text';
import { fromVerifStatus, statusOfRatio, type CheckRow } from '../design-contract';
import type { CapabilityMatrix } from '../codes/capability';
import { quantitiesBy } from '../report/memoria/quantities';
import { levelNamer, measure } from './takeoff';
import type { MemoriaElement, MemoriaInput, ScopeEntry } from '../report/memoria/types';
import { lateralAnchorageRow, lateralReadingKey } from '../engine/design/lateral-anchorage-row';

const TOL = 0.05;
type Tr = (key: string, params?: Record<string, string | number>) => string;


/** The row code each foreign code's design writes. */
const FX_CODE: Record<ForeignCodeId, string> = { aci318: 'aci-318', aisc360: 'aisc-360', ec2: 'en-1992-1-1', 'ec2-uk': 'bs-en-1992-1-1', ec3: 'en-1993-1-1', 'ec3-uk': 'bs-en-1993-1-1' };
const familyOfFx = (code: ForeignCodeId): 'concrete' | 'steel' => (code === 'aci318' || code === 'ec2' || code === 'ec2-uk' ? 'concrete' : 'steel');

const isSteel = (materialId: number) => materialFamilyOf(modelStore.model.materials.get(materialId) as never, catalogueGradeFamily).family === 'steel';

function scopeOf(matrix: CapabilityMatrix, code: string, tr: Tr): ScopeEntry[] {
  return Object.entries(matrix).filter(([, d]) => d.refs.length || d.facets.verify || d.limitation).map(([key, d]) => ({
    code, feature: `capability.${key}`, offered: d.facets.verify,
    clauses: [...new Set(d.refs.map((r) => r.clause))], ...(d.limitation ? { limitation: d.limitation } : {}),
  })).map((s) => ({ ...s, feature: tr(s.feature) === s.feature ? s.feature.replace('capability.', '') : s.feature }));
}

/**
 * The deflection of every member a limit applies to, as a row: δ against ℓ/n, with ℓ the length
 * the limit is taken over (2L for a cantilever) and both sides printed as the check read them.
 * CIRSOC 201 Tabla 24.2.2 for concrete, CIRSOC 301 Apéndice L for steel.
 */
export function deflectionCheckRows(): Map<number, CheckRow> {
  const out = new Map<number, CheckRow>();
  for (const [id, r] of deflectionChecks().rows) {
    const d = r.check;
    if (!d) continue;
    const e = modelStore.model.elements.get(id), steel = e ? isSteel(e.materialId) : false;
    const over = d.limitLength !== d.span ? `${+(d.limitLength / d.span).toFixed(3)}L` : 'L';
    const spanOverDelta = d.deltaTotal > 0 ? d.limitLength / d.deltaTotal : Number.POSITIVE_INFINITY;
    out.set(id, {
      code: steel ? 'cirsoc-301' : 'cirsoc-201', edition: steel ? '2018' : '2025', clause: steel ? 'L.1' : '24.2.2',
      title: 'Deflection', titleKey: 'check.deflection', formula: `δ ≤ ${over}/${d.limitDivisor}`,
      inputs: [
        { symbol: 'δ', value: Math.round(d.deltaTotal * 1e4) / 10, unit: 'mm' }, { symbol: over, value: d.limitLength, unit: 'm' },
        { symbol: `${over}/δ`, value: Number.isFinite(spanOverDelta) ? Math.round(spanOverDelta) : '∞' }, { symbol: 'n', value: d.limitDivisor },
      ],
      demand: d.deltaTotal * 1000, capacity: d.limit * 1000, unit: 'mm', ratio: d.ratio, status: fromVerifStatus(d.status), location: over,
      ...(d.steps.length ? { derivation: d.steps } : {}),
    });
  }
  return out;
}

const OTHER_CODE: Record<string, string> = { timber: 'cirsoc-601', aluminium: 'en-1999-1-1', coldFormed: 'cirsoc-303', composite: 'aisc-360' };
const OTHER_CLAUSES: Record<string, string[]> = { timber: ['3.3', '3.4', '3.6', '3.7', '3.8', '3.9'], aluminium: ['6.2', '6.3'], coldFormed: ['C', 'D'], composite: ['I2', 'I3', 'I4', 'I5'] };

export function memoriaInput(tr: Tr, locale: string): MemoriaInput {
  const m = modelStore.model, lv = levelNamer();
  const n2 = (v: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  const nodes = m.nodes, info = m.projectInfo, tb = m.detailing?.titleBlock;
  const frames = [...m.elements.values()];
  const anySteel = frames.some((e) => isSteel(e.materialId));
  const anyConcrete = frames.some((e) => !isSteel(e.materialId)) || m.footings.size > 0;
  const zOf = (id: number) => nodes.get(id)?.z ?? 0;
  const vertical = (e: { nodeI: number; nodeJ: number }) => {
    const a = nodes.get(e.nodeI), b = nodes.get(e.nodeJ);
    return !!a && !!b && Math.hypot(b.x - a.x, b.y - a.y) < TOL && Math.abs((b.z ?? 0) - (a.z ?? 0)) > TOL;
  };
  const lenOf = (e: { nodeI: number; nodeJ: number }) => {
    const a = nodes.get(e.nodeI), b = nodes.get(e.nodeJ);
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)) : 0;
  };
  const levelOfElement = (id: number) => { const e = m.elements.get(id); return e ? lv.name(Math.max(zOf(e.nodeI), zOf(e.nodeJ))) : undefined; };
  const sectionLabel = (sid: number) => { const s = m.sections.get(sid); return s ? (s.b && s.h && (!s.shape || s.shape === 'rect') ? `${s.name} (${Math.round(s.b * 100)}×${Math.round(s.h * 100)})` : s.name) : '—'; };

  // ── Elements and their rows
  const elements: MemoriaElement[] = [];
  const memberData = (id: number): Array<[string, string]> => {
    const e = m.elements.get(id);
    if (!e) return [];
    return [[tr('memo.el.section'), sectionLabel(e.sectionId)], [tr('memo.el.material'), m.materials.get(e.materialId)?.name ?? '—'], [tr('memo.el.length'), `${n2(lenOf(e))} m`], [tr('memo.el.nodes'), `${e.nodeI} – ${e.nodeJ}`]];
  };
  /** A beam's role in the lateral-force-resisting system, as the design read it (`model/lateral-system.ts`). */
  const lateralDatum = (id: number): Array<[string, string]> => {
    const c = verificationStore.contextFor(id);
    return c?.elementType === 'beam' ? [[tr('lateral.symbol'), tr(lateralReadingKey(c.lateral))]] : [];
  };
  const elName = (id: number, kind: string) => { const e = m.elements.get(id); return e?.name && e.name.length <= 24 ? e.name : `${tr(`memo.kind.${kind}`)} ${id}`; };
  /**
   * The detailing's unresolved anchorages, as rows of the member they hold. The design rows say
   * the section works; these say a bar of it could not be anchored where it ends, so the member
   * is not stated as satisfying anything until the detailing resolves it (the IFC and the
   * workbook read these rows too).
   */
  const anchorageRows = new Map<number, CheckRow[]>();
  // The persisted assemblies, as `buildDocument` reads them: the store's derived view can be a
  // tick behind the run that just wrote them.
  /**
   * Clashes the repair ladder could not separate without moving a bar out of its section, off the
   * depth the design verified or into another bar (`detailing.clash.unresolved`): ONE row per
   * member, with how many and the largest shortfall. Per clash they run to thousands on a large
   * frame (about 1 500 on the 408-member one), each already listed with its cause in the document's
   * open issues; the memoria's job is to say the member is not yet satisfied and by how much.
   */
  const clashes = new Map<number, { n: number; worst: number; pairs: string[] }>();
  /**
   * The laps the detailing held open (`detailing.lapCheck.*`, `splice-checks.ts`): ONE row per
   * member, with how many conditions, the clauses they name and the first pairs. The member's
   * sections may pass; the laps that join its bars to the next member's are not shown to.
   */
  const laps = new Map<number, { n: number; clauses: Set<string>; pairs: string[] }>();
  for (const a of m.detailing?.assemblies ?? detailingStore.assemblies) for (const u of a.unsupported ?? []) {
    if (u.key.startsWith('detailing.lapCheck.')) {
      for (const id of u.scope.elementIds ?? []) {
        const c = laps.get(id) ?? { n: 0, clauses: new Set<string>(), pairs: [] };
        c.n++;
        for (const r of u.refs ?? []) c.clauses.add(r.clause);
        if (c.pairs.length < 3 && u.params?.bar !== undefined) c.pairs.push(u.params.barB !== undefined ? `${u.params.bar} / ${u.params.barB}` : String(u.params.bar));
        laps.set(id, c);
      }
      continue;
    }
    if (u.key === 'detailing.clash.unresolved' && u.params) {
      for (const id of u.scope.elementIds ?? []) {
        const c = clashes.get(id) ?? { n: 0, worst: 0, pairs: [] };
        c.n++;
        c.worst = Math.max(c.worst, Number(u.params.shortfall));
        if (c.pairs.length < 3) c.pairs.push(`${u.params.bar} / ${u.params.barB}`);
        clashes.set(id, c);
      }
      continue;
    }
    if (u.key === 'detailing.cover.violated' && u.params) {
      const row: CheckRow = {
        code: 'cirsoc-201', edition: '2025', clause: '20.5.1.3', title: tr('check.detailing.cover'), titleKey: 'check.detailing.cover',
        formula: 'e ≤ e,max',
        inputs: [{ symbol: 'e', value: Number(u.params.across), unit: 'm' }, { symbol: 'e,max', value: Number(u.params.maxAcross), unit: 'm' }],
        ratio: null, status: 'unsupported', location: String(u.params.bar),
      };
      for (const id of u.scope.elementIds ?? []) anchorageRows.set(id, [...(anchorageRows.get(id) ?? []), row]);
      continue;
    }
    if (u.key !== 'detailing.anchorage.unresolved' || !u.params) continue;
    const rule = String(u.params.rule);
    const clause = rule === 'ldh' ? '25.4.3.1' : rule === 'ld' ? '25.4.2.3' : rule === 'lap' ? '25.5.2.1' : '9.7.3.8.2';
    const row: CheckRow = {
      code: 'cirsoc-201', edition: '2025', clause, title: tr('check.detailing.anchorage'), titleKey: 'check.detailing.anchorage',
      formula: `ℓ ≥ ${rule}`,
      inputs: [{ symbol: 'ℓ', value: Number(u.params.available), unit: 'm' }, { symbol: rule, value: Number(u.params.required), unit: 'm' }],
      demand: Number(u.params.required), capacity: Number(u.params.available), unit: 'm',
      ratio: null, status: 'unsupported', location: `${u.params.bar} (${u.params.end})`,
    };
    for (const id of u.scope.elementIds ?? []) anchorageRows.set(id, [...(anchorageRows.get(id) ?? []), row]);
  }
  for (const [id, c] of laps) {
    anchorageRows.set(id, [...(anchorageRows.get(id) ?? []), {
      code: 'cirsoc-201', edition: '2025', clause: [...c.clauses].join(', ') || '25.5', title: tr('check.detailing.splice'), titleKey: 'check.detailing.splice',
      formula: '§25.5',
      inputs: [{ symbol: 'n', value: c.n }],
      ratio: null, status: 'unsupported', location: c.pairs.join('; ') + (c.n > c.pairs.length ? '; …' : ''),
    }]);
  }
  for (const [id, c] of clashes) {
    anchorageRows.set(id, [...(anchorageRows.get(id) ?? []), {
      code: 'cirsoc-201', edition: '2025', clause: '25.2', title: tr('check.detailing.clash'), titleKey: 'check.detailing.clash',
      formula: 's ≥ s,min',
      inputs: [{ symbol: 'n', value: c.n }, { symbol: 'Δs,max', value: c.worst, unit: 'mm' }],
      ratio: null, status: 'unsupported', location: c.pairs.join('; ') + (c.n > c.pairs.length ? '; …' : ''),
    }]);
  }
  /**
   * A member on a floor whose slab the model joins to a column at one node
   * (`analysis-validity.ts`): the split of the slab's load between beams and columns the rows
   * above were checked against is the mesh's, not established, so the member is not stated as
   * satisfying anything (the IFC and the workbook read this row too). The row is the model's own
   * idealisation, not a code check: it cites no clause and has no limit, only the share measured.
   */
  const jointRows = new Map<number, CheckRow[]>();
  const jointRow = (reasonKey: string, p: Record<string, number>): CheckRow => ({
    code: 'slab-column-joint', title: tr('check.slabColumnJoint'), titleKey: 'check.slabColumnJoint',
    formula: 'P,directo / P,losa',
    inputs: 'share' in p ? [{ symbol: 'P,directo / P,losa', value: p.share!, unit: '%' }] : [],
    ratio: null, status: 'unsupported', location: tr(reasonKey, p),
  });
  // The joints at the ends of such a beam: their shear is the beam's end forces.
  const jointAtNode = new Map<number, { reasonKey: string; params: Record<string, number> }>();
  for (const [id, c] of verificationStore.contexts) {
    const v = c.slabColumnJoint;
    if (v?.verdict !== 'pointJoint' || !v.reasonKey) continue;
    jointRows.set(id, [jointRow(v.reasonKey, v.params ?? {})]);
    const e = m.elements.get(id);
    if (c.elementType === 'beam' && e) for (const n of [c.span?.start ?? e.nodeI, c.span?.end ?? e.nodeJ]) if (!jointAtNode.has(n)) jointAtNode.set(n, { reasonKey: v.reasonKey, params: v.params ?? {} });
  }
  for (const [id, rows] of jointRows) anchorageRows.set(id, [...(anchorageRows.get(id) ?? []), ...rows]);
  for (const [id] of verificationStore.contexts) {
    const p = verificationStore.providedFor(id);
    if (!p || !p.hasProvided) continue;
    // §9.7.3.8.2: what the positive steel's ends were held to, and the reading of the role that set it.
    const lateral = p.elementType === 'beam' ? lateralAnchorageRow(p, verificationStore.contextFor(id)?.lateral, tr) : null;
    elements.push({ id: `e${id}`, family: p.elementType, name: elName(id, p.elementType), ...(levelOfElement(id) ? { level: levelOfElement(id)! } : {}), data: [...memberData(id), ...lateralDatum(id)], rows: [...concreteCheckRows(p), ...(lateral ? [lateral] : []), ...(anchorageRows.get(id) ?? [])], notes: [] });
  }
  /**
   * A member the design refused: no reinforcement passes, so it has none and no check row of its
   * own. Its entry says so, with what limited it, and the support it could not anchor at where
   * that was its anchorage (`end-support-anchorage.ts`): a member left with only its deflection
   * row read as satisfying in the summary, the IFC and the workbook.
   */
  for (const [id, c] of verificationStore.contexts) {
    if (c.elementType !== 'beam' && c.elementType !== 'column' && c.elementType !== 'wall') continue;
    const o = verificationStore.outcomeFor(id);
    if (!o || o.outcome === 'VERIFIED' || o.outcome === 'PROVISIONAL_BIAXIAL') continue;
    if (verificationStore.providedFor(id)?.hasProvided) continue;
    const short = (o.provisional?.verdict.supportAnchorage ?? []).filter((v) => v.solution === 'unresolved')
      .reduce<{ available: number; required: number; rule: string } | null>((w, v) => (!w || v.required - v.available > w.required - w.available ? v : w), null);
    /*
     * The two refusals state different things and the row says which: a section inadequate by a
     * bound of the code no reinforcement lifts (the bound, its clause and its numbers), or no
     * arrangement among the implemented ones verifying (what limited it, what was tried, what was
     * not). The member's reasons are the row's working either way.
     */
    const proof = o.outcome === 'SECTION_INADEQUATE' ? o.insufficiency : undefined;
    const titleKey = proof ? 'check.design.sectionInadequate'
      : o.outcome === 'SEARCH_EXHAUSTED' && o.exhaustion ? 'check.design.alternativesExhausted' : 'check.design.refused';
    const PROOF_FORMULA: Record<string, string> = {
      shearSectionLimit: 'Vu ≤ φ·(Vc,máx + 0,66·√f′c·bw·d)',
      axialCapacityAtMaxSteel: 'Pu ≤ φ·0,85·Po(ρ = 0,08)',
      minimumBarRowDoesNotFit: '2·db + s,mín ≤ b,int',
    };
    const row: CheckRow = {
      code: 'cirsoc-201', edition: '2025',
      clause: proof ? proof.clause : short ? (short.rule === 'ldh' ? '25.4.3.1' : short.rule === 'ld' ? '25.4.2.3' : '9.7.3.8.2') : '—',
      title: tr(titleKey), titleKey,
      formula: proof ? PROOF_FORMULA[proof.bound]! : short ? `ℓ ≥ ${short.rule}` : '—',
      inputs: proof ? [{ symbol: 'demand', value: proof.demand, unit: proof.unit }, { symbol: 'bound', value: proof.capacity, unit: proof.unit }]
        : short ? [{ symbol: 'ℓ', value: Math.round(short.available * 1000) / 1000, unit: 'm' }, { symbol: short.rule, value: Math.round(short.required * 1000) / 1000, unit: 'm' }] : [],
      ...(proof ? { demand: proof.demand, capacity: proof.capacity, unit: proof.unit }
        : short ? { demand: short.required, capacity: short.available, unit: 'm' } : {}),
      ratio: null, status: o.outcome === 'SEARCH_EXHAUSTED' || o.outcome === 'SECTION_INADEQUATE' ? 'fail' : 'notVerified',
      location: o.limiting.map((l) => { const k = `check.rc.${l}`; const t = tr(k); return t === k ? l : t; }).join(', '),
      derivation: o.reasons.map((r) => tr(r.key, r.params)),
    };
    elements.push({ id: `e${id}`, family: c.elementType, name: elName(id, c.elementType), ...(levelOfElement(id) ? { level: levelOfElement(id)! } : {}), data: [...memberData(id), ...lateralDatum(id)], rows: [row, ...(jointRows.get(id) ?? [])], notes: [] });
  }
  for (const v of verificationStore.steel) {
    const id = (v as { elementId: number }).elementId;
    elements.push({ id: `s${id}`, family: 'steel', name: elName(id, vertical(m.elements.get(id) ?? { nodeI: 0, nodeJ: 0 }) ? 'column' : 'beam'), ...(levelOfElement(id) ? { level: levelOfElement(id)! } : {}), data: memberData(id), rows: steelCheckRows(v), notes: [] });
  }
  const punchingBy = new Map<string, CheckRow[]>();
  for (const a of detailingStore.assemblies) for (const r of a.families ?? []) {
    if (r.family !== 'slab') continue;
    punchingBy.set(r.ownerId, r.punching.map((p) => ({
      code: 'cirsoc-201', edition: '2025', clause: p.refs?.find((x) => x.clause)?.clause ?? '22.6', title: `Punching, node ${p.nodeId}`, titleKey: 'check.slab.punching',
      formula: 'vu ≤ φ·vc', inputs: [{ symbol: 'Vu', value: Math.round(p.Vu * 10) / 10, unit: 'kN' }, { symbol: 'φVc', value: Math.round(p.phiVc * 10) / 10, unit: 'kN' }],
      demand: p.Vu, capacity: p.phiVc, unit: 'kN', ratio: p.status === 'UNSUPPORTED' ? null : p.utilization,
      status: p.status === 'UNSUPPORTED' ? 'unsupported' : p.status === 'FAIL' ? 'fail' : statusOfRatio(p.utilization),
      ...(p.governingCombination ? { combination: p.governingCombination } : {}), location: `${tr('memo.el.node')} ${p.nodeId}`,
    } satisfies CheckRow)));
  }
  /*
   * The floor rows kept with the project, while the model is still the one they were computed
   * from (`floor-readings.ts`). Not the session's last run: it outlived a reload's purpose (a
   * reopened project lost its slab rows) and a project switch (another project's slabs).
   */
  const kept = currentFloorReadings();
  const slabs = kept?.slabs ?? [];
  const walls = kept?.walls ?? [];
  for (const s of slabs) {
    elements.push({ id: `slab-${s.panelId}`, family: 'slab', name: `${tr('memo.kind.slab')} ${s.panelId}`, data: [[tr('memo.el.behaviour'), s.behaviour], [tr('memo.el.aspect'), n2(s.aspect)]], rows: [...s.rows, ...(punchingBy.get(s.panelId) ?? [])], notes: s.notes });
  }
  for (const w of walls) {
    elements.push({ id: `wall-${w.wallId}`, family: 'wall', name: `${tr('memo.kind.wall')} ${w.wallId}`, data: [[tr('memo.el.spacing'), `${(w.verticalSpacing * 100).toFixed(0)} / ${(w.horizontalSpacing * 100).toFixed(0)} cm`]], rows: w.rows, notes: w.notes });
  }
  // The footings kept with the project while the model and the footing inputs are still theirs (`floor-readings.ts`).
  for (const o of currentFootingReadings()?.outcomes ?? []) {
    const f = m.footings.get(o.footingId);
    elements.push({
      id: `f${o.footingId}`, family: 'footing', name: o.name,
      data: f ? [[tr('memo.el.size'), `${n2(f.B)} × ${n2(f.L)} × ${n2(f.thickness)} m`], [tr('memo.el.founding'), `${n2(f.foundingElevation)} m`]] : [],
      rows: o.rows, notes: o.notes.map((x) => teAt(x, locale)),
    });
  }
  const joints = jointChecks();
  const byNode = new Map<number, typeof joints>();
  for (const j of joints) byNode.set(j.nodeId, [...(byNode.get(j.nodeId) ?? []), j]);
  for (const [nodeId, js] of byNode) {
    const held = jointAtNode.get(nodeId);
    elements.push({ id: `j${nodeId}`, family: 'joint', name: `${tr('memo.el.node')} ${nodeId}`, data: [], rows: [...js.flatMap((j) => jointShearCheckRows(j)), ...(held ? [jointRow(held.reasonKey, held.params)] : [])], notes: [] });
  }
  for (const j of steelJoints()) {
    const d = jointDesignStore.designFor(j.nodeId, j.elementIds).typology;
    if (!d) continue;
    elements.push({
      id: `c${j.nodeId}`, family: 'connection', name: `${tr('memo.el.node')} ${j.nodeId} — ${tr(`joint.typ.kind.${d.kind}`)}`, data: [],
      rows: d.checks.map((c) => ({
        code: 'cirsoc-301', edition: '2018', clause: c.key, title: c.labelKey, titleKey: c.labelKey, formula: 'Ru ≤ φ·Rn',
        inputs: [{ symbol: 'Ru', value: Math.round(c.demand * 10) / 10, unit: c.unit }, { symbol: 'φRn', value: Math.round(c.capacity * 10) / 10, unit: c.unit }],
        demand: c.demand, capacity: c.capacity, unit: c.unit, ratio: c.ratio, status: statusOfRatio(c.ratio),
      } satisfies CheckRow)),
      notes: (d.assumptions ?? []).map((k) => tr(k)),
    });
  }
  // Ribbed, hollow-core and composite-deck panels; drop panels and capitals; the mat; the piles.
  for (const p of specialPanels()) elements.push({ id: `sp-${p.key}`, family: 'slab', name: `${p.name} (${tr(`physical.typ.${p.typology}`)})`, data: [[tr('memo.el.span'), `${n2(p.reading.span)} m (${p.reading.dir})`]], rows: p.rows, notes: [] });
  for (const h of headChecks()) elements.push({ id: `hd-${h.nodeId}`, family: 'slab', name: `${tr('memo.el.node')} ${h.nodeId} — ${tr('memo.el.head')}`, data: [], rows: h.rows, notes: [] });
  const mt = matChecks();
  if (mt) elements.push({ id: 'mat', family: 'footing', name: tr('memo.el.mat'), data: [[tr('memo.el.nodes'), String(mt.nodes)]], rows: mt.rows, notes: [] });
  for (const p of pileChecks()) elements.push({ id: `pl-${p.footingId}`, family: 'footing', name: `${tr('memo.el.piles')} ${p.footingId}`, data: [], rows: p.rows, notes: [] });
  // Particular elements: corbels, coupling beams, openings, masonry walls and infills, connections.
  for (const c of corbelChecks()) elements.push({ id: `cb-${c.entry.id}`, family: 'beam', name: `${tr('memo.el.corbel')} ${c.entry.name}`, data: c.vu !== null ? [['Vu', `${n2(c.vu)} kN`]] : [], rows: c.rows, notes: [] });
  for (const c of couplingChecks()) elements.push({ id: `cp-${c.elementId}`, family: 'beam', name: `${tr('memo.el.coupling')} ${c.elementId}`, data: [['ln/h', n2(c.h ? c.ln / c.h : 0)]], rows: c.rows, notes: [] });
  for (const c of openingChecks()) elements.push({ id: `op-${c.entry.id}`, family: 'beam', name: `${tr('memo.el.opening')} ${c.entry.elementId}`, data: [['x', `${n2(c.entry.x)} m`], ['lo × ho', `${n2(c.entry.lo)} × ${n2(c.entry.ho)} m`]], rows: c.rows, notes: [tr('sel.note.opening')] });
  for (const c of masonryWallChecks()) elements.push({ id: `ms-${c.key}`, family: 'masonry', name: c.name, data: [['L × H × t', `${n2(c.L)} × ${n2(c.H)} × ${n2(c.t)} m`]], rows: c.rows, notes: [] });
  for (const c of infillChecks()) elements.push({ id: `in-${c.entry.id}`, family: 'masonry', name: `${tr('memo.el.infill')} ${c.entry.name}`, data: c.strut ? [['a', `${n2(c.strut.width)} m`]] : [], rows: c.rows, notes: [tr('sel.note.infill')] });
  for (const c of hssJointChecks()) elements.push({ id: `hj-${c.entry.id}`, family: 'connection', name: `${tr('memo.el.node')} ${c.entry.nodeId} (${c.joint ?? '—'})`, data: [], rows: c.rows, notes: [] });
  for (const c of dowelChecks()) elements.push({ id: `dw-${c.entry.id}`, family: 'connection', name: c.entry.name, data: [['n', String(c.entry.n)]], rows: c.rows, notes: [] });
  // The foreign codes the project also designs to.
  const fx = [foreignCodes().concrete, foreignCodes().steel].filter((c): c is ForeignCodeId => !!c && c !== 'cirsoc');
  for (const code of fx) {
    const run = foreignRun(code);
    for (const mb of run.members) {
      elements.push({ id: `fx-${code}-${mb.elementId}`, family: mb.family === 'steel' ? 'steel' : mb.kind === 'column' ? 'column' : 'beam', name: `${elName(mb.elementId, mb.kind === 'column' ? 'column' : 'beam')} · ${FOREIGN_MATRIX[code].name}`,
        data: [...memberData(mb.elementId), ...mb.data, ...(mb.proposal ? [[tr('fx.ui.proposal', { p: mb.proposal }), ''] as [string, string]] : []),
          ...(mb.candidate ? [[tr('fx.ui.candidate', { p: mb.candidate.profile, list: mb.candidate.unevaluated.map((k) => tr(k)).join('; ') }), ''] as [string, string]] : [])],
        rows: mb.rows, notes: [] });
    }
    // What the code does not design is in the memoria too, not verified, with the reason.
    for (const sk of run.skipped) {
      const e = m.elements.get(sk.elementId);
      const kind = e && vertical(e) ? 'column' : 'beam', steel = familyOfFx(code) === 'steel';
      elements.push({ id: `fx-${code}-${sk.elementId}`, family: steel ? 'steel' : kind, name: `${elName(sk.elementId, kind)} · ${FOREIGN_MATRIX[code].name}`, data: memberData(sk.elementId),
        rows: [{ code: FX_CODE[code], edition: FOREIGN_MATRIX[code].edition, title: tr(sk.reasonKey), titleKey: sk.reasonKey, inputs: [], ratio: null, status: 'notVerified' }], notes: [tr('fx.memo.notVerified')] });
    }
  }
  // Fire resistance, for the rating the project states.
  for (const c of fireChecks()) elements.push({ id: `fi-${c.id}`, family: 'fire', name: c.name, data: c.data, rows: c.rows, notes: [tr(`fire.note.${c.family}`)] });
  // Post-tensioned panels and stairs.
  for (const p of ptPanels()) {
    const data: Array<[string, string]> = [[tr('memo.el.span'), `${n2(p.readings.x?.span ?? 0)} × ${n2(p.readings.y?.span ?? 0)} m`], [tr('memo.el.thickness'), `${n2(p.h)} m`]];
    for (const d of ['x', 'y'] as const) { const b = p.balance[d]; if (b) data.push([`wb ${d}`, `${n2(b.wb)} kN/m² (${Math.round((100 * b.wb) / b.wDead)} % wD)`]); }
    elements.push({ id: `pt-${p.key}`, family: 'slab', name: `${p.name} (${tr('physical.typ.postTensioned')})`, data, rows: p.rows, notes: [tr('pt.note')] });
  }
  for (const s of stairChecks()) elements.push({ id: `st-${s.entry.id}`, family: 'slab', name: `${tr('memo.el.stair')} ${s.entry.name}`,
    data: [[tr('memo.el.span'), `${n2(s.design.geometry.span)} m`], [tr('memo.el.thickness'), `${n2(s.entry.waist)} m`], ['wu', `${n2(s.design.loads.wuFlight)} / ${n2(s.design.loads.wuLanding)} kN/m²`]],
    rows: s.rows, notes: [tr(s.entry.ends === 'simple' ? 'stair.note.simple' : 'stair.note.monolithic')] });

  // Timber, aluminium, cold-formed and composite members, from their own checkers.
  for (const r of materialCheckState.results.values()) {
    const kind = vertical(m.elements.get(r.elementId) ?? { nodeI: 0, nodeJ: 0 }) ? 'column' : 'beam';
    elements.push({ id: `m${r.elementId}`, family: r.family, name: elName(r.elementId, kind), ...(levelOfElement(r.elementId) ? { level: levelOfElement(r.elementId)! } : {}), data: memberData(r.elementId), rows: r.rows, notes: [] });
  }
  const seis = seismicState.report;
  for (const sm of seis?.members ?? []) {
    const rows = seismicMemberCheckRows(sm);
    if (rows.length) elements.push({ id: `q${sm.id}`, family: 'seismic', name: elName(sm.id, sm.kind), data: [[tr('memo.el.role'), sm.assumed ? tr('lateral.seismicAssumed', { role: sm.role }) : sm.role]], rows, notes: [tr('seisDes.substitute'), ...sm.issues.map((k) => tr(k))] });
  }
  for (const sj of seis?.joints ?? []) elements.push({ id: `qj${sj.nodeId}${sj.direction}`, family: 'seismic', name: `${tr('memo.el.node')} ${sj.nodeId} (${sj.direction})`, data: [], rows: seismicJointCheckRows(sj), notes: [tr('seisDes.substitute')] });

  // Deflection, on the member's own entry or on one of its own.
  for (const [id, row] of deflectionCheckRows()) {
    const el = elements.find((x) => x.id === `e${id}` || x.id === `s${id}`);
    if (el) el.rows.push(row);
    else {
      const e = m.elements.get(id);
      const steel = e ? isSteel(e.materialId) : false, kind = e && vertical(e) ? 'column' : 'beam';
      elements.push({ id: `${steel ? 's' : 'e'}${id}`, family: steel ? 'steel' : kind, name: elName(id, kind), ...(levelOfElement(id) ? { level: levelOfElement(id)! } : {}), data: memberData(id), rows: [row], notes: [] });
    }
  }

  /*
   * The member's verdict (`member-verdict.ts`): what holds each design member short of conformity
   * beyond its rows (its seismic checks run only as a substitute, a refusal its rows do not carry,
   * …), stated on its entry so the summary, the workbook and the IFC never print «Cumple» for it.
   * Another code's entry reads the same forces: an unvalidated analysis holds it too.
   */
  for (const el of elements) {
    const own = /^e(\d+)$/.exec(el.id), fx = /^fx-.+-(\d+)$/.exec(el.id);
    const id = Number((own ?? fx)?.[1]);
    if (!Number.isFinite(id) || !verificationStore.contextFor(id)) continue;
    const holds = verificationStore.memberVerdict(id).holds.filter((h) => own || h.kind === 'analysis');
    if (holds.length) el.heldBy = holds.map((h) => holdText(h, tr));
  }

  // ── Hypotheses
  const stiffBy = new Map<string, { label: string; a: number; iy: number; iz: number; j: number; count: number }>();
  for (const e of frames) {
    const s = (e as { stiffness?: { a?: number; iy?: number; iz?: number; j?: number; preset?: string } }).stiffness;
    const v = { a: s?.a ?? 1, iy: s?.iy ?? 1, iz: s?.iz ?? 1, j: s?.j ?? 1 };
    const kind = vertical(e) ? 'column' : 'beam';
    const label = `${tr(`memo.kind.${kind}`)}${s?.preset ? ` — ${s.preset}` : ''}`;
    const key = `${label}|${v.a}|${v.iy}|${v.iz}|${v.j}`;
    const g = stiffBy.get(key) ?? { label, ...v, count: 0 };
    g.count++; stiffBy.set(key, g);
  }
  const diaphragms = (modelStore.constraints ?? []).flatMap((c) => {
    const d = c as { type?: string; masterNode?: number; slaveNodes?: number[] };
    return d.type === 'diaphragm' ? [{ level: lv.name(zOf(d.masterNode ?? -1)), nodes: (d.slaveNodes?.length ?? 0) + 1 }] : [];
  });
  const shellBy = new Map<string, { kind: string; count: number; thickness: number }>();
  for (const q of [...m.quads.values(), ...m.plates.values()]) {
    const zs = q.nodes.map((n) => zOf(n));
    const kind = Math.max(...zs) - Math.min(...zs) < TOL ? tr('memo.kind.slab') : tr('memo.kind.wall');
    const key = `${kind}|${q.thickness}`;
    const g = shellBy.get(key) ?? { kind, count: 0, thickness: q.thickness };
    g.count++; shellBy.set(key, g);
  }
  const supBy = new Map<string, number>();
  for (const s of m.supports.values()) supBy.set(s.type, (supBy.get(s.type) ?? 0) + 1);
  const analysis = [tr('memo.hyp.linear')];
  if (resultsStore.modalResult3D) analysis.push(tr('memo.hyp.modal'));
  if (diaphragms.length) analysis.push(tr('memo.hyp.rigidFloors'));
  if (anyConcrete) analysis.push(tr('memo.hyp.crackedInertia'));

  // ── Actions
  const loadCount = new Map<number, number>();
  for (const l of m.loads) { const c = (l.data as { caseId?: number }).caseId; if (c !== undefined) loadCount.set(c, (loadCount.get(c) ?? 0) + 1); }
  const caseName = new Map(m.loadCases.map((c) => [c.id, c.name]));
  const fmt2 = (v: number) => (Math.round(v * 100) / 100).toString();

  // ── Global analysis
  const modal = resultsStore.modalResult3D;
  let cx = 0, cy = 0;
  const modalRows = modal?.modes.map((md, i) => {
    const mx = (md as { massRatioX?: number }).massRatioX ?? 0, my = (md as { massRatioY?: number }).massRatioY ?? 0;
    cx += mx; cy += my;
    return { mode: i + 1, period: md.period, mx, my, cumX: cx, cumY: cy };
  });
  const storeys = modelStoreyStiffness();
  const drifts = reportStoryDrifts();

  // ── Notices
  const named = (ids: Iterable<number>) => [...ids].map((id) => elName(id, vertical(m.elements.get(id) ?? { nodeI: 0, nodeJ: 0 }) ? 'column' : 'beam'));
  const auto = [...designRunStore.autoDesigned];
  const manual = [...designRunStore.manualOverrides];
  const provisional = [...designRunStore.provisionalIds];

  // ── Quantities, measured once for the memoria and the budget (`store/takeoff.ts`).
  const { items, steelMembers, marks, parts } = measure();
  const q = quantitiesBy(items, [...lv.order, '—']);
  const rebar = reinforcementTakeoff(marks);
  const st = steelTakeoff({ members: steelMembers });
  const plates = parts.filter((p) => p.kind === 'plate' || p.kind === 'stiffener');
  const connections = [
    { item: tr('memo.qty.plates'), count: plates.length, mass: plates.reduce((s, p) => s + p.size[0] * p.size[1] * p.size[2] * 7850, 0) },
    { item: tr('memo.qty.bolts'), count: parts.filter((p) => p.kind === 'bolt').length, mass: 0 },
    { item: tr('memo.qty.anchors'), count: parts.filter((p) => p.kind === 'anchor').length, mass: 0 },
  ].filter((r) => r.count > 0);

  const rev = currentRevision(info);
  return {
    project: {
      name: tb?.project || info?.job || tr('detailing.doc.project'), ...(info?.client ? { client: info.client } : {}), ...(info?.site ? { site: info.site } : {}),
      ...(info?.jobNumber ? { jobNumber: info.jobNumber } : {}), ...(info?.designer ? { designer: info.designer.name } : {}), ...(info?.checker ? { checker: info.checker.name } : {}),
      date: new Date().toISOString().slice(0, 10), ...(rev ? { revision: rev.code } : {}),
    },
    // The label already names the edition; one entry per code, whatever roles it fills.
    codes: [...new Set(regulationsStore.stamps.map((s) => teAt(s.label, locale)))],
    scope: [
      ...(anyConcrete ? scopeOf(CIRSOC201_CAPABILITIES_2025, 'cirsoc-201', tr) : []), ...(anySteel ? scopeOf(CIRSOC301_CAPABILITIES, 'cirsoc-301', tr) : []),
      ...[...new Set([...materialCheckState.results.values()].map((r) => r.family))].map((f) => ({ code: OTHER_CODE[f], feature: `mat.scope.${f}`, offered: false, clauses: OTHER_CLAUSES[f], limitation: tr(`mat.scope.${f}.limit`) })),
      ...fx.flatMap((code) => FOREIGN_MATRIX[code].rows.map((r) => ({ code: FX_CODE[code], feature: r.feature, offered: offeredStatus(r.status), clauses: r.clauses.split('; '),
        ...(r.note || !offeredStatus(r.status) ? { limitation: [offeredStatus(r.status) ? '' : tr(`fx.status.${r.status}`), r.note ? tr(r.note) : ''].filter(Boolean).join(': ') } : {}) }))),
    ],
    hypotheses: { analysis, stiffness: [...stiffBy.values()], diaphragms, shells: [...shellBy.values()], supports: [...supBy.entries()].map(([kind, count]) => ({ kind: tr(`pro.${kind}`) === `pro.${kind}` ? kind : tr(`pro.${kind}`), count })) },
    actions: {
      cases: m.loadCases.map((c) => ({ name: c.name, type: c.type ?? '', loads: loadCount.get(c.id) ?? 0 })),
      combinations: m.combinations.map((c) => ({ name: c.name, expression: c.factors.map((f) => `${fmt2(f.factor)}·${caseName.get(f.caseId) ?? f.caseId}`).join(c.method === 'srss' ? ' ⊕ ' : ' + ') })),
      ...(designData().loadBasis ? { basis: designData().loadBasis! } : {}),
    },
    global: {
      ...(modalRows?.length ? { modal: modalRows } : {}),
      ...(storeys.length ? { storeyShear: storeys.map((s) => ({ level: s.levelName ?? lv.name(s.level), vx: s.shearX, vy: s.shearY, kx: s.kX, ky: s.kY, soft: s.soft })) } : {}),
      ...(drifts.drifts && drifts.basis ? { drift: { limit: drifts.basis.limit, cd: drifts.basis.cd, rows: drifts.drifts.map((d) => ({ level: lv.name(d.level), ratioX: d.ratioX, ratioY: d.ratioY, status: d.status })) } } : {}),
    },
    elements,
    verdict: (() => { const v = projectVerdict(); const l = projectVerdictLines(v, tr); return { state: v.state, text: l.state, reasons: l.reasons }; })(),
    notices: {
      automatic: [
        ...(auto.length ? [tr('memo.not.autoDesigned', { n: auto.length, list: named(auto).slice(0, 12).join(', ') })] : []),
        ...(provisional.length ? [tr('memo.not.provisional', { n: provisional.length, list: named(provisional).slice(0, 12).join(', ') })] : []),
      ],
      manual: manual.length ? [tr('memo.not.manualList', { n: manual.length, list: named(manual).join(', ') })] : [],
    },
    quantities: {
      byLevel: q.byLevel,
      byType: q.byType.filter((r) => r.kind !== 'rebar').map(({ kind, concrete, formwork, steel, count }) => ({ kind, concrete, formwork, steel, count })),
      rebar: (rebar?.byDiameter ?? []).map((r) => ({ diameter: r.diameterMm, length: r.lengthM, mass: r.massKg })),
      steel: st.rows.map((r) => ({ profile: r.profile, count: r.members, length: r.length, mass: r.kg })),
      connections,
    },
  };
}
