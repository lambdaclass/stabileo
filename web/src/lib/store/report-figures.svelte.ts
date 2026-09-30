/**
 * The figures chosen for the report, in order: captures of the viewport with their caption and
 * colour scale (`lib/export/figure.ts`). Kept for the session, not in the project file: they are
 * pictures of a moment of it, and a stale one would be a picture of another model.
 */
import type { ReportFigure } from '../engine/report/project-sections';

function createReportFigures() {
  let list = $state<Array<ReportFigure & { id: number }>>([]);
  let next = 1;
  return {
    get list() { return list; },
    add(f: ReportFigure) { list = [...list, { ...f, id: next++ }]; },
    remove(id: number) { list = list.filter((f) => f.id !== id); },
    caption(id: number, caption: string) { list = list.map((f) => (f.id === id ? { ...f, caption } : f)); },
    move(id: number, by: -1 | 1) {
      const i = list.findIndex((f) => f.id === id), j = i + by;
      if (i < 0 || j < 0 || j >= list.length) return;
      const next2 = [...list];
      [next2[i], next2[j]] = [next2[j]!, next2[i]!];
      list = next2;
    },
    clear() { list = []; },
  };
}

export const reportFigures = createReportFigures();
