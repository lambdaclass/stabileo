<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';
  import Shot from './Shot.svelte';

  /**
   * The agent, with the one view of it that exists.
   *
   * This section carried no picture for a draft, on the grounds that there was
   * nothing finished to show. There is: the panel takes a request in plain
   * language and puts the proposed change in front of you — the element it
   * removes, the count it changes, the re-check it will run — with Cancel and
   * Apply. That screen IS the argument the section makes, which is that the
   * AI proposes and a person decides.
   */
</script>

<section class="sec sec--paper ai reveal" data-section="ai" id="ai" aria-labelledby="ai-title">
  <div class="wrap">
    <Eyebrow n="04" label={t('landing.ebAi')} />

    <div class="mode-head">
      <h2 id="ai-title" class="display">{t('landing.aiH')}</h2>
      <span class="badge badge-dev">{t('landing.badgeDevPaid')}</span>
    </div>
    <p class="lead">{t('landing.aiP')}</p>

    <div class="card-row cols-1 cap-shots">
      <article class="card card-media card-wide">
        <Shot base="ai-panel" w={1240} h={1026} alt={t('landing.shotAiAlt')} sizes="(max-width: 760px) 92vw, 62vw" />
        <div class="card-body"><h3>{t('landing.shotAiTitle')}</h3></div>
      </article>
    </div>
  </div>
</section>
