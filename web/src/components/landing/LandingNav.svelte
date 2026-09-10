<script lang="ts">
  import { tPublic as t, publicI18n, PUBLIC_LOCALES } from '../../lib/i18n/store.svelte';
  import { REPO_URL, enterApp, scrollToId, fetchGithubStars, switchPublicLocale } from './landing-utils';

  let stars = $state<number | null>(null);
  let open = $state(false);

  const LOCALE_NAMES: Record<string, string> = { en: 'English', es: 'Español', pt: 'Português' };

  const links = [
    { id: 'basic', key: 'landing.navBasic' },
    { id: 'codes', key: 'landing.navCodes' },
    { id: 'education', key: 'landing.navEducation' },
    { id: 'pro', key: 'landing.navPro' },
    { id: 'status', key: 'landing.navStatus' },
    // Scrolls to the section at the foot of the deck rather than leaving for
    // /blog: the nav's job here is to say the blog exists, and the section
    // below shows what is in it before asking anyone to leave the page.
    { id: 'blog', key: 'landing.navBlog' },
  ];

  $effect(() => {
    fetchGithubStars().then((n) => { stars = n; });
  });

  function fmtStars(n: number) {
    return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);
  }

  function go(id: string) {
    open = false;
    scrollToId(id);
  }
</script>

<nav class="nav" aria-label={t('landing.navPrimary')}>
  <div class="nav-inner">
    <button class="nav-brand" onclick={() => go('top')} aria-label={t('landing.navBackToTop')}>
      <span class="nav-logo" aria-hidden="true">S</span>
      <span class="nav-name">Stabileo</span>
    </button>

    <div class="nav-links" id="nav-links" class:open>
      {#each links as l}
        <button onclick={() => go(l.id)}>{t(l.key)}</button>
      {/each}
    </div>

    <div class="nav-actions">
      <a class="nav-gh" href={REPO_URL} target="_blank" rel="noreferrer" aria-label={t('landing.navGithubRepo')}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" aria-hidden="true" focusable="false">
          <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7 0-.7 0-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 4.7 18 5 18 5c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3z"/>
        </svg>
        <span>{stars != null ? fmtStars(stars) : 'GitHub'}</span>
      </a>

      <label class="nav-lang-wrap">
        <span class="sr-only">{t('landing.navLanguage')}</span>
        <select
          class="nav-lang"
          value={publicI18n.locale}
          onchange={(e) => switchPublicLocale((e.currentTarget as HTMLSelectElement).value as (typeof PUBLIC_LOCALES)[number])}
        >
          {#each PUBLIC_LOCALES as code}
            <option value={code}>{LOCALE_NAMES[code]}</option>
          {/each}
        </select>
      </label>

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
