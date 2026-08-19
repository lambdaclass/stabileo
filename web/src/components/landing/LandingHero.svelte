<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import { enterApp, goPublic } from './landing-utils';
  import Eyebrow from './Eyebrow.svelte';
  import TrussFigure from './TrussFigure.svelte';

  type Props = { prefersReducedMotion?: boolean };
  let { prefersReducedMotion = false }: Props = $props();
</script>

<section class="sec sec--ink hero" data-section="hero" id="top" aria-labelledby="hero-title">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <Eyebrow n="01" label={t('landing.ebHero')} />
      <h1 id="hero-title">{t('landing.heroH')}</h1>
      <p class="lead">{t('landing.heroP')}</p>

      <div class="hero-ctas">
        <button class="btn btn-primary btn-lg" onclick={() => enterApp()}>{t('landing.heroCtaPrimary')}</button>
        <!--
          This used to scroll to the live-demo section. That section is gone,
          so the button points at the guided tour instead — the closest thing
          left to "show me it running". A real navigation, not a pushState:
          /demo starts the tour from the application's onMount, which has
          already run by the time anyone reads this page.
        -->
        <a class="btn btn-ghost btn-lg" href="/demo">{t('landing.heroCtaSecondary')}</a>
      </div>

      <!--
        The blog, on the first screen but deliberately at a third level: a mono
        link on its own line, not a third button. The hero's job is to get
        someone into the editor, and two buttons plus a link reads as one
        decision with a footnote, where three buttons would read as three
        equal choices.
      -->
      <button class="link-arrow hero-blog" onclick={() => goPublic('/blog')}>{t('landing.heroBlogLink')}</button>

      <!--
        The three modes, named in the first screen.
        The hero used to lead on live re-solving, which is a real
        differentiator but answers "how does it feel?" before the visitor knows
        what the product is or which parts of it exist. Re-solving now appears
        as its own section further down; positioning belongs here.
      -->
      <ul class="hero-modes">
        <li><span class="hero-mode-name">{t('landing.heroModeBasic')}</span><span class="hero-mode-st hero-mode-st-today">{t('landing.heroModeBasicSt')}</span></li>
        <li><span class="hero-mode-name">{t('landing.heroModeEdu')}</span><span class="hero-mode-st">{t('landing.heroModeEduSt')}</span></li>
        <li><span class="hero-mode-name">{t('landing.heroModePro')}</span><span class="hero-mode-st">{t('landing.heroModeProSt')}</span></li>
      </ul>

      <dl class="hero-meta">
        <div><dt>{t('landing.heroMetaA')}</dt></div>
        <div><dt>{t('landing.heroMetaB')}</dt></div>
        <div><dt>{t('landing.heroMetaC')}</dt></div>
      </dl>
    </div>

    <div class="hero-figure">
      <TrussFigure mode="animate" {prefersReducedMotion} />
    </div>
  </div>
</section>
