<script lang="ts">
  /**
   * The blog's header.
   *
   * Deliberately not LandingNav: that one navigates by scrolling to sections
   * that only exist on the landing, so reusing it here would give the reader a
   * row of links that do nothing. What carries over is the visual system —
   * every class below is a landing class.
   */
  import { tPublic as t, publicI18n, setPublicLocale, PUBLIC_LOCALES } from '../../lib/i18n/store.svelte';
  import { REPO_URL, enterApp } from '../landing/landing-utils';

  let { onNavigate }: { onNavigate: (path: string) => void } = $props();

  const LOCALE_NAMES: Record<string, string> = { en: 'English', es: 'Español', pt: 'Português' };
</script>

<nav class="nav" aria-label={t('landing.navPrimary')}>
  <div class="wrap nav-inner">
    <button class="nav-brand" onclick={() => onNavigate('/')} title={t('blog.backHome')}>
      <span class="nav-logo" aria-hidden="true">S</span>
      <span class="nav-name">Stabileo</span>
    </button>

    <div class="nav-links blog-nav-links" id="nav-links">
      <button onclick={() => onNavigate('/blog')}>{t('blog.title')}</button>
    </div>

    <div class="nav-actions">
      <a class="nav-gh" href={REPO_URL} target="_blank" rel="noreferrer" aria-label={t('landing.navGithubRepo')}>
        <span>GitHub</span>
      </a>

      <label class="nav-lang-wrap">
        <span class="sr-only">{t('landing.navLanguage')}</span>
        <select
          class="nav-lang"
          value={publicI18n.locale}
          onchange={(e) => setPublicLocale((e.currentTarget as HTMLSelectElement).value as (typeof PUBLIC_LOCALES)[number])}
        >
          {#each PUBLIC_LOCALES as code}
            <option value={code}>{LOCALE_NAMES[code]}</option>
          {/each}
        </select>
      </label>

      <button class="btn btn-primary btn-sm" onclick={() => enterApp()}>{t('blog.openEditor')}</button>
    </div>
  </div>
</nav>
