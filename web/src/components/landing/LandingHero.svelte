<script lang="ts">
  import { t } from '../../lib/i18n';
  import { REPO_URL, DOCS_HUB_URL, enterApp, scrollToId } from './landing-utils';
  import Slideshow from './Slideshow.svelte';

  type Props = { prefersReducedMotion?: boolean };
  let { prefersReducedMotion = false }: Props = $props();

  const heroImages = [
    '/screenshots/3d-industrial.png',
    '/screenshots/2d-moments.png',
    '/screenshots/pro-verification.png',
  ];
</script>

<section class="hero" id="top">
  <div class="hero-glow"></div>
  <div class="section-inner hero-layout">
    <div class="hero-copy">
      <div class="hero-badge">
        <span class="hero-badge-pulse" aria-hidden="true"></span>
        {t('landing.heroBadge')}
      </div>
      <h1>
        <span class="hero-line1">{t('landing.heroTitle1')}</span>
        <em>{t('landing.heroTitle2')}</em>
      </h1>
      <p class="hero-sub">{t('landing.heroSub')}</p>

      <div class="hero-ctas">
        <button class="btn-primary lg" onclick={() => enterApp()}>{t('landing.launchEditor')}</button>
        <button class="btn-ghost" onclick={() => scrollToId('demo')}>{t('landing.seeLiveDemo')}</button>
      </div>

      <div class="hero-meta">
        <span class="meta-pill">{t('landing.openSource')}</span>
        <span class="meta-pill">2D + 3D</span>
        <span class="meta-pill">{t('landing.metricBrowser')}</span>
      </div>
    </div>

    <div class="hero-visual reveal">
      <div class="hero-browser-wrap">
        <div class="hero-browser">
          <div class="browser-bar">
            <div class="browser-dots"><span></span><span></span><span></span></div>
            <div class="browser-url">stabileo.com</div>
          </div>
          <Slideshow
            images={heroImages}
            alt="Stabileo workspace"
            interval={4200}
            {prefersReducedMotion}
            ariaPrefix="Hero slide"
            class="browser-viewport"
          />
        </div>

        <div class="hero-callout hero-callout-a">
          <span class="hero-callout-label">{t('landing.tagAnalysis3D')}</span>
          <strong>My · Mz · Vy · Vz</strong>
        </div>

        <div class="hero-callout hero-callout-b">
          <span class="hero-callout-label">{t('landing.heroCalloutStructuredLabel')}</span>
          <strong>{t('landing.heroCalloutStructuredValue')}</strong>
        </div>
      </div>
    </div>
  </div>

  <div class="section-inner hero-signals">
    <a class="signal" href={REPO_URL} target="_blank" rel="noreferrer">
      <div class="signal-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
        </svg>
      </div>
      <div class="signal-text">
        <strong>{t('landing.openSource')}</strong>
        <span>{t('landing.openSourceDesc')}</span>
      </div>
    </a>
    <button class="signal" onclick={() => scrollToId('demo')}>
      <div class="signal-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      </div>
      <div class="signal-text">
        <strong>{t('landing.interactiveDemo')}</strong>
        <span>{t('landing.interactiveDemoDesc')}</span>
      </div>
    </button>
    <a class="signal" href={DOCS_HUB_URL} target="_blank" rel="noreferrer">
      <div class="signal-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
      </div>
      <div class="signal-text">
        <strong>{t('landing.signalDocsTitle')}</strong>
        <span>{t('landing.signalDocsDesc')}</span>
      </div>
    </a>
    <div class="signal">
      <div class="signal-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      </div>
      <div class="signal-text">
        <strong>14 {t('landing.metricLanguages')}</strong>
        <span>{t('landing.capGrid8Desc')}</span>
      </div>
    </div>
  </div>
</section>
