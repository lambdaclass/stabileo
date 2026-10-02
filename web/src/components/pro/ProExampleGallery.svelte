<script lang="ts">
  /**
   * The PRO example gallery, under Project › New model.
   *
   * Each card says what the model is, what it is for, what to look at once it is solved, and
   * its size, with a warning on the heavy ones. Loading one replaces the open model, so when
   * a model is open the card asks first, in place: one more click, and no dialog to lose.
   */
  import { t } from '../../lib/i18n';
  import { modelStore } from '../../lib/store';
  import { isHeavyExample, type ProExample, type ProExampleGroup } from '../../lib/data/pro-examples';

  type Props = { groups: ProExampleGroup[]; onLoad: (ex: ProExample) => void };
  let { groups, onLoad }: Props = $props();

  let asking = $state<string | null>(null);
  const hasModel = () => modelStore.nodes.size > 0 || modelStore.elements.size > 0;

  function choose(ex: ProExample) {
    if (hasModel() && asking !== ex.id) { asking = ex.id; return; }
    asking = null;
    onLoad(ex);
  }
</script>

<div class="pg" data-testid="pp-gallery">
  {#each groups as g (g.group)}
    <div class="pg-group">{g.title}</div>
    {#each g.examples as ex (ex.id)}
      <div class="pg-card" class:asking={asking === ex.id} data-example={ex.id}>
        <button class="pp-ex" onclick={() => choose(ex)} aria-expanded={asking === ex.id}>
          <span class="pg-name">{t(ex.nameKey)}</span>
          <span class="pg-purpose">{t(ex.purposeKey)}</span>
          <span class="pg-desc">{t(ex.descKey)}</span>
          <span class="pg-look"><b>{t('pro.examples.look')}:</b> {t(ex.lookKey)}</span>
          <span class="pg-meta">
            {ex.stats.nodes} {t('pro.stats.nodes')} · {ex.stats.members} {t('pro.stats.members')}
            {#if ex.stats.shells}· {ex.stats.shells} {t('pro.stats.shells')}{/if}
            {#each ex.tags as tag (tag)}<span class="pg-tag">{t(tag)}</span>{/each}
            {#if isHeavyExample(ex)}<span class="pg-heavy">{t('pro.stats.heavy')}</span>{/if}
          </span>
        </button>
        {#if asking === ex.id}
          <div class="pg-ask" data-testid="pp-example-confirm">
            <span>{t('pro.examples.replaceAsk')}</span>
            <button class="pg-go" onclick={() => choose(ex)}>{t('pro.examples.load')}</button>
            <button class="pg-no" onclick={() => (asking = null)}>{t('pro.examples.cancel')}</button>
          </div>
        {/if}
      </div>
    {/each}
  {/each}
</div>

<style>
  .pg {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 6px;
  }

  .pg-group {
    grid-column: 1 / -1;
    margin-top: 6px;
    border-radius: var(--st-radius);
    font-family: var(--st-mono);
    font-size: 0.6rem;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--st-text-3);
    padding: 0.4rem 0.5rem 0.2rem;
    background: var(--st-surface-2);
  }

  .pg-card { border: 1px solid var(--st-hair); border-radius: var(--st-radius); }
  .pg-card.asking { background: var(--st-surface-3); }

  .pp-ex {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 0.4rem 0.5rem;
    cursor: pointer;
  }

  .pp-ex:hover { background: var(--st-surface-3); }
  .pg-name { font-size: 0.76rem; color: var(--st-text); }
  .pg-purpose { font-family: var(--st-mono); font-size: 0.6rem; color: var(--st-text-3); }
  .pg-desc { font-size: 0.66rem; color: var(--st-text-2); }
  .pg-look { font-size: 0.66rem; color: var(--st-text-3); }
  .pg-look b { font-weight: 600; color: var(--st-text-2); }
  .pg-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; font-family: var(--st-mono); font-size: 0.6rem; color: var(--st-text-3); }
  .pg-tag { padding: 0 0.3rem; border: 1px solid var(--st-hair); border-radius: 999px; }
  .pg-heavy { padding: 0 0.3rem; border-radius: 999px; color: var(--st-warn); border: 1px solid var(--st-warn); }

  .pg-ask { display: flex; align-items: center; gap: 0.4rem; padding: 0 0.5rem 0.45rem; font-size: 0.66rem; color: var(--st-text-2); }
  .pg-ask span { flex: 1; }
  .pg-go, .pg-no { font-size: 0.66rem; padding: 0.15rem 0.5rem; border-radius: var(--st-radius); cursor: pointer; }
  .pg-go { background: var(--st-accent); color: var(--st-text-on-accent); border: none; }
  .pg-no { background: none; color: var(--st-text-2); border: 1px solid var(--st-hair); }
</style>
