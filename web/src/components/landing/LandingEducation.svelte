<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';
  import Shot from './Shot.svelte';

  /**
   * Education, and the sentence the whole page exists to be able to say.
   *
   * The public-university exemption is stated here rather than in the model
   * table alone, because this is the section the people it applies to will
   * read. It carries the AI carve-out with it: leaving that out would make the
   * promise wider than the one we can keep.
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

    <p class="mode-note mode-note--strong">{t('landing.eduUni')}</p>
  </div>
</section>
