<script lang="ts">
  import { t } from '../../lib/i18n';
  import { enterApp } from './landing-utils';

  type Example = { key: string; path: string };

  const examples: Example[] = [
    { key: 'landing.demoExCantilever', path: '/app/basic?embed&example=cantilever' },
    { key: 'landing.demoExPortal', path: '/app/basic?embed&example=portal-frame' },
    { key: 'landing.demoExTruss', path: '/app/basic?embed&example=truss' },
    { key: 'landing.demoEx3D', path: '/app/basic?embed&example=3d-portal-frame' },
  ];

  let active = $state(0);
  let iframeLoaded = $state(false);
  let iframeEl: HTMLIFrameElement | undefined;

  function pickExample(i: number) {
    if (i === active) return;
    active = i;
    iframeLoaded = false;
  }
</script>

<section class="demo-section reveal" id="demo">
  <div class="section-inner">
    <div class="demo-panel">
      <div class="demo-copy">
        <span class="tag">{t('landing.interactiveDemo')}</span>
        <h2>{t('landing.demoCardTitle')}</h2>
        <p>{t('landing.demoCardDesc')}</p>
        <ul>
          <li>{t('landing.demoPoint1')}</li>
          <li>{t('landing.demoPoint2')}</li>
          <li>{t('landing.demoPoint3')}</li>
        </ul>
        <div class="demo-actions">
          <button class="btn-primary" onclick={() => enterApp()}>{t('landing.launchEditor')}</button>
          <a class="btn-link" href="/demo">{t('landing.tryTour')}</a>
        </div>
      </div>
      <div class="demo-viewport">
        <div class="demo-browser">
          <div class="demo-skeleton" class:ready={iframeLoaded}>{t('landing.demoLoading')}</div>
          <iframe
            bind:this={iframeEl}
            src={examples[active].path}
            title="Stabileo live demo"
            class="demo-iframe"
            loading="lazy"
            onload={() => (iframeLoaded = true)}
          ></iframe>
        </div>
        <div class="demo-examples" role="tablist" aria-label={t('landing.demoExamplesLabel')}>
          <span class="demo-examples-label">{t('landing.demoExamplesLabel')}</span>
          {#each examples as ex, i}
            <button
              class="demo-chip"
              class:active={i === active}
              role="tab"
              aria-selected={i === active}
              onclick={() => pickExample(i)}
            >
              {t(ex.key)}
            </button>
          {/each}
        </div>
      </div>
    </div>
  </div>
</section>
