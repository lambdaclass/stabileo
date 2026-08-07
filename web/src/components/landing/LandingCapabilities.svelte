<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';

  const columns = [
    { head: 'landing.capColLinear', items: ['capLin1','capLin2','capLin3','capLin4','capLin5','capLin6','capLin7','capLin8'] },
    { head: 'landing.capColNonlinear', items: ['capNl1','capNl2','capNl3','capNl4','capNl5','capNl6'] },
    { head: 'landing.capColElements', items: ['capEl1','capEl2','capEl3','capEl4','capEl5'] },
    { head: 'landing.capColTime', items: ['capTd1','capTd2','capTd3','capTd4'] },
  ];

  /*
   * The four Basic-mode screenshots that used to close this section now live in
   * LandingBasic.svelte. Here they invited exactly the wrong inference: a
   * reader who had just seen "construction stages" and "solid-shells" in the
   * matrix above read the images as proof that Basic reaches them. `capP` now
   * says plainly that the deeper rows belong to PRO.
   */
</script>

<section class="sec sec--paper caps reveal" data-section="capabilities" id="capabilities" aria-labelledby="capabilities-title">
  <div class="wrap">
    <Eyebrow n="06" label={t('landing.ebCapabilities')} />
    <h2 id="capabilities-title" class="display">{t('landing.capH')}</h2>
    <p class="lead">{t('landing.capP')}</p>

    <div class="cap-matrix">
      {#each columns as col}
        <div class="cap-col">
          <p class="kicker">{t(col.head)}</p>
          <ul>
            {#each col.items as key}
              <li>{t('landing.' + key)}</li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>

  </div>
</section>
