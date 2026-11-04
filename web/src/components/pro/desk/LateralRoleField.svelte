<script lang="ts">
  /**
   * The open member's role in the lateral-force-resisting system, declared on the desk: part of
   * it, not part of it, or not declared (`model/lateral-system.ts`). Shows what the design reads
   * now and why, since a beam that declares nothing is designed as part of the system (§9.7.3.8.2:
   * its bottom bars develop fy at the face). A beam of a physical element declares the element;
   * every piece of its span goes with it.
   */
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { verificationStore } from '../../../lib/store/verification.svelte';
  import { lateralReadingFor, setMemberLateral } from '../../../lib/store/lateral-system';
  import { withSpanPieces } from '../../../lib/store/design-spans-store';
  import { lateralReadingKey } from '../../../lib/engine/design/lateral-anchorage-row';
  import type { LateralRole } from '../../../lib/model/lateral-system';

  let { elementId }: { elementId: number } = $props();
  const reading = $derived.by(() => { void modelStore.designData; void modelStore.model.groups; return lateralReadingFor(elementId); });
  /** The member's own (or its physical element's) declaration; the beams' default is not the member's. */
  const own = $derived(reading.source === 'member' || reading.source === 'physical' ? reading.role : '');
  function declare(v: string) {
    const ids = withSpanPieces([elementId], (x) => verificationStore.contextFor(x));
    setMemberLateral(ids, v === 'lateral' || v === 'gravity' ? (v as LateralRole) : null);
  }
</script>

<section class="lr" data-testid="desk-lateral">
  <label class="lr-row">{t('lateral.symbol')}
    <select value={own} onchange={(e) => declare(e.currentTarget.value)} data-testid="desk-lateral-role">
      <option value="">{reading.source === 'project' ? tp('lateral.option.project', { role: t(`lateral.role.${reading.role}`) }) : t('lateral.option.undeclared')}</option>
      <option value="lateral">{t('lateral.option.lateral')}</option>
      <option value="gravity">{t('lateral.option.gravity')}</option>
    </select>
  </label>
  <p class="lr-hint" class:lr-warn={reading.role === 'undeclared'} data-testid="desk-lateral-reading">{t(lateralReadingKey(reading))}</p>
</section>

<style>
  .lr { border-top: 1px solid var(--st-hair); padding-top: 6px; }
  .lr-row { display: flex; align-items: center; gap: 6px; font-size: 0.7rem; color: var(--st-text-2); }
  .lr-row select { font-size: 0.68rem; padding: 1px 4px; border: 1px solid var(--st-hair-strong); border-radius: 4px; background: var(--st-surface); color: var(--st-text); }
  .lr-hint { margin: 4px 0 0; font-size: 0.68rem; color: var(--st-text-3); }
  .lr-warn { color: var(--st-warn); }
</style>
