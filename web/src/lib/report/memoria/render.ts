/**
 * The memoria de cálculo as one printable HTML document, in the language chosen for documents.
 *
 * Every check prints as a ficha: its title with the clause, what must be satisfied, the ratio with
 * its state, the values that went in (symbol, value, unit, clause), the combination and the place
 * that govern, and the working. The summary of the structure reads the same rows, one column per
 * check, with the checks that do not apply numbered under the table. Chapters are numbered as
 * they are printed, so leaving one out renumbers the rest.
 */
import type { CheckRow, DesignStatus } from '../../design-contract';
import type { EngineMessage } from '../../codes/message';
import type { ClauseRef } from '../../codes/regulation';
import { ALL_CHAPTERS, CAUTIOUS_FAMILIES, CHAPTERS, EXPERIMENTAL_CODES, MEMBER_FAMILIES, type ChapterId, type ChapterKey, type MemoriaElement, type MemoriaInput, memoElementState } from './types';

export interface RenderContext {
  tr: (key: string, params?: Record<string, string | number>) => string;
  msg: (m: EngineMessage) => string;
  fmt: (v: number, digits: number) => string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const CODE_NAME: Record<string, string> = { 'cirsoc-201': 'CIRSOC 201', 'cirsoc-301': 'CIRSOC 301', 'cirsoc-601': 'CIRSOC 601', 'cirsoc-303': 'CIRSOC 303', 'en-1999-1-1': 'EN 1999-1-1', 'aisc-360': 'AISC 360', 'cirsoc-101': 'CIRSOC 101', 'cirsoc-102': 'CIRSOC 102', 'cirsoc-103': 'INPRES-CIRSOC 103', 'inpres-cirsoc-103-ii': 'INPRES-CIRSOC 103 II', 'inpres-cirsoc-103-iii': 'INPRES-CIRSOC 103 III', 'nds': 'NDS', 'en-1993-1-2': 'EN 1993-1-2', 'fema-356': 'FEMA 356', 'aci-318': 'ACI 318', 'en-1992-1-1': 'EN 1992-1-1', 'bs-en-1992-1-1': 'BS EN 1992-1-1', 'en-1993-1-1': 'EN 1993-1-1', 'bs-en-1993-1-1': 'BS EN 1993-1-1' };
/** References of the project's own, named in the memoria's language. */
const OWN_CODES = new Set(['timber-fire', 'project-fire-table', 'slab-column-joint']);
const codeName = (c: string, tr?: RenderContext['tr']) => (tr && OWN_CODES.has(c) ? tr(`memo.code.${c}`) : CODE_NAME[c] ?? c.toUpperCase());
const ref = (r: { code: string; edition?: string; clause?: string }, tr?: RenderContext['tr']) => `${codeName(r.code, tr)}${r.edition ? `-${r.edition}` : ''}${r.clause ? `, ${r.clause}` : ''}`;
const clauseRef = (r: ClauseRef) => `${codeName(r.regulation)}-${r.edition} ${r.clause}`;

const MARK: Record<DesignStatus, string> = { ok: '✓', nearLimit: '✓', fail: '✗', notVerified: '—', unsupported: '—' };

function table(head: string[], rows: string[][], cls = ''): string {
  if (rows.length === 0) return '';
  return `<table class="${cls}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/** One check as its ficha. */
export function renderFicha(r: CheckRow, c: RenderContext): string {
  const title = r.titleKey ? c.tr(r.titleKey) : r.title;
  const eta = r.ratio === null ? '' : Number.isFinite(r.ratio) ? c.fmt(r.ratio, 3) : '∞';
  const head = `<h5>${esc(title)} <span class="clause">(${esc(ref(r, c.tr))})</span></h5>`;
  if (r.status === 'unsupported' || r.status === 'notVerified') {
    return `<section class="ficha ${r.status}">${head}<p>${esc(c.tr(`memo.ficha.${r.status}`))}${r.formula ? `: ${esc(r.formula)}` : ''}</p></section>`;
  }
  const where = r.combination || r.location
    ? `<p class="where">${esc(c.tr('memo.ficha.governs', { location: r.location ?? '—', combination: r.combination ?? '—' }))}</p>` : '';
  const inputs = r.inputs.length
    ? table([c.tr('memo.ficha.symbol'), c.tr('memo.ficha.value'), c.tr('memo.ficha.unit'), c.tr('memo.ficha.source')],
      r.inputs.map((i) => [`<b>${esc(i.symbol)}</b>${i.description ? ` <span class="muted">${esc(i.description)}</span>` : ''}`,
        typeof i.value === 'number' ? c.fmt(i.value, Math.abs(i.value) >= 100 ? 1 : 3) : esc(i.value), esc(i.unit ?? ''), esc(i.clause ?? '')]), 'glossary') : '';
  const working = r.derivation?.length ? `<details open><summary>${esc(c.tr('memo.ficha.working'))}</summary><pre>${esc(r.derivation.join('\n'))}</pre></details>` : '';
  return `<section class="ficha ${r.status}">${head}
<p>${esc(c.tr('memo.ficha.mustHold'))}</p>
<div class="hold ${r.status}"><span class="formula">${esc(r.formula ?? '—')}</span>${eta ? `<span class="eta">η = <b>${eta}</b> ${MARK[r.status]}</span>` : `<span class="eta">${MARK[r.status]}</span>`}</div>
${where}${inputs}${working}</section>`;
}

/** The summary of one family: one row per element, one column per check, «N.P.» numbered below. */
export function familySummary(els: readonly MemoriaElement[], c: RenderContext, family = ''): string {
  // Metallic results are calculated, never presented as verified.
  const metallic = CAUTIOUS_FAMILIES.has(family);
  if (els.length === 0) return '';
  const cols: Array<{ key: string; head: string; title: string }> = [];
  for (const e of els) for (const r of e.rows) {
    const key = r.titleKey ? `${r.titleKey}|${r.clause ?? ''}` : r.title;
    if (!cols.some((x) => x.key === key)) cols.push({ key, head: r.clause ?? String(cols.length + 1), title: r.titleKey ? c.tr(r.titleKey) : r.title });
  }
  const reasons: string[] = [];
  const note = (s: string) => { let i = reasons.indexOf(s); if (i < 0) { reasons.push(s); i = reasons.length - 1; } return i + 1; };
  const rows = els.map((e) => {
    const cells = cols.map((col) => {
      const rs = e.rows.filter((r) => (r.titleKey ? `${r.titleKey}|${r.clause ?? ''}` : r.title) === col.key);
      if (rs.length === 0) return `N.P.<sup>${note(c.tr('memo.np.absent', { check: col.title }))}</sup>`;
      const worst = rs.reduce((a, b) => ((b.ratio ?? -1) > (a.ratio ?? -1) ? b : a));
      if (worst.status === 'unsupported' || worst.status === 'notVerified') return `N.E.<sup>${note(`${col.title}: ${worst.formula ?? c.tr('memo.ficha.unsupported')}`)}</sup>`;
      return worst.ratio === null ? MARK[worst.status] : `<span class="s-${worst.status}">η = ${Number.isFinite(worst.ratio) ? c.fmt(worst.ratio, 2) : '∞'}</span>`;
    });
    const ratios = e.rows.map((r) => r.ratio).filter((x): x is number => x !== null);
    const worst = ratios.length ? Math.max(...ratios) : null;
    // The element's state (`memoElementState`): a check not evaluated (N.E.) or a hold of the
    // member's verdict is not a pass, whatever the local checks read.
    const st = memoElementState(e);
    const failed = st === 'fail', open = st === 'open';
    const state = st === 'none' ? c.tr('memo.state.none') : failed ? c.tr(metallic ? 'memo.state.steelFail' : 'memo.state.fail') : open ? c.tr('memo.state.open') : c.tr(metallic ? 'memo.state.steelOk' : 'memo.state.ok');
    const held = e.heldBy?.length ? `<sup>${note(`${c.tr('verdict.memo.heldBy')}: ${e.heldBy.join('; ')}`)}</sup>` : '';
    return [esc(e.name), ...cells, `<b class="${failed ? 's-fail' : open ? 's-warn' : 's-ok'}">${state}${held}${worst !== null && Number.isFinite(worst) ? ` η = ${c.fmt(worst, 2)}` : ''}</b>`];
  });
  const legend = `<p class="legend">${cols.map((x) => `<b>${esc(x.head)}</b>: ${esc(x.title)}`).join(' · ')}</p><p class="legend">${esc(c.tr('verdict.memo.localLegend'))}</p>`;
  const np = reasons.length ? `<ol class="np">${reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>` : '';
  return table([c.tr('memo.summary.element'), ...cols.map((x) => esc(x.head)), c.tr('verdict.memo.memberState')], rows, 'summary') + legend + np;
}

/** The element's state above its fichas, with what holds it: its fichas below are local checks. */
function elementStateLine(e: MemoriaElement, c: RenderContext, family: string): string {
  const metallic = CAUTIOUS_FAMILIES.has(family);
  const st = memoElementState(e);
  const word = st === 'none' ? c.tr('memo.state.none') : st === 'fail' ? c.tr(metallic ? 'memo.state.steelFail' : 'memo.state.fail') : st === 'open' ? c.tr('memo.state.open') : c.tr(metallic ? 'memo.state.steelOk' : 'memo.state.ok');
  const held = e.heldBy?.length ? ` · ${esc(c.tr('verdict.memo.heldBy'))}: ${esc(e.heldBy.join('; '))}` : '';
  return `<p class="el-state s-${st === 'fail' ? 'fail' : st === 'open' ? 'warn' : st === 'ok' ? 'ok' : 'none'}"><b>${esc(c.tr('verdict.memo.memberState'))}:</b> ${esc(word)}${held}</p>`;
}

const STYLE = `
@page { size: A4; margin: 18mm 15mm; }
body { font: 10pt/1.4 Helvetica, Arial, sans-serif; color: #111; background: #fff; margin: 0 auto; max-width: 190mm; }
h1 { font-size: 20pt; margin: 30mm 0 4mm; } h2 { font-size: 14pt; border-bottom: 1.5px solid #333; margin-top: 10mm; page-break-after: avoid; }
h3 { font-size: 12pt; margin-top: 6mm; } h4 { font-size: 11pt; margin: 5mm 0 2mm; background: #eee; padding: 1.5mm 2mm; }
h5 { font-size: 10pt; margin: 3mm 0 1mm; text-decoration: underline; } .clause { font-weight: normal; text-decoration: none; color: #444; }
table { border-collapse: collapse; width: 100%; margin: 2mm 0; font-size: 8.5pt; } th, td { border: 0.5px solid #999; padding: 1mm 1.5mm; text-align: left; vertical-align: top; }
th { background: #f0f0f0; } table.summary td, table.summary th { text-align: center; } table.summary td:first-child { text-align: left; }
.ficha { margin: 2mm 0 4mm; page-break-inside: avoid; } .hold { display: flex; justify-content: space-between; align-items: center; padding: 2mm 3mm; border-radius: 1mm; margin: 1mm 0; }
.hold.ok { background: #d9efd5; } .hold.nearLimit { background: #f5ecc8; } .hold.fail { background: #f5d0cc; } .formula { font-family: 'Times New Roman', serif; font-size: 11pt; }
.eta b { font-size: 11pt; } .where, .muted, .legend { color: #444; font-size: 8.5pt; } pre { font-size: 8pt; white-space: pre-wrap; background: #fafafa; padding: 1.5mm; margin: 1mm 0; }
.ficha.unsupported p, .ficha.notVerified p { color: #555; font-style: italic; } .s-fail { color: #b00; } .s-ok { color: #060; } .s-nearLimit { color: #a70; } .s-warn { color: #a70; }
.toc li { margin: 1mm 0; } ol.np { font-size: 8.5pt; color: #444; } .cover dl { display: grid; grid-template-columns: 45mm 1fr; gap: 1mm 4mm; } .cover dt { color: #555; }
.page { page-break-before: always; } @media screen { body { padding: 10mm; } }
`;

export function renderMemoriaHtml(m: MemoriaInput, chosen: ReadonlySet<ChapterId>, c: RenderContext, lang = 'es'): string {
  const on = (id: ChapterId) => chosen.has(id);
  const part = (k: ChapterKey, p: string) => chosen.has(`${k}.${p}` as ChapterId);
  const chapters: Array<{ key: ChapterKey; title: string; body: string }> = [];
  const add = (key: ChapterKey, body: string) => { if (on(key) && body.trim()) chapters.push({ key, title: c.tr(`memo.ch.${key}`), body }); };
  const num = (v: number, d = 2) => c.fmt(v, d);

  // ── Scope and exclusions
  add('scope', `<p>${esc(c.tr('memo.scope.lead'))}</p>` + table(
    [c.tr('memo.scope.feature'), c.tr('memo.scope.code'), c.tr('memo.scope.clauses'), c.tr('memo.scope.state')],
    m.scope.map((s) => [esc(c.tr(s.feature)), esc(codeName(s.code, c.tr)), esc(s.clauses.join(', ')), s.offered ? c.tr('memo.scope.evaluated') : EXPERIMENTAL_CODES.has(s.code) ? `<span>${esc(c.tr('memo.scope.experimental'))}</span>${s.limitation ? `<br><span class="muted">${esc(s.limitation)}</span>` : ''}` : `<span class="s-fail">${esc(c.tr('memo.scope.excluded'))}</span>${s.limitation ? `<br><span class="muted">${esc(s.limitation)}</span>` : ''}`])));

  // ── Modelling hypotheses
  const h = m.hypotheses;
  add('hypotheses', `<ul>${h.analysis.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`
    + (h.stiffness.length ? `<h3>${esc(c.tr('memo.hyp.stiffness'))}</h3>` + table([c.tr('memo.hyp.members'), 'A', 'Iy', 'Iz', 'J', c.tr('memo.hyp.count')], h.stiffness.map((s) => [esc(s.label), num(s.a), num(s.iy), num(s.iz), num(s.j), String(s.count)])) : '')
    + (h.diaphragms.length ? `<h3>${esc(c.tr('memo.hyp.diaphragms'))}</h3>` + table([c.tr('memo.hyp.level'), c.tr('memo.hyp.nodes')], h.diaphragms.map((d) => [esc(d.level), String(d.nodes)])) : `<p>${esc(c.tr('memo.hyp.noDiaphragms'))}</p>`)
    + (h.shells.length ? `<h3>${esc(c.tr('memo.hyp.shells'))}</h3>` + table([c.tr('memo.hyp.kind'), c.tr('memo.hyp.count'), c.tr('memo.hyp.thickness')], h.shells.map((s) => [esc(s.kind), String(s.count), `${num(s.thickness * 100, 1)} cm`])) : '')
    + (h.supports.length ? `<h3>${esc(c.tr('memo.hyp.supports'))}</h3>` + table([c.tr('memo.hyp.kind'), c.tr('memo.hyp.count')], h.supports.map((s) => [esc(s.kind), String(s.count)])) : ''));

  // ── Actions
  const a = m.actions, b = a.basis;
  add('actions', table([c.tr('memo.act.case'), c.tr('memo.act.type'), c.tr('memo.act.loads')], a.cases.map((x) => [esc(x.name), esc(x.type), String(x.loads)]))
    + (a.combinations.length ? `<h3>${esc(c.tr('memo.act.combinations'))}</h3>` + table([c.tr('memo.act.combination'), c.tr('memo.act.expression')], a.combinations.map((x) => [esc(x.name), esc(x.expression)])) : '')
    + (b ? `<h3>${esc(c.tr('memo.act.basis'))}</h3>`
      + table([c.tr('memo.act.factor'), c.tr('memo.ficha.value'), c.tr('memo.act.origin'), c.tr('memo.ficha.source')],
        Object.entries(b.factors).map(([k, v]) => [esc(c.tr(`memo.act.f.${k}`)), `${num(v.value, 2)} ${esc(v.unit ?? '')}`, esc(c.tr(`memo.act.origin.${v.origin}`)) + (v.assumption ? `<br><span class="muted">${esc(c.msg(v.assumption))}</span>` : ''), esc(v.refs.map(clauseRef).join('; '))]))
      + (b.levels.length ? table([c.tr('memo.hyp.level'), c.tr('memo.act.area'), c.tr('memo.act.weight')], b.levels.map((l) => [`+${num(l.elevation)}`, `${num(l.planAreaM2, 1)} m²`, `${num(l.weightKN, 1)} kN`])) : '')
      + (b.derivation.length ? `<h3>${esc(c.tr('memo.act.derivation'))}</h3><ol>${b.derivation.map((d) => `<li>${esc(c.msg(d))}</li>`).join('')}</ol>` : '')
      + (b.assumptions.length ? `<h3>${esc(c.tr('memo.act.assumptions'))}</h3><ul>${b.assumptions.map((d) => `<li>${esc(c.msg(d))}</li>`).join('')}</ul>` : '')
      + (b.refs.length ? `<p class="muted">${esc(b.refs.map(clauseRef).join(' · '))}</p>` : '')
      : `<p class="muted">${esc(c.tr('memo.act.noBasis'))}</p>`));

  // ── Global analysis
  const g = m.global;
  add('global',
    (part('global', 'modal') && g.modal?.length ? `<h3>${esc(c.tr('memo.glob.modal'))}</h3>` + table([c.tr('memo.glob.mode'), 'T (s)', 'Mx (%)', 'My (%)', 'ΣMx (%)', 'ΣMy (%)'], g.modal.map((r) => [String(r.mode), num(r.period, 3), num(r.mx * 100, 1), num(r.my * 100, 1), num(r.cumX * 100, 1), num(r.cumY * 100, 1)])) : '')
    + (part('global', 'storeyShear') && g.storeyShear?.length ? `<h3>${esc(c.tr('memo.glob.shear'))}</h3>` + table([c.tr('memo.hyp.level'), 'Vx (kN)', 'Vy (kN)', 'Kx (kN/m)', 'Ky (kN/m)', c.tr('memo.glob.soft')], g.storeyShear.map((r) => [esc(r.level), num(r.vx, 1), num(r.vy, 1), r.kx === null ? '—' : num(r.kx, 0), r.ky === null ? '—' : num(r.ky, 0), r.soft ? `<span class="s-fail">${esc(c.tr('memo.glob.yes'))}</span>` : '—'])) + `<p class="muted">${esc(c.tr('memo.glob.softBasis'))}</p>` : '')
    + (part('global', 'drift') && g.drift?.rows.length ? `<h3>${esc(c.tr('memo.glob.drift'))}</h3><p class="muted">${esc(c.tr('memo.glob.driftBasis', { cd: num(g.drift.cd, 1), limit: num(g.drift.limit, 4) }))}</p>` + table([c.tr('memo.hyp.level'), 'Δx/h', 'Δy/h', c.tr('memo.summary.state')], g.drift.rows.map((r) => [esc(r.level), num(r.ratioX, 4), num(r.ratioY, 4), esc(r.status)])) : ''));

  // ── Summary of the structure
  const byFamily = (f: string) => m.elements.filter((e) => e.family === f);
  const verdict = m.verdict && m.verdict.state !== 'empty'
    ? `<p class="verdict ${m.verdict.state}"><b>${esc(c.tr('verdict.memo.projectState'))}:</b> ${esc(m.verdict.text)}</p>${m.verdict.reasons.length ? `<ul class="muted">${m.verdict.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}` : '';
  add('summary', verdict + MEMBER_FAMILIES.filter((f) => byFamily(f).length).map((f) => `<h3>${esc(c.tr(`memo.fam.${f}`))}</h3>` + familySummary(byFamily(f), c, f)).join(''));

  // ── The members, ficha by ficha
  add('members', MEMBER_FAMILIES.filter((f) => part('members', f) && byFamily(f).length).map((f) => `<h3>${esc(c.tr(`memo.fam.${f}`))}</h3>` + byFamily(f).map((e) =>
    `<h4>${esc(e.name)}${e.level ? ` — ${esc(e.level)}` : ''}</h4>` + elementStateLine(e, c, f) + (e.data.length ? table([c.tr('memo.el.datum'), c.tr('memo.ficha.value')], e.data.map(([k, v]) => [esc(k), esc(v)])) : '')
    + (e.notes.length ? `<ul class="muted">${e.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '')
    + (e.rows.length ? e.rows.map((r) => renderFicha(r, c)).join('') : `<p class="muted">${esc(c.tr('memo.el.noChecks'))}</p>`)).join('')).join(''));

  // ── Notices
  add('notices', (m.notices.automatic.length ? `<h3>${esc(c.tr('memo.not.automatic'))}</h3><ul>${m.notices.automatic.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '')
    + (m.notices.manual.length ? `<h3>${esc(c.tr('memo.not.manual'))}</h3><ul>${m.notices.manual.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '')
    || `<p class="muted">${esc(c.tr('memo.not.none'))}</p>`);

  // ── Quantities
  const q = m.quantities;
  add('quantities',
    (part('quantities', 'byLevel') && q.byLevel.length ? `<h3>${esc(c.tr('memo.qty.byLevel'))}</h3>` + table([c.tr('memo.hyp.level'), c.tr('memo.qty.concrete'), c.tr('memo.qty.formwork'), c.tr('memo.qty.steel')], q.byLevel.map((r) => [esc(r.level), `${num(r.concrete, 2)} m³`, `${num(r.formwork, 1)} m²`, `${num(r.steel, 0)} kg`])) : '')
    + (part('quantities', 'byType') && q.byType.length ? `<h3>${esc(c.tr('memo.qty.byType'))}</h3>` + table([c.tr('memo.hyp.kind'), c.tr('memo.hyp.count'), c.tr('memo.qty.concrete'), c.tr('memo.qty.formwork'), c.tr('memo.qty.steel')], q.byType.map((r) => [esc(c.tr(`memo.kind.${r.kind}`)), String(r.count), `${num(r.concrete, 2)} m³`, `${num(r.formwork, 1)} m²`, `${num(r.steel, 0)} kg`])) : '')
    + (part('quantities', 'rebar') && q.rebar.length ? `<h3>${esc(c.tr('memo.qty.rebar'))}</h3>` + table(['Ø', c.tr('memo.qty.length'), c.tr('memo.qty.mass')], [...q.rebar.map((r) => [`Ø${r.diameter}`, `${num(r.length, 1)} m`, `${num(r.mass, 1)} kg`]), [c.tr('memo.qty.total'), `${num(q.rebar.reduce((s, r) => s + r.length, 0), 1)} m`, `${num(q.rebar.reduce((s, r) => s + r.mass, 0), 1)} kg`]]) : '')
    + (part('quantities', 'steel') && q.steel.length ? `<h3>${esc(c.tr('memo.qty.profiles'))}</h3>` + table([c.tr('memo.qty.profile'), c.tr('memo.hyp.count'), c.tr('memo.qty.length'), c.tr('memo.qty.mass')], [...q.steel.map((r) => [esc(r.profile), String(r.count), `${num(r.length, 1)} m`, `${num(r.mass, 1)} kg`]), [c.tr('memo.qty.total'), '', '', `${num(q.steel.reduce((s, r) => s + r.mass, 0), 1)} kg`]]) : '')
    + (part('quantities', 'connections') && q.connections.length ? `<h3>${esc(c.tr('memo.qty.connections'))}</h3>` + table([c.tr('memo.qty.item'), c.tr('memo.hyp.count'), c.tr('memo.qty.mass')], q.connections.map((r) => [esc(r.item), String(r.count), r.mass ? `${num(r.mass, 1)} kg` : '—'])) : ''));

  // ── Cover and contents, numbered as printed
  const p = m.project;
  const cover = on('cover') ? `<section class="cover"><h1>${esc(c.tr('memo.title'))}</h1><dl>
<dt>${esc(c.tr('sheet.tb.project'))}</dt><dd>${esc(p.name)}${p.jobNumber ? ` (${esc(p.jobNumber)})` : ''}</dd>
${p.client ? `<dt>${esc(c.tr('memo.cover.client'))}</dt><dd>${esc(p.client)}</dd>` : ''}${p.site ? `<dt>${esc(c.tr('memo.cover.site'))}</dt><dd>${esc(p.site)}</dd>` : ''}
${p.designer ? `<dt>${esc(c.tr('sheet.tb.designer'))}</dt><dd>${esc(p.designer)}</dd>` : ''}${p.checker ? `<dt>${esc(c.tr('sheet.tb.checker'))}</dt><dd>${esc(p.checker)}</dd>` : ''}
<dt>${esc(c.tr('memo.cover.date'))}</dt><dd>${esc(p.date)}</dd>${p.revision ? `<dt>${esc(c.tr('sheet.tb.revision'))}</dt><dd>${esc(p.revision)}</dd>` : ''}
<dt>${esc(c.tr('memo.cover.codes'))}</dt><dd>${esc(m.codes.join('; '))}</dd></dl>
<p class="muted">${esc(c.tr('memo.cover.note'))}</p>
<ol class="toc">${chapters.map((x) => `<li>${esc(x.title)}</li>`).join('')}</ol></section>` : '';
  const body = chapters.map((x, i) => `<section class="chapter${i === 0 && !cover ? '' : ' page'}" data-chapter="${x.key}"><h2>${i + 1}. ${esc(x.title)}</h2>${x.body}</section>`).join('\n');
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><title>${esc(c.tr('memo.title'))} — ${esc(p.name)}</title><style>${STYLE}</style></head><body>${cover}${body}</body></html>`;
}

export { ALL_CHAPTERS, CHAPTERS };
