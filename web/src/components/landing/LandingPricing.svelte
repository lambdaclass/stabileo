<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';

  /**
   * Pricing, at the end of the deck rather than the start.
   *
   * It opened the page for one draft, under the business model's own headline
   * — "what can be copied is free, what cannot is not". That sentence is true
   * and it belongs in an internal document: it explains the pricing from the
   * company's side, and a visitor meeting it first reads a page that is
   * thinking about revenue before it has said what the thing does. The deck
   * shows the product, then says what it costs.
   *
   * The rows are the ones in the one-page business model (Stabileo SAS,
   * September 2026). Keep them in step: this page is the public face of that
   * document, and a landing that prices a module differently from the plan is
   * worse than a landing that does not price it at all.
   */
  /*
   * Five modules, two audiences. The previous shape had a "for whom" column
   * and repeated Education twice to split public from private universities;
   * they are one audience now and everything is free for them.
   */
  const rows = [
    { mod: 'modBasic',     firms: 'priceFree',     unis: 'priceFree' },
    { mod: 'modProCalc',   firms: 'priceFree',     unis: 'priceFree' },
    { mod: 'modProDesign', firms: 'pricePaidLow',  unis: 'priceFree',     tone: 'paid' },
    { mod: 'modEdu',       firms: 'priceFree',     unis: 'priceFree' },
    { mod: 'modAi',        firms: 'pricePerToken', unis: 'pricePerToken', tone: 'paid' },
  ];
</script>

<section class="sec sec--ink pricing reveal" data-section="pricing" id="pricing" aria-labelledby="pricing-title">
  <div class="wrap">
    <Eyebrow n="06" label={t('landing.ebPricing')} />

    <h2 id="pricing-title" class="display">{t('landing.pricingH')}</h2>
    <p class="lead">{t('landing.pricingP')}</p>

    <div class="model-table-wrap">
      <table class="model-table">
        <thead>
          <tr>
            <th scope="col"><span class="sr-only">{t('landing.ebPricing')}</span></th>
            <th scope="col">{t('landing.colFirms')}</th>
            <th scope="col">{t('landing.colUnis')}</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as r}
            <tr class={`tone-${r.tone ?? 'free'}`}>
              <th scope="row">{t('landing.' + r.mod)}</th>
              <td class="price">{t('landing.' + r.firms)}</td>
              <td class="price">{t('landing.' + r.unis)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <p class="mode-note">{t('landing.pricingLowNote')}</p>
    <p class="mode-note">{t('landing.pricingCommunity')}</p>
  </div>
</section>
