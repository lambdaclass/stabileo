<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';

  /**
   * The single source of truth on the page for what ships. Every capability
   * carries a badge; nothing is listed without one. The hosted services in the
   * roadmap group do not exist — they are named here and nowhere else, and no
   * price appears anywhere on this page.
   */
  const groups = [
    {
      badge: 'landing.badgeToday',
      tone: 'today',
      title: 'landing.stGroupToday',
      items: ['stT1', 'stT2', 'stT3', 'stT4', 'stT5', 'stT6', 'stT9', 'stT7', 'stT8'],
    },
    {
      badge: 'landing.badgePartial',
      tone: 'partial',
      title: 'landing.stGroupPartial',
      items: ['stPa1', 'stPa2', 'stPa5', 'stPa3', 'stPa4'],
    },
    {
      badge: 'landing.badgeDev',
      tone: 'dev',
      title: 'landing.stGroupDev',
      items: ['stD1', 'stD2', 'stD3', 'stD4'],
    },
    {
      badge: 'landing.badgeRoadmap',
      tone: 'roadmap',
      title: 'landing.stGroupRoadmap',
      items: ['stR1', 'stR2', 'stR3', 'stR4', 'stR5'],
    },
  ];
</script>

<section class="sec sec--paper status reveal" data-section="status" id="status" aria-labelledby="status-title">
  <div class="wrap">
    <Eyebrow n="11" label={t('landing.ebStatus')} />
    <h2 id="status-title" class="display">{t('landing.stH')}</h2>
    <p class="lead">{t('landing.stP')}</p>

    <div class="status-groups">
      {#each groups as g}
        <section class="status-group" aria-labelledby="stg-{g.tone}">
          <header class="status-head">
            <span class="badge badge-{g.tone}">{t(g.badge)}</span>
            <h3 id="stg-{g.tone}">{t(g.title)}</h3>
          </header>
          <ul class="status-list">
            {#each g.items as key}
              <li>{t('landing.' + key)}</li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>

    <div class="access">
      <h3>{t('landing.accessT')}</h3>
      <p>{t('landing.accessB')}</p>
      <p>{t('landing.accessEdu')}</p>
      <p class="access-note">{t('landing.accessNote')}</p>
    </div>
  </div>
</section>
