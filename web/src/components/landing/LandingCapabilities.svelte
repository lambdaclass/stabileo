<script lang="ts">
  import { t } from '../../lib/i18n';

  const depthTiles = [
    {
      code: '02',
      image: '/screenshots/2d-loads.png',
      tone: 'amber',
      titleKey: 'landing.capGrid2Title',
      descKey: 'landing.capGrid2Desc',
    },
    {
      code: '03',
      image: '/screenshots/3d-section-analysis.png',
      tone: 'plum',
      titleKey: 'landing.capGrid3Title',
      descKey: 'landing.capGrid3Desc',
    },
    {
      code: '04',
      image: '/screenshots/3d-loads.png',
      tone: 'ink',
      titleKey: 'landing.capGrid4Title',
      descKey: 'landing.capGrid4Desc',
    },
    {
      code: '07',
      image: '/screenshots/pro-verification.png',
      tone: 'paper',
      titleKey: 'landing.capGrid7Title',
      descKey: 'landing.capGrid7Desc',
    },
  ] as const;
</script>

<section class="cap-section reveal">
  <div class="section-inner">
    <div class="section-head">
      <span class="tag">{t('landing.coreDepth')}</span>
      <h2>{t('landing.capabilitiesTitle')}</h2>
      <p class="section-sub">{t('landing.coreDepthSub')}</p>
    </div>

    <div class="cap-hero">
      <div class="cap-hero-copy">
        <span class="tag tag-sm">{t('landing.depthHeroEyebrow')}</span>
        <h3>{t('landing.depthHeroTitle')}</h3>
        <p>{t('landing.depthHeroDesc')}</p>
        <ul>
          <li>{t('landing.depthHero1')}</li>
          <li>{t('landing.depthHero2')}</li>
          <li>{t('landing.depthHero3')}</li>
          <li>{t('landing.depthHero4')}</li>
        </ul>
      </div>
      <div class="cap-hero-visual">
        <img class="cap-main-img" src="/screenshots/3d-industrial.png" alt={t('landing.depthHeroTitle')} loading="lazy" />
        <img class="cap-float cap-float-a" src="/screenshots/3d-section-analysis.png" alt={t('landing.capGrid3Title')} loading="lazy" />
        <img class="cap-float cap-float-b" src="/screenshots/2d-moments.png" alt={t('landing.capGrid1Title')} loading="lazy" />
      </div>
    </div>

    <div class="cap-grid">
      {#each depthTiles as tile}
        <article class="cap-tile" data-tone={tile.tone}>
          <div class="cap-tile-img">
            <img src={tile.image} alt={t(tile.titleKey)} loading="lazy" />
          </div>
          <div class="cap-tile-body">
            <span class="cap-num">{tile.code}</span>
            <h4>{t(tile.titleKey)}</h4>
            <p>{t(tile.descKey)}</p>
          </div>
        </article>
      {/each}
    </div>
  </div>
</section>
