import type { ExerciseParams } from '../edu/exercise-params';
import type { GameTemplateModel } from './game-model';
import type { DiagramKind } from './traces';
import type { Tag } from './mutations';

export interface Template {
  id: string;
  params: ExerciseParams;
  model: GameTemplateModel;
  kinds: DiagramKind[];
}

export interface Level {
  templates: Template[];
  kinds: DiagramKind[];
  tags: Tag[];
  /** Smallest normalised RMS gap between any two options; lower is subtler. */
  minGap: number;
  /** Smallest widest gap at any station between any two options, so no two read as the same shape. */
  minPeak: number;
  /** Tags tried only once the rest are spent: blunt traps that should stay rare where the level is about subtler ones. */
  late?: Tag[];
  /** Share of rounds that show N, V, M and D of one structure and ask for the inconsistent one. */
  oddShare: number;
  /** Share of rounds that show one diagram and ask which of several structures it belongs to. */
  whichShare: number;
  options: 3 | 4;
}

const span = { min: 4, max: 8, step: 1 };
const force = { min: 10, max: 40, step: 5 };
const line = { min: 5, max: 20, step: 5 };
const share = { min: 0.25, max: 0.75, step: 0.05 };

const ssPoint: Template = {
  id: 'ss-point',
  params: { values: { L: span, f: share, P: force } },
  model: { nodes: [[0, 0], ['L', 0]], elements: [[0, 1]], supports: [{ node: 0, type: 'pinned' }, { node: 1, type: 'rollerX' }], pointLoads: [{ element: 0, a: 'f*L', p: '-P' }] },
  kinds: ['V', 'M', 'D'],
};
const cantileverTip: Template = {
  id: 'cantilever-tip',
  params: { values: { L: { min: 2, max: 5, step: 0.5 }, P: force } },
  model: { nodes: [[0, 0], ['L', 0]], elements: [[0, 1]], supports: [{ node: 0, type: 'fixed' }], nodalLoads: [{ node: 1, fy: '-P' }] },
  kinds: ['V', 'M', 'D'],
};
const cantileverRight: Template = {
  id: 'cantilever-right',
  params: { values: { L: { min: 2, max: 5, step: 0.5 }, f: { min: 0.1, max: 0.5, step: 0.05 }, P: force } },
  model: { nodes: [[0, 0], ['L', 0]], elements: [[0, 1]], supports: [{ node: 1, type: 'fixed' }], pointLoads: [{ element: 0, a: 'f*L', p: '-P' }] },
  kinds: ['V', 'M', 'D'],
};
const ssUniform: Template = {
  id: 'ss-uniform',
  params: { values: { L: span, q: line } },
  model: { nodes: [[0, 0], ['L', 0]], elements: [[0, 1]], supports: [{ node: 0, type: 'pinned' }, { node: 1, type: 'rollerX' }], distributedLoads: [{ element: 0, qI: '-q' }] },
  kinds: ['V', 'M', 'D'],
};
const cantileverUniform: Template = {
  id: 'cantilever-uniform',
  params: { values: { L: { min: 2, max: 5, step: 0.5 }, q: line } },
  model: { nodes: [[0, 0], ['L', 0]], elements: [[0, 1]], supports: [{ node: 0, type: 'fixed' }], distributedLoads: [{ element: 0, qI: '-q' }] },
  kinds: ['V', 'M', 'D'],
};
const overhang: Template = {
  id: 'overhang',
  params: { values: { L: span, c: { min: 1.5, max: 2.5, step: 0.5 }, q: line } },
  model: {
    nodes: [[0, 0], ['L', 0], ['L+c', 0]], elements: [[0, 1], [1, 2]],
    supports: [{ node: 0, type: 'pinned' }, { node: 1, type: 'rollerX' }],
    distributedLoads: [{ element: 0, qI: '-q' }, { element: 1, qI: '-q' }],
  },
  kinds: ['V', 'M', 'D'],
};
const overhangTip: Template = {
  id: 'overhang-tip',
  params: { values: { L: span, c: { min: 1.5, max: 2.5, step: 0.5 }, P: force } },
  model: { nodes: [[0, 0], ['L', 0], ['L+c', 0]], elements: [[0, 1], [1, 2]], supports: [{ node: 0, type: 'pinned' }, { node: 1, type: 'rollerX' }], nodalLoads: [{ node: 2, fy: '-P' }] },
  kinds: ['V', 'M', 'D'],
};
const ssCouple: Template = {
  id: 'ss-couple',
  params: { values: { L: span, f: { min: 0.3, max: 0.7, step: 0.1 }, C: { min: 10, max: 40, step: 10 } } },
  model: { nodes: [[0, 0], ['f*L', 0], ['L', 0]], elements: [[0, 1], [1, 2]], supports: [{ node: 0, type: 'pinned' }, { node: 2, type: 'rollerX' }], nodalLoads: [{ node: 1, mz: 'C' }] },
  kinds: ['V', 'M', 'D'],
};
const ssTriangular: Template = {
  id: 'ss-triangular',
  params: { values: { L: span, q: line } },
  model: { nodes: [[0, 0], ['L', 0]], elements: [[0, 1]], supports: [{ node: 0, type: 'pinned' }, { node: 1, type: 'rollerX' }], distributedLoads: [{ element: 0, qI: 0, qJ: '-q' }] },
  kinds: ['V', 'M', 'D'],
};
const cantileverTriangular: Template = {
  id: 'cantilever-triangular',
  params: { values: { L: { min: 2, max: 5, step: 0.5 }, q: line } },
  model: { nodes: [[0, 0], ['L', 0]], elements: [[0, 1]], supports: [{ node: 0, type: 'fixed' }], distributedLoads: [{ element: 0, qI: '-q', qJ: 0 }] },
  kinds: ['V', 'M', 'D'],
};
const ssCombined: Template = {
  id: 'ss-combined',
  params: { values: { L: span, f: share, P: force, q: line } },
  model: { nodes: [[0, 0], ['L', 0]], elements: [[0, 1]], supports: [{ node: 0, type: 'pinned' }, { node: 1, type: 'rollerX' }], distributedLoads: [{ element: 0, qI: '-q' }], pointLoads: [{ element: 0, a: 'f*L', p: '-P' }] },
  kinds: ['V', 'M', 'D'],
};
const cantileverCouple: Template = {
  id: 'cantilever-couple',
  params: { values: { L: { min: 2, max: 5, step: 0.5 }, P: force, C: { min: 20, max: 60, step: 10 } } },
  model: { nodes: [[0, 0], ['L', 0]], elements: [[0, 1]], supports: [{ node: 0, type: 'fixed' }], nodalLoads: [{ node: 1, fy: '-P', mz: '-C' }] },
  kinds: ['V', 'M', 'D'],
};
const gerber: Template = {
  id: 'gerber',
  params: { values: { L: span, b: { min: 2, max: 4, step: 0.5 }, q: line } },
  model: {
    nodes: [[0, 0], ['L', 0], ['L+b', 0]], elements: [[0, 1], [1, 2]], nodeHinges: [1],
    supports: [{ node: 0, type: 'fixed' }, { node: 2, type: 'rollerX' }],
    distributedLoads: [{ element: 0, qI: '-q' }, { element: 1, qI: '-q' }],
  },
  kinds: ['V', 'M', 'D'],
};
const gerberOverhang: Template = {
  id: 'gerber-overhang',
  params: { values: { L: span, c: { min: 1, max: 2, step: 0.5 }, b: { min: 3, max: 5, step: 1 }, q: line } },
  model: {
    nodes: [[0, 0], ['L', 0], ['L+c', 0], ['L+c+b', 0]], elements: [[0, 1], [1, 2], [2, 3]], nodeHinges: [2],
    supports: [{ node: 0, type: 'pinned' }, { node: 1, type: 'rollerX' }, { node: 3, type: 'rollerX' }],
    distributedLoads: [{ element: 0, qI: '-q' }, { element: 1, qI: '-q' }, { element: 2, qI: '-q' }],
  },
  kinds: ['V', 'M', 'D'],
};
const continuous: Template = {
  id: 'continuous',
  params: { values: { L: span, R: span, q: line, w: line } },
  model: {
    nodes: [[0, 0], ['L', 0], ['L+R', 0]], elements: [[0, 1], [1, 2]],
    supports: [{ node: 0, type: 'pinned' }, { node: 1, type: 'rollerX' }, { node: 2, type: 'rollerX' }],
    distributedLoads: [{ element: 0, qI: '-q' }, { element: 1, qI: '-w' }],
  },
  kinds: ['V', 'M', 'D'],
};
const propped: Template = {
  id: 'propped',
  params: { values: { L: span, f: share, P: force } },
  model: { nodes: [[0, 0], ['L', 0]], elements: [[0, 1]], supports: [{ node: 0, type: 'fixed' }, { node: 1, type: 'rollerX' }], pointLoads: [{ element: 0, a: 'f*L', p: '-P' }] },
  kinds: ['V', 'M', 'D'],
};
const ssTwoPoints: Template = {
  id: 'ss-two-points',
  params: { values: { L: span, f: { min: 0.15, max: 0.4, step: 0.05 }, g: { min: 0.6, max: 0.85, step: 0.05 }, P: force, Q: force } },
  model: { nodes: [[0, 0], ['L', 0]], elements: [[0, 1]], supports: [{ node: 0, type: 'pinned' }, { node: 1, type: 'rollerX' }], pointLoads: [{ element: 0, a: 'f*L', p: '-P' }, { element: 0, a: 'g*L', p: '-Q' }] },
  kinds: ['V', 'M', 'D'],
};
const ssPartial: Template = {
  id: 'ss-partial',
  params: { values: { L: span, f: { min: 0.4, max: 0.7, step: 0.1 }, q: line } },
  model: { nodes: [[0, 0], ['f*L', 0], ['L', 0]], elements: [[0, 1], [1, 2]], supports: [{ node: 0, type: 'pinned' }, { node: 2, type: 'rollerX' }], distributedLoads: [{ element: 0, qI: '-q' }] },
  kinds: ['V', 'M', 'D'],
};
const ssEndCouple: Template = {
  id: 'ss-end-couple',
  params: { values: { L: span, C: { min: 10, max: 40, step: 10 }, q: { min: 0, max: 10, step: 5 } } },
  model: { nodes: [[0, 0], ['L', 0]], elements: [[0, 1]], supports: [{ node: 0, type: 'pinned' }, { node: 1, type: 'rollerX' }], nodalLoads: [{ node: 1, mz: '-C' }], distributedLoads: [{ element: 0, qI: '-q' }] },
  kinds: ['V', 'M', 'D'],
};
const ssTrapezoid: Template = {
  id: 'ss-trapezoid',
  params: { values: { L: span, q: line, w: { min: 25, max: 40, step: 5 } } },
  model: { nodes: [[0, 0], ['L', 0]], elements: [[0, 1]], supports: [{ node: 0, type: 'pinned' }, { node: 1, type: 'rollerX' }], distributedLoads: [{ element: 0, qI: '-q', qJ: '-w' }] },
  kinds: ['V', 'M', 'D'],
};
const fixedFixed: Template = {
  id: 'fixed-fixed',
  params: { values: { L: span, q: line, f: share, P: { min: 0, max: 30, step: 10 } } },
  model: { nodes: [[0, 0], ['L', 0]], elements: [[0, 1]], supports: [{ node: 0, type: 'fixed' }, { node: 1, type: 'fixed' }], distributedLoads: [{ element: 0, qI: '-q' }], pointLoads: [{ element: 0, a: 'f*L', p: '-P' }] },
  kinds: ['V', 'M', 'D'],
};
const proppedUniform: Template = {
  id: 'propped-uniform',
  params: { values: { L: span, q: line, c: { min: 1, max: 2, step: 0.5 } } },
  model: {
    nodes: [[0, 0], ['L', 0], ['L+c', 0]], elements: [[0, 1], [1, 2]],
    supports: [{ node: 0, type: 'fixed' }, { node: 1, type: 'rollerX' }],
    distributedLoads: [{ element: 0, qI: '-q' }, { element: 1, qI: '-q' }],
  },
  kinds: ['V', 'M', 'D'],
};
const gerberPoints: Template = {
  id: 'gerber-points',
  params: { values: { L: span, b: { min: 2, max: 4, step: 0.5 }, P: force, Q: force } },
  model: {
    nodes: [[0, 0], ['L', 0], ['L+b', 0]], elements: [[0, 1], [1, 2]], nodeHinges: [1],
    supports: [{ node: 0, type: 'fixed' }, { node: 2, type: 'rollerX' }],
    pointLoads: [{ element: 0, a: 'L/2', p: '-P' }, { element: 1, a: 'b/2', p: '-Q' }],
  },
  kinds: ['V', 'M', 'D'],
};
const height = { min: 3, max: 5, step: 0.5 };
const lFrame: Template = {
  id: 'l-frame',
  params: { values: { H: height, B: { min: 2, max: 4, step: 0.5 }, P: force, F: { min: 0, max: 20, step: 10 } } },
  model: { nodes: [[0, 0], [0, 'H'], ['B', 'H']], elements: [[0, 1], [1, 2]], supports: [{ node: 0, type: 'fixed' }], nodalLoads: [{ node: 2, fy: '-P' }, { node: 1, fx: 'F' }] },
  kinds: ['N', 'V', 'M', 'D'],
};
const column: Template = {
  id: 'column-lateral',
  params: { values: { H: height, F: force, w: { min: 0, max: 10, step: 5 } } },
  model: { nodes: [[0, 0], [0, 'H']], elements: [[0, 1]], supports: [{ node: 0, type: 'fixed' }], nodalLoads: [{ node: 1, fx: 'F' }], distributedLoads: [{ element: 0, qI: 'w' }] },
  kinds: ['V', 'M', 'D'],
};
const threeHinged: Template = {
  id: 'three-hinged',
  params: { values: { H: height, B: span, q: line, F: { min: 0, max: 20, step: 10 } } },
  model: {
    nodes: [[0, 0], [0, 'H'], ['B/2', 'H'], ['B', 'H'], ['B', 0]], elements: [[0, 1], [1, 2], [2, 3], [3, 4]], nodeHinges: [2],
    supports: [{ node: 0, type: 'pinned' }, { node: 4, type: 'pinned' }],
    distributedLoads: [{ element: 1, qI: '-q' }, { element: 2, qI: '-q' }], nodalLoads: [{ node: 1, fx: 'F' }],
  },
  kinds: ['N', 'V', 'M', 'D'],
};
const portalLateral: Template = {
  id: 'portal-lateral',
  params: { values: { H: height, B: span, F: force }, supportChoices: [{ support: 0, types: ['fixed', 'pinned'] }] },
  model: {
    nodes: [[0, 0], [0, 'H'], ['B', 'H'], ['B', 0]], elements: [[0, 1], [1, 2], [2, 3]],
    supports: [{ node: 0, type: 'fixed' }, { node: 3, type: 'fixed' }], nodalLoads: [{ node: 1, fx: 'F' }],
  },
  kinds: ['N', 'V', 'M', 'D'],
};
const portalGravity: Template = {
  id: 'portal-gravity',
  params: { values: { H: height, B: span, q: line, F: { min: 0, max: 20, step: 5 } }, supportChoices: [{ support: 0, types: ['pinned', 'fixed'] }, { support: 1, types: ['pinned', 'fixed'] }] },
  model: {
    nodes: [[0, 0], [0, 'H'], ['B', 'H'], ['B', 0]], elements: [[0, 1], [1, 2], [2, 3]],
    supports: [{ node: 0, type: 'pinned' }, { node: 3, type: 'pinned' }],
    distributedLoads: [{ element: 1, qI: '-q' }], nodalLoads: [{ node: 1, fx: 'F' }],
  },
  kinds: ['N', 'V', 'M', 'D'],
};
const inclined: Template = {
  id: 'inclined',
  params: { values: { B: span, H: { min: 2, max: 4, step: 0.5 }, P: force } },
  model: {
    nodes: [[0, 0], ['B/2', 'H/2'], ['B', 'H']], elements: [[0, 1], [1, 2]],
    supports: [{ node: 0, type: 'pinned' }, { node: 2, type: 'rollerX' }], nodalLoads: [{ node: 1, fy: '-P' }],
  },
  kinds: ['N', 'V', 'M', 'D'],
};
const gable: Template = {
  id: 'gable',
  params: { values: { H: height, B: { min: 6, max: 10, step: 1 }, R: { min: 1, max: 2.5, step: 0.5 }, P: force, F: { min: 0, max: 20, step: 5 } } },
  model: {
    nodes: [[0, 0], [0, 'H'], ['B/2', 'H+R'], ['B', 'H'], ['B', 0]], elements: [[0, 1], [1, 2], [2, 3], [3, 4]],
    supports: [{ node: 0, type: 'pinned' }, { node: 4, type: 'pinned' }], nodalLoads: [{ node: 2, fy: '-P' }, { node: 1, fx: 'F' }],
  },
  kinds: ['N', 'V', 'M', 'D'],
};
const triangleTruss: Template = {
  id: 'truss-triangle',
  params: { values: { B: span, H: { min: 2, max: 4, step: 0.5 }, P: force, F: { min: 0, max: 20, step: 10 } } },
  model: {
    allTruss: true, nodes: [[0, 0], ['B', 0], ['B/2', 'H']], elements: [[0, 1], [1, 2], [0, 2]],
    supports: [{ node: 0, type: 'pinned' }, { node: 1, type: 'rollerX' }], nodalLoads: [{ node: 2, fy: '-P', fx: 'F' }],
  },
  kinds: ['N'],
};
const panel = { min: 2, max: 3, step: 0.5 };
const warren: Template = {
  id: 'truss-warren',
  params: { values: { p: panel, H: { min: 2, max: 3, step: 0.5 }, A: { min: 0, max: 20, step: 10 }, C: { min: 10, max: 30, step: 10 }, F: { min: 0, max: 10, step: 10 } } },
  model: {
    allTruss: true,
    nodes: [[0, 0], ['p', 0], ['2*p', 0], ['3*p', 0], ['p/2', 'H'], ['3*p/2', 'H'], ['5*p/2', 'H']],
    elements: [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [0, 4], [4, 1], [1, 5], [5, 2], [2, 6], [6, 3]],
    supports: [{ node: 0, type: 'pinned' }, { node: 3, type: 'rollerX' }],
    nodalLoads: [{ node: 4, fy: '-A' }, { node: 5, fy: '-C', fx: 'F' }],
  },
  kinds: ['N'],
};
const howe: Template = {
  id: 'truss-howe',
  params: { values: { p: panel, H: { min: 2, max: 3, step: 0.5 }, A: { min: 0, max: 20, step: 10 }, C: { min: 10, max: 30, step: 10 } } },
  model: {
    allTruss: true,
    nodes: [[0, 0], ['p', 0], ['2*p', 0], ['3*p', 0], ['4*p', 0], ['p', 'H'], ['2*p', 'H'], ['3*p', 'H']],
    elements: [[0, 1], [1, 2], [2, 3], [3, 4], [5, 6], [6, 7], [1, 5], [2, 6], [3, 7], [0, 5], [7, 4], [1, 6], [6, 3]],
    supports: [{ node: 0, type: 'pinned' }, { node: 4, type: 'rollerX' }],
    nodalLoads: [{ node: 5, fy: '-A' }, { node: 6, fy: '-C' }, { node: 7, fy: '-A' }],
  },
  kinds: ['N'],
};
const pratt: Template = {
  id: 'truss-pratt',
  params: { values: { p: panel, H: { min: 2, max: 3, step: 0.5 }, A: { min: 0, max: 20, step: 10 }, C: { min: 10, max: 30, step: 10 }, D: { min: 0, max: 20, step: 10 } } },
  model: {
    allTruss: true,
    nodes: [[0, 0], ['p', 0], ['2*p', 0], ['3*p', 0], ['4*p', 0], ['p', 'H'], ['2*p', 'H'], ['3*p', 'H']],
    elements: [[0, 1], [1, 2], [2, 3], [3, 4], [5, 6], [6, 7], [1, 5], [2, 6], [3, 7], [0, 5], [7, 4], [5, 2], [2, 7]],
    supports: [{ node: 0, type: 'pinned' }, { node: 4, type: 'rollerX' }],
    nodalLoads: [{ node: 1, fy: '-A' }, { node: 2, fy: '-C' }, { node: 3, fy: '-D' }],
  },
  kinds: ['N'],
};
const bracket: Template = {
  id: 'truss-bracket',
  params: { values: { p: panel, H: { min: 2, max: 3, step: 0.5 }, P: force, Q: { min: 0, max: 20, step: 10 } } },
  model: {
    allTruss: true,
    nodes: [[0, 0], [0, 'H'], ['p', 0], ['p', 'H'], ['2*p', 0]],
    elements: [[0, 2], [2, 4], [1, 3], [3, 4], [2, 3], [1, 2]],
    supports: [{ node: 0, type: 'pinned' }, { node: 1, type: 'pinned' }],
    nodalLoads: [{ node: 4, fy: '-P' }, { node: 3, fy: '-Q' }],
  },
  kinds: ['N'],
};

export const LEVELS: Level[] = [
  {
    templates: [ssPoint, cantileverTip, cantileverRight, ssTwoPoints], kinds: ['V', 'M'],
    tags: ['wrongKind', 'pointAsUniform', 'degreeRaised', 'loadMoved', 'supportsMirrored', 'mirrored', 'jumpMissing'],
    minGap: 0.3, minPeak: 0.6, oddShare: 0, whichShare: 0.3, options: 3,
  },
  {
    templates: [ssUniform, cantileverUniform, overhang, overhangTip, ssPartial], kinds: ['V', 'M', 'D'],
    tags: ['wrongKind', 'resultantLoad', 'degreeLowered', 'degreeRaised', 'concavityFlipped', 'supportsMirrored', 'mirrored', 'loadMoved', 'notClosed'],
    minGap: 0.28, minPeak: 0.55, oddShare: 0, whichShare: 0.3, options: 3,
  },
  {
    templates: [ssCouple, ssTriangular, cantileverTriangular, ssCombined, cantileverCouple, ssEndCouple, ssTrapezoid], kinds: ['V', 'M', 'D'],
    tags: ['wrongKind', 'resultantLoad', 'pointAsUniform', 'vertexWrongEnd', 'concavityFlipped', 'jumpMissing', 'mirrored', 'loadMoved', 'loadScaled', 'notClosed', 'degreeLowered', 'fixedEndRotates'],
    minGap: 0.25, minPeak: 0.5, oddShare: 0.15, whichShare: 0.3, options: 3,
  },
  {
    templates: [gerber, gerberOverhang, gerberPoints, continuous, propped, proppedUniform, fixedFixed], kinds: ['V', 'M', 'D'],
    tags: ['nonZeroAtRelease', 'hingeToggled', 'fixedEndReleased', 'fixedEndRotates', 'inflectionMisplaced', 'supportDisplaced', 'vertexWrongEnd', 'concavityFlipped', 'jumpMissing', 'supportChanged', 'loadMoved', 'mirrored', 'wrongKind'],
    minGap: 0.22, late: ['wrongKind', 'mirrored'], minPeak: 0.45, oddShare: 0.25, whichShare: 0.25, options: 4,
  },
  {
    templates: [portalLateral, portalGravity, inclined, gable, lFrame, column, threeHinged], kinds: ['N', 'V', 'M', 'D'],
    tags: ['supportChanged', 'hingeToggled', 'rollerTurned', 'loadFlipped', 'loadMoved', 'loadScaled', 'nonZeroAtRelease', 'inflectionMisplaced', 'supportDisplaced', 'fixedEndReleased', 'fixedEndRotates', 'notClosed', 'jumpMissing', 'wrongKind'],
    minGap: 0.2, late: ['wrongKind', 'mirrored'], minPeak: 0.4, oddShare: 0.3, whichShare: 0.25, options: 4,
  },
  {
    templates: [triangleTruss, pratt, howe, warren, bracket], kinds: ['N'],
    tags: ['memberSignFlipped', 'zeroForceLoaded', 'loadedShownZero', 'loadMoved', 'loadFlipped', 'loadScaled', 'rollerTurned'],
    minGap: 0.2, minPeak: 0.4, oddShare: 0, whichShare: 0.3, options: 4,
  },
];

const everything = LEVELS.slice(1).flatMap((l) => l.templates);
LEVELS.push({
  templates: everything, kinds: ['N', 'V', 'M', 'D'],
  tags: [...new Set(LEVELS.flatMap((l) => l.tags))],
  minGap: 0.2, minPeak: 0.4, late: ['wrongKind', 'mirrored'], oddShare: 0.25, whichShare: 0.3, options: 4,
});
