<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';

  /**
   * Education mode, split by what a visitor can actually do today.
   *
   * The `now` column is verifiable in components/edu: six predefined exercises,
   * solved by the engine, with tolerance-checked answers, generated hints and
   * per-item reveal. The `next` column is intent, and the teacher side of it —
   * authoring, submissions, grade records, sharing — does not exist in any form,
   * which `eduNotYet` says outright rather than leaving to the badge.
   */
  const now = ['eduNow1', 'eduNow2', 'eduNow3', 'eduNow4', 'eduNow5'];
  const next = ['eduNext1', 'eduNext2', 'eduNext3', 'eduNext4', 'eduNext5', 'eduNext6', 'eduNext7', 'eduNext8'];
</script>

<section class="sec sec--ink edu reveal" data-section="education" id="education" aria-labelledby="edu-title">
  <div class="wrap">
    <Eyebrow n="09" label={t('landing.ebEdu')} />

    <div class="mode-head">
      <h2 id="edu-title" class="display">{t('landing.eduH')}</h2>
      <span class="badge badge-dev">{t('landing.badgeDev')}</span>
    </div>
    <p class="lead">{t('landing.eduP')}</p>

    <div class="split">
      <section class="split-col" aria-labelledby="edu-now-title">
        <p class="kicker">{t('landing.eduNowKicker')}</p>
        <h3 id="edu-now-title">{t('landing.eduNowTitleNew')}</h3>
        <ul class="tick-list">
          {#each now as key}<li>{t('landing.' + key)}</li>{/each}
        </ul>
      </section>

      <section class="split-col split-col-quiet" aria-labelledby="edu-next-title">
        <p class="kicker">{t('landing.eduNextKicker')}</p>
        <h3 id="edu-next-title">{t('landing.eduNextTitle')}</h3>
        <ul class="status-list">
          {#each next as key}<li>{t('landing.' + key)}</li>{/each}
        </ul>
      </section>
    </div>

    <p class="mode-note">{t('landing.eduNotYet')}</p>
    <p class="mode-commit">{t('landing.eduFree')}</p>
  </div>
</section>
