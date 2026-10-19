<script lang="ts">
  /**
   * Bracing of the selected steel members: the points where each flange is held (m from the
   * member's start; the top flange for sagging, the bottom one for hogging) and the unbraced
   * lengths for flexural buckling about each axis. One write for the selection, one undo step.
   * The net section of a tension member is its end connection (Specifications › Members, «Unión
   * extrema»: `Element.tensionConnection`), the one place the holes and U are stated.
   */
  import { modelStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import type { Element } from '../../lib/store/model.svelte';

  let { selected }: { selected: number[] } = $props();
  const first = $derived(selected.length ? modelStore.elements.get(selected[0]!) : undefined);
  const pts = (v: number[] | undefined) => (v ?? []).map((x) => +x.toFixed(3)).join('; ');
  let top = $state(''), bottom = $state(''), lx = $state<number | null>(null), ly = $state<number | null>(null);
  $effect(() => {
    const b = first?.bracing;
    top = pts(b?.top); bottom = pts(b?.bottom); lx = b?.Lx ?? null; ly = b?.Ly ?? null;
  });
  const parse = (s: string) => s.split(/[;\s]+/).map((x) => Number(x.replace(',', '.'))).filter((x) => Number.isFinite(x) && x > 0);
  function write(patch: Partial<Element>) {
    modelStore.batch(() => { for (const id of selected) modelStore.updateElement(id, patch); });
  }
  function apply() {
    const b = { ...(parse(top).length ? { top: parse(top) } : {}), ...(parse(bottom).length ? { bottom: parse(bottom) } : {}), ...(lx && lx > 0 ? { Lx: lx } : {}), ...(ly && ly > 0 ? { Ly: ly } : {}) };
    write({ bracing: Object.keys(b).length ? b : undefined });
  }
</script>

<div class="br" data-testid="steel-bracing-editor">
  <p class="pk-hint">{t('steel.bracing.hint')}</p>
  <label>{t('steel.bracing.top')}<input bind:value={top} placeholder="1,5; 3; 4,5" data-testid="steel-bracing-top" /></label>
  <label>{t('steel.bracing.bottom')}<input bind:value={bottom} placeholder="3" data-testid="steel-bracing-bottom" /></label>
  <div class="pk-row">
    <label>Lx (m)<input type="number" min="0" step="0.1" bind:value={lx} data-testid="steel-bracing-lx" /></label>
    <label>Ly (m)<input type="number" min="0" step="0.1" bind:value={ly} data-testid="steel-bracing-ly" /></label>
  </div>
  <div class="pk-row">
    <button class="pk-btn pk-btn-primary" onclick={apply} data-testid="steel-bracing-apply">{t('steel.lb.declare')}</button>
    <button class="pk-btn" onclick={() => write({ bracing: undefined })} data-testid="steel-bracing-clear">{t('steel.lb.clear')}</button>
  </div>
</div>

<style>
  .br { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
  label { display: flex; flex-direction: column; gap: 2px; font-size: 0.66rem; color: var(--st-text-2); flex: 1; min-width: 0; }
  input { font: inherit; font-size: 0.72rem; padding: 2px 4px; min-width: 0; }
</style>
