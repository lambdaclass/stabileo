<script lang="ts">
  /**
   * The full data sheet for one material.
   *
   * Same rule as the section sheet: **no number without its authority.** Four different
   * authorities appear on one card and the distinction is the point — a strength from the
   * product standard the mill certifies against, an ordinary value for the alloy, a shear
   * modulus derived from two published numbers, and a field the source never published.
   *
   * And three different STANDARDS, which is the trap this layout exists to avoid. The product
   * standard fixes what the material is. The design codes say how to verify a member made of
   * it. The band standard is a third document again — every thickness band in this catalogue
   * comes from a design code's table, never from the product standard — so it is printed on the
   * band block and nowhere else.
   */
  import { t } from '../../../lib/i18n';
  import type { MaterialDataSheet } from '../../../lib/material/data-sheet';
  import type { GradePropertyRow } from '../../../lib/grades/catalogue';

  interface Props { sheet: MaterialDataSheet }
  const { sheet }: Props = $props();

  const UNIT: Record<GradePropertyRow['quantity']['unit'], string> = {
    MPa: 'MPa', GPa: 'GPa', 'kN/m3': 'kN/m³', '-': '',
  };

  function show(q: GradePropertyRow['quantity']): string {
    if (q.value === null) return '—';
    const v = Math.abs(q.value);
    const d = v >= 1000 ? 0 : v >= 100 ? 1 : v >= 10 ? 2 : 3;
    return `${q.value.toFixed(d)} ${UNIT[q.unit]}`.trim();
  }
</script>

<div class="sheet" data-testid="material-sheet">
  <section>
    <h4>{t('material.sheet.identity')}</h4>
    <dl>
      <dt>{t('material.sheet.designation')}</dt>
      <dd data-testid="msheet-designation">{sheet.identity.designation}</dd>
      {#if sheet.identity.family}
        <dt>{t('material.sheet.family')}</dt><dd>{sheet.identity.family}</dd>
      {/if}
      {#if sheet.identity.productStandard}
        <!-- Labelled as a PRODUCT standard. The design codes are a separate row below. -->
        <dt>{t('material.sheet.productStandard')}</dt>
        <dd data-testid="msheet-product-standard">{sheet.identity.productStandard}</dd>
      {/if}
      {#if sheet.identity.region}
        <dt>{t('material.sheet.region')}</dt><dd>{sheet.identity.region}</dd>
      {/if}
      {#if sheet.identity.designCodes.length > 0}
        <dt>{t('material.sheet.designCodes')}</dt>
        <dd data-testid="msheet-design-codes">{sheet.identity.designCodes.join(' · ')}</dd>
      {/if}
      <dt>{t('material.sheet.gradeId')}</dt>
      <dd class="mono" data-testid="msheet-grade-id">{sheet.identity.gradeId ?? '—'}</dd>
    </dl>
  </section>

  <section>
    <h4>{t('material.sheet.properties')}</h4>
    <table>
      <tbody>
        {#each sheet.rows as row (row.key)}
          <tr data-testid={`msheet-row-${row.key}`}>
            <th scope="row">{t(row.labelKey)}</th>
            <td class="mono">{show(row.quantity)}</td>
            <!-- The authority, on every row, always. -->
            <td class="basis" data-testid={`msheet-basis-${row.key}`}>
              {t(`material.sheet.basis.${row.quantity.basis}`)}
            </td>
          </tr>
          {#if row.quantity.noteKey}
            <tr class="why"><td colspan="3">{t(row.quantity.noteKey)}</td></tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </section>

  <section>
    <h4>{t('material.sheet.bands')}</h4>
    {#if sheet.bands.present}
      <!-- The standard that PUBLISHES the table, which is never the product standard. -->
      <p class="note" data-testid="msheet-band-standard">{sheet.bands.standard}</p>
      <table data-testid="msheet-bands">
        <tbody>
          {#each sheet.bands.rows as b (b.upToMm)}
            <tr>
              <th scope="row">&gt;{b.overMm} – {b.upToMm} mm</th>
              <td class="mono">fy {b.fy} MPa</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="note" data-testid="msheet-bands-absent">{t(sheet.bands.reasonKey)}</p>
    {/if}
  </section>

  {#if sheet.limitations.length > 0}
    <section>
      <h4>{t('material.sheet.limitations')}</h4>
      <ul data-testid="msheet-limitations">
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
  .basis { color: var(--st-text-3); font-size: 0.65rem; white-space: nowrap; }
  tr.why td { padding: 0 0 4px; color: var(--st-text-3); font-size: 0.64rem; line-height: 1.35; }
  .note { margin: 0; color: var(--st-text-2); line-height: 1.4; }
  ul { margin: 0; padding-left: 1.1em; color: var(--st-text-2); line-height: 1.4; }
  /* A material the app cannot classify is a different order of problem from a thin card. */
  li.classification { color: var(--st-warn); }
</style>
