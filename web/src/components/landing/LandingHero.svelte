<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import { enterApp } from './landing-utils';
  import PublicLink from './PublicLink.svelte';
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
          The hero had a second button here, pointing at /demo, the guided
          tour. That route is being retired by the tutorials workstream, so
          the button is gone rather than left aiming at a 404 — a dead link
          looks exactly like a working one until it is pressed, and this one
          sat in the first screen.

          The hero keeps one action and the quiet blog link below it. When
          /demo returns as the no-login entry point, a second button here is
          a two-line change.
        -->
      </div>

      <!--
        The blog, on the first screen but deliberately at a third level: a mono
        link on its own line, not a third button. The hero's job is to get
        someone into the editor, and two buttons plus a link reads as one
        decision with a footnote, where three buttons would read as three
        equal choices.
      -->
      <PublicLink to="/blog" class="link-arrow hero-blog">{t('landing.heroBlogLink')}</PublicLink>

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
