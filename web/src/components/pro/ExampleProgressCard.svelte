<script lang="ts">
  /** With the toasts: the gallery example on its way in, step by step (`store/example-progress.svelte.ts`). */
  import { t, tp, i18n } from '../../lib/i18n';
  import { exampleProgress } from '../../lib/store/example-progress.svelte';

  const p = $derived(exampleProgress.now);
  const startedAt = $derived(p?.startedAt);
  let tick = $state(performance.now());
  $effect(() => {
    if (startedAt === undefined) return;
    tick = performance.now();
    const id = setInterval(() => { tick = performance.now(); }, 250);
    return () => clearInterval(id);
  });
  const elapsed = $derived(p ? Math.max(0, tick - p.startedAt) / 1000 : 0);
</script>

{#if p}
  <div class="epc" role="status" aria-live="polite" data-testid="example-progress" data-step={p.step}>
    <div class="epc-head">
      <strong>{tp('pro.examples.loading.title', { name: t(p.nameKey) })}</strong>
      <span class="epc-time" aria-hidden="true">{elapsed.toLocaleString(i18n.locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} s</span>
    </div>
    <progress aria-label={t(`pro.examples.loading.${p.step}`)}></progress>
    <span class="epc-sub">{t(`pro.examples.loading.${p.step}`)}</span>
  </div>
{/if}

<style>
  .epc { pointer-events: auto; display: flex; flex-direction: column; gap: 5px; min-width: 260px; max-width: 360px; padding: 0.6rem 1rem; border-radius: 6px; background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-left: 3px solid var(--st-accent); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4); font-size: 0.8rem; color: var(--st-text); }
  .epc-head { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
  .epc-head strong { font-weight: 600; }
  .epc-time { font-family: var(--st-mono); font-size: 0.72rem; color: var(--st-text-3); }
  .epc-sub { font-size: 0.72rem; color: var(--st-text-2); }
  progress { width: 100%; height: 6px; appearance: none; border: none; border-radius: 3px; background: var(--st-surface-3); overflow: hidden; }
  progress::-webkit-progress-bar { background: var(--st-surface-3); border-radius: 3px; }
  progress::-moz-progress-bar { background: var(--st-accent); border-radius: 3px; }
</style>
