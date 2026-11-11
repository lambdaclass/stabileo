<script lang="ts">
  import { Tween, prefersReducedMotion } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { LEVEL_UP, LIVES, MAX_LEVEL, multiplier, type GameState } from './scoring';
  import { tg, type Key } from './strings';

  let { game, best, sound, ontoggle }: { game: GameState; best: number; sound: boolean; ontoggle: () => void } = $props();

  const shown = new Tween(0, { duration: 650, easing: cubicOut });
  $effect(() => {
    const target = game.score;
    void shown.set(target, target < shown.target || prefersReducedMotion.current ? { duration: 0 } : undefined);
  });
  const mult = $derived(multiplier(game.streak));
  const top = $derived(game.level >= MAX_LEVEL - 1);
</script>

<section class="hud" aria-label={tg('score')}>
  <div class="cell level">
    <span class="k">{tg('level')}</span>
    <span class="badge" data-testid="dg-level">{game.level + 1}</span>
    <span class="level-name">{tg(`level.${game.level + 1}` as Key)}</span>
    {#if !top}
      <span class="pips" role="img" aria-label={tg('progress', { n: game.correctInLevel, total: LEVEL_UP })}>
        {#each Array(LEVEL_UP) as _, i (i)}<span class="pip" class:on={i < game.correctInLevel}></span>{/each}
      </span>
    {/if}
  </div>

  <div class="cell score">
    <span class="k">{tg('score')}</span>
    <span class="big" data-testid="dg-score" data-score={game.score}>{Math.round(shown.current)}</span>
  </div>

  <div class="cell streak" class:hot={game.streak >= 2}>
    <span class="k">{tg('streak')}</span>
    {#key game.streak}
      <span class="mult" class:bump={game.streak > 0}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 1.5.7 2.3 1.5 2.5C7 5.5 7.2 3 8 1z" /></svg>
        ×{mult.toFixed(2)}
      </span>
    {/key}
  </div>

  <div class="cell lives" aria-label={tg('livesLeft', { n: game.lives })} data-testid="dg-lives" data-lives={game.lives}>
    <span class="k">{tg('lives')}</span>
    <span class="hearts" aria-hidden="true">
      {#each Array(LIVES) as _, i (i)}
        <svg class="heart" class:lost={i >= game.lives} viewBox="0 0 16 16"><path d="M8 14s-6-3.6-6-8a3.2 3.2 0 0 1 6-1.6A3.2 3.2 0 0 1 14 6c0 4.4-6 8-6 8z" /></svg>
      {/each}
    </span>
  </div>

  <div class="cell best">
    <span class="k">{tg('best')}</span>
    <span class="v" data-testid="dg-best">{Math.max(best, game.score)}</span>
  </div>

  <button type="button" class="sound" onclick={ontoggle} aria-pressed={sound} aria-label={sound ? tg('sound.on') : tg('sound.off')} title={sound ? tg('sound.on') : tg('sound.off')} data-testid="dg-sound">
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 6h3l4-3v10l-4-3H2z" />
      {#if sound}<path class="wave" d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.5a6 6 0 0 1 0 9" />{:else}<path class="wave" d="M11 6l4 4M15 6l-4 4" />{/if}
    </svg>
  </button>
</section>

<style>
  .hud { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem 1.5rem; padding: .75rem 1rem; margin-bottom: .75rem;
    background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius-lg); }
  .cell { display: flex; align-items: center; gap: .45rem; min-width: 0; }
  .k { font: .7rem var(--st-mono); text-transform: uppercase; letter-spacing: .06em; color: var(--st-text-3); }
  .v { font: 1.05rem var(--st-mono); font-variant-numeric: tabular-nums; }
  .level { flex-wrap: wrap; }
  .badge { display: inline-grid; place-items: center; min-width: 1.9rem; height: 1.9rem; padding: 0 .4rem; border-radius: 999px;
    background: var(--st-accent); color: var(--st-surface); font: 700 1rem var(--st-mono); }
  .level-name { font: .85rem var(--st-sans); color: var(--st-text-2); }
  .pips { display: inline-flex; gap: .25rem; }
  .pip { width: .55rem; height: .55rem; border-radius: 2px; background: var(--st-hair-strong); transition: background .2s, transform .2s; }
  .pip.on { background: var(--st-ok); transform: scale(1.15); }
  .score { margin-inline: auto; }
  .big { font: 700 clamp(1.5rem, 4vw, 2rem)/1 var(--st-mono); font-variant-numeric: tabular-nums; color: var(--st-text); min-width: 4ch; text-align: right; }
  .mult { display: inline-flex; align-items: center; gap: .2rem; font: 700 1.05rem var(--st-mono); color: var(--st-text-2); }
  .mult svg { width: 1rem; height: 1rem; fill: var(--st-text-3); }
  .hot .mult { color: var(--st-warn); }
  .hot .mult svg { fill: var(--st-warn); }
  .bump { animation: bump .35s cubic-bezier(.3, 1.6, .5, 1); }
  .hearts { display: inline-flex; gap: .2rem; }
  .heart { width: 1.15rem; height: 1.15rem; fill: var(--st-danger); transition: transform .25s, opacity .25s; }
  .heart.lost { fill: none; stroke: var(--st-hair-strong); stroke-width: 1.2; animation: lose .45s ease-out; }
  .sound { display: inline-grid; place-items: center; width: 44px; height: 44px; border-radius: 999px; border: 1px solid var(--st-hair-strong);
    background: var(--st-surface-2); color: var(--st-text-2); cursor: pointer; }
  .sound svg { width: 1.1rem; height: 1.1rem; fill: currentColor; }
  .sound .wave { fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; }
  .sound:focus-visible { outline: 2px solid var(--st-focus); outline-offset: 2px; }
  @keyframes bump { 0% { transform: scale(1); } 45% { transform: scale(1.45); } 100% { transform: scale(1); } }
  @keyframes lose { 0% { transform: scale(1.3) rotate(0); } 50% { transform: scale(.7) rotate(-15deg); } 100% { transform: scale(1) rotate(0); } }
  @media (max-width: 560px) { .score { margin-inline: 0; } .level-name { display: none; } }
  @media (prefers-reduced-motion: reduce) { .bump, .heart.lost { animation: none; } .pip, .heart { transition: none; } }
</style>
