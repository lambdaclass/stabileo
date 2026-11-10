<script lang="ts">
  import { onMount } from 'svelte';
  import LandingFooter from '../landing/LandingFooter.svelte';
  import StructureFigure from './StructureFigure.svelte';
  import { publicI18n } from '../../lib/i18n/store.svelte';
  import { applyPageMeta, restorePageMeta, stabileoSoftware, breadcrumbs } from '../../lib/page-meta';
  import { initSolver } from '../../lib/engine/wasm-solver';
  import { seedFrom } from '../edu/exercise-params';
  import { buildRound, type Round } from './round';
  import { answer, newGame, nextRound, readBest, recordBest, LIVES, TIME_BONUS_WINDOW_MS, multiplier, type GameState } from './scoring';
  import { tg, tagText, type Key } from './strings';
  import type { DiagramKind } from './traces';
  import '../landing/landing.css';

  let { path }: { path: string } = $props();

  const INK: Record<DiagramKind, string> = { N: 'var(--st-ok)', V: 'var(--st-interactive)', M: 'var(--st-accent)', D: 'var(--st-value)' };

  let game = $state<GameState | null>(null);
  let round = $state<Round | null>(null);
  let picked = $state<number | null>(null);
  let best = $state(0);
  let newBest = $state(false);
  let failed = $state(false);
  let starting = $state(false);
  let shownAt = 0;
  let now = $state(0);
  let gameSeed = 0;
  let heading: HTMLElement | undefined = $state();
  let feedback: HTMLElement | undefined = $state();

  $effect(() => {
    const locale = publicI18n.locale, route = path.replace(/\/+$/, '');
    applyPageMeta({
      title: `${tg('title')} — Stabileo`, description: tg('meta'), locale, path: route,
      graph: [stabileoSoftware(locale), breadcrumbs(locale, [['Stabileo', '/'], [tg('title'), route]])],
    });
    return () => restorePageMeta();
  });

  onMount(() => {
    best = readBest();
    void initSolver().catch(() => {});
  });

  $effect(() => {
    if (game?.phase !== 'playing') return;
    const id = setInterval(() => { now = performance.now(); }, 200);
    return () => clearInterval(id);
  });

  function seedFromAddress(): number {
    const raw = new URLSearchParams(location.search).get('seed');
    return raw && /^\d+$/.test(raw) ? Number(raw) >>> 0 : Math.floor(Math.random() * 2 ** 32);
  }

  function deal(state: GameState) {
    round = buildRound(state.level, seedFrom(`${gameSeed}:${state.round}`));
    picked = null;
    shownAt = performance.now();
    now = shownAt;
  }

  async function start() {
    if (starting) return;
    starting = true;
    failed = false;
    try {
      await initSolver();
      gameSeed = seedFromAddress();
      const fresh = newGame();
      deal(fresh);
      game = fresh;
      newBest = false;
      heading?.focus();
    } catch {
      failed = true;
    } finally {
      starting = false;
    }
  }

  function choose(i: number) {
    if (!game || !round || game.phase !== 'playing') return;
    picked = i;
    game = answer(game, i === round.answer, performance.now() - shownAt);
    if (game.phase === 'over') {
      const before = readBest();
      best = recordBest(game.score);
      newBest = game.score > before;
    }
    queueMicrotask(() => feedback?.focus());
  }

  function proceed() {
    if (!game || game.phase !== 'answered') return;
    const state = nextRound(game);
    deal(state);
    game = state;
    queueMicrotask(() => heading?.focus());
  }

  function onKey(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey || !game || !round) return;
    if (game.phase === 'playing' && /^[1-9]$/.test(e.key) && Number(e.key) <= round.options.length) {
      e.preventDefault();
      choose(Number(e.key) - 1);
    } else if (game.phase === 'answered' && (e.key === 'Enter' || e.key === 'n') && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      proceed();
    }
  }

  if (import.meta.env.VITE_E2E === '1' && typeof window !== 'undefined' && new URLSearchParams(location.search).get('e2e') === '1') {
    (window as unknown as { __diagramGame?: object }).__diagramGame = {
      answer: () => round?.answer ?? null,
      level: (n: number) => { if (!game) return; const s: GameState = { ...game, level: n, round: game.round + 1, phase: 'playing', last: null }; deal(s); game = s; },
    };
  }

  const question = $derived(round ? (round.type === 'odd' ? tg('ask.odd') : tg(`ask.${round.kind}` as Key)) : '');
  const remaining = $derived(game?.phase === 'playing' ? Math.max(0, 1 - (now - shownAt) / TIME_BONUS_WINDOW_MS) : 0);
  const kindOf = (i: number): DiagramKind => round!.options[i]!.diagram.kind;
  const explain = (i: number) => {
    const o = round!.options[i]!;
    if (o.tag) return tagText(o.tag, o.diagram.kind);
    return round!.type === 'odd' ? tg('is.consistent') : tg('is.correct');
  };
</script>

<svelte:window onkeydown={onKey} />

<div class="landing diagram-game">
  <main class="sec sec--ink">
    <div class="wrap dg-wrap">
      <header class="dg-intro">
        <h1 bind:this={heading} tabindex="-1">{tg('title')}</h1>
        {#if !game}
          <p class="lead">{tg('lead')}</p>
          <p class="fine">{tg('convention')}</p>
          <p class="fine">{tg('keys')}</p>
          {#if best > 0}<p class="fine" data-testid="dg-best-intro">{tg('best')}: <strong>{best}</strong></p>{/if}
          <button type="button" class="btn btn-primary dg-start" onclick={start} disabled={starting} data-testid="dg-start">{tg('start')}</button>
          {#if failed}<p role="alert">{tg('loadFailed')}</p>{/if}
        {/if}
      </header>

      {#if game && round}
        <section class="hud" aria-label={tg('score')}>
          <div><span class="k">{tg('level')}</span><span class="v" data-testid="dg-level">{game.level + 1}</span><span class="level-name">{tg(`level.${game.level + 1}` as Key)}</span></div>
          <div><span class="k">{tg('score')}</span><span class="v" data-testid="dg-score">{game.score}</span></div>
          <div><span class="k">{tg('streak')}</span><span class="v">×{multiplier(game.streak).toFixed(2)}</span></div>
          <div><span class="k">{tg('best')}</span><span class="v" data-testid="dg-best">{Math.max(best, game.score)}</span></div>
          <div aria-label={tg('livesLeft', { n: game.lives })} data-testid="dg-lives" data-lives={game.lives}>
            <span class="k">{tg('lives')}</span>
            <span class="lives" aria-hidden="true">{#each Array(LIVES) as _, i (i)}<span class="life" class:lost={i >= game.lives}></span>{/each}</span>
          </div>
        </section>
        <div class="timer" aria-hidden="true"><span style:transform={`scaleX(${remaining})`}></span></div>

        <section class="problem">
          <h2 data-testid="dg-question">{question}</h2>
          <div class="problem-figure"><StructureFigure model={round.model} label={tg('structure')} /></div>
        </section>

        <ol class="options" data-testid="dg-options" data-round-type={round.type}>
          {#each round.options as option, i (i)}
            {@const kind = kindOf(i)}
            {@const revealed = game.phase !== 'playing'}
            <li>
              <button type="button" class="option" style:--dg-ink={INK[kind]}
                class:is-answer={revealed && i === round.answer} class:is-wrong-pick={revealed && picked === i && i !== round.answer}
                aria-pressed={picked === i}
                aria-label={`${tg('option', { n: i + 1 })}: ${tg(`kind.${kind}` as Key)}`}
                onclick={() => choose(i)} data-testid={`dg-option-${i}`}>
                <span class="num" aria-hidden="true">{i + 1}</span>
                {#if round.type === 'odd'}<span class="kind">{tg(`kind.${kind}` as Key)}</span>{/if}
                <span class="option-figure"><StructureFigure model={round.model} diagram={option.diagram} faintLoads label={tg(`kind.${kind}` as Key)} /></span>
                {#if revealed}<span class="why" data-testid={`dg-why-${i}`} data-tag={option.tag ?? ''}>{explain(i)}</span>{/if}
              </button>
            </li>
          {/each}
        </ol>

        {#if game.phase !== 'playing'}
          <section class="verdict" bind:this={feedback} tabindex="-1" aria-live="polite" data-testid="dg-verdict" data-correct={game.last?.correct ?? false}>
            {#if game.phase === 'over'}
              <h2>{tg('over')}</h2>
              <p>{tg('final', { n: game.score })}{#if newBest} · <strong data-testid="dg-new-best">{tg('newBest')}</strong>{/if}</p>
              <button type="button" class="btn btn-primary" onclick={start} data-testid="dg-again">{tg('again')}</button>
            {:else}
              <p class="result" class:ok={game.last?.correct}>
                {game.last?.correct ? tg('right') : tg('wrong')}
                {#if game.last?.correct}<span data-testid="dg-points">{tg('points', { n: game.last.points })}</span>{/if}
                {#if game.last?.levelUp}<strong>{tg('levelUp', { n: game.level + 1 })}</strong>{/if}
              </p>
              <button type="button" class="btn btn-primary" onclick={proceed} data-testid="dg-next">{tg('next')}</button>
            {/if}
          </section>
        {/if}
      {/if}
    </div>
  </main>
  <LandingFooter />
</div>

<style>
  .diagram-game :global(.nav) { background: var(--lp-ink); }
  .diagram-game main.sec { padding: clamp(4.5rem, 7vw, 6rem) 0 3rem; }
  .dg-wrap { --lp-gut: 16px; max-width: 72rem; }
  h1 { font: 600 clamp(1.75rem, 4.5vw, 2.75rem)/1.1 var(--lp-display); margin: 0 0 .75rem; outline: none; overflow-wrap: anywhere; }
  h2 { font: 500 clamp(1.05rem, 2.6vw, 1.35rem)/1.3 var(--lp-display); margin: 0 0 .5rem; outline: none; }
  .lead { font-size: 1.05rem; max-width: 46rem; }
  .fine { font-size: .9rem; color: var(--st-text-2); max-width: 46rem; }
  .dg-start { margin-top: .75rem; min-height: 44px; min-width: 8rem; }
  .hud { display: flex; flex-wrap: wrap; gap: .5rem 1.5rem; padding: .75rem 0; border-block: 1px solid var(--st-hair); font-family: var(--st-mono); }
  .hud > div { display: flex; align-items: baseline; gap: .4rem; min-width: 0; }
  .k { font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; color: var(--st-text-3); }
  .v { font-size: 1.05rem; color: var(--st-text); font-variant-numeric: tabular-nums; }
  .level-name { font: .8rem var(--st-sans); color: var(--st-text-2); }
  .lives { display: inline-flex; gap: .3rem; }
  .life { width: .7rem; height: .7rem; border-radius: 50%; background: var(--st-accent); }
  .life.lost { background: transparent; box-shadow: inset 0 0 0 1px var(--st-hair-strong); }
  .timer { height: 3px; background: var(--st-hair); margin-bottom: 1rem; overflow: hidden; }
  .timer span { display: block; height: 100%; background: var(--st-warn); transform-origin: left; transition: transform .2s linear; }
  .problem { margin-bottom: 1rem; }
  .problem-figure { height: clamp(8rem, 22vw, 12rem); border: 1px solid var(--st-hair); border-radius: var(--st-radius-lg); background: var(--st-surface); padding: .5rem; }
  .options { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: .75rem; }
  @media (min-width: 760px) { .options { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .option { position: relative; display: flex; flex-direction: column; gap: .4rem; width: 100%; min-height: 44px; padding: .6rem; text-align: left;
    background: var(--st-surface-2); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius-lg); cursor: pointer;
    font: inherit; transition: border-color .12s, background .12s; }
  .option:hover { background: var(--st-surface-3); }
  .option:focus-visible { outline: 2px solid var(--st-focus); outline-offset: 2px; }
  .option.is-answer { border-color: var(--st-ok); box-shadow: inset 0 0 0 1px var(--st-ok); }
  .option.is-wrong-pick { border-color: var(--st-danger); box-shadow: inset 0 0 0 1px var(--st-danger); }
  .num { position: absolute; top: .4rem; left: .5rem; font: 600 .75rem var(--st-mono); color: var(--st-text-2); }
  .kind { align-self: center; font: .75rem var(--st-mono); color: var(--dg-ink); }
  .option-figure { display: block; height: clamp(7.5rem, 22vw, 10rem); }
  .why { font-size: .875rem; line-height: 1.4; color: var(--st-text-2); }
  .is-answer .why { color: var(--st-text); }
  .verdict { margin-top: 1rem; display: flex; flex-wrap: wrap; align-items: center; gap: .75rem 1.25rem; outline: none; }
  .verdict h2 { width: 100%; }
  .verdict p { margin: 0; }
  .verdict .btn { min-height: 44px; min-width: 8rem; }
  .result { font-size: 1.05rem; color: var(--st-danger); display: flex; flex-wrap: wrap; gap: .5rem 1rem; }
  .result.ok { color: var(--st-ok); }
  @media (prefers-reduced-motion: reduce) {
    .timer span, .option { transition: none; }
  }
</style>
