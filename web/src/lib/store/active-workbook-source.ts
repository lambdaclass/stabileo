/** The provenance of the result currently displayed, for exports of that result alone. */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { t } from '../i18n';
import { resultCaseName } from '../engine/settlement-case';
import type { WorkbookSource } from '../export/workbook-results';

export function activeWorkbookSource(): WorkbookSource | null {
  const results = resultsStore.results3D;
  if (!results) return null;
  // Advanced analyses temporarily replace the displayed results while retaining the static
  // view selection for Back. Its case/combination/envelope label does not describe this solve.
  if (resultsStore.pdeltaResult3D?.results === results) {
    return { kind: 'single', id: 0, name: t('advanced.pdelta'), results };
  }
  if (resultsStore.spectralResult3D?.results === results) {
    return { kind: 'single', id: 0, name: t('advanced.spectral'), results };
  }
  if (resultsStore.activeView === 'envelope') {
    return { kind: 'envelope', id: 0, name: resultsStore.viewedEnvelopeName ?? t('pro.viewEnvelope'), results };
  }
  if (resultsStore.activeView === 'combo' && resultsStore.activeComboId !== null) {
    const id = resultsStore.activeComboId;
    return { kind: 'combination', id, name: modelStore.combinations.find((c) => c.id === id)?.name ?? String(id), results };
  }
  if (resultsStore.activeView === 'single' && resultsStore.activeCaseId !== null) {
    const id = resultsStore.activeCaseId;
    return { kind: 'case', id, name: resultCaseName(id, modelStore.loadCases, t('svc.settlementCase'), t('pro.caseN')), results };
  }
  return { kind: 'single', id: 0, name: t('pro.statics.singleSolve'), results };
}
