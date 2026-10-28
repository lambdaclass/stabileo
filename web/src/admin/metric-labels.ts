import { t } from '../lib/i18n';
import type { UsageBreakdown } from '../lib/api/admin';

const ADVANCED: Record<string, string> = {
  cirsocFlex: 'flex.title',
  kinematic: 'advanced.kinematicAnalysis',
  despiece: 'advanced.despiece',
  stress: 'advanced.sectionAnalysis',
  pdelta: 'advanced.pdelta',
  buckling: 'advanced.buckling',
  modal: 'advanced.dynamic',
  plastic: 'advanced.plasticCollapse',
  trainLoad: 'advanced.trainLoad',
  influenceLine: 'advanced.influenceLine',
  whatif: 'advanced.whatIf',
  steps: 'steps.catalog.title',
};

function candidates(kind: UsageBreakdown, value: string): string[] {
  switch (kind) {
    case 'tools': return [`admin.metrics.v.tool.${value}`];
    case 'diagrams': return [`admin.metrics.v.diagram.${value}`];
    case 'advanced': return ADVANCED[value] ? [ADVANCED[value]] : [];
    case 'examples': return [`ex.${value}`];
    case 'step_methods': return [`steps.m.${value}.title`];
    case 'exports': return [`admin.metrics.v.export.${value}`];
    case 'gate_actions': return [`admin.metrics.v.gate.${value}`];
    case 'solve_outcomes': return [`admin.metrics.v.outcome.${value}`];
    case 'solve_dims': return [`admin.metrics.v.dim.${value}`];
    case 'modes': return [`admin.metrics.v.mode.${value}`];
    case 'locales': return [`lang.${value}`];
    case 'versions': return [];
  }
}

function humanize(value: string): string {
  const words = value.replace(/[-_.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : value;
}

/** The name a reader of the metrics recognises for a value the app sent. */
export function metricLabel(kind: UsageBreakdown, value: string): string {
  for (const key of candidates(kind, value)) {
    const text = t(key);
    if (text !== key) return text;
  }
  return kind === 'versions' ? value : humanize(value);
}
