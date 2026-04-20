<script lang="ts">
  import { t } from '../../lib/i18n';
  import { enterApp } from './landing-utils';
  import Slideshow from './Slideshow.svelte';

  type Props = { prefersReducedMotion?: boolean };
  let { prefersReducedMotion = false }: Props = $props();

  const imgs2d = [
    '/screenshots/2d-loads.png',
    '/screenshots/2d-moments.png',
    '/screenshots/2d-section-analysis.png',
  ];

  const imgs3d = [
    '/screenshots/3d-loads.png',
    '/screenshots/3d-section-analysis.png',
    '/screenshots/3d-industrial.png',
  ];
</script>

<section class="features-section" id="features">
  <div class="section-inner">
    <div class="section-head reveal">
      <span class="tag">{t('landing.modeBasicBadge')}</span>
      <h2>{t('landing.todayTitle')}</h2>
      <p class="section-sub">{t('landing.todaySub')}</p>
    </div>

    <div class="feature-cards">
      <!-- 2D card -->
      <article class="fcard fcard-light reveal">
        <div class="fcard-body">
          <span class="tag tag-sm">{t('landing.tagAnalysis2D')}</span>
          <h3>{t('landing.basic2dTitle')}</h3>
          <p>{t('landing.basic2dDesc')}</p>
          <ul>
            <li>{t('landing.basic2d1')}</li>
            <li>{t('landing.basic2d2')}</li>
            <li>{t('landing.basic2d3')}</li>
            <li>{t('landing.basic2d4')}</li>
            <li>{t('landing.basic2d5')}</li>
          </ul>
          <button class="btn-primary" onclick={() => enterApp()}>{t('landing.launchEditor')}</button>
        </div>
        <div class="fcard-media">
          <Slideshow
            images={imgs2d}
            alt={t('landing.basic2dTitle')}
            interval={5200}
            {prefersReducedMotion}
            ariaPrefix="2D slide"
            class="fcard-screen"
          />
          <div class="fcard-float">
            <img src="/screenshots/2d-section-analysis.png" alt={t('landing.basic2dTitle')} loading="lazy" />
          </div>
        </div>
      </article>

      <!-- 3D card -->
      <article class="fcard fcard-dark reveal">
        <div class="fcard-media">
          <Slideshow
            images={imgs3d}
            alt={t('landing.basic3dTitle')}
            interval={5200}
            {prefersReducedMotion}
            ariaPrefix="3D slide"
            class="fcard-screen"
          />
          <div class="fcard-float fcard-float-left">
            <img src="/screenshots/3d-section-analysis.png" alt={t('landing.basic3dTitle')} loading="lazy" />
          </div>
        </div>
        <div class="fcard-body">
          <span class="tag tag-sm">{t('landing.tagAnalysis3D')}</span>
          <h3>{t('landing.basic3dTitle')}</h3>
          <p>{t('landing.basic3dDesc')}</p>
          <ul>
            <li>{t('landing.basic3d1')}</li>
            <li>{t('landing.basic3d2')}</li>
            <li>{t('landing.basic3d3')}</li>
            <li>{t('landing.basic3d4')}</li>
          </ul>
          <a class="btn-ghost" href="/demo">{t('landing.tryTour')}</a>
        </div>
      </article>
    </div>
  </div>
</section>
