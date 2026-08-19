<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import { REPO_URL, DOCS_HUB_URL, enterApp, goPublic } from './landing-utils';

  const year = new Date().getFullYear();
</script>

<footer class="sec sec--ink lp-footer">
  <div class="wrap footer-grid">
    <div class="footer-brand">
      <span class="nav-logo" aria-hidden="true">S</span>
      <div>
        <p class="footer-name">Stabileo</p>
        <p class="footer-tagline">{t('landing.footTagline')}</p>
      </div>
    </div>

    <nav class="footer-links" aria-label={t('landing.footNav')}>
      <a href={DOCS_HUB_URL} target="_blank" rel="noreferrer">{t('landing.footDocs')}</a>
      <a href={REPO_URL} target="_blank" rel="noreferrer">{t('landing.footRepo')}</a>
      <button onclick={() => goPublic('/blog')}>{t('landing.footBlog')}</button>
      <a href="/demo">{t('landing.footTour')}</a>
      <button onclick={() => enterApp()}>{t('landing.footLaunch')}</button>
    </nav>
  </div>

  <div class="wrap footer-legal">
    <p>&copy; {year} Stabileo. {t('landing.footRights')}</p>
  </div>
</footer>

<div class="mobile-sticky">
  <button class="btn btn-primary" onclick={() => enterApp()}>{t('landing.navOpenEditor')}</button>
</div>
