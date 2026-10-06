<script lang="ts">
  import { plainNumber } from '../../../lib/utils/units';
  /**
   * The live properties of a drawn section, and a row per part.
   *
   * Each value says what it is when it is not the plain geometric property: transformed when the
   * section mixes materials, summed per piece when the parts are not joined. A value the analysis
   * does not give is a dash with the reason in its title, never a zero.
   */
  import { t } from '../../../lib/i18n';
  import type { DrawnProperties } from '../../../lib/section/drawn-properties';

  const { values: p }: { values: DrawnProperties } = $props();

  /** A value that rounds to zero prints as 0, not as -0. */
  const f = (v: number | null | undefined, scale: number, d = 2) => {
    if (v == null || !Number.isFinite(v)) return '—';
    const x = v * scale;
    return plainNumber(x, d);
  };
  const CM2 = 1e4, CM3 = 1e6, CM4 = 1e8, CM6 = 1e12;
  const deg = (r: number) => f((r * 180) / Math.PI, 1, 1);
  const rows = $derived<Array<{ k: string; v: string; u: string; note?: string; id: string }>>([
    { id: 'a', k: 'A', v: f(p.a, CM2), u: 'cm²' },
    { id: 'iy', k: 'Iy', v: f(p.iy, CM4), u: 'cm⁴' },
    { id: 'iz', k: 'Iz', v: f(p.iz, CM4), u: 'cm⁴' },
    { id: 'iyz', k: 'Iyz', v: f(p.iyz, CM4), u: 'cm⁴' },
    { id: 'i1', k: 'I₁', v: f(p.i1, CM4), u: 'cm⁴' },
    { id: 'i2', k: 'I₂', v: f(p.i2, CM4), u: 'cm⁴' },
    { id: 'theta', k: 'θ', v: deg(p.thetaP), u: '°' },
    { id: 'g', k: 'yG, zG', v: `${f(p.yc, 1000, 1)}, ${f(p.zc, 1000, 1)}`, u: 'mm' },
    { id: 'stop', k: t('drawn.sTop'), v: f(p.sTop, CM3), u: 'cm³' },
    { id: 'sbot', k: t('drawn.sBot'), v: f(p.sBot, CM3), u: 'cm³' },
    { id: 'sleft', k: t('drawn.sLeft'), v: f(p.sLeft, CM3), u: 'cm³' },
    { id: 'sright', k: t('drawn.sRight'), v: f(p.sRight, CM3), u: 'cm³' },
    { id: 'zy', k: 'Zy', v: f(p.zy, CM3), u: 'cm³', note: p.zy == null ? t(p.composite ? 'drawn.noPlastic' : 'drawn.notComputed') : undefined },
    { id: 'zz', k: 'Zz', v: f(p.zz, CM3), u: 'cm³', note: p.zz == null ? t(p.composite ? 'drawn.noPlastic' : 'drawn.notComputed') : undefined },
    { id: 'j', k: 'J', v: f(p.j, CM4, 3), u: 'cm⁴', note: p.jBasis === 'homogenised' ? t('drawn.jHomogenised') : p.pieces > 1 ? t('drawn.jSummed') : undefined },
    { id: 'cw', k: 'Cw', v: f(p.cw, CM6, 0), u: 'cm⁶', note: p.cw == null ? t('drawn.noCw') : undefined },
    { id: 'asy', k: 'As,y', v: f(p.shearAreas?.asY, CM2), u: 'cm²', note: p.shearAreas ? undefined : t('drawn.noShear') },
    { id: 'asz', k: 'As,z', v: f(p.shearAreas?.asZ, CM2), u: 'cm²', note: p.shearAreas ? undefined : t('drawn.noShear') },
    { id: 'sc', k: 'yS, zS', v: p.shearCentre ? `${f(p.shearCentre[0], 1000, 1)}, ${f(p.shearCentre[1], 1000, 1)}` : '—', u: 'mm', note: p.shearCentre ? undefined : t('drawn.noShear') },
    { id: 'weight', k: t('drawn.weight'), v: f(p.massPerM == null ? null : (p.massPerM * 9.80665) / 1000, 1, 3), u: 'kN/m' },
    { id: 'mass', k: t('drawn.mass'), v: f(p.massPerM, 1, 1), u: 'kg/m', note: t('drawn.massNote') },
  ]);
</script>

<div class="props" data-testid="drawn-props">
  {#if p.composite}<p class="note" data-testid="drawn-composite-note">{t('drawn.transformedNote')}</p>{/if}
  {#if p.pieces > 1}<p class="note">{t('drawn.piecesNote').replace('{n}', String(p.pieces))}</p>{/if}
  <table>
    <tbody>
      {#each rows as r (r.id)}
        <tr data-testid="drawn-prop-{r.id}" title={r.note ?? ''}>
          <th>{r.k}</th><td>{r.v}</td><td class="u">{r.u}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <details>
    <summary>{t('drawn.perPart')}</summary>
    <table class="parts" data-testid="drawn-part-table">
      <thead><tr><th>#</th><th>A cm²</th><th>yG mm</th><th>zG mm</th><th>Iy cm⁴</th><th>Iz cm⁴</th><th>n</th></tr></thead>
      <tbody>
        {#each p.parts as r (r.id)}
          <tr class:void={r.void}>
            <td>{r.id}{r.void ? ' ○' : ''}</td><td>{f(r.a, CM2)}</td><td>{f(r.yc, 1000, 1)}</td><td>{f(r.zc, 1000, 1)}</td>
            <td>{f(r.iy, CM4)}</td><td>{f(r.iz, CM4)}</td><td>{r.n.toFixed(2)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </details>
</div>

<style>
  .props { font-size: 0.7rem; color: var(--st-text-2); }
  table { border-collapse: collapse; width: 100%; }
  th { text-align: left; font-weight: normal; color: var(--st-text-3); padding: 1px 4px 1px 0; white-space: nowrap; }
  td { text-align: right; font-family: var(--st-mono, monospace); color: var(--st-text); padding: 1px 0 1px 4px; }
  td.u { text-align: left; color: var(--st-text-3); font-family: inherit; }
  .parts th, .parts td { text-align: right; padding: 1px 3px; }
  tr.void td { color: var(--st-text-3); }
  .note { margin: 0 0 4px; font-size: 0.66rem; color: var(--st-text-3); line-height: 1.35; }
  summary { cursor: pointer; padding: 4px 0; }
</style>
