/**
 * What every surface says of the span building at 1 m (40 × 40 columns), word for word, in
 * Spanish: the sheets' banner, the document's summary, the memoria row, the IFC property, the
 * desk's banner and notice code and the workbook's state. Before (7bbab5dcb, measured with this
 * same file on that tree) the slab-column joint was read as a validation of the analysis against
 * a bound argued from CIRSOC 201 §22.6.4.1:
 *
 *   banner   BORRADOR DE REVISIÓN — ANÁLISIS NO VALIDADO EN 26 MIEMBRO(S): LA LOSA LLEVA EL 58,3 %
 *            DE SU CARGA DIRECTO A LAS COLUMNAS, QUE PUEDEN TOMAR 1 % — 0 CONFLICTO(S) SIN RESOLVER
 *            — NO APTO PARA CONSTRUCCIÓN — …
 *   summary  Borrador de revisión rev. 1: análisis no validado en 26 miembro(s), la losa lleva
 *            directo a las columnas más carga de la que pueden tomar. No apto para construcción
 *   memoria  «Validez del análisis: camino de la carga de la losa», P,col / P,losa ≤ A(t/2) / A,losa
 *   IFC      AnalysisState: «not validated: …»
 *   desk     «Análisis no validado en 26 miembro(s): …», notice D123
 *
 * After, it is stated as what it is: the model's idealisation of the joint, with the share the
 * mesh sent straight into the columns, the reference it was checked against and the claim it
 * withholds (the split between beams and columns), no clause and no bound. The states do not
 * change: the document is a review draft and nothing is CONSTRUCTIBLE, as before.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { verificationStore } from '../verification.svelte';
import * as desk from '../design-desk';
import { memoriaInput } from '../memoria-inputs';
import { designSheets } from '../design-exchange';
import { projectIfcInput } from '../ifc-export';
import { readinessBanner } from '../../engine/detailing/document-render';
import * as wasmSolver from '../../engine/wasm-solver';
import es from '../../i18n/locales/es';
import { building, designAndDocument } from './span-fixture';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const PRINT = !!process.env.SPAN_TRACE_PRINT;
const ES = es as Record<string, string>;
const tr = (k: string, p?: Record<string, string | number>) => (ES[k] ?? k).replace(/\{(\w+)\}/g, (_, n: string) => String(p?.[n] ?? `{${n}}`));
const JOINT_ROWS = new Set(['analysis-mesh', 'slab-column-joint']);

interface Said { banner: string; summary: string; row: unknown; ifc: unknown; deskBanner: string; deskCodes: string[]; workbook: string[]; readiness: string; constructible: number }

describe('the span building at 1 m, word for word', () => {
  let said: Said;
  beforeAll(() => {
    building(1, { columnSide: 0.4 });
    const doc = designAndDocument();
    const mem = memoriaInput(tr, 'es');
    const beam = mem.elements.find((e) => e.family === 'beam' && e.rows.some((r) => JOINT_ROWS.has(r.code)))!;
    const row = beam.rows.find((r) => JOINT_ROWS.has(r.code))!;
    const ifc = projectIfcInput(tr, 'es', 'p').members.find((m) => m.props?.AnalysisState !== undefined || m.props?.SlabColumnJoint !== undefined)!;
    const d = desk as unknown as Record<string, () => { pointJoints?: unknown[]; notValidated?: unknown[] }>;
    const model = (d.deskSlabColumnJoint ?? d.deskAnalysisValidity)!();
    const n = (model.pointJoints ?? model.notValidated)!.length;
    const deskKey = ES['slabColumnJoint.desk'] ? 'slabColumnJoint.desk' : 'analysis.validity.notValidated';
    const members = desk.deskMembers().filter((m) => verificationStore.contextFor(m.id));
    const [elements] = designSheets(tr, 'es');
    said = {
      banner: readinessBanner(doc, 'es'),
      summary: tr(doc.summary.key, doc.summary.params as Record<string, number>),
      row: { title: row.title, formula: row.formula, inputs: row.inputs, status: row.status, code: row.code, location: row.location },
      ifc: Object.fromEntries(Object.entries(ifc.props ?? {}).filter(([k]) => k === 'AnalysisState' || k === 'SlabColumnJoint' || k === 'DesignState')),
      deskBanner: tr(deskKey, { n }),
      deskCodes: [...new Set(members.flatMap((m) => m.codes))].filter((c) => c === 'D123' || c === 'D124'),
      workbook: [...new Set(elements!.rows.slice(1).map((r) => String(r[6])))].sort(),
      readiness: doc.readiness,
      constructible: doc.assemblies.filter((a) => a.state === 'CONSTRUCTIBLE').length,
    };
    if (PRINT) console.log(`SAID ${JSON.stringify(said, null, 1)}`);
  }, 300_000);

  it('the states are the same as before: a review draft, nothing constructible, no member ok in the workbook', () => {
    expect([said.readiness, said.constructible]).toEqual(['REVIEW_DRAFT', 0]);
    expect(said.workbook).not.toContain('memo.state.ok');
  });

  it('the banner names the joint and the claim withheld, with the share at this mesh', () => {
    expect(said.banner.startsWith(BANNER_AFTER)).toBe(true);
  });

  it('the summary, the memoria row, the IFC property, the desk', () => {
    expect(said.summary).toBe(SUMMARY_AFTER);
    expect(said.row).toEqual(ROW_AFTER);
    expect(said.ifc).toEqual(IFC_AFTER);
    expect([said.deskBanner, said.deskCodes]).toEqual([DESK_AFTER, ['D124']]);
  });

  it('every changed literal differs from what 7bbab5dcb printed, and the old keys are gone', () => {
    expect(said.banner.startsWith(BEFORE.banner)).toBe(false);
    expect(said.summary).not.toBe(BEFORE.summary);
    const row = said.row as { title: string; formula: string; location: string };
    expect([row.title, row.formula, row.location]).not.toContain(BEFORE.rowTitle);
    expect(row.formula).not.toBe(BEFORE.rowFormula);
    expect(row.location).not.toBe(BEFORE.reason);
    expect(Object.keys(said.ifc as object)).not.toContain(BEFORE.ifcKey);
    expect([said.deskBanner, said.deskCodes]).not.toEqual([BEFORE.desk, [BEFORE.deskCode]]);
    for (const k of ['check.analysis.validity', 'analysis.validity.slabToColumns', 'analysis.validity.notValidated', 'notice.D123.cause', 'detailing.document.analysisNotValidated']) expect(ES[k], k).toBeUndefined();
  });

  it('nothing says validated, cites a clause or a bound around the column', () => {
    const all = JSON.stringify(said);
    for (const w of ['VALIDAD', 'validad', 'validat', 'PUEDEN TOMAR', 'pueden tomar', 't/2', 'A(t/2)', '22.6', 'CIRSOC']) expect(all, w).not.toContain(w);
  });
});

const BANNER_AFTER = "BORRADOR DE REVISIÓN — UNIÓN LOSA-COLUMNA EN UN SOLO NUDO EN 26 MIEMBRO(S): REPARTO DE LA CARGA DE LA LOSA ENTRE VIGAS Y COLUMNAS NO ESTABLECIDO (CON ESTA MALLA VA DIRECTO A LAS COLUMNAS EL 58,3 %) — 0 CONFLICTO(S) SIN RESOLVER — NO APTO PARA CONSTRUCCIÓN";
const SUMMARY_AFTER = "Borrador de revisión rev. 1: 26 miembro(s) con la losa unida a las columnas por un solo nudo, el reparto de su carga entre vigas y columnas no está establecido. No apto para construcción";
/** The memoria row's reason, which the IFC property carries after its own lead. */
const REASON_AFTER = "En el nivel 3 m la losa está unida a cada columna por un solo nudo. Con esta malla el 58.3 % de la carga de la losa entra directo a las columnas sin pasar por las vigas, una parte que depende de la malla: al refinarla tiende a cero. Una columna de sección finita toma directo una parte que depende de la rigidez de vigas y losa. El reparto de la carga de la losa entre vigas y columnas no queda establecido, y las fuerzas de diseño de este miembro no se presentan como las de la estructura. Para establecerlo, vinculá rígidamente a cada columna los nudos de la losa dentro de su sección (con una malla que tenga nudos en sus caras) y volvé a calcular.";
const ROW_AFTER = { title: "Idealización de la unión losa-columna", formula: "P,directo / P,losa", inputs: [{"symbol": "P,directo / P,losa", "value": 58.3, "unit": "%"}], status: "unsupported", code: "slab-column-joint", location: REASON_AFTER };
const IFC_AFTER = { DesignState: "not fully verified", SlabColumnJoint: `one node, load split between beams and columns not established: ${REASON_AFTER}` };
const DESK_AFTER = "Losa unida a las columnas por un solo nudo en 26 miembro(s): el reparto de su carga entre vigas y columnas depende de la malla y no está establecido, así que esos miembros no se presentan como verificados.";

/** What 7bbab5dcb printed for the same run, measured with this file on that tree. */
const BEFORE = {
  "banner": "BORRADOR DE REVISIÓN — ANÁLISIS NO VALIDADO EN 26 MIEMBRO(S): LA LOSA LLEVA EL 58,3 % DE SU CARGA DIRECTO A LAS COLUMNAS, QUE PUEDEN TOMAR 1 % — 0 CONFLICTO(S) SIN RESOLVER — NO APTO PARA CONSTRUCCIÓN",
  "summary": "Borrador de revisión rev. 1: análisis no validado en 26 miembro(s), la losa lleva directo a las columnas más carga de la que pueden tomar. No apto para construcción",
  "rowTitle": "Validez del análisis: camino de la carga de la losa",
  "rowFormula": "P,col / P,losa ≤ A(t/2) / A,losa",
  "reason": "En el nivel 3 m la losa lleva el 58.3 % de su carga directo a los nudos de las columnas, y una columna solo puede tomar directo la carga de la losa a menos de t/2 de sus caras (1 %). La losa está unida a cada columna por un solo nudo: refiná la malla hasta que esa parte no supere el 1 % y volvé a calcular.",
  "ifcKey": "AnalysisState",
  "desk": "Análisis no validado en 26 miembro(s): la malla de la losa lleva a los nudos de las columnas más carga de la que una columna puede tomar directo de una losa, y las vigas y columnas se calcularon sin ese camino de carga. Su armadura es construible pero no es la de la estructura.",
  "deskCode": "D123"
};
