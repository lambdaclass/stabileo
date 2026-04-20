<script lang="ts">
  import { t } from '../../lib/i18n';
  import Slideshow from './Slideshow.svelte';

  type Props = { prefersReducedMotion?: boolean };
  let { prefersReducedMotion = false }: Props = $props();

  const proImages = [
    '/screenshots/pro-features.png',
    '/screenshots/pro-verification.png',
  ];
</script>

<section class="roadmap-section reveal" id="roadmap">
  <div class="section-inner">
    <div class="section-head">
      <span class="tag">{t('landing.comingSoon')}</span>
      <h2>{t('landing.roadmapTitle')}</h2>
      <p class="section-sub">{t('landing.roadmapSub')}</p>
    </div>

    <div class="roadmap-grid">
      <article class="rm-card rm-edu">
        <div class="rm-badge rm-badge-edu">{t('landing.modeEduBadge')}</div>
        <h3>{t('landing.modeEduTitle')}</h3>
        <p>{t('landing.modeEduSub')}</p>

        <div class="rm-block">
          <span class="rm-label">{t('landing.eduNowTitle')}</span>
          <ul>
            <li>{t('landing.eduNow1')}</li>
            <li>{t('landing.eduNow2')}</li>
            <li>{t('landing.eduNow3')}</li>
          </ul>
        </div>

        <div class="rm-block rm-muted">
          <span class="rm-label">{t('landing.eduSoonTitle')}</span>
          <ul>
            <li>{t('landing.eduSoon1')}</li>
            <li>{t('landing.eduSoon2')}</li>
            <li>{t('landing.eduSoon3')}</li>
          </ul>
        </div>
      </article>

      <article class="rm-card rm-pro">
        <div class="rm-badge rm-badge-pro">{t('landing.modeProBadge')}</div>
        <h3>{t('landing.modeProTitle')}</h3>
        <p>{t('landing.modeProSub')}</p>

        <Slideshow
          images={proImages}
          alt={t('landing.modeProTitle')}
          interval={5600}
          {prefersReducedMotion}
          ariaPrefix="Pro slide"
          class="rm-media"
        />

        <ul>
          <li>{t('landing.pro1')}</li>
          <li>{t('landing.pro2')}</li>
          <li>{t('landing.pro3')}</li>
          <li>{t('landing.pro4')}</li>
          <li>{t('landing.pro5')}</li>
        </ul>

        <p class="rm-note">{t('landing.pricingPlanned')}</p>
      </article>
    </div>
  </div>
</section>
