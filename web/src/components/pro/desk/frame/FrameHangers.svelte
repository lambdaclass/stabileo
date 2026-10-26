<script lang="ts">
  /**
   * Hanging steel at the points where another beam bears on this line: the end shear it brings,
   * the steel that hangs it (`beam-hangers.ts`) against what the stirrups place over the stretch,
   * and the command that closes the stirrups up there. The rule has no article in CIRSOC 201, and
   * the panel says so.
   */
  import { t, tp } from '../../../../lib/i18n';
  import { hangersPlaced, withHangers } from '../../../../lib/engine/design/beam-hangers';
  import type { BeamLineReinforcement } from '../../../../lib/design-contract/beam-line';
  import type { IndirectSupport } from '../../../../lib/store/line-hangers';

  let { supports, line, apply }: { supports: IndirectSupport[]; line: BeamLineReinforcement; apply: (next: BeamLineReinforcement) => void } = $props();
</script>

{#if supports.length}
  <section class="fh" data-testid="frame-hangers">
    <h5>{t('frameEd.hangers.title')}</h5>
    {#each supports as s (`${s.elementId}-${s.nodeId}`)}
      {@const placed = hangersPlaced(line.stirrups, s.from, s.to)}
      <div class="fh-row" class:bad={placed + 1e-6 < s.need} data-testid="frame-hanger-{s.elementId}">
        <span>{tp('frameEd.hangers.item', { id: s.elementId, x: s.x.toFixed(2), vu: s.vu.toFixed(1) })}</span>
        <span>{tp('frameEd.hangers.steel', { need: s.need.toFixed(2), placed: placed.toFixed(2), from: s.from.toFixed(2), to: s.to.toFixed(2) })}</span>
        {#if placed + 1e-6 < s.need}
          <button onclick={() => apply(withHangers(line, s.from, s.to, s.need))} data-testid="frame-hanger-place-{s.elementId}">{t('frameEd.hangers.place')}</button>
        {/if}
      </div>
    {/each}
    <p class="fh-hint">{t('frameEd.hangers.basis')}</p>
  </section>
{/if}

<style>
  .fh { border: 1px solid var(--st-hair); border-radius: 4px; padding: 6px 8px; background: var(--st-surface-2); font-size: 0.7rem; margin-top: 6px; }
  .fh h5 { margin: 0 0 4px; font-size: 0.74rem; font-weight: 600; }
  .fh-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 3px; }
  .fh-row.bad { color: var(--st-danger); }
  .fh button { font-size: 0.68rem; padding: 1px 8px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
  .fh-hint { margin: 4px 0 0; color: var(--st-text-3); line-height: 1.35; }
</style>
