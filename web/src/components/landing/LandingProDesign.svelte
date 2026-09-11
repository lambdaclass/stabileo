<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';
  import Shot from './Shot.svelte';

  /**
   * The half that will be charged for, and says so.
   *
   * What this will cost is said once, in the pricing section at the end. It
   * was said here too for one draft, and a section that describes a capability
   * and then argues about its price in the same breath reads as a sales page
   * rather than a product page.
   */
</script>

<section class="sec sec--ink pro-design reveal" data-section="pro-design" id="pro-design" aria-labelledby="pro-design-title">
  <div class="wrap">
    <Eyebrow n="03" label={t('landing.ebProDesign')} />

    <div class="mode-head">
      <h2 id="pro-design-title" class="display">{t('landing.proDesignH')}</h2>
      <span class="badge badge-dev">{t('landing.badgeDevOpen')}</span>
    </div>
    <p class="lead">{t('landing.proDesignP')}</p>

    <div class="card-row cols-1 cap-shots">
      <article class="card card-media card-wide">
        <Shot base="pro-rebar-3d" w={1600} h={876} alt={t('landing.shotRebarAlt')} sizes="(max-width: 760px) 92vw, 92vw" />
        <div class="card-body"><h3>{t('landing.shotRebarTitle')}</h3></div>
      </article>
    </div>
  </div>
</section>
