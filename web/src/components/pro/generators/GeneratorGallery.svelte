<script lang="ts">
  /**
   * What the Generators panel opens on: every generator, grouped by what it makes, each a card
   * with a drawing of what it generates by default and its name (`pro/generator-catalog.ts`).
   * A card opens that generator's parameters.
   */
  import { t } from '../../../lib/i18n';
  import { GENERATOR_CATALOG, sampleOf, type GeneratorEntry } from '../../../lib/pro/generator-catalog';
  import TopologyPreview from './TopologyPreview.svelte';

  interface Props { onPick: (e: GeneratorEntry) => void }
  let { onPick }: Props = $props();

  // Drawn once: the samples come from the defaults, which do not change.
  const samples = new Map(GENERATOR_CATALOG.flatMap((c) => c.entries).map((e) => [e.id, sampleOf(e)]));
</script>

<div class="gg" data-testid="gen-gallery">
  {#each GENERATOR_CATALOG as cat (cat.id)}
    <section class="gg-cat">
      <h4 class="gg-title">{t(cat.labelKey)}</h4>
      <div class="gg-grid">
        {#each cat.entries as e (e.id)}
          {@const sample = samples.get(e.id)}
          <button type="button" class="gg-card" onclick={() => onPick(e)} data-testid="gen-card-{e.id}">
            <span class="gg-fig">
              {#if sample}<TopologyPreview topology={sample} view={e.view} label={t(e.labelKey)} heightPx={74} />{/if}
            </span>
            <span class="gg-name">{t(e.labelKey)}</span>
          </button>
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .gg { display: flex; flex-direction: column; gap: 12px; margin-top: 6px; }
  .gg-cat { display: flex; flex-direction: column; gap: 6px; }
  .gg-title {
    margin: 0; padding-bottom: 3px; border-bottom: 1px solid var(--st-hair);
    font-family: var(--st-mono); font-size: 0.64rem; font-weight: 400; letter-spacing: 0.1em; text-transform: uppercase; color: var(--st-text-3);
  }
  .gg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
  .gg-card {
    display: flex; flex-direction: column; align-items: stretch; gap: 4px; padding: 6px;
    background: var(--st-surface-2); border: 1px solid var(--st-hair); border-radius: var(--st-radius-lg, 8px);
    color: var(--st-text-2); font: inherit; cursor: pointer; text-align: left;
    transition: border-color 0.12s, background 0.12s;
  }
  .gg-card:hover { border-color: var(--st-accent); background: var(--st-surface-3); color: var(--st-text); }
  .gg-card:focus-visible { outline: 2px solid var(--st-interactive); outline-offset: 1px; }
  .gg-fig { display: block; height: 78px; overflow: hidden; pointer-events: none; }
  .gg-name { font-size: 0.72rem; font-weight: 600; color: var(--st-text); }
</style>
