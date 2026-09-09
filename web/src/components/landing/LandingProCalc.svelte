<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';
  import Shot from './Shot.svelte';

  /**
   * PRO, the half that is free and stays free.
   *
   * Split from the old single PRO section because the two halves are priced
   * differently and the landing's job is to make that legible: the engine is
   * free forever, the code checks probably are not. One section arguing both
   * at once is what made the previous version hedge.
   */
  const shots = [
    { base: 'pro-building-model', w: 1600, h: 876, alt: 'landing.shotProModelAlt', title: 'landing.shotProModelTitle' },
    { base: 'pro-building-axial', w: 1600, h: 876, alt: 'landing.shotProAxialAlt', title: 'landing.shotProAxialTitle' },
    { base: '3d-industrial', w: 1600, h: 876, alt: 'landing.shotIndustrialAlt', title: 'landing.shotIndustrialTitle', wide: true },
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

    <div class="card-row cols-2 cap-shots">
      {#each shots as sh}
        <article class="card card-media" class:card-wide={sh.wide}>
          <Shot base={sh.base} w={sh.w} h={sh.h} alt={t(sh.alt)} sizes={sh.wide ? '(max-width: 760px) 92vw, 92vw' : undefined} />
          <div class="card-body"><h3>{t(sh.title)}</h3></div>
        </article>
      {/each}
    </div>

    <p class="mode-note mode-note--strong">{t('landing.proCalcFree')}</p>
  </div>
</section>
