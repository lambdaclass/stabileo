<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';
  import PublicLink from './PublicLink.svelte';
  import Shot from './Shot.svelte';

  const SHOT_W = 1600, SHOT_H = 1000;

  /**
   * The half that will be charged for, and says so.
   *
   * What this will cost is said once, in the pricing section at the end. It
   * was said here too for one draft, and a section that describes a capability
   * and then argues about its price in the same breath reads as a sales page
   * rather than a product page.
   */
</script>

<section class="sec sec--ink pro-design" data-section="pro-design" id="pro-design" aria-labelledby="pro-design-title">
  <div class="wrap">
    <Eyebrow n="03" label={t('landing.ebProDesign')} />

    <div class="mode-head">
      <h2 id="pro-design-title" class="display">{t('landing.proDesignH')}</h2>
      <span class="badge badge-dev">{t('landing.badgeDevOpen')}</span>
    </div>
    <p class="lead">{t('landing.proDesignP')}</p>
    <p class="lead">{t('landing.proDesign3d')}</p>
    <p class="link-row">
      <PublicLink to="/cirsoc" class="link-arrow">{t('landing.proDesignCirsocLink')}</PublicLink>
      <a class="link-arrow" href="https://github.com/lambdaclass/stabileo/issues/532">#532</a>
    </p>

    <div class="card-row cols-1 cap-shots">
      <article class="card card-media card-wide">
        <Shot base="pro-rc-sheets" w={SHOT_W} h={SHOT_H} alt={t('landing.shotSheetsAlt')} sizes="(max-width: 760px) 92vw, 92vw" />
        <div class="card-body"><h3>{t('landing.shotSheetsTitle')}</h3></div>
      </article>
    </div>
  </div>
</section>
