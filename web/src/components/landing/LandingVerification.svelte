<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';
  import PublicLink from './PublicLink.svelte';

  /**
   * How the numbers are checked, and where the checks stop.
   *
   * Short on purpose: the claim and its limit in one paragraph, then the two
   * posts that carry the evidence and the advisories. The limit is in the
   * same paragraph as the claim, not behind a link, because a certificate
   * read as "the model is right" is exactly the misreading to prevent.
   */
</script>

<section class="sec sec--ink verification reveal" data-section="verification" id="verification" aria-labelledby="verification-title">
  <div class="wrap">
    <Eyebrow n="05" label={t('landing.ebVerif')} />
    <h2 id="verification-title" class="display">{t('landing.verifH')}</h2>
    <p class="lead">{t('landing.verifP')}</p>
    <p class="verification-links">
      <PublicLink to="/blog/how-stabileo-checks-its-results" class="link-arrow">{t('landing.verifHow')}</PublicLink>
      <PublicLink to="/blog/safety-advisories" class="link-arrow">{t('landing.verifAdvisories')}</PublicLink>
    </p>
  </div>
</section>

<style>
  .verification-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 2rem;
    margin-top: 1.5rem;
  }
</style>
