<script lang="ts">
  import LandingFooter from '../landing/LandingFooter.svelte';
  import PublicLink from '../landing/PublicLink.svelte';
  import { publicI18n } from '../../lib/i18n/store.svelte';
  import { applyPageMeta, restorePageMeta, breadcrumbs, WEBSITE_ID } from '../../lib/page-meta';
  import { publicUrl } from '../../lib/i18n/public-routes';
  import { GAMES_HUB } from '../../lib/game-routes';
  import type { Locale } from '../../lib/i18n/offered';
  import { GAMES } from './games';
  import { th } from './strings';
  import '../landing/landing.css';

  let { path }: { path: string } = $props();
  const locale = $derived(publicI18n.locale as Locale);
  const copy = (game: (typeof GAMES)[number]) => game.copy[locale] ?? game.copy.en;

  $effect(() => {
    const url = publicUrl(GAMES_HUB, locale), title = th('title'), description = th('description');
    applyPageMeta({ title: `${th('metaTitle')} — Stabileo`, description, locale, path: GAMES_HUB,
      graph: [
        { '@type': 'CollectionPage', '@id': url, url, name: title, description, inLanguage: locale, isPartOf: { '@id': WEBSITE_ID }, mainEntity: { '@id': `${url}#games` } },
        { '@type': 'ItemList', '@id': `${url}#games`, itemListElement: GAMES.map((game, i) => ({ '@type': 'ListItem', position: i + 1, name: copy(game).title, url: publicUrl(`${GAMES_HUB}/${game.id}`, locale) })) },
        breadcrumbs(locale, [['Stabileo', '/'], [title, GAMES_HUB]]),
      ] });
    return () => restorePageMeta();
  });
</script>

<div class="landing games">
  <main class="sec sec--ink">
    <div class="wrap games-wrap">
      <header><h1>{th('title')}</h1><p class="lead">{th('lead')}</p></header>
      <ul class="game-cards">
        {#each GAMES as game (game.id)}
          {@const Thumb = game.thumb}
          {@const to = `${GAMES_HUB}/${game.id}`}
          <li class="game-card" data-testid={`game-card-${game.id}`}>
            <PublicLink {to} class="preview" aria-label={copy(game).title}><Thumb /></PublicLink>
            <div class="card-body">
              <h2><PublicLink {to}>{copy(game).title}</PublicLink></h2>
              <p>{copy(game).description}</p>
              <PublicLink {to} class="btn btn-primary btn-sm">{th('play')}</PublicLink>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  </main>
  <LandingFooter />
</div>

<style>
  .games main.sec { padding: clamp(5rem, 7vw, 6rem) 0 4rem; }
  .games-wrap { max-width: 68rem; --lp-gut: clamp(1rem, 3vw, 2.5rem); }
  h1 { font: 600 clamp(2rem, 4.5vw, 3rem)/1.1 var(--lp-display); margin: .75rem 0; overflow-wrap: anywhere; }
  .lead { font-size: 1.05rem; color: var(--fg); margin-bottom: 0; max-width: 46rem; }
  .games :global(a:not(.btn)), .games :global(a:visited:not(.btn)) { color: inherit; text-underline-offset: 3px; }
  .games :global(.btn) { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; min-width: 44px; }
  .game-cards { display: grid; gap: 1.5rem; list-style: none; padding: 0; margin: 2rem 0; }
  .game-card { display: grid; background: var(--card); border: 1px solid var(--card-hair); border-radius: 6px; overflow: hidden; }
  .game-card :global(.preview) { display: grid; align-items: center; background: var(--lp-ink-2); min-height: 12rem; }
  .card-body { padding: 1.5rem; min-width: 0; }
  .card-body h2 { font: 500 1.5rem/1.2 var(--lp-display); margin: 0 0 1rem; overflow-wrap: anywhere; }
  .card-body :global(h2 a) { display: inline-flex; align-items: center; min-height: 44px; text-decoration: none; }
  .card-body p { margin-bottom: 1.5rem; }
  @media (min-width: 52rem) { .game-card { grid-template-columns: 1.1fr 1fr; } }
</style>
