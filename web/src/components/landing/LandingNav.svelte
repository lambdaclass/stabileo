<script lang="ts">
  import { t, i18n, setLocale } from '../../lib/i18n';
  import { REPO_URL, enterApp, scrollToId, fetchGithubStars } from './landing-utils';

  let stars = $state<number | null>(null);

  $effect(() => {
    fetchGithubStars().then((n) => {
      stars = n;
    });
  });

  function formatStars(n: number) {
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return n.toString();
  }
</script>

<nav class="nav">
  <div class="nav-inner">
    <button class="nav-brand" onclick={() => scrollToId('top')} aria-label="Back to top">
      <span class="nav-logo">S</span>
      <span class="nav-name">Stabileo</span>
    </button>

    <div class="nav-links">
      <button onclick={() => scrollToId('features')}>{t('landing.features')}</button>
      <button onclick={() => scrollToId('docs')}>{t('landing.docs')}</button>
      <button onclick={() => scrollToId('demo')}>{t('landing.demo')}</button>
      <button onclick={() => scrollToId('roadmap')}>{t('landing.roadmap')}</button>
      <button onclick={() => scrollToId('pricing')}>{t('landing.pricing')}</button>
    </div>

    <div class="nav-actions">
      <a class="nav-gh-stars" href={REPO_URL} target="_blank" rel="noreferrer" aria-label="GitHub repository">
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true">
          <path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279L12 19.771l-7.416 3.642 1.48-8.279L0 9.306l8.332-1.151z"/>
        </svg>
        <span>{stars != null ? formatStars(stars) : 'GitHub'}</span>
      </a>
      <select
        class="nav-lang"
        value={i18n.locale}
        onchange={(e) => setLocale((e.currentTarget as HTMLSelectElement).value)}
        aria-label="Select language"
      >
        <option value="en">English</option>
        <option value="es">Español</option>
        <option value="pt">Português</option>
        <option value="de">Deutsch</option>
        <option value="fr">Français</option>
        <option value="it">Italiano</option>
        <option value="tr">Türkçe</option>
        <option value="hi">हिन्दी</option>
        <option value="zh">中文</option>
        <option value="ja">日本語</option>
        <option value="ko">한국어</option>
        <option value="ru">Русский</option>
        <option value="ar">العربية</option>
        <option value="id">Bahasa Indonesia</option>
      </select>
      <button class="btn-primary sm" onclick={() => enterApp()}>{t('landing.launchEditor')}</button>
    </div>
  </div>
</nav>
