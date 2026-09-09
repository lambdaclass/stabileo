<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';

  /**
   * Regulations, Argentina first and then outward.
   *
   * Every status below was read out of the repository, not estimated:
   *
   *   101  ROLE_CATALOG marks both the basis (combinations) and loads adapters
   *        VALIDATED for the 2025 edition.
   *   102  wind adapter VALIDATED for 2025; CAPABILITY-INDEX.md still lists
   *        flexible buildings and torsional cases 2 and 4 as pending, which is
   *        what the row's note points at.
   *   103  the seismic role is IMPLEMENTED_PROVISIONAL and covers the effective
   *        seismic weight (I §6.2) and the static-method height distribution
   *        (I §6.2.4.1). The coefficient C is an INPUT — see
   *        `SeismicInput.coefficient` in lib/engine/loads/load-plan.ts.
   *   201  the 2025 matrix gives verify AND generate to beam flexure/shear,
   *        column axial-flexure/biaxial, ties and bar regions. Slabs, walls and
   *        pad footings are designed too, reachable through
   *        FloorFamiliesPanel.svelte:91, and are IMPLEMENTED_PROVISIONAL
   *        because `deriveMaturity` promotes to VALIDATED only on an external
   *        benchmark.
   *   301  a member checker exists (lib/engine/codes/argentina/cirsoc301.ts,
   *        on the AISC 360 LRFD basis); the steel DESIGN role is not
   *        implemented, which is what "code-based design in development" means.
   */
  const cirsoc = [
    { code: 'CIRSOC 101', ed: '2025', tone: 'today', badge: 'landing.badgeToday', scope: 'landing.cir101Scope', body: 'landing.cir101Body', limit: 'landing.cir101Limit' },
    { code: 'CIRSOC 102', ed: '2025', tone: 'today', badge: 'landing.badgeToday', scope: 'landing.cir102Scope', body: 'landing.cir102Body', limit: 'landing.cir102Limit' },
    { code: 'CIRSOC 201', ed: '2025', tone: 'testing', badge: 'landing.badgeTesting', scope: 'landing.cir201Scope', body: 'landing.cir201Body', limit: 'landing.cir201Limit' },
    { code: 'CIRSOC 301', ed: '2018', tone: 'partial', badge: 'landing.badgePartial', scope: 'landing.cir301Scope', body: 'landing.cir301Body', limit: 'landing.cir301Limit' },
    { code: 'INPRES-CIRSOC 103', ed: 'I 2018 · II 2005', tone: 'dev', badge: 'landing.badgeDev', scope: 'landing.cir103Scope', body: 'landing.cir103Body', limit: 'landing.cir103Limit' },
  ];

  /**
   * Member checking beyond Argentina, grouped by the body that issues the code.
   *
   * A flat list of eight put AISC next to a Eurocode next to a masonry standard
   * with nothing to hang them on. Grouping is also what makes the roadmap
   * legible: checking already spans all of these, and it is code-based DESIGN
   * that is Argentina-first, then Europe, then the United States.
   */
  const families = [
    {
      region: 'landing.codesRegionUs',
      codes: [
        { code: 'AISC 360', key: 'landing.codeSteel' },
        { code: 'ACI 318', key: 'landing.codeRc' },
        { code: 'AISI S100', key: 'landing.codeCfs' },
        /*
         * Timber and masonry share a cell. They are the two least-reached
         * checkers here, and as separate cells they pushed the group to five,
         * which wrapped to a second row with three empty slots on desktop and
         * made the list read as longer than it is.
         */
        { code: 'NDS · TMS 402', key: 'landing.codeTimberMasonry' },
      ],
    },
    {
      region: 'landing.codesRegionEu',
      codes: [
        { code: 'EN 1993-1-1', key: 'landing.codeEcSteel' },
        { code: 'EN 1992-1-1', key: 'landing.codeEcConcrete' },
      ],
    },
  ];
</script>

<section class="sec sec--paper codes reveal" data-section="codes" id="codes" aria-labelledby="codes-title">
  <div class="wrap">
    <Eyebrow n="07" label={t('landing.ebCodes')} />
    <h2 id="codes-title" class="display">{t('landing.codesH')}</h2>
    <p class="lead">{t('landing.codesLead')}</p>
    <p class="cirsoc-intro">{t('landing.cirsocP')}</p>

    <ul class="cirsoc-list">
      {#each cirsoc as c}
        <li class="cirsoc-row" data-code={c.code}>
          <div class="cirsoc-id">
            <p class="cirsoc-name">{c.code}</p>
            <p class="cirsoc-ed">{c.ed}</p>
            <span class="badge badge-{c.tone}">{t(c.badge)}</span>
          </div>
          <div class="cirsoc-what">
            <h3>{t(c.scope)}</h3>
            <p>{t(c.body)}</p>
            <p class="cirsoc-limit">{t(c.limit)}</p>
          </div>
        </li>
      {/each}
    </ul>

    <div class="intl">
      <p class="kicker">{t('landing.codesIntlTitle')}</p>
      <p class="intl-lead">{t('landing.codesIntlLead')}</p>

      {#each families as f}
        <section class="intl-group" aria-labelledby="intl-{f.region}">
          <h3 id="intl-{f.region}" class="intl-region">{t(f.region)}</h3>
          <ul class="code-grid">
            {#each f.codes as c}
              <li class="code-cell">
                <p class="code-name">{c.code}</p>
                <p class="code-desc">{t(c.key)}</p>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  </div>
</section>
