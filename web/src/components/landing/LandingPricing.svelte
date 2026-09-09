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
  const rows = [
    { mod: 'modBasic',      who: 'whoAll',           price: 'priceFreeAlways', tone: 'free' },
    { mod: 'modProCalc',    who: 'whoAll',           price: 'priceFree',       tone: 'free' },
    { mod: 'modProDesign',  who: 'whoFirms',         price: 'pricePaid',       tone: 'paid' },
    { mod: 'modEdu',        who: 'whoPublicUni',     price: 'priceFree',       tone: 'free' },
    { mod: 'modEdu',        who: 'whoPrivateUni',    price: 'priceTbd',        tone: 'tbd'  },
    { mod: 'modAi',         who: 'whoAll',           price: 'pricePaid',       tone: 'paid' },
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
            <th scope="col">{t('landing.modelColModule')}</th>
            <th scope="col">{t('landing.modelColWho')}</th>
            <th scope="col">{t('landing.modelColPrice')}</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as r}
            <tr class={`tone-${r.tone}`}>
              <th scope="row">{t('landing.' + r.mod)}</th>
              <td>{t('landing.' + r.who)}</td>
              <td class="price">{t('landing.' + r.price)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <p class="mode-note mode-note--strong">{t('landing.pricingUni')}</p>
    <p class="mode-note">{t('landing.modelNote')}</p>
    <p class="mode-note">{t('landing.pricingCommunity')}</p>
  </div>
</section>
