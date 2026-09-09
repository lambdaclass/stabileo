<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';

  /**
   * The agent. No screenshot on purpose — there is not a finished one to show,
   * and a mock-up on a page whose whole argument is "we say what actually
   * works" would cost more than the picture is worth.
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
    <p class="mode-note">{t('landing.aiPaid')}</p>
  </div>
</section>
