<script lang="ts">
  import { t } from '../../lib/i18n';
  import { REPO_URL, enterApp } from './landing-utils';

  const proImage = '/screenshots/pro-features.png';
</script>

<section class="pricing-section reveal" id="pricing">
  <div class="section-inner">
    <div class="section-head">
      <span class="tag">{t('landing.pricing')}</span>
      <h2>{t('landing.accessTitle')}</h2>
      <p class="section-sub">{t('landing.accessSub')}</p>
    </div>

    <div class="price-grid">
      <article class="price-card price-free">
        <div class="price-top">
          <div class="rm-badge rm-badge-free">{t('landing.priceFreeTitle')}</div>
          <div class="price-amount">$0</div>
        </div>
        <h3>{t('landing.accessFreeTitle')}</h3>
        <p class="price-lead">{t('landing.accessFreeDesc')}</p>
        <ul class="price-features">
          <li>{t('landing.priceFree1')}</li>
          <li>{t('landing.priceFree2')}</li>
          <li>{t('landing.priceFree3')}</li>
          <li>{t('landing.priceFree4')}</li>
          <li>{t('landing.priceFree5')}</li>
          <li>{t('landing.priceFree6')}</li>
        </ul>
        <div class="price-pills">
          <span>{t('landing.metricBrowser')}</span>
          <span>2D + 3D</span>
          <span>{t('landing.openSource')}</span>
        </div>
        <button class="btn-primary price-cta" onclick={() => enterApp()}>{t('landing.launchEditor')}</button>
      </article>

      <article class="price-card price-pro">
        <div class="price-ribbon">{t('landing.comingSoon')}</div>
        <div class="price-pro-img">
          <img src={proImage} alt={t('landing.priceProTitle')} loading="lazy" />
        </div>
        <div class="rm-badge rm-badge-pro">{t('landing.priceProTitle')}</div>
        <h3>{t('landing.accessPilotTitle')}</h3>
        <p class="price-lead">{t('landing.accessPilotDesc')}</p>
        <ul>
          <li>{t('landing.pricePro1')}</li>
          <li>{t('landing.pricePro2')}</li>
          <li>{t('landing.pricePro3')}</li>
          <li>{t('landing.pricePro4')}</li>
          <li>{t('landing.pricePro5')}</li>
          <li class="ai-row">{t('landing.pricePro6')}</li>
          <li>{t('landing.priceProExtra')}</li>
        </ul>
        <a class="btn-ghost price-cta" href={REPO_URL} target="_blank" rel="noreferrer">{t('landing.viewOnGithub')}</a>
      </article>
    </div>
  </div>
</section>
