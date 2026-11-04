<script lang="ts">
  /**
   * «What do I do?»: the four steps of design as one short map, each with what it produces, where
   * the project stands on it and what it still waits on, and a way to go there. Opened from the
   * process bar; the same steps and states the bar shows (`design-steps.ts`).
   */
  import { t } from '../../../lib/i18n';
  import type { DesignStep } from '../../../lib/pro/design-steps';
  import type { DeskStep } from '../../../lib/store/design-desk-ui.svelte';

  let { steps, go }: { steps: DesignStep[]; go: (id: DeskStep) => void } = $props();
  let open = $state(false);
  const STATE: Record<string, string> = { complete: 'desk.guide.state.complete', current: 'desk.guide.state.current', blocked: 'desk.guide.state.blocked', optional: 'desk.guide.state.optional', pending: 'desk.guide.state.pending' };
</script>

<div class="dg">
  <button class="dg-toggle" aria-expanded={open} onclick={() => (open = !open)} aria-label={t('desk.guide.toggle')} title={t('desk.guide.toggle')} data-testid="desk-guide-toggle">?</button>
  {#if open}
    <div class="dg-pop" role="dialog" aria-label={t('desk.guide.title')} data-testid="desk-guide">
      <p class="dg-title">{t('desk.guide.title')}</p>
      <ol>
        {#each steps as s, i (s.id)}
          <li data-state={s.state} data-testid="desk-guide-{s.id}">
            <div class="dg-head">
              <span class="dg-n">{s.state === 'complete' ? '✓' : i + 1}</span>
              <strong>{t(`desk.step.${s.id}`)}</strong>
              <span class="dg-state">{t(STATE[s.state] ?? 'desk.guide.state.pending')}</span>
              <button onclick={() => { open = false; go(s.id); }} data-testid="desk-guide-go-{s.id}">{t('desk.guide.go')}</button>
            </div>
            <p class="dg-what">{t(`desk.guide.${s.id}`)}</p>
            {#if s.todoKey && s.state !== 'complete'}<p class="dg-todo">{t(s.todoKey)}</p>{/if}
          </li>
        {/each}
      </ol>
    </div>
  {/if}
</div>

<style>
  .dg { position: relative; }
  .dg-toggle { font-size: 0.74rem; font-weight: 600; width: 1.5rem; height: 1.5rem; padding: 0; border-radius: 50%; border: 1px solid var(--st-hair-strong); background: none; color: var(--st-text); cursor: pointer; }
  .dg-pop { position: absolute; top: calc(100% + 4px); left: 0; z-index: 30; width: min(26rem, 90vw); padding: 8px 10px; background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); box-shadow: 0 4px 16px rgb(0 0 0 / 0.2); }
  .dg-title { margin: 0 0 6px; font-size: 0.74rem; font-weight: 600; color: var(--st-text); }
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .dg-head { display: flex; align-items: center; gap: 6px; font-size: 0.72rem; color: var(--st-text); }
  .dg-n { display: inline-grid; place-items: center; width: 1.1rem; height: 1.1rem; border-radius: 50%; font-size: 0.62rem; border: 1px solid var(--st-hair-strong); }
  li[data-state='complete'] .dg-n { border-color: var(--st-ok); color: var(--st-ok); }
  .dg-state { margin-left: auto; font-size: 0.64rem; color: var(--st-text-2); }
  .dg-head button { font-size: 0.66rem; padding: 1px 8px; background: var(--st-surface-2); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; cursor: pointer; }
  .dg-what, .dg-todo { margin: 2px 0 0 1.6rem; font-size: 0.66rem; line-height: 1.35; color: var(--st-text-2); }
  .dg-todo { color: var(--st-warn); }
</style>
