<script lang="ts">
  /**
   * Story drift under each seismic case, checked against INPRES-CIRSOC 103 Tabla 6.4
   * (`engine/seismic-drift.ts`). C_d and the destination group come from the project's seismic
   * settings, the ones the regulation load generator records; the condition D or ND is the
   * engineer's statement about the non-structural elements, and D is the stricter default.
   */
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { regulationsStore } from '../../lib/store/regulations.svelte';
  import { findBehaviour } from '../../lib/codes/cirsoc103/behaviour';
  import { seismicDrifts, type DriftCondition } from '../../lib/engine/seismic-drift';
  import { shouldEmbedFlat2DModelIn3D } from '../../lib/engine/solver-service';
  import type { DestinationGroup } from '../../lib/codes/cirsoc103/spectrum';

  let condition = $state<DriftCondition>('D');

  const settings = $derived(regulationsStore.binding('seismic').settings as {
    destinationGroup?: DestinationGroup; systemKey?: string;
  });
  const cd = $derived(settings.systemKey ? findBehaviour(settings.systemKey)?.cd ?? null : null);
  const group = $derived(settings.destinationGroup ?? null);
  const seismicCases = $derived(modelStore.model.loadCases.filter((c) => (c.type || '').toUpperCase() === 'E'));

  const tables = $derived.by(() => {
    if (cd === null || group === null) return [];
    const embedded2D = shouldEmbedFlat2DModelIn3D(modelStore.model as never);
    return seismicCases.flatMap((c) => {
      const r = resultsStore.perCase3D.get(c.id);
      if (!r) return [];
      const out = seismicDrifts({
        nodes: modelStore.nodes, elements: modelStore.elements.values(),
        displacements: r.displacements, cd, group, condition, embedded2D,
      });
      return out ? [{ caseId: c.id, name: c.name, ...out }] : [];
    });
  });

  const pct = (v: number) => (v * 100).toFixed(2);
  function pick(ids: number[]) {
    uiStore.selectMode = 'elements';
    ids.forEach((id, i) => uiStore.selectElement(id, i > 0));
  }
</script>

<div class="sd" data-testid="drift-panel">
  <div class="sd-bar">
    <span class="sd-label">{t('drift.condition')}</span>
    <div class="pk-tabs">
      <button class:on={condition === 'D'} onclick={() => (condition = 'D')} data-testid="drift-cond-D">{t('drift.conditionD')}</button>
      <button class:on={condition === 'ND'} onclick={() => (condition = 'ND')} data-testid="drift-cond-ND">{t('drift.conditionND')}</button>
    </div>
  </div>

  {#if seismicCases.length === 0}
    <p class="sd-note" data-testid="drift-none">{t('drift.noSeismicCases')}</p>
  {:else if cd === null || group === null}
    <p class="sd-note" data-testid="drift-no-settings">{t('drift.noSettings')}</p>
  {:else if group === 'C'}
    <p class="sd-note" data-testid="drift-group-c">{t('drift.groupC')}</p>
  {:else if tables.length === 0}
    <p class="sd-note">{t('drift.solveFirst')}</p>
  {:else}
    <p class="sd-note">{tp('drift.basis', { cd, group, limit: pct(tables[0]!.limit) })}</p>
    {#each tables as tb (tb.caseId)}
      <div class="sd-case">{tb.name}</div>
      <div class="pro-res-table-wrap">
        <table class="pro-res-table" data-testid="drift-table-{tb.caseId}">
          <thead><tr>
            <th>{t('drift.level')}</th><th>h (m)</th><th>θx (%)</th><th>θy (%)</th><th>{t('drift.limit')}</th>
          </tr></thead>
          <tbody>
            {#each tb.stories as s (s.level)}
              {@const worst = Math.max(s.ratioX, s.ratioY)}
              <tr onclick={() => pick([s.columnX, s.columnY])} style="cursor:pointer">
                <td class="col-num">{s.level.toFixed(2)}</td>
                <td class="col-num">{s.height.toFixed(2)}</td>
                <td class="col-num">{pct(s.ratioX)}</td>
                <td class="col-num">{pct(s.ratioY)}</td>
                <td class="sd-{s.status}">{s.status === 'fail' ? '✗' : '✓'} {(worst / tb.limit * 100).toFixed(0)} %</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/each}
    <p class="sd-note">{t('drift.note')}</p>
  {/if}
</div>

<style>
  .sd-bar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 4px 0 6px; }
  .sd-label, .sd-note { font-size: 0.6rem; color: var(--st-text-3); }
  .sd-note { margin: 4px 0; }
  .sd-case { margin-top: 6px; font-size: 0.66rem; color: var(--st-text-2); }
  .sd-ok { color: var(--st-ok); }
  .sd-warn { color: var(--st-warn); }
  .sd-fail { color: var(--st-danger); }
</style>
