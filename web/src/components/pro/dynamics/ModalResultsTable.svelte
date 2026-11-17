<script lang="ts">
  import { axesStore } from '../../../lib/axes/axes.svelte';
  import { modalPresentation, type ModalQuantities } from '../../../lib/axes/modal-presentation';
  import { t } from '../../../lib/i18n';

  let { modes, withheld = false, activeMode, selectMode = () => {} }: {
    modes: Array<ModalQuantities & { frequency: number; period: number }>;
    withheld?: boolean;
    activeMode?: number;
    selectMode?: (index: number) => void;
  } = $props();
  const modalRows = $derived(modalPresentation(axesStore.frame, modes, withheld));
  function fmtNum(n: number): string {
    if (n === 0) return '0';
    if (Math.abs(n) < 0.001) return n.toExponential(2);
    if (Math.abs(n) < 1) return n.toFixed(4);
    return n.toFixed(2);
  }
</script>
        <div class="adv-table-scroll">
          <table class="adv-table modal-table">
            <thead><tr><th>{t('adv.mode')}</th><th>f (Hz)</th><th>T (s)</th><th>{t('adv.participationAbbr')} X</th><th>{t('adv.participationAbbr')} Y</th><th>{t('adv.participationAbbr')} Z</th><th>{t('adv.massRatio')} X</th><th>{t('adv.massRatio')} Y</th><th>{t('adv.massRatio')} Z</th><th>ΣM X</th><th>ΣM Y</th><th>ΣM Z</th></tr></thead>
            <tbody>
              {#each modes as mode, i}
                {@const row = modalRows[i]!}
                <tr class="adv-mode-row" class:adv-mode-on={activeMode === i}
                  title={t('pro.showMode')} data-testid="adv-modal-row-{i}">
                  <td class="col-id"><button class="mode-select" aria-label={`${t('pro.showMode')} ${i + 1}`} aria-pressed={activeMode === i}
                    onclick={() => selectMode(i)}>{i + 1}</button></td>
                  <td class="col-num">{fmtNum(mode.frequency)}</td>
                  <td class="col-num">{fmtNum(mode.period)}</td>
                  {#each row.participation as value}
                    <td class="col-num">{value === undefined ? '—' : fmtNum(value)}</td>
                  {/each}
                  {#each row.massRatios as value}
                    <td class="col-num">{value === undefined ? '—' : `${(value * 100).toFixed(1)}%`}</td>
                  {/each}
                  {#each row.cumulative as value}
                    <td class="col-num" class:cum-warn={value !== undefined && value < 0.9} class:cum-ok={value !== undefined && value >= 0.9}>{value === undefined ? '—' : `${(value * 100).toFixed(1)}%`}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
<style>
  .adv-table-scroll { max-width: 100%; overflow-x: auto; max-height: 150px; overflow-y: auto; }
  .modal-table { width: 100%; min-width: 780px; border-collapse: collapse; table-layout: fixed; }
  th, td { font-size: 12px; padding: 3px 1px; overflow-wrap: anywhere; }
  th { text-align: left; font-weight: 600; color: var(--st-text-3); text-transform: uppercase; background: var(--st-surface); border-bottom: 1px solid var(--st-surface-3); }
  th:first-child { width: 46px; }
  td { border-bottom: 1px solid var(--st-surface-2); color: var(--st-text-2); }
  .col-id { color: var(--st-text-3); font-family: monospace; text-align: center; }
  .col-num { font-family: monospace; text-align: right; }
  .mode-select { min-width: 44px; min-height: 44px; font-size: 12px; cursor: pointer; color: inherit; background: transparent; border: 1px solid var(--st-hair); border-radius: 3px; }
  .cum-warn { color: var(--st-warn); }
  .cum-ok { color: var(--st-ok); }
  .adv-mode-on td { color: var(--st-accent); }
</style>
