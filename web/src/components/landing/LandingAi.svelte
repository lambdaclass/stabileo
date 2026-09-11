<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';
  import Shot from './Shot.svelte';

  /**
   * The agent, with the one view of it that exists.
   *
   * Laid out as a split rather than as a full-width card. The panel is 1240 by
   * 1026 — nearly square, and about a third of a screen in the application —
   * so a card the width of the deck rendered it four times the size it is in
   * the product, which is both wrong and the loudest thing on the page. It
   * sits beside the copy at the size it actually has.
   *
   * The screen IS the argument the section makes: a request in plain language,
   * the change set out before anything happens, and Cancel next to Apply. The
   * agent proposes and a person decides.
   */
</script>

<section class="sec sec--paper ai reveal" data-section="ai" id="ai" aria-labelledby="ai-title">
  <div class="wrap">
    <Eyebrow n="04" label={t('landing.ebAi')} />

    <div class="mode-split">
      <div class="mode-split-text">
        <div class="mode-head">
          <h2 id="ai-title" class="display">{t('landing.aiH')}</h2>
          <span class="badge badge-dev">{t('landing.badgeDevPaid')}</span>
        </div>
        <p class="lead">{t('landing.aiP')}</p>
      </div>

      <figure class="mode-split-shot">
        <Shot base="ai-panel" w={1240} h={1026} alt={t('landing.shotAiAlt')} sizes="(max-width: 860px) 92vw, 34vw" />
        <figcaption>{t('landing.shotAiTitle')}</figcaption>
      </figure>
    </div>
  </div>
</section>
