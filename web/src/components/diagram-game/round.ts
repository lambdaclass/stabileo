import { drawVariant, rng, seedFrom } from '../edu/exercise-params';
import { resolveGameModel, solveGame, type GameModel, type Solved } from './game-model';
import { diagramOf, isEmpty, shapeDistance, type Diagram, type DiagramKind } from './traces';
import { mutate, type Tag } from './mutations';
import { LEVELS, type Level, type Template } from './levels';

export interface Option {
  diagram: Diagram;
  /** Why it is wrong; null on a correct diagram. */
  tag: Tag | null;
}

export interface Round {
  type: 'pick' | 'odd';
  level: number;
  seed: number;
  template: string;
  model: GameModel;
  /** The diagram asked for in a pick round; null when each option is a different one. */
  kind: DiagramKind | null;
  options: Option[];
  /** The option to choose: the correct diagram, or in an odd round the inconsistent one. */
  answer: number;
}

const ATTEMPTS = 40;
const SIGN_TAGS: Tag[] = ['signFlipped', 'loadFlipped'];

function shuffle<T>(items: T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Distractors for `kind`, each at least `minGap` away from the correct one and from every other picked. */
export function distractors(solved: Solved, kind: DiagramKind, level: Level, count: number, next: () => number): Option[] {
  const correct = diagramOf(solved, kind);
  const accepted: Option[] = [];
  const shuffled = shuffle(level.tags, next);
  const ordered = next() < 0.65 ? [...shuffled.filter((t) => !SIGN_TAGS.includes(t)), ...shuffled.filter((t) => SIGN_TAGS.includes(t))] : shuffled;
  for (const tag of ordered) {
    if (accepted.length === count) break;
    const d = mutate(tag, { solved, correct, kind, next });
    if (!d || isEmpty(d)) continue;
    if (shapeDistance(d, correct) < level.minGap) continue;
    if (accepted.some((o) => shapeDistance(o.diagram, d) < level.minGap)) continue;
    accepted.push({ diagram: d, tag });
  }
  return accepted;
}

function availableKinds(solved: Solved, template: Template, level: Level): DiagramKind[] {
  return template.kinds.filter((k) => level.kinds.includes(k) && !isEmpty(diagramOf(solved, k)));
}

function attempt(levelIndex: number, seed: number): Round | null {
  const level = LEVELS[levelIndex]!;
  const next = rng(seed);
  const template = level.templates[Math.floor(next() * level.templates.length)]!;
  const model = resolveGameModel(template.model, drawVariant(template.params, seedFrom(`${template.id}:${seed}`)));
  const solved = solveGame(model);
  if (!solved) return null;
  const kinds = availableKinds(solved, template, level);
  if (!kinds.length) return null;
  const odd = kinds.length >= 3 && next() < level.oddShare;
  if (odd) {
    const shown = shuffle(kinds, next).slice(0, 3).sort((a, b) => 'NVMD'.indexOf(a) - 'NVMD'.indexOf(b));
    const wrong = Math.floor(next() * shown.length);
    const [bad] = distractors(solved, shown[wrong]!, level, 1, next);
    if (!bad) return null;
    const options = shown.map((k, i): Option => (i === wrong ? bad : { diagram: diagramOf(solved, k), tag: null }));
    return { type: 'odd', level: levelIndex, seed, template: template.id, model, kind: null, options, answer: wrong };
  }
  const kind = kinds[Math.floor(next() * kinds.length)]!;
  const wrong = distractors(solved, kind, level, 2, next);
  if (wrong.length < 2) return null;
  const options = shuffle([{ diagram: diagramOf(solved, kind), tag: null }, ...wrong], next);
  return { type: 'pick', level: levelIndex, seed, template: template.id, model, kind, options, answer: options.findIndex((o) => o.tag === null) };
}

/** Deterministic per (level, seed): a seed whose draw cannot make three distinct options moves on to a derived one. */
export function buildRound(levelIndex: number, seed: number): Round {
  for (let k = 0; k < ATTEMPTS; k++) {
    const round = attempt(levelIndex, k === 0 ? seed >>> 0 : seedFrom(`${seed}:${k}`));
    if (round) return { ...round, seed };
  }
  throw new Error(`no round for level ${levelIndex + 1} from seed ${seed}`);
}
