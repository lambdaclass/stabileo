<script lang="ts">
  /**
   * The frame every step-by-step solution is shown in, the explained methods
   * and the stiffness and flexibility wizards alike: the method's title and
   * what it is solving, a row of step tabs, the step with its heading, and a
   * footer to move one step at a time. Arrow keys move too.
   *
   * Steps are numbered from `first` (0 when the solution opens with a set-up,
   * shown as its own tab) to `last`.
   */
  import type { Snippet } from 'svelte';
  import { t, tp } from '../../lib/i18n';
  import Prose from './Prose.svelte';

  let {
    title, subtitle, step, first = 1, last, onGo, stepTitle, tabTitle,
    tabTestid = () => 'steps-tab', headingTestid, prevTestid = 'steps-prev', nextTestid = 'steps-next',
    top, tabsEnd, children, showNav = true, narrow = $bindable(false),
  }: {
    title: string; subtitle?: string; step: number; first?: 0 | 1; last: number; onGo: (k: number) => void;
    /** The heading of the step on screen; none for the set-up. */
    stepTitle?: string;
    tabTitle?: (k: number) => string;
    tabTestid?: (k: number) => string; headingTestid?: string; prevTestid?: string; nextTestid?: string;
    /** Between the title and the tabs: assumptions, warnings. */
    top?: Snippet;
    /** At the end of the tab row: a switch for the explanations. */
    tabsEnd?: Snippet;
    children: Snippet;
    /** False while the frame shows something other than the steps (a matrix view). */
    showNav?: boolean;
    /** Out: whether the body is a side panel's width (formulas are laid out for it). */
    narrow?: boolean;
  } = $props();

  let bodyW = $state(0);
  $effect(() => { narrow = bodyW > 0 && bodyW < 560; });

  let body = $state<HTMLElement>();
  function go(k: number) {
    if (k < first || k > last) return;
    onGo(k);
    body?.scrollTo({ top: 0 });
  }
  function onKey(e: KeyboardEvent) {
    if (!showNav) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); go(step + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); go(step - 1); }
  }
  const tabs = $derived(Array.from({ length: last - first + 1 }, (_, k) => k + first));
</script>

<svelte:window onkeydown={onKey} />

<div class="sf-title">
  <h3><Prose text={title} /></h3>
  {#if subtitle}<span class="sf-sub"><Prose text={subtitle} /></span>{/if}
</div>

{#if top}{@render top()}{/if}

{#if showNav}
  <nav class="sf-nav" aria-label={title}>
    {#each tabs as k}
      <button class:on={step === k} class:past={step > k} onclick={() => go(k)} title={tabTitle?.(k)}
        data-testid={k === 0 ? undefined : tabTestid(k)}>{k === 0 ? t('steps.view.intro') : k}</button>
    {/each}
    {#if tabsEnd}<span class="sf-nav-end">{@render tabsEnd()}</span>{/if}
  </nav>
{:else if tabsEnd}
  <!-- Off the steps (a matrix view), the row keeps its switch so the reader can come back. -->
  <nav class="sf-nav"><span class="sf-nav-end">{@render tabsEnd()}</span></nav>
{/if}

<div class="sf-body" class:sb-narrow={narrow} bind:this={body} bind:clientWidth={bodyW}>
  {#if showNav && stepTitle !== undefined && step > 0}
    <h4 class="sf-step" data-testid={headingTestid}><span class="sf-num">{tp('steps.view.step', { n: step })}</span> <Prose text={stepTitle} /></h4>
  {/if}
  {@render children()}
</div>

{#if showNav}
  <footer class="sf-foot">
    <button disabled={step <= first} onclick={() => go(step - 1)} data-testid={prevTestid}>‹ {t('steps.view.prev')}</button>
    <span class="sf-pos">{step} / {last}</span>
    <button disabled={step >= last} onclick={() => go(step + 1)} data-testid={nextTestid}>{t('steps.view.next')} ›</button>
  </footer>
{/if}

<style>
  .sf-title { padding: 0.55rem 0.75rem 0.25rem; flex: none; }
  .sf-title h3 { margin: 0; font-size: 1rem; color: var(--st-text); line-height: 1.3; }
  .sf-sub { display: block; margin-top: 0.1rem; font-size: 0.68rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--st-text-3); line-height: 1.4; }
  .sf-nav { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; padding: 0.3rem 0.75rem; border-bottom: 1px solid var(--st-hair); flex: none; }
  .sf-nav button {
    min-width: 1.9rem; padding: 0.15rem 0.45rem; font-size: 0.72rem; cursor: pointer; font-family: inherit;
    border: 1px solid var(--st-hair-strong); border-radius: 4px; background: var(--st-surface-2); color: var(--st-text-2);
  }
  .sf-nav button.past { color: var(--st-text); }
  .sf-nav button.on { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .sf-nav-end { margin-left: auto; display: flex; align-items: center; }
  .sf-nav-end :global(.sf-toggle) {
    min-width: 0; background: none; border: 1px solid var(--st-hair-strong); color: var(--st-text-2); font-family: inherit;
    font-size: 0.7rem; padding: 0.15rem 0.5rem; cursor: pointer; border-radius: 4px;
  }
  .sf-nav-end :global(.sf-toggle:hover:not(:disabled)), .sf-nav-end :global(.sf-toggle.on) { border-color: var(--st-accent); color: var(--st-accent); }
  .sf-nav-end :global(.sf-toggle:disabled) { opacity: 0.35; cursor: default; }
  .sf-body { flex: 1 1 auto; overflow-y: auto; overflow-x: hidden; padding: 0.3rem 0.75rem 0.8rem; min-height: 0; }
  .sf-step { margin: 0.5rem 0 0.4rem; font-size: 0.92rem; color: var(--st-text); line-height: 1.35; }
  .sf-num { display: inline-block; padding: 0.05rem 0.45rem; margin-right: 0.3rem; border-radius: 3px; background: color-mix(in srgb, var(--st-accent) 85%, #000); color: #fff; font-size: 0.72rem; font-weight: 600; }
  .sf-foot { display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0.75rem; border-top: 1px solid var(--st-hair); flex: none; }
  .sf-foot button {
    background: transparent; border: 1px solid var(--st-hair-strong); border-radius: 4px; font-family: inherit;
    color: var(--st-text-2); font-size: 0.74rem; padding: 0.2rem 0.55rem; cursor: pointer;
  }
  .sf-foot button:hover:not(:disabled) { color: var(--st-text); background: var(--st-surface-2); }
  .sf-foot button:disabled { opacity: 0.4; cursor: default; }
  .sf-pos { font-size: 0.72rem; color: var(--st-text-3); font-variant-numeric: tabular-nums; }
  @media (pointer: coarse) { .sf-nav button { min-height: 30px; } .sf-foot button { min-height: 34px; } }
</style>
