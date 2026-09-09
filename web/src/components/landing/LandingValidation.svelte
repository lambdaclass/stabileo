<script lang="ts">
  import { onMount } from 'svelte';
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import { REPO_URL, fetchGithubStars } from './landing-utils';
  import Eyebrow from './Eyebrow.svelte';

  /**
   * Both numbers are measurements with a stated provenance, not estimates.
   *
   *   ENGINE_TESTS  `cd engine && cargo test`, summed over every target whose
   *                 name does not match /reference/ — 5655 passing, 0 failures,
   *                 measured at 6c3369d6 on 2026-08-01. The 1192
   *                 reference-formula self-checks in engine/tests/reference/
   *                 are counted separately by design and are deliberately NOT
   *                 added in. This stays a point-in-time figure with its commit
   *                 named in the hint, rather than a number that drifts
   *                 silently as the suite grows.
   *   EXAMPLES      src/lib/templates/fixture-index.ts — 55 registered
   *                 fixtures, of which 37 appear in the Basic examples menu.
   *                 It was 54 until the CIRSOC load-code work merged and added
   *                 `frame-cirsoc-dl`; a re-count against the merged tree is
   *                 what caught it. Recount with:
   *                   grep -cE "^\s*'[^']+': \(\) => import" fixture-index.ts
   *
   * These are rendered statically. They were briefly animated with a count-up:
   * that added an IntersectionObserver whose only failure mode was rendering a
   * confident, wrong `0`, and a scroll-in could reset a correct figure to zero
   * and count it back up. Evidence should not have a loading state.
   */
  const ENGINE_TESTS = 5655;
  const EXAMPLES = 55;

  const validatedAgainst = ['NAFEMS', 'ANSYS', 'Code_Aster', 'SAP2000', 'OpenSees'];

  let stars = $state<number | null>(null);

  onMount(() => {
    fetchGithubStars().then((n) => { stars = n; });
  });

  const fmt = (n: number) => n.toLocaleString('en-US');
</script>

<section class="sec sec--ink validation reveal" data-section="validation" id="validation" aria-labelledby="validation-title">
  <div class="wrap">
    <Eyebrow n="06" label={t('landing.ebValidation')} />
    <h2 id="validation-title" class="display">{t('landing.valH')}</h2>
    <p class="lead">{t('landing.valP')}</p>

    <p class="kicker">{t('landing.valAgainst')}</p>
    <ul class="chip-row">
      {#each validatedAgainst as name}<li class="chip chip-static">{name}</li>{/each}
      <li class="chip chip-static">{t('landing.valBook')}</li>
    </ul>

    <div class="stat-row">
      <div class="stat">
        <p class="stat-num">{fmt(ENGINE_TESTS)}</p>
        <p class="stat-label">{t('landing.statTestsLbl')}</p>
        <p class="stat-hint">{t('landing.statTestsHintNew')}</p>
      </div>
      <div class="stat">
        <p class="stat-num">{EXAMPLES}</p>
        <p class="stat-label">{t('landing.statExamplesLbl')}</p>
        <p class="stat-hint">{t('landing.statExamplesHint')}</p>
      </div>
      <a class="stat" href={REPO_URL} target="_blank" rel="noreferrer">
        <p class="stat-num">{stars == null ? '—' : fmt(stars)}</p>
        <p class="stat-label">{t('landing.statStarsLbl')}</p>
        <p class="stat-hint">{t('landing.statStarsHint')}</p>
      </a>
      <div class="stat">
        <p class="stat-num stat-num-sm">AGPL-3.0</p>
        <p class="stat-label">{t('landing.statLicenseLbl')}</p>
        <p class="stat-hint">{t('landing.statLicenseHint')}</p>
      </div>
    </div>

    <div class="card-row cols-2">
      <article class="card card-quiet">
        <h3>{t('landing.valPerfTitle')}</h3>
        <p>{t('landing.valPerfBody')}</p>
      </article>
      <article class="card card-quiet">
        <h3>{t('landing.valLocalTitle')}</h3>
        <p>{t('landing.valLocalBody')}</p>
      </article>
    </div>
  </div>
</section>
