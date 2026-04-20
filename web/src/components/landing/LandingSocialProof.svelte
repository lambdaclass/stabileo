<script lang="ts">
  import { t } from '../../lib/i18n';
  import { onMount } from 'svelte';
  import { REPO_URL, fetchGithubStars } from './landing-utils';

  let stars = $state<number | null>(null);
  let sectionEl: HTMLElement | undefined;
  let animated = $state(false);

  let starsNum = $state(0);
  let testsNum = $state(0);
  let langsNum = $state(0);

  const TESTS_TARGET = 1117;
  const LANGS_TARGET = 14;

  onMount(() => {
    fetchGithubStars().then((n) => {
      stars = n;
      if (animated && n != null) {
        animateTo((v) => (starsNum = v), starsNum, n, 900);
      }
    });

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !animated) {
            animated = true;
            animateTo((v) => (testsNum = v), 0, TESTS_TARGET, 1400);
            animateTo((v) => (langsNum = v), 0, LANGS_TARGET, 900);
            if (stars != null) animateTo((v) => (starsNum = v), 0, stars, 900);
            io.disconnect();
          }
        }
      },
      { threshold: 0.35 },
    );

    if (sectionEl) io.observe(sectionEl);
    return () => io.disconnect();
  });

  function animateTo(setter: (v: number) => void, from: number, to: number, ms: number) {
    const start = performance.now();
    const run = (t2: number) => {
      const p = Math.min(1, (t2 - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setter(Math.round(from + (to - from) * eased));
      if (p < 1) requestAnimationFrame(run);
    };
    requestAnimationFrame(run);
  }

  function fmt(n: number): string {
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return n.toLocaleString('en-US');
  }
</script>

<section class="social-section reveal" id="community" bind:this={sectionEl}>
  <div class="section-inner">
    <div class="section-head">
      <span class="tag">{t('landing.socialTag')}</span>
      <h2>{t('landing.socialTitle')}</h2>
      <p class="section-sub">{t('landing.socialSub')}</p>
    </div>

    <div class="stats-grid">
      <a class="stat-card" href={REPO_URL} target="_blank" rel="noreferrer">
        <div class="stat-num">{stars == null ? '—' : fmt(starsNum)}<span class="stat-suffix">★</span></div>
        <div class="stat-label">{t('landing.statStars')}</div>
        <div class="stat-hint">github.com/lambdaclass</div>
      </a>
      <div class="stat-card">
        <div class="stat-num">{fmt(testsNum)}<span class="stat-suffix">✓</span></div>
        <div class="stat-label">{t('landing.statTests')}</div>
        <div class="stat-hint">{t('landing.statTestsHint')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{langsNum}</div>
        <div class="stat-label">{t('landing.statLanguages')}</div>
        <div class="stat-hint">{t('landing.statLanguagesHint')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">0<span class="stat-suffix">$</span></div>
        <div class="stat-label">{t('landing.statFree')}</div>
        <div class="stat-hint">{t('landing.statFreeHint')}</div>
      </div>
    </div>

    <div class="quote-grid">
      <article class="quote-card">
        <p>{t('landing.quote1')}</p>
        <div class="quote-who">
          <div class="quote-avatar">MR</div>
          <div class="quote-who-text">
            <strong>{t('landing.quote1Name')}</strong>
            <span>{t('landing.quote1Role')}</span>
          </div>
        </div>
      </article>

      <article class="quote-card">
        <p>{t('landing.quote2')}</p>
        <div class="quote-who">
          <div class="quote-avatar plum">JL</div>
          <div class="quote-who-text">
            <strong>{t('landing.quote2Name')}</strong>
            <span>{t('landing.quote2Role')}</span>
          </div>
        </div>
      </article>

      <article class="quote-card">
        <p>{t('landing.quote3')}</p>
        <div class="quote-who">
          <div class="quote-avatar green">AP</div>
          <div class="quote-who-text">
            <strong>{t('landing.quote3Name')}</strong>
            <span>{t('landing.quote3Role')}</span>
          </div>
        </div>
      </article>
    </div>
  </div>
</section>
