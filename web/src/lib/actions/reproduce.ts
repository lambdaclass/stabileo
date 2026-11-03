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
import { currentResultProvenance, provenanceForScope, ensureEngineHashes } from '../store/result-provenance';
import { compareProvenance, type ResultProvenance, type ReproduceVerdict } from '../provenance/result-provenance';
import { errorText } from '../utils/error-text';
import { t } from '../i18n';
import { buildProReportData } from '../engine/pro-report-inputs';
import { generateReportHtml } from '../engine/pro-report';
import { comparePrinted, embeddedReportConfig, printedTables, type PrintedComparison } from '../engine/report/printed-values';

export type ReproduceOutcome =
  | { ok: true; verdict: ReproduceVerdict; fresh: ResultProvenance; printed?: PrintedComparison | null }
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
  if (outcome.ok && report) outcome.printed = comparePrintedReport(report);
  return outcome;
}

/** The report's printed tables against the same tables printed from the results on hand; null for a report that embeds no choices. */
export function comparePrintedReport(report: string): PrintedComparison | null {
  const config = embeddedReportConfig(report);
  const claimedTables = printedTables(report);
  if (!config) return null;
  const data = buildProReportData({ config, t });
  if (!data) return null;
  return comparePrinted(claimedTables, printedTables(generateReportHtml(data)));
}

/**
 * Compare a report's record with the results on hand, recomputing EXACTLY the result the report
 * claims (its case, combination or envelope), not whatever the view shows now. A claimed result
 * that cannot be selected here (a named envelope not on screen, an advanced analysis, a record
 * written before scopes were recorded) leaves the comparison incomplete, never reproduced.
 */
export function compareWithResultsOnHand(claimed: ResultProvenance): ReproduceOutcome {
  const ref = claimed.scopeRef ?? (claimed.scope === 'single' ? { kind: 'single' as const } : null);
  const fresh = ref ? provenanceForScope(ref) : { ...currentResultProvenance(), scopeRef: undefined };
  if (!fresh.baseResultsHash && !fresh.resultsHash) return { ok: false, error: 'no results' };
  return { ok: true, verdict: compareProvenance(claimed, fresh), fresh };
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
