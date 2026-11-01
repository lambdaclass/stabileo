<script lang="ts">
  import { tPublic as t, tpPublic as tp, publicI18n } from '../../lib/i18n/store.svelte';
  import {
    CHANGELOG,
    CHANGELOG_AREAS,
    AREA_LABELS,
    changeStamp,
    changelogByMonth,
    formatChangeMonth,
    itemsByArea,
    type ChangelogArea,
  } from '../../lib/changelog';
  import { enterApp, scrollToId } from '../landing/landing-utils';
  import PublicLink from '../landing/PublicLink.svelte';
  import Shot from '../landing/Shot.svelte';

  let { eyebrow, title, lead }: { eyebrow: string; title: string; lead: string } = $props();

  const locale = $derived(publicI18n.locale);
  let area = $state<ChangelogArea | null>(null);

  const visible = $derived(area ? CHANGELOG.filter((e) => e.areas.includes(area!)) : CHANGELOG);
  const months = $derived(changelogByMonth(visible));
  const changeCount = $derived(visible.reduce((n, e) => n + (area ? e.areas.filter((a) => a === area).length : e.areas.length), 0));
  const perArea = Object.fromEntries(CHANGELOG_AREAS.map((a) => [a, CHANGELOG.filter((e) => e.areas.includes(a)).length])) as Record<ChangelogArea, number>;

  function count(n: number, many: string, one: string) {
    return n === 1 ? t(one) : tp(many, { n });
  }
</script>

<header class="sec sec--ink cl-head">
  <div class="wrap">
    <p class="eyebrow">
      <span class="eyebrow-rule" aria-hidden="true"></span>
      <span class="eyebrow-label">{eyebrow}</span>
    </p>
    <h1 class="display cl-title">{title}</h1>
    <p class="lead cl-lead">{lead}</p>
    <p class="cl-stats" data-testid="changelog-stats">
      <span>{count(changeCount, 'changelog.changes', 'changelog.changesOne')}</span>
      <span aria-hidden="true">·</span>
      <span>{tp('changelog.since', { month: formatChangeMonth(visible[visible.length - 1].date, locale, { capitalize: false }) })}</span>
      <span aria-hidden="true">·</span>
      <span>{t('changelog.everyFriday')}</span>
    </p>
  </div>
</header>

<section class="sec sec--paper cl-body">
  <div class="wrap cl-layout">
    <aside class="cl-aside">
      <p class="cl-aside-label" id="cl-filter-label">{t('changelog.filterLabel')}</p>
      <div class="cl-filter" role="group" aria-labelledby="cl-filter-label">
        <button class="cl-chip" class:on={area === null} aria-pressed={area === null} onclick={() => (area = null)}>
          {t('changelog.filterAll')}
        </button>
        {#each CHANGELOG_AREAS as a (a)}
          <button
            class="cl-chip"
            class:on={area === a}
            aria-pressed={area === a}
            data-area={a}
            onclick={() => (area = area === a ? null : a)}
          >
            {AREA_LABELS[locale][a]}<span class="cl-chip-n">{perArea[a]}</span>
          </button>
        {/each}
      </div>

      <nav class="cl-months" aria-labelledby="cl-months-label">
        <p class="cl-aside-label" id="cl-months-label">{t('changelog.monthsLabel')}</p>
        <ul>
          {#each months as m (m.key)}
            <li>
              <button onclick={() => scrollToId(`m-${m.key}`)}>
                <span>{formatChangeMonth(`${m.key}-01`, locale)}</span>
                <span class="cl-chip-n">{m.entries.length}</span>
              </button>
            </li>
          {/each}
        </ul>
      </nav>
    </aside>

    <div class="cl-timeline">
      {#each months as m (m.key)}
        <section class="cl-month" id="m-{m.key}" aria-labelledby="m-{m.key}-h">
          <h2 class="cl-month-h" id="m-{m.key}-h">{formatChangeMonth(`${m.key}-01`, locale)}</h2>
          {#each m.entries as entry (entry.date)}
            {@const stamp = changeStamp(entry, locale)}
            {@const groups = itemsByArea(entry, locale).filter((g) => !area || g.area === area)}
            <article class="cl-week" class:latest={entry === CHANGELOG[0]} data-testid="changelog-entry" data-date={entry.date}>
              <time class="cl-date" class:monthly={entry.period === 'month'} datetime={entry.period === 'month' ? entry.date.slice(0, 7) : entry.date}>
                <span class="cl-day">{stamp.big}</span>
                <span class="cl-mon">{stamp.small ?? t('changelog.wholeMonth')}</span>
              </time>
              <div class="cl-card">
                <h3 class="cl-week-title">{entry.i18n[locale].title}</h3>
                {#each groups as g (g.area)}
                  <div class="cl-group">
                    <h4 class="cl-group-h" data-area={g.area}>{AREA_LABELS[locale][g.area]}</h4>
                    <ul class="cl-items">
                      {#each g.items as item, i (i)}<li>{item}</li>{/each}
                    </ul>
                  </div>
                {/each}
                {#if entry.shot}
                  <figure class="cl-shot" class:portrait={entry.shot.h > entry.shot.w}>
                    <Shot base={entry.shot.base} w={entry.shot.w} h={entry.shot.h} alt={entry.shot.alt[locale]} sizes="(max-width: 760px) 92vw, 640px" />
                  </figure>
                {/if}
              </div>
            </article>
          {/each}
        </section>
      {/each}

      <div class="cl-foot">
        <button class="btn btn-primary" onclick={() => enterApp()}>{t('blog.openEditor')}</button>
        <PublicLink to="/blog" class="link-arrow">{t('blog.allPosts')}</PublicLink>
      </div>
    </div>
  </div>
</section>

<style>
  .cl-head {
    padding-bottom: clamp(2.5rem, 5vw, 4rem);
  }

  .cl-title {
    max-width: 18ch;
  }

  .cl-lead {
    max-width: 62ch;
  }

  .cl-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 1.5rem 0 0;
    font-family: var(--lp-mono);
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--fg-2);
  }

  .cl-body {
    padding-top: clamp(2rem, 5vw, 4rem);
  }

  .cl-layout {
    display: grid;
    gap: 2rem;
  }

  @media (min-width: 960px) {
    .cl-layout {
      grid-template-columns: 220px minmax(0, 760px);
      gap: clamp(2.5rem, 5vw, 5rem);
    }

    .cl-aside {
      position: sticky;
      top: calc(var(--lp-nav-h) + 1.5rem);
      align-self: start;
    }
  }

  .cl-aside-label {
    margin: 0 0 0.6rem;
    font-family: var(--lp-mono);
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--fg-2);
  }

  .cl-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .cl-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.75rem;
    border: 1px solid var(--hair);
    border-radius: 999px;
    background: var(--card);
    color: var(--fg);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }

  .cl-chip:hover {
    border-color: var(--fg-2);
  }

  .cl-chip.on {
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
  }

  .cl-chip-n {
    font-family: var(--lp-mono);
    font-size: 0.7rem;
    color: var(--fg-2);
  }

  .cl-chip.on .cl-chip-n {
    color: inherit;
    opacity: 0.7;
  }

  .cl-months {
    display: none;
  }

  @media (min-width: 960px) {
    .cl-months {
      display: block;
      margin-top: 2rem;
    }
  }

  .cl-months ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .cl-months button {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    width: 100%;
    padding: 0.4rem 0;
    border: 0;
    border-bottom: 1px solid var(--hair);
    background: none;
    color: var(--fg);
    font: inherit;
    font-size: 0.9rem;
    text-align: left;
    cursor: pointer;
  }

  .cl-months button:hover {
    color: var(--accent-text);
  }

  .cl-month {
    scroll-margin-top: calc(var(--lp-nav-h) + 1rem);
  }

  .cl-month + .cl-month {
    margin-top: 2.5rem;
  }

  .cl-month-h {
    margin: 0 0 1.25rem;
    font-family: var(--lp-mono);
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--fg-2);
  }

  .cl-week {
    display: grid;
    grid-template-columns: 3.25rem minmax(0, 1fr);
    gap: 0 1.25rem;
    position: relative;
    padding-bottom: 1.75rem;
  }

  .cl-week::before {
    content: '';
    position: absolute;
    left: calc(3.25rem + 0.625rem - 1px);
    top: 0.6rem;
    bottom: 0;
    width: 2px;
    background: var(--hair);
  }

  .cl-week::after {
    content: '';
    position: absolute;
    left: calc(3.25rem + 0.625rem - 5px);
    top: 0.45rem;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--bg);
    border: 2px solid var(--fg-2);
  }

  .cl-week.latest::after {
    background: var(--lp-accent);
    border-color: var(--lp-accent);
  }

  .cl-date {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    line-height: 1;
  }

  .cl-day {
    font-family: var(--lp-display);
    font-size: 1.6rem;
    font-weight: 600;
  }

  .cl-date.monthly .cl-day {
    font-size: 1.15rem;
    text-transform: capitalize;
  }

  .cl-mon {
    margin-top: 0.25rem;
    font-family: var(--lp-mono);
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--fg-2);
  }

  .cl-card {
    margin-left: 1.25rem;
    padding: 1.25rem 1.4rem 1.4rem;
    background: var(--card);
    border: 1px solid var(--card-hair);
    border-radius: calc(var(--lp-radius) * 2);
  }

  .cl-week-title {
    margin: 0;
    font-family: var(--lp-display);
    font-size: 1.2rem;
    font-weight: 600;
    line-height: 1.3;
  }

  .cl-group {
    margin-top: 1.1rem;
  }

  .cl-group-h {
    margin: 0 0 0.35rem;
    font-family: var(--lp-mono);
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent-text);
  }

  .cl-items {
    margin: 0;
    padding-left: 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    font-size: 0.95rem;
    line-height: 1.55;
  }

  .cl-items li::marker {
    color: var(--fg-2);
  }

  .cl-shot {
    margin: 1.25rem 0 0;
  }

  .cl-shot.portrait {
    max-width: 260px;
  }

  .cl-shot :global(img) {
    display: block;
    width: 100%;
    height: auto;
    border: 1px solid var(--hair);
    border-radius: var(--lp-radius);
  }

  .cl-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1.5rem;
    margin: 1rem 0 0 5.75rem;
  }

  @media (max-width: 600px) {
    .cl-week {
      grid-template-columns: 2.5rem minmax(0, 1fr);
      gap: 0 0.75rem;
    }

    .cl-week::before {
      left: calc(2.5rem + 0.375rem - 1px);
    }

    .cl-week::after {
      left: calc(2.5rem + 0.375rem - 5px);
    }

    .cl-day {
      font-size: 1.3rem;
    }

    .cl-card {
      margin-left: 0.75rem;
      padding: 1rem 1rem 1.1rem;
    }

    .cl-foot {
      margin-left: 0;
    }
  }
</style>
