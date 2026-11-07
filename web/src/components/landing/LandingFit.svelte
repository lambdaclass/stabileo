<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import PublicLink from './PublicLink.svelte';

  const groups = [
    ['landing.fitDeskH', 'landing.fitDeskP'],
    ['landing.fitScriptH', 'landing.fitScriptP'],
    ['landing.fitClassH', 'landing.fitClassP'],
  ];
</script>

<section class="sec sec--paper fit" data-section="fit" id="fit" aria-labelledby="fit-title">
  <div class="wrap">
    <h2 id="fit-title" class="display">{t('landing.fitH')}</h2>
    <div class="card-row cols-3">
      {#each groups as [h, p]}
        <article class="card"><h3>{t(h)}</h3><p>{t(p)}</p></article>
      {/each}
    </div>
    <p class="link-row">
      <PublicLink to="/reliability" class="link-arrow">{t('landing.footReliability')}</PublicLink>
      <PublicLink to="/sap2000-alternative" class="link-arrow">{t('landing.footSap2000')}</PublicLink>
    </p>
  </div>
</section>

