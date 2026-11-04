/**
 * The slab-column joint indicator of a design run (`engine/design/analysis-validity.ts`), read by
 * everything that states a member or a document as verified: the desk, the memoria, the workbook,
 * the IFC, the certificates, the assemblies' constructibility, the document's readiness and open
 * issues, and the banner every sheet prints.
 *
 * It is a model-adequacy indicator. Where a slab on beams is joined to a column at one shell node
 * the split of its load between beams and columns is the mesh's: the share that reaches the
 * columns straight vanishes as the mesh is refined, while a column of finite section takes a share
 * set by the stiffness of beams and slab (`slab-column-footprint-reference.test.ts`). So the
 * members of such a floor are not presented as verified, whatever the mesh, and every surface
 * says so with the share measured at the mesh used. Where every column's section is tied to the
 * slab the joint is the reference's and nothing is held for it. A flat plate (no beams) and a
 * model without slabs are not applicable.
 *
 * On the span building on 40 × 40 columns the shares are 100 / 102,3 / 58,3 / 14,9 % at 6 / 2 /
 * 1 / 0,5 m (worst combination, 1,4D at 2 m and below) and 0,9 % at 0,125 m (`SPAN_FINE=1`): all
 * point joints. The previous criterion held them to the slab within t/2 of the column faces (1 %)
 * and let 0,125 m through as validated; the reference takes about 40 % straight with the
 * building's own beams, so passing a mesh for sending less than 1 % straight was no evidence of
 * the load path.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore } from '..';
import { verificationStore } from '../verification.svelte';
import { designRunStore } from '../design-run.svelte';
import { detailingStore } from '../detailing.svelte';
import { deskMembers } from '../design-desk';
import { memoriaInput } from '../memoria-inputs';
import { designSheets } from '../design-exchange';
import { projectIfcInput } from '../ifc-export';
import { currentSlabColumnJoint, currentFloorPaths } from '../analysis-validity-store';
import { documentReadiness, type DocumentModel } from '../../engine/detailing/document-model';
import { readinessBanner } from '../../engine/detailing/document-render';
import { slabColumnJoints, floorPaths, type JointMember } from '../../engine/design/analysis-validity';
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

const PRINT = !!process.env.SPAN_TRACE_PRINT;
const tr = (k: string, p?: Record<string, string | number>) => (p ? `${k}${JSON.stringify(p)}` : k);

describe('the indicator: how the slab is joined to the columns, and the share the mesh sends straight into them', () => {
  // One 6 × 5 bay at z = 3 on four 40 × 40 corner columns, a 0,15 m slab in one quad; node 9 is
  // a slab node inside column 1's section, at (0,2; 0,2).
  const nodes = new Map<number, { x: number; y: number; z: number }>([
    [1, { x: 0, y: 0, z: 3 }], [2, { x: 6, y: 0, z: 3 }], [3, { x: 6, y: 5, z: 3 }], [4, { x: 0, y: 5, z: 3 }],
    [5, { x: 0, y: 0, z: 0 }], [6, { x: 6, y: 0, z: 0 }], [7, { x: 6, y: 5, z: 0 }], [8, { x: 0, y: 5, z: 0 }],
  ]);
  const quads = new Map([[1, { nodes: [1, 2, 3, 4], thickness: 0.15 }]]);
  /** Stations of one combination: N at the column's two ends, V along a beam with its jumps. */
  const st = (rows: Array<Partial<{ t: number; n: number; vz: number }>>) => ({
    elementId: 0, length: 1, stationTs: [], comboResults: [{ comboId: 1, comboName: 'c', stations: rows.map((r) => ({ t: 0, x: 0, n: 0, vy: 0, vz: 0, my: 0, mz: 0, torsion: 0, ...r })) }],
  });
  /** Four columns each taking `n` kN at the floor; one beam taking `beam` kN with `jump` of it at a shared node. */
  const columns = (n: number): JointMember[] => [1, 2, 3, 4].map((top, k) => ({ elementId: 10 + k, type: 'column' as const, start: top + 4, end: top, halfX: 0.2, halfY: 0.2, stations: st([{ t: 0, n: -n }, { t: 1, n: -n }]) }));
  const members = (n: number, beam: number, jump: number): JointMember[] => [
    ...columns(n),
    { elementId: 20, type: 'beam' as const, start: 1, end: 2, shear: 'vz' as const, stations: st([{ t: 0, vz: beam / 2 }, { t: 0.5, vz: jump / 2 }, { t: 0.5, vz: -jump / 2 }, { t: 1, vz: -beam / 2 }]) },
  ];

  it('direct = what the columns take less the beams\' whole load; the slab\'s load = direct + its jumps on the beams', () => {
    // 40 into the columns; the beam brings 30 of it, 24 of which the slab put on it.
    const [f] = floorPaths({ nodes, quads }, members(10, 30, 24));
    expect([f!.direct, f!.slab, f!.slabArea]).toEqual([10, 34, 30]);
    expect(f!.share).toBeCloseTo(10 / 34, 12);
    expect([f!.beams, f!.sectionsRepresented]).toEqual([true, false]);
  });

  it('a slab on beams joined to the columns at one node is a point joint, whatever the share: no bound, no clause', () => {
    const v = slabColumnJoints({ nodes, quads }, members(10, 30, 24));
    expect(v.get(20)).toEqual({ verdict: 'pointJoint', reasonKey: 'slabColumnJoint.point', params: { share: 29.4, level: 3 } });
    expect(v.get(10)!.verdict).toBe('pointJoint');
    // Everything through the beam (a share of 0): still a point joint. The previous criterion
    // passed this as validated.
    const none = slabColumnJoints({ nodes, quads }, members(7.5, 30, 30));
    expect([none.get(20)!.verdict, none.get(10)!.params?.share]).toEqual(['pointJoint', 0]);
  });

  it('every column\'s section tied to the slab as a rigid body: represented; one column left at its node: a point joint', () => {
    const tied = new Map(nodes);
    // One slab node inside each column's section (the quad's own corners stay the column nodes).
    const inner = [[1, 0.2, 0.2], [2, 5.8, 0.2], [3, 5.8, 4.8], [4, 0.2, 4.8]] as const;
    for (const [c, x, y] of inner) tied.set(100 + c, { x, y, z: 3 });
    const ties = new Map(inner.map(([c]) => [100 + c, c]));
    const q = new Map([[1, { nodes: [1, 101, 2, 102, 3, 103, 4, 104], thickness: 0.15 }]]);
    expect(slabColumnJoints({ nodes: tied, quads: q, rigidTies: ties }, members(10, 30, 24)).get(20)).toEqual({ verdict: 'sectionRepresented' });
    ties.delete(103);
    expect(slabColumnJoints({ nodes: tied, quads: q, rigidTies: ties }, members(10, 30, 24)).get(20)!.verdict).toBe('pointJoint');
  });

  it('a flat plate (no beams), a floor with a shell node on a support, a model without shells: not applicable', () => {
    // The columns take every kN of a flat plate, by statics: there is no split to establish.
    expect([...slabColumnJoints({ nodes, quads }, columns(10)).values()].map((x) => x.verdict)).toEqual(Array(4).fill('notApplicable'));
    expect([...slabColumnJoints({ nodes, quads, supportNodes: new Set([3]) }, members(10, 30, 24)).values()].map((x) => x.verdict)).toEqual(Array(5).fill('notApplicable'));
    expect([...slabColumnJoints({ nodes, quads: new Map() }, members(10, 30, 24)).values()].map((x) => x.verdict)).toEqual(Array(5).fill('notApplicable'));
  });
});

/** What every reader says of the run in the stores. */
interface Readings {
  verdict: string;
  /** Design members on a floor with a point joint (a span's pieces are one). */
  pointJoints: number;
  readiness: string;
  /** The readiness the same document reads with the joint verdict left out: what it read before it existed. */
  readinessWithout: string;
  banner: string;
  summaryKey: string;
  openIssues: number;
  certificates: number;
  desk: { ok: number; d124: number };
  memoria: number;
  workbookOk: number;
  ifc: { joint: number; satisfies: number };
  /** Assemblies whose state reaches CONSTRUCTIBLE. */
  constructible: number;
  /** The floors' shares, %. */
  floors: string;
}

function read(doc: DocumentModel): Readings {
  const v = currentSlabColumnJoint();
  const flagged = new Set(v.pointJoints.map((m) => m.elementId));
  const desk = deskMembers().filter((m) => verificationStore.contextFor(m.id));
  const mem = memoriaInput(tr, 'es');
  const [elements] = designSheets(tr, 'es');
  const ifc = projectIfcInput(tr, 'es', 'p').members;
  const unflagged = doc.certificates.map((c) => ({ ...c, loadSplit: undefined }));
  return {
    verdict: v.verdict,
    pointJoints: flagged.size,
    readiness: doc.readiness,
    readinessWithout: documentReadiness({ assemblies: doc.assemblies, certificates: unflagged }),
    banner: readinessBanner(doc, 'es'),
    summaryKey: doc.summary.key,
    openIssues: (doc.openIssues ?? []).filter((i) => i.key.startsWith('slabColumnJoint.')).length,
    certificates: doc.certificates.filter((c) => c.loadSplit === 'notEstablished').length,
    desk: { ok: desk.filter((m) => m.status === 'ok').length, d124: desk.filter((m) => m.codes.includes('D124')).length },
    memoria: mem.elements.filter((e) => e.rows.some((r) => r.titleKey === 'check.slabColumnJoint' && r.status === 'unsupported')).length,
    workbookOk: elements!.rows.slice(1).filter((r) => r[6] === 'memo.state.ok').length,
    ifc: { joint: ifc.filter((m) => String(m.props?.SlabColumnJoint ?? '').startsWith('one node')).length, satisfies: ifc.filter((m) => m.props?.DesignState === 'satisfies').length },
    constructible: doc.assemblies.filter((a) => a.state === 'CONSTRUCTIBLE').length,
    floors: [...new Set(v.pointJoints.map((m) => `${m.params?.level}:${m.params?.share}`))].sort().join(' '),
  };
}

describe('the span building on 40 × 40 columns: a point joint on every mesh, and every reader says which claim is withheld', () => {
  const MESHES = [6, 2, 1, 0.5] as const;
  const r = new Map<number, Readings>();
  const paths = new Map<number, ReturnType<typeof currentFloorPaths>>();
  let before: Readings | null = null;
  beforeAll(() => {
    for (const m of MESHES) {
      building(m, { columnSide: 0.4 });
      r.set(m, read(designAndDocument()));
      paths.set(m, currentFloorPaths());
      if (m !== 6) continue;
      // The same run with the verdict left out of the contexts, detailed and documented again:
      // what every reader said before the indicator existed.
      for (const c of verificationStore.contexts.values()) delete (c as { slabColumnJoint?: unknown }).slabColumnJoint;
      detailingStore.generate({});
      before = read(detailingStore.buildDocument({ author: 'test', at: '2026-10-11T00:00:00Z' })!);
    }
    if (PRINT) { for (const [m, x] of r) console.log(`MESH ${m}: ${JSON.stringify(x)}`); console.log(`BEFORE 6: ${JSON.stringify(before)}`); }
  }, 300_000);

  it('every beam and column on a point joint: the floors send 100 to 15 % of their slab straight into the columns, a share of the mesh', () => {
    // level: share, % of the floor's slab load, worst combination.
    expect(MESHES.map((m) => [m, r.get(m)!.floors])).toEqual([
      [6, '3:100 6:100'], [2, '3:102.3 6:102.3'], [1, '3:58.3 6:58.1'], [0.5, '3:14.9 6:14.7'],
    ]);
    for (const m of MESHES) {
      const x = r.get(m)!;
      expect(x.verdict, `mesh ${m}`).toBe('pointJoint');
      // 14 spans and 12 columns.
      expect(x.pointJoints, `mesh ${m}`).toBe(26);
      // The memoria and the certificates list a span's pieces; the desk (`member-names.ts`) and the
      // IFC one member per span, 26; the memoria's 12 joints read the beams' end forces and are
      // held too.
      const pieces = x.certificates;
      expect(x.desk, `mesh ${m}: desk`).toEqual({ ok: 0, d124: 26 });
      expect(x.memoria, `mesh ${m}: memoria`).toBe(pieces + 12);
      expect(x.workbookOk, `mesh ${m}: workbook`).toBe(0);
      expect(x.ifc, `mesh ${m}: IFC`).toEqual({ joint: 26, satisfies: 0 });
      expect(x.openIssues, `mesh ${m}: open issues`).toBe(26);
      expect(x.constructible, `mesh ${m}: assemblies`).toBe(0);
    }
    expect(MESHES.map((m) => r.get(m)!.certificates)).toEqual([26, 54, 90, 168]);
  });

  it('(a) the share is measured on the load the slab carries: direct + jumps is the slab\'s applied load in its combination', () => {
    // Equilibrium checks the reading, and only the reading: 60 m² of (1,5 + 3,75) kPa dead and 2 kPa live, factored.
    for (const m of MESHES) for (const f of paths.get(m)!) {
      const combo = modelStore.model.combinations.find((c) => c.name === f.combo)!;
      const k = (id: number) => combo.factors.find((x) => x.caseId === id)?.factor ?? 0;
      expect(Math.abs(f.slab - 60 * (k(1) * 5.25 + k(2) * 2)), `mesh ${m}, z ${f.z}, ${f.combo}`).toBeLessThan(1e-6);
    }
  });

  it('every document is a draft that names the joint and the claim it withholds on every sheet, whatever its steel', () => {
    for (const m of MESHES) {
      const x = r.get(m)!;
      expect(x.readiness, `mesh ${m}`).toBe('REVIEW_DRAFT');
      expect(x.summaryKey).toBe('detailing.document.slabColumnPointJoint');
      expect(x.banner).toMatch(/^BORRADOR DE REVISIÓN — UNIÓN LOSA-COLUMNA EN UN SOLO NUDO EN 26 MIEMBRO\(S\): REPARTO DE LA CARGA DE LA LOSA ENTRE VIGAS Y COLUMNAS NO ESTABLECIDO \(CON ESTA MALLA VA DIRECTO A LAS COLUMNAS EL [\d,]+ %\) — /);
      expect(x.banner).toMatch(/NO APTO PARA CONSTRUCCIÓN/);
      expect(x.banner).not.toMatch(/VALIDAD|PUEDEN TOMAR/);
    }
  });

  it('6 m with the verdict left out reads as it did: an assembly CONSTRUCTIBLE, members ok in the desk, the IFC and the workbook', () => {
    expect(before!.verdict).toBe('notApplicable');
    expect(before!.constructible).toBeGreaterThan(0);
    expect(before!.desk.ok).toBeGreaterThan(0);
    expect(before!.ifc.satisfies).toBeGreaterThan(0);
    expect(before!.workbookOk).toBeGreaterThan(0);
    expect([before!.desk.d124, before!.memoria, before!.ifc.joint, before!.certificates, before!.openIssues]).toEqual([0, 0, 0, 0, 0]);
    // And with it: none.
    const x = r.get(6)!;
    expect([x.constructible, x.desk.ok, x.ifc.satisfies, x.workbookOk]).toEqual([0, 0, 0, 0]);
  });

  it.runIf(!!process.env.SPAN_FINE)('0,125 m: under 1 % straight into the columns, and still a point joint (the previous criterion validated it)', () => {
    building(0.125, { columnSide: 0.4 });
    expect(designRunStore.computeDemands().ok).toBe(true);
    const v = currentSlabColumnJoint();
    if (PRINT) console.log('FINE', JSON.stringify(currentFloorPaths()));
    expect(v.verdict).toBe('pointJoint');
    for (const m of v.pointJoints) expect(m.params!.share).toBeLessThan(1);
  }, 600_000);
});

describe('the span building with each column\'s section tied to the slab (0,2 m): represented, nothing held for the joint', () => {
  it('no point joint, no notice, no memoria row, no IFC property, no open issue; the document is not held by it', () => {
    building(0.2, { columnSide: 0.4, footprint: true });
    const doc = designAndDocument();
    const x = read(doc);
    if (PRINT) console.log(`TIED: ${JSON.stringify(x)}`);
    expect(x.verdict).toBe('sectionRepresented');
    expect([x.pointJoints, x.desk.d124, x.memoria, x.ifc.joint, x.certificates, x.openIssues]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(x.summaryKey).not.toBe('detailing.document.slabColumnPointJoint');
    expect(x.readiness).toBe(x.readinessWithout);
  }, 300_000);
});

describe('qa-8: no slab, the indicator does not apply and nothing changes', () => {
  it('not applicable on every member, and the document reads what it read', () => {
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
    const doc = designAndDocument();
    const x = read(doc);
    if (PRINT) console.log(`QA-8: ${JSON.stringify(x)}`);
    expect([...verificationStore.contexts.values()].map((c) => c.slabColumnJoint?.verdict)).toEqual(Array(8).fill('notApplicable'));
    expect(x.verdict).toBe('notApplicable');
    expect([x.pointJoints, x.desk.d124, x.memoria, x.ifc.joint, x.certificates, x.openIssues]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(x.readiness).toBe(x.readinessWithout);
    expect(doc.slabColumnJoint?.verdict).toBe('notApplicable');
  });
});
