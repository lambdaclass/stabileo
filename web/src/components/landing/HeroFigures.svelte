<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import BuildingFigure from './hero/BuildingFigure.svelte';
  import { createFigureLoader } from './hero/figure-loader';
  import { onMount, type Component } from 'svelte';
  import { fade } from 'svelte/transition';

  type Props = { prefersReducedMotion?: boolean };
  let { prefersReducedMotion = false }: Props = $props();

  type FigureProps = { prefersReducedMotion?: boolean };
  type FigureComponent = Component<FigureProps>;
  type Figure = { id: string; label: string; period: number; seconds: number; load: () => Promise<{ default: FigureComponent }> };

  const FIGURES = ([
    { id: 'building', label: 'landing.heroFigBuilding', period: 18, seconds: 16.9, load: async () => ({ default: BuildingFigure }) },
    { id: 'shed', label: 'landing.heroFigShed', period: 18, seconds: 17, load: () => import('./hero/ShedFigure.svelte') },
    { id: 'truss', label: 'landing.heroFigTruss', period: 18, seconds: 18, load: () => import('./TrussFigure.svelte') },
    { id: 'section', label: 'landing.heroFigSection', period: 16, seconds: 16, load: () => import('./hero/SectionFigure.svelte') },
    { id: 'mohr', label: 'landing.heroFigMohr', period: 16, seconds: 16, load: () => import('./hero/MohrFigure.svelte') },
    { id: 'modal', label: 'landing.heroFigModal', period: 18, seconds: 18, load: () => import('./hero/ModalFigure.svelte') },
    { id: 'topopt', label: 'landing.heroFigResearch', period: 16, seconds: 14.4, load: () => import('./hero/TopoptFigure.svelte') },
  ] satisfies Figure[]).map(({ load, ...figure }) => ({
    ...figure,
    load: createFigureLoader(async () => (await load()).default),
  }));
  let selection = $state<{ index: number; component: FigureComponent }>({ index: 0, component: BuildingFigure });
  const shown = $derived(selection.index);
  let chosen = $state(false);
  let hovered = $state(false);
  let elapsed = $state(0);
  const progress = $derived(chosen ? (elapsed % FIGURES[shown].period) / FIGURES[shown].period : Math.min(1, elapsed / FIGURES[shown].seconds));

  let request = 0;
  const paused = () => prefersReducedMotion || hovered || document.hidden;

  async function show(i: number, canSwitch: () => boolean): Promise<boolean> {
    const component = await FIGURES[i].load();
    if (!component || !canSwitch()) return false;
    selection = { index: i, component };
    elapsed = 0;
    return true;
  }

  async function advance(): Promise<void> {
    const id = ++request;
    const canSwitch = () => id === request && !paused();
    const from = shown;
    for (let offset = 1; offset < FIGURES.length && canSwitch(); offset++) {
      if (await show((from + offset) % FIGURES.length, canSwitch)) return;
    }
    if (canSwitch()) elapsed = 0;
  }

  onMount(() => {
    let mounted = true;
    async function preloadAll() {
      const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
      if (saveData) return;
      for (const { load } of FIGURES) {
        if (!mounted) return;
        await load();
      }
    }

    const idleHandle = window.requestIdleCallback ? window.requestIdleCallback(preloadAll) : window.setTimeout(preloadAll, 600);
    let raf = 0;
    let last = performance.now();
    let switching = false;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!paused() && !switching) {
        elapsed += dt;
        if (!chosen && elapsed >= FIGURES[shown].seconds) {
          switching = true;
          void advance().finally(() => { switching = false; });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      request++;
      cancelAnimationFrame(raf);
      if (window.cancelIdleCallback && window.requestIdleCallback) window.cancelIdleCallback(idleHandle);
      else window.clearTimeout(idleHandle);
    };
  });

  function pick(i: number) {
    chosen = true;
    const id = ++request;
    if (i !== shown) void show(i, () => id === request);
  }

  const hoverStack = {
    enter: (e: PointerEvent) => { if (e.pointerType === 'mouse') hovered = true; },
    leave: () => { hovered = false; },
  };
</script>

<div class="hero-figs">
  <div class="hero-fig-stack" role="group" onpointerenter={hoverStack.enter} onpointerleave={hoverStack.leave}>
    {#key shown}
      {@const Shown = selection.component}
      <div class="hero-fig-slot" in:fade={{ duration: prefersReducedMotion ? 0 : 260 }} out:fade={{ duration: prefersReducedMotion ? 0 : 160 }}>
        <Shown {prefersReducedMotion} />
      </div>
    {/key}
  </div>
  <div class="hero-fig-switch">
    {#each FIGURES as f, i}
      <button
        type="button"
        data-figure={f.id}
        aria-pressed={shown === i}
        class:on={shown === i}
        onclick={() => pick(i)}
      >
        <span class="hero-fig-label">{t(f.label)}</span>
        <span class="hero-fig-progress" aria-hidden="true">
          <span style="transform: scaleX({shown === i && !prefersReducedMotion ? progress : 0})"></span>
        </span>
      </button>
    {/each}
  </div>
</div>

<style>
  .hero-figs {
    container-type: inline-size;
  }
  .hero-fig-stack {
    display: grid;
  }
  .hero-fig-slot {
    grid-area: 1 / 1;
  }
  .hero-fig-switch {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.9rem;
  }
  .hero-fig-switch button {
    position: relative;
    flex: 1 1 0;
    min-width: 44px;
    min-height: 44px;
    font-family: var(--lp-sans);
    font-size: 0.75rem;
    line-height: 1.2;
    text-align: left;
    color: var(--fg-2);
    background: none;
    border: 0;
    padding: 0.35rem 0.1rem 0.6rem;
    cursor: pointer;
    transition: flex-grow 0.35s ease, color 0.2s;
  }
  .hero-fig-switch button:hover {
    color: var(--fg);
  }
  .hero-fig-switch button.on {
    flex-grow: 1.7;
    color: var(--fg);
    font-weight: 600;
  }
  .hero-fig-switch button:focus-visible {
    outline: 1px solid var(--lp-accent);
    outline-offset: 2px;
  }
  .hero-fig-label {
    display: block;
    overflow-wrap: anywhere;
  }
  @container (max-width: 540px) {
    .hero-fig-switch {
      gap: 0.25rem;
    }
    .hero-fig-switch button {
      padding-bottom: 0.55rem;
    }
    .hero-fig-switch button.on {
      flex-grow: 4;
    }
    .hero-fig-switch button:not(.on) .hero-fig-label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  .hero-fig-progress {
    position: absolute;
    left: 0.1rem;
    right: 0.1rem;
    bottom: 0.2rem;
    height: 2px;
    background: color-mix(in srgb, var(--fg-2) 25%, transparent);
    overflow: hidden;
  }
  .hero-fig-progress span {
    display: block;
    height: 100%;
    background: var(--lp-accent);
    transform-origin: left;
  }
</style>

