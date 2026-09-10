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
  /*
   * Five modules, two audiences, and the tone belongs to the CELL.
   *
   * PRO · Design is paid for firms and free for universities. With the tone
   * on the row, that "Gratis" came out in the paid red — the table saying one
   * thing in words and the opposite in colour.
   */
  const FREE = { k: 'priceFree', tone: 'free' } as const;
  const rows = [
    { mod: 'modBasic',     firms: FREE, unis: FREE },
    { mod: 'modProCalc',   firms: FREE, unis: FREE },
    { mod: 'modProDesign', firms: { k: 'pricePaidLow', tone: 'paid' }, unis: FREE },
    { mod: 'modEdu',       firms: FREE, unis: FREE },
    /*
     * The AI's university cell is deliberately blank. Repeating "pago por
     * token" there answered a question the paragraph below answers better: a
     * university can connect its own language-model API. A price in the cell
     * contradicted that; a blank leaves the explanation to do the work.
     */
    { mod: 'modAi',        firms: { k: 'pricePerToken', tone: 'paid' }, unis: null },
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
            <tr>
              <th scope="row">{t('landing.' + r.mod)}</th>
              <td class="price is-{r.firms.tone}">{t('landing.' + r.firms.k)}</td>
              {#if r.unis}
                <td class="price is-{r.unis.tone}">{t('landing.' + r.unis.k)}</td>
              {:else}
                <td class="price"></td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <p class="mode-note">{t('landing.pricingLowNote')}</p>
    <p class="mode-note">{t('landing.pricingAiNote')}</p>
    <p class="mode-note">{t('landing.pricingCommunity')}</p>
  </div>
</section>
