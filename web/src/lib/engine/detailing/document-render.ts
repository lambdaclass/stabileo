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

import { buildTitleBlock, buildSchedule, scheduleToAoa, sheetToDxf, sheetToSvg,
  drawElevation, drawSection, barArcs, type Sheet, type Projection } from './drawings';
import type { DocumentAssembly, DocumentModel, OpenConflict } from './document-model';
import type { FloorFamilyDesignRecord } from './family-record';
import { drawFooting } from './family-drawings';
import { drawSlab, drawWall } from './slab-wall-drawings';
import type { BarPath } from '../../codes/cirsoc201/bar-geometry';

/** Everything the renderers need that is not in the model: locale and presentation. */
export interface RenderOptions {
  locale: string;
  projectName: string;
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
  L: (es: string, en: string) => string,
): string {
  switch (position) {
    case 'interior': return L('interior', 'interior');
    case 'edge': return L('de borde', 'edge');
    case 'corner': return L('de esquina', 'corner');
    default: return '—';
  }
}

/** The readiness banner every output carries. Not decoration — it is the claim. */
export function readinessBanner(doc: DocumentModel, locale: string): string {
  const es = locale.startsWith('es');
  switch (doc.readiness) {
    case 'ISSUED':
      return es ? 'EMITIDO PARA CONSTRUCCIÓN' : 'ISSUED FOR CONSTRUCTION';
    case 'REVIEWED':
      return es ? 'REVISADO' : 'REVIEWED';
    case 'FOR_REVIEW':
      return es ? 'PARA REVISIÓN — NO APTO PARA CONSTRUCCIÓN'
        : 'FOR REVIEW — NOT FOR CONSTRUCTION';
    case 'SUPERSEDED':
      return es
        ? `REEMPLAZADO POR LA REVISIÓN ${doc.supersededBy ?? '?'} — NO APTO PARA CONSTRUCCIÓN`
        : `SUPERSEDED BY REVISION ${doc.supersededBy ?? '?'} — NOT FOR CONSTRUCTION`;
    default:
      return es
        ? `BORRADOR DE REVISIÓN — ${doc.openConflicts.length} CONFLICTO(S) SIN RESOLVER — NO APTO PARA CONSTRUCCIÓN`
        : `REVIEW DRAFT — ${doc.openConflicts.length} UNRESOLVED CONFLICT(S) — NOT FOR CONSTRUCTION`;
  }
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
  const L = (a: string, b: string) => (es ? a : b);
  const draft = doc.readiness === 'REVIEW_DRAFT' || doc.readiness === 'SUPERSEDED';

  const rows: string[] = [];

  rows.push(`<h1>${esc(opts.projectName)}</h1>`);
  rows.push(`<p class="banner ${draft ? 'draft' : 'ok'}">${esc(readinessBanner(doc, opts.locale))}</p>`);
  rows.push(`<p class="summary">${esc(translate(doc.summary.key, doc.summary.params))}</p>`);

  // ── Revision block ──
  rows.push(`<h2>${L('Revisión', 'Revision')}</h2><table><tbody>`);
  rows.push(`<tr><th>${L('Revisión', 'Revision')}</th><td>${doc.revision.number}</td></tr>`);
  rows.push(`<tr><th>${L('Fecha', 'Date')}</th><td>${esc(doc.revision.at)}</td></tr>`);
  rows.push(`<tr><th>${L('Autor', 'Author')}</th><td>${esc(doc.revision.author)}</td></tr>`);
  rows.push(`<tr><th>${L('Rev. de armado', 'Detailing rev.')}</th><td>${doc.revision.detailingRevision}</td></tr>`);
  rows.push(`<tr><th>${L('Rev. de solicitaciones', 'Demand rev.')}</th><td>${doc.revision.demandRevision}</td></tr>`);
  rows.push(`<tr><th>${L('Madurez', 'Maturity')}</th><td>${esc(doc.maturity)}</td></tr>`);
  rows.push('</tbody></table>');

  // ── Regulations, with editions, exactly as verified ──
  rows.push(`<h2>${L('Reglamentos', 'Regulations')}</h2><ul>`);
  for (const r of doc.regulations) rows.push(`<li>${esc(r.id)} — ${esc(r.edition)}</li>`);
  rows.push('</ul>');

  if (doc.refs.length > 0) {
    rows.push(`<h3>${L('Artículos aplicados', 'Clauses applied')}</h3><ul class="clauses">`);
    for (const r of doc.refs) {
      rows.push(`<li>${esc(r.regulation)} ${esc(r.edition)} §${esc(r.clause)}</li>`);
    }
    rows.push('</ul>');
  }

  // ── Certificates ──
  rows.push(`<h2>${L('Certificados de verificación', 'Verification certificates')}</h2>`);
  rows.push(`<table><thead><tr>`
    + `<th>${L('Elemento', 'Member')}</th><th>${L('Verificador', 'Verifier')}</th>`
    + `<th>${L('Estado', 'Status')}</th><th>${L('Coincide con la geometría', 'Matches geometry')}</th>`
    + `</tr></thead><tbody>`);
  for (const c of doc.certificates) {
    rows.push(`<tr><td>${c.elementId}</td><td>${esc(c.verifierId)}</td>`
      + `<td>${esc(c.status)}</td>`
      + `<td class="${c.matches ? 'ok' : 'bad'}">${c.matches ? L('Sí', 'Yes') : L('No', 'No')}</td></tr>`);
  }
  rows.push('</tbody></table>');

  // ── Assemblies: beam lines and column stacks ──
  for (const a of doc.assemblies) {
    rows.push(`<h2>${esc(translate(a.label.key, a.label.params))}</h2>`);
    rows.push(`<p>${L('Estado', 'State')}: <strong>${esc(a.state)}</strong> · `
      + `${L('Elementos', 'Members')}: ${a.elementIds.join(', ')} · `
      + `${L('Barras', 'Bars')}: ${a.bars.length} · `
      + `${L('Capas', 'Layers')}: ${a.layers.length}</p>`);

    if (a.laps.length > 0) {
      rows.push(`<h3>${L('Empalmes físicos', 'Physical laps')}</h3><table><thead><tr>`
        + `<th>${L('Nudo', 'Joint')}</th><th>${L('Barras', 'Bars')}</th>`
        + `<th>${L('Tipo', 'Kind')}</th><th>${L('Clase', 'Class')}</th>`
        + `<th>${L('Longitud (mm)', 'Length (mm)')}</th></tr></thead><tbody>`);
      for (const l of a.laps) {
        rows.push(`<tr><td>${esc(l.jointId)}</td>`
          + `<td>${esc(l.fromBarId)} / ${esc(l.toBarId)}</td>`
          + `<td>${esc(l.kind)}</td><td>${esc(l.spliceClass)}</td>`
          + `<td>${Math.round(l.lapLength * 1000)}</td></tr>`);
      }
      rows.push('</tbody></table>');
    }

    if (a.fusions.length > 0) {
      rows.push(`<h3>${L('Barras continuas a través de nudos', 'Bars continuous through joints')}</h3><ul>`);
      for (const f of a.fusions) {
        rows.push(`<li>${esc(f.barId)} — ${L('elementos', 'members')} ${f.ownerElementIds.join(', ')}</li>`);
      }
      rows.push('</ul>');
    }

    if (a.constructibility) {
      rows.push(`<h3>${L('Condiciones de constructibilidad', 'Constructibility conditions')}</h3><ul class="conds">`);
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
    rows.push(`<h2 class="bad">${L('Conflictos sin resolver', 'Unresolved conflicts')} `
      + `(${doc.openConflicts.length})</h2>`);
    rows.push(`<table><thead><tr>`
      + `<th>${L('Conjunto', 'Assembly')}</th><th>${L('Elementos', 'Members')}</th>`
      + `<th>${L('Barras', 'Bars')}</th><th>${L('Clase', 'Class')}</th>`
      + `<th>${L('Medido (mm)', 'Measured (mm)')}</th><th>${L('Requerido (mm)', 'Required (mm)')}</th>`
      + `<th>${L('Acción sugerida', 'Suggested action')}</th></tr></thead><tbody>`);
    for (const c of doc.openConflicts) {
      rows.push(`<tr><td>${esc(c.assemblyId)}</td><td>${c.elementIds.join(', ')}</td>`
        + `<td>${esc(c.barIds[0])} / ${esc(c.barIds[1])}</td><td>${esc(c.pairClass)}</td>`
        + `<td>${Math.round(c.clearance * 1000)}</td><td>${Math.round(c.required * 1000)}</td>`
        + `<td>${esc(translate(c.suggestedAction.key, c.suggestedAction.params))}</td></tr>`);
    }
    rows.push('</tbody></table>');
  }

  if (doc.assumptions.length > 0) {
    rows.push(`<h2>${L('Hipótesis', 'Assumptions')}</h2><ul>`);
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
  L: (es: string, en: string) => string,
  translate: (key: string, params?: Record<string, unknown>) => string,
): string[] {
  if (a.families.length === 0) return [];
  const rows: string[] = [];
  const certOf = (ownerId: string) =>
    a.familyCertificates.find((c) => c.ownerId === ownerId);

  // ── The certificate table: one row per family member, with WHY it does or does not apply ──
  rows.push(`<h3>${L('Certificados de familia', 'Family certificates')}</h3>`);
  rows.push('<table><thead><tr>'
    + `<th>${L('Familia', 'Family')}</th><th>${L('Elemento', 'Member')}</th>`
    + `<th>${L('Estado', 'Status')}</th><th>${L('Madurez', 'Maturity')}</th>`
    + `<th>${L('Vigencia', 'Applies')}</th></tr></thead><tbody>`);
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
    rows.push(`<p>${L('Estado del registro', 'Record status')}: <strong>${esc(r.status)}</strong>`
      + ` · ${L('Madurez', 'Maturity')}: ${esc(r.maturity)}`
      + ` · ${L('Edición', 'Edition')}: ${esc(r.edition)}`
      + ` · ${L('Rev. análisis/cargas/reglamento/entidad', 'Rev. analysis/loads/regulation/entity')}: `
      + `${r.revisions.analysis}/${r.revisions.loads}/${r.revisions.regulation}/${r.revisions.entity}`
      + (cert ? ` · ${L('Certificado', 'Certificate')}: ${esc(cert.freshness)}` : '')
      + '</p>');

    if (r.governingCombinations.length > 0) {
      rows.push(`<p>${L('Combinaciones gobernantes', 'Governing combinations')}: `
        + `${esc(r.governingCombinations.join(', '))}</p>`);
    }

    // ── Checks: every one the record carries, passing or not ──
    rows.push('<table><thead><tr>'
      + `<th>${L('Verificación', 'Check')}</th><th>${L('Estado', 'Status')}</th>`
      + `<th>${L('Utilización', 'Utilisation')}</th><th>${L('Combinación', 'Combination')}</th>`
      + '</tr></thead><tbody>');
    for (const c of r.checks) {
      rows.push(`<tr><td>${esc(c.key)}</td>`
        + `<td class="${c.status === 'OK' ? 'ok' : 'bad'}">${esc(c.status)}</td>`
        + `<td>${c.utilization === null ? '—' : n(c.utilization, 2)}</td>`
        + `<td>${esc(c.governingCombination ?? '—')}</td></tr>`);
    }
    rows.push('</tbody></table>');

    if (r.family === 'footing') rows.push(...footingDetail(r, L));
    if (r.family === 'slab') rows.push(...slabDetail(r, L));
    if (r.family === 'wall') rows.push(...wallDetail(r, L));

    // Unsupported conditions and assumptions, in SEPARATE blocks. A limitation and a
    // hypothesis are different things and mixing them buries the one that matters.
    if (r.unsupported.length > 0) {
      rows.push(`<h4 class="bad">${L('No verificado', 'Not verified')}</h4><ul>`);
      for (const m of r.unsupported) rows.push(`<li>${esc(translate(m.key, m.params))}</li>`);
      rows.push('</ul>');
    }
    if (r.assumptions.length > 0) {
      rows.push(`<h4>${L('Hipótesis', 'Assumptions')}</h4><ul>`);
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
  L: (es: string, en: string) => string,
): string[] {
  const g = r.geometry;
  const out: string[] = ['<table><tbody>'];
  out.push(kv(L('Dimensiones B × L × h', 'Dimensions B × L × h'),
    `${n(g.B, 2)} × ${n(g.L, 2)} × ${n(g.thickness, 2)} m`));
  out.push(kv(L('Altura útil d', 'Effective depth d'), `${n(g.d, 3)} m`));
  out.push(kv(L('Recubrimiento', 'Cover'), `${n(g.cover * 1000, 0)} mm`));
  out.push(kv(L('Cota de fundación', 'Founding level'), `${n(g.foundingElevation, 2)} m`));
  out.push(kv(L('Excentricidad de planta', 'Plan eccentricity'),
    `${n(g.eccentricityB, 3)} / ${n(g.eccentricityL, 3)} m`));
  out.push(kv(L('Rotación', 'Rotation'), `${n(g.rotationDeg, 1)}°`));
  out.push(kv(L('Columna soportada', 'Supported column'),
    r.support.columnElementId === null
      ? L('no identificada', 'not identified')
      : `#${r.support.columnElementId} — ${n(r.support.columnB, 2)} × ${n(r.support.columnH, 2)} m`));
  out.push(kv(L('Nudo', 'Node'), `#${r.support.nodeId}`));
  out.push('</tbody></table>');

  // ── The ground, with its PROVENANCE. Bearing pressure has no regulatory source. ──
  out.push(`<h4>${L('Condiciones del terreno', 'Ground conditions')}</h4>`);
  if (!r.ground) {
    out.push(`<p class="bad">${L(
      'No se resolvió ningún perfil de suelo para esta zapata, por lo que no hay tensión admisible contra la cual verificarla.',
      'No soil profile resolved for this footing, so there is no allowable pressure to check it against.')}</p>`);
  } else {
    out.push('<table><tbody>');
    out.push(kv(L('Estrato', 'Stratum'), esc(r.ground.name)));
    out.push(kv(L('Tensión admisible', 'Allowable pressure'),
      r.ground.allowableBearingKPa === null
        ? L('NO DECLARADA', 'NOT STATED')
        : `${n(r.ground.allowableBearingKPa, 1)} kPa`));
    // Printed on every document that relies on it: an assumed value must never read as a
    // measured one, and this figure comes from a geotechnical study rather than a code.
    out.push(kv(L('Procedencia', 'Provenance'),
      `${esc(r.ground.source)}${r.ground.reference ? ` — ${esc(r.ground.reference)}` : ''}`));
    out.push(kv(L('Peso unitario', 'Unit weight'),
      r.ground.unitWeightKNm3 === null ? '—' : `${n(r.ground.unitWeightKNm3, 1)} kN/m³`));
    out.push(kv(L('Napa', 'Groundwater'),
      r.ground.groundwaterDepthM === null ? '—' : `${n(r.ground.groundwaterDepthM, 2)} m`));
    out.push('</tbody></table>');
  }

  // ── The reaction the footing was designed for ──
  out.push(`<h4>${L('Reacción de diseño', 'Design reaction')}</h4>`);
  if (!r.demand) {
    out.push(`<p class="bad">${L('No se resolvió ninguna reacción en este nudo.',
      'No reaction was resolved at this node.')}</p>`);
  } else {
    out.push('<table><tbody>');
    out.push(kv(L('Combinación gobernante', 'Governing combination'),
      esc(r.demand.governingCombination)));
    out.push(kv(L('N mayorado', 'Factored N'), `${n(r.demand.factoredAxial, 1)} kN`));
    out.push(kv(L('N de servicio', 'Service N'), `${n(r.demand.serviceAxial, 1)} kN`));
    out.push(kv(L('Momentos de servicio MB / ML', 'Service moments MB / ML'),
      `${n(r.demand.serviceMomentB, 1)} / ${n(r.demand.serviceMomentL, 1)} kN·m`));
    out.push(kv(L('Casos sumados para servicio', 'Cases summed for service'),
      r.demand.serviceCaseTypes.length > 0
        ? esc(r.demand.serviceCaseTypes.join(' + '))
        : L('ninguno', 'none')));
    out.push('</tbody></table>');
    // Every combination that was offered, so the choice of governing is auditable rather
    // than asserted.
    out.push(`<p>${L('Combinaciones consideradas', 'Combinations considered')}: `
      + esc(r.demand.considered
        .map((c) => `${c.combinationName} (Fz ${c.fz.toFixed(0)} kN)`).join('; ')) + '</p>');
  }

  // ── The checks, with their numbers ──
  out.push(`<h4>${L('Resultados', 'Results')}</h4><table><tbody>`);
  out.push(kv(L('Presión de contacto qmax / qmin', 'Contact pressure qmax / qmin'),
    r.bearing ? `${n(r.bearing.qMax, 1)} / ${n(r.bearing.qMin, 1)} kPa` : '—'));
  out.push(kv(L('Excentricidad eB / eL', 'Eccentricity eB / eL'),
    r.bearing ? `${n(r.bearing.eB, 3)} / ${n(r.bearing.eL, 3)} m` : '—'));
  out.push(kv(L('Contacto parcial', 'Partial contact'),
    r.bearing ? (r.bearing.uplift ? L('SÍ — base despegada', 'YES — base lifts off')
      : L('no', 'no')) : '—'));
  out.push(kv(L('Capacidad portante', 'Bearing'),
    r.bearing
      ? `${n(r.bearing.qMax, 1)} / ${n(r.bearing.allowable, 1)} kPa `
        + `(${n(r.bearing.utilization, 2)})`
      : '—'));
  out.push(kv(L('Flexión Mu en la cara', 'Flexure Mu at the face'),
    r.flexure ? `${n(r.flexure.Mu, 1)} kN·m` : '—'));
  out.push(kv(L('Corte en una dirección Vu / φVc', 'One-way shear Vu / φVc'),
    r.oneWayShear
      ? `${n(r.oneWayShear.Vu, 1)} / ${n(r.oneWayShear.phiVc, 1)} kN `
        + `(${n(r.oneWayShear.utilization, 2)})`
      : '—'));
  if (r.punching) {
    out.push(kv(L('Punzonado Vu / φVc', 'Punching Vu / φVc'),
      `${n(r.punching.Vu, 1)} / ${n(r.punching.phiVc, 1)} kN `
      + `(${n(r.punching.utilization, 2)})`));
    out.push(kv(L('Perímetro crítico', 'Critical perimeter'),
      `${esc(positionLabel(r.punching.position, L))} — `
      + `${r.punching.truncatedSides} ${L('cara(s) truncada(s)', 'truncated side(s)')}`));
    // The equilibrium residual: N_u − (V_u + q_u·A_enclosed) must be zero, and printing it
    // is how a reader confirms the free body the record describes is the one that was solved.
    out.push(kv(L('Residuo de equilibrio', 'Equilibrium residual'),
      r.punching.equilibriumResidual === null
        ? L('no medido', 'not measured')
        : `${n(r.punching.equilibriumResidual, 3)} kN`));
  } else {
    out.push(kv(L('Punzonado', 'Punching'), '—'));
  }
  out.push('</tbody></table>');

  // ── Dowels and starter ties ──
  out.push(`<h4>${L('Pelos y estribos de arranque', 'Dowels and starter ties')}</h4>`);
  if (!r.dowels) {
    out.push(`<p>${L('No se generaron pelos: la columna no tiene barras resueltas.',
      'No dowels generated: the column has no resolved bars.')}</p>`);
  } else {
    out.push('<table><tbody>');
    out.push(kv(L('Pelos', 'Dowels'),
      `${r.dowels.count} Ø${r.dowels.diameterMm} mm`));
    out.push(kv(L('Anclaje en zapata ld', 'Development in footing ld'),
      `${n(r.dowels.ldFooting * 1000, 0)} mm`));
    out.push(kv(L('Empalme sobre zapata', 'Lap above footing'),
      `${n(r.dowels.lapAbove * 1000, 0)} mm`));
    out.push(kv(L('Remate inferior', 'Bottom treatment'),
      r.dowels.hooked
        ? L('gancho a 90° sobre la parrilla inferior', '90° hook over the bottom mat')
        : L('recto', 'straight')));
    out.push(kv(L('Estribos de arranque', 'Starter ties'),
      r.starterTies
        ? `${r.starterTies.pieces} × Ø${r.starterTies.diameterMm} mm`
        : L('ninguno', 'none')));
    out.push('</tbody></table>');
  }
  return out;
}

function slabDetail(
  r: Extract<FloorFamilyDesignRecord, { family: 'slab' }>,
  L: (es: string, en: string) => string,
): string[] {
  const g = r.geometry;
  const out: string[] = ['<table><tbody>'];
  out.push(kv(L('Paño lx × ly × h', 'Panel lx × ly × h'),
    `${n(g.lx, 2)} × ${n(g.ly, 2)} × ${n(g.thickness, 3)} m`));
  out.push(kv(L('Comportamiento', 'Behaviour'), esc(g.behaviour)));
  out.push(kv(L('Bordes apoyados', 'Supported edges'), String(g.supportedSides)));
  out.push(kv(L('Recubrimiento', 'Cover'), `${n(g.cover * 1000, 0)} mm`));
  out.push('</tbody></table>');

  // ── Raw plate moments AND the Wood-Armer transform, side by side ──
  //
  // Both, because `mxy` is the field a naive slab design discards and discarding it
  // under-reinforces a twisted panel. Printing only the transformed pair would make the
  // transformation unauditable; printing both lets a reviewer check it.
  out.push(`<h4>${L('Solicitaciones y Wood-Armer', 'Demands and Wood-Armer')}</h4>`);
  out.push('<table><thead><tr>'
    + `<th>${L('Región', 'Region')}</th><th>mx</th><th>my</th><th>mxy</th>`
    + `<th>${L('m inf. x', 'm bot. x')}</th><th>${L('m inf. y', 'm bot. y')}</th>`
    + `<th>${L('m sup. x', 'm top x')}</th><th>${L('m sup. y', 'm top y')}</th>`
    + `<th>qu</th></tr></thead><tbody>`);
  for (const d of r.demands) {
    out.push(`<tr><td>${esc(d.region)}</td>`
      + `<td>${n(d.mx)}</td><td>${n(d.my)}</td><td>${n(d.mxy)}</td>`
      + `<td>${n(d.woodArmer.mxBottom)}</td><td>${n(d.woodArmer.myBottom)}</td>`
      + `<td>${n(d.woodArmer.mxTop)}</td><td>${n(d.woodArmer.myTop)}</td>`
      + `<td>${n(d.qu, 2)}</td></tr>`);
  }
  out.push(`</tbody></table><p class="note">${L(
    'Momentos en kN·m/m; qu en kPa.', 'Moments in kN·m/m; qu in kPa.')}</p>`);

  if (r.reinforcement.length > 0) {
    out.push(`<h4>${L('Armadura por región', 'Reinforcement by region')}</h4>`);
    out.push('<table><thead><tr>'
      + `<th>${L('Cara', 'Face')}</th><th>${L('Dirección', 'Direction')}</th>`
      + `<th>Ø</th><th>${L('Separación', 'Spacing')}</th>`
      + `<th>As req.</th><th>As prov.</th><th>${L('Gobierna', 'Governed by')}</th>`
      + `<th>${L('Barras', 'Bars')}</th></tr></thead><tbody>`);
    for (const z of r.reinforcement) {
      out.push(`<tr><td>${esc(z.face)}</td><td>${esc(z.direction)}</td>`
        + `<td>${z.diameterMm}</td><td>${n(z.spacing * 1000, 0)} mm</td>`
        + `<td>${n(z.asRequired, 0)}</td><td>${n(z.asProvided, 0)}</td>`
        + `<td>${esc(z.governedBy)}</td><td>${z.barIds.length}</td></tr>`);
    }
    out.push(`</tbody></table><p class="note">${L(
      'As en mm²/m.', 'As in mm²/m.')}</p>`);
  }

  out.push('<table><tbody>');
  out.push(kv(L('Corte en una dirección Vu / φVc', 'One-way shear Vu / φVc'),
    r.oneWayShear
      ? `${n(r.oneWayShear.Vu, 1)} / ${n(r.oneWayShear.phiVc, 1)} kN/m `
        + `(${n(r.oneWayShear.utilization, 2)})`
      : '—'));
  out.push('</tbody></table>');

  // Punching per supported column. An EMPTY list is a measured "this panel supports no
  // column", and it is said out loud so it cannot be read as an omitted check.
  out.push(`<h4>${L('Punzonado losa-columna', 'Slab-column punching')}</h4>`);
  if (r.punching.length === 0) {
    out.push(`<p>${L(
      'Este paño no soporta ninguna columna, por lo que no hay nudo de punzonado que verificar.',
      'This panel supports no column, so there is no punching joint to check.')}</p>`);
  } else {
    out.push('<table><thead><tr>'
      + `<th>${L('Columna', 'Column')}</th><th>${L('Nudo', 'Node')}</th>`
      + `<th>${L('Estado', 'Status')}</th>`
      + `<th>${L('Posición', 'Position')}</th><th>bo</th>`
      + `<th>N inf.</th><th>N sup.</th><th>Vu</th><th>φVc</th>`
      + `<th>${L('Rel.', 'Util.')}</th>`
      + `<th>${L('Combinación', 'Combination')}</th>`
      + `<th>${L('Residuo', 'Residual')}</th></tr></thead><tbody>`);
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
      + 'than as passing.')}</p>`);

    // ── Every combination considered, per joint ──────────────────────
    //
    // The governing choice is a decision the design turns on, so the combinations that LOST
    // are printed too. A reader who cannot see them cannot check the one that won.
    const withContributions = r.punching.filter((p) => (p.contributions?.length ?? 0) > 0);
    if (withContributions.length > 0) {
      out.push(`<h4>${L('Punzonado — combinaciones consideradas',
        'Punching — combinations considered')}</h4>`);
      out.push('<table><thead><tr>'
        + `<th>${L('Nudo', 'Node')}</th><th>${L('Combinación', 'Combination')}</th>`
        + `<th>N inf.</th><th>N sup.</th><th>ΔN</th>`
        + `<th>${L('Directa', 'Direct')}</th><th>qu·A</th>`
        + `<th>${L('M no bal.', 'Unbal. M')}</th>`
        + `<th>Vu</th><th>${L('Rel.', 'Util.')}</th>`
        + `<th>${L('Residuo', 'Residual')}</th></tr></thead><tbody>`);
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
        + 'boundary), not a missing force.')}</p>`);
    }
  }
  return out;
}

function wallDetail(
  r: Extract<FloorFamilyDesignRecord, { family: 'wall' }>,
  L: (es: string, en: string) => string,
): string[] {
  const g = r.geometry;
  const out: string[] = ['<table><tbody>'];
  out.push(kv(L('Longitud × altura × espesor', 'Length × height × thickness'),
    `${n(g.length, 2)} × ${n(g.height, 2)} × ${n(g.thickness, 3)} m`));
  out.push(kv(L('Cortinas', 'Curtains'), String(r.reinforcement.curtains)));
  out.push(kv(L('Recubrimiento', 'Cover'), `${n(g.cover * 1000, 0)} mm`));
  out.push('</tbody></table>');

  out.push(`<h4>${L('Solicitaciones', 'Demands')}</h4>`);
  out.push('<table><thead><tr>'
    + `<th>${L('Elemento', 'Member')}</th><th>σxx</th><th>σyy</th><th>τxy</th>`
    + `<th>Pu</th><th>Mu</th><th>Vu</th>`
    + `<th>${L('Origen del momento', 'Moment source')}</th></tr></thead><tbody>`);
  for (const d of r.demands) {
    out.push(`<tr><td>#${d.elementId}</td>`
      + `<td>${n(d.sigmaXx, 0)}</td><td>${n(d.sigmaYy, 0)}</td><td>${n(d.tauXy, 0)}</td>`
      + `<td>${n(d.pu, 1)}</td><td>${n(d.muInPlane, 1)}</td><td>${n(d.vuInPlane, 1)}</td>`
      // A membrane-only resolution gives ZERO in-plane moment, which is not a wall's real
      // demand. Named on the row rather than left for the reader to infer from a zero.
      + `<td class="${d.fromMembraneOnly ? 'bad' : ''}">${d.fromMembraneOnly
        ? L('sólo membrana — Mu no resuelto', 'membrane only — Mu unresolved')
        : L('fuerzas de elemento', 'element forces')}</td></tr>`);
  }
  out.push(`</tbody></table><p class="note">${L(
    'Tensiones en kPa; Pu y Vu en kN; Mu en kN·m.',
    'Stresses in kPa; Pu and Vu in kN; Mu in kN·m.')}</p>`);

  out.push(`<h4>${L('Resultados', 'Results')}</h4><table><tbody>`);
  out.push(kv(L('Axial-flexión Pu / φMn', 'Axial-flexure Pu / φMn'),
    `${n(r.axialFlexure.pu, 1)} kN / ${n(r.axialFlexure.phiMn, 1)} kN·m `
    + `(${n(r.axialFlexure.utilization, 2)})`));
  out.push(kv(L('Corte en el plano Vu / φVn', 'In-plane shear Vu / φVn'),
    `${n(r.inPlaneShear.Vu, 1)} / ${n(r.inPlaneShear.phiVn, 1)} kN `
    + `(${n(r.inPlaneShear.utilization, 2)})`));
  // §11.5.4.6: above the ceiling the wall fails by web crushing and horizontal steel does
  // not help. Stating it separately is what stops the report recommending a remedy that
  // would not work.
  out.push(kv(L('Techo de aplastamiento del alma (11.5.4.6)',
    'Web-crushing ceiling (11.5.4.6)'),
  `${n(r.inPlaneShear.webCrushingLimit, 1)} kN — `
    + (r.inPlaneShear.webCrushingGoverns
      ? L('GOBIERNA: agregar armadura horizontal no ayuda',
        'GOVERNS: adding horizontal steel does not help')
      : L('no gobierna', 'does not govern'))));
  out.push(kv(L('Vertical', 'Vertical'),
    `Ø${r.reinforcement.verticalDiameterMm} c/${n(r.reinforcement.verticalSpacing * 1000, 0)} mm `
    + `(ρ ${n(r.reinforcement.rhoVertical, 4)}, ${esc(r.reinforcement.verticalGovernedBy)})`));
  out.push(kv(L('Horizontal', 'Horizontal'),
    `Ø${r.reinforcement.horizontalDiameterMm} c/${n(r.reinforcement.horizontalSpacing * 1000, 0)} mm `
    + `(ρ ${n(r.reinforcement.rhoHorizontal, 4)}, ${esc(r.reinforcement.horizontalGovernedBy)})`));
  out.push(kv(L('Barras físicas', 'Physical bars'), String(r.reinforcement.barIds.length)));
  out.push(kv(L('Elemento de borde', 'Boundary element'),
    r.boundaryElement === null
      ? L('no evaluado', 'not evaluated')
      : r.boundaryElement.required
        ? (r.boundaryElement.detailing
          ? `${L('requerido', 'required')} — ${n(r.boundaryElement.detailing.lengthM, 2)} m`
          : L('REQUERIDO — despiece NO implementado', 'REQUIRED — detailing NOT implemented'))
        : L('no requerido', 'not required')));
  out.push('</tbody></table>');
  return out;
}

// ─── DXF ───

export interface DrawingSet {
  sheets: Array<{ name: string; sheet: Sheet; dxf: string; svg: string }>;
  /** All sheets concatenated into one DXF. */
  dxf: string;
}

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
        centre: footingCentre(rec, own),
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
          sheet,
          dxf: sheetToDxf(sheet, own.flatMap((b) => barArcs(b, proj)), opts.locale),
          svg: sheetToSvg(sheet, 900, opts.locale),
        });
      }
    }
  }

  return { sheets, dxf: sheets.map((s) => s.dxf).join('\n') };
}

/** The generic elevation and section for an assembly that has steel. */
function elevationAndSection(
  doc: DocumentModel, a: DocumentAssembly, opts: RenderOptions, nextN: () => number,
): DrawingSet['sheets'] {
  const sheets: DrawingSet['sheets'] = [];
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
    const outline = [
      { x: Math.min(...us), y: Math.min(...zs) },
      { x: Math.max(...us), y: Math.min(...zs) },
      { x: Math.max(...us), y: Math.max(...zs) },
      { x: Math.min(...us), y: Math.max(...zs) },
    ];

    const notes = [
      readinessBanner(doc, opts.locale),
      ...doc.openConflicts
        .filter((c) => c.assemblyId === a.id)
        .map((c) => conflictNote(c, opts.locale)),
    ];

    n += 1;
    const elevation = drawElevation({
      assembly: a.source,
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
      sheet: elevation,
      dxf: sheetToDxf(elevation, arcs, opts.locale),
      svg: sheetToSvg(elevation, 1200, opts.locale),
    });

    n += 1;
    const section = drawSection({
      assembly: a.source,
      atX: (Math.min(...us) + Math.max(...us)) / 2,
      outline,
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
function footingCentre(
  rec: Extract<FloorFamilyDesignRecord, { family: 'footing' }>,
  bars: readonly BarPath[],
): { x: number; y: number } {
  const dowelIds = new Set(rec.dowels?.barIds ?? []);
  const dowels = bars.filter((b) => dowelIds.has(b.id));
  if (dowels.length === 0) return { x: 0, y: 0 };
  const pts = dowels.map((b) => b.segments[0].start);
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

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
  const L = (a: string, b: string) => (es ? a : b);
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

    // The references a fabricator needs to place the bar, appended to the standard table:
    // which members it belongs to, and which layer it sits in.
    const barById = new Map(a.bars.map((b) => [b.id, b]));
    const header = aoa.findIndex((r) =>
      typeof r[0] === 'string' && /^(marca|mark)$/i.test(String(r[0]).trim()));
    if (header >= 0) {
      aoa[header] = [...aoa[header],
        L('Masa (kg)', 'Mass (kg)'), L('Elementos', 'Members'), L('Capa', 'Layer')];
      for (let i = 0; i < marks.length; i++) {
        const row = aoa[header + 1 + i];
        if (!row) break;
        const m = marks[i];
        const first = m.barIds.map((id) => barById.get(id)).find(Boolean);
        const members = [...new Set(m.barIds
          .flatMap((id) => barById.get(id)?.ownerElementIds ?? []))].sort((x, y) => x - y);
        const area = Math.PI * (m.diameterMm / 2000) ** 2;
        aoa[header + 1 + i] = [...row,
          m.massKg > 0
            ? Math.round(m.massKg * 1000) / 1000
            : Math.round(area * m.cuttingLength * m.quantity * density * 1000) / 1000,
          members.join(', '),
          first?.layerId ?? ''];
      }
    }

    // Laps get their own block: the fabricator has to know a bar is spliced, not merely
    // that two bars exist.
    if (a.laps.length > 0) {
      aoa.push([]);
      aoa.push([L('EMPALMES', 'LAPS')]);
      aoa.push([L('Nudo', 'Joint'), L('Desde', 'From'), L('Hasta', 'To'),
        L('Tipo', 'Kind'), L('Clase', 'Class'), L('Longitud (mm)', 'Length (mm)')]);
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
      aoa.push([L('FAMILIAS DE PISO', 'FLOOR FAMILIES')]);
      aoa.push([L('Familia', 'Family'), L('Elemento', 'Member'), L('Estado', 'Status'),
        L('Madurez', 'Maturity'), L('Certificado', 'Certificate'),
        L('Vigencia', 'Applies'), L('Marcas', 'Marks'), L('Barras', 'Bars'),
        L('Rev. análisis', 'Rev. analysis'), L('Rev. cargas', 'Rev. loads'),
        L('Rev. reglamento', 'Rev. regulation'), L('Rev. entidad', 'Rev. entity')]);
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
      aoa.push([L('VERIFICACIONES POR FAMILIA', 'FAMILY CHECKS')]);
      aoa.push([L('Elemento', 'Member'), L('Verificación', 'Check'), L('Estado', 'Status'),
        L('Utilización', 'Utilisation'), L('Combinación', 'Combination')]);
      for (const r of a.families) {
        for (const c of r.checks) {
          aoa.push([r.ownerId, c.key, c.status,
            c.utilization === null ? '' : Math.round(c.utilization * 1000) / 1000,
            c.governingCombination ?? '']);
        }
      }

      // Footing quantities and ground provenance: the columns a site engineer reads before
      // pouring, and the one figure in the whole document that has no regulatory source.
      const footings = a.families.filter((r) => r.family === 'footing');
      if (footings.length > 0) {
        aoa.push([]);
        aoa.push([L('ZAPATAS', 'FOOTINGS')]);
        aoa.push([L('Zapata', 'Footing'), 'B (m)', 'L (m)', 'h (m)', 'd (m)',
          L('Cota', 'Level'), L('Estrato', 'Stratum'),
          L('q adm (kPa)', 'q allow (kPa)'), L('Procedencia', 'Provenance'),
          L('Referencia', 'Reference'), L('Combinación', 'Combination'),
          L('Nu (kN)', 'Nu (kN)'), L('N serv (kN)', 'N serv (kN)'),
          L('qmax (kPa)', 'qmax (kPa)'), L('Contacto parcial', 'Partial contact'),
          L('Mu (kN·m)', 'Mu (kN·m)'), L('Util. corte', 'Shear util.'),
          L('Util. punzonado', 'Punching util.'), L('Residuo equil. (kN)', 'Equil. residual (kN)'),
          L('Pelos', 'Dowels'), L('Estribos arranque', 'Starter ties')]);
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
            r.bearing ? (r.bearing.uplift ? L('SÍ', 'YES') : L('no', 'no')) : '',
            r.flexure?.Mu ?? '',
            r.oneWayShear?.utilization ?? '',
            r.punching?.utilization ?? '',
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
        aoa.push([L('PUNZONADO LOSA-COLUMNA', 'SLAB-COLUMN PUNCHING')]);
        aoa.push([L('Paño', 'Panel'), L('Nudo', 'Node'), L('Columna', 'Column'),
          L('Col. inferior', 'Col. below'), L('Col. superior', 'Col. above'),
          L('Estado', 'Status'), L('Posición', 'Position'), L('Ángulo losa (°)', 'Slab angle (°)'),
          L('Lados truncados', 'Truncated sides'), 'bo (m)', 'd (m)',
          L('A encerrada (m²)', 'A enclosed (m²)'),
          L('N inf. (kN)', 'N below (kN)'), L('N sup. (kN)', 'N above (kN)'),
          L('Vu (kN)', 'Vu (kN)'), L('φVc (kN)', 'φVc (kN)'), L('Utilización', 'Utilisation'),
          L('Combinación', 'Combination'), L('Residuo equil. (kN)', 'Equil. residual (kN)')]);
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
        aoa.push([L('NO VERIFICADO', 'NOT VERIFIED')]);
        aoa.push([L('Elemento', 'Member'), L('Condición', 'Condition')]);
        aoa.push(...notVerified);
      }
    }

    aoa.push([]);
    aoa.push([L('Revisión', 'Revision'), doc.revision.number,
      L('Madurez', 'Maturity'), doc.maturity,
      L('Estado', 'Readiness'), doc.readiness]);

    if (doc.openConflicts.length > 0) {
      aoa.push([]);
      aoa.push([readinessBanner(doc, opts.locale)]);
      aoa.push([L('Conjunto', 'Assembly'), L('Barras', 'Bars'), L('Clase', 'Class'),
        L('Medido (mm)', 'Measured (mm)'), L('Requerido (mm)', 'Required (mm)')]);
      for (const c of doc.openConflicts.filter((x) => x.assemblyId === a.id)) {
        aoa.push([c.assemblyId, `${c.barIds[0]} / ${c.barIds[1]}`, c.pairClass,
          Math.round(c.clearance * 1000), Math.round(c.required * 1000)]);
      }
    }

    out.push({ name: a.id.slice(0, 31), aoa });
  }

  return out;
}
