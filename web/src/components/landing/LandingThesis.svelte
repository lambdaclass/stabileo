<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';

  const analogies = [
    { k: 'landing.thAn1K', body: 'landing.thAn1' },
    { k: 'landing.thAn2K', body: 'landing.thAn2' },
    { k: 'landing.thAn3K', body: 'landing.thAn3' },
  ];

  /**
   * Intended capabilities, and only intended.
   *
   * The agent routes exist — /ai/build-model, /ai/review-model,
   * /ai/interpret-results and /ai/explain-diagnostic in the Rust backend — but
   * `VITE_AI_BACKEND_URL` defaults to http://localhost:3001 and the GitHub
   * Pages workflow never sets it, so the public site ships no reachable
   * backend. `aiStatus` says that plainly, above this list, because a reader
   * who meets the list first will assume it is a feature tour.
   */
  const future = ['aiFut1', 'aiFut2', 'aiFut3', 'aiFut4', 'aiFut5', 'aiFut6'];
</script>

<section class="sec sec--ink thesis reveal" data-section="thesis" id="thesis" aria-labelledby="thesis-title">
  <div class="wrap">
    <Eyebrow n="11" label={t('landing.ebThesis')} />
    <div class="mode-head">
      <h2 id="thesis-title" class="display">
        {t('landing.thH1')} <em>{t('landing.thH2')}</em>
      </h2>
      <span class="badge badge-dev">{t('landing.badgeDev')}</span>
    </div>
    <p class="lead lead-wide">{t('landing.thP')}</p>

    <div class="gv">
      <article class="gv-side">
        <p class="kicker kicker-blue">{t('landing.thGenK')}</p>
        <h3>{t('landing.thGenT')}</h3>
        <p>{t('landing.thGenB')}</p>
      </article>
      <p class="gv-arrow" aria-hidden="true">→</p>
      <article class="gv-side">
        <p class="kicker kicker-accent">{t('landing.thVerK')}</p>
        <h3>{t('landing.thVerT')}</h3>
        <p>{t('landing.thVerB')}</p>
      </article>
    </div>

    <div class="analogies">
      {#each analogies as a}
        <div class="analogy">
          <p class="kicker">{t(a.k)}</p>
          <p>{t(a.body)}</p>
        </div>
      {/each}
    </div>

    <p class="mode-note">{t('landing.aiStatus')}</p>

    <section class="ai-future" aria-labelledby="ai-future-title">
      <p class="kicker">{t('landing.aiFutKicker')}</p>
      <h3 id="ai-future-title">{t('landing.aiFutTitle')}</h3>
      <ul class="status-list">
        {#each future as key}<li>{t('landing.' + key)}</li>{/each}
      </ul>
    </section>

    <p class="thesis-close">{t('landing.thClose')}</p>
  </div>
</section>
