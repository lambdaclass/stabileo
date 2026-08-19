<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';
  import Shot from './Shot.svelte';

  /**
   * Basic mode: the one mode that is finished enough to hand a stranger.
   *
   * These screenshots used to sit in the solver-capabilities section, where
   * they illustrated the engine's breadth and were read as evidence for
   * capabilities that Basic cannot actually reach. They are all Basic-mode
   * views, so they belong here.
   *
   * Paired on purpose, 2D then 3D: the diagram first, then what the section
   * under it is doing. Section analysis is the part a reader is least likely
   * to expect from a browser tab, so it gets the longer caption of the four.
   *
   * `3d-frame` and `3d-industrial` were one file until the shed earned a card
   * of its own: the six-degrees-of-freedom card now shows a space frame, which
   * is what it was always claiming, and the shed closes the row by saying the
   * examples menu is not the limit.
   */
  const shots = [
    { base: '2d-moments', alt: 'landing.capAlt2d', title: 'landing.capShot2dTitle', body: 'landing.capShot2dBody' },
    { base: '2d-section-analysis', alt: 'landing.capAltStress2d', title: 'landing.capShotStress2dTitle', body: 'landing.capShotStress2dBody' },
    { base: '3d-frame', alt: 'landing.capAlt3d', title: 'landing.capShot3dTitle', body: 'landing.capShot3dBody' },
    { base: '3d-section-analysis', alt: 'landing.capAltStress3d', title: 'landing.capShotStress3dTitle', body: 'landing.capShotStress3dBody' },
    // Wide, and the closing argument rather than one capability among four.
    { base: '3d-industrial', alt: 'landing.capAltIndustrial', title: 'landing.capShotIndustrialTitle', body: 'landing.capShotIndustrialBody', wide: true },
  ];

  /*
   * Live re-solving joined this list when the section it used to own was
   * removed. It is a real differentiator, but it is one feature among several
   * and it is opt-in, so it reads better as a Basic capability than as a
   * chapter of its own ahead of the solver matrix.
   */
  const points = ['basicPt1', 'basicPt2', 'basicPt6', 'basicPt3', 'basicPt4', 'basicPt5'];
</script>

<section class="sec sec--paper basic reveal" data-section="basic" id="basic" aria-labelledby="basic-title">
  <div class="wrap">
    <Eyebrow n="04" label={t('landing.ebBasic')} />

    <div class="mode-head">
      <h2 id="basic-title" class="display">{t('landing.basicH')}</h2>
      <span class="badge badge-today">{t('landing.badgeToday')}</span>
    </div>
    <p class="lead">{t('landing.basicP')}</p>

    <ul class="tick-list">
      {#each points as key}
        <li>{t('landing.' + key)}</li>
      {/each}
    </ul>

    <div class="card-row cols-2 cap-shots">
      {#each shots as sh}
        <article class="card card-media" class:card-wide={sh.wide}>
          <Shot base={sh.base} alt={t(sh.alt)} sizes={sh.wide ? '(max-width: 760px) 92vw, 92vw' : undefined} />
          <div class="card-body">
            <h3>{t(sh.title)}</h3>
            <p>{t(sh.body)}</p>
          </div>
        </article>
      {/each}
    </div>

    <p class="mode-note">{t('landing.basicNote')}</p>
  </div>
</section>
