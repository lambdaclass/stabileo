<script lang="ts">
  /**
   * The declared unbraced length of the selected steel members.
   *
   * `Element.unbracedLength` replaces `Lb`, never `L` (`engine/steel/unbraced-length.ts`), and is
   * reported as declared. It had an input only in the property panel, which PRO does not mount:
   * the field existed and nobody in PRO could reach it. Here it sits beside the text that says why
   * it matters. One write for the whole selection is one undo step.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { memberLengths } from '../../lib/engine/steel/unbraced-length';

  let { steelIds }: { steelIds: ReadonlySet<number> } = $props();

  const selected = $derived([...uiStore.selectedElements].filter((id) => steelIds.has(id)));
  const lengths = $derived(memberLengths(modelStore.model));
  const now = $derived.by(() => {
    const values = [...new Set(selected.map((id) => lengths.get(id)?.Lb.toFixed(3)))];
    if (values.length === 0) return '';
    return values.length === 1 ? `${values[0]} m` : t('steel.lb.mixed');
  });

  let value = $state('');

  function write(lb: number | undefined) {
    modelStore.batch(() => {
      for (const id of selected) modelStore.updateElement(id, { unbracedLength: lb });
    });
  }

  function declare() {
    const v = parseFloat(value);
    if (!(v > 0)) return;
    write(v);
    value = '';
  }
</script>

<div class="pk-card lb" data-testid="steel-lb-editor">
  <h4 class="pk-heading">{t('steel.lb.title')}</h4>
  <p class="pk-hint">{t('steel.lb.hint')}</p>
  {#if selected.length === 0}
    <p class="pk-hint" data-testid="steel-lb-none">{t('steel.lb.none')}</p>
  {:else}
    <p class="lb-now" data-testid="steel-lb-now">{tp('steel.lb.selected', { n: selected.length, lb: now })}</p>
    <div class="pk-row">
      <input class="pk-grow" type="number" min="0" step="0.1" placeholder="Lb (m)" bind:value
        onkeydown={(e) => { if (e.key === 'Enter') declare(); }} data-testid="steel-lb-input" />
      <button class="pk-btn pk-btn-primary" onclick={declare} disabled={!(parseFloat(value) > 0)} data-testid="steel-lb-declare">{t('steel.lb.declare')}</button>
      <button class="pk-btn" onclick={() => write(undefined)}
        disabled={!selected.some((id) => modelStore.elements.get(id)?.unbracedLength !== undefined)} data-testid="steel-lb-clear">{t('steel.lb.clear')}</button>
    </div>
  {/if}
</div>

<style>
  .lb { margin-top: 6px; }
  .lb-now { margin: 0 0 4px; font-size: 0.64rem; color: var(--st-text-2); }
</style>
