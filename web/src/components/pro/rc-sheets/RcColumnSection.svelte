<script lang="ts">
  /** A column's section in the workspace: the drawing its sheets carry (`columnSectionOf`), with the bars, the ties and the crossties written under it. */
  import { t, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { columnLabel, crosstiesText, tieLabel, type ColumnRow } from '../../../lib/rc-sheets/column-row';
  import { columnSectionOf } from '../../../lib/rc-sheets/plans/column-elevation';
  import type { SheetCode } from '../../../lib/rc-sheets/types';
  import RcSectionSvg from './RcSectionSvg.svelte';

  let { row, all, code, endZones = false }: { row: ColumnRow; all: readonly ColumnRow[]; code: SheetCode; endZones?: boolean } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const drawing = $derived(columnSectionOf(row, all, { code, endZones }));
  const notes = $derived([
    columnLabel(row.adopted),
    `${tieLabel(row.adopted)} · ${t('rcSheets.col.crossties')} ${crosstiesText(row.checks.crossties)}`,
    ...(drawing.zone === 'lo' ? [t('rcSheets.sec.loTies')] : []),
    ...(drawing.crossties?.length ? [t('rcSheets.sec.alternate')] : []),
  ]);
</script>

<RcSectionSvg {drawing} title="{row.name} · {fmt(row.b * 100, 0)}×{fmt(row.h * 100, 0)}" {notes} />
