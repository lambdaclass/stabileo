<script lang="ts">
  import { onMount } from 'svelte';
  import LandingFooter from '../landing/LandingFooter.svelte';
  import StructureFigure from './StructureFigure.svelte';
  import GameHud from './GameHud.svelte';
  import GameOver from './GameOver.svelte';
  import { publicI18n } from '../../lib/i18n/store.svelte';
  import { applyPageMeta, restorePageMeta, stabileoSoftware, breadcrumbs } from '../../lib/page-meta';
  import { initSolver } from '../../lib/engine/wasm-solver';
  import { seedFrom } from '../edu/exercise-params';
  import { buildRound, type Round, type RoundType } from './round';
  import { answer, newGame, nextRound, readBest, recordBest, timeBonus, TIME_BONUS_WINDOW_MS, type GameState } from './scoring';
  import { cue, readSound, writeSound, type Cue } from './sfx';
  import { tg, tagText, type Key } from './strings';
  import type { DiagramKind } from './traces';
  import '../landing/landing.css';

  let { path }: { path: string } = $props();

  const INK: Record<DiagramKind, string> = { N: 'var(--st-ok)', V: 'var(--st-interactive)', M: 'var(--st-accent)', D: 'var(--st-value)' };
  const MILESTONES = [3, 5, 8, 12, 20];
  const SPARKS = Array.from({ length: 14 }, (_, k) => k);
  const HOW: Key[] = ['how.1', 'how.2', 'how.3'];

  let game = $state<GameState | null>(null);
  let round = $state<Round | null>(null);
  let picked = $state<number | null>(null);
  let best = $state(0);
  let newBest = $state(false);
  let failed = $state(false);
  let starting = $state(false);
  let sound = $state(true);
  let banner = $state<number | null>(null);
  let toast = $state<number | null>(null);
  let shownAt = 0;
  let now = $state(0);
  let gameSeed = 0;
  let bannerTimer: ReturnType<typeof setTimeout> | undefined;
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
    sound = readSound();
    void initSolver().catch(() => {});
    return () => clearTimeout(bannerTimer);
  });

  $effect(() => {
    if (game?.phase !== 'playing') return;
    const id = setInterval(() => { now = performance.now(); }, 100);
    return () => clearInterval(id);
  });

  function play(c: Cue, streak = 0) {
    if (sound) cue(c, streak);
  }

  function toggleSound() {
    sound = !sound;
    writeSound(sound);
    play('tick');
  }

  function seedFromAddress(): number {
    const raw = new URLSearchParams(location.search).get('seed');
    return raw && /^\d+$/.test(raw) ? Number(raw) >>> 0 : Math.floor(Math.random() * 2 ** 32);
  }

  function deal(state: GameState, seed = seedFrom(`${gameSeed}:${state.round}`)) {
    round = buildRound(state.level, seed);
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
      banner = null;
      toast = null;
      heading?.focus();
    } catch {
      failed = true;
    } finally {
      starting = false;
    }
  }

  function showBanner(level: number) {
    banner = level;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { banner = null; }, 2200);
  }

  function choose(i: number) {
    if (!game || !round || game.phase !== 'playing') return;
    const streak = game.streak;
    picked = i;
    game = answer(game, i === round.answer, performance.now() - shownAt);
    toast = null;
    if (game.last?.correct) {
      play('right', streak);
      if (game.last.levelUp) { play('level'); showBanner(game.level); }
      if (MILESTONES.includes(game.streak)) toast = game.streak;
    } else {
      play(game.phase === 'over' ? 'over' : 'wrong');
      navigator.vibrate?.(90);
    }
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
    banner = null;
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
      type: () => round?.type ?? null,
      level: (n: number) => { if (!game) return; const s: GameState = { ...game, level: n, round: game.round + 1, phase: 'playing', last: null }; deal(s); game = s; },
      find: (type: RoundType) => {
        if (!game) return false;
        for (let k = 0; k < 200; k++) {
          const s: GameState = { ...game, round: game.round + 1, phase: 'playing', last: null };
          deal(s);
          game = s;
          if (round?.type === type) return true;
        }
        return false;
      },
    };
  }

  const question = $derived(!round ? '' : round.type === 'odd' ? tg('ask.odd') : round.type === 'which' ? tg(`ask.which.${round.kind}` as Key) : tg(`ask.${round.kind}` as Key));
  const elapsed = $derived(now - shownAt);
  const remaining = $derived(game?.phase === 'playing' ? Math.max(0, 1 - elapsed / TIME_BONUS_WINDOW_MS) : 0);
  const clock = $derived(remaining > 0.5 ? 'var(--st-ok)' : remaining > 0.2 ? 'var(--st-warn)' : 'var(--st-danger)');
  const kindOf = (i: number): DiagramKind => round!.options[i]!.diagram.kind;
  const explain = (i: number) => {
    const o = round!.options[i]!;
    if (round!.type === 'which') return o.tag ? tg('which.other') : tg('which.correct');
    if (o.tag) return tagText(o.tag, o.diagram.kind);
    return round!.type === 'odd' ? tg('is.consistent') : tg('is.correct');
  };
</script>

<svelte:window onkeydown={onKey} />

<div class="landing diagram-game">
  <main class="sec sec--ink">
    <div class="wrap dg-wrap">
      <header class="dg-intro" class:playing={!!game}>
        <h1 bind:this={heading} tabindex="-1">{tg('title')}</h1>
        {#if !game}
          <p class="lead">{tg('lead')}</p>
          <button type="button" class="btn btn-primary dg-start" onclick={start} disabled={starting} data-testid="dg-start">{tg('start')}</button>
          {#if failed}<p role="alert">{tg('loadFailed')}</p>{/if}
          <ol class="how">
            {#each HOW as k, i (k)}<li><span class="how-n" aria-hidden="true">{i + 1}</span>{tg(k)}</li>{/each}
          </ol>
          <p class="fine">{tg('convention')}</p>
          <p class="fine">{tg('keys')}</p>
          {#if best > 0}<p class="fine" data-testid="dg-best-intro">{tg('best')}: <strong>{best}</strong></p>{/if}
        {/if}
      </header>

      {#if game && round}
        <GameHud {game} {best} {sound} ontoggle={toggleSound} />
        <div class="timer" aria-hidden="true" style:--dg-clock={clock}>
          <span style:transform={`scaleX(${remaining})`}></span>
          {#if game.phase === 'playing'}<em>+{timeBonus(elapsed)}</em>{/if}
        </div>

        <section class="problem">
          <h2 data-testid="dg-question">{question}</h2>
          <div class="problem-figure" class:shown={round.type === 'which'} style:--dg-ink={round.kind ? INK[round.kind] : null}>
            {#if round.type === 'which'}
              <StructureFigure model={round.model} diagram={round.shown} bare label={tg('shown')} />
            {:else}
              <StructureFigure model={round.model} label={tg('structure')} />
            {/if}
          </div>
        </section>

        <ol class="options" class:four={round.options.length === 4} data-testid="dg-options" data-round-type={round.type}>
          {#each round.options as option, i (`${game.round}:${i}`)}
            {@const kind = kindOf(i)}
            {@const revealed = game.phase !== 'playing'}
            {@const won = revealed && i === round.answer && picked === i}
            <li>
              <button type="button" class="option" style:--dg-ink={INK[kind]}
                class:is-answer={revealed && i === round.answer} class:is-wrong-pick={revealed && picked === i && i !== round.answer}
                class:is-faded={revealed && i !== round.answer && picked !== i} class:won
                aria-pressed={picked === i}
                aria-label={`${tg('option', { n: i + 1 })}: ${round.type === 'which' ? tg('structure') : tg(`kind.${kind}` as Key)}`}
                onclick={() => choose(i)} data-testid={`dg-option-${i}`}>
                <span class="num" aria-hidden="true">{i + 1}</span>
                {#if round.type === 'odd'}<span class="kind">{tg(`kind.${kind}` as Key)}</span>{/if}
                <span class="option-figure">
                  {#if round.type === 'which'}
                    <StructureFigure model={option.model!} diagram={revealed ? option.diagram : null} faintLoads={revealed} label={tg('structure')} />
                  {:else}
                    <StructureFigure model={round.model} diagram={option.diagram} faintLoads label={tg(`kind.${kind}` as Key)} />
                  {/if}
                </span>
                {#if revealed}<span class="why" data-testid={`dg-why-${i}`} data-tag={option.tag ?? ''}>{explain(i)}</span>{/if}
                {#if won}
                  <span class="burst" aria-hidden="true">{#each SPARKS as k (k)}<i style:--a={`${(360 * k) / SPARKS.length}deg`} style:--d={`${3 + (k % 3)}rem`}></i>{/each}</span>
                  <span class="float-pts" aria-hidden="true">+{game.last?.points}</span>
                {/if}
              </button>
            </li>
          {/each}
        </ol>

        {#if game.phase !== 'playing'}
          <section class="verdict" bind:this={feedback} tabindex="-1" aria-live="polite" data-testid="dg-verdict" data-correct={game.last?.correct ?? false}>
            {#if game.phase === 'over'}
              <GameOver {game} {newBest} onagain={start} />
            {:else}
              <div class="result" class:ok={game.last?.correct}>
                <p class="headline">{game.last?.correct ? tg('right') : tg('wrong')}</p>
                {#if game.last?.correct}
                  <p class="points" data-testid="dg-points">{tg('points', { n: game.last.points })}</p>
                  <p class="chips">
                    <span>{tg('pts.base', { n: game.last.base })}</span>
                    {#if game.last.multiplier > 1}<span class="hot">{tg('pts.streak', { n: game.last.multiplier.toFixed(2) })}</span>{/if}
                    {#if game.last.speed > 0}<span class="fast">{tg('pts.speed', { n: game.last.speed })}</span>{/if}
                  </p>
                  {#if toast}<p class="toast" data-testid="dg-streak-toast">{tg('streakToast', { n: toast })}</p>{/if}
                {/if}
              </div>
              <button type="button" class="btn btn-primary next" onclick={proceed} data-testid="dg-next">{tg('next')}</button>
            {/if}
          </section>
        {/if}
      {/if}
    </div>
  </main>
  {#if banner !== null}
    <div class="levelup" role="status" data-testid="dg-levelup">
      <strong>{tg('levelUp', { n: banner + 1 })}</strong>
      <span>{tg(`level.${banner + 1}` as Key)}</span>
    </div>
  {/if}
  <LandingFooter />
</div>

<style>
  .diagram-game :global(.nav) { background: var(--lp-ink); }
  .diagram-game main.sec { padding: clamp(4.5rem, 7vw, 6rem) 0 3rem; }
  .dg-wrap { --lp-gut: 16px; max-width: 76rem; }
  h1 { font: 600 clamp(1.75rem, 4.5vw, 2.75rem)/1.1 var(--lp-display); margin: 0 0 .75rem; outline: none; overflow-wrap: anywhere; }
  .playing h1 { font-size: clamp(1.25rem, 3vw, 1.6rem); margin-bottom: .6rem; }
  h2 { font: 500 clamp(1.05rem, 2.6vw, 1.35rem)/1.3 var(--lp-display); margin: 0 0 .5rem; outline: none; }
  .lead { font-size: 1.05rem; max-width: 46rem; }
  .how { list-style: none; margin: 1rem 0; padding: 0; display: grid; gap: .6rem; max-width: 46rem; }
  .how li { display: flex; align-items: flex-start; gap: .7rem; }
  .how-n { flex: none; display: inline-grid; place-items: center; width: 1.7rem; height: 1.7rem; border-radius: 999px; background: var(--st-accent); color: var(--st-surface); font: 700 .9rem var(--st-mono); }
  .fine { font-size: .9rem; color: var(--st-text-2); max-width: 46rem; }
  .dg-start { margin: .25rem 0 .5rem; min-height: 52px; min-width: 11rem; font-size: 1.1rem; box-shadow: 0 4px 0 color-mix(in srgb, var(--st-accent) 55%, black); }
  .dg-start:active { transform: translateY(3px); box-shadow: 0 1px 0 color-mix(in srgb, var(--st-accent) 55%, black); }
  .timer { position: relative; height: 8px; border-radius: 999px; background: var(--st-hair); margin-bottom: 1rem; }
  .timer span { display: block; height: 100%; border-radius: 999px; background: var(--dg-clock); transform-origin: left; transition: transform .1s linear, background .3s; }
  .timer em { position: absolute; right: 0; top: 12px; font: 600 .75rem var(--st-mono); font-style: normal; color: var(--st-text-3); }
  .problem { margin-bottom: 1rem; }
  .problem-figure { height: clamp(8rem, 22vw, 12rem); border: 1px solid var(--st-hair); border-radius: var(--st-radius-lg); background: var(--st-surface); padding: .5rem; }
  .problem-figure.shown { border: 2px solid var(--dg-ink); }
  .options { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: .9rem; }
  @media (min-width: 760px) { .options { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (min-width: 560px) { .options.four { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (min-width: 1100px) { .options.four { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
  .option { position: relative; display: flex; flex-direction: column; gap: .4rem; width: 100%; min-height: 44px; padding: .6rem; text-align: left;
    background: var(--st-surface-2); color: var(--st-text); border: 2px solid var(--st-hair-strong); border-radius: var(--st-radius-lg); cursor: pointer;
    font: inherit; box-shadow: 0 5px 0 var(--st-hair-strong); transition: transform .08s, box-shadow .08s, border-color .15s, background .15s, opacity .2s; }
  .option:hover { background: var(--st-surface-3); transform: translateY(-2px); box-shadow: 0 7px 0 var(--st-hair-strong); }
  .option:active { transform: translateY(4px); box-shadow: 0 1px 0 var(--st-hair-strong); }
  .option:focus-visible { outline: 2px solid var(--st-focus); outline-offset: 3px; }
  .option.is-answer { border-color: var(--st-ok); box-shadow: 0 5px 0 var(--st-ok); }
  .option.won { animation: pop .45s cubic-bezier(.3, 1.6, .5, 1); background: color-mix(in srgb, var(--st-ok) 10%, var(--st-surface-2)); }
  .option.is-wrong-pick { border-color: var(--st-danger); box-shadow: 0 5px 0 var(--st-danger); animation: shake .4s; }
  .option.is-faded { opacity: .6; }
  .num { position: absolute; top: .45rem; left: .5rem; display: inline-grid; place-items: center; width: 1.5rem; height: 1.5rem; border-radius: 999px;
    background: var(--st-surface-3); font: 700 .75rem var(--st-mono); color: var(--st-text-2); }
  .is-answer .num { background: var(--st-ok); color: var(--st-surface); }
  .is-wrong-pick .num { background: var(--st-danger); color: var(--st-surface); }
  .kind { align-self: center; font: 600 .75rem var(--st-mono); color: var(--dg-ink); }
  .option-figure { display: block; height: clamp(7.5rem, 20vw, 10rem); }
  .why { font-size: .875rem; line-height: 1.4; color: var(--st-text-2); }
  .is-answer .why { color: var(--st-text); }
  .burst { position: absolute; left: 50%; top: 45%; width: 0; height: 0; pointer-events: none; }
  .burst i { position: absolute; width: .5rem; height: .5rem; border-radius: 2px; background: var(--st-ok);
    animation: spark .7s ease-out forwards; transform: rotate(var(--a)) translateX(0); }
  .burst i:nth-child(3n) { background: var(--st-warn); }
  .burst i:nth-child(3n + 1) { background: var(--st-accent); }
  .float-pts { position: absolute; left: 50%; top: 30%; transform: translateX(-50%); pointer-events: none; font: 800 clamp(1.6rem, 4vw, 2.2rem) var(--st-mono);
    color: var(--st-ok); text-shadow: 0 2px 0 var(--st-surface); animation: rise 1s ease-out forwards; }
  .verdict { margin-top: 1.1rem; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem 1.25rem; outline: none; }
  .result { display: flex; flex-wrap: wrap; align-items: baseline; gap: .4rem 1rem; color: var(--st-danger); }
  .result p { margin: 0; }
  .headline { font: 700 1.25rem var(--lp-display); }
  .result.ok { color: var(--st-ok); }
  .points { font: 800 1.5rem var(--st-mono); animation: pop .45s cubic-bezier(.3, 1.6, .5, 1); }
  .chips { display: flex; flex-wrap: wrap; gap: .35rem; }
  .chips span { padding: .15rem .55rem; border-radius: 999px; border: 1px solid var(--st-hair-strong); color: var(--st-text-2); font: .8rem var(--st-mono); }
  .chips .hot { border-color: var(--st-warn); color: var(--st-warn); }
  .chips .fast { border-color: var(--st-interactive); color: var(--st-interactive); }
  .toast { padding: .2rem .7rem; border-radius: 999px; background: var(--st-warn); color: var(--st-surface); font-weight: 700; animation: pop .5s cubic-bezier(.3, 1.6, .5, 1); }
  .verdict .btn { min-height: 48px; min-width: 9rem; }
  .levelup { position: fixed; left: 50%; top: 40%; z-index: 20; display: grid; justify-items: center; gap: .3rem; padding: 1.25rem 2rem; max-width: calc(100vw - 32px);
    transform: translate(-50%, -50%); text-align: center; pointer-events: none;
    background: var(--st-accent); color: var(--st-surface); border-radius: var(--st-radius-lg); box-shadow: 0 10px 40px rgba(0, 0, 0, .35);
    animation: banner 2.2s cubic-bezier(.3, 1.4, .5, 1) forwards; }
  .levelup strong { font: 800 clamp(1.8rem, 6vw, 2.8rem)/1 var(--lp-display); }
  .levelup span { font-size: .95rem; }
  @keyframes pop { 0% { transform: scale(1); } 40% { transform: scale(1.06); } 100% { transform: scale(1); } }
  @keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-8px); } 40% { transform: translateX(7px); } 60% { transform: translateX(-5px); } 80% { transform: translateX(3px); } }
  @keyframes spark { 0% { opacity: 1; transform: rotate(var(--a)) translateX(0) scale(1); } 100% { opacity: 0; transform: rotate(var(--a)) translateX(var(--d)) scale(.4); } }
  @keyframes rise { 0% { opacity: 0; transform: translate(-50%, 10px) scale(.6); } 20% { opacity: 1; transform: translate(-50%, 0) scale(1.15); } 100% { opacity: 0; transform: translate(-50%, -3rem) scale(1); } }
  @keyframes banner { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.5); } 15% { opacity: 1; transform: translate(-50%, -50%) scale(1.05); } 80% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -60%) scale(1); } }
  @media (prefers-reduced-motion: reduce) {
    .timer span, .option { transition: none; }
    .option.won, .option.is-wrong-pick, .points, .toast, .levelup { animation: none; }
    .burst, .float-pts { display: none; }
    .levelup { opacity: 1; }
  }
</style>
