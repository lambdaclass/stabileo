<script lang="ts">
  import { t, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import type { LineLayout } from '../../../lib/rc-sheets/beam-line';
  import type { BeamRow } from '../../../lib/rc-sheets/beam-row';
  import RcLineEditor from './RcLineEditor.svelte';
  import RcLineSvg from './RcLineSvg.svelte';
  import RcChecks from './RcChecks.svelte';
  import RcCombos from './RcCombos.svelte';
  import RcSteps from './RcSteps.svelte';
  import RcSectionSvg from './RcSectionSvg.svelte';
  import RcResize from './RcResize.svelte';
  import { beamSection } from '../../../lib/rc-sheets/drawing';
  import { groupsLabel, stirrupsLabel } from '../../../lib/rc-sheets/bars';

  let { line, spans, onleave = () => {} }: { line: LineLayout; spans: BeamRow[]; onleave?: () => void } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  let open = $state<string | null>(null);
  const MARKS_KEY = 'stabileo-rc-marks';
  let showMarks = $state((() => { try { return localStorage.getItem(MARKS_KEY) !== '0'; } catch { return true; } })());
  function setMarks(on: boolean) { showMarks = on; try { localStorage.setItem(MARKS_KEY, on ? '1' : '0'); } catch { /* lasts the session */ } }
  /** The marks of the bars a face has at x along the line. */
  const marksAt = (face: 'top' | 'bottom', x: number) => line.bars.filter((b) => b.face === face && b.from <= x + 1e-6 && b.to >= x - 1e-6).map((b) => b.mark);
  const kind = (k: string) => t(`rcSheets.line.kind.${k}`);
  /** The sections of every span, the identical ones drawn once with every place they stand. */
  const sections = $derived.by(() => {
    const out: Array<{ key: string; drawing: ReturnType<typeof beamSection>; notes: string[]; tags: string[]; title: string; marks: { top: string[]; bottom: string[] } }> = [];
    line.spanAdopted.forEach((sa, k) => {
      const sp = line.spans[k]!;
      const xStar = spans[k]?.demand.span.x ?? (sp.x1 - sp.x0) / 2;
      const places: Array<['start' | 'span' | 'end', string, number]> = [['start', 'i', sp.x0 + 1e-3], ['span', `x* = ${fmt(xStar)} m`, sp.x0 + xStar], ['end', 'j', sp.x1 - 1e-3]];
      for (const [sec, tag, x] of places) {
        const g = sa.at?.[sec] ?? { top: sa.top, bottom: sa.bottom };
        const notes = [`↑ ${groupsLabel(g.top)}`, `↓ ${groupsLabel(g.bottom)}`, stirrupsLabel(sa.stirrups)];
        const marks = { top: marksAt('top', x), bottom: marksAt('bottom', x) };
        // With the marks shown, the same bars by other marks are another section.
        const key = `${sp.b}×${sp.h}|${notes.join('|')}|${sa.stirrups.legs}${showMarks ? `|${marks.top.join()}|${marks.bottom.join()}` : ''}`;
        const same = out.find((q) => q.key === key);
        if (same) same.tags.push(`${sp.name} · ${tag}`);
        else out.push({ key, drawing: beamSection(sp.b, sp.h, line.cover, g.top, g.bottom, sa.stirrups), notes, tags: [`${sp.name} · ${tag}`], title: '', marks });
      }
    });
    for (const x of out) x.title = x.tags.length <= 2 ? x.tags.join(', ') : `${x.tags[0]} … ${x.tags[x.tags.length - 1]} (${x.tags.length})`;
    return out;
  });
</script>

<RcResize row={line} {spans} {onleave} />
<RcLineEditor {line} />
<label class="rcd-marks"><input type="checkbox" checked={showMarks} onchange={(e) => setMarks(e.currentTarget.checked)} data-testid="rc-marks-toggle" /> {t('rcSheets.line.showMarks')}</label>
<RcLineSvg {line} marks={showMarks} />
<h5 class="rcd-h">{t('rcSheets.sections')}</h5>
<div class="rcd-secs">
  {#each sections as g (g.key)}
    <RcSectionSvg drawing={g.drawing} title={g.title} notes={g.notes} marks={showMarks ? g.marks : undefined} />
  {/each}
</div>
<table class="rcd" data-testid="rc-schedule">
  <thead><tr><th>{t('rcSheets.line.mark')}</th><th>{t('rcSheets.line.kind')}</th><th>{t('rcSheets.col.bars')}</th><th class="n">{t('rcSheets.line.from')}</th><th class="n">{t('rcSheets.line.to')}</th><th class="n">{t('rcSheets.line.length')}</th><th class="n">kg</th></tr></thead>
  <tbody>
    {#each line.bars as b (b.mark)}
      <tr><td>{b.mark}</td><td>{kind(b.kind)} ({t(b.face === 'top' ? 'rcSheets.col.top' : 'rcSheets.col.bottom')})</td><td>{b.bars.count} Ø{b.bars.dia}{b.hooks[0] || b.hooks[1] ? ' ⌐' : ''}</td>
        <td class="n">{fmt(b.from)}</td><td class="n">{fmt(b.to)}</td><td class="n">{fmt(b.length)}</td><td class="n">{fmt(b.weight, 1)}</td></tr>
    {/each}
  </tbody>
</table>
<RcChecks lines={line.verifications} />
<details>
  <summary>{t('rcSheets.steps')}</summary>
  <RcSteps groups={line.steps} />
</details>
<h5 class="rcd-h">{t('rcSheets.line.spanChecks')}</h5>
{#each spans as s (s.key)}
  <div class="rcd-span st-{s.status}">
    <button type="button" class="rcd-toggle" onclick={() => (open = open === s.key ? null : s.key)} data-testid="rc-span-toggle">
      <strong>{s.name}</strong> <span>{t(`rcSheets.status.${s.status}`)}</span>
    </button>
    {#if open === s.key}
      <RcChecks lines={s.verifications} />
      <details open={s.status === 'fail'}>
        <summary>{t('rcSheets.combo.title')} ({s.combos.rows.length})</summary>
        <RcCombos table={s.combos} />
      </details>
      <details>
        <summary>{t('rcSheets.steps')}</summary>
        <RcSteps groups={s.steps} />
      </details>
    {/if}
  </div>
{/each}

<style>
  .rcd { width: 100%; border-collapse: collapse; font-size: 0.72rem; margin-bottom: 8px; }
  th { text-align: left; font-weight: 600; color: var(--st-text-2); padding: 3px 6px; border-bottom: 1px solid var(--st-hair); background: var(--st-surface-2); }
  td { padding: 2px 6px; border-bottom: 1px solid var(--st-hair); color: var(--st-text); }
  .n { text-align: right; font-family: var(--st-mono); }
  details { margin: 4px 0 8px; }
  summary { cursor: pointer; font-size: 0.72rem; font-weight: 600; color: var(--st-text-2); margin-bottom: 4px; }
  .rcd-h { margin: 8px 0 4px; font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--st-text-2); }
  .rcd-span { border: 1px solid var(--st-hair); border-radius: 6px; padding: 4px 8px; margin-bottom: 4px; }
  .rcd-toggle { background: none; border: none; color: var(--st-text); font-size: 0.74rem; cursor: pointer; display: flex; gap: 8px; padding: 2px 0; }
  .st-ok .rcd-toggle span { color: var(--st-ok); }
  .st-warn .rcd-toggle span { color: var(--st-warn); }
  .st-fail .rcd-toggle span { color: var(--st-danger); }
  .rcd-secs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
  .rcd-marks { display: inline-flex; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--st-text-2); margin: 2px 0 4px; cursor: pointer; }
</style>
