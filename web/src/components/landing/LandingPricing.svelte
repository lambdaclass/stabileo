<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';

  // Core browser analysis is free; specialised modules are free for universities.
  const FREE = { k: 'priceFree', tone: 'free' } as const;

  /*
   * Footnote markers live in the markup, not in the strings.
   *
   * A translator moving an asterisk, or dropping one, would silently point a
   * cell at the wrong note — and the page would still look right in the one
   * language the reader who noticed does not speak.
   */
  const mark = (n: number) => '*'.repeat(n);
  /*
   * In the order the page introduced them: Basic, PRO Analysis, PRO Design,
   * the agent, Education. The table read Education before the agent, so the
   * one row a reader had not met yet arrived out of sequence.
   */
  const rows = [
    { mod: 'modBasic',     firms: FREE, unis: FREE },
    { mod: 'modProCalc',   firms: FREE, unis: FREE },
    { mod: 'modProDesign', firms: { k: 'pricePaid', tone: 'paid', note: 1 }, unis: FREE },
    { mod: 'modAi', firms: { k: 'priceAtCost', tone: 'paid', note: 2 },
      unis: { k: 'priceAtCost', tone: 'paid', note: 2 } },
    /*
     * Education's firms cell is blank, not "free". The mode is aimed at
     * teaching; saying "gratis" to a firm invites the question of what a firm
     * would do with it, which the row cannot answer in two words.
     */
    { mod: 'modEdu',       firms: null, unis: FREE },
  ];
</script>

<section class="sec sec--ink pricing reveal" data-section="pricing" id="pricing" aria-labelledby="pricing-title">
  <div class="wrap">
    <Eyebrow n="07" label={t('landing.ebPricing')} />

    <h2 id="pricing-title" class="display">{t('landing.pricingH')}</h2>
    <p class="lead">{t('landing.pricingP')}</p>

    <div class="model-table-wrap">
      <table class="model-table">
        <thead>
          <tr>
            <th scope="col"><span class="sr-only">{t('landing.navPricing')}</span></th>
            <th scope="col">{t('landing.colFirms')}</th>
            <th scope="col">{t('landing.colUnis')}</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as r}
            <tr>
              <th scope="row">{t('landing.' + r.mod)}</th>
              {#each [r.firms, r.unis] as cell}
                {#if cell}
                  <td class="price is-{cell.tone}"
                    >{t('landing.' + cell.k)}{#if cell.note}<sup class="fn">{mark(cell.note)}</sup>{/if}</td
                  >
                {:else}
                  <!-- Blank on purpose. See the row definitions above. -->
                  <td class="price"></td>
                {/if}
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <p class="mode-note"><span class="fn">{mark(1)}</span> {t('landing.pricingFreeNowNote')}</p>
    <p class="mode-note"><span class="fn">{mark(2)}</span> {t('landing.pricingAiNote')}</p>
    <p class="mode-note">{t('landing.pricingCommunity')}</p>
  </div>
</section>
