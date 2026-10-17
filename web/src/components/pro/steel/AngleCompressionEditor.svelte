<script lang="ts">
  /**
   * Angles in compression: what CIRSOC 301 §E.5 and §E.6 need and the section cannot know.
   *
   * A single angle: how it is loaded at its ends — concentric, or E.5(a)/(b) connected through
   * the long or the short leg. A double angle: the spacing a of its intermediate connectors and
   * whether they are snug bolts (E.6.1) or welds / pretensioned bolts (E.6.2). Without them the
   * engine refuses the compression check by name. Writes `Element.angleCompression` for every
   * selected angle member; one Apply is one undo step.
   */
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { angleSection, type AngleCompressionInput } from '../../../lib/engine/steel/angle-section';

  let { ids }: { ids: readonly number[] } = $props();

  const angles = $derived(ids.map((id) => {
    const e = modelStore.elements.get(id);
    const s = e && modelStore.sections.get(e.sectionId);
    const a = s ? angleSection(s as never) : { kind: 'none' as const };
    return { id, kind: a.kind === 'angle' ? a.shape : null };
  }).filter((x) => x.kind !== null));
  const singles = $derived(angles.filter((a) => a.kind === 'L').map((a) => a.id));
  const doubles = $derived(angles.filter((a) => a.kind === '2L').map((a) => a.id));

  let endCondition = $state<string>('');
  let spacingMm = $state<number | null>(null);
  let connector = $state<'snugBolts' | 'welded' | ''>('');

  const CONDITIONS = ['concentric', 'e5aLong', 'e5aShort', 'e5bLong', 'e5bShort'] as const;

  function current(id: number): AngleCompressionInput | undefined {
    return modelStore.elements.get(id)?.angleCompression;
  }

  function apply() {
    modelStore.batch(() => {
      for (const id of singles) {
        if (endCondition) modelStore.updateElement(id, { angleCompression: { ...current(id), endCondition } });
      }
      for (const id of doubles) {
        const patch: AngleCompressionInput = { ...current(id) };
        if (spacingMm !== null && spacingMm > 0) patch.connectorSpacing = spacingMm / 1000;
        if (connector) patch.connector = connector;
        modelStore.updateElement(id, { angleCompression: patch });
      }
    });
  }

  function clear() {
    modelStore.batch(() => {
      for (const { id } of angles) modelStore.updateElement(id, { angleCompression: undefined });
    });
  }

  const summary = (id: number): string => {
    const c = current(id);
    if (!c) return t('steel.angle.notStated');
    const parts: string[] = [];
    if (c.endCondition) parts.push(t(`steel.angle.cond.${c.endCondition}`));
    if (c.connectorSpacing) parts.push(`a = ${(c.connectorSpacing * 1000).toFixed(0)} mm`);
    if (c.connector) parts.push(t(`steel.angle.conn.${c.connector}`));
    return parts.join(' · ') || t('steel.angle.notStated');
  };
</script>

{#if angles.length > 0}
  <div class="pk-card ang" data-testid="angle-editor">
    <h4 class="pk-heading">{t('steel.angle.title')}</h4>
    <p class="pk-hint">{t('steel.angle.hint')}</p>
    {#if singles.length > 0}
      <label class="pk-row">
        <span>{tp('steel.angle.singles', { n: singles.length })}</span>
        <select bind:value={endCondition} data-testid="angle-condition">
          <option value="">—</option>
          {#each CONDITIONS as c (c)}<option value={c}>{t(`steel.angle.cond.${c}`)}</option>{/each}
        </select>
      </label>
    {/if}
    {#if doubles.length > 0}
      <div class="pk-row">
        <span>{tp('steel.angle.doubles', { n: doubles.length })}</span>
        <input type="number" min="1" step="10" placeholder="a (mm)" bind:value={spacingMm} data-testid="angle-spacing" />
        <select bind:value={connector} data-testid="angle-connector">
          <option value="">—</option>
          <option value="snugBolts">{t('steel.angle.conn.snugBolts')}</option>
          <option value="welded">{t('steel.angle.conn.welded')}</option>
        </select>
      </div>
    {/if}
    <div class="pk-row">
      <button class="pk-btn pk-btn-primary" onclick={apply} data-testid="angle-apply">{t('steel.angle.apply')}</button>
      <button class="pk-btn" onclick={clear} data-testid="angle-clear">{t('steel.angle.clear')}</button>
    </div>
    <ul class="ang-list">
      {#each angles as a (a.id)}
        <li data-testid="angle-now-{a.id}">#{a.id} ({a.kind}): {summary(a.id)}</li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .ang-list { margin: 4px 0 0; padding-left: 16px; font-size: 0.62rem; }
  .ang select, .ang input { font-size: 0.65rem; }
  .ang input { width: 80px; }
</style>
