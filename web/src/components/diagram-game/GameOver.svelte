<script lang="ts">
  import { Tween, prefersReducedMotion } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import type { GameState } from './scoring';
  import { tg } from './strings';

  let { game, newBest, onagain, onquit }: { game: GameState; newBest: boolean; onagain: () => void; onquit: () => void } = $props();

  const total = new Tween(0, { duration: 1100, easing: cubicOut });
  $effect(() => { void total.set(game.score, prefersReducedMotion.current ? { duration: 0 } : undefined); });
  const accuracy = $derived(game.answered ? Math.round((100 * game.correct) / game.answered) : 0);
</script>

<div class="over" class:record={newBest}>
  <h2>{tg('over')}</h2>
  <p class="total" aria-label={tg('final', { n: game.score })}>{Math.round(total.current)}</p>
  {#if newBest}<p class="new-best" data-testid="dg-new-best">{tg('newBest')}</p>{/if}
  <dl class="stats">
    <div><dt>{tg('stats.rounds')}</dt><dd data-testid="dg-stat-rounds">{game.answered}</dd></div>
    <div><dt>{tg('stats.accuracy')}</dt><dd>{accuracy}%</dd></div>
    <div><dt>{tg('stats.bestStreak')}</dt><dd>{game.bestStreak}</dd></div>
    <div><dt>{tg('stats.level')}</dt><dd>{game.level + 1}</dd></div>
  </dl>
  <div class="actions">
    <button type="button" class="btn btn-primary again" onclick={onagain} data-testid="dg-again">{tg('again')}</button>
    <button type="button" class="btn btn-ghost again" onclick={onquit}>{tg('quit')}</button>
  </div>
</div>

<style>
  .over { width: min(100%, 40rem); max-height: 100%; box-sizing: border-box; display: grid; justify-items: center; gap: .5rem; padding: 1rem; text-align: center;
    background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius-lg); }
  .over.record { border-color: var(--st-warn); box-shadow: 0 0 0 3px color-mix(in srgb, var(--st-warn) 25%, transparent); }
  h2 { margin: 0; }
  .total { margin: 0; font: 700 clamp(2rem, min(9vw, 12vh), 4rem)/1 var(--st-mono); font-variant-numeric: tabular-nums; }
  .new-best { margin: 0; padding: .3rem .8rem; border-radius: 999px; background: var(--st-warn); color: var(--st-surface); font-weight: 700;
    animation: glow 1.2s ease-in-out infinite alternate; }
  .stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem 1.5rem; margin: .25rem 0; }
  @media (min-width: 560px) { .stats { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
  .stats div { display: grid; gap: .15rem; }
  dt { font: .7rem var(--st-mono); text-transform: uppercase; letter-spacing: .06em; color: var(--st-text-3); }
  dd { margin: 0; font: 700 1.25rem var(--st-mono); }
  .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; }
  .again { min-height: 44px; min-width: 9rem; }
  @media (max-height: 540px) { .stats { grid-template-columns: repeat(4, minmax(0, 1fr)); } h2 { font-size: 1rem; } }
  @keyframes glow { from { transform: scale(1); } to { transform: scale(1.06); } }
  @media (prefers-reduced-motion: reduce) { .new-best { animation: none; } }
</style>
