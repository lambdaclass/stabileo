<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';

  /**
   * Education mode, split by what a visitor can actually do today.
   *
   * Everything in `now` is verifiable in components/edu: seven predefined
   * exercises solved by the engine, tolerance-checked answers with generated
   * hints, diagrams the student draws and that are marked span by span, an
   * authoring form that reads the canvas, a handout link that opens a
   * student's workspace, and submissions that come back as a file or a code.
   *
   * `next` is what is genuinely still missing, and it is now a different list
   * from the one written when the teacher side did not exist at all: what is
   * absent is the COURSE around the exercise — assignments, a class, attempts,
   * a mark that lives somewhere — not the exercise itself. `eduNotYet` says
   * that outright, including the boundary that causes it: nothing is stored on
   * a server, so everything travels as a link, a file or a code.
   */
  const now = ['eduNow1', 'eduNow2', 'eduNow3', 'eduNow4', 'eduNow5', 'eduNow6', 'eduNow7'];
  const next = ['eduNext1', 'eduNext2', 'eduNext3', 'eduNext4', 'eduNext5', 'eduNext6'];
</script>

<section class="sec sec--ink edu reveal" data-section="education" id="education" aria-labelledby="edu-title">
  <div class="wrap">
    <Eyebrow n="08" label={t('landing.ebEdu')} />

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
