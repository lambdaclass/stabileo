<script lang="ts">
  /** The kinds of footing as drawn chips: each in section, its column and the ground. */
  import { t } from '../../../lib/i18n';

  type PlacedKind = 'isolated' | 'combined' | 'strip' | 'pileCap';
  let { value = $bindable() }: { value: PlacedKind } = $props();
  const KINDS: PlacedKind[] = ['isolated', 'combined', 'strip', 'pileCap'];
</script>

<div class="fk" role="radiogroup" aria-label={t('fdn.kind')}>
  {#each KINDS as k (k)}
    <button type="button" class="fk-chip" class:on={value === k} role="radio" aria-checked={value === k} onclick={() => (value = k)} data-testid="foundation-kind-{k}">
      <svg viewBox="0 0 40 28" aria-hidden="true">
        <line class="gnd" x1="1" y1="12" x2="39" y2="12" />
        {#if k === 'isolated'}<rect class="col" x="17" y="2" width="6" height="14" /><rect class="el" x="9" y="16" width="22" height="6" />
        {:else if k === 'combined'}<rect class="col" x="8" y="2" width="5" height="14" /><rect class="col" x="27" y="2" width="5" height="14" /><rect class="el" x="3" y="16" width="34" height="6" />
        {:else if k === 'strip'}<rect class="col" x="17" y="1" width="6" height="15" /><rect class="el" x="11" y="16" width="18" height="5" /><path class="ctx-l" d="M4 24h32" />
        {:else}<rect class="col" x="17" y="2" width="6" height="10" /><rect class="el" x="8" y="12" width="24" height="6" /><rect class="pile" x="11" y="18" width="4" height="9" /><rect class="pile" x="25" y="18" width="4" height="9" />{/if}
      </svg>
      <span>{t(`fdn.kind.${k}`)}</span>
    </button>
  {/each}
</div>

<style>
  .fk { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
  .fk-chip { display: flex; flex-direction: column; align-items: center; gap: 1px; width: 4.6rem; padding: 3px 2px;
    background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer; color: var(--st-text-2); }
  .fk-chip.on { border-color: var(--st-accent); color: var(--st-text); background: var(--st-surface-3); }
  .fk-chip span { font-size: 0.6rem; line-height: 1.1; text-align: center; }
  .fk-chip svg { width: 40px; height: 28px; }
  .fk-chip .el { fill: color-mix(in srgb, var(--st-accent) 25%, transparent); stroke: var(--st-accent); stroke-width: 1.3; }
  .fk-chip .col { fill: var(--st-surface-3); stroke: var(--st-text-3); stroke-width: 0.8; }
  .fk-chip .pile { fill: var(--st-surface-3); stroke: var(--st-text-2); stroke-width: 0.8; }
  .fk-chip .gnd, .fk-chip .ctx-l { stroke: var(--st-text-3); stroke-width: 0.8; fill: none; }
</style>
