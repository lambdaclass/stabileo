<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import { REPO_URL, DOCS_HUB_URL, enterApp, SOCIAL_LINKS } from './landing-utils';
  import { SOCIAL_ICONS as ICONS } from '../../lib/contact/channels';
  import PublicLink from './PublicLink.svelte';
  import BrandMark from './BrandMark.svelte';

  const year = new Date().getFullYear();
</script>

<footer class="sec sec--ink lp-footer">
  <div class="wrap footer-grid">
    <div class="footer-brand">
      <span class="nav-logo"><BrandMark /></span>
      <div>
        <p class="footer-name">Stabileo</p>
        <p class="footer-tagline">{t('landing.footTagline')}</p>
      </div>
    </div>

    <div class="footer-right">
      <nav class="footer-links" aria-label={t('landing.footNav')}>
        <div class="footer-group">
          <p class="footer-head" id="foot-product">{t('landing.navProduct')}</p>
          <ul aria-labelledby="foot-product">
            <li><button onclick={() => enterApp()}>{t('landing.footLaunch')}</button></li>
            <li><PublicLink to="/examples">{t('landing.navExamples')}</PublicLink></li>
            <li><PublicLink to="/tools">{t('landing.navTools')}</PublicLink></li>
            <li><PublicLink to="/#pricing">{t('landing.navPricing')}</PublicLink></li>
          </ul>
        </div>
        <div class="footer-group">
          <p class="footer-head" id="foot-verification">{t('landing.footVerification')}</p>
          <ul aria-labelledby="foot-verification">
            <li><PublicLink to="/reliability">{t('landing.footReliability')}</PublicLink></li>
            <li><PublicLink to="/research">{t('landing.navResearch')}</PublicLink></li>
            <li><PublicLink to="/paper">{t('landing.navPaper')}</PublicLink></li>
            <li><PublicLink to="/cirsoc">CIRSOC</PublicLink></li>
            <li><PublicLink to="/sap2000-alternative">{t('landing.footSap2000')}</PublicLink></li>
            <li><PublicLink to="/etabs-alternative">{t('landing.footEtabs')}</PublicLink></li>
          </ul>
        </div>
        <div class="footer-group">
          <p class="footer-head" id="foot-project">{t('landing.footProject')}</p>
          <ul aria-labelledby="foot-project">
            <li><PublicLink to="/blog">{t('landing.footBlog')}</PublicLink></li>
            <li><PublicLink to="/changelog">{t('landing.footChangelog')}</PublicLink></li>
            <li><a href={DOCS_HUB_URL} target="_blank" rel="noreferrer">{t('landing.footDocs')}</a></li>
            <li><a href={REPO_URL} target="_blank" rel="noreferrer">{t('landing.footRepo')}</a></li>
          </ul>
        </div>
      </nav>

      <ul class="footer-social" aria-label={t('landing.footSocial')}>
        {#each SOCIAL_LINKS as s}
          <li>
            <a href={s.href} target="_blank" rel="noreferrer" data-social={s.id}>
              {#if ICONS[s.id]}
                <span class="social-mark" aria-hidden="true">{@html ICONS[s.id]}</span>
              {/if}
              <span>{s.label}</span>
            </a>
          </li>
        {/each}
      </ul>
    </div>
  </div>

  <div class="wrap footer-legal">
    <p>&copy; {year} Stabileo. {t('landing.footRights')}</p>
  </div>
</footer>

<div class="mobile-sticky">
  <button class="btn btn-primary" onclick={() => enterApp()}>{t('landing.navOpenEditor')}</button>
</div>
