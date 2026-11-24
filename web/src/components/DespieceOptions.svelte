<script lang="ts">
  /**
   * What the despiece shows, under its entry in Advanced: which pieces carry their actions, in
   * which components, with or without the loads and reactions, and how big the arrows and the
   * values are drawn. Two groups, each row a label and one control, in the panel's own style.
   */
  import { t } from '../lib/i18n';
  import { uiStore, resultsStore } from '../lib/store';
  import { relabelComponents } from '../lib/axes/user-names';

  type Seg<T extends string> = Array<{ id: T; key: string; hint?: string }>;
  const PIECES: Seg<'members' | 'nodes' | 'all'> = [
    { id: 'members', key: 'despiece.vMembers' },
    { id: 'nodes', key: 'despiece.vNodes' },
    { id: 'all', key: 'despiece.vBoth' },
  ];
  const BASES: Seg<'local' | 'global'> = [
    { id: 'local', key: 'despiece.basisLocalShort', hint: 'despiece.basisLocalHint' },
    { id: 'global', key: 'despiece.basisGlobalShort', hint: 'despiece.basisGlobalHint' },
  ];
  const LOADS: Seg<'off' | 'resultant' | 'all'> = [
    { id: 'off', key: 'despiece.loadsOff' },
    { id: 'resultant', key: 'despiece.loadsResultant' },
    { id: 'all', key: 'despiece.loadsAll' },
  ];
  const times = (v: number) => `${v.toFixed(1)}×`;
</script>

<div class="dp" data-testid="despiece-options">
  <div class="dp-group">
    <span class="dp-h">{t('despiece.panelShow')}</span>

    <div class="dp-row">
      <span class="dp-l">{t('despiece.actionsOn')}</span>
      <div class="dp-seg" role="group" aria-label={t('despiece.actionsOn')}>
        {#each PIECES as o (o.id)}
          <button type="button" class:on={uiStore.despieceVectorMode === o.id} aria-pressed={uiStore.despieceVectorMode === o.id}
            onclick={() => (uiStore.despieceVectorMode = o.id)} data-testid={`despiece-pieces-${o.id}`}>{t(o.key)}</button>
        {/each}
      </div>
    </div>

    <div class="dp-row">
      <span class="dp-l">{t('despiece.components')}</span>
      <div class="dp-seg" role="group" aria-label={t('despiece.components')}>
        {#each BASES as o (o.id)}
          <button type="button" class:on={uiStore.despieceBasis === o.id} aria-pressed={uiStore.despieceBasis === o.id}
            title={o.hint ? relabelComponents(t(o.hint)) : undefined} onclick={() => (uiStore.despieceBasis = o.id)}>{relabelComponents(t(o.key))}</button>
        {/each}
      </div>
    </div>
    <label class="dp-check">
      <input type="checkbox" bind:checked={uiStore.despieceCombineVectors} />
      {t('despiece.resultantPerEnd')}
    </label>

    <div class="dp-row">
      <span class="dp-l">{t('despiece.loads')}</span>
      <div class="dp-seg" role="group" aria-label={t('despiece.loads')}>
        {#each LOADS as o (o.id)}
          <button type="button" class:on={uiStore.despieceLoadMode === o.id} aria-pressed={uiStore.despieceLoadMode === o.id}
            onclick={() => (uiStore.despieceLoadMode = o.id)}>{t(o.key)}</button>
        {/each}
      </div>
    </div>
    <label class="dp-check">
      <input type="checkbox" bind:checked={resultsStore.showReactions} />
      {t('despiece.reactionsAtSupports')}
    </label>
  </div>

  <div class="dp-group">
    <span class="dp-h">{t('despiece.panelSize')}</span>
    <label class="dp-row">
      <span class="dp-l">{t('despiece.arrows')}</span>
      <input class="dp-range" type="range" min="0.5" max="2" step="0.1" bind:value={uiStore.despieceVectorSize} />
      <span class="dp-v">{times(uiStore.despieceVectorSize)}</span>
    </label>
    <label class="dp-row">
      <span class="dp-l">{t('despiece.values')}</span>
      <input class="dp-range" type="range" min="0.6" max="2" step="0.1" bind:value={uiStore.despieceLabelSize} />
      <span class="dp-v">{times(uiStore.despieceLabelSize)}</span>
    </label>
  </div>

  <p class="dp-tip">{t('despiece.inspectTip')}</p>
</div>

<style>
  .dp {
    grid-column: span 2;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 10px 8px;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
  }
  .dp-group { display: flex; flex-direction: column; gap: 6px; }
  .dp-group + .dp-group { border-top: 1px solid var(--st-hair); padding-top: 9px; }
  .dp-h { font-size: 0.68rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--st-text-3); }
  .dp-row { display: grid; grid-template-columns: 6.4em 1fr auto; align-items: center; gap: 8px; font-size: 0.74rem; color: var(--st-text-2); }
  .dp-row .dp-seg { grid-column: 2 / span 2; }
  .dp-l { white-space: nowrap; }
  .dp-seg { display: flex; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); overflow: hidden; min-width: 0; }
  .dp-seg button {
    flex: 1 1 auto;
    min-width: 0;
    padding: 4px 6px;
    background: none;
    border: none;
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dp-seg button + button { border-left: 1px solid var(--st-hair-strong); }
  .dp-seg button:hover { color: var(--st-text); }
  .dp-seg button.on { background: var(--st-selected-bg); color: var(--st-text); }
  .dp-check { display: flex; align-items: center; gap: 6px; padding-left: calc(6.4em + 8px); font-size: 0.72rem; color: var(--st-text-2); cursor: pointer; }
  .dp-check input, .dp-range { accent-color: var(--st-accent); }
  .dp-range { width: 100%; min-width: 0; }
  .dp-v { font-variant-numeric: tabular-nums; color: var(--st-text-3); font-size: 0.7rem; min-width: 2.6em; text-align: right; }
  .dp-tip { margin: 0; font-size: 0.7rem; color: var(--st-text-3); }
</style>
