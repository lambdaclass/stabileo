<script lang="ts">
  import { t } from '../../lib/i18n';
  import { REPO_URL, DOCS_HUB_URL, enterApp } from './landing-utils';
</script>

<footer class="lp-footer">
  <div class="section-inner footer-inner">
    <div class="footer-row">
      <div class="footer-brand">
        <span class="nav-logo">S</span>
        <span>Stabileo</span>
      </div>
      <div class="footer-links">
        <a href={DOCS_HUB_URL} target="_blank" rel="noreferrer">{t('landing.docs')}</a>
        <a href={REPO_URL} target="_blank" rel="noreferrer">{t('landing.viewOnGithub')}</a>
        <a href="/demo">{t('landing.tryTour')}</a>
        <button onclick={() => enterApp()}>{t('landing.launchEditor')}</button>
      </div>
    </div>
    <p class="footer-desc">{t('landing.openSourceDesc')}</p>
    <p class="footer-copy">&copy; {new Date().getFullYear()} Stabileo. {t('landing.footerRights')}</p>
  </div>
</footer>

<div class="mobile-sticky">
  <button class="btn-primary" onclick={() => enterApp()}>{t('landing.launchEditor')}</button>
</div>
