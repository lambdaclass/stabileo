<script lang="ts">
  import { tPublic as t, publicI18n, PUBLIC_LOCALES } from '../../lib/i18n/store.svelte';
  import LocaleSelect from '../LocaleSelect.svelte';
  import { REPO_URL, enterApp, scrollToId, fetchGithubStars, switchPublicLocale, goPublic } from './landing-utils';
  import { publicHref } from '../../lib/i18n/public-routes';

  /**
   * The site header. On the landing the section items scroll; on any other public page (the
   * research pages) they go to the landing's section, and `current` marks the page's own item.
   */
  let { page = 'landing', current = null }: { page?: 'landing' | 'other'; current?: 'blog' | 'research' | null } = $props();
  import BrandMark from './BrandMark.svelte';
  import PublicLink from './PublicLink.svelte';

  let stars = $state<number | null>(null);
  let open = $state(false);

  const LOCALE_NAMES: Record<string, string> = { en: 'English', es: 'Español', pt: 'Português' };

  /*
   * Five stops, one per section of the deck. `codes` and `status` went with
   * the sections they pointed at; `ai` is new. A nav item that scrolls to
   * nothing is worse than one that is missing.
   *
   * The blog is a page, not a section: its item is a real link to /blog
   * below. It used to scroll to the blog teaser at the foot of the landing,
   * which is not what anyone clicking "Blog" expects.
   */
  const links = [
    { id: 'basic', key: 'landing.navBasic' },
    { id: 'pro', key: 'landing.navPro' },
    { id: 'ai', key: 'landing.navAi' },
    { id: 'education', key: 'landing.navEducation' },
    { id: 'pricing', key: 'landing.navPricing' },
  ];

  $effect(() => {
    fetchGithubStars().then((n) => { stars = n; });
  });

  function fmtStars(n: number) {
    return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);
  }

  function go(id: string) {
    open = false;
    if (page === 'landing') {
      scrollToId(id);
      return;
    }
    goPublic('/');
    let tries = 0;
    const wait = () => {
      if (document.getElementById(id) || tries++ > 40) scrollToId(id);
      else setTimeout(wait, 50);
    };
    setTimeout(wait, 50);
  }
</script>

<nav class="nav" aria-label={t('landing.navPrimary')}>
  <div class="nav-inner">
    {#if page === 'landing'}
      <button class="nav-brand" onclick={() => go('top')} aria-label={t('landing.navBackToTop')}>
        <span class="nav-logo"><BrandMark /></span>
        <span class="nav-name">Stabileo</span>
      </button>
    {:else}
      <PublicLink to="/" class="nav-brand">
        <span class="nav-logo"><BrandMark /></span>
        <span class="nav-name">Stabileo</span>
      </PublicLink>
    {/if}

    <div class="nav-links" id="nav-links" class:open>
      {#each links as l}
        {#if page === 'landing'}
          <button onclick={() => go(l.id)}>{t(l.key)}</button>
        {:else}
          <a class="nav-link" href="{publicHref('/', publicI18n.locale)}#{l.id}" onclick={(e) => { if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); go(l.id); } }}>{t(l.key)}</a>
        {/if}
      {/each}
      <PublicLink to="/blog" class="nav-link{current === 'blog' ? ' current' : ''}" aria-current={current === 'blog' ? 'page' : undefined}>{t('landing.navBlog')}</PublicLink>
      <PublicLink to="/research" class="nav-link{current === 'research' ? ' current' : ''}" aria-current={current === 'research' ? 'page' : undefined}>{t('landing.navResearch')}</PublicLink>
    </div>

    <div class="nav-actions">
      <a class="nav-gh" href={REPO_URL} target="_blank" rel="noreferrer" aria-label={t('landing.navGithubRepo')}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" aria-hidden="true" focusable="false">
          <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7 0-.7 0-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 4.7 18 5 18 5c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3z"/>
        </svg>
        <span>{stars != null ? fmtStars(stars) : 'GitHub'}</span>
      </a>

      <!--
        A drawn list rather than a native `<select>`: the platform decides
        where a native popup lands, and on macOS it floats beside the control
        instead of belonging to it. See `LocaleSelect.svelte`.
      -->
      <LocaleSelect
        value={publicI18n.locale}
        options={PUBLIC_LOCALES}
        label={(c) => LOCALE_NAMES[c as (typeof PUBLIC_LOCALES)[number]]}
        onChange={(c) => switchPublicLocale(c as (typeof PUBLIC_LOCALES)[number])}
        ariaLabel={t('landing.navLanguage')}
        testid="nav-lang"
      />

      <button class="btn btn-primary btn-sm" onclick={() => enterApp()}>{t('landing.navOpenEditor')}</button>

      <button
        class="nav-toggle"
        aria-expanded={open}
        aria-controls="nav-links"
        aria-label={t('landing.navMenuOpen')}
        onclick={() => (open = !open)}
      >
        <span aria-hidden="true"></span>
        <span aria-hidden="true"></span>
      </button>
    </div>
  </div>
</nav>
