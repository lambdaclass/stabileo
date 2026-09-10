<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';
  import Shot from './Shot.svelte';

  /**
   * PRO, the half that is free and stays free.
   *
   * Split from the old single PRO section because the two halves are priced
   * differently. What each costs is stated once, in the pricing section at the
   * end of the deck — not here, where it interrupted the product with an
   * argument about revenue.
   */
  /*
   * Two pictures, ONE caption underneath both. It was the same sentence
   * repeated under each, which reads as a mistake rather than as a pair.
   */
  const shots = [
    { base: 'pro-building-model', w: 1600, h: 876, alt: 'landing.shotProModelAlt' },
    { base: 'pro-building-axial', w: 1600, h: 876, alt: 'landing.shotProAxialAlt' },
  ];
</script>

<section class="sec sec--paper pro-calc reveal" data-section="pro-calc" id="pro" aria-labelledby="pro-calc-title">
  <div class="wrap">
    <Eyebrow n="02" label={t('landing.ebProCalc')} />

    <div class="mode-head">
      <h2 id="pro-calc-title" class="display">{t('landing.proCalcH')}</h2>
      <span class="badge badge-dev">{t('landing.badgeDevFree')}</span>
    </div>
    <p class="lead">{t('landing.proCalcP')}</p>

    <figure class="shot-pair">
      <div class="shot-pair-images">
        {#each shots as sh}
          <Shot base={sh.base} w={sh.w} h={sh.h} alt={t(sh.alt)} sizes="(max-width: 760px) 92vw, 46vw" />
        {/each}
      </div>
      <figcaption>{t('landing.proCalcShots')}</figcaption>
    </figure>

  </div>
</section>
