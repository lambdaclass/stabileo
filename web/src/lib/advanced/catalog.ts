/**
 * Basic's advanced functions: what the Advanced panel lists, how they are grouped, what the
 * search matches and which explained step-by-step methods belong to each.
 *
 * Words come from keys: a function's title is `titleKey`, its one-line description
 * `advCat.fn.<id>.desc`, its longer help `helpKey`; a group's name is `advCat.group.<id>`.
 * A method's title is `steps.m.<method>.title`. `keywords` are aliases in any language,
 * matched as typed (accents, case and Greek letters are folded by the search).
 */

export type AdvGroupId = 'analysis' | 'moving' | 'sections' | 'explore' | 'learn';

export const ADV_GROUPS: readonly AdvGroupId[] = ['analysis', 'moving', 'sections', 'explore', 'learn'];

export type StepsGroup = 'stiffness' | 'flexibility' | 'continuous' | 'frames' | 'trusses' | 'deformation' | 'influence' | 'secondOrder' | 'plastic' | 'dynamics';

export type AdvThumbId =
  | 'kinematic' | 'pdelta' | 'buckling' | 'modal' | 'plastic'
  | 'influence' | 'train' | 'envelope'
  | 'freeBody' | 'section' | 'mohr' | 'concrete'
  | 'whatif' | 'steps' | 'stiffness' | 'flexibility' | 'continuous' | 'frames' | 'trusses' | 'deflection';

export interface AdvRequires {
  /** Plane only: unavailable in a 3D workspace. */
  plane?: boolean;
  /** Needs at least one member. */
  model?: boolean;
  /** Needs a solved model. */
  results?: boolean;
}

export interface AdvFunction {
  id: string;
  group: AdvGroupId;
  titleKey: string;
  helpKey?: string;
  thumb: AdvThumbId;
  /** Explained step-by-step methods that belong to this function. */
  steps: readonly string[];
  /** The function's own panel already opens its methods in context, so no separate list is drawn. */
  stepsInPanel?: boolean;
  /** Opens the step-by-step catalog at this group rather than running anything. */
  stepsGroup?: StepsGroup;
  keywords: readonly string[];
  requires: AdvRequires;
  /** Built only with the public tools. */
  feature?: 'tools';
  beta?: boolean;
}

export const ADV_FUNCTIONS: readonly AdvFunction[] = [
  {
    id: 'kinematic', group: 'analysis', titleKey: 'advanced.kinematicAnalysis', helpKey: 'advHelp.kinematic.text', thumb: 'kinematic',
    steps: [], requires: { plane: true, model: true },
    keywords: ['kinematic', 'cinemático', 'cinemática', 'cinemático', 'kinematisch', 'cinématique', 'kinematik', 'kinematikai', '机动', 'mechanism', 'mecanismo', 'Mechanismus', 'mécanisme', 'GH', 'degree of indeterminacy', 'grado de hiperestaticidad', 'hiperestático', 'isostático', 'statically determinate', 'indeterminate', 'unstable', 'inestable', 'stability', 'estabilidad', 'chapas', 'Grübler'],
  },
  {
    id: 'pdelta', group: 'analysis', titleKey: 'advanced.pdelta', helpKey: 'advHelp.pdelta.text', thumb: 'pdelta',
    steps: ['so-pdelta-phi', 'so-pdelta-kg'], requires: { model: true },
    keywords: ['P-Δ', 'pdelta', 'p delta', 'second order', '2nd order', 'segundo orden', '2do orden', '2º orden', 'segunda ordem', 'Theorie II. Ordnung', 'zweiter Ordnung', 'second ordre', 'ikinci mertebe', 'másodrendű', '二阶', 'B2', 'amplification', 'amplificación', 'geometric nonlinearity', 'no linealidad geométrica', 'φ functions', 'funciones φ', 'stability functions', 'funciones de estabilidad', 'Kg', 'geometric matrix', 'matriz geométrica'],
  },
  {
    id: 'buckling', group: 'analysis', titleKey: 'advanced.buckling', helpKey: 'advHelp.buckling.text', thumb: 'buckling',
    steps: ['so-buckling-phi', 'so-buckling-kg'], requires: { model: true },
    keywords: ['Pcr', 'Euler', 'buckling', 'pandeo', 'flambagem', 'Knicken', 'flambement', 'burkulma', 'kihajlás', '屈曲', 'critical load', 'carga crítica', 'carga de pandeo', 'λcr', 'critical factor', 'factor crítico', 'eigenvalue', 'autovalor', 'effective length', 'longitud efectiva', 'K factor', 'Keff', 'φ functions', 'funciones φ'],
  },
  {
    id: 'modal', group: 'analysis', titleKey: 'advanced.dynamic', helpKey: 'advHelp.modal.text', thumb: 'modal',
    steps: ['sdof', 'mdofModal', 'massDiscretization'], stepsInPanel: true, requires: { model: true },
    keywords: ['modal', 'dynamic', 'dinámica', 'dinámico', 'dinâmica', 'Dynamik', 'dynamique', 'dinamik', 'dinamika', '动力', '模态', 'vibration', 'vibración', 'vibração', 'Schwingung', 'frequency', 'frecuencia', 'period', 'período', 'mode shape', 'modo de vibración', 'ω', 'omega', 'natural frequency', 'frecuencia natural', 'mass', 'masa', 'SDOF', '1GDL', 'MDOF', 'Rayleigh', 'Meff', 'effective mass', 'masa efectiva'],
  },
  {
    id: 'plastic', group: 'analysis', titleKey: 'advanced.plasticCollapse', helpKey: 'advHelp.plastic.text', thumb: 'plastic',
    steps: ['plasticKinematic', 'plasticStatic'], requires: { plane: true, model: true },
    keywords: ['plastic', 'plástico', 'plástica', 'colapso', 'collapse', 'plastisch', 'Kollaps', 'plastique', 'ruine', 'plastik göçme', 'képlékeny', '塑性', 'plastic hinge', 'rótula plástica', 'articulación plástica', 'Mp', 'λ', 'lambda', 'collapse factor', 'factor de colapso', 'mechanism', 'mecanismo', 'limit analysis', 'análisis límite'],
  },
  {
    id: 'influenceLine', group: 'moving', titleKey: 'advanced.influenceLine', helpKey: 'advHelp.influenceLine.text', thumb: 'influence',
    steps: ['influenceLine'], stepsInPanel: true, requires: { plane: true, model: true },
    keywords: ['influence line', 'línea de influencia', 'linha de influência', 'Einflusslinie', "ligne d'influence", 'etki çizgisi', 'hatásábra', '影响线', 'Müller-Breslau', 'LI', 'IL', 'η', 'eta'],
  },
  {
    id: 'trainLoad', group: 'moving', titleKey: 'advanced.trainLoad', helpKey: 'advHelp.trainLoad.text', thumb: 'train',
    steps: [], requires: { plane: true, model: true },
    keywords: ['moving load', 'tren de carga', 'carga móvil', 'carga móvel', 'trem-tipo', 'Wanderlast', 'Lastzug', 'charge mobile', 'convoi', 'hareketli yük', 'mozgó teher', '移动荷载', 'truck', 'camión', 'vehicle', 'vehículo', 'bridge', 'puente', 'axle', 'eje'],
  },
  {
    id: 'loadStates', group: 'moving', titleKey: 'course.influence.states.title', helpKey: 'course.influence.states.help', thumb: 'envelope',
    steps: ['influenceLine'], requires: { model: true },
    keywords: ['envelope', 'envolvente', 'envoltória', 'Umhüllende', 'enveloppe', 'zarf', 'burkoló', '包络', 'load cases', 'estados de carga', 'casos de carga', 'live load', 'sobrecarga', 'alternating load', 'carga alternada', 'max', 'min', 'máximo', 'mínimo'],
  },
  {
    id: 'despiece', group: 'sections', titleKey: 'advanced.despiece', helpKey: 'advHelp.despiece.text', thumb: 'freeBody',
    steps: ['cuts'], requires: { model: true, results: true },
    keywords: ['free body', 'free-body', 'cuerpo libre', 'diagrama de cuerpo libre', 'DCL', 'FBD', 'despiece', 'corpo livre', 'Freikörperbild', 'corps libre', 'serbest cisim', 'szabadtest', '隔离体', 'end forces', 'esfuerzos en extremos', 'equilibrium', 'equilibrio', 'reactions', 'reacciones', 'N V M'],
  },
  {
    id: 'stress', group: 'sections', titleKey: 'advanced.sectionAnalysis', helpKey: 'advHelp.stress.text', thumb: 'section',
    steps: [], requires: { model: true, results: true },
    keywords: ['stress', 'tensión', 'tensiones', 'tensão', 'Spannung', 'contrainte', 'gerilme', 'feszültség', '应力', 'σ', 'sigma', 'τ', 'tau', 'Navier', 'Jourawski', 'Zhuravskii', 'shear flow', 'flujo de corte', 'neutral axis', 'eje neutro', 'von Mises', 'Tresca', 'section', 'sección', 'normal stress', 'tensión normal', 'shear stress', 'tensión tangencial'],
  },
  ...((typeof __PUBLIC_FEATURES_COMPILED__ !== 'undefined' ? __PUBLIC_FEATURES__.tools : typeof __PUBLIC_FEATURES__ === 'undefined' || __PUBLIC_FEATURES__.tools) ? [{
    id: 'mohr', group: 'sections', titleKey: 'advanced.mohr', helpKey: 'advHelp.mohr.text', thumb: 'mohr', feature: 'tools',
    steps: [], requires: {},
    keywords: ['Mohr', 'círculo de Mohr', 'Mohr circle', 'círculo', 'Mohrscher Kreis', 'cercle de Mohr', 'Mohr çemberi', 'Mohr-kör', '莫尔圆', 'principal stresses', 'tensiones principales', 'σ1', 'σ2', 'τmax', 'stress state', 'estado tensional', 'θ', 'theta', 'plane stress', 'estado plano'],
  } satisfies AdvFunction] : []),
  {
    id: 'cirsocFlex', group: 'sections', titleKey: 'flex.title', helpKey: 'advHelp.cirsocFlex.text', thumb: 'concrete', beta: true,
    steps: [], requires: {},
    keywords: ['CIRSOC', 'CIRSOC 201', 'hormigón armado', 'reinforced concrete', 'concreto armado', 'Stahlbeton', 'béton armé', 'betonarme', 'vasbeton', '钢筋混凝土', 'flexión', 'bending', 'flexure', 'reinforcement', 'armadura', 'As', 'φMn', 'Mn', 'Mu', 'rebar', 'barras', 'design', 'diseño', 'dimensionado', 'calculadora', 'calculator'],
  },
  {
    id: 'whatif', group: 'explore', titleKey: 'advanced.whatIf', helpKey: 'advHelp.whatif.text', thumb: 'whatif',
    steps: [], requires: { model: true },
    keywords: ['explore', 'explorar', 'what if', 'qué pasa si', 'e se', 'was wäre wenn', 'et si', 'ya şöyle olsaydı', 'mi lenne ha', '假如', 'slider', 'live', 'en vivo', 'sensitivity', 'sensibilidad', 'parametric', 'paramétrico', 'vary', 'variar'],
  },
  {
    id: 'steps', group: 'learn', titleKey: 'steps.catalog.title', helpKey: 'steps.catalog.intro', thumb: 'steps',
    steps: [], requires: {},
    keywords: ['step by step', 'paso a paso', 'passo a passo', 'Schritt für Schritt', 'pas à pas', 'adım adım', 'lépésről lépésre', '分步', 'explained', 'explicado', 'learn', 'aprender', 'methods', 'métodos', 'hand calculation', 'cálculo a mano', 'class', 'clase', 'course', 'curso'],
  },
  {
    id: 'stepsStiffness', group: 'learn', titleKey: 'steps.group.stiffness', thumb: 'stiffness', stepsGroup: 'stiffness',
    steps: ['dsm'], requires: {},
    keywords: ['stiffness', 'rigidez', 'Steifigkeit', 'rigidité', 'rijitlik', 'merevség', '刚度', 'DSM', 'direct stiffness', 'matrix', 'matriz', 'K', 'displacements method', 'método matricial'],
  },
  {
    id: 'stepsFlexibility', group: 'learn', titleKey: 'steps.group.flexibility', thumb: 'flexibility', stepsGroup: 'flexibility',
    steps: ['fm'], requires: {},
    keywords: ['flexibility', 'flexibilidad', 'force method', 'método de las fuerzas', 'Kraftgrößenverfahren', 'méthode des forces', 'kuvvet yöntemi', 'erőmódszer', '力法', 'redundant', 'hiperestática', 'incógnita hiperestática', 'X1', 'compatibility', 'compatibilidad'],
  },
  {
    id: 'stepsContinuous', group: 'learn', titleKey: 'steps.group.continuous', thumb: 'continuous', stepsGroup: 'continuous',
    steps: ['threeMoments', 'crossBeams'], requires: {},
    keywords: ['continuous beam', 'viga continua', 'viga contínua', 'Durchlaufträger', 'poutre continue', 'sürekli kiriş', 'többtámaszú', '连续梁', 'three moments', 'tres momentos', 'Clapeyron', 'Cross', 'moment distribution', 'distribución de momentos'],
  },
  {
    id: 'stepsFrames', group: 'learn', titleKey: 'steps.group.frames', thumb: 'frames', stepsGroup: 'frames',
    steps: ['displacement', 'crossNoSway', 'crossSway', 'slopeDeflection'], requires: {},
    keywords: ['frame', 'pórtico', 'Rahmen', 'portique', 'çerçeve', 'keret', '刚架', 'Cross', 'sway', 'desplazable', 'indesplazable', 'slope deflection', 'pendiente-deflexión', 'displacement method', 'método de los desplazamientos'],
  },
  {
    id: 'stepsTrusses', group: 'learn', titleKey: 'steps.group.trusses', thumb: 'trusses', stepsGroup: 'trusses',
    steps: ['joints', 'sections', 'compatibility'], requires: {},
    keywords: ['truss', 'reticulado', 'cercha', 'armadura', 'treliça', 'Fachwerk', 'treillis', 'kafes', 'rácsos', '桁架', 'joints', 'nudos', 'Ritter', 'sections', 'secciones', 'Cremona'],
  },
  {
    id: 'stepsDeformation', group: 'learn', titleKey: 'steps.group.deformation', thumb: 'deflection', stepsGroup: 'deformation',
    steps: ['doubleIntegration', 'momentArea', 'virtualWork', 'castigliano', 'cuts'], requires: {},
    keywords: ['deflection', 'deformación', 'flecha', 'deformação', 'Durchbiegung', 'flèche', 'sehim', 'lehajlás', '挠度', 'virtual work', 'trabajo virtual', 'PTV', 'Castigliano', 'energy', 'energía', 'double integration', 'doble integración', 'moment area', 'área de momentos', 'Mohr', 'cuts', 'cortes'],
  },
];

const BY_ID = new Map(ADV_FUNCTIONS.map((f) => [f.id, f]));

export function advFunction(id: string): AdvFunction | undefined {
  return BY_ID.get(id);
}

export function functionsIn(group: AdvGroupId, offered: (f: AdvFunction) => boolean = () => true): AdvFunction[] {
  return ADV_FUNCTIONS.filter((f) => f.group === group && offered(f));
}

/** The function that owns a method: an analysis that links it, else the step-by-step topic that lists it. */
export function ownerOfMethod(methodId: string): AdvFunction | undefined {
  return ADV_FUNCTIONS.find((f) => !f.stepsGroup && f.steps.includes(methodId))
    ?? ADV_FUNCTIONS.find((f) => f.stepsGroup && f.steps.includes(methodId));
}

/** Every method some entry links, each once, in catalog order. */
export function linkedMethods(): string[] {
  return [...new Set(ADV_FUNCTIONS.flatMap((f) => f.steps))];
}

export type AdvUnavailable = 'plane' | 'model' | 'results';

/** Why a function cannot run on this model, or null. `results` is advisory: opening still says so. */
export function unavailable(f: AdvFunction, state: { is3D: boolean; members: number; solved: boolean }): AdvUnavailable | null {
  if (f.requires.plane && state.is3D) return 'plane';
  if (f.requires.model && state.members === 0) return 'model';
  if (f.requires.results && !state.solved) return 'results';
  return null;
}
