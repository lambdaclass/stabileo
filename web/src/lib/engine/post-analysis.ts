/**
 * The report after an analysis: one list of what to look at, in three parts. The model (its
 * checks and the solver's findings about it), the analysis (equilibrium of each case, the P-Delta
 * iteration, a mechanism) and, with the design on, the members that do not verify. Each line can
 * name the objects it is about, so a click selects them. Pure: the caller gathers the inputs.
 */
import type { SolverDiagnostic } from './types';
import { selectionOf } from './model-findings';
import { staticsVerdict } from './statics-check';

export type PostAnalysisPart = 'model' | 'analysis' | 'design';
export type PostAnalysisSeverity = 'error' | 'warning' | 'info' | 'ok';

export interface PostAnalysisLine {
  part: PostAnalysisPart;
  severity: PostAnalysisSeverity;
  text: string;
  detail?: string;
  selection?: { nodes: number[]; elements: number[]; shells: string[] };
}

export interface PostAnalysisInput {
  diagnostics: readonly SolverDiagnostic[];
  /** Equilibrium of each solved case: applied plus reactions over their scale. */
  statics: ReadonlyArray<{ caseName: string; worstRelative: number; uncovered: readonly string[] }> | null;
  pdelta: { converged: boolean; iterations: number; isStable: boolean; b2Factor: number } | null;
  mechanism: { mechanismModes: number; mechanismNodes: readonly number[]; unconstrainedDofs: ReadonlyArray<{ nodeId: number }> } | null;
  /** Members the design reads that it does not approve; null with the design off. */
  design: { total: number; members: ReadonlyArray<{ elementId: number; status: string; reasons: readonly string[] }> } | null;
}

type Tr = (k: string, p?: Record<string, string | number>) => string;

/** Below this, a case balances: round-off, as `statics-rows` reads it. */
export const POST_ANALYSIS_BALANCED = 1e-6;
/** Above this, an unbalanced case is an error rather than a warning. */
export const POST_ANALYSIS_UNBALANCED = 1e-3;

const pct = (r: number) => `${(r * 100).toPrecision(2)} %`;

export function postAnalysisLines(input: PostAnalysisInput, tr: Tr): PostAnalysisLine[] {
  const out: PostAnalysisLine[] = [];
  for (const d of input.diagnostics) {
    const sel = selectionOf(d);
    out.push({ part: d.source === 'model' ? 'model' : 'analysis', severity: d.severity, text: tr(d.message), ...(sel ? { selection: sel } : {}) });
  }

  if (input.mechanism && input.mechanism.mechanismModes > 0) {
    const nodes = [...new Set([...input.mechanism.mechanismNodes, ...input.mechanism.unconstrainedDofs.map((d) => d.nodeId)])];
    out.push({ part: 'analysis', severity: 'error', text: tr('post.mechanism', { modes: input.mechanism.mechanismModes, nodes: nodes.length }), selection: { nodes, elements: [], shells: [] } });
  }

  if (input.statics) {
    const name = (r: { caseName: string }) => r.caseName || tr('post.singleSolve');
    const uncovered = (r: { uncovered: readonly string[] }) => (r.uncovered.length ? { detail: tr('post.uncovered', { kinds: r.uncovered.join(', ') }) } : {});
    const balanced: number[] = [];
    for (const r of input.statics) {
      const verdict = staticsVerdict(r, POST_ANALYSIS_BALANCED);
      if (verdict === 'unbalanced') {
        out.push({
          part: 'analysis', severity: r.worstRelative >= POST_ANALYSIS_UNBALANCED ? 'error' : 'warning',
          text: tr('post.unbalanced', { name: name(r), residual: pct(r.worstRelative) }), ...uncovered(r),
        });
      } else if (verdict === 'partial') {
        out.push({ part: 'analysis', severity: 'warning', text: tr('post.partial', { name: name(r) }), ...uncovered(r) });
      } else balanced.push(r.worstRelative);
    }
    if (balanced.length) out.push({ part: 'analysis', severity: 'ok', text: tr('post.balanced', { n: balanced.length, residual: Math.max(...balanced).toExponential(1) }) });
  }

  if (input.pdelta) {
    const p = input.pdelta;
    out.push({
      part: 'analysis',
      severity: !p.isStable ? 'error' : !p.converged ? 'warning' : 'ok',
      text: tr(!p.isStable ? 'post.pdeltaUnstable' : p.converged ? 'post.pdeltaConverged' : 'post.pdeltaNotConverged', { n: p.iterations, b2: p.b2Factor.toFixed(2) }),
    });
  }

  if (input.design) {
    const failing = input.design.members;
    if (failing.length === 0 && input.design.total > 0) out.push({ part: 'design', severity: 'ok', text: tr('post.designAllVerify', { n: input.design.total }) });
    for (const m of failing) {
      out.push({
        part: 'design', severity: m.status === 'fail' ? 'error' : 'warning',
        text: tr('post.memberNotVerified', { id: m.elementId, status: tr(`post.status.${m.status}`) }),
        ...(m.reasons.length ? { detail: m.reasons.join(' · ') } : {}),
        selection: { nodes: [], elements: [m.elementId], shells: [] },
      });
    }
  }
  return out;
}

const ORDER: Record<PostAnalysisSeverity, number> = { error: 0, warning: 1, info: 2, ok: 3 };

/** The lines of one part, the most serious first; the order within a severity kept. */
export function partLines(lines: readonly PostAnalysisLine[], part: PostAnalysisPart): PostAnalysisLine[] {
  return lines.map((l, i) => ({ l, i })).filter((x) => x.l.part === part)
    .sort((a, b) => ORDER[a.l.severity] - ORDER[b.l.severity] || a.i - b.i).map((x) => x.l);
}

/** The lines as CSV rows: part, severity, text, detail and the objects they name. */
export function postAnalysisRows(lines: readonly PostAnalysisLine[], tr: Tr): string[][] {
  const objs = (s: PostAnalysisLine['selection']) => s ? [...s.nodes.map((n) => `N${n}`), ...s.elements.map((e) => `E${e}`), ...s.shells].join(' ') : '';
  return lines.map((l) => [tr(`post.part.${l.part}`), tr(`post.sev.${l.severity}`), l.text, l.detail ?? '', objs(l.selection)]);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The report as a document: a title, then each part with its lines. */
export function postAnalysisHtml(lines: readonly PostAnalysisLine[], tr: Tr, title: string, subtitle: string): string {
  const parts: PostAnalysisPart[] = ['model', 'analysis', 'design'];
  const body = parts.map((p) => {
    const ls = partLines(lines, p);
    if (!ls.length) return '';
    const rows = ls.map((l) => `<tr><td class="sev sev-${l.severity}">${esc(tr(`post.sev.${l.severity}`))}</td><td>${esc(l.text)}${l.detail ? `<br><small>${esc(l.detail)}</small>` : ''}</td></tr>`).join('');
    return `<h2>${esc(tr(`post.part.${p}`))} (${ls.length})</h2><table><tbody>${rows}</tbody></table>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(title)}</title><style>
body{font-family:Georgia,serif;font-size:11px;color:#222;max-width:190mm;margin:10mm auto}
h1{font-size:20px;color:#0a3060;border-bottom:2px solid #0a3060}h2{font-size:14px;color:#1a5090;margin-top:18px}
table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #ddd;padding:3px 6px;vertical-align:top}
.sev{white-space:nowrap;font-weight:bold}.sev-error{color:#c0392b}.sev-warning{color:#b7791f}.sev-ok{color:#2e7d32}.sev-info{color:#555}
</style></head><body><h1>${esc(title)}</h1><p>${esc(subtitle)}</p>${body || `<p>${esc(tr('post.nothing'))}</p>`}</body></html>`;
}
