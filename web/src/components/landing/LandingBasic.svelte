<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';
  import Shot from './Shot.svelte';

  /**
   * Basic: the one mode finished enough to hand a stranger.
   *
   * The screenshots are the ones the previous landing carried; what went is
   * the paragraph under each of them. A caption that names what the picture
   * shows does the work — the picture is the argument, and the second sentence
   * was the page explaining its own evidence.
   */
  const shots = [
    { base: '2d-moments', w: 1600, h: 997, alt: 'landing.shot2dAlt', title: 'landing.shot2dTitle' },
    { base: '2d-section-analysis', w: 1600, h: 997, alt: 'landing.shotStress2dAlt', title: 'landing.shotStress2dTitle' },
    { base: '3d-frame', w: 1600, h: 876, alt: 'landing.shot3dAlt', title: 'landing.shot3dTitle' },
    { base: '3d-section-analysis', w: 1600, h: 876, alt: 'landing.shotStress3dAlt', title: 'landing.shotStress3dTitle' },
  ];

  const points = ['basicPt1', 'basicPt2', 'basicPt3', 'basicPt4'];
</script>

<section class="sec sec--paper basic reveal" data-section="basic" id="basic" aria-labelledby="basic-title">
  <div class="wrap">
    <Eyebrow n="01" label={t('landing.ebBasic')} />

    <div class="mode-head">
      <h2 id="basic-title" class="display">{t('landing.basicH')}</h2>
      <span class="badge badge-today">{t('landing.badgeFreeAlways')}</span>
    </div>
    <p class="lead">{t('landing.basicP')}</p>

    <ul class="tick-list">
      {#each points as key}<li>{t('landing.' + key)}</li>{/each}
    </ul>

    <div class="card-row cols-2 cap-shots">
      {#each shots as sh}
        <article class="card card-media">
          <Shot base={sh.base} w={sh.w} h={sh.h} alt={t(sh.alt)} />
          <div class="card-body"><h3>{t(sh.title)}</h3></div>
        </article>
      {/each}
    </div>
  </div>
</section>
