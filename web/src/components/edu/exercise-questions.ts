import type { ResolvedExerciseSpec } from './exercise-spec';
import type { SubmittedAnswer } from './exercise-submission';
import { exerciseBars, freeBodyKeys, freeBodyLabel, freeBodyUnit } from './free-body-step';
import { t } from '../../lib/i18n';

/** Every question an exercise asks, by answer key, so a blank attempt still counts against all of them. */
export function questionKeys(ex: ResolvedExerciseSpec): string[] {
  const keys: string[] = [];
  ex.supports.forEach((s, i) => { for (const dof of s.dofs) keys.push(`r:${i}:${dof}`); });
  if (ex.kinematicQuestion) {
    keys.push('k');
    if (ex.kinematicQuestion.classification === 'hyperstatic') keys.push('kd');
  }
  keys.push(...freeBodyKeys(exerciseBars(ex)));
  (ex.diagramShapeQuestions ?? []).forEach((_, i) => keys.push(`s:${i}`));
  ex.diagramQuestions.forEach((_, i) => keys.push(`d:${i}`));
  (ex.diagramSketchQuestions ?? []).forEach((_, i) => keys.push(`sk:${i}`));
  ex.characteristics.forEach((_, i) => keys.push(`c:${i}`));
  return keys;
}

/** The label a question carries in the exercise view, for a question the student never reached. */
export function questionLabel(ex: ResolvedExerciseSpec, key: string): string {
  const [kind, i, dof] = key.split(':');
  const n = Number(i);
  switch (kind) {
    case 'r': return `${ex.supports[n]?.label ?? ''} — ${dof}`;
    case 'k': return t('edu.kinematicQuestion');
    case 'kd': return t('edu.hyperstaticDegree');
    case 's': return `${t('edu.shapeQuestion')} — ${ex.diagramShapeQuestions?.[n]?.diagram ?? ''}`;
    case 'd': return ex.diagramQuestions[n]?.question ?? key;
    case 'sk': return `${t('edu.sketch.span')} ${ex.diagramSketchQuestions?.[n]?.diagram ?? ''}`;
    case 'c': return ex.characteristics[n]?.label ?? key;
    case 'fb': return freeBodyLabel(exerciseBars(ex), key);
    default: return key;
  }
}

const unitOf = (ex: ResolvedExerciseSpec, key: string): string | undefined => {
  const [kind, i, dof] = key.split(':');
  if (kind === 'r') return dof === 'M' ? 'kN·m' : 'kN';
  if (kind === 'd') return ex.diagramQuestions[Number(i)]?.unit;
  if (kind === 'c') return ex.characteristics[Number(i)]?.unit;
  if (kind === 'fb') return freeBodyUnit(key.endsWith(':M') ? 'M' : 'Fx');
  return undefined;
};

export function assignedAnswers(ex: ResolvedExerciseSpec, submitted: SubmittedAnswer[]): SubmittedAnswer[] {
  const given = new Map(submitted.map(row => [row.key, row]));
  return questionKeys(ex).map(key => ({
    answer: '', outcome: 'pending', ...given.get(key),
    key, label: questionLabel(ex, key), unit: unitOf(ex, key),
  }));
}
