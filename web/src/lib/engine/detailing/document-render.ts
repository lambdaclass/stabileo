/**
 * Render one DocumentModel to the three deliverables.
 *
 * ── The single-source rule ─────────────────────────────────────────
 *
 * All three functions take the SAME `DocumentModel` instance. That is the whole point of
 * the model existing: a report, a drawing set and a bar schedule of one floor are three
 * projections of one claim, and built independently they drift. Every fact printed here
 * comes from the model; none of these functions may compute a new one.
 *
 * ── Drafts print, and say what they are ────────────────────────────
 *
 * A conflicted floor still produces all three files, because an engineer discussing a
 * clash needs the drawing of it. What it must never produce is something that looks
 * issued. So a REVIEW_DRAFT carries its readiness and its unresolved conflicts on the face
 * of every output — the first page of the report, a DXF layer of annotations, and a
 * dedicated block of schedule rows — and each states that it is not for construction.
 *
 * Pure: no store, no runes, no DOM, no file system. The caller turns these into files.
 */

import { assemblyProjection, memberElevationSheet, memberSectionSheet, preferredStation } from './member-sheets';
import { teAt } from '../../i18n/engine-text';
import { buildTitleBlock, buildSchedule, scheduleToAoa, sheetToDxf, combineDxfSheets, sheetToSvg,
  drawElevation, drawSection, barArcs, type Sheet, type Projection } from './drawings';
import type { DocumentAssembly, DocumentModel, OpenConflict } from './document-model';
import { isDraftOnlyIssue } from './document-model';
import { DESIGN_FAMILIES, type DesignFamily } from '../design/design-families';
import { footingPlanCentre, type FloorFamilyDesignRecord } from './family-record';
import type { MemberGeometry, SceneModel } from './scene-model';
import type { ElementStatus } from './element-status';
import type { RcRetouchProvenance } from '../../flow/rc-selection';
import {
  drawColumnDetail, drawGeneralPlan, drawHorizontalSection, drawLevelPlan, levelsOf,
} from './structure-drawings';
import { frameLines, columnStacks, joints, drawFrameElevation, drawColumnStack, drawJointDetail } from './structure-elevations';
import { blockingCount, buildConflictInventory } from './conflict-inventory';
import { drawFooting } from './family-drawings';
import { drawSlab, drawWall } from './slab-wall-drawings';

/**
 * What a document says about the hand edits in it — one sentence, three writers.
 *
 * Written once because the report, the DXF note block and the schedule's header must not be
 * able to disagree about it, and because the four states have to be told apart in the same way
 * everywhere: `unknown` is a file that never recorded the information, and `known` with no
 * members is a project stating that nothing was retouched. A writer that rendered the first as
 * the second would be making the one false statement `rcRetouchProvenance` exists to prevent.
 *
 * `null` when there is nothing to say — no provenance supplied, or nothing designed — and the
 * callers print nothing rather than a negative.
 */
export function retouchNote(
  p: RcRetouchProvenance | undefined, locale: string,
): string | null {
  if (!p || p.status === 'notApplicable') return null;
  const es = locale.startsWith('es');
  if (p.status === 'unknown') {
    return es
      ? 'RETOCADOS A MANO: SIN REGISTRO. Este proyecto se abrió de un archivo anterior a que se '
        + 'guardara esta información. No significa que no se haya retocado ninguna armadura: '
        + 'significa que la aplicación no lo sabe y no puede afirmarlo en esta lámina.'
      : 'HAND EDITS: NO RECORD. This project was opened from a file written before this '
        + 'information was stored. It does not mean no reinforcement was retouched: it means '
        + 'the application does not know and cannot assert it on this sheet.';
  }
  if (p.members.length === 0) {
    return es
      ? 'RETOCADOS A MANO: ninguno. Toda la armadura de este documento proviene del diseño '
        + 'automático y de la coordinación.'
      : 'HAND EDITS: none. Every bar in this document comes from the automatic design and the '
        + 'coordination.';
  }
  const ids = p.members.join(', ');
  return es
    ? `RETOCADOS A MANO: ${p.members.length} elemento(s) de este documento (${ids}) llevan `
      + 'armadura editada a mano. Su verificación es la de la armadura que hay, no la del '
      + 'diseño automático que reemplazó.'
    : `HAND EDITS: ${p.members.length} member(s) in this document (${ids}) carry hand-edited `
      + 'reinforcement. Their verification is of the steel that is there, not of the automatic '
      + 'design it replaced.';
}

/** Everything the renderers need that is not in the model: locale and presentation. */
export interface RenderOptions {
  locale: string;
  projectName: string;
  /**
   * The projected scene, when the caller has one.
   *
   * The general plan, the level plans, the horizontal sections and the column details are
   * built from it — the same projection the 3-D view renders, so a plan and the viewport
   * cannot show different steel. A caller without one still gets every other sheet, and the
   * set's `missingSheetKinds` names the four it could not produce rather than letting their
   * absence pass for "this model has none".
   */
  scene?: SceneModel;
  /** Design status per member, for the notes those sheets carry. */
  statusOf?: (elementId: number) => ElementStatus | undefined;
  /**
   * Which of this document's members were retouched by hand, and whether that is knowable.
   *
   * ── Why it is a four-state value and not a list ────────────────
   *
   * §4 asks every export to state its manually retouched elements, and the honest answer has
   * three failure modes that an array cannot express. `rc-selection.ts` spends its header on
   * the one that matters: `known` with no members is a real claim — nothing was retouched —
   * and `unknown` is a file that never recorded the information. They render identically
   * unless something forces them apart, and only one of them is a statement about the
   * project. A report printing "manually retouched: none" for a file that has no record would
   * be false in the one place whose purpose is to say what is in the drawing.
   *
   * Absent means the caller did not supply it, which is a fourth thing again and is rendered
   * as nothing at all rather than as a negative.
   */
  retouched?: RcRetouchProvenance;
  /** Elevations to cut horizontal sections at, m. */
  sectionElevations?: readonly number[];
  /**
   * The members' real geometry. With it the elevation and the section are drawn from the
   * concrete, with their dimensions, along the assembly's own direction (`member-sheets.ts`),
   * the same sheets the panel previews. Without it the section has no outline and says so.
   */
  members?: readonly MemberGeometry[];
  /** Specified cover per member, m, for the dimensions and the cover line. */
  coverOf?: (elementId: number) => number | undefined;
  /** Commercial stock length for the schedule, m. */
  stockLength?: number;
  /** Steel density, kg/m³, for the mass column. */
  steelDensity?: number;
}

const DEFAULTS = { stockLength: 12, steelDensity: 7850 };

/**
 * A punching column position, in the reader's language.
 *
 * The three values are a TypeScript union, not user text, and both the footing section and the
 * slab section printed the union member raw — so a Spanish report said "edge". Translated in
 * one place, because two places is how one document comes to name the same joint two ways.
 */
function positionLabel(
  position: 'interior' | 'edge' | 'corner' | null,
  L: (es: string, en: string, pt: string) => string,
): string {
  switch (position) {
    case 'interior': return L('interior', 'interior', 'interior');
    case 'edge': return L('de borde', 'edge', 'de borda');
    case 'corner': return L('de esquina', 'corner', 'de canto');
    default: return '—';
  }
}

/** The readiness banner every output carries. Not decoration — it is the claim. */
const FAMILY_WORD: Record<DesignFamily, { es: string; en: string }> = {
  column: { es: 'COLUMNAS', en: 'COLUMNS' },
  beam: { es: 'VIGAS', en: 'BEAMS' },
  slab: { es: 'LOSAS', en: 'SLABS' },
  wall: { es: 'TABIQUES', en: 'WALLS' },
  footing: { es: 'FUNDACIONES', en: 'FOUNDATIONS' },
};

/**
 * What this document covers, and what the building has that it does not.
 *
 * ── Why every export carries this ──────────────────────────────────
 *
 * `readiness` is a statement about the assemblies in the set. A reader takes a sheet stamped
 * ISSUED FOR CONSTRUCTION to be a statement about the building. Those coincide exactly when the
 * set covers every family the model holds, and a run scoped to beams and columns does not.
 *
 * A drawing is read on a site by someone who was not in the room when the scope was chosen, so
 * the qualifier cannot live in the app: it has to be on the paper, beside the stamp it
 * qualifies. `ALCANCE: VIGAS Y COLUMNAS · NO INCLUYE: LOSAS` is the difference between a true
 * claim and a true claim that will be read as a false one.
 *
 * Empty on a document with no scope information rather than an invented one — see
 * `buildDocumentModel`. A set that names no families is visibly wrong; a set that silently
 * claims all of them is not.
 *
 * Same es/other split `readinessBanner` uses, and for the same reason: this is a stamp on a
 * sheet, not interface copy, and it goes through the same one-line path.
 */
export function scopeStatement(doc: DocumentModel, locale: string): string {
  const es = locale.startsWith('es');
  const words = (fs: readonly DesignFamily[]) =>
    fs.map((f) => FAMILY_WORD[f][es ? 'es' : 'en']).join(', ');
  if (doc.scope.length === 0) {
    return es ? 'ALCANCE NO DECLARADO' : 'SCOPE NOT STATED';
  }
  const here = doc.selection?.families ?? doc.scope;
  const covers = `${es ? 'ALCANCE' : 'SCOPE'}: ${words(here)}`;
  /*
   * What is NOT in this set: two different absences, in one list.
   *
   * `outOfScope` is what the MODEL has and the design never covered. A narrowing adds a second
   * kind: a family the design DID cover and this document does not, because no member of it was
   * selected. Printing only the first would stamp `SCOPE: BEAMS` on a beams-only selection of a
   * beams-and-columns project without ever saying the columns are elsewhere — and a reader who
   * knows the design covered them would take this set to contain them.
   *
   * Deduplicated and in `DESIGN_FAMILIES` order, so the same two absences always read the same
   * way round.
   */
  const dropped = doc.selection
    ? doc.scope.filter((f) => !doc.selection!.families.includes(f))
    : [];
  const absent = DESIGN_FAMILIES.filter(
    (f) => doc.outOfScope.includes(f) || dropped.includes(f));
  const out = absent.length === 0
    ? covers
    : `${covers} · ${es ? 'NO INCLUYE' : 'NOT IN THIS SET'}: ${words(absent)}`;
  return doc.selection ? `${out} · ${memberStatement(doc.selection, es)}` : out;
}

/**
 * The members a narrowed document contains, on the paper.
 *
 * ── Why the count AND the ids ──────────────────────────────────────
 *
 * The count is what a reader checks a drawing set against; the ids are what they check an
 * individual sheet against. "12 of 40" without the list cannot be verified, and the list without
 * "of 40" does not say that anything is missing — which is the only reason this line exists.
 *
 * Truncated at twenty ids, and the truncation SAYS SO. A stamp that silently stopped at twenty
 * would be a member list that is wrong in exactly the projects where it matters most, and the
 * count beside it is what stays complete.
 *
 * Only on a narrowed document. A whole set has no selection to declare, and printing "40 of 40"
 * on every sheet would train the reader to skip the line that matters on the one sheet that was
 * narrowed. See `DocumentModel.selection`.
 */
function memberStatement(sel: NonNullable<DocumentModel['selection']>, es: boolean): string {
  const shown = sel.elements.slice(0, 20);
  const more = sel.elements.length - shown.length;
  const ids = more > 0
    ? `${shown.join(', ')} ${es ? `y ${more} más` : `and ${more} more`}`
    : shown.join(', ');
  const head = es
    ? `ELEMENTOS: ${sel.elements.length} de ${sel.ofBase}`
    : `MEMBERS: ${sel.elements.length} of ${sel.ofBase}`;
  const shared = sel.sharedWith.length === 0
    ? ''
    : ` · ${es
      ? `ACERO COMPARTIDO CON: ${sel.sharedWith.join(', ')}`
      : `STEEL SHARED WITH: ${sel.sharedWith.join(', ')}`}`;
  return `${head} (${ids})${shared}`;
}

export function readinessBanner(doc: DocumentModel, locale: string): string {
  const es = locale.startsWith('es');
  const scope = scopeStatement(doc, locale);
  /*
   * The scope rides on the banner rather than sitting somewhere else on the sheet.
   *
   * Every renderer already prints the banner — that is what makes it the one line guaranteed to
   * reach the reader — and a qualifier printed anywhere else is a qualifier that some export
   * will eventually drop. It is appended to EVERY state, including the ones that already say
   * NOT FOR CONSTRUCTION: a draft of a partial scope is still a partial scope, and the reader
   * deciding whether the slabs are coming needs the answer on the draft too.
   */
  const state = (() => {
    switch (doc.readiness) {
      case 'ISSUED':
        return es ? 'EMITIDO PARA CONSTRUCCIÓN' : 'ISSUED FOR CONSTRUCTION';
      case 'REVIEWED':
        return es ? 'REVISADO' : 'REVIEWED';
      case 'FOR_REVIEW':
        return es ? 'PARA REVISIÓN — NO APTO PARA CONSTRUCCIÓN'
          : 'FOR REVIEW — NOT FOR CONSTRUCTION';
      case 'OUTDATED':
        return es
          ? 'DESACTUALIZADO: EL MODELO CAMBIÓ DESPUÉS DEL DETALLADO — NO APTO PARA CONSTRUCCIÓN'
          : 'OUT OF DATE: THE MODEL CHANGED AFTER THE DETAILING — NOT FOR CONSTRUCTION';
      case 'SUPERSEDED':
        return es
          ? `REEMPLAZADO POR LA REVISIÓN ${doc.supersededBy ?? '?'} — NO APTO PARA CONSTRUCCIÓN`
          : `SUPERSEDED BY REVISION ${doc.supersededBy ?? '?'} — NOT FOR CONSTRUCTION`;
      default: {
        // The members' floors join the slab to the columns at one node (`analysis-validity.ts`):
        // said first, it is the claim the draft withholds, the split of the slab's load between
        // beams and columns, with the share the mesh sent straight into the columns.
        const held = doc.slabColumnJoint?.verdict === 'pointJoint' ? doc.slabColumnJoint.pointJoints : [];
        const worst = held.reduce((w, m) => ((m.params.share ?? 0) > (w?.params.share ?? -1) ? m : w), held[0]);
        const pc = (v: number | undefined) => String(v ?? '?').replace('.', es ? ',' : '.');
        const joint = !worst ? '' : es
          ? `UNIÓN LOSA-COLUMNA EN UN SOLO NUDO EN ${held.length} MIEMBRO(S): REPARTO DE LA CARGA DE LA LOSA ENTRE VIGAS Y COLUMNAS NO ESTABLECIDO (CON ESTA MALLA VA DIRECTO A LAS COLUMNAS EL ${pc(worst.params.share)} %) — `
          : `SLAB JOINED TO THE COLUMNS AT ONE NODE FOR ${held.length} MEMBER(S): SPLIT OF THE SLAB'S LOAD BETWEEN BEAMS AND COLUMNS NOT ESTABLISHED (THIS MESH SENDS ${pc(worst.params.share)} % STRAIGHT INTO THE COLUMNS) — `;
        return es
          ? `BORRADOR DE REVISIÓN — ${joint}${doc.openConflicts.length} CONFLICTO(S) SIN RESOLVER — NO APTO PARA CONSTRUCCIÓN`
          : `REVIEW DRAFT — ${joint}${doc.openConflicts.length} UNRESOLVED CONFLICT(S) — NOT FOR CONSTRUCTION`;
      }
    }
  })();
  return `${state} — ${scope}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
}

// ─── PDF (as print-ready HTML, handed to the existing print pipeline) ───

/**
 * The report.
 *
 * Returns HTML rather than a PDF binary because the app already prints through the
 * browser, which produces better typography than any bundled PDF writer and adds no
 * dependency. The caller opens it in a print window.
 */
export function renderReportHtml(
  doc: DocumentModel, opts: RenderOptions,
  translate: (key: string, params?: Record<string, unknown>) => string,
): string {
  const es = opts.locale.startsWith('es');
  const pt = opts.locale.startsWith('pt');
  // Spanish, English and Portuguese, each in its own words: Portuguese used to get the English.
  const L = (a: string, b: string, c: string) => (es ? a : pt ? c : b);
  const draft = doc.readiness === 'REVIEW_DRAFT' || doc.readiness === 'SUPERSEDED' || doc.readiness === 'OUTDATED';

  const rows: string[] = [];

  rows.push(`<h1>${esc(opts.projectName)}</h1>`);
  rows.push(`<p class="banner ${draft ? 'draft' : 'ok'}">${esc(readinessBanner(doc, opts.locale))}</p>`);
  rows.push(`<p class="summary">${esc(translate(doc.summary.key, doc.summary.params))}</p>`);

  /*
    What was retouched by hand, at the TOP.

    §4's requirement, and it belongs beside the readiness banner for the reason the provisional
    note is there: a reader deciding whether to trust a document needs to know which of its
    steel a person put there before they read what the checks say about it.
  */
  {
    const retouch = retouchNote(opts.retouched, opts.locale);
    if (retouch) {
      rows.push(`<p class="banner ${opts.retouched?.status === 'unknown' ? 'draft' : 'ok'} `
        + `retouched">${esc(retouch)}</p>`);
    }
  }

  /**
   * Provisional members, at the TOP of the report and again in their own section.
   *
   * Twice on purpose. The banner is what a reader sees before deciding whether to read on,
   * and the section is what they act from. A report that carried the fact only in a table
   * halfway down would be a report somebody prints, skims and issues.
   */
  const provisionalAll = [...new Set(
    doc.assemblies.flatMap((a) => a.source.provisionalMembers ?? []))].sort((x, y) => x - y);
  if (provisionalAll.length > 0) {
    rows.push(`<p class="banner draft provisional">`
      + esc(L(
        `PROPUESTA PROVISIONAL — NO APTO PARA EMISIÓN CONSTRUCTIVA. ${provisionalAll.length} `
        + 'elemento(s) llevan armadura del diseño de su eje principal; su eje secundario no lo '
        + 'verifica ninguna comprobación de esta aplicación.',
        `PROVISIONAL PROPOSAL — NOT VALID FOR CONSTRUCTION. ${provisionalAll.length} member(s) `
        + 'carry reinforcement from their primary-axis design; their secondary axis is not '
        + 'evaluated by any check in this application.',
      `PROPOSTA PROVISÓRIA — NÃO VÁLIDA PARA CONSTRUÇÃO. ${provisionalAll.length} elemento(s) levam armadura do dimensionamento de seu eixo principal; seu eixo secundário não é avaliado por nenhuma verificação deste aplicativo.`,
    ))
      + '</p>');
  }

  /**
   * Unevaluated torsion, in the same two places and for the same reason.
   *
   * A separate banner rather than a clause inside the provisional one, because they are
   * different facts about different members: a proposal is steel whose SECONDARY BENDING was
   * never checked, and this is steel whose TORSION was never checked. A member can be either,
   * both, or neither, and one sentence covering both would be a sentence that tells a reader
   * neither which members nor which action.
   */
  const torsionAll = [...new Set(
    doc.assemblies.flatMap((a) => a.source.torsionUnevaluatedMembers ?? []))]
    .sort((x, y) => x - y);
  if (torsionAll.length > 0) {
    rows.push('<p class="banner draft torsion">'
      + esc(L(
        `TORSIÓN NO EVALUADA — función en desarrollo. ${torsionAll.length} elemento(s) reciben `
        + 'torsión según el análisis y ninguna comprobación de esta aplicación la verifica. La '
        + 'armadura de este documento NO contempla torsión: no usar como verificación final.',
        `TORSION NOT EVALUATED — feature in development. ${torsionAll.length} member(s) carry `
        + 'torsion according to the analysis and no check in this application verifies it. The '
        + 'reinforcement in this document does NOT account for torsion: do not use as a final '
        + 'verification.',
      `TORÇÃO NÃO AVALIADA — função em desenvolvimento. ${torsionAll.length} elemento(s) recebem torção segundo a análise e nenhuma verificação deste aplicativo a verifica. A armadura deste documento NÃO considera a torção: não usar como verificação final.`,
    ))
      + '</p>');
  }

  /**
   * Top steel that answers to a stirrup bend rather than to a moment.
   *
   * Its own banner for the same reason the two above have theirs: a member can carry hogging
   * steel, assembly steel, both or neither, and one sentence covering two of them tells a
   * reader neither which members nor which action. The distinction this one makes is the
   * narrowest of the three and the easiest to lose — 2Ø10 at the top of a beam looks the same
   * whether a negative moment sized it or §25.7.1.2 did, and only one of those has a capacity
   * behind it.
   */
  const hangerBars = doc.assemblies.flatMap((a) =>
    a.bars.filter((b) => b.purpose === 'stirrupHanger'));
  const hangerAll = [...new Set(hangerBars.flatMap((b) => b.ownerElementIds))]
    .sort((x, y) => x - y);
  if (hangerAll.length > 0) {
    rows.push('<p class="banner draft hanger">'
      + esc(L(
        `ARMADURA SUPERIOR DE ARMADO — ${hangerAll.length} elemento(s). Ninguno de sus apoyos `
        + 'tiene momento negativo de envolvente, de modo que sus barras superiores cumplen '
        + '25.7.1.2 (cada doblez del estribo debe contener una barra longitudinal) y NO son '
        + 'armadura resistente: no se les verificó ni se les atribuye capacidad a momento '
        + 'negativo. El Reglamento no fija su diámetro y el elegido es un criterio de esta '
        + 'aplicación, indicado como tal.',
        `TOP ASSEMBLY REINFORCEMENT — ${hangerAll.length} member(s). Neither support carries an `
        + 'envelope hogging moment, so their top bars satisfy §25.7.1.2 (every stirrup bend must '
        + 'contain a longitudinal bar) and are NOT load-resisting reinforcement: no hogging '
        + 'capacity was verified for them and none is attributed. The regulation does not fix '
        + 'their diameter and the one chosen is this application\'s convention, stated as such.',
      `ARMADURA SUPERIOR DE MONTAGEM — ${hangerAll.length} elemento(s). Nenhum de seus apoios tem momento negativo de envoltória, de modo que suas barras superiores atendem ao §25.7.1.2 (cada dobra do estribo deve conter uma barra longitudinal) e NÃO são armadura resistente: não se verificou nem se atribui a elas capacidade a momento negativo. O regulamento não fixa seu diâmetro; o escolhido é um critério deste aplicativo, declarado como tal.`,
    ))
      + '</p>');
  }

  // ── Revision block ──
  rows.push(`<h2>${L('Revisión', 'Revision', 'Revisão')}</h2><table><tbody>`);
  rows.push(`<tr><th>${L('Revisión', 'Revision', 'Revisão')}</th><td>${doc.revision.number}</td></tr>`);
  rows.push(`<tr><th>${L('Fecha', 'Date', 'Data')}</th><td>${esc(doc.revision.at)}</td></tr>`);
  rows.push(`<tr><th>${L('Autor', 'Author', 'Autor')}</th><td>${esc(doc.revision.author)}</td></tr>`);
  rows.push(`<tr><th>${L('Rev. de armado', 'Detailing rev.', 'Rev. de armação')}</th><td>${doc.revision.detailingRevision}</td></tr>`);
  rows.push(`<tr><th>${L('Rev. de solicitaciones', 'Demand rev.', 'Rev. de solicitações')}</th><td>${doc.revision.demandRevision}</td></tr>`);
  rows.push(`<tr><th>${L('Madurez', 'Maturity', 'Maturidade')}</th><td>${esc(doc.maturity)}</td></tr>`);
  rows.push('</tbody></table>');

  // ── Regulations, with editions, exactly as verified ──
  rows.push(`<h2>${L('Reglamentos', 'Regulations', 'Regulamentos')}</h2><ul>`);
  for (const r of doc.regulations) rows.push(`<li>${esc(r.id)} — ${esc(r.edition)}</li>`);
  rows.push('</ul>');

  if (doc.refs.length > 0) {
    rows.push(`<h3>${L('Artículos aplicados', 'Clauses applied', 'Artigos aplicados')}</h3><ul class="clauses">`);
    for (const r of doc.refs) {
      rows.push(`<li>${esc(r.regulation)} ${esc(r.edition)} §${esc(r.clause)}</li>`);
    }
    rows.push('</ul>');
  }

  // ── Certificates ──
  rows.push(`<h2>${L('Certificados de verificación', 'Verification certificates', 'Certificados de verificação')}</h2>`);
  rows.push(`<table><thead><tr>`
    + `<th>${L('Elemento', 'Member', 'Elemento')}</th><th>${L('Verificador', 'Verifier', 'Verificador')}</th>`
    + `<th>${L('Comprobaciones locales de la sección', 'Local checks of the section', 'Verificações locais da seção')}</th><th>${L('Coincide con la geometría', 'Matches geometry', 'Coincide com a geometria')}</th>`
    + `<th>${L('Retenido por', 'Held by', 'Retido por')}</th>`
    + `</tr></thead><tbody>`);
  /*
   * A certificate's status is the section's LOCAL checks (`member-verdict.ts`): `ok` there is never
   * the member's verdict. What the document knows holds the member beside it (its analysis not
   * validated, a condition the detailing left open on it) is stated in its own column.
   */
  const openOn = new Map<number, number>();
  for (const a of doc.assemblies) for (const u of a.source?.unsupported ?? []) {
    if (isDraftOnlyIssue(u.key)) for (const id of u.scope?.elementIds ?? []) openOn.set(id, (openOn.get(id) ?? 0) + 1);
  }
  for (const c of doc.certificates) {
    const held = [
      ...(c.loadSplit === 'notEstablished' ? [L('unión losa-columna en un solo nudo', 'slab-column point joint', 'ligação laje-pilar em um só nó')] : []),
      ...(openOn.has(c.elementId) ? [L(`${openOn.get(c.elementId)} condición(es) del detallado abierta(s)`, `${openOn.get(c.elementId)} detailing condition(s) open`, `${openOn.get(c.elementId)} condição(ões) do detalhamento em aberto`)] : []),
    ];
    // The provisional label goes in the STATUS cell, beside the verdict, not in a column of
    // its own at the far right where the eye does not go.
    const status = c.provisional
      ? `${esc(c.status)} — ${esc(L('PROVISIONAL, sin certificar', 'PROVISIONAL, uncertified', 'PROVISÓRIO, sem certificar'))}`
      : esc(c.status);
    rows.push(`<tr class="${c.provisional ? 'provisional' : ''}"><td>${c.elementId}</td>`
      + `<td>${esc(c.verifierId)}</td>`
      + `<td>${status}</td>`
      + `<td class="${c.matches && !c.provisional && held.length === 0 ? 'ok' : 'bad'}">`
      + `${c.matches ? L('Sí', 'Yes', 'Sim') : L('No', 'No', 'Não')}</td>`
      + `<td class="${held.length ? 'bad' : ''}">${held.length ? esc(held.join('; ')) : '—'}</td></tr>`);
  }
  rows.push('</tbody></table>');

  // ── Provisional proposals, member by member ──
  if (provisionalAll.length > 0) {
    rows.push(`<h2>${L('Propuestas provisionales', 'Provisional proposals', 'Propostas provisórias')}</h2>`);
    rows.push(`<p>${esc(L(
      'Estos elementos NO están verificados en su eje secundario y no pueden presentarse como '
      + 'documentación final. La armadura mostrada proviene del diseño del eje principal, con la '
      + 'búsqueda y el verificador habituales; no se supuso capacidad para el eje sin verificar '
      + 'ni se relajó ningún umbral.',
      'These members are NOT verified about their secondary axis and may not be presented as '
      + 'final documentation. The reinforcement shown comes from the primary-axis design, using '
      + 'the ordinary search and verifier; no capacity was assumed for the unchecked axis and no '
      + 'threshold was relaxed.',
      'Estes elementos NÃO estão verificados em seu eixo secundário e não podem ser apresentados como documentação final. A armadura mostrada vem do dimensionamento do eixo principal, com a busca e o verificador habituais; não se supôs capacidade para o eixo não verificado nem se relaxou nenhum limite.',
    ))}</p>`);
    rows.push(`<table><thead><tr>`
      + `<th>${L('Elemento', 'Member', 'Elemento')}</th>`
      + `<th>${L('Conjunto', 'Assembly', 'Conjunto')}</th>`
      + `<th>${L('Barras', 'Bars', 'Barras')}</th>`
      + `<th>${L('Estado', 'Status', 'Estado')}</th></tr></thead><tbody>`);
    for (const a of doc.assemblies) {
      for (const id of a.source.provisionalMembers ?? []) {
        const bars = a.bars.filter((b) => b.ownerElementIds.includes(id)).length;
        rows.push(`<tr><td>${id}</td><td>${esc(a.id)}</td><td>${bars}</td>`
          + `<td class="bad">${esc(L('PROVISIONAL — eje secundario sin verificar',
            'PROVISIONAL — secondary axis unverified',
      'PROVISÓRIO — eixo secundário não verificado',
    ))}</td></tr>`);
      }
    }
    rows.push('</tbody></table>');
  }

  // ── Unevaluated torsion, member by member ──
  if (torsionAll.length > 0) {
    rows.push(`<h2>${L('Torsión no evaluada', 'Torsion not evaluated', 'Torção não avaliada')}</h2>`);
    rows.push(`<p>${esc(L(
      'El análisis reporta torsión en estos elementos. Ninguna comprobación de esta aplicación '
      + 'verifica torsión — el adaptador de código en uso lo declara explícitamente — de modo '
      + 'que la armadura mostrada resuelve flexión y corte y NO contempla torsión. La geometría '
      + 'y la armadura son las que el diseño produjo; lo que falta es la verificación. '
      + 'Verificar la torsión por fuera de esta aplicación antes de emitir. Función en '
      + 'desarrollo.',
      'The analysis reports torsion in these members. No check in this application verifies '
      + 'torsion — the code adapter in use declares so explicitly — so the reinforcement shown '
      + 'resolves flexure and shear and does NOT account for torsion. The geometry and the '
      + 'reinforcement are what the design produced; what is missing is the verification. Verify '
      + 'torsion outside this application before issuing. Feature in development.',
      'A análise reporta torção nestes elementos. Nenhuma verificação deste aplicativo verifica torção — o adaptador de norma em uso o declara explicitamente —, de modo que a armadura mostrada resolve flexão e cortante e NÃO considera a torção. A geometria e a armadura são as que o dimensionamento produziu; o que falta é a verificação. Verifique a torção fora deste aplicativo antes de emitir. Função em desenvolvimento.',
    ))}</p>`);
    rows.push('<table><thead><tr>'
      + `<th>${L('Elemento', 'Member', 'Elemento')}</th>`
      + `<th>${L('Conjunto', 'Assembly', 'Conjunto')}</th>`
      + `<th>${L('Barras', 'Bars', 'Barras')}</th>`
      + `<th>${L('Estado', 'Status', 'Estado')}</th></tr></thead><tbody>`);
    for (const a of doc.assemblies) {
      for (const id of a.source.torsionUnevaluatedMembers ?? []) {
        const bars = a.bars.filter((b) => b.ownerElementIds.includes(id)).length;
        rows.push(`<tr><td>${id}</td><td>${esc(a.id)}</td><td>${bars}</td>`
          + `<td class="bad">${esc(L('TORSIÓN NO EVALUADA — en desarrollo',
            'TORSION NOT EVALUATED — in development',
      'TORÇÃO NÃO AVALIADA — em desenvolvimento',
    ))}</td></tr>`);
      }
    }
    rows.push('</tbody></table>');
  }

  // ── Top assembly reinforcement, member by member ──
  if (hangerAll.length > 0) {
    rows.push(`<h2>${L('Armadura superior de armado', 'Top assembly reinforcement', 'Armadura superior de montagem')}</h2>`);
    rows.push(`<p>${esc(L(
      'La cara superior de estos elementos no es una cara traccionada: el análisis no requiere '
      + 'armadura de tracción en ella, de modo que 9.6.1.2 no la alcanza — 9.6.1.1 la circunscribe '
      + 'a las secciones donde el análisis SÍ la requiere. Lo que sí rige es 25.7.1.2: entre los '
      + 'extremos anclados, cada doblez de un estribo cerrado debe contener una barra '
      + 'longitudinal, y si el estribo fuera en U, su gancho se cierra alrededor de una barra '
      + 'longitudinal (25.7.1.3(a)). De ahí salen dos barras, y 9.7.7.1(b) llega al mismo piso de '
      + 'dos barras continuas por integridad estructural. NINGUNA de esas cláusulas fija el '
      + 'diámetro. El que figura abajo lo eligió esta aplicación como el menor de la serie del '
      + 'proyecto que entra de a dos y no baja del diámetro del estribo, y no representa un área '
      + 'requerida por el Reglamento. No es apto para presentarse como armadura resistente a '
      + 'momento negativo.',
      'The top face of these members is not a tension face: the analysis requires no tension '
      + 'reinforcement there, so §9.6.1.2 does not reach it — §9.6.1.1 scopes it to sections '
      + 'where the analysis DOES require it. What does govern is §25.7.1.2: between the anchored '
      + 'ends, every bend of a closed stirrup must contain a longitudinal bar, and were the '
      + 'stirrup U-shaped its hook closes around a longitudinal bar (§25.7.1.3(a)). That gives '
      + 'two bars, and §9.7.7.1(b) reaches the same floor of two continuous bars for structural '
      + 'integrity. NONE of those clauses fixes the diameter. The one below was chosen by this '
      + 'application as the smallest in the project series that fits two per row and is not '
      + 'thinner than the stirrup, and it does not represent an area the regulation requires. It '
      + 'may not be presented as reinforcement resisting a hogging moment.',
      'A face superior destes elementos não é uma face tracionada: a análise não exige armadura de tração ali, de modo que o §9.6.1.2 não a alcança — o §9.6.1.1 o restringe às seções onde a análise SIM a exige. O que governa é o §25.7.1.2: entre as extremidades ancoradas, cada dobra de um estribo fechado deve conter uma barra longitudinal, e se o estribo fosse em U seu gancho se fecha em torno de uma barra longitudinal (§25.7.1.3(a)). Isso dá duas barras, e o §9.7.7.1(b) chega ao mesmo mínimo de duas barras contínuas para a integridade estrutural. NENHUM desses artigos fixa o diâmetro. O indicado abaixo foi escolhido por este aplicativo como o menor da série do projeto que cabe com duas por camada e não é mais fino que o estribo, e não representa uma área exigida pelo regulamento. Não pode ser apresentado como armadura que resiste a momento negativo.',
    ))}</p>`);
    rows.push('<table><thead><tr>'
      + `<th>${L('Elemento', 'Member', 'Elemento')}</th>`
      + `<th>${L('Conjunto', 'Assembly', 'Conjunto')}</th>`
      + `<th>${L('Marca', 'Mark', 'Marca')}</th>`
      + `<th>${L('Barras', 'Bars', 'Barras')}</th>`
      + `<th>${L('Ø (mm)', 'Ø (mm)', 'Ø (mm)')}</th>`
      + `<th>${L('Largo (m)', 'Length (m)', 'Comprimento (m)')}</th>`
      + `<th>${L('Estado', 'Status', 'Estado')}</th></tr></thead><tbody>`);
    for (const a of doc.assemblies) {
      const markOf = new Map<string, string>();
      for (const m of a.source.marks) for (const bid of m.barIds) markOf.set(bid, m.mark);
      const byMember = new Map<number, typeof a.bars>();
      for (const b of a.bars) {
        if (b.purpose !== 'stirrupHanger') continue;
        for (const id of b.ownerElementIds) {
          byMember.set(id, [...(byMember.get(id) ?? []), b]);
        }
      }
      for (const id of [...byMember.keys()].sort((x, y) => x - y)) {
        const bars = byMember.get(id)!;
        rows.push(`<tr><td>${id}</td><td>${esc(a.id)}</td>`
          + `<td>${esc([...new Set(bars.map((b) => markOf.get(b.id) ?? '—'))].join(', '))}</td>`
          + `<td>${bars.length}</td>`
          + `<td>${[...new Set(bars.map((b) => b.diameterMm))].join(', ')}</td>`
          + `<td>${bars[0].cuttingLength.toFixed(2)}</td>`
          + `<td class="bad">${esc(L('ARMADO (25.7.1.2) — Ø sin cláusula, no resistente',
            'ASSEMBLY (§25.7.1.2) — Ø has no clause, not load-resisting',
      'MONTAGEM (§25.7.1.2) — Ø sem artigo, não resistente',
    ))}</td></tr>`);
      }
    }
    rows.push('</tbody></table>');
  }

  // ── Assemblies: beam lines and column stacks ──
  for (const a of doc.assemblies) {
    rows.push(`<h2>${esc(translate(a.label.key, a.label.params))}</h2>`);
    rows.push(`<p>${L('Estado', 'State', 'Estado')}: <strong>${esc(a.state)}</strong> · `
      + `${L('Elementos', 'Members', 'Elementos')}: ${a.elementIds.join(', ')} · `
      + `${L('Barras', 'Bars', 'Barras')}: ${a.bars.length} · `
      + `${L('Capas', 'Layers', 'Camadas')}: ${a.layers.length}</p>`);

    if (a.laps.length > 0) {
      rows.push(`<h3>${L('Empalmes físicos', 'Physical laps', 'Emendas físicas')}</h3><table><thead><tr>`
        + `<th>${L('Nudo', 'Joint', 'Nó')}</th><th>${L('Barras', 'Bars', 'Barras')}</th>`
        + `<th>${L('Tipo', 'Kind', 'Tipo')}</th><th>${L('Clase', 'Class', 'Classe')}</th>`
        + `<th>${L('Longitud (mm)', 'Length (mm)', 'Comprimento (mm)')}</th></tr></thead><tbody>`);
      for (const l of a.laps) {
        rows.push(`<tr><td>${esc(l.jointId)}</td>`
          + `<td>${esc(l.fromBarId)} / ${esc(l.toBarId)}</td>`
          + `<td>${esc(l.kind)}</td><td>${esc(l.spliceClass)}</td>`
          + `<td>${Math.round(l.lapLength * 1000)}</td></tr>`);
      }
      rows.push('</tbody></table>');
    }

    if (a.fusions.length > 0) {
      rows.push(`<h3>${L('Barras continuas a través de nudos', 'Bars continuous through joints', 'Barras contínuas através dos nós')}</h3><ul>`);
      for (const f of a.fusions) {
        rows.push(`<li>${esc(f.barId)} — ${L('elementos', 'members', 'elementos')} ${f.ownerElementIds.join(', ')}</li>`);
      }
      rows.push('</ul>');
    }

    if (a.constructibility) {
      rows.push(`<h3>${L('Condiciones de constructibilidad', 'Constructibility conditions', 'Condições de construtibilidade')}</h3><ul class="conds">`);
      for (const c of a.constructibility.conditions) {
        rows.push(`<li class="${c.passed ? 'ok' : 'bad'}">${esc(c.condition)}: `
          + `${esc(translate(c.detail.key, c.detail.params))}</li>`);
      }
      rows.push('</ul>');
    }

    rows.push(...familySections(a, L, translate));
  }

  // ── Unresolved conflicts. On a draft this is the point of the document. ──
  if (doc.openConflicts.length > 0) {
    /**
     * Three statements, in this order, because they answer three different questions.
     *
     *   1. what the geometry IS — it was generated, it is real, it is drawn;
     *   2. what is wrong with it — a constructibility problem, sorted by kind;
     *   3. what that means — this document may not be issued.
     *
     * The per-conflict table below used to be the whole section. On the 7-storey building
     * that is 40 065 rows, which nobody reads and which says nothing about SHAPE: those
     * 40 065 turn out to be two causes — 38 486 interpenetrations with a median of 4 mm, and
     * 1 579 cross-member spacing questions with a median of 9,6 mm. The inventory states that
     * before the list, so the list is something a reader consults rather than something they
     * give up on.
     *
     * Nothing is filtered. `total` equals the conflict count and the table below still holds
     * every row.
     */
    const inv = buildConflictInventory(doc.openConflicts);
    const blocking = blockingCount(inv);

    rows.push(`<h2 class="bad">${L('Conflictos de constructibilidad', 'Constructibility conflicts', 'Conflitos de construtibilidade')} `
      + `(${inv.total})</h2>`);
    rows.push(`<p>${esc(L(
      'El armado que sigue FUE GENERADO y está dibujado: la geometría existe. Lo que estos '
      + 'conflictos reportan es que, tal como está, no es constructible sin revisión — no que '
      + 'falte armadura. Un conflicto no oculta el elemento ni impide el plano; impide la '
      + 'emisión.',
      'The reinforcement below WAS GENERATED and is drawn: the geometry exists. What these '
      + 'conflicts report is that as it stands it is not constructible without review — not '
      + 'that steel is missing. A conflict hides no element and blocks no drawing; it blocks '
      + 'issue.',
      'A armadura abaixo FOI GERADA e está desenhada: a geometria existe. O que estes conflitos reportam é que, como está, não é construível sem revisão — não que falte aço. Um conflito não oculta nenhum elemento nem bloqueia nenhum desenho; bloqueia a emissão.',
    ))}</p>`);
    rows.push(`<p class="bad"><strong>${esc(L(
      `${blocking} de ${inv.total} son bloqueantes (interpenetración o separación real). `
      + 'RESULTADO NO APTO PARA EMISIÓN FINAL.',
      `${blocking} of ${inv.total} are blocking (interpenetration or a real spacing shortfall). `
      + 'RESULT NOT VALID FOR FINAL ISSUE.',
      `${blocking} de ${inv.total} são bloqueantes (interpenetração ou falta real de espaçamento). RESULTADO NÃO VÁLIDO PARA EMISSÃO FINAL.`,
    ))}</strong></p>`);

    rows.push(`<h3>${L('Inventario por categoría', 'Inventory by category', 'Inventário por categoria')}</h3>`);
    rows.push(`<table><thead><tr>`
      + `<th>${L('Categoría', 'Category', 'Categoria')}</th><th>${L('Cantidad', 'Count', 'Quantidade')}</th>`
      + `<th>${L('Barras', 'Bars', 'Barras')}</th><th>${L('Elementos', 'Members', 'Elementos')}</th>`
      + `<th>${L('Déficit mediano (mm)', 'Median shortfall (mm)', 'Déficit mediano (mm)')}</th>`
      + `<th>${L('Peor (mm)', 'Worst (mm)', 'Pior (mm)')}</th>`
      + `<th>${L('Bloqueante', 'Blocking', 'Bloqueante')}</th>`
      + `<th>${L('Clases de par', 'Pair classes', 'Classes de par')}</th></tr></thead><tbody>`);
    for (const c of inv.summary) {
      const isBlocking = inv.blocking.includes(c.category);
      rows.push(`<tr class="${isBlocking ? 'bad' : ''}"><td>${esc(c.category)}</td>`
        + `<td>${c.count}</td><td>${c.bars}</td><td>${c.members}</td>`
        + `<td>${(c.medianShortfall * 1000).toFixed(1)}</td>`
        + `<td>${(c.worstShortfall * 1000).toFixed(1)}</td>`
        + `<td>${isBlocking ? L('Sí', 'Yes', 'Sim') : L('No', 'No', 'Não')}</td>`
        + `<td>${esc(c.byPairClass.map((k) => `${k.pairClass} ×${k.count}`).join(', '))}</td></tr>`);
    }
    rows.push('</tbody></table>');

    rows.push(`<h3>${L('Detalle, conflicto por conflicto', 'Detail, conflict by conflict', 'Detalhe, conflito por conflito')}</h3>`);
    rows.push(`<table><thead><tr>`
      + `<th>${L('Conjunto', 'Assembly', 'Conjunto')}</th><th>${L('Elementos', 'Members', 'Elementos')}</th>`
      + `<th>${L('Barra A', 'Bar A', 'Barra A')}</th><th>${L('Barra B', 'Bar B', 'Barra B')}</th>`
      + `<th>${L('Clase', 'Class', 'Classe')}</th><th>${L('Severidad', 'Severity', 'Severidade')}</th>`
      + `<th>${L('Categoría', 'Category', 'Categoria')}</th>`
      + `<th>${L('Medido (mm)', 'Measured (mm)', 'Medido (mm)')}</th><th>${L('Requerido (mm)', 'Required (mm)', 'Exigido (mm)')}</th>`
      + `<th>${L('Acción sugerida', 'Suggested action', 'Ação sugerida')}</th></tr></thead><tbody>`);
    for (let i = 0; i < doc.openConflicts.length; i++) {
      const c = doc.openConflicts[i];
      // Both bars stay named and separately addressable, which is the traceability
      // requirement: a conflict nobody can follow back to two real bars is a number.
      rows.push(`<tr><td>${esc(c.assemblyId)}</td><td>${c.elementIds.join(', ')}</td>`
        + `<td>${esc(c.barIds[0])}</td><td>${esc(c.barIds[1])}</td>`
        + `<td>${esc(c.pairClass)}</td><td>${esc(c.severity)}</td>`
        + `<td>${esc(inv.rows[i].category)}</td>`
        + `<td>${Math.round(c.clearance * 1000)}</td><td>${Math.round(c.required * 1000)}</td>`
        + `<td>${esc(translate(c.suggestedAction.key, c.suggestedAction.params))}</td></tr>`);
    }
    rows.push('</tbody></table>');
  }

  if (doc.assumptions.length > 0) {
    rows.push(`<h2>${L('Hipótesis', 'Assumptions', 'Hipóteses')}</h2><ul>`);
    for (const a of doc.assumptions) rows.push(`<li>${esc(translate(a.key, a.params))}</li>`);
    rows.push('</ul>');
  }

  return `<!doctype html><html lang="${esc(opts.locale)}"><head><meta charset="utf-8">`
    + `<title>${esc(opts.projectName)} — rev ${doc.revision.number}</title><style>`
    + 'body{font:12px/1.45 system-ui,sans-serif;margin:24px;color:#111}'
    + 'h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:20px 0 6px;'
    + 'border-bottom:1px solid #ccc;padding-bottom:2px}h3{font-size:13px;margin:12px 0 4px}'
    + 'table{border-collapse:collapse;width:100%;margin:4px 0 10px}'
    + 'th,td{border:1px solid #bbb;padding:3px 6px;text-align:left;font-size:11px}'
    + 'th{background:#f2f2f2}.banner{font-weight:700;padding:6px 10px;margin:6px 0 14px}'
    + '.banner.draft{background:#fde2e2;border:2px solid #b00}'
    + '.banner.ok{background:#e6f5e6;border:2px solid #2a7}'
    + '.bad{color:#b00}.ok{color:#2a7}ul{margin:4px 0 10px 18px}'
    + '@media print{body{margin:0}}'
    + `</style></head><body>${rows.join('')}</body></html>`;
}

// ─── Floor-family sections ───

/** Number → fixed string, or an em dash when the value is genuinely absent. */
function n(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined || !Number.isFinite(v)
    ? '—' : v.toFixed(digits);
}

/**
 * A check's utilization, or N.E. (not evaluated, as the memoria prints it) when the check is
 * UNSUPPORTED: those carry `utilization: 0`, which printed as (0.00), a pass nobody computed.
 */
function util(c: { status: string; utilization: number }): string {
  return c.status === 'UNSUPPORTED' ? 'N.E.' : n(c.utilization, 2);
}

/**
 * The slab, wall and footing sections of the report.
 *
 * ── Projection, never recalculation ────────────────────────────────
 *
 * Every value here is read off a persisted `FloorFamilyDesignRecord`. Not one is recomputed.
 * That is the rule the DocumentModel exists to enforce: a bearing pressure recomputed at
 * report time is a second answer to a question already answered, and the two diverge the
 * first time a clause or a rounding changes — silently, and in a document an engineer signs.
 *
 * ── Absence is printed, not skipped ────────────────────────────────
 *
 * A null result renders as an em dash with the record's own unsupported reason beside it. A
 * section that quietly omitted its unverifiable rows would read as a complete verification
 * of everything it happened to mention, which is exactly how a footing with no soil data
 * comes to look checked.
 */
function familySections(
  a: DocumentAssembly,
  L: (es: string, en: string, pt: string) => string,
  translate: (key: string, params?: Record<string, unknown>) => string,
): string[] {
  if (a.families.length === 0) return [];
  const rows: string[] = [];
  const certOf = (ownerId: string) =>
    a.familyCertificates.find((c) => c.ownerId === ownerId);

  // ── The certificate table: one row per family member, with WHY it does or does not apply ──
  rows.push(`<h3>${L('Certificados de familia', 'Family certificates', 'Certificados de família')}</h3>`);
  rows.push('<table><thead><tr>'
    + `<th>${L('Familia', 'Family', 'Família')}</th><th>${L('Elemento', 'Member', 'Elemento')}</th>`
    + `<th>${L('Estado', 'Status', 'Estado')}</th><th>${L('Madurez', 'Maturity', 'Maturidade')}</th>`
    + `<th>${L('Vigencia', 'Applies', 'Aplica')}</th></tr></thead><tbody>`);
  for (const c of a.familyCertificates) {
    rows.push(`<tr><td>${esc(c.family)}</td><td>${esc(c.ownerId)}</td>`
      + `<td>${esc(c.certificate.status)}</td><td>${esc(c.certificate.maturity)}</td>`
      // The freshness REASON, not just yes/no: `missing` and `geometryMismatch` have
      // different remedies and a reader must not have to guess which applies.
      + `<td class="${c.applies ? 'ok' : 'bad'}">${esc(c.freshness)}</td></tr>`);
  }
  rows.push('</tbody></table>');

  for (const r of a.families) {
    const cert = certOf(r.ownerId);
    rows.push(`<h3>${esc(r.ownerId)} — ${esc(r.family)}</h3>`);
    rows.push(`<p>${L('Estado del registro', 'Record status', 'Estado do registro')}: <strong>${esc(r.status)}</strong>`
      + ` · ${L('Madurez', 'Maturity', 'Maturidade')}: ${esc(r.maturity)}`
      + ` · ${L('Edición', 'Edition', 'Edição')}: ${esc(r.edition)}`
      + ` · ${L('Rev. análisis/cargas/reglamento/entidad', 'Rev. analysis/loads/regulation/entity', 'Rev. análise/cargas/regulamento/entidade')}: `
      + `${r.revisions.analysis}/${r.revisions.loads}/${r.revisions.regulation}/${r.revisions.entity}`
      + (cert ? ` · ${L('Certificado', 'Certificate', 'Certificado')}: ${esc(cert.freshness)}` : '')
      + '</p>');

    if (r.governingCombinations.length > 0) {
      rows.push(`<p>${L('Combinaciones gobernantes', 'Governing combinations', 'Combinações determinantes')}: `
        + `${esc(r.governingCombinations.join(', '))}</p>`);
    }

    // ── Checks: every one the record carries, passing or not ──
    rows.push('<table><thead><tr>'
      + `<th>${L('Verificación', 'Check', 'Verificação')}</th><th>${L('Estado', 'Status', 'Estado')}</th>`
      + `<th>${L('Utilización', 'Utilisation', 'Utilização')}</th><th>${L('Combinación', 'Combination', 'Combinação')}</th>`
      + '</tr></thead><tbody>');
    for (const c of r.checks) {
      rows.push(`<tr><td>${esc(c.key)}</td>`
        + `<td class="${c.status === 'OK' ? 'ok' : 'bad'}">${esc(c.status)}</td>`
        + `<td>${c.utilization === null ? '—' : c.status === 'UNSUPPORTED' ? 'N.E.' : n(c.utilization, 2)}</td>`
        + `<td>${esc(c.governingCombination ?? '—')}</td></tr>`);
    }
    rows.push('</tbody></table>');

    if (r.family === 'footing') rows.push(...footingDetail(r, L));
    if (r.family === 'slab') rows.push(...slabDetail(r, L));
    if (r.family === 'wall') rows.push(...wallDetail(r, L));

    // Unsupported conditions and assumptions, in SEPARATE blocks. A limitation and a
    // hypothesis are different things and mixing them buries the one that matters.
    if (r.unsupported.length > 0) {
      rows.push(`<h4 class="bad">${L('No verificado', 'Not verified', 'Não verificado')}</h4><ul>`);
      for (const m of r.unsupported) rows.push(`<li>${esc(translate(m.key, m.params))}</li>`);
      rows.push('</ul>');
    }
    if (r.assumptions.length > 0) {
      rows.push(`<h4>${L('Hipótesis', 'Assumptions', 'Hipóteses')}</h4><ul>`);
      for (const m of r.assumptions) rows.push(`<li>${esc(translate(m.key, m.params))}</li>`);
      rows.push('</ul>');
    }
  }
  return rows;
}

function kv(label: string, value: string): string {
  return `<tr><th>${label}</th><td>${value}</td></tr>`;
}

function footingDetail(
  r: Extract<FloorFamilyDesignRecord, { family: 'footing' }>,
  L: (es: string, en: string, pt: string) => string,
): string[] {
  const g = r.geometry;
  const out: string[] = ['<table><tbody>'];
  out.push(kv(L('Dimensiones B × L × h', 'Dimensions B × L × h', 'Dimensões B × L × h'),
    `${n(g.B, 2)} × ${n(g.L, 2)} × ${n(g.thickness, 2)} m`));
  out.push(kv(L('Altura útil d', 'Effective depth d', 'Altura útil d'), `${n(g.d, 3)} m`));
  out.push(kv(L('Recubrimiento', 'Cover', 'Cobrimento'), `${n(g.cover * 1000, 0)} mm`));
  out.push(kv(L('Cota de fundación', 'Founding level', 'Cota de fundação'), `${n(g.foundingElevation, 2)} m`));
  out.push(kv(L('Excentricidad de planta', 'Plan eccentricity', 'Excentricidade em planta'),
    `${n(g.eccentricityB, 3)} / ${n(g.eccentricityL, 3)} m`));
  out.push(kv(L('Rotación', 'Rotation', 'Rotação'), `${n(g.rotationDeg, 1)}°`));
  out.push(kv(L('Columna soportada', 'Supported column', 'Pilar apoiado'),
    r.support.columnElementId === null
      ? L('no identificada', 'not identified', 'não identificado')
      : `#${r.support.columnElementId} — ${n(r.support.columnB, 2)} × ${n(r.support.columnH, 2)} m`));
  out.push(kv(L('Nudo', 'Node', 'Nó'), `#${r.support.nodeId}`));
  out.push('</tbody></table>');

  // ── The ground, with its PROVENANCE. Bearing pressure has no regulatory source. ──
  out.push(`<h4>${L('Condiciones del terreno', 'Ground conditions', 'Condições do terreno')}</h4>`);
  if (!r.ground) {
    out.push(`<p class="bad">${L(
      'No se resolvió ningún perfil de suelo para esta zapata, por lo que no hay tensión admisible contra la cual verificarla.',
      'No soil profile resolved for this footing, so there is no allowable pressure to check it against.',
      'Nenhum perfil de solo resolvido para esta sapata, então não há tensão admissível para verificá-la.',
    )}</p>`);
  } else {
    out.push('<table><tbody>');
    out.push(kv(L('Estrato', 'Stratum', 'Estrato'), esc(r.ground.name)));
    out.push(kv(L('Tensión admisible', 'Allowable pressure', 'Tensão admissível'),
      r.ground.allowableBearingKPa === null
        ? L('NO DECLARADA', 'NOT STATED', 'NÃO DECLARADA')
        : `${n(r.ground.allowableBearingKPa, 1)} kPa`));
    // Printed on every document that relies on it: an assumed value must never read as a
    // measured one, and this figure comes from a geotechnical study rather than a code.
    out.push(kv(L('Procedencia', 'Provenance', 'Procedência'),
      `${esc(r.ground.source)}${r.ground.reference ? ` — ${esc(r.ground.reference)}` : ''}`));
    out.push(kv(L('Peso unitario', 'Unit weight', 'Peso específico'),
      r.ground.unitWeightKNm3 === null ? '—' : `${n(r.ground.unitWeightKNm3, 1)} kN/m³`));
    out.push(kv(L('Napa', 'Groundwater', 'Lençol freático'),
      r.ground.groundwaterDepthM === null ? '—' : `${n(r.ground.groundwaterDepthM, 2)} m`));
    out.push('</tbody></table>');
  }

  // ── The reaction the footing was designed for ──
  out.push(`<h4>${L('Reacción de diseño', 'Design reaction', 'Reação de cálculo')}</h4>`);
  if (!r.demand) {
    out.push(`<p class="bad">${L('No se resolvió ninguna reacción en este nudo.',
      'No reaction was resolved at this node.',
      'Nenhuma reação foi resolvida neste nó.',
    )}</p>`);
  } else {
    out.push('<table><tbody>');
    out.push(kv(L('Combinación gobernante', 'Governing combination', 'Combinação determinante'),
      esc(r.demand.governingCombination)));
    out.push(kv(L('N mayorado', 'Factored N', 'N majorado'), `${n(r.demand.factoredAxial, 1)} kN`));
    out.push(kv(L('N de servicio', 'Service N', 'N de serviço'), `${n(r.demand.serviceAxial, 1)} kN`));
    out.push(kv(L('Momentos de servicio MB / ML', 'Service moments MB / ML', 'Momentos de serviço MB / ML'),
      `${n(r.demand.serviceMomentB, 1)} / ${n(r.demand.serviceMomentL, 1)} kN·m`));
    out.push(kv(L('Casos sumados para servicio', 'Cases summed for service', 'Casos somados para serviço'),
      r.demand.serviceCaseTypes.length > 0
        ? esc(r.demand.serviceCaseTypes.join(' + '))
        : L('ninguno', 'none', 'nenhum')));
    out.push('</tbody></table>');
    // Every combination that was offered, so the choice of governing is auditable rather
    // than asserted.
    out.push(`<p>${L('Combinaciones consideradas', 'Combinations considered', 'Combinações consideradas')}: `
      + esc(r.demand.considered
        .map((c) => `${c.combinationName} (Fz ${c.fz.toFixed(0)} kN)`).join('; ')) + '</p>');
  }

  // ── The checks, with their numbers ──
  out.push(`<h4>${L('Resultados', 'Results', 'Resultados')}</h4><table><tbody>`);
  out.push(kv(L('Presión de contacto qmax / qmin', 'Contact pressure qmax / qmin', 'Pressão de contato qmax / qmin'),
    r.bearing ? `${n(r.bearing.qMax, 1)} / ${n(r.bearing.qMin, 1)} kPa` : '—'));
  out.push(kv(L('Excentricidad eB / eL', 'Eccentricity eB / eL', 'Excentricidade eB / eL'),
    r.bearing ? `${n(r.bearing.eB, 3)} / ${n(r.bearing.eL, 3)} m` : '—'));
  out.push(kv(L('Contacto parcial', 'Partial contact', 'Contato parcial'),
    r.bearing ? (r.bearing.uplift ? L('SÍ — base despegada', 'YES — base lifts off', 'SIM — a base descola')
      : L('no', 'no', 'não')) : '—'));
  out.push(kv(L('Capacidad portante', 'Bearing', 'Tensão no solo'),
    r.bearing
      ? `${n(r.bearing.qMax, 1)} / ${n(r.bearing.allowable, 1)} kPa `
        + `(${util(r.bearing)})`
      : '—'));
  out.push(kv(L('Flexión Mu en la cara', 'Flexure Mu at the face', 'Flexão Mu na face'),
    r.flexure ? `${n(r.flexure.Mu, 1)} kN·m` : '—'));
  out.push(kv(L('Corte en una dirección Vu / φVc', 'One-way shear Vu / φVc', 'Cortante em uma direção Vu / φVc'),
    r.oneWayShear
      ? `${n(r.oneWayShear.Vu, 1)} / ${n(r.oneWayShear.phiVc, 1)} kN `
        + `(${util(r.oneWayShear)})`
      : '—'));
  if (r.punching) {
    out.push(kv(L('Punzonado Vu / φVc', 'Punching Vu / φVc', 'Punção Vu / φVc'),
      `${n(r.punching.Vu, 1)} / ${n(r.punching.phiVc, 1)} kN `
      + `(${util(r.punching)})`));
    out.push(kv(L('Perímetro crítico', 'Critical perimeter', 'Perímetro crítico'),
      `${esc(positionLabel(r.punching.position, L))} — `
      + `${r.punching.truncatedSides} ${L('cara(s) truncada(s)', 'truncated side(s)', 'lado(s) truncado(s)')}`));
    // The equilibrium residual: N_u − (V_u + q_u·A_enclosed) must be zero, and printing it
    // is how a reader confirms the free body the record describes is the one that was solved.
    out.push(kv(L('Residuo de equilibrio', 'Equilibrium residual', 'Resíduo de equilíbrio'),
      r.punching.equilibriumResidual === null
        ? L('no medido', 'not measured', 'não medido')
        : `${n(r.punching.equilibriumResidual, 3)} kN`));
  } else {
    out.push(kv(L('Punzonado', 'Punching', 'Punção'), '—'));
  }
  out.push('</tbody></table>');

  // ── Dowels and starter ties ──
  out.push(`<h4>${L('Pelos y estribos de arranque', 'Dowels and starter ties', 'Arranques e estribos de arranque')}</h4>`);
  if (!r.dowels) {
    out.push(`<p>${L('No se generaron pelos: la columna no tiene barras resueltas.',
      'No dowels generated: the column has no resolved bars.',
      'Nenhum arranque gerado: o pilar não tem barras resolvidas.',
    )}</p>`);
  } else {
    out.push('<table><tbody>');
    out.push(kv(L('Pelos', 'Dowels', 'Arranques'),
      `${r.dowels.count} Ø${r.dowels.diameterMm} mm`));
    out.push(kv(L('Anclaje en zapata ld', 'Development in footing ld', 'Ancoragem na sapata ld'),
      `${n(r.dowels.ldFooting * 1000, 0)} mm`));
    out.push(kv(L('Empalme sobre zapata', 'Lap above footing', 'Emenda acima da sapata'),
      `${n(r.dowels.lapAbove * 1000, 0)} mm`));
    out.push(kv(L('Remate inferior', 'Bottom treatment', 'Tratamento inferior'),
      r.dowels.hooked
        ? L('gancho a 90° sobre la parrilla inferior', '90° hook over the bottom mat', 'gancho de 90° sobre a malha inferior')
        : L('recto', 'straight', 'reto')));
    out.push(kv(L('Estribos de arranque', 'Starter ties', 'Estribos de arranque'),
      r.starterTies
        ? `${r.starterTies.pieces} × Ø${r.starterTies.diameterMm} mm`
        : L('ninguno', 'none', 'nenhum')));
    out.push('</tbody></table>');
  }
  return out;
}

function slabDetail(
  r: Extract<FloorFamilyDesignRecord, { family: 'slab' }>,
  L: (es: string, en: string, pt: string) => string,
): string[] {
  const g = r.geometry;
  const out: string[] = ['<table><tbody>'];
  out.push(kv(L('Paño lx × ly × h', 'Panel lx × ly × h', 'Painel lx × ly × h'),
    `${n(g.lx, 2)} × ${n(g.ly, 2)} × ${n(g.thickness, 3)} m`));
  out.push(kv(L('Comportamiento', 'Behaviour', 'Comportamento'), esc(g.behaviour)));
  out.push(kv(L('Bordes apoyados', 'Supported edges', 'Bordas apoiadas'), String(g.supportedSides)));
  out.push(kv(L('Recubrimiento', 'Cover', 'Cobrimento'), `${n(g.cover * 1000, 0)} mm`));
  out.push('</tbody></table>');

  // ── Raw plate moments AND the Wood-Armer transform, side by side ──
  //
  // Both, because `mxy` is the field a naive slab design discards and discarding it
  // under-reinforces a twisted panel. Printing only the transformed pair would make the
  // transformation unauditable; printing both lets a reviewer check it.
  out.push(`<h4>${L('Solicitaciones y Wood-Armer', 'Demands and Wood-Armer', 'Solicitações e Wood-Armer')}</h4>`);
  out.push('<table><thead><tr>'
    + `<th>${L('Región', 'Region', 'Região')}</th><th>mx</th><th>my</th><th>mxy</th>`
    + `<th>${L('m inf. x', 'm bot. x', 'm inf. x')}</th><th>${L('m inf. y', 'm bot. y', 'm inf. y')}</th>`
    + `<th>${L('m sup. x', 'm top x', 'm sup. x')}</th><th>${L('m sup. y', 'm top y', 'm sup. y')}</th>`
    + `<th>qu</th></tr></thead><tbody>`);
  for (const d of r.demands) {
    out.push(`<tr><td>${esc(d.region)}</td>`
      + `<td>${n(d.mx)}</td><td>${n(d.my)}</td><td>${n(d.mxy)}</td>`
      + `<td>${n(d.woodArmer.mxBottom)}</td><td>${n(d.woodArmer.myBottom)}</td>`
      + `<td>${n(d.woodArmer.mxTop)}</td><td>${n(d.woodArmer.myTop)}</td>`
      + `<td>${n(d.qu, 2)}</td></tr>`);
  }
  out.push(`</tbody></table><p class="note">${L(
    'Momentos en kN·m/m; qu en kPa.', 'Moments in kN·m/m; qu in kPa.',
      'Momentos em kN·m/m; qu em kPa.',
    )}</p>`);

  if (r.reinforcement.length > 0) {
    out.push(`<h4>${L('Armadura por región', 'Reinforcement by region', 'Armadura por região')}</h4>`);
    out.push('<table><thead><tr>'
      + `<th>${L('Cara', 'Face', 'Face')}</th><th>${L('Dirección', 'Direction', 'Direção')}</th>`
      + `<th>Ø</th><th>${L('Separación', 'Spacing', 'Espaçamento')}</th>`
      + `<th>As req.</th><th>As prov.</th><th>${L('Gobierna', 'Governed by', 'Governado por')}</th>`
      + `<th>${L('Barras', 'Bars', 'Barras')}</th></tr></thead><tbody>`);
    for (const z of r.reinforcement) {
      out.push(`<tr><td>${esc(z.face)}</td><td>${esc(z.direction)}</td>`
        + `<td>${z.diameterMm}</td><td>${n(z.spacing * 1000, 0)} mm</td>`
        + `<td>${n(z.asRequired, 0)}</td><td>${n(z.asProvided, 0)}</td>`
        + `<td>${esc(z.governedBy)}</td><td>${z.barIds.length}</td></tr>`);
    }
    out.push(`</tbody></table><p class="note">${L(
      'As en mm²/m.', 'As in mm²/m.',
      'As em mm²/m.',
    )}</p>`);
  }

  out.push('<table><tbody>');
  out.push(kv(L('Corte en una dirección Vu / φVc', 'One-way shear Vu / φVc', 'Cortante em uma direção Vu / φVc'),
    r.oneWayShear
      ? `${n(r.oneWayShear.Vu, 1)} / ${n(r.oneWayShear.phiVc, 1)} kN/m `
        + `(${util(r.oneWayShear)})`
      : '—'));
  out.push('</tbody></table>');

  // Punching per supported column. An EMPTY list is a measured "this panel supports no
  // column", and it is said out loud so it cannot be read as an omitted check.
  out.push(`<h4>${L('Punzonado losa-columna', 'Slab-column punching', 'Punção laje-pilar')}</h4>`);
  if (r.punching.length === 0) {
    out.push(`<p>${L(
      'Este paño no soporta ninguna columna, por lo que no hay nudo de punzonado que verificar.',
      'This panel supports no column, so there is no punching joint to check.',
      'Este painel não apoia nenhum pilar, então não há nó de punção para verificar.',
    )}</p>`);
  } else {
    out.push('<table><thead><tr>'
      + `<th>${L('Columna', 'Column', 'Pilar')}</th><th>${L('Nudo', 'Node', 'Nó')}</th>`
      + `<th>${L('Estado', 'Status', 'Estado')}</th>`
      + `<th>${L('Posición', 'Position', 'Posição')}</th><th>bo</th>`
      + `<th>N inf.</th><th>N sup.</th><th>Vu</th><th>φVc</th>`
      + `<th>${L('Rel.', 'Util.', 'Util.')}</th>`
      + `<th>${L('Combinación', 'Combination', 'Combinação')}</th>`
      + `<th>${L('Residuo', 'Residual', 'Resíduo')}</th></tr></thead><tbody>`);
    for (const p of r.punching) {
      // An unverified joint prints an em dash for every quantity nobody measured. A 0 here
      // would read as a demand somebody computed and found to be nothing.
      const un = p.status === 'UNSUPPORTED';
      const axial = (v: number, present: boolean) => (un || !present ? '—' : n(v, 1));
      out.push(`<tr><td>#${p.columnElementId}</td><td>#${p.nodeId}</td>`
        + `<td class="${p.status === 'OK' ? 'ok' : 'bad'}">${esc(p.status)}</td>`
        + `<td>${esc(positionLabel(p.position, L))}`
        + (p.coverageDeg !== undefined ? ` (${n(p.coverageDeg, 0)}°)` : '')
        + '</td>'
        + `<td>${p.perimeter ? `${n(p.perimeter.bo, 3)} m` : '—'}</td>`
        + `<td>${axial(p.axialBelow, p.elementBelow !== null)}</td>`
        + `<td>${axial(p.axialAbove, p.elementAbove !== null)}</td>`
        + `<td>${un ? '—' : n(p.Vu, 1)}</td><td>${un ? '—' : n(p.phiVc, 1)}</td>`
        + `<td>${un ? '—' : n(p.utilization, 2)}</td>`
        + `<td>${esc(p.governingCombination ?? '—')}</td>`
        + `<td>${p.equilibriumResidual === null ? '—' : n(p.equilibriumResidual, 3)}</td>`
        + '</tr>');
    }
    out.push('</tbody></table>');
    out.push(`<p class="note">${L(
      'N en kN, compresión positiva, leídos en el extremo de columna que llega al nudo. '
      + 'Vu es la parte del salto axial que cruza el perímetro crítico: '
      + 'ΔN − (carga entregada directamente por vigas y nudo) − qu·A encerrada. '
      + 'El residuo es el cierre de ese cuerpo libre; un nudo que no puede establecerlo se '
      + 'informa como NO verificado y no como aprobado.',
      'N in kN, compression positive, read at the column end that meets the joint. Vu is the '
      + 'part of the axial step that crosses the critical perimeter: ΔN − (load delivered '
      + 'directly by beams and at the joint) − qu·A enclosed. The residual is the closure of '
      + 'that free body; a joint that cannot establish it is reported as NOT verified rather '
      + 'than as passing.',
      'N em kN, compressão positiva, lido na extremidade do pilar que encontra o nó. Vu é a parte do salto de axial que atravessa o perímetro crítico: ΔN − (carga entregue diretamente por vigas e no nó) − qu·A interna. O resíduo é o fechamento desse corpo livre; um nó que não consegue estabelecê-lo é reportado como NÃO verificado, e não como aprovado.',
    )}</p>`);

    // ── Every combination considered, per joint ──────────────────────
    //
    // The governing choice is a decision the design turns on, so the combinations that LOST
    // are printed too. A reader who cannot see them cannot check the one that won.
    const withContributions = r.punching.filter((p) => (p.contributions?.length ?? 0) > 0);
    if (withContributions.length > 0) {
      out.push(`<h4>${L('Punzonado — combinaciones consideradas',
        'Punching — combinations considered',
      'Punção — combinações consideradas',
    )}</h4>`);
      out.push('<table><thead><tr>'
        + `<th>${L('Nudo', 'Node', 'Nó')}</th><th>${L('Combinación', 'Combination', 'Combinação')}</th>`
        + `<th>N inf.</th><th>N sup.</th><th>ΔN</th>`
        + `<th>${L('Directa', 'Direct', 'Direta')}</th><th>qu·A</th>`
        + `<th>${L('M no bal.', 'Unbal. M', 'M desequil.')}</th>`
        + `<th>Vu</th><th>${L('Rel.', 'Util.', 'Util.')}</th>`
        + `<th>${L('Residuo', 'Residual', 'Resíduo')}</th></tr></thead><tbody>`);
      for (const p of withContributions) {
        for (const c of p.contributions ?? []) {
          const governs = c.combinationName === p.governingCombination;
          out.push(`<tr${governs ? ' class="ok"' : ''}><td>#${p.nodeId}</td>`
            + `<td>${esc(c.combinationName)}${governs ? ' ★' : ''}</td>`
            + `<td>${c.axialBelow === null ? '—' : n(c.axialBelow, 1)}</td>`
            + `<td>${c.axialAbove === null ? '—' : n(c.axialAbove, 1)}</td>`
            + `<td>${n(c.axialStep, 1)}</td>`
            + `<td>${n(c.directlyDelivered, 1)}</td>`
            + `<td>${n(c.loadInsidePerimeter, 1)}</td>`
            + `<td>${n(c.unbalancedMoment, 1)}</td>`
            + `<td>${n(c.Vu, 1)}</td><td>${n(c.utilization, 2)}</td>`
            + `<td>${n(c.equilibriumResidual, 3)}</td></tr>`);
        }
      }
      out.push('</tbody></table>');
      out.push(`<p class="note">${L(
        '★ marca la combinación gobernante. Fuerzas en kN, momentos en kN·m. '
        + 'Una fila con N inf. o N sup. en guion tiene esa cara del cuerpo libre abierta '
        + '(borde de piso), no una fuerza faltante.',
        '★ marks the governing combination. Forces in kN, moments in kN·m. A row with an em '
        + 'dash for N below or N above has that face of the free body open (a storey '
        + 'boundary), not a missing force.',
      '★ marca a combinação determinante. Forças em kN, momentos em kN·m. Uma linha com travessão em N abaixo ou N acima tem essa face do corpo livre aberta (um limite de pavimento), não uma força faltante.',
    )}</p>`);
    }
  }
  return out;
}

function wallDetail(
  r: Extract<FloorFamilyDesignRecord, { family: 'wall' }>,
  L: (es: string, en: string, pt: string) => string,
): string[] {
  const g = r.geometry;
  const out: string[] = ['<table><tbody>'];
  out.push(kv(L('Longitud × altura × espesor', 'Length × height × thickness', 'Comprimento × altura × espessura'),
    `${n(g.length, 2)} × ${n(g.height, 2)} × ${n(g.thickness, 3)} m`));
  out.push(kv(L('Cortinas', 'Curtains', 'Malhas'), String(r.reinforcement.curtains)));
  out.push(kv(L('Recubrimiento', 'Cover', 'Cobrimento'), `${n(g.cover * 1000, 0)} mm`));
  out.push('</tbody></table>');

  out.push(`<h4>${L('Solicitaciones', 'Demands', 'Solicitações')}</h4>`);
  out.push('<table><thead><tr>'
    + `<th>${L('Elemento', 'Member', 'Elemento')}</th><th>σxx</th><th>σyy</th><th>τxy</th>`
    + `<th>Pu</th><th>Mu</th><th>Vu</th>`
    + `<th>${L('Origen del momento', 'Moment source', 'Origem do momento')}</th></tr></thead><tbody>`);
  for (const d of r.demands) {
    out.push(`<tr><td>#${d.elementId}</td>`
      + `<td>${n(d.sigmaXx, 0)}</td><td>${n(d.sigmaYy, 0)}</td><td>${n(d.tauXy, 0)}</td>`
      + `<td>${n(d.pu, 1)}</td><td>${n(d.muInPlane, 1)}</td><td>${n(d.vuInPlane, 1)}</td>`
      // A membrane-only resolution gives ZERO in-plane moment, which is not a wall's real
      // demand. Named on the row rather than left for the reader to infer from a zero.
      + `<td class="${d.fromMembraneOnly ? 'bad' : ''}">${d.fromMembraneOnly
        ? L('sólo membrana — Mu no resuelto', 'membrane only — Mu unresolved', 'só membrana — Mu não resolvido')
        : L('fuerzas de elemento', 'element forces', 'forças dos elementos')}</td></tr>`);
  }
  out.push(`</tbody></table><p class="note">${L(
    'Tensiones en kPa; Pu y Vu en kN; Mu en kN·m.',
    'Stresses in kPa; Pu and Vu in kN; Mu in kN·m.',
      'Tensões em kPa; Pu e Vu em kN; Mu em kN·m.',
    )}</p>`);

  out.push(`<h4>${L('Resultados', 'Results', 'Resultados')}</h4><table><tbody>`);
  out.push(kv(L('Axial-flexión Pu / φMn', 'Axial-flexure Pu / φMn', 'Flexo-compressão Pu / φMn'),
    `${n(r.axialFlexure.pu, 1)} kN / ${n(r.axialFlexure.phiMn, 1)} kN·m `
    + `(${util(r.axialFlexure)})`));
  out.push(kv(L('Corte en el plano Vu / φVn', 'In-plane shear Vu / φVn', 'Cortante no plano Vu / φVn'),
    `${n(r.inPlaneShear.Vu, 1)} / ${n(r.inPlaneShear.phiVn, 1)} kN `
    + `(${util(r.inPlaneShear)})`));
  // §11.5.4.6: above the ceiling the wall fails by web crushing and horizontal steel does
  // not help. Stating it separately is what stops the report recommending a remedy that
  // would not work.
  out.push(kv(L('Techo de aplastamiento del alma (11.5.4.6)',
    'Web-crushing ceiling (11.5.4.6)',
      'Limite de esmagamento da alma (11.5.4.6)',
    ),
  `${n(r.inPlaneShear.webCrushingLimit, 1)} kN — `
    + (r.inPlaneShear.webCrushingGoverns
      ? L('GOBIERNA: agregar armadura horizontal no ayuda',
        'GOVERNS: adding horizontal steel does not help',
      'GOVERNA: acrescentar aço horizontal não ajuda',
    )
      : L('no gobierna', 'does not govern', 'não governa'))));
  out.push(kv(L('Vertical', 'Vertical', 'Vertical'),
    `Ø${r.reinforcement.verticalDiameterMm} c/${n(r.reinforcement.verticalSpacing * 1000, 0)} mm `
    + `(ρ ${n(r.reinforcement.rhoVertical, 4)}, ${esc(r.reinforcement.verticalGovernedBy)})`));
  out.push(kv(L('Horizontal', 'Horizontal', 'Horizontal'),
    `Ø${r.reinforcement.horizontalDiameterMm} c/${n(r.reinforcement.horizontalSpacing * 1000, 0)} mm `
    + `(ρ ${n(r.reinforcement.rhoHorizontal, 4)}, ${esc(r.reinforcement.horizontalGovernedBy)})`));
  out.push(kv(L('Barras físicas', 'Physical bars', 'Barras físicas'), String(r.reinforcement.barIds.length)));
  out.push(kv(L('Elemento de borde', 'Boundary element', 'Elemento de borda'),
    r.boundaryElement === null
      ? L('no evaluado', 'not evaluated', 'não avaliado')
      : r.boundaryElement.required
        ? (r.boundaryElement.detailing
          ? `${L('requerido', 'required', 'exigido')} — ${n(r.boundaryElement.detailing.lengthM, 2)} m`
          : L('REQUERIDO — despiece NO implementado', 'REQUIRED — detailing NOT implemented', 'EXIGIDO — detalhamento NÃO implementado'))
        : L('no requerido', 'not required', 'não exigido')));
  out.push('</tbody></table>');
  return out;
}

// ─── DXF ───

export interface DrawingSet {
  /** `caption`: what the drawing shows, short and in the set's language (the sheet set's caption
   *  and index). The sheet's own `title` keeps the project and the readiness banner. */
  sheets: Array<{ name: string; caption?: string; sheet: Sheet; dxf: string; svg: string }>;
  /** All sheets concatenated into one DXF. */
  dxf: string;
  /**
   * What this set covers, and what it does not.
   *
   * ── Why a set has to declare its own gaps ──────────────────────
   *
   * A drawing set that omits a family looks exactly like a drawing set that had none: 128
   * sheets arrive, every mark reconciles, and nothing says that no sheet frames a whole
   * storey or details a single column. The reviewer's only way to find out is to look for a
   * sheet that was never going to be there.
   *
   * So the set states it. `families` is what reached a sheet; `missingSheetKinds` is what
   * this renderer does not produce at all, named rather than left as an absence.
   */
  coverage: DrawingCoverage;
}

/** A family's presence in a drawing set. */
export interface DrawingFamilyCoverage {
  family: 'beam' | 'column' | 'slab' | 'wall' | 'footing';
  /** Members or panels of this family in the document. */
  inDocument: number;
  /** How many of them a sheet actually draws. */
  drawn: number;
  /** Sheets that carry them, by name prefix. */
  sheets: number;
}

export interface DrawingCoverage {
  families: DrawingFamilyCoverage[];
  /**
   * Sheet kinds this renderer does not produce.
   *
   * Stated so a set is never mistaken for complete. These are absences of a DRAWING TYPE, not
   * of data: the geometry exists in the document and in the 3-D view, and no sheet frames it.
   */
  missingSheetKinds: string[];
}

/**
 * Sheet kinds the renderer does not produce, whatever the model contains.
 *
 * Measured on the 7-storey building: 128 sheets came out — 15 assembly elevations, 57 sections
 * and 56 per-panel slab plans — and every mark in them reconciled with the 3-D view and the
 * schedule. What no sheet shows is a whole storey in one plan, a horizontal cut through the
 * building, or one column on its own sheet.
 */
/**
 * Sheet kinds the renderer does not produce, whatever the model contains.
 *
 * Now empty. The four that used to be here — general plan, level plan, horizontal section and
 * column detail — are built by `structure-drawings.ts` from the `SceneModel`, the same
 * projection the 3-D view renders, so a plan and the viewport cannot show different steel.
 *
 * The constant stays, and stays exported, because the honest statement it makes is worth more
 * than the list it currently holds: a set that cannot say what it omits is a set nobody can
 * check. The next kind that is asked for and not built belongs here.
 */
export const MISSING_SHEET_KINDS: readonly string[] = [];

/**
 * Elevations for every beam line, a section per assembly, and the conflict annotations.
 *
 * The bars drawn are the model's FINAL BarPaths — after fusion and lap materialisation —
 * so the drawing shows the steel that will be placed rather than the steel the generator
 * first proposed.
 */
export function renderDrawings(doc: DocumentModel, opts: RenderOptions): DrawingSet {
  const sheets: DrawingSet['sheets'] = [];
  let n = 0;

  for (const a of doc.assemblies) {
    /**
     * An assembly with no steel still gets drawn IF it carries design records.
     *
     * The guard used to be `bars.length === 0 → skip`, which is right for an undetailed beam
     * line — there is nothing to draw. It was wrong for a footing whose soil states no
     * capacity: that footing has real dimensions, a real founding level and a real reason it
     * could not be verified, and it produced no bars, so it produced no sheet. The one
     * foundation an engineer most needs a drawing of was the only one without one.
     */
    if (a.bars.length === 0 && a.families.length === 0) continue;

    if (a.bars.length > 0) {
      sheets.push(...elevationAndSection(doc, a, opts, () => (n += 1)));
    }

    // ── Per-footing plan and sections ────────────────────────────────
    //
    // The generic elevation frames an assembly by its longest bar. For a beam line that IS the
    // beam; for a pad footing the longest bar is a dowel, so the sheet came out looking down
    // the column with the base outline drawn round the dowel cage — and the plan an engineer
    // actually needs, B × L with the mat across it, did not exist.
    //
    // Same `Sheet` type, same `sheetToDxf` and `sheetToSvg`, so the preview and the DXF are
    // two renderings of ONE drawing model rather than two drawings of one footing.
    for (const rec of a.families) {
      if (rec.family !== 'footing') continue;
      const own = a.bars.filter((b) => rec.barIds.includes(b.id));
      n += 1;
      for (const { kind, sheet } of drawFooting({
        record: rec,
        assembly: a.source,
        // This record's own steel. Passing the floor's would draw a neighbouring footing's
        // dowels inside this one's outline.
        bars: own,
        centre: footingPlanCentre(rec, own),
        clauses: doc.refs,
        sheetNumber: `R${doc.revision.number}-${n}`,
        title: `${opts.projectName} — ${rec.geometry.name} — ${readinessBanner(doc, opts.locale)}`,
      })) {
        // Plan and section each project onto axes this module chose, so the arcs come from the
        // matching projection rather than from the elevation's.
        const proj: Projection = kind === 'plan'
          ? { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, origin: { x: 0, y: 0, z: 0 } }
          : kind === 'sectionB'
            ? { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, origin: { x: 0, y: 0, z: 0 } }
            : { right: { x: 0, y: 1, z: 0 }, up: { x: 0, y: 0, z: 1 }, origin: { x: 0, y: 0, z: 0 } };
        sheets.push({
          name: `${a.id}-${rec.geometry.name}-${kind}`,
          caption: teAt({ key: 'drawing.cap.of', params: { what: rec.geometry.name, kind: { key: `drawing.cap.kind.${kind}` } } }, opts.locale),
          sheet,
          dxf: sheetToDxf(sheet, own.flatMap((b) => barArcs(b, proj)), opts.locale),
          svg: sheetToSvg(sheet, 900, opts.locale),
        });
      }
    }

    // ── Per-slab plan and per-wall elevation + section ───────────────
    //
    // Same treatment, and for the same reason the footing got its own sheets: the generic
    // elevation frames a floor assembly by its longest bar, which in a coordinated floor may
    // be a wall vertical or a footing dowel, so the plan a slab needs and the elevation a wall
    // needs did not exist. A reader holding the footing's three sheets could reasonably assume
    // every family had them.
    //
    // The projections are chosen HERE per sheet kind, so the bar arcs come from the matching
    // projection rather than from the elevation's. A wall's is its own in-plane direction: a
    // wall running along y projected onto global x would collapse to zero width.
    for (const rec of a.families) {
      if (rec.family === 'slab') {
        const own = a.bars.filter((b) => rec.barIds.includes(b.id));
        n += 1;
        for (const { kind, sheet } of drawSlab({
          record: rec,
          assembly: a.source,
          bars: own,
          clauses: doc.refs,
          sheetNumber: `R${doc.revision.number}-${n}`,
          title: `${opts.projectName} — ${rec.geometry.panelId} — ${readinessBanner(doc, opts.locale)}`,
        })) {
          const proj: Projection = {
            right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 },
            origin: { x: 0, y: 0, z: 0 },
          };
          sheets.push({
            name: `${a.id}-${rec.geometry.panelId}-${kind}`,
            caption: teAt({ key: 'drawing.cap.of', params: { what: rec.geometry.panelId, kind: { key: `drawing.cap.kind.${kind}` } } }, opts.locale),
            sheet,
            dxf: sheetToDxf(sheet, own.flatMap((b) => barArcs(b, proj)), opts.locale),
            svg: sheetToSvg(sheet, 900, opts.locale),
          });
        }
        continue;
      }
      if (rec.family !== 'wall') continue;
      const own = a.bars.filter((b) => rec.barIds.includes(b.id));
      n += 1;
      const g = rec.geometry;
      const dx = g.end.x - g.start.x;
      const dy = g.end.y - g.start.y;
      const len = Math.hypot(dx, dy) || 1;
      const along = { x: dx / len, y: dy / len, z: 0 };
      // The wall's own normal in plan — the axis its horizontal section is drawn against.
      const across = { x: -dy / len, y: dx / len, z: 0 };
      for (const { kind, sheet } of drawWall({
        record: rec,
        assembly: a.source,
        bars: own,
        clauses: doc.refs,
        sheetNumber: `R${doc.revision.number}-${n}`,
        title: `${opts.projectName} — ${g.wallId} — ${readinessBanner(doc, opts.locale)}`,
      })) {
        const proj: Projection = kind === 'elevation'
          ? { right: along, up: { x: 0, y: 0, z: 1 }, origin: { ...g.start } }
          : { right: along, up: across, origin: { ...g.start } };
        sheets.push({
          name: `${a.id}-${g.wallId}-${kind}`,
          caption: teAt({ key: 'drawing.cap.of', params: { what: g.wallId, kind: { key: `drawing.cap.kind.${kind}` } } }, opts.locale),
          sheet,
          dxf: sheetToDxf(sheet, own.flatMap((b) => barArcs(b, proj)), opts.locale),
          svg: sheetToSvg(sheet, 900, opts.locale),
        });
      }
    }
  }

  /**
   * The structure-wide sheets, from the scene.
   *
   * Appended rather than woven in, because they answer a different question from the rest: the
   * elevations and sections describe one assembly each, and these describe the building.
   */
  const structural = opts.scene
    ? structureSheets(doc, opts.scene, opts, () => (n += 1))
    : [];
  sheets.push(...structural);

  return {
    sheets,
    // One file a CAD program reads whole: one header, every sheet, one EOF.
    dxf: combineDxfSheets(sheets),
    coverage: {
      ...coverageOf(doc, sheets),
      missingSheetKinds: opts.scene
        ? [...MISSING_SHEET_KINDS]
        // Named, not silently absent: this set does not contain them and says which.
        : ['generalPlan', 'levelPlan', 'horizontalSection', 'columnDetail'],
    },
  };
}

/** The four structure-wide sheets, built from the scene the 3-D view renders. */
function structureSheets(
  doc: DocumentModel, scene: SceneModel, opts: RenderOptions, nextN: () => number,
): DrawingSet['sheets'] {
  const statusOf = opts.statusOf ?? (() => undefined);
  const out: DrawingSet['sheets'] = [];
  const emit = (name: string, sheet: Sheet, caption: string) => {
    out.push({
      name, caption, sheet,
      dxf: sheetToDxf(sheet, [], opts.locale),
      svg: sheetToSvg(sheet, 1200, opts.locale),
    });
  };
  // The label in the set's language: these were written in Spanish whatever the locale.
  const cap = (key: string, params?: Record<string, string>) => teAt({ key: `drawing.cap.${key}`, ...(params ? { params } : {}) }, opts.locale);
  const titleFor = (label: string) => buildTitleBlock({
    sheetNumber: `R${doc.revision.number}-${nextN()}`,
    title: `${opts.projectName} — ${label} — ${readinessBanner(doc, opts.locale)}`,
    assembly: doc.assemblies[0]?.source as never,
    clauses: doc.refs,
  });

  const general = cap('generalPlan');
  emit('structure-general-plan',
    drawGeneralPlan({ scene, title: titleFor(general), statusOf }), general);

  const levels = levelsOf(scene);
  for (const level of levels) {
    const c = cap('levelPlan', { z: level.z.toFixed(2) });
    emit(`structure-level-${level.z.toFixed(2)}-plan`,
      drawLevelPlan({ scene, title: titleFor(c), statusOf, level }), c);
  }

  /**
   * One horizontal section per storey by default, cut just below the level.
   *
   * Cutting AT the level would land in the slab and show its mat rather than the columns
   * passing through, which is the thing a horizontal section is usually asked for.
   */
  const cuts = opts.sectionElevations ?? levels.map((l) => l.z - 0.5);
  for (const z of cuts) {
    const c = cap('horizontalSection', { z: z.toFixed(2) });
    emit(`structure-section-z${z.toFixed(2)}`,
      drawHorizontalSection({ scene, title: titleFor(c), statusOf, atZ: z }), c);
  }

  for (const s of scene.solids) {
    if (s.kind !== 'column' || s.elementIds.length === 0) continue;
    const id = s.elementIds[0];
    const c = cap('column', { id: String(id) });
    emit(`structure-column-${id}-detail`,
      drawColumnDetail({ scene, title: titleFor(c), statusOf, elementId: id }), c);
  }

  // Across assemblies, from the same bars: frame lines, column stacks and joints.
  for (const line of frameLines(scene)) {
    const c = cap('frame', { id: line.id });
    emit(`structure-${line.id}-elevation`, drawFrameElevation({ scene, title: titleFor(c), statusOf, line }), c);
  }
  for (const stack of columnStacks(scene)) {
    const c = cap('stack', { id: stack.id });
    emit(`structure-${stack.id}-elevation`, drawColumnStack({ scene, title: titleFor(c), statusOf, stack }), c);
  }
  for (const joint of joints(scene)) {
    const c = cap('joint', { id: joint.id });
    emit(`structure-${joint.id}-detail`, drawJointDetail({ scene, title: titleFor(c), statusOf, joint }), c);
  }

  return out;
}

/**
 * What the sheets actually reached, counted against the document.
 *
 * Counted from the DOCUMENT rather than from the sheets alone, because the question a
 * reviewer has is "did everything get drawn", and only the document knows what everything is.
 */
function coverageOf(doc: DocumentModel, sheets: DrawingSet['sheets']): DrawingCoverage {
  const families: DrawingFamilyCoverage[] = [];

  for (const family of ['slab', 'wall', 'footing'] as const) {
    const records = doc.assemblies.flatMap((a) => a.families).filter((r) => r.family === family);
    const owned = sheets.filter((s) => records.some((r) => s.name.includes(r.ownerId)));
    families.push({
      family,
      inDocument: records.length,
      drawn: new Set(owned.flatMap((s) =>
        records.filter((r) => s.name.includes(r.ownerId)).map((r) => r.ownerId))).size,
      sheets: owned.length,
    });
  }

  /**
   * Beams and columns share their assembly's elevation and section.
   *
   * There is no per-member sheet for either, so `drawn` counts the members whose assembly
   * produced a sheet — which is the honest statement: the member IS on a drawing, and it does
   * not have one of its own. `columnDetail` in `missingSheetKinds` says the second part.
   */
  const assemblyDrawn = new Set(
    doc.assemblies.filter((a) => sheets.some((s) => s.name.startsWith(a.id))).map((a) => a.id));
  for (const family of ['beam', 'column'] as const) {
    let inDoc = 0;
    let drawn = 0;
    for (const a of doc.assemblies) {
      // A frame assembly's members are its `elementIds`; family split is not recorded here,
      // so both rows report the assembly population rather than inventing a split.
      if (a.families.length > 0) continue;
      inDoc += a.elementIds.length;
      if (assemblyDrawn.has(a.id)) drawn += a.elementIds.length;
    }
    families.push({
      family, inDocument: inDoc, drawn,
      sheets: sheets.filter((s) => assemblyDrawn.has(s.name.split('-')[0])).length,
    });
  }

  return { families, missingSheetKinds: [...MISSING_SHEET_KINDS] };
}

/** The generic elevation and section for an assembly that has steel. */
function elevationAndSection(
  doc: DocumentModel, a: DocumentAssembly, opts: RenderOptions, nextN: () => number,
): DrawingSet['sheets'] {
  const sheets: DrawingSet['sheets'] = [];
  if (opts.members) return memberSheets(doc, a, opts, opts.members, nextN);
  {
    // Sheet numbers come from the CALLER's running counter, so an elevation, a section and a
    // footing plan in the same document never share a number.
    let n = nextN() - 1;

    // Plan axis of this assembly, from its own steel: the direction its longest bar runs.
    const longest = a.bars.reduce((m, b) => (b.cuttingLength > m.cuttingLength ? b : m), a.bars[0]);
    const s0 = longest.segments[0].start;
    const e0 = longest.segments[longest.segments.length - 1].end;
    const d = { x: e0.x - s0.x, y: e0.y - s0.y, z: 0 };
    const len = Math.hypot(d.x, d.y) || 1;
    const right = { x: d.x / len, y: d.y / len, z: 0 };
    const projection: Projection = { right, up: { x: 0, y: 0, z: 1 }, origin: s0 };

    // Member outline: the bounding box of the steel, which is what an elevation needs to
    // frame it. Section geometry proper belongs to the member and is drawn from it below.
    const xs = a.bars.flatMap((b) => b.segments.flatMap((sg) => [sg.start, sg.end]));
    const proj1 = (p: typeof s0) =>
      (p.x - s0.x) * right.x + (p.y - s0.y) * right.y;
    const zs = xs.map((p) => p.z);
    const us = xs.map(proj1);
    const notes = [
      readinessBanner(doc, opts.locale),
      ...doc.openConflicts
        .filter((c) => c.assemblyId === a.id)
        .map((c) => conflictNote(c, opts.locale)),
    ];

    /*
      The hand-edit statement, ON the drawing.

      §4 asks every EXPORT to state its retouched members, and a DXF that carried it only in
      the file name would not be carrying it: the sheet is what gets printed and pinned up. It
      goes in the note block with the readiness and the conflicts, which is where a reader
      already looks for what this drawing cannot promise.
    */
    const retouch = retouchNote(opts.retouched, opts.locale);

    /*
      And the scope, in the same note block and for the same reason.

      The schedule gets it through `readinessBanner` in its title; the report prints the banner
      at the head. A DXF sheet has neither, and it is the output most likely to reach a site on
      its own — so the one line that says which families this set covers has to be ON it.
    */
    const scopeNote = scopeStatement(doc, opts.locale);
    const sheetNotes = [scopeNote, ...(retouch ? [retouch] : [])];

    n += 1;
    const elevation = drawElevation({
      assembly: a.source,
      extraNotes: sheetNotes,
      outlines: [{
        points: [
          { x: s0.x, y: s0.y, z: Math.min(...zs) },
          { x: s0.x + right.x * Math.max(...us), y: s0.y + right.y * Math.max(...us), z: Math.min(...zs) },
          { x: s0.x + right.x * Math.max(...us), y: s0.y + right.y * Math.max(...us), z: Math.max(...zs) },
          { x: s0.x, y: s0.y, z: Math.max(...zs) },
        ],
        closed: true,
      }],
      projection,
      clauses: doc.refs,
      sheetNumber: `R${doc.revision.number}-${n}`,
      // Readiness and every open conflict go ON the drawing, not beside it.
      title: `${opts.projectName} — ${notes.join(' | ')}`,
    });
    const arcs = a.bars.flatMap((b) => barArcs(b, projection));
    sheets.push({
      name: `${a.id}-elevation`,
      caption: teAt({ key: 'drawing.cap.of', params: { what: a.label, kind: { key: 'drawing.cap.kind.elevation' } } }, opts.locale),
      sheet: elevation,
      dxf: sheetToDxf(elevation, arcs, opts.locale),
      svg: sheetToSvg(elevation, 1200, opts.locale),
    });

    n += 1;
    // Without the members' geometry the concrete at the cut is not known: the steel box above
    // is a plan-view frame, and drawn here it stood in another plane than the bars.
    const section = drawSection({
      assembly: a.source,
      atX: (Math.min(...us) + Math.max(...us)) / 2,
      outline: [],
      extraNotes: [teAt({ key: 'detailing.sheet.noOutline', params: { x: ((Math.min(...us) + Math.max(...us)) / 2).toFixed(2) } }, opts.locale)],
      projection,
      clauses: doc.refs,
      sheetNumber: `R${doc.revision.number}-${n}`,
      title: `${opts.projectName} — ${readinessBanner(doc, opts.locale)}`,
    } as never);
    // The SECTION carries its arcs too.
    //
    // It was emitting an empty arc list, which is where the cage is most legible: a stirrup
    // read in elevation is a line, and read in section it is the closed loop with the bends
    // and hook tails an engineer checks. Measuring those off a chord-only DXF reads the
    // corner short by the sagitta, which is the same class of error the collision sampler
    // had — the drawing and the check must not disagree about where the steel bends.
    const sectionArcs = a.bars.flatMap((b) => barArcs(b, projection));
    sheets.push({
      name: `${a.id}-section`,
      caption: teAt({ key: 'drawing.cap.of', params: { what: a.label, kind: { key: 'drawing.cap.kind.section' } } }, opts.locale),
      sheet: section,
      dxf: sheetToDxf(section, sectionArcs, opts.locale),
      svg: sheetToSvg(section, 800, opts.locale),
    });

  }
  return sheets;
}

/**
 * Where the footing sits in plan.
 *
 * The record snapshots the footing's DIMENSIONS but not the supported node's coordinates —
 * the node is model data, and a record that copied it would hold a second copy of a value the
 * model owns. So the centre is recovered from the dowels, which are generated at the column
 * centre by construction.
 *
 * With no dowels there is nothing to recover it from, and the origin is used. That is honest
 * rather than convenient: a footing with no dowels has no column bars, which the record
 * already reports as an unsupported condition, and a plan drawn at the origin is visibly
 * wrong rather than subtly displaced.
 */
function conflictNote(c: OpenConflict, locale: string): string {
  const es = locale.startsWith('es');
  return es
    ? `CONFLICTO ${c.pairClass}: ${c.barIds[0]}/${c.barIds[1]} en elementos ${c.elementIds.join(',')} `
      + `— medido ${Math.round(c.clearance * 1000)} mm, requerido ${Math.round(c.required * 1000)} mm`
    : `CONFLICT ${c.pairClass}: ${c.barIds[0]}/${c.barIds[1]} in members ${c.elementIds.join(',')} `
      + `— measured ${Math.round(c.clearance * 1000)} mm, required ${Math.round(c.required * 1000)} mm`;
}

// ─── XLSX ───

/**
 * The bar schedule, as a sheet-per-assembly array of arrays.
 *
 * Marks, diameter, shape, cutting length, count, mass, member and joint references, lap
 * data, revision and maturity — all read off the model, none recomputed.
 */
export function renderSchedule(
  doc: DocumentModel, opts: RenderOptions,
): Array<{ name: string; aoa: (string | number)[][] }> {
  const es = opts.locale.startsWith('es');
  const pt = opts.locale.startsWith('pt');
  // Spanish, English and Portuguese, each in its own words: Portuguese used to get the English.
  const L = (a: string, b: string, c: string) => (es ? a : pt ? c : b);
  const density = opts.steelDensity ?? DEFAULTS.steelDensity;
  const out: Array<{ name: string; aoa: (string | number)[][] }> = [];

  for (const a of doc.assemblies) {
    // The assembly's OWN marks, from `assignMarks`. Rebuilding them here would be a
    // second mark scheme that could disagree with the one on the drawings — the exact
    // drift the DocumentModel exists to prevent. A fused bar is already one mark of its
    // true cutting length because materialisation happened before marking.
    const marks = a.source.marks;

    const table = buildSchedule(marks, opts.stockLength ?? DEFAULTS.stockLength);
    // The schedule's title block is this assembly's own, so the sheet number, revision and
    // clause list on the spreadsheet match the ones on its drawings.
    const aoa = scheduleToAoa(table, buildTitleBlock({
      sheetNumber: `R${doc.revision.number}`,
      title: `${opts.projectName} — ${readinessBanner(doc, opts.locale)}`,
      assembly: a.source,
      clauses: doc.refs,
    }), opts.locale);

    /*
      The hand-edit statement, at the head of the sheet.

      Row 3 and not the note block at the bottom: a workbook is scrolled, and somebody ordering
      steel from row 40 never sees a footnote under row 200. It is the same sentence the report
      and the drawings carry, from `retouchNote`, so the three cannot disagree about it.
    */
    const retouch = retouchNote(opts.retouched, opts.locale);
    if (retouch) aoa.splice(3, 0, [retouch]);

    // The references a fabricator needs to place the bar, appended to the standard table:
    // which members it belongs to, and which layer it sits in.
    const barById = new Map(a.bars.map((b) => [b.id, b]));
    const header = aoa.findIndex((r) =>
      typeof r[0] === 'string' && /^(marca|mark)$/i.test(String(r[0]).trim()));
    const torsionMembers = new Set(a.source.torsionUnevaluatedMembers ?? []);
    if (header >= 0) {
      aoa[header] = [...aoa[header],
        L('Masa (kg)', 'Mass (kg)', 'Massa (kg)'), L('Elementos', 'Members', 'Elementos'), L('Capa', 'Layer', 'Camada'),
        // A column, not a footnote. A schedule is read row by row by somebody ordering
        // steel, and a warning that lives only in the note block is a warning that is not
        // beside the bar they are about to order.
        L('Estado', 'Status', 'Estado')];
      for (let i = 0; i < marks.length; i++) {
        const row = aoa[header + 1 + i];
        if (!row) break;
        const m = marks[i];
        const bars = m.barIds.map((id) => barById.get(id)).filter(Boolean);
        const first = bars[0];
        const members = [...new Set(m.barIds
          .flatMap((id) => barById.get(id)?.ownerElementIds ?? []))].sort((x, y) => x - y);
        const area = Math.PI * (m.diameterMm / 2000) ** 2;
        const provisional = bars.some((b) => b?.provisional);
        /**
         * A bar is flagged when ANY member it runs through has unevaluated torsion.
         *
         * The same rule the provisional flag uses, and for the same reason: a bar continuous
         * over a support is fabricated once, and a schedule row that says nothing because only
         * one of its two members is affected is a row that misleads the person ordering it.
         */
        const torsion = members.some((id) => torsionMembers.has(id));
        // Both, when both. Two independent gaps in the verification are not one warning, and a
        // row that reported only the first would let the second reach site unnoticed.
        const status = [
          provisional
            ? L('PROVISIONAL — no apto para emisión', 'PROVISIONAL — not for issue', 'PROVISÓRIO — não emitir')
            : '',
          torsion
            ? L('TORSIÓN NO EVALUADA', 'TORSION NOT EVALUATED', 'TORÇÃO NÃO AVALIADA')
            : '',
        ].filter(Boolean).join(' · ');
        aoa[header + 1 + i] = [...row,
          m.massKg > 0
            ? Math.round(m.massKg * 1000) / 1000
            : Math.round(area * m.cuttingLength * m.quantity * density * 1000) / 1000,
          members.join(', '),
          first?.layerId ?? '',
          status];
      }
    }

    /**
     * The sheet-level statement, above the rows and not only beside them.
     *
     * The per-row column answers "is THIS bar a proposal". It does not answer "may I order
     * from this schedule at all", and that is the question somebody printing it is asking.
     */
    const provisionalMembers = a.source.provisionalMembers ?? [];
    if (provisionalMembers.length > 0) {
      aoa.splice(1, 0, [L(
        `PROPUESTA PROVISIONAL — NO APTO PARA EMISIÓN CONSTRUCTIVA. ${provisionalMembers.length} `
        + `elemento(s): ${provisionalMembers.join(', ')}. Eje secundario sin verificar.`,
        `PROVISIONAL PROPOSAL — NOT VALID FOR CONSTRUCTION. ${provisionalMembers.length} `
        + `member(s): ${provisionalMembers.join(', ')}. Secondary axis unverified.`,
      `PROPOSTA PROVISÓRIA — NÃO VÁLIDA PARA CONSTRUÇÃO. ${provisionalMembers.length} elemento(s): ${provisionalMembers.join(', ')}. Eixo secundário não verificado.`,
    )]);
    }
    if (torsionMembers.size > 0) {
      // After the provisional line when both are present, so the strongest statement — "not
      // valid for construction" — stays the first thing on the sheet.
      const ids = [...torsionMembers].sort((x, y) => x - y);
      aoa.splice(provisionalMembers.length > 0 ? 2 : 1, 0, [L(
        `TORSIÓN NO EVALUADA — función en desarrollo. ${ids.length} elemento(s): `
        + `${ids.join(', ')}. Esta armadura no contempla torsión; no usar como verificación `
        + 'final.',
        `TORSION NOT EVALUATED — feature in development. ${ids.length} member(s): `
        + `${ids.join(', ')}. This reinforcement does not account for torsion; do not use as a `
        + 'final verification.',
      `TORÇÃO NÃO AVALIADA — função em desenvolvimento. ${ids.length} elemento(s): ${ids.join(', ')}. Esta armadura não considera a torção; não usar como verificação final.`,
    )]);
    }

    // Laps get their own block: the fabricator has to know a bar is spliced, not merely
    // that two bars exist.
    if (a.laps.length > 0) {
      aoa.push([]);
      aoa.push([L('EMPALMES', 'LAPS', 'EMENDAS')]);
      aoa.push([L('Nudo', 'Joint', 'Nó'), L('Desde', 'From', 'De'), L('Hasta', 'To', 'Até'),
        L('Tipo', 'Kind', 'Tipo'), L('Clase', 'Class', 'Classe'), L('Longitud (mm)', 'Length (mm)', 'Comprimento (mm)')]);
      for (const l of a.laps) {
        aoa.push([l.jointId, l.fromBarId, l.toBarId, l.kind, l.spliceClass,
          Math.round(l.lapLength * 1000)]);
      }
    }

    // ── Floor-family blocks, from the records and the marked assembly ──────────
    //
    // The bar rows above already cover slab, wall, footing, dowel and tie steel: they come
    // from `a.source.marks`, which is `assignMarks` over the assembly's own bars, and a
    // footing's dowels are bars in that list like any other. What is added here is the
    // per-family EVIDENCE a fabricator and a checker need beside the quantities — which
    // record each mark belongs to, and whether its certificate still applies.
    if (a.families.length > 0) {
      aoa.push([]);
      aoa.push([L('FAMILIAS DE PISO', 'FLOOR FAMILIES', 'FAMÍLIAS DE PISO')]);
      aoa.push([L('Familia', 'Family', 'Família'), L('Elemento', 'Member', 'Elemento'), L('Estado', 'Status', 'Estado'),
        L('Madurez', 'Maturity', 'Maturidade'), L('Certificado', 'Certificate', 'Certificado'),
        L('Vigencia', 'Applies', 'Aplica'), L('Marcas', 'Marks', 'Marcas'), L('Barras', 'Bars', 'Barras'),
        L('Rev. análisis', 'Rev. analysis', 'Rev. análise'), L('Rev. cargas', 'Rev. loads', 'Rev. cargas'),
        L('Rev. reglamento', 'Rev. regulation', 'Rev. regulamento'), L('Rev. entidad', 'Rev. entity', 'Rev. entidade')]);
      for (const r of a.families) {
        const cert = a.familyCertificates.find((c) => c.ownerId === r.ownerId);
        aoa.push([r.family, r.ownerId, r.status, r.maturity,
          r.certificate.status, cert?.freshness ?? '',
          r.markIds.join(', '), r.barIds.length,
          r.revisions.analysis, r.revisions.loads,
          r.revisions.regulation, r.revisions.entity]);
      }

      // Every check, so the spreadsheet carries the same verification statement the report
      // does. A schedule that lists quantities without their verification state is how a
      // fabricator comes to build an unverified footing.
      aoa.push([]);
      aoa.push([L('VERIFICACIONES POR FAMILIA', 'FAMILY CHECKS', 'VERIFICAÇÕES DE FAMÍLIA')]);
      aoa.push([L('Elemento', 'Member', 'Elemento'), L('Verificación', 'Check', 'Verificação'), L('Estado', 'Status', 'Estado'),
        L('Utilización', 'Utilisation', 'Utilização'), L('Combinación', 'Combination', 'Combinação')]);
      for (const r of a.families) {
        for (const c of r.checks) {
          aoa.push([r.ownerId, c.key, c.status,
            c.utilization === null ? '' : c.status === 'UNSUPPORTED' ? 'N.E.' : Math.round(c.utilization * 1000) / 1000,
            c.governingCombination ?? '']);
        }
      }

      // Footing quantities and ground provenance: the columns a site engineer reads before
      // pouring, and the one figure in the whole document that has no regulatory source.
      const footings = a.families.filter((r) => r.family === 'footing');
      if (footings.length > 0) {
        aoa.push([]);
        aoa.push([L('ZAPATAS', 'FOOTINGS', 'SAPATAS')]);
        aoa.push([L('Zapata', 'Footing', 'Sapata'), 'B (m)', 'L (m)', 'h (m)', 'd (m)',
          L('Cota', 'Level', 'Nível'), L('Estrato', 'Stratum', 'Estrato'),
          L('q adm (kPa)', 'q allow (kPa)', 'q adm (kPa)'), L('Procedencia', 'Provenance', 'Procedência'),
          L('Referencia', 'Reference', 'Referência'), L('Combinación', 'Combination', 'Combinação'),
          L('Nu (kN)', 'Nu (kN)', 'Nu (kN)'), L('N serv (kN)', 'N serv (kN)', 'N serv (kN)'),
          L('qmax (kPa)', 'qmax (kPa)', 'qmax (kPa)'), L('Contacto parcial', 'Partial contact', 'Contato parcial'),
          L('Mu (kN·m)', 'Mu (kN·m)', 'Mu (kN·m)'), L('Util. corte', 'Shear util.', 'Util. cortante'),
          L('Util. punzonado', 'Punching util.', 'Util. punção'), L('Residuo equil. (kN)', 'Equil. residual (kN)', 'Resíduo de equil. (kN)'),
          L('Pelos', 'Dowels', 'Arranques'), L('Estribos arranque', 'Starter ties', 'Estribos de arranque')]);
        for (const r of footings) {
          if (r.family !== 'footing') continue;
          const g = r.geometry;
          aoa.push([
            g.name, g.B, g.L, g.thickness, g.d, g.foundingElevation,
            r.ground?.name ?? '',
            // Blank, never zero: an unstated allowable pressure is not 0 kPa, and a
            // spreadsheet cell containing 0 would be read as a number somebody measured.
            r.ground?.allowableBearingKPa ?? '',
            r.ground?.source ?? '', r.ground?.reference ?? '',
            r.demand?.governingCombination ?? '',
            r.demand?.factoredAxial ?? '', r.demand?.serviceAxial ?? '',
            r.bearing?.qMax ?? '',
            r.bearing ? (r.bearing.uplift ? L('SÍ', 'YES', 'SIM') : L('no', 'no', 'não')) : '',
            r.flexure?.Mu ?? '',
            // N.E., never 0, for a check that was not evaluated (UNSUPPORTED carries utilization 0).
            r.oneWayShear ? (r.oneWayShear.status === 'UNSUPPORTED' ? 'N.E.' : r.oneWayShear.utilization) : '',
            r.punching ? (r.punching.status === 'UNSUPPORTED' ? 'N.E.' : r.punching.utilization) : '',
            r.punching?.equilibriumResidual ?? '',
            r.dowels ? `${r.dowels.count} Ø${r.dowels.diameterMm}` : '',
            r.starterTies ? `${r.starterTies.pieces} Ø${r.starterTies.diameterMm}` : '',
          ]);
        }
      }

      // ── Slab–column punching, joint by joint ─────────────────────────
      //
      // Its own block rather than a column on the family row, because a panel can support
      // several columns and a single row could only report one of them — or, worse, average
      // them into a figure that belongs to no joint.
      const slabJoints = a.families.flatMap((r) =>
        r.family === 'slab' ? r.punching.map((p) => ({ ownerId: r.ownerId, p })) : []);
      if (slabJoints.length > 0) {
        aoa.push([]);
        aoa.push([L('PUNZONADO LOSA-COLUMNA', 'SLAB-COLUMN PUNCHING', 'PUNÇÃO LAJE-PILAR')]);
        aoa.push([L('Paño', 'Panel', 'Painel'), L('Nudo', 'Node', 'Nó'), L('Columna', 'Column', 'Pilar'),
          L('Col. inferior', 'Col. below', 'Pilar abaixo'), L('Col. superior', 'Col. above', 'Pilar acima'),
          L('Estado', 'Status', 'Estado'), L('Posición', 'Position', 'Posição'), L('Ángulo losa (°)', 'Slab angle (°)', 'Ângulo da laje (°)'),
          L('Lados truncados', 'Truncated sides', 'Lados truncados'), 'bo (m)', 'd (m)',
          L('A encerrada (m²)', 'A enclosed (m²)', 'A interna (m²)'),
          L('N inf. (kN)', 'N below (kN)', 'N abaixo (kN)'), L('N sup. (kN)', 'N above (kN)', 'N acima (kN)'),
          L('Vu (kN)', 'Vu (kN)', 'Vu (kN)'), L('φVc (kN)', 'φVc (kN)', 'φVc (kN)'), L('Utilización', 'Utilisation', 'Utilização'),
          L('Combinación', 'Combination', 'Combinação'), L('Residuo equil. (kN)', 'Equil. residual (kN)', 'Resíduo de equil. (kN)')]);
        for (const { ownerId, p } of slabJoints) {
          // Blank, never zero, for every quantity an unverified joint did not produce — the
          // same rule the allowable bearing pressure follows one block up.
          const un = p.status === 'UNSUPPORTED';
          aoa.push([
            ownerId, p.nodeId, p.columnElementId,
            p.elementBelow ?? '', p.elementAbove ?? '',
            p.status, p.position ?? '',
            p.coverageDeg ?? '', p.truncatedSides,
            p.perimeter?.bo ?? '', p.perimeter?.d ?? '', p.perimeter?.enclosedArea ?? '',
            un || p.elementBelow === null ? '' : p.axialBelow,
            un || p.elementAbove === null ? '' : p.axialAbove,
            un ? '' : p.Vu, un ? '' : p.phiVc,
            un ? '' : Math.round(p.utilization * 1000) / 1000,
            p.governingCombination ?? '',
            p.equilibriumResidual ?? '',
          ]);
        }
      }

      // Everything the families could not verify, verbatim. A limitation that appears only in
      // the PDF is a limitation the spreadsheet reader does not know about.
      const notVerified = a.families.flatMap((r) =>
        r.unsupported.map((m) => [r.ownerId, m.key] as (string | number)[]));
      if (notVerified.length > 0) {
        aoa.push([]);
        aoa.push([L('NO VERIFICADO', 'NOT VERIFIED', 'NÃO VERIFICADO')]);
        aoa.push([L('Elemento', 'Member', 'Elemento'), L('Condición', 'Condition', 'Condição')]);
        aoa.push(...notVerified);
      }
    }

    aoa.push([]);
    aoa.push([L('Revisión', 'Revision', 'Revisão'), doc.revision.number,
      L('Madurez', 'Maturity', 'Maturidade'), doc.maturity,
      L('Estado', 'Readiness', 'Prontidão'), doc.readiness]);

    if (doc.openConflicts.length > 0) {
      aoa.push([]);
      aoa.push([readinessBanner(doc, opts.locale)]);
      aoa.push([L('Conjunto', 'Assembly', 'Conjunto'), L('Barras', 'Bars', 'Barras'), L('Clase', 'Class', 'Classe'),
        L('Medido (mm)', 'Measured (mm)', 'Medido (mm)'), L('Requerido (mm)', 'Required (mm)', 'Exigido (mm)')]);
      for (const c of doc.openConflicts.filter((x) => x.assemblyId === a.id)) {
        aoa.push([c.assemblyId, `${c.barIds[0]} / ${c.barIds[1]}`, c.pairClass,
          Math.round(c.clearance * 1000), Math.round(c.required * 1000)]);
      }
    }

    out.push({ name: a.id.slice(0, 31), aoa });
  }

  return out;
}

/** Elevation and section of one assembly, from the members' real geometry. */
function memberSheets(
  doc: DocumentModel, a: DocumentAssembly, opts: RenderOptions,
  members: readonly MemberGeometry[], nextN: () => number,
): DrawingSet['sheets'] {
  const projection = assemblyProjection(a.source);
  const notes = [
    readinessBanner(doc, opts.locale),
    ...doc.openConflicts.filter((c) => c.assemblyId === a.id).map((c) => conflictNote(c, opts.locale)),
  ];
  const retouch = retouchNote(opts.retouched, opts.locale);
  const sheetNotes = [scopeStatement(doc, opts.locale), ...(retouch ? [retouch] : [])];
  const common = { assembly: a.source, members, projection, coverOf: opts.coverOf, clauses: doc.refs };
  const elevation = memberElevationSheet({
    ...common, extraNotes: sheetNotes,
    sheetNumber: `R${doc.revision.number}-${nextN()}`,
    title: `${opts.projectName} — ${notes.join(' | ')}`,
  });
  const out: DrawingSet['sheets'] = [{
    name: `${a.id}-elevation`, sheet: elevation,
    caption: teAt({ key: 'drawing.cap.of', params: { what: a.label, kind: { key: 'drawing.cap.kind.elevation' } } }, opts.locale),
    dxf: sheetToDxf(elevation, a.bars.flatMap((b) => barArcs(b, projection)), opts.locale),
    svg: sheetToSvg(elevation, 1200, opts.locale),
  }];
  const station = preferredStation(common);
  if (station !== null) {
    const section = memberSectionSheet({
      ...common, station,
      noOutlineNote: teAt({ key: 'detailing.sheet.noOutline', params: { x: station.toFixed(2) } }, opts.locale),
      sheetNumber: `R${doc.revision.number}-${nextN()}`,
      title: `${opts.projectName} — ${readinessBanner(doc, opts.locale)}`,
    });
    out.push({
      name: `${a.id}-section`, sheet: section,
      caption: teAt({ key: 'drawing.cap.of', params: { what: a.label, kind: { key: 'drawing.cap.kind.section' } } }, opts.locale),
      dxf: sheetToDxf(section, a.bars.flatMap((b) => barArcs(b, projection)), opts.locale),
      svg: sheetToSvg(section, 800, opts.locale),
    });
  }
  return out;
}
