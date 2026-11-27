import { withIfcGrid } from '../ifc/ifc-grid';
import type { MemoriaElement } from '../report/memoria/types';
import { rowBars, sheetsMemoriaElements } from '../rc-sheets-readers/memoria';
import { sheetsForDocuments } from './rc-sheets-reinforcement';
import { columnFixedPoints, sheetRowElements, sheetsIfcBars } from './rc-sheets-ifc';
import { rowsCode, sheetsSchedule } from './rc-sheets-schedule';

const IFC_BARS: Record<string, string> = {
  'rcSheets.col.bottom': 'bottom', 'rcSheets.col.top': 'top', 'rcSheets.col.stirrups': 'stirrups', 'rcSheets.col.bars': 'bars', 'rcSheets.col.ties': 'ties',
  'memo.rc.supportTop': 'top at supports', 'rcSheets.face.bottomX': 'bottom X', 'rcSheets.face.bottomY': 'bottom Y', 'rcSheets.face.topX': 'top X', 'rcSheets.face.topY': 'top Y',
};
const barsText = (r: Parameters<typeof rowBars>[0]) => rowBars(r).map(([k, v]) => `${IFC_BARS[k] ?? k}: ${v}`).join('; ');
function report(tr: Parameters<typeof sheetsMemoriaElements>[2], n2: (value: number) => string) {
  const sheets = sheetsForDocuments();
  if (!sheets) return null;
  return {
    elements: sheetsMemoriaElements(sheets, rowsCode(sheets), tr, n2),
    quantities: () => sheetsSchedule(sheets).byDiameter.map(row => ({ diameter: row.dia, length: row.length, mass: row.kg })),
  };
}

function ifc<T extends { fail: boolean; open: boolean }>(
  elements: readonly MemoriaElement[],
  state: Map<number, T>,
  stateOfMemo: (element: MemoriaElement) => T,
) {
  const sheets = sheetsForDocuments();
  if (!sheets) return null;
  const sheetEls = new Map(elements.filter((e) => e.id.startsWith('rc-')).map((e) => [e.id.slice(3), e]));
  const sheetOf = new Map<number, { row: string; bars: string }>();
  const rowsByKey = new Map<string, Parameters<typeof rowBars>[0]>([...sheets.beam, ...sheets.column].map((r) => [r.key, r]));
  for (const [key, ids] of sheetRowElements(sheets)) {
    const e = sheetEls.get(key), r = rowsByKey.get(key);
    if (!e || !r) continue;
    for (const id of ids) { if (!state.has(id)) state.set(id, stateOfMemo(e)); sheetOf.set(id, { row: e.name, bars: barsText(r) }); }
  }
  const sheetProps = (kind: 'slab' | 'wall', name: string): Record<string, string | number> => {
    const own = (kind === 'slab' ? sheets.slab : sheets.wall).filter((r) => r.name === name);
    const st = own.map((r) => sheetEls.get(r.key)).filter((e): e is MemoriaElement => !!e).map(stateOfMemo);
    if (!st.length) return {};
    return { Reinforcement: own.map((r) => `${r.level ? `${r.level}: ` : ''}${barsText(r)}`).join(' | '), DesignState: st.some((x) => x.fail) ? 'fails' : st.some((x) => x.open) ? 'not fully verified' : 'satisfies' };
  };
  return { members: sheetOf, surfaceProps: sheetProps, bars: () => sheetsIfcBars(sheets), mass: () => sheetsSchedule(sheets).total.kg };
}

export const sheetDocuments = { report, ifc, columnFixedPoints, withIfcGrid };
