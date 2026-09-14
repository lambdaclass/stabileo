<script lang="ts">
  /**
   * Millimetres, with anything below the printed resolution shown as zero.
   *
   * A doubly symmetric section resolves to a centroid at the origin, but the geometry engine
   * returns it as a value a few nanometres off, and `(-1e-9).toFixed(1)` prints «-0.0». That
   * reads as a measured offset with a direction, which is the one thing it is not.
   */
  function mm(metres: number): string {
    const v = metres * 1000;
    return (Math.abs(v) < 0.05 ? 0 : v).toFixed(1);
  }

  /**
   * The full data sheet for one section.
   *
   * Renders `sectionDataSheet()` and holds no logic of its own — every decision about what is
   * available, what is derived and what is missing was made in the pure module, which is where
   * the tests are. This file's only job is that **no number appears without its provenance**.
   *
   * That is the rule the whole layout is built around. A section modulus read from a published
   * table and one inverted from an inertia are both correct and are not the same fact, and a
   * sheet that showed them identically would be inviting the reader to treat them as one.
   */
  import { t } from '../../../lib/i18n';
  import type { SectionDataSheet } from '../../../lib/section/data-sheet';
  import type { Quantity } from '../../../lib/profiles/properties';

  interface Props {
    sheet: SectionDataSheet;
  }
  const { sheet }: Props = $props();

  const UNIT: Record<Quantity['unit'], string> = {
    cm2: 'cm²', cm3: 'cm³', cm4: 'cm⁴', cm: 'cm', mm: 'mm', 'kg/m': 'kg/m',
  };

  /**
   * Significant figures, not a fixed decimal count.
   *
   * An inertia runs to six digits and a radius of gyration to two: `toFixed(2)` on the first
   * is noise and `toFixed(0)` on the second is a lie. Same rule the generator's profile panel
   * uses, so the two surfaces cannot disagree about how a number reads.
   */
  function show(q: Quantity): string {
    if (q.value === null) return '—';
    const v = Math.abs(q.value);
    const d = v >= 1000 ? 0 : v >= 100 ? 1 : v >= 10 ? 2 : 3;
    return `${q.value.toFixed(d)} ${UNIT[q.unit]}`;
  }

  const withValue = $derived(sheet.rows.filter((r) => r.quantity.value !== null));
</script>

<div class="sheet" data-testid="section-sheet">
  <section>
    <h4>{t('section.sheet.identity')}</h4>
    <dl>
      <dt>{t('section.sheet.designation')}</dt>
      <dd data-testid="sheet-designation">{sheet.identity.designation}</dd>
      <dt>{t('section.sheet.family')}</dt><dd>{sheet.identity.family}</dd>
      <!-- Dimensional standard, and it is labelled as one. The distinction from a design code
           is the whole reason `section-catalog.ts` exists. -->
      <dt>{t('section.sheet.standard')}</dt>
      <dd data-testid="sheet-standard">{sheet.identity.standard}</dd>
      {#if sheet.identity.standardsBody}
        <dt>{t('section.sheet.standardsBody')}</dt><dd>{sheet.identity.standardsBody}</dd>
      {/if}
      {#if sheet.identity.country}
        <dt>{t('section.sheet.country')}</dt><dd>{sheet.identity.country}</dd>
      {/if}
      {#if sheet.identity.material}
        <dt>{t('section.sheet.material')}</dt>
        <dd data-testid="sheet-material">{t(`section.sheet.material.${sheet.identity.material}`)}</dd>
      {/if}
      {#if sheet.identity.series}
        <dt>{t('section.sheet.series')}</dt><dd>{sheet.identity.series}</dd>
      {/if}
    </dl>
  </section>

  <section>
    <h4>{t('section.sheet.centroid')}</h4>
    {#if sheet.centroid}
      <p class="mono" data-testid="sheet-centroid">
        y = {mm(sheet.centroid.yM)} mm · z = {mm(sheet.centroid.zM)} mm
      </p>
    {:else}
      <!-- Said out loud rather than left blank: h/2 is the centroid only for a doubly
           symmetric section, and the ones anyone looks up are the ones where it is not. -->
      <p class="note" data-testid="sheet-centroid-missing">{t('section.sheet.centroidUnavailable')}</p>
    {/if}
  </section>

  <section>
    <h4>{t('section.sheet.properties')}</h4>
    <table>
      <tbody>
        {#each withValue as row (row.key)}
          <tr data-testid={`sheet-row-${row.key}`}>
            <th scope="row">{t(row.labelKey)}</th>
            <td class="mono">{show(row.quantity)}</td>
            <!-- The provenance, on every row, always. -->
            <td class="basis" data-testid={`sheet-basis-${row.key}`}>
              {t(`section.sheet.basis.${row.quantity.basis}`)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  {#if sheet.unavailable.length > 0}
    <section>
      <h4>{t('section.sheet.unavailable')}</h4>
      <!-- Grouped, so the reader is not left to notice which of thirteen rows are blank. -->
      <ul data-testid="sheet-unavailable">
        {#each sheet.unavailable as row (row.key)}
          <li>
            {t(row.labelKey)}{#if row.quantity.noteKey} — {t(row.quantity.noteKey)}{/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section>
    <h4>{t('section.sheet.coldFormed')}</h4>
    {#if sheet.coldFormed.present}
      <dl data-testid="sheet-coldformed">
        <dt>{t('section.sheet.coldFormed.thickness')}</dt>
        <dd class="mono">{sheet.coldFormed.thicknessMm.toFixed(2)} mm</dd>
        <dt>{t('section.sheet.coldFormed.ixy')}</dt>
        <dd class="mono">{sheet.coldFormed.ixyCm4.toFixed(2)} cm⁴</dd>
        <dt>{t('section.sheet.coldFormed.principalAngle')}</dt>
        <dd class="mono">{sheet.coldFormed.principalAngleDeg.toFixed(2)}°</dd>
        <dt>{t('section.sheet.coldFormed.j')}</dt>
        <dd class="mono">{sheet.coldFormed.jCm4.toFixed(3)} cm⁴</dd>
      </dl>
      <p class="note">{t(`section.sheet.basis.${sheet.coldFormed.basis}`)}</p>
    {:else}
      <!-- Disabled with an explanation, which is what the brief asks for — and the reason
           distinguishes "does not apply" from "not catalogued". -->
      <p class="note" data-testid="sheet-coldformed-absent">{t(sheet.coldFormed.reasonKey)}</p>
    {/if}
  </section>

  {#if sheet.limitations.length > 0}
    <section>
      <h4>{t('section.sheet.limitations')}</h4>
      <ul data-testid="sheet-limitations">
        {#each sheet.limitations as l (l.key)}
          <li class={l.kind}>{t(l.key)}</li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .sheet { display: flex; flex-direction: column; gap: 10px; font-size: 0.72rem; }
  section { display: flex; flex-direction: column; gap: 4px; }
  h4 {
    margin: 0; font-size: 0.68rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.04em; color: var(--st-text-3);
  }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0; }
  dt { color: var(--st-text-2); }
  dd { margin: 0; color: var(--st-text); }
  table { width: 100%; border-collapse: collapse; }
  th[scope='row'] { text-align: left; font-weight: 400; color: var(--st-text-2); padding: 2px 0; }
  td { padding: 2px 0 2px 10px; color: var(--st-text); }
  .mono { font-family: var(--st-mono, monospace); }
  /* Provenance is present on every row and never competes with the value for attention. */
  .basis { color: var(--st-text-3); font-size: 0.65rem; white-space: nowrap; }
  .note { margin: 0; color: var(--st-text-2); line-height: 1.4; }
  ul { margin: 0; padding-left: 1.1em; color: var(--st-text-2); line-height: 1.4; }
  li.geometry { color: var(--st-warn); }
</style>
