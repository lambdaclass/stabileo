<script lang="ts">
  /**
   * What a selection picks up.
   *
   * The pointer mode — select or pan — lives on the model, where the pointer
   * is. What needs a panel is the other half of the question: which KINDS of
   * thing a click or a drag takes. A frame with members, supports and loads
   * stacked on the same nodes cannot be selected usefully without saying which
   * of them you mean, and that choice persists across dozens of gestures.
   *
   * One place, not two: this used to sit in the tool-options strip under the
   * ribbon, shown while the select tool was armed. With the pointer mode no
   * longer a ribbon command there is no "select tool armed" state for that
   * strip to key off, and two controls for one setting is how they end up
   * disagreeing.
   */
  import { uiStore } from '../lib/store';
  import { t } from '../lib/i18n';

  /**
   * Section stress is deliberately absent: it is not a kind of thing to
   * select, it is an analysis, reached from Advanced where it belongs.
   */
  const MODES = [
    { id: 'elements', key: 'float.selectElements', hint: 'float.selectElementsHint' },
    { id: 'nodes', key: 'float.selectNodes', hint: 'float.selectNodesHint' },
    { id: 'supports', key: 'float.selectSupports', hint: 'float.selectSupportsHint' },
    { id: 'loads', key: 'float.selectLoads', hint: 'float.selectLoadsHint' },
  ] as const;
</script>

<div class="sel-panel">
  <!--
    Off by default, and the default is the point: with one kind active a click
    on a node that carries a support and a load has exactly one meaning. Multi
    trades that certainty for reach, which is worth it for a drag and confusing
    as a permanent setting.
  -->
  <label class="sel-multi">
    <input
      type="checkbox"
      bind:checked={uiStore.multiKindSelect}
      data-testid="multi-kind"
    />
    <span>{t('selection.multi')}</span>
  </label>
  <p class="sel-intro">{uiStore.multiKindSelect ? t('selection.multiHelp') : t('selection.intro')}</p>

  <!--
    Plain toggle buttons, not radios-that-become-checkboxes. A radiogroup
    owes the keyboard roving tabindex and arrow-key movement, which this list
    never implemented — and a role that promises behaviour it does not have
    is worse than a plainer one that tells the truth. `aria-pressed` still
    says which kinds are on; that exactly one is on in single-kind mode is
    the store's invariant (applySelectMode / toggleSelectKind), not the
    markup's.
  -->
  <div
    class="sel-list"
    role="group"
    aria-label={t('ribbon.selection')}
  >
    {#each MODES as m}
      {@const on = uiStore.selectsKind(m.id)}
      <button
        class="sel-item"
        class:on
        aria-pressed={on}
        onclick={() => uiStore.toggleSelectKind(m.id)}
        data-testid={`select-mode-${m.id}`}
      >
        <span class="sel-name">
          {#if uiStore.multiKindSelect}<span class="sel-tick" aria-hidden="true">{on ? '☑' : '☐'}</span>{/if}
          {t(m.key)}
        </span>
        <span class="sel-hint">{t(m.hint)}</span>
      </button>
    {/each}
  </div>
  <p class="sel-note">{t('selection.dragNote')}</p>
</div>

<style>
  .sel-panel { padding: 4px 2px; }

  .sel-multi {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    font-size: 0.74rem;
    color: var(--st-text);
    cursor: pointer;
  }

  .sel-tick { color: var(--st-accent); margin-right: 2px; }

  .sel-intro,
  .sel-note {
    margin: 0 0 8px;
    font-size: 0.7rem;
    line-height: 1.45;
    color: var(--st-text-3);
  }

  .sel-note { margin: 10px 0 0; }

  .sel-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .sel-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    padding: 6px 8px;
    text-align: left;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-left: 2px solid transparent;
    border-radius: var(--st-radius, 3px);
    color: var(--st-text-2);
    cursor: pointer;
  }

  .sel-item:hover { background: var(--st-surface-3); color: var(--st-text); }

  .sel-item.on {
    border-left-color: var(--st-accent);
    color: var(--st-text);
  }

  .sel-name { font-size: 0.78rem; }
  .sel-hint { font-size: 0.66rem; color: var(--st-text-3); }
</style>
