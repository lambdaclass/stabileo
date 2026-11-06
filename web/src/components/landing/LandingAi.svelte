<script lang="ts" module>
  import { registerFeatureDictionaries } from '../../lib/i18n/store.svelte';
  import { OFFERED_LOCALES } from '../../lib/i18n/offered';
  import { aiTranslations } from './ai-translations';

  registerFeatureDictionaries(Object.fromEntries(OFFERED_LOCALES.map((l) => [l, aiTranslations[l]])));
</script>

<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';
  import Shot from './Shot.svelte';

  const points = ['aiPt1', 'aiPt2', 'aiPt3', 'aiPt4'];
</script>

<section class="sec sec--paper ai" data-section="ai" id="ai" aria-labelledby="ai-title">
  <div class="wrap">
    <Eyebrow n="04" label={t('landing.ebAi')} />

    <div class="mode-split">
      <div class="mode-split-text">
        <div class="mode-head">
          <h2 id="ai-title" class="display">{t('landing.aiH')}</h2>
          <span class="badge badge-dev">{t('landing.badgeDevPaid')}</span>
        </div>
        <p class="lead">{t('landing.aiP')}</p>
        <ul class="tick-list">
          {#each points as key}<li>{t('landing.' + key)}</li>{/each}
        </ul>
        <p class="mode-note">{t('landing.aiStatus')}</p>
      </div>

      <figure class="mode-split-shot">
        <Shot base="ai-panel" w={1240} h={1026} alt={t('landing.shotAiAlt')} sizes="(max-width: 860px) 92vw, 34vw" />
        <figcaption>{t('landing.shotAiTitle')}</figcaption>
      </figure>
    </div>
  </div>
</section>
