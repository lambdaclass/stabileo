<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';

  const cards = [
    { k: 'landing.whatK1', title: 'landing.whatT1', body: 'landing.whatB1' },
    { k: 'landing.whatK2', title: 'landing.whatT2', body: 'landing.whatB2' },
    { k: 'landing.whatK3', title: 'landing.whatT3', body: 'landing.whatB3' },
  ];

  /**
   * The map of the product, given once and early.
   *
   * Stabileo AI is introduced here rather than being sprung on the visitor in
   * the generator/verifier section further down: by the time they read the
   * detailed AI argument they should already know it is a developing layer over
   * the same engine, not a second opinion about mechanics. Every row carries a
   * status badge, and the two `dev` rows are the same badge the status table
   * uses, so nothing here can read as shipped by accident.
   */
  const modes = [
    { id: 'basic', tone: 'today', badge: 'landing.badgeToday', name: 'landing.modeBasicName', body: 'landing.modeBasicLine' },
    { id: 'edu', tone: 'dev', badge: 'landing.badgeDev', name: 'landing.modeEduName', body: 'landing.modeEduLine' },
    { id: 'pro', tone: 'dev', badge: 'landing.badgeDev', name: 'landing.modeProName', body: 'landing.modeProLine' },
    { id: 'ai', tone: 'dev', badge: 'landing.badgeDev', name: 'landing.modeAiName', body: 'landing.modeAiLine' },
  ];
</script>

<!--
  Ink, not paper. Adding the Basic section put three consecutive paper
  sections in a row (problem, what, basic), which read as one undifferentiated
  light stretch and lost the deck's alternation. Flipping this one restores it
  without touching either neighbour.
-->
<section class="sec sec--ink what reveal" data-section="what" id="what" aria-labelledby="what-title">
  <div class="wrap">
    <Eyebrow n="03" label={t('landing.ebWhat')} />
    <h2 id="what-title" class="display">{t('landing.whatH')}</h2>

    <div class="card-row cols-3">
      {#each cards as c}
        <article class="card">
          <p class="kicker">{t(c.k)}</p>
          <h3>{t(c.title)}</h3>
          <p>{t(c.body)}</p>
        </article>
      {/each}
    </div>

    <p class="what-access">{t('landing.whatAccess')}</p>

    <div class="modes" aria-labelledby="modes-title">
      <h3 id="modes-title" class="modes-title">{t('landing.modesTitle')}</h3>
      <p class="modes-lead">{t('landing.modesLead')}</p>
      <ul class="mode-list">
        {#each modes as m}
          <li class="mode-row" data-mode={m.id}>
            <span class="badge badge-{m.tone}">{t(m.badge)}</span>
            <p class="mode-name">{t(m.name)}</p>
            <p class="mode-body">{t(m.body)}</p>
          </li>
        {/each}
      </ul>
    </div>
  </div>
</section>
