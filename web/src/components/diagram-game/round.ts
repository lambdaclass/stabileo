import { drawVariant, rng, seedFrom } from '../edu/exercise-params';
import { resolveGameModel, solveGame, type GameModel, type Solved } from './game-model';
import { apparentGap, diagramOf, isEmpty, type Diagram, type DiagramKind } from './traces';
import type { GameModel as Model } from './game-model';
import { isPhysical, mutate, mutateModel, PHYSICAL_TAGS, type Tag } from './mutations';
import { LEVELS, type Level, type Template } from './levels';

export interface Option {
  diagram: Diagram;
  /** The structure this option shows, in a round that asks which structure a diagram belongs to. */
  model?: GameModel;
  /** Why it is wrong; null on a correct option. */
  tag: Tag | null;
}

export type RoundType = 'pick' | 'odd' | 'which';

export interface Round {
  type: RoundType;
  level: number;
  seed: number;
  template: string;
  model: GameModel;
  /** The diagram asked for in a pick round, or the one shown in a which round; null when each option is a different one. */
  kind: DiagramKind | null;
  /** The diagram a which round shows, drawn on the bare members. */
  shown?: Diagram;
  options: Option[];
  /** The option to choose: the correct diagram, the inconsistent one, or the structure the diagram belongs to. */
  answer: number;
}

const ATTEMPTS = 40;
/** Changes a structure drawing cannot show: arrows are drawn one size whatever the load, so a rescaled load looks the same. */
const UNSEEN_IN_DRAWING: Tag[] = ['loadScaled', 'rollerTurned'];

function shuffle<T>(items: T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Each tag is tried twice, since a mutation drawn again can land somewhere else; `late` ones only after the rest. */
function tagOrder(tags: Tag[], next: () => number, late: Tag[] = []): Tag[] {
  const early = tags.filter((t) => !late.includes(t)), last = tags.filter((t) => late.includes(t));
  return [...shuffle(early, next), ...shuffle(early, next), ...shuffle(last, next), ...shuffle(last, next)];
}

/** Whether two options read as different shapes to an eye that ignores sign conventions. */
export function distinct(a: Diagram, b: Diagram, m: Model, level: Level): boolean {
  const g = apparentGap(a, b, m);
  return g.rms >= level.minGap && g.max >= level.minPeak;
}

/** Distractors for `kind`, each distinct from the correct one and from every other picked. */
export function distractors(solved: Solved, kind: DiagramKind, level: Level, count: number, next: () => number, tags: Tag[] = level.tags): Option[] {
  const correct = diagramOf(solved, kind);
  const m = solved.model;
  const accepted: Option[] = [];
  for (const tag of tagOrder(tags, next, level.late)) {
    if (accepted.length === count) break;
    const d = mutate(tag, { solved, correct, kind, next });
    if (!d || isEmpty(d)) continue;
    if (!distinct(d, correct, m, level)) continue;
    if (accepted.some((o) => !distinct(o.diagram, d, m, level))) continue;
    accepted.push({ diagram: d, tag });
  }
  return accepted;
}

/** Other structures, each giving a `kind` diagram that tells apart from the correct one and from the rest. */
export function otherStructures(solved: Solved, kind: DiagramKind, level: Level, count: number, next: () => number): Option[] {
  const correct = diagramOf(solved, kind);
  const m = solved.model;
  const tags = [...new Set([...level.tags.filter(isPhysical), ...PHYSICAL_TAGS])].filter((t) => !UNSEEN_IN_DRAWING.includes(t));
  const accepted: Option[] = [];
  for (const tag of tagOrder(tags, next)) {
    if (accepted.length === count) break;
    if (!isPhysical(tag)) continue;
    const model = mutateModel(tag, m, next);
    const s = model && solveGame(model);
    if (!s) continue;
    const d = diagramOf(s, kind);
    if (isEmpty(d) || !distinct(d, correct, m, level)) continue;
    if (accepted.some((o) => !distinct(o.diagram, d, m, level))) continue;
    accepted.push({ diagram: d, model, tag });
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
  const base = { level: levelIndex, seed, template: template.id, model };
  const roll = next();
  if (kinds.length >= 3 && roll < level.oddShare) {
    const shown = shuffle(kinds, next).slice(0, Math.min(level.options, kinds.length)).sort((a, b) => 'NVMD'.indexOf(a) - 'NVMD'.indexOf(b));
    const wrong = Math.floor(next() * shown.length);
    const [bad] = distractors(solved, shown[wrong]!, level, 1, next, level.tags.filter((t) => t !== 'wrongKind'));
    if (!bad) return null;
    const options = shown.map((k, i): Option => (i === wrong ? bad : { diagram: diagramOf(solved, k), tag: null }));
    return { ...base, type: 'odd', kind: null, options, answer: wrong };
  }
  const kind = kinds[Math.floor(next() * kinds.length)]!;
  if (roll < level.oddShare + level.whichShare) {
    const others = otherStructures(solved, kind, level, level.options - 1, next);
    if (others.length < level.options - 1) return null;
    const correct = diagramOf(solved, kind);
    const options = shuffle([{ diagram: correct, model, tag: null }, ...others], next);
    return { ...base, type: 'which', kind, shown: correct, options, answer: options.findIndex((o) => o.tag === null) };
  }
  const wrong = distractors(solved, kind, level, level.options - 1, next);
  if (wrong.length < level.options - 1) return null;
  const options = shuffle([{ diagram: diagramOf(solved, kind), tag: null }, ...wrong], next);
  return { ...base, type: 'pick', kind, options, answer: options.findIndex((o) => o.tag === null) };
}

/** Deterministic per (level, seed): a seed whose draw cannot make distinct options moves on to a derived one. */
export function buildRound(levelIndex: number, seed: number): Round {
  for (let k = 0; k < ATTEMPTS; k++) {
    const round = attempt(levelIndex, k === 0 ? seed >>> 0 : seedFrom(`${seed}:${k}`));
    if (round) return { ...round, seed };
  }
  throw new Error(`no round for level ${levelIndex + 1} from seed ${seed}`);
}

/** A round for play: a seed that cannot make one moves on to derived seeds, then to the levels below, so Next never fails. */
export function dealRound(levelIndex: number, seed: number, build: (level: number, seed: number) => Round = buildRound): Round {
  for (let level = levelIndex; level >= 0; level--) {
    for (let k = 0; k < 8; k++) {
      try {
        return build(level, k === 0 ? seed : seedFrom(`${seed}:deal:${k}`));
      } catch {
        continue;
      }
    }
  }
  throw new Error(`no round from seed ${seed}`);
}
