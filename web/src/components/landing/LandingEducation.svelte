<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';

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
    <p class="mode-note mode-note--strong">{t('landing.eduUni')}</p>
  </div>
</section>
