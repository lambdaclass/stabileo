<script lang="ts">
  import { t } from '../../lib/i18n';
  import { REPO_URL, enterApp } from './landing-utils';
</script>

<section class="cta-section reveal">
  <div class="section-inner">
    <div class="cta-block">
      <div class="cta-copy">
        <span class="tag">{t('landing.tryItNow')}</span>
        <h2>{t('landing.ctaTitle')}</h2>
        <p>{t('landing.ctaSub')}</p>
      </div>
      <div class="cta-actions">
        <button class="btn-primary lg" onclick={() => enterApp()}>{t('landing.launchEditor')}</button>
        <a class="btn-link" href={REPO_URL} target="_blank" rel="noreferrer">{t('landing.viewOnGithub')}</a>
      </div>
    </div>
  </div>
</section>
