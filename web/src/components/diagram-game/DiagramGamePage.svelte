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
  import { marked, tg, tagText, type Key } from './strings';
  import { arrange } from './layout';
  import { figureAspect } from './figure';
  import type { DiagramKind } from './traces';
  import '../landing/landing.css';

  let { path }: { path: string } = $props();

  const INK: Record<DiagramKind, string> = { N: 'var(--st-ok)', V: 'var(--st-interactive)', M: 'var(--st-accent)', D: 'var(--st-value)' };
  const SYMBOL: Record<DiagramKind, string> = { N: 'N', V: 'Vz', M: 'My', D: 'δ' };
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
  let portraitPhone = $state(false);
  let inspected = $state<number | null>(null);
  let boardWidth = $state(0);
  let boardHeight = $state(0);
  let canFullscreen = $state(false);
  let shownAt = 0;
  let now = $state(0);
  let gameSeed = 0;
  let bannerTimer: ReturnType<typeof setTimeout> | undefined;
  let root: HTMLElement | undefined = $state();
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
    canFullscreen = !!document.fullscreenEnabled;
    void initSolver().catch(() => {});
    const query = matchMedia('(pointer: coarse) and (orientation: portrait) and (max-width: 760px)');
    const sync = () => { portraitPhone = query.matches; };
    sync();
    query.addEventListener('change', sync);
    return () => { clearTimeout(bannerTimer); query.removeEventListener('change', sync); };
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
    inspected = null;
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
      queueMicrotask(() => heading?.focus());
    } catch {
      failed = true;
    } finally {
      starting = false;
    }
  }

  /** Either request can be refused (iPhone Safari has neither); the game then plays as the phone is held. */
  async function startFullscreen() {
    await root?.requestFullscreen().catch(() => {});
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {});
    await start();
  }

  function quit() {
    game = null;
    round = null;
    banner = null;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }

  function showBanner(level: number) {
    banner = level;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { banner = null; }, 2200);
  }

  function choose(i: number) {
    if (game?.phase === 'answered' || game?.phase === 'over') { inspected = i; return; }
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
    if (game.phase !== 'over' && /^[1-9]$/.test(e.key) && Number(e.key) <= round.options.length) {
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
      find: (type: RoundType, template?: string) => {
        if (!game) return false;
        for (let k = 0; k < 400; k++) {
          const s: GameState = { ...game, round: game.round + 1, phase: 'playing', last: null };
          deal(s);
          game = s;
          if (round?.type === type && (!template || round.template === template)) return true;
        }
        return false;
      },
    };
  }

  const question = $derived(!round ? null : marked(tg(round.type === 'odd' ? 'ask.odd' : round.type === 'which' ? `ask.which.${round.kind}` as Key : `ask.${round.kind}` as Key)));
  const elapsed = $derived(now - shownAt);
  const remaining = $derived(game?.phase === 'playing' ? Math.max(0, 1 - elapsed / TIME_BONUS_WINDOW_MS) : 0);
  const clock = $derived(remaining > 0.5 ? 'var(--st-ok)' : remaining > 0.2 ? 'var(--st-warn)' : 'var(--st-danger)');
  const kindOf = (i: number): DiagramKind => round!.options[i]!.diagram.kind;
  const explain = (i: number) => {
    const o = round!.options[i]!;
    if (round!.type === 'which') return o.tag ? tg('which.other') : tg('which.correct');
    if (o.tag) return tagText(o.tag, o.diagram.kind, o.diagram.from);
    return round!.type === 'odd' ? tg('is.consistent') : tg('is.correct');
  };
  const kindName = (k: DiagramKind) => `${tg(`kind.${k}` as Key)} (${SYMBOL[k]})`;
  const layout = $derived(round && boardWidth > 0 && boardHeight > 0 ? arrange({
    width: boardWidth, height: boardHeight, options: round.options.length, aspect: figureAspect(round.model),
    gap: 10, cardChromeX: 20, cardChromeY: round.type === 'odd' ? 46 : 23, problemChrome: 16, textHeight: 38, textMinWidth: 220,
    structureInCards: round.type !== 'which',
  }) : null);
  const rows = $derived(layout && round ? Math.ceil(round.options.length / layout.columns) : 1);
  const boardStyle = $derived(!layout ? '' : layout.problem === 'none' ? 'grid-template: minmax(0, 1fr) / minmax(0, 1fr);' : layout.problem === 'top'
    ? `grid-template-rows: minmax(0, ${layout.split}fr) minmax(0, ${1 - layout.split}fr); grid-template-columns: minmax(0, 1fr);`
    : `grid-template-columns: minmax(0, ${layout.split}fr) minmax(0, ${1 - layout.split}fr); grid-template-rows: minmax(0, 1fr);`);
  const spare = $derived(layout && round ? layout.columns * rows - round.options.length : 0);
  const cardText = $derived(layout?.text ?? true);
  const told = $derived(game && game.phase !== 'playing' && round ? inspected ?? (game.last?.correct ? null : picked) : null);
</script>

<svelte:window onkeydown={onKey} />

<div class="landing diagram-game" class:playing={!!game} bind:this={root}>
  <main class="sec sec--ink">
    <div class="wrap dg-wrap">
      <header class="dg-intro">
        <h1 bind:this={heading} tabindex="-1" class:sr-only={!!game}>{tg('title')}</h1>
        {#if !game}
          <p class="lead">{tg('lead')}</p>
          <button type="button" class="btn btn-primary dg-start" onclick={start} disabled={starting} data-testid="dg-start">{tg('start')}</button>
          {#if failed}<p role="alert">{tg('loadFailed')}</p>{/if}
          {#if portraitPhone}
            <aside class="rotate" data-testid="dg-rotate">
              <svg viewBox="0 0 48 48" aria-hidden="true"><rect x="16" y="6" width="16" height="28" rx="3" /><rect class="turned" x="10" y="22" width="28" height="16" rx="3" /></svg>
              <div>
                <strong>{tg('rotate.title')}</strong>
                <p>{tg('rotate.body')}</p>
                {#if canFullscreen}<button type="button" class="btn btn-ghost" onclick={startFullscreen} disabled={starting} data-testid="dg-fullscreen">{tg('rotate.full')}</button>{/if}
              </div>
            </aside>
          {/if}
          <ol class="how">
            {#each HOW as k, i (k)}<li><span class="how-n" aria-hidden="true">{i + 1}</span>{tg(k)}</li>{/each}
          </ol>
          <p class="fine">{tg('convention')}</p>
          <p class="fine">{tg('keys')}</p>
          {#if best > 0}<p class="fine" data-testid="dg-best-intro">{tg('best')}: <strong>{best}</strong></p>{/if}
        {/if}
      </header>

      {#if game && round}
        <div class="play" data-testid="dg-play">
          <GameHud {game} {best} {sound} ontoggle={toggleSound} onquit={quit} />
          <div class="timer" aria-hidden="true" style:--dg-clock={clock}>
            <span class="track"><span class="fill" style:transform={`scaleX(${remaining})`}></span></span>
            <em>{game.phase === 'playing' ? `+${timeBonus(elapsed)}` : ''}</em>
          </div>

          <h2 class="question" data-testid="dg-question">
            {question?.before}{#if question?.term && round.kind}<span class="term" style:color={INK[round.kind]} data-testid="dg-term">{question.term} ({SYMBOL[round.kind]})</span>{/if}{question?.after}
          </h2>

          <div class="board" bind:clientWidth={boardWidth} bind:clientHeight={boardHeight} style={boardStyle} data-problem={layout?.problem} data-columns={layout?.columns}>
            <div class="problem-figure" class:shown={round.type === 'which'} hidden={layout?.problem === 'none'} style:--dg-ink={round.kind ? INK[round.kind] : null}>
              {#if round.type === 'which'}
                <StructureFigure model={round.model} diagram={round.shown} bare label={tg('shown')} />
              {:else}
                <StructureFigure model={round.model} label={tg('structure')} />
              {/if}
            </div>

            <ol class="options" style:--cols={layout?.columns ?? round.options.length} style:--rows={rows} style:--spare={spare + 1} data-testid="dg-options" data-round-type={round.type}>
              {#each round.options as option, i (`${game.round}:${i}`)}
                {@const kind = kindOf(i)}
                {@const revealed = game.phase !== 'playing'}
                {@const won = revealed && i === round.answer && picked === i}
                <li>
                  <button type="button" class="option" style:--dg-ink={INK[kind]}
                    class:is-answer={revealed && i === round.answer} class:is-wrong-pick={revealed && picked === i && i !== round.answer}
                    class:is-faded={revealed && i !== round.answer && picked !== i && inspected !== i} class:won class:inspected={revealed && inspected === i}
                    aria-pressed={picked === i}
                    aria-label={`${tg('option', { n: i + 1 })}: ${round.type === 'which' ? tg('structure') : kindName(kind)}`}
                    onclick={() => choose(i)} data-testid={`dg-option-${i}`}>
                    <span class="num" aria-hidden="true">{i + 1}</span>
                    {#if round.type === 'odd'}<span class="kind">{(layout?.cardWidth ?? 999) >= 170 ? kindName(kind) : SYMBOL[kind]}</span>{/if}
                    <span class="option-figure">
                      {#if round.type === 'which'}
                        <StructureFigure model={option.model!} diagram={revealed ? option.diagram : null} faintLoads={revealed} label={tg('structure')} />
                      {:else}
                        <StructureFigure model={round.model} diagram={option.diagram} faintLoads={layout?.problem !== 'none'} label={kindName(kind)} />
                      {/if}
                    </span>
                    {#if revealed && cardText}<span class="why" data-testid={`dg-why-${i}`} data-tag={option.tag ?? ''} title={explain(i)}>{explain(i)}</span>{/if}
                    {#if won}
                      <span class="burst" aria-hidden="true">{#each SPARKS as k (k)}<i style:--a={`${(360 * k) / SPARKS.length}deg`} style:--d={`${3 + (k % 3)}rem`}></i>{/each}</span>
                      <span class="float-pts" aria-hidden="true">+{game.last?.points}</span>
                    {/if}
                  </button>
                </li>
              {/each}
            </ol>
          </div>

          {#if game.phase === 'playing'}
            <p class="bar hint">{tg('pickHint')}</p>
          {:else}
            <section class="bar verdict" bind:this={feedback} tabindex="-1" aria-live="polite" data-testid="dg-verdict" data-correct={game.last?.correct ?? false}>
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
                {#if told !== null && (!cardText || told === picked)}
                  <p class="reason" data-testid="dg-reason"><span class="tag-n">{told + 1}</span>{explain(told)}</p>
                {:else if !cardText}
                  <p class="reason tap">{tg('tapWhy')}</p>
                {/if}
              </div>
              {#if game.phase === 'answered'}<button type="button" class="btn btn-primary next" onclick={proceed} data-testid="dg-next">{tg('next')}</button>{/if}
            </section>
          {/if}

          {#if game.phase === 'over'}
            <div class="over-layer"><GameOver {game} {newBest} onagain={start} onquit={quit} /></div>
          {/if}
        </div>
      {/if}
    </div>
  </main>
  {#if banner !== null}
    <div class="levelup" role="status" data-testid="dg-levelup">
      <strong>{tg('levelUp', { n: banner + 1 })}</strong>
      <span>{tg(`level.${banner + 1}` as Key)}</span>
    </div>
  {/if}
  {#if !game}<LandingFooter />{/if}
</div>

<style>
  .diagram-game :global(.nav) { background: var(--lp-ink); }
  .diagram-game main.sec { padding: clamp(4.5rem, 7vw, 6rem) 0 3rem; }
  .dg-wrap { --lp-gut: 16px; max-width: 80rem; }
  .diagram-game.playing { overflow: hidden; }
  .diagram-game.playing main.sec { padding: 0; height: 100%; box-sizing: border-box; }
  .diagram-game.playing .dg-wrap { height: 100%; box-sizing: border-box; padding-block: .6rem; display: flex; flex-direction: column; }
  .diagram-game:fullscreen { inset: 0; }
  @media (max-height: 540px) and (orientation: landscape) {
    :global(body:has(.diagram-game.playing) .site-header) { display: none; }
    .diagram-game.playing { top: 0; }
    .diagram-game.playing .dg-wrap { padding-block: .4rem; }
  }

  h1 { font: 600 clamp(1.75rem, 4.5vw, 2.75rem)/1.1 var(--lp-display); margin: 0 0 .75rem; outline: none; overflow-wrap: anywhere; }
  h1.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .dg-intro { display: flex; flex-direction: column; align-items: flex-start; }
  .lead { font-size: 1.05rem; max-width: 46rem; }
  .how { list-style: none; margin: 1rem 0; padding: 0; display: grid; gap: .6rem; max-width: 46rem; }
  .how li { display: flex; align-items: flex-start; gap: .7rem; }
  .how-n { flex: none; display: inline-grid; place-items: center; width: 1.7rem; height: 1.7rem; border-radius: 999px; background: var(--st-accent); color: var(--st-surface); font: 700 .9rem var(--st-mono); }
  .fine { font-size: .9rem; color: var(--st-text-2); max-width: 46rem; }
  .dg-start { margin: .25rem 0 .5rem; min-height: 52px; min-width: 11rem; font-size: 1.1rem; box-shadow: 0 4px 0 color-mix(in srgb, var(--st-accent) 55%, black); }
  .dg-start:active { transform: translateY(3px); box-shadow: 0 1px 0 color-mix(in srgb, var(--st-accent) 55%, black); }
  .rotate { display: flex; gap: .9rem; align-items: flex-start; margin: .75rem 0; padding: .8rem; max-width: 46rem;
    border: 1px solid var(--st-warn); border-radius: var(--st-radius-lg); background: color-mix(in srgb, var(--st-warn) 8%, transparent); }
  .rotate svg { flex: none; width: 3rem; height: 3rem; fill: none; stroke: var(--st-warn); stroke-width: 2; stroke-linecap: round; }
  .rotate .turned { animation: turn 2.4s ease-in-out infinite; transform-origin: 24px 24px; }
  .rotate p { margin: .2rem 0 .5rem; font-size: .92rem; color: var(--st-text-2); }
  .rotate .btn { min-height: 44px; }

  .play { position: relative; flex: 1; min-height: 0; display: grid; grid-template-rows: auto auto auto minmax(0, 1fr) auto; gap: .45rem; }
  .timer { display: flex; align-items: center; gap: .5rem; }
  .track { flex: 1; height: 8px; border-radius: 999px; background: var(--st-hair); overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--dg-clock); transform-origin: left; transition: transform .1s linear, background .3s; }
  .timer em { min-width: 2.5rem; text-align: right; font: 600 .75rem var(--st-mono); font-style: normal; color: var(--st-text-3); }
  .question { font: 500 clamp(1rem, 2.4vw, 1.3rem)/1.25 var(--lp-display); margin: 0; outline: none; }
  .term { font-weight: 700; }

  .board { min-height: 0; min-width: 0; display: grid; grid-template-rows: minmax(0, .3fr) minmax(0, .7fr); gap: 10px; }
  .problem-figure { min-height: 0; min-width: 0; box-sizing: border-box; border: 2px solid var(--st-hair); border-radius: var(--st-radius-lg); background: var(--st-surface); padding: 6px; }
  .problem-figure.shown { border: 2px solid var(--dg-ink); }
  .problem-figure[hidden] { display: none; }
  .options { list-style: none; margin: 0; padding: 0; min-height: 0; min-width: 0; display: grid; gap: 10px;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); grid-template-rows: repeat(var(--rows), minmax(0, 1fr)); }
  .options li { min-height: 0; min-width: 0; display: flex; }
  .options li:last-child { grid-column: span var(--spare); }
  .option { position: relative; display: flex; flex-direction: column; gap: 5px; width: 100%; min-height: 0; box-sizing: border-box; padding: 7px 8px 8px; text-align: left;
    background: var(--st-surface-2); color: var(--st-text); border: 2px solid var(--st-hair-strong); border-radius: var(--st-radius-lg); cursor: pointer;
    font: inherit; box-shadow: 0 4px 0 var(--st-hair-strong); margin-bottom: 4px; overflow: hidden;
    transition: transform .08s, box-shadow .08s, border-color .15s, background .15s, opacity .2s; }
  .option:hover { background: var(--st-surface-3); transform: translateY(-2px); box-shadow: 0 6px 0 var(--st-hair-strong); }
  .option:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--st-hair-strong); }
  .option:focus-visible { outline: 2px solid var(--st-focus); outline-offset: 2px; }
  .option.is-answer { border-color: var(--st-ok); box-shadow: 0 4px 0 var(--st-ok); }
  .option.won { animation: pop .45s cubic-bezier(.3, 1.6, .5, 1); background: color-mix(in srgb, var(--st-ok) 10%, var(--st-surface-2)); overflow: visible; }
  .option.is-wrong-pick { border-color: var(--st-danger); box-shadow: 0 4px 0 var(--st-danger); animation: shake .4s; }
  .option.is-faded { opacity: .6; }
  .option.inspected { outline: 2px dashed var(--st-text-3); outline-offset: 2px; }
  .num { position: absolute; top: .35rem; left: .4rem; display: inline-grid; place-items: center; width: 1.4rem; height: 1.4rem; border-radius: 999px;
    background: var(--st-surface-3); font: 700 .72rem var(--st-mono); color: var(--st-text-2); z-index: 1; }
  .is-answer .num { background: var(--st-ok); color: var(--st-surface); }
  .is-wrong-pick .num { background: var(--st-danger); color: var(--st-surface); }
  .kind { align-self: center; max-width: 100%; height: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 700 .75em/18px var(--st-mono); color: var(--dg-ink); }
  .option-figure { display: block; flex: 1 1 0; min-height: 0; }
  .why { flex: none; height: 2.6em; font-size: .8em; line-height: 1.3; color: var(--st-text-2); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .is-answer .why { color: var(--st-text); }
  .burst { position: absolute; left: 50%; top: 45%; width: 0; height: 0; pointer-events: none; }
  .burst i { position: absolute; width: .5rem; height: .5rem; border-radius: 2px; background: var(--st-ok); animation: spark .7s ease-out forwards; transform: rotate(var(--a)) translateX(0); }
  .burst i:nth-child(3n) { background: var(--st-warn); }
  .burst i:nth-child(3n + 1) { background: var(--st-accent); }
  .float-pts { position: absolute; left: 50%; top: 30%; transform: translateX(-50%); pointer-events: none; font: 800 clamp(1.4rem, 4vw, 2.2rem) var(--st-mono);
    color: var(--st-ok); text-shadow: 0 2px 0 var(--st-surface); animation: rise 1s ease-out forwards; }

  .bar { margin: 0; min-height: 48px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .4rem 1rem; outline: none; }
  .hint { font-size: .85rem; color: var(--st-text-3); }
  .result { display: flex; flex-wrap: wrap; align-items: baseline; gap: .3rem .9rem; min-width: 0; flex: 1; color: var(--st-danger); }
  .result p { margin: 0; }
  .headline { font: 700 1.15rem var(--lp-display); }
  .result.ok { color: var(--st-ok); }
  .points { font: 800 1.35rem var(--st-mono); animation: pop .45s cubic-bezier(.3, 1.6, .5, 1); }
  .reason { color: var(--st-text-2); font-size: .9em; line-height: 1.35; flex: 1 1 16rem; }
  .reason.tap { color: var(--st-text-3); }
  .tag-n { display: inline-grid; place-items: center; width: 1.4em; height: 1.4em; margin-right: .4em; border-radius: 999px; background: var(--st-surface-3); font: 700 .8em var(--st-mono); vertical-align: .1em; }
  .chips { display: flex; flex-wrap: wrap; gap: .35rem; }
  .chips span { padding: .1rem .5rem; border-radius: 999px; border: 1px solid var(--st-hair-strong); color: var(--st-text-2); font: .78rem var(--st-mono); }
  .chips .hot { border-color: var(--st-warn); color: var(--st-warn); }
  .chips .fast { border-color: var(--st-interactive); color: var(--st-interactive); }
  .toast { padding: .15rem .65rem; border-radius: 999px; background: var(--st-warn); color: var(--st-surface); font-weight: 700; animation: pop .5s cubic-bezier(.3, 1.6, .5, 1); }
  .next { min-height: 44px; min-width: 8rem; }
  .over-layer { position: absolute; inset: 0; z-index: 5; display: grid; place-items: center; padding: .5rem; background: color-mix(in srgb, var(--lp-ink) 78%, transparent); }

  .levelup { position: fixed; left: 50%; top: 40%; z-index: 20; display: grid; justify-items: center; gap: .3rem; padding: 1.25rem 2rem; max-width: calc(100vw - 32px);
    transform: translate(-50%, -50%); text-align: center; pointer-events: none;
    background: var(--st-accent); color: var(--st-surface); border-radius: var(--st-radius-lg); box-shadow: 0 10px 40px rgba(0, 0, 0, .35);
    animation: banner 2.2s cubic-bezier(.3, 1.4, .5, 1) forwards; }
  .levelup strong { font: 800 clamp(1.8rem, 6vw, 2.8rem)/1 var(--lp-display); }
  .levelup span { font-size: .95rem; }

  @media (orientation: portrait) and (max-width: 760px) {
    .hint { display: none; }
    .bar { min-height: 44px; }
    .dg-intro > :global(*) { order: 4; }
    .dg-intro h1 { order: 0; }
    .dg-start { order: 1; }
    .rotate { order: 2; padding: .6rem; gap: .6rem; }
    .rotate svg { width: 2.25rem; height: 2.25rem; }
    .lead { order: 3; }
  }
  @media (max-height: 540px) and (orientation: landscape) {
    .play { gap: .3rem; }
    .question { font-size: 1rem; }
    .hint { display: none; }
    .bar { min-height: 44px; }
    .headline { font-size: 1rem; }
    .points { font-size: 1.1rem; }
    .reason { font-size: .82em; }
  }

  @keyframes pop { 0% { transform: scale(1); } 40% { transform: scale(1.06); } 100% { transform: scale(1); } }
  @keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-8px); } 40% { transform: translateX(7px); } 60% { transform: translateX(-5px); } 80% { transform: translateX(3px); } }
  @keyframes spark { 0% { opacity: 1; transform: rotate(var(--a)) translateX(0) scale(1); } 100% { opacity: 0; transform: rotate(var(--a)) translateX(var(--d)) scale(.4); } }
  @keyframes rise { 0% { opacity: 0; transform: translate(-50%, 10px) scale(.6); } 20% { opacity: 1; transform: translate(-50%, 0) scale(1.15); } 100% { opacity: 0; transform: translate(-50%, -3rem) scale(1); } }
  @keyframes banner { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.5); } 15% { opacity: 1; transform: translate(-50%, -50%) scale(1.05); } 80% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -60%) scale(1); } }
  @keyframes turn { 0%, 30% { transform: rotate(-90deg); opacity: 0; } 55%, 100% { transform: rotate(0); opacity: 1; } }
  @media (prefers-reduced-motion: reduce) {
    .fill, .option { transition: none; }
    .option.won, .option.is-wrong-pick, .points, .toast, .levelup, .rotate .turned { animation: none; }
    .burst, .float-pts { display: none; }
    .levelup { opacity: 1; }
  }
</style>
