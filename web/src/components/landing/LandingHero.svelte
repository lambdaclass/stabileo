<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import { enterApp } from './landing-utils';
  import PublicLink from './PublicLink.svelte';
  import Eyebrow from './Eyebrow.svelte';
  import BuildingFigure from './hero/BuildingFigure.svelte';
  import { onMount, type Component } from 'svelte';
  import { fade } from 'svelte/transition';

  type Props = { prefersReducedMotion?: boolean };
  let { prefersReducedMotion = false }: Props = $props();

  type FigureProps = { prefersReducedMotion?: boolean; paused?: boolean };
  type Figure = { id: string; label: string; period: number; seconds: number; load?: () => Promise<{ default: Component<FigureProps> }> };
  const FIGURES: Figure[] = [
    { id: 'building', label: 'landing.heroFigBuilding', period: 18, seconds: 16.9 },
    { id: 'shed', label: 'landing.heroFigShed', period: 18, seconds: 17, load: () => import('./hero/ShedFigure.svelte') },
    { id: 'truss', label: 'landing.heroFigTruss', period: 18, seconds: 18, load: () => import('./TrussFigure.svelte') },
    { id: 'section', label: 'landing.heroFigSection', period: 16, seconds: 16, load: () => import('./hero/SectionFigure.svelte') },
    { id: 'mohr', label: 'landing.heroFigMohr', period: 16, seconds: 16, load: () => import('./hero/MohrFigure.svelte') },
    { id: 'modal', label: 'landing.heroFigModal', period: 18, seconds: 18, load: () => import('./hero/ModalFigure.svelte') },
    { id: 'topopt', label: 'landing.heroFigResearch', period: 16, seconds: 14.4, load: () => import('./hero/TopoptFigure.svelte') },
  ];
  let loaded = $state<Record<string, Component<FigureProps>>>({});
  let shown = $state(0);
  let chosen = $state(false);
  let hovered = $state(false);
  let elapsed = $state(0);
  const progress = $derived(chosen ? (elapsed % FIGURES[shown].period) / FIGURES[shown].period : Math.min(1, elapsed / FIGURES[shown].seconds));

  async function prepare(i: number): Promise<void> {
    const f = FIGURES[i];
    if (!f.load || loaded[f.id]) return;
    const mod = await f.load();
    loaded = { ...loaded, [f.id]: mod.default };
  }

  let request = 0;
  const unavailable = new Set<number>();

  async function show(i: number): Promise<void> {
    const id = ++request;
    try {
      await prepare(i);
    } catch {
      unavailable.add(i);
      return;
    }
    if (id !== request) return;
    shown = i;
    elapsed = 0;
  }

  function nextAvailable(from: number): number {
    for (let k = 1; k <= FIGURES.length; k++) {
      const i = (from + k) % FIGURES.length;
      if (!unavailable.has(i)) return i;
    }
    return from;
  }

  function preloadAll() {
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (saveData) return;
    void FIGURES.reduce((chain, _, i) => chain.then(() => prepare(i)).catch(() => {}), Promise.resolve());
  }

  onMount(() => {
    const idleHandle = window.requestIdleCallback ? window.requestIdleCallback(preloadAll) : window.setTimeout(preloadAll, 600);
    let raf = 0;
    let last = performance.now();
    let switching = false;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!prefersReducedMotion && !hovered && !document.hidden && !switching) {
        elapsed += dt;
        if (!chosen && elapsed >= FIGURES[shown].seconds) {
          switching = true;
          void show(nextAvailable(shown)).finally(() => {
            switching = false;
            if (elapsed >= FIGURES[shown].seconds) elapsed = 0;
          });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (window.cancelIdleCallback && window.requestIdleCallback) window.cancelIdleCallback(idleHandle);
      else window.clearTimeout(idleHandle);
    };
  });

  function pick(i: number) {
    chosen = true;
    if (i === shown) {
      request++;
      return;
    }
    void show(i);
  }

  const hoverStack = {
    enter: (e: PointerEvent) => { if (e.pointerType === 'mouse') hovered = true; },
    leave: () => { hovered = false; },
  };
</script>

<section class="sec sec--ink hero" data-section="hero" id="top" aria-labelledby="hero-title">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <Eyebrow n="01" label={t('landing.ebHero')} />
      <h1 id="hero-title">{t('landing.heroH')}</h1>
      <p class="lead">{t('landing.heroP')}</p>

      <div class="hero-ctas">
        <button class="btn btn-primary btn-lg" onclick={() => enterApp()}>{t('landing.heroCtaPrimary')}</button>
        <PublicLink to="/examples" class="btn btn-ghost btn-lg">{t('landing.navExamples')} →</PublicLink>
      </div>

      <!--
        The blog, on the first screen but deliberately at a third level: a mono
        link on its own line, not a third button. The hero's job is to get
        someone into the editor, and two buttons plus a link reads as one
        decision with a footnote, where three buttons would read as three
        equal choices.
      -->
      <PublicLink to="/blog" class="link-arrow hero-blog">{t('landing.heroBlogLink')}</PublicLink>

      <!--
        The three modes, named in the first screen.
        The hero used to lead on live re-solving, which is a real
        differentiator but answers "how does it feel?" before the visitor knows
        what the product is or which parts of it exist. Re-solving now appears
        as its own section further down; positioning belongs here.
      -->
      <!--
        The three mode cards used to sit here. The model table is the next
        thing on the page and says the same in more detail — who each mode is
        for and what it costs — so repeating it in the hero was the deck
        arguing with itself before it had started.
      -->

      <dl class="hero-meta">
        <div><dt>{t('landing.heroMetaA')}</dt></div>
        <div><dt>{t('landing.heroMetaB')}</dt></div>
        <div><dt>{t('landing.heroMetaC')}</dt></div>
      </dl>
    </div>

    <div class="hero-figure">
      <div class="hero-fig-stack" role="group" onpointerenter={hoverStack.enter} onpointerleave={hoverStack.leave}>
        {#key shown}
          <div class="hero-fig-slot" in:fade={{ duration: prefersReducedMotion ? 0 : 260 }} out:fade={{ duration: prefersReducedMotion ? 0 : 160 }}>
            {#if FIGURES[shown].id === 'building'}
              <BuildingFigure {prefersReducedMotion} paused={hovered} />
            {:else if loaded[FIGURES[shown].id]}
              {@const Shown = loaded[FIGURES[shown].id]}
              <Shown {prefersReducedMotion} paused={hovered} />
            {/if}
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
  </div>
</section>

<style>
  .hero-figure {
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
    gap: 0.35rem;
    margin-top: 0.9rem;
  }
  .hero-fig-switch button {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    font-family: var(--lp-sans);
    font-size: 0.72rem;
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
  }
  @container (max-width: 540px) {
    .hero-fig-switch {
      gap: 0.25rem;
      min-height: 2.1rem;
      align-items: flex-end;
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
    .hero-fig-switch button:not(.on) {
      min-height: 1.6rem;
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
