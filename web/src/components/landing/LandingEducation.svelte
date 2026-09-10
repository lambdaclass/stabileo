<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';
  import Shot from './Shot.svelte';

  /**
   * Education: the round trip, and one picture of a student inside it.
   *
   * What each audience pays is in the pricing section, not here. This one
   * carried the university promise for a draft and it belonged with the rest
   * of the prices, in one place, where it cannot drift out of step.
   */
</script>

<section class="sec sec--ink education reveal" data-section="education" id="education" aria-labelledby="edu-title">
  <div class="wrap">
    <Eyebrow n="05" label={t('landing.ebEdu')} />

    <div class="mode-head">
      <h2 id="edu-title" class="display">{t('landing.eduH')}</h2>
      <span class="badge badge-dev">{t('landing.badgeDev')}</span>
    </div>
    <p class="lead">{t('landing.eduP')}</p>
    <div class="card-row cols-1 cap-shots">
      <article class="card card-media card-wide">
        <Shot base="edu-exercise" w={3022} h={1452} alt={t('landing.shotEduAlt')} sizes="(max-width: 760px) 92vw, 92vw" />
        <div class="card-body"><h3>{t('landing.shotEduTitle')}</h3></div>
      </article>
    </div>

  </div>
</section>
