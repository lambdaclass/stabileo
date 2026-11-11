import { t, tp } from '../../lib/i18n';
import type { AnswerSpec, ResolvedExerciseSpec } from './exercise-spec';
import { formatParam } from './exercise-variant';
import { barName, endElement, exerciseBars, parseFreeBodyKey } from './free-body-step';

const FORCES = ['moment', 'shear', 'axial'] as const;
const MEASURES = ['sigmaMax', 'sigmaMin', 'tauMax', 'vonMises'] as const;

export const EXPLAIN_KEYS = [
  'exam.explain.extremeMax',
  'exam.explain.extremeMin',
  ...FORCES.map((f) => `exam.force.${f}`),
  ...MEASURES.map((m) => `exam.measure.${m}`),
];

const force = (f: (typeof FORCES)[number]) => t(`exam.force.${f}`);
const where = (elements?: number[]) =>
  elements?.length ? tp('exam.explain.members', { list: elements.map((e) => e + 1).join(', ') }) : t('exam.explain.allMembers');
const position = (x: number) => `${formatParam(Math.round(x * 1000) / 10)} %`;

function describe(a: AnswerSpec): string {
  switch (a.kind) {
    case 'maxAbs': return tp('exam.explain.maxAbs', { force: force(a.force), where: where(a.elements) });
    case 'extreme': return tp(a.sign === 'max' ? 'exam.explain.extremeMax' : 'exam.explain.extremeMin', { force: force(a.force), where: where(a.elements) });
    case 'at': return tp('exam.explain.at', { force: force(a.force), member: a.element + 1, pos: position(a.t) });
    case 'scaled': return tp('exam.explain.scaled', { inner: describe(a.of), factor: formatParam(a.factor) });
    case 'literal': return t('exam.explain.literal');
    case 'stress': return tp('exam.explain.stress', { measure: t(`exam.measure.${a.measure}`), member: a.element + 1, pos: position(a.t) });
  }
}

/** How the right answer to one question comes out of the student's own structure, in a sentence. */
export function explainAnswer(ex: ResolvedExerciseSpec, key: string): string {
  const [kind, i, dof] = key.split(':');
  const n = Number(i);
  switch (kind) {
    case 'r': return tp('exam.explain.reaction', { support: ex.supports[n]?.label ?? '', dof: dof ?? '' });
    case 'k':
    case 'kd': {
      const k = ex.kinematicQuestion;
      const degree = k?.classification === 'hyperstatic' ? k.degree ?? 0 : 0;
      return tp('exam.explain.kinematic', { degree });
    }
    case 's': return tp('exam.explain.shape', { diagram: ex.diagramShapeQuestions?.[n]?.diagram ?? '' });
    case 'd': return ex.diagramQuestions[n] ? describe(ex.diagramQuestions[n]!.answer) : '';
    case 'c': return ex.characteristics[n] ? describe(ex.characteristics[n]!.answer) : '';
    case 'sk': {
      const q = ex.diagramSketchQuestions?.[n];
      return q ? tp('exam.explain.sketch', { diagram: q.diagram, member: (q.elementIndex ?? 0) + 1 }) : '';
    }
    case 'fb': {
      const k = parseFreeBodyKey(key);
      const bar = k && exerciseBars(ex)[k.bar];
      return k && bar ? tp('exam.explain.freeBody', { bar: barName(bar, k.bar), node: endElement(bar, k.end).node + 1, dof: k.dof }) : '';
    }
    default: return '';
  }
}
