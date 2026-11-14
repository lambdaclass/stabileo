<script lang="ts">
  /** At the viewer's foot, with the toasts: the solve the engineer asked for, step by step, and how it ended (`store/solve-progress.svelte.ts`). */
  import { t, tp, i18n } from '../lib/i18n';
  import { solveProgress, secondsLeft } from '../lib/store/solve-progress.svelte';
  import { meshProgress } from '../lib/store/mesh-progress.svelte';
  import { uiStore } from '../lib/store';

  const AUTO_CLOSE_MS = 6000;
  const p = $derived(solveProgress.now);
  let tick = $state(performance.now());
  $effect.pre(() => { void p; tick = performance.now(); });
  $effect(() => {
    if (!p || p.phase === 'done' || p.phase === 'failed') return;
    const id = setInterval(() => { tick = performance.now(); }, 250);
    return () => clearInterval(id);
  });
  $effect(() => {
    if (!p || p.phase !== 'done' || p.warnings > 0) return;
    const id = setTimeout(() => solveProgress.dismiss(), AUTO_CLOSE_MS);
    return () => clearTimeout(id);
  });
  const secs = (ms: number) => (ms / 1000).toLocaleString(i18n.locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const elapsed = $derived(p ? (p.endedAt ?? tick) - p.startedAt : 0);
  const left = $derived(p ? secondsLeft(p, tick) : null);
  const ended = $derived(!!p && (p.phase === 'done' || p.phase === 'failed'));
  const canDiagnose = $derived(uiStore.analysisMode === 'pro');
  function diagnose() { uiStore.proActiveTab = 'diagnostics'; solveProgress.dismiss(); }
</script>

{#if p}
  <div class="spc" class:ok={p.phase === 'done'} class:bad={p.phase === 'failed'} role="status" aria-live="polite" data-testid="solve-progress" data-phase={p.phase}>
    <div class="spc-head">
      <strong>{t(`solveProgress.phase.${p.phase}`)}</strong>
      <span class="spc-time">{secs(elapsed)} s</span>
    </div>
    {#if !ended}
      {#if p.phase === 'mesh' && meshProgress.now}
        <progress max={meshProgress.now.total} value={meshProgress.now.done}></progress>
        <span class="spc-sub">{tp('solveProgress.meshing', { done: meshProgress.now.done, total: meshProgress.now.total })}</span>
      {:else if (p.phase === 'shells' || p.phase === 'combine') && p.total > 0}
        <progress max={p.total} value={p.done}></progress>
        <span class="spc-sub">{tp(p.phase === 'shells' ? 'solveProgress.cases' : 'solveProgress.combos', { done: p.done, total: p.total })}</span>
      {:else if p.phase === 'cases' && p.total > 0}
        <progress max={p.total} value={p.done} data-testid="solve-progress-cases"></progress>
        <span class="spc-sub">{tp('solveProgress.cases', { done: p.done, total: p.total })}{#if left !== null} · {tp('solveProgress.left', { s: secs(left * 1000) })}{/if}</span>
      {:else}
        <progress class="spc-busy"></progress>
      {/if}
    {:else}
      {#if p.phase === 'failed' && p.error}<p class="spc-error" data-testid="solve-progress-error">{p.error}</p>{/if}
      {#if p.warnings > 0}<p class="spc-sub" data-testid="solve-progress-warnings">{tp('solveProgress.warnings', { n: p.warnings })}</p>{/if}
      <div class="spc-actions">
        {#if canDiagnose && (p.warnings > 0 || p.phase === 'failed')}
          <button type="button" class="spc-btn" onclick={diagnose} data-testid="solve-progress-diagnostics">{t('solveProgress.diagnostics')}</button>
        {/if}
        <button type="button" class="spc-btn spc-primary" onclick={() => solveProgress.dismiss()} data-testid="solve-progress-done">{t('solveProgress.done')}</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .spc { pointer-events: auto; display: flex; flex-direction: column; gap: 5px; min-width: 260px; max-width: 360px; padding: 0.6rem 1rem; border-radius: 6px; background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-left: 3px solid var(--st-accent); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4); font-size: 0.8rem; color: var(--st-text); }
  .spc.ok { border-left-color: var(--st-ok); }
  .spc.bad { border-left-color: var(--st-danger); }
  .spc-head { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
  .spc-head strong { font-weight: 600; }
  .spc-time { font-family: var(--st-mono); font-size: 0.72rem; color: var(--st-text-3); }
  .spc-sub { font-size: 0.72rem; color: var(--st-text-2); margin: 0; }
  .spc-error { font-size: 0.74rem; color: var(--st-danger); margin: 0; line-height: 1.35; }
  progress { width: 100%; height: 6px; appearance: none; border: none; border-radius: 3px; background: var(--st-surface-3); overflow: hidden; }
  progress::-webkit-progress-bar { background: var(--st-surface-3); border-radius: 3px; }
  progress::-webkit-progress-value { background: var(--st-accent); border-radius: 3px; }
  progress::-moz-progress-bar { background: var(--st-accent); border-radius: 3px; }
  .spc-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 2px; }
  .spc-btn { font-size: 0.74rem; padding: 3px 10px; border-radius: 4px; border: 1px solid var(--st-hair-strong); background: var(--st-surface-2); color: var(--st-text); cursor: pointer; }
  .spc-primary { background: var(--st-accent); border-color: var(--st-accent); color: var(--st-text-on-accent, #fff); }
</style>
