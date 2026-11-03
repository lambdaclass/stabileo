/**
 * "Reproduce from provenance": solve the open project again and compare every hash with a
 * report's provenance record (`provenance/result-provenance.ts`).
 *
 * The results on hand are dropped first, so the comparison is against a solve that really ran
 * now and not against numbers kept from before. The CLI counterpart, for the engine alone, is
 * `cargo run --release --example reproduce` (docs/verification/PROVENANCE.md).
 */
import { resultsStore } from '../store';
import { certificateStore } from '../store/certificate.svelte';
import { runGlobalSolve } from '../engine/live-calc';
import { currentResultProvenance, currentScopeRef, provenanceForScope, ensureEngineHashes, scopeOfResultSet } from '../store/result-provenance';
import { compareProvenance, sameScope, type ResultProvenance, type ReproduceVerdict, type ScopeRef } from '../provenance/result-provenance';
import { errorText } from '../utils/error-text';
import { i18n, t } from '../i18n';
import { buildProReportData } from '../engine/pro-report-inputs';
import { generateReportHtml } from '../engine/pro-report';
import { comparePrinted, embeddedReportConfig, embeddedReportLocale, printedTables, type PrintedComparison } from '../engine/report/printed-values';

export type ReproduceOutcome =
  | { ok: true; verdict: ReproduceVerdict; fresh: ResultProvenance; printed?: PrintedComparison | null; reportLocale?: string | null }
  | { ok: false; error: string };

/**
 * `report`: the report's own HTML, when that is what was loaded. Its printed result tables are then
 * printed again from the fresh solve, with the report's own choices, and compared cell by cell.
 */
export async function reproduceFrom(claimed: ResultProvenance, report?: string): Promise<ReproduceOutcome> {
  resultsStore.clear();
  try {
    await runGlobalSolve({ directBase: claimed.baseSolveMethod === 'direct' });
  } catch (e) {
    return { ok: false, error: errorText(e, 'error') };
  }
  // A claimed certificate is compared with the re-run's own, which is computed in the background
  // after the solve: wait for it to settle. One still pending is compared as missing (incomplete).
  if ((claimed.certificates ?? []).length > 0) await settledCertificate();
  await ensureEngineHashes();
  const outcome = compareWithResultsOnHand(claimed);
  if (outcome.ok && report) { outcome.printed = comparePrintedReport(report, claimedScope(claimed) ?? undefined); outcome.reportLocale = embeddedReportLocale(report); }
  return outcome;
}

export const OTHER_RESULT_SET = 'result-set';

/**
 * The report's printed tables against the same tables printed from the results on hand, for the
 * result `scope` names (the fingerprint's, which the provenance hash covers; the embedded key is
 * editable and only has to agree with it). Null when the tables cannot be printed again: no
 * embedded choices, no scope, or that result not on hand.
 */
export function comparePrintedReport(report: string, scope: ScopeRef | undefined): PrintedComparison | null {
  const config = embeddedReportConfig(report);
  const claimedTables = printedTables(report);
  if (!config || !scope) return null;
  const key = config.resultSetKey;
  const screen = !key || key === 'screen';
  const printedScope: ScopeRef | null = screen ? (scope.kind === 'other' ? scope : { kind: 'single' }) : scopeOfResultSet(key);
  if (!printedScope || !sameScope(printedScope, scope)) return { compared: 0, differences: [], structural: [OTHER_RESULT_SET], labels: true };
  if (screen && !sameScope(currentScopeRef(), scope)) return null;
  const data = buildProReportData({ config, t });
  if (!data) return null;
  const locale = embeddedReportLocale(report);
  return comparePrinted(claimedTables, printedTables(generateReportHtml(data)), !locale || locale === i18n.locale);
}

/**
 * Compare a report's record with the results on hand, recomputing EXACTLY the result the report
 * claims (its case, combination or envelope), not whatever the view shows now. A claimed result
 * that cannot be selected here (a named envelope not on screen, an advanced analysis, a record
 * written before scopes were recorded) leaves the comparison incomplete, never reproduced.
 */
export function compareWithResultsOnHand(claimed: ResultProvenance): ReproduceOutcome {
  const ref = claimedScope(claimed);
  const fresh = ref ? provenanceForScope(ref) : { ...currentResultProvenance(), scopeRef: undefined };
  if (!fresh.baseResultsHash && !fresh.resultsHash) return { ok: false, error: 'no results' };
  return { ok: true, verdict: compareProvenance(claimed, fresh), fresh };
}

function claimedScope(claimed: ResultProvenance): ScopeRef | null {
  return claimed.scopeRef ?? (claimed.scope === 'single' ? { kind: 'single' } : null);
}

export type CheckStatus = ReproduceVerdict['status'] | 'printed-differs';

/** A report whose tables could not be printed again (`printed` null) is never reproduced: its numbers were not checked. */
export function reproduceStatus(outcome: Extract<ReproduceOutcome, { ok: true }>): { status: CheckStatus; reproduced: boolean } {
  const v = outcome.verdict, p = outcome.printed;
  if (p === null) return { status: v.status === 'reproduced' ? 'incomplete' : v.status, reproduced: false };
  const printedOk = !p || (p.differences.length === 0 && p.structural.length === 0);
  const labelsOk = !p || p.labels;
  const status = !printedOk ? 'printed-differs' : !labelsOk && v.status === 'reproduced' ? 'incomplete' : v.status;
  return { status, reproduced: v.reproduced && printedOk && labelsOk };
}

async function settledCertificate(timeoutMs = 120_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  // The certificate goes pending a short pause after the publish (`certificate.svelte.ts`).
  await new Promise((r) => setTimeout(r, 400));
  // The base solve's certificate and the cases', combinations' and envelope's (`forScope`).
  while (certificateStore.computing && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 100));
  }
}
