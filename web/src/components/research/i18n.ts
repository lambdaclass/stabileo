import { publicI18n } from '../../lib/i18n/store.svelte';

/** Research interface and article strings; unsupported locales fall back to English. */
export type ResearchStrings = {
  ferrariNumbers: string;
  ferrariTitle: string;
  ferrariLead: string;
  ferrariScope: string;
  ferrariScopeText: string;
  ferrariModel: string;
  ferrariEvidence: string;
  ferrariEvidenceText: string;
  ferrariMissing: string;
  ferrariBlocker: string;
  ferrariAuthors: string;
  ferrariQuestions: string;
  ferrariReference: string;
  ferrariReferenceText: string;
  ferrariReplay: string;
  ferrariLive: string;
  ferrariCached: string;
  ferrariRun: string;
  ferrariStop: string;
  ferrariRestart: string;
  ferrariStep: string;
  ferrariFailed: string;
  ferrariPath: string;
  ferrariTheta: string;
  ferrariLambda: string;
  ferrariViewer: string;
  ferrariDisclaimer: string;
  ferrariPending: string;
  formPositionError: string;
  formForceError: string;
  formTitle: string;
  formLead: string;
  formScopeTitle: string;
  formScope: string;
  formMethodTitle: string;
  formMethod: string;
  formInputs: string;
  formEvidenceTitle: string;
  formEvidence: string;
  formReference: string;
  formEngineTitle: string;
  formEngine: string;
  formLimitsTitle: string;
  formLimits: string;
  formDisclaimer: string;
  formQuestionsTitle: string;
  formQuestions: string;
  formReplay: string;
  formLive: string;
  formForce: string;
  formHeight: string;
  formDensity: string;
  formLoad: string;
  formControls: string;
  formRun: string;
  formComputing: string;
  formStop: string;
  formRestart: string;
  formOblique: string;
  formElevation: string;
  formProjectionNote: string;
  formReplayStep: string;
  formFailed: string;
  formExportNote: string;
  formEditorLabel: string;
  formAlt: string;

  springsEqualWeight: string;
  springsCompressionLegend: string;
  springsTensionLegend: string;
  springsZeroLegend: string;
  springsEditorChanged: string;
  springsEditorFailed: string;

  springsTitle: string;
  springsLead: string;
  springsPaperShows: string;
  springsOverview: string;
  springsNonaffine: string;
  springsOverviewRelaxation: string;
  springsAuxetic: string;
  springsOverviewAuxetic: string;
  springsTry: string;
  springsPerfect: string;
  springsTryAuxetic: string;
  springsModel: string;
  springsSprings: string;
  springsJoin: string;
  springsRestLength: string;
  springsCurrentLength: string;
  springsEnergy: string;
  springsModelViewer: string;
  springsStripTest: string;
  springsStripMethod: string;
  springsExactModuli: string;
  springsPeriodicMethod: string;
  springsPrestress: string;
  springsPrestressMethod: string;
  springsComparison: string;
  springsFoamHeading: string;
  springsFoamComparison: string;
  springsDisorderAxis: string;
  springsPoissonAxis: string;
  springsFoamPlot: string;
  springsStripBias: string;
  springsHoneyHeading: string;
  springsHoneyComparison: string;
  springsTryHoney: string;
  springsHoneyPlot: string;
  springsOrderedHeading: string;
  springsOrderedComparison: string;
  springsOrderedConvention: string;
  springsTryOrdered: string;
  springsTryEqualWeight: string;
  springsOrientationAxis: string;
  springsOrderedPlot: string;
  springsSelectOrdered: string;
  springsUnreproduced: string;
  springsRigidityHeading: string;
  springsRigidity: string;
  springsTryDilute: string;
  springsTryTension: string;
  springsCoordinationAxis: string;
  springsModulusAxis: string;
  springsModuliPlot: string;
  springsAllChecks: string;
  springsChecksRun: string;
  springsCheck: string;
  springsObserved: string;
  springsTolerance: string;
  springsResult: string;
  springsLimitations: string;
  springsNoReference: string;
  springsNotImplemented: string;
  springsLinearOnly: string;
  springsSynchronous: string;
  springsFreeEdges: string;
  springsEnsemble: string;
  springsNotDesign: string;
  springsCodeReferences: string;
  springsImplementation: string;
  springsArticleSupplement: string;
  springsFiguresCredit: string;
  springsFoamCredit: string;
  springsPaperReference: string;
  springsOpenFull: string;
  springsExportDisabled: string;
  springsRetryFull: string;
  springsEditorDescription: string;
  springsLoadCurrent: string;
  springsRetryEditor: string;
  springsLoadingEditor: string;
  springsEditorTitle: string;
  springsBundleMissing: string;
  springsBuildBundle: string;
  springsLoadingSolver: string;
  springsLiveSweep: string;
  springsPauseSweep: string;
  springsViewerLabel: string;
  springsPlaceholder: string;
  springsSolverRefused: string;
  springsStripReadout: string;
  springsPeriodicReadout: string;
  springsAffineReadout: string;
  springsCoordinationReadout: string;
  springsNetwork: string;
  springsFoamOption: string;
  springsOrderedOption: string;
  springsHoneyOption: string;
  springsSquareOption: string;
  springsDisorder: string;
  springsDisorderLabel: string;
  springsShear: string;
  springsPhi: string;
  springsElongation: string;
  springsPsi: string;
  springsOrientation: string;
  springsTheta: string;
  springsLaw: string;
  springsEqualK: string;
  springsCornerDistance: string;
  springsEll: string;
  springsDiagonals: string;
  springsBondsKept: string;
  springsBondsFraction: string;
  springsPrestressControl: string;
  springsPrestressLabel: string;
  springsStrain: string;
  springsDeformation: string;
  springsDeformationScale: string;
  springsSeed: string;
  springsSeedLabel: string;
  springsResolveNote: string;
  springsResolveTime: string;
  springsReferenceUnavailable: string;
  springsThisNetwork: string;
  springsThisPeriodic: string;
  springsThisShear: string;
  springsPaperChecks: string;
  springsIndependentChecks: string;
  springsIndeterminate: string;
  springsAxialNormalized: string;
  springsAxial: string;
  springsNodes: string;
  springsBars: string;
  springsStripSeries: string;
  springsFigureSeries: string;
  springsTextSeries: string;
  springsBulkSeries: string;
  springsShearSeries: string;
  springsHoneyPaperSeries: string;
  springsHoneySeries: string;
  springsOrderedPaperSeries: string;
  springsEqualWeightSeries: string;
  springsHookeanSeries: string;
  springsBandSeries: string;
  springsMeanSeries: string;
  springsFullEditorError: string;
  springsAlt: string;
  springsHook: string;
  shauerHook: string;

  forceComparisonTolerance: string;
  referenceDots: string;

  coarseMesh: string;
  mediumMesh: string;
  referenceMesh: string;
  viewer: string;
  force: string;
  convergence: string;
  parameters: string;
  precomputedSeries: string;
  browserSeries: string;
  referenceSeries: string;
  referenceDifference: string;
  elasticLabel: string;
  fractureLabel: string;
  elasticEnergy: string;
  fractureEnergy: string;
  thisReplay: string;
  thisRun: string;
  nonConverged: string;
  referenceMismatch: string;
  damageField: string;
  stressAvailable: string;
  hideBroken: string;
  hideBrokenHint: string;
  plate: string;
  crackBand: string;
  notchTip: string;
  degradedStress: string;
  clampedColours: string;
  elementCentres: string;
  pause: string;
  play: string;
  equal: string;
  differs: string;
  pass: string;
  fail: string;
  notConvergedSuffix: string;
  referenceLower: string;
  noLicence: string;
  deformed: string;
  undeformed: string;
  inTime: string;
  peakReferenceLabel: string;
  peakLabel: string;
  viewerMeshLabel: string;
  replaySource: string;
  liveSource: string;
  cachedSource: string;

  researchTitle: string;
  galleryLead: string;
  galleryDisclaimer: string;
  damageAlt: string;
  missingPage: string;
  backToResearch: string;
  iterationsChartLabel: string;
  iterations: string;
  loadStepLower: string;
  step: string;
  residualSuffix: string;
  shauerTitle: string;
  shauerLead: string;
  paperShows: string;
  paperOverview: string;
  replayGrowth: string;
  theForce: string;
  risesTo: string;
  peakStepLink: string;
  nextIncrement: string;
  crackStepLink: string;
  afterComma: string;
  alternating308: string;
  forceDrops: string;
  finalState: string;
  openCrack: string;
  modelHeading: string;
  displacement: string;
  bilinearModel: string;
  elasticity: string;
  fixedDamage: string;
  wholeStress: string;
  damageAT2: string;
  atFixed: string;
  drivingEnergy: string;
  positiveStrains: string;
  hybridModel: string;
  alternatingSolution: string;
  solvePerStep: string;
  currentDamage: string;
  residualThreshold: string;
  irreversibility: string;
  noIrreversibility: string;
  enableHistory: string;
  keepOnUnloading: string;
  unitsAndPeak: string;
  lengthStrength: string;
  tryLength: string;
  meshMatters: string;
  tryCoarse: string;
  reproductionHeading: string;
  referenceProcedure: string;
  rustProcedure: string;
  checksProcedure: string;
  referenceComparison: string;
  validationChecks: string;
  checksCaption: string;
  check: string;
  observed: string;
  tolerance: string;
  result: string;
  symmetryFinding: string;
  toleranceMeaning: string;
  stepTable: string;
  stepsParen: string;
  residual: string;
  referenceForce: string;
  paperComparison: string;
  paperNotCompared: string;
  limitations: string;
  noCertification: string;
  meshLimitation: string;
  damageLimitation: string;
  iterationLimitation: string;
  browserLimitation: string;
  codeReferences: string;
  implementationOutputs: string;
  adaptationCredit: string;
  referenceCode: string;
  comparisonMatches: string;
  atStep: string;
  identicalIterationsAt: string;
  stepsPeriod: string;
  details: string;
  replayMismatch: string;
  show: string;
  display: string;
  view: string;
  reactionCaption: string;
  topDisplacementAxis: string;
  referenceCurveNote: string;
  againstReferenceCode: string;
  peakForce: string;
  knAtStep: string;
  referenceSemicolon: string;
  relativeForceDifference: string;
  relativeTestTolerance: string;
  absoluteForceDifference: string;
  absoluteTestTolerance: string;
  identicalIterations: string;
  iterationsCaption: string;
  energies: string;
  energyAxis: string;
  youngModulus: string;
  youngModulusLabel: string;
  poissonRatio: string;
  poissonRatioLabel: string;
  fractureToughness: string;
  fractureToughnessLabel: string;
  lengthScale: string;
  lengthScaleLabel: string;
  topDisplacement: string;
  topDisplacementLabel: string;
  loadStep: string;
  mesh: string;
  historyField: string;
  planeStrainLoaded: string;
  refinedRatio: string;
  underResolved: string;
  stop: string;
  restart: string;
  run: string;
  solveAgain: string;
  backToReplay: string;
  solverUnavailable: string;
  solvingStep: string;
  done: string;
  steps: string;
  completedRunsKept: string;
  stoppedAfter: string;
  solverRefused: string;
  runReuseNote: string;
  runBrowserNote: string;
  loadStepShown: string;
  afterAuthors: string;
  citeThis: string;
  citationTitle: string;
  reproductionOf: string;
  implementationLabel: string;
  atCommit: string;
  engineCitation: string;
  theExperiment: string;
  experiment: string;
  viewerUnavailable: string;
  sourceLabel: Record<'crossref-abstract' | 'publisher-abstract' | 'repository-readme' | 'full-text' | 'reference-code', string>;
  resetParameters: string;
  summaryIntro: string;
  noAbstract: string;
  runIt: string;
  comingNext: string;
  inProgress: string;
  catalog: string;
  field: string;
  status: string;
  all: string;
  readRun: string;
  paper: string;
  code: string;
  openInStabileo: string;
  editInStabileo: string;
  soon: string;
  notDesign: string;
  checksPass: string;
  notCompared: string;
  research: string;
  suggest: string;
  onlyEnglish: string;
  againstCode: string;
  againstBenchmark: string;
  againstPaper: string;
  of: string;
  seeChecks: string;
  disclaimer: string;
  notComparedWhy: string;
  benchmark: Record<'viewer' | 'path' | 'parameters' | 'case' | 'riseSpan' | 'loadDirection' | 'downward' | 'upward' | 'arcLengthStep' | 'recompute' | 'stop' | 'restart' | 'backToReplay' | 'play' | 'pause' | 'step' | 'reference' | 'stabileo' | 'error' | 'result' | 'reset', string>;
};

const STRINGS: Record<'en' | 'es' | 'pt', ResearchStrings> = {
  en: {
    ferrariNumbers: "With 10 elements per member, |λ₁ − {reference}| = {error}, below the {tolerance} tolerance. The maximum scaled derivative discrepancy is {derivative}, below {derivativeTolerance}. These are checks of the implemented subset only.",
    ferrariTitle: "Roorda frame: reproduction in progress",
    ferrariLead: "Production buckling and an imperfect nonlinear path. The Koiter coefficient comparison is unfinished.",
    ferrariScope: "What is reproduced",
    ferrariScopeText: "This first version checks the critical load of the simple frame in §2.1.2, using the production engine. It also traces one imperfect path with the production corotational arc-length solver. The path is not a validated reproduction of Figure 2b.",
    ferrariModel: "Two 1 m members, pinned at the outer ends and rigidly joined at the corner. E = 21 MPa, A = {area} m², J = 10⁻⁴/12 m⁴. A downward 1 kN reference load acts at the corner. The path adds a +{moment} kN·m reference moment; there are 10 elements per member.",
    ferrariEvidence: "Evidence and limitations",
    ferrariEvidenceText: "The production linear buckling load is compared with the paper. Every element energy partial derivative through order four is checked by central differences at three states. These checks validate derivatives of the production-style beam energy; they do not validate Koiter coefficients.",
    ferrariMissing: "Not yet reproduced: α, β, the second-order displacement correction, closed-form post-buckling coefficients, and near-bifurcation agreement between Koiter and arc-length paths. Optimisation, multiple modes, larger assemblies and experimental validation are outside this first version.",
    ferrariBlocker: "A scaled linear displacement and linear buckling mode do not satisfy the nonlinear critical-point equations in the initial probe. No coefficients or Koiter prediction are displayed from that rejected calculation. The critical state and modal normalization must be resolved first.",
    ferrariAuthors: "Questions for the authors",
    ferrariQuestions: "Could you share the minimal §2.1.2 input, mesh and beam formulation; the precise normalization and sign mapping from ξ to corner rotation; and the reference α, β and arc-length arrays? Please clarify the reported coefficient error percentages, which differ from arithmetic on the rounded values.",
    ferrariReference: "Published reference",
    ferrariReferenceText: "§2.1.2, pages 4–5: closed-form (λ₁, α, β) = ({closed}); numerical ({numerical}). Figure 2b is on page 4. These are reference values, not computed coefficients.",
    ferrariReplay: "Precomputed replay (same production solver)",
    ferrariLive: "Live computation in your browser",
    ferrariCached: "Cached result from this browser",
    ferrariRun: "Recompute live",
    ferrariStop: "Stop",
    ferrariRestart: "Restart replay",
    ferrariStep: "Path sample",
    ferrariFailed: "The live computation failed. The last displayed data have been retained.",
    ferrariPath: "Production arc-length path",
    ferrariTheta: "Corner rotation (rad)",
    ferrariLambda: "Load factor λ",
    ferrariViewer: "Roorda frame displacement",
    ferrariDisclaimer: "Research, not a design tool.",
    ferrariPending: "Koiter comparison pending",
    formPositionError: "Maximum reference position error",
    formForceError: "Maximum reference force error",
    formTitle: "Four cables, one equilibrium",
    formLead: "Find the shape of the four-bar system in Fig. 2 using positive force densities. Change the load, recompute in Rust, then open the found geometry as a truss in Stabileo.",
    formScopeTitle: "What is reproduced",
    formScope: "This first version implements the forward equilibrium problem in Section 2.1, Fig. 2 and Eq. (7). Our four-cable net has one free joint and four fixed supports. Its topology follows the paper; its dimensions and loads are explicitly chosen here, not transcribed from the figure. The paper develops differentiable inverse design; that contribution is outside this version.",
    formMethodTitle: "The forward method",
    formMethod: "Force density is axial tension divided by member length. Positive densities give an anchored network a positive-definite equilibrium matrix. The research crate assembles this matrix and uses the production engine’s sparse Cholesky factorization for the three coordinates. Forces follow from f = qℓ.",
    formInputs: "Supports are (±2, ±2, 0) m. The baseline downward load is 4 kN and every density is 1 kN/m. Eq. (7) then gives z = −1 m, length = 3 m and tension = 3 kN. These are derived targets for our inputs, not published numerical observations.",
    formEvidenceTitle: "Evidence and tolerances",
    formEvidence: "Five input cases compare every coordinate and cable force with unmodified jax_fdm in float64. Absolute tolerances are 1e-12 m for coordinates, 1e-12 kN for reference forces and equilibrium residuals, and 1e-9 kN for production truss forces. The validation file records each observed error. The replay is a load sweep computed by the same Rust solver, not convergence iterations.",
    formReference: "Reference: jax_fdm, MIT, revision 9a17fd379071fb3511ca914f46e8d1e8c286460e. The manifest records the source archive SHA-256, output hashes and installed environment. This revision has not been confirmed as the publication revision.",
    formEngineTitle: "What the production engine checks",
    formEngine: "The editor receives the found geometry, fixed support translations and the same vertical load as a 3D linear elastic truss. With equal member stiffnesses, symmetry makes its axial forces match FDM. Tests also check its vertical displacement against the elastic closed form. This is a separate analysis of initially unstressed bars: cable prestress and geometric stiffness are not transferred.",
    formLimitsTitle: "Not yet reproduced",
    formLimits: "No adjoints, gradients, optimization, shells, mixed tension/compression, shape-dependent loading, buckling or timing claims. No published optimized shapes or table values are reproduced. The preview is a labelled projection; the editor contains the full spatial model.",
    formDisclaimer: "Agreement with another code is not experimental validation or engineering certification.",
    formQuestionsTitle: "Questions for the authors",
    formQuestions: "Which commit and environment generated the paper? Are the exact Fig. 2 inputs available? Which small cable-net benchmark and reference coordinates, forces and gradients would you recommend for a subsequent inverse-design reproduction?",
    formReplay: "Precomputed replay (same solver)",
    formLive: "Live Rust computation",
    formForce: "Cable tension",
    formHeight: "Free-node elevation",
    formDensity: "Force density",
    formLoad: "Downward load",
    formControls: "Form-finding controls",
    formRun: "Recompute live",
    formComputing: "Computing…",
    formStop: "Stop",
    formRestart: "Restart",
    formOblique: "Oblique projection",
    formElevation: "Elevation projection",
    formProjectionNote: "Projected spatial net · supports at the four outer ends · full geometry in the editor",
    formReplayStep: "Load-sweep frame",
    formFailed: "The calculation or editor could not load. The displayed result is unchanged; retry.",
    formExportNote: "Opens the displayed result as an unstressed elastic truss. No cable prestress is exported. Research, not a design tool.",
    formEditorLabel: "Research: four-cable geometry, unstressed truss check",
    formAlt: "Projection of our four-cable equilibrium result",
    springsEqualWeight: "k ∝ 1/ℓ² (as Eq. 9)",
    springsCompressionLegend: "compression positive after division by negative ε · strip compressed left to right, end rows held",
    springsTensionLegend: "tension positive · strip pulled left to right, end rows held",
    springsZeroLegend: "zero imposed strain · end rows held",
    springsEditorChanged: "The experiment changed while the editor was loading. Retry to load the current network.",
    springsEditorFailed: "The Stabileo editor could not be loaded:",

    springsTitle: "Auxetic spring networks",
    springsLead: "Pull a strip of Hookean springs and read how much it narrows. Shake the nodes of the triangular lattice and it starts to widen instead: it becomes auxetic. The network on the right is solved in your browser as a truss on Stabileo’s engine, and the same strip opens in the real Stabileo editor. No reference code is public (“available at request”), so we compare with the paper’s published numbers, closed forms and figures, and with exact results.",
    springsPaperShows: "What the paper shows",
    springsOverview: "Many materials, from metamaterial lattices to cell membranes, are modelled as networks of Hookean springs. Grossman and Boudaoud derive the elastic continuum that such a network behaves like, using only its geometry and topology, and they compute the",
    springsNonaffine: "nonaffine",
    springsOverviewRelaxation: "displacements: the local deviations from a uniform stretch that make disordered networks softer than the uniform-strain estimate. They check the theory against simulations of a stretched strip for three families: ordered triangular lattices, a honeycomb that turns re-entrant, and a “foam” made by randomly displacing the nodes of a triangular lattice, which becomes",
    springsAuxetic: "auxetic",
    springsOverviewAuxetic: "(negative Poisson’s ratio: it widens when pulled) as the disorder grows.",
    springsTry: "Try it:",
    springsPerfect: "perfect lattice, η = 0",
    springsTryAuxetic: "η = 0.5, auxetic",
    springsModel: "The model we solve",
    springsSprings: "Springs",
    springsJoin: "join nodes; each has stiffness",
    springsRestLength: ", rest length ℓ̄",
    springsCurrentLength: "and current length ℓ",
    springsEnergy: ", and the energy is",
    springsModelViewer: "(the paper’s Eq. 3). A spring network is a pin-jointed truss, so the right pane shows it in the Stabileo viewer: each bar coloured by its axial force, on the deformed shape. We compute two things.",
    springsStripTest: "The paper’s strip test.",
    springsStripMethod: "A 13 × 52 strip (about 800 nodes), its top and bottom rows held, the top moved up by the imposed strain; the Poisson’s ratio is read from the width change between the two edge nodes nearest mid-height, as in the paper’s Sec. V A. Solved as a linear truss on the Stabileo engine’s sparse Cholesky factorisation; the same model solved by the production engine’s 2D truss analysis agrees to 10⁻¹⁴.",
    springsExactModuli: "Exact effective moduli.",
    springsPeriodicMethod: "A periodic cell under an imposed macroscopic strain, with every node free to relax: the stiffness that remains is the network’s elastic tensor C, including the nonaffine softening, with no boundary effects. The uniform-strain (affine) tensor is the same sum without relaxation.",
    springsPrestress: "Prestress",
    springsPrestressMethod: "(an addition, not in the paper’s computations): rest lengths shortened by a fraction, the network relaxed to equilibrium by Newton’s method, and the linear response taken about that state, tension stiffening included.",
    springsComparison: "Comparison with the paper",
    springsFoamHeading: "Foam: the auxetic transition",
    springsFoamComparison: "The paper reports ν falling with the disorder η, crossing zero at η ≃ 0.46 and reaching −0.1 as η → 0.5. Our exact periodic moduli (10 samples of 26 × 26 cells for each η) cross zero at η = 0.446 and give ν = −0.148 at η = 0.5. This is a cross-protocol comparison: our periodic-cell mean falls inside every error bar of the paper’s 13 × 52 clamped-strip simulations in Fig. 5 for η ≤ 0.45; it does not validate our strip protocol. The paper’s marker at η = 0.49 is an arrow below its plot (about −0.14); ours there is −0.117.",
    springsDisorderAxis: "disorder η",
    springsPoissonAxis: "Poisson’s ratio ν",
    springsFoamPlot: "Poisson's ratio against disorder: ours and the paper's",
    springsStripBias: "Our implementation of the strip protocol (dashed) reads 0.371 for the perfect lattice, where the exact value is 1/3 and the paper’s Fig. 5 shows 0.331. The excess is a free-edge effect of order 1/width: strips of 26 and 52 widths read 0.354 and 0.345, extrapolating to 0.336. The paper’s strip does not show it, and its text does not say enough about the measurement for us to find out why.",
    springsHoneyHeading: "Honeycomb: Eq. (23)",
    springsHoneyComparison: "A honeycomb of unit edges whose opposing corners are 2ℓ apart is regular at ℓ = 1 and re-entrant below ℓ = ½. The paper triangulates each hexagon with a centre node and springs 10⁻³ as stiff as the edges, and compares with the closed form ν(ℓ) = −(2 − 4ℓ)(ℓ + ½)/(3 + 4ℓ − 4ℓ²). Our periodic network agrees to 3.4 × 10⁻³ with those springs and to 3.4 × 10⁻⁶ with springs 10⁻⁶ as stiff: the difference is the soft springs’ own stiffness.",
    springsTryHoney: "Show ℓ = 0.25 (re-entrant)",
    springsHoneyPlot: "Honeycomb Poisson's ratio: Eq. 23 and our network",
    springsOrderedHeading: "Ordered lattices: an observation about spring constants",
    springsOrderedComparison: "For ordered triangular lattices the paper gives a closed form, Supplemental Eq. (9), for ν as a function of the cell shape (φ, ψ) and orientation θ, plotted in its Fig. 4. A Bravais lattice has no nonaffine displacements, so the exact answer is the uniform-strain one, which we compute independently. Supplemental Eq. (9) and the calculation line of Fig. 7 (Young’s modulus of the (3, 2) lattice, read from the PDF’s vector data, times the area of one triangle) coincide with that affine result for spring constants k",
    springsOrderedConvention: "², to 10⁻¹⁴ and 6 × 10⁻⁴. With equal spring constants we obtain ν = 1/6 at (φ, ψ, θ) = (1, 0.5, 0), where Eq. (9) gives 8/27. This may reflect a convention we have not identified; it is on our list of questions for the authors.",
    springsTryOrdered: "Show (1, 0.5)",
    springsTryEqualWeight: "(2, 0.5) at θ = 0.7, equal weight",
    springsOrientationAxis: "lattice orientation θ, rad",
    springsOrderedPlot: "Ordered lattice Poisson's ratio against orientation",
    springsSelectOrdered: "Select an ordered lattice (without dilution or prestress) to plot Eq. (9) against both spring laws.",
    springsUnreproduced: "We could not reproduce the simulation dots of Fig. 7: the paper does not say how its strip simulation measures Young’s modulus, and our reading (vertical force through mid-height over width and strain) does not reproduce those dots.",
    springsRigidityHeading: "Rigidity and connectivity (an independent check)",
    springsRigidity: "Not in the paper: removing bonds at random from the triangular lattice lowers the mean coordination z from 6. Maxwell’s count (2 degrees of freedom per node against z/2 bonds per node) says a generic network cannot be rigid below z = 4. Our moduli vanish to rounding at z = 3 and stay finite above about z = 3.9, the rigidity percolation threshold (e.g. Jacobs and Thorpe,",
    springsTryDilute: "Dilute to z ≈ 3.7",
    springsTryTension: "…and put it in tension",
    springsCoordinationAxis: "mean coordination z",
    springsModulusAxis: "modulus / k",
    springsModuliPlot: "Moduli against coordination",
    springsAllChecks: "All checks",
    springsChecksRun: "run in CI, each with its tolerance",
    springsCheck: "Check",
    springsObserved: "Observed",
    springsTolerance: "Tolerance",
    springsResult: "Result",
    springsLimitations: "Limitations",
    springsNoReference: "No reference code is public. Comparisons rest on the paper’s text, its closed forms, the vector data of Figs. 7–9 and a digitisation of the raster Fig. 5 (±0.002).",
    springsNotImplemented: "We have not implemented the paper’s own semi-analytical method (the nonaffine tensors W of its Eq. 20 in the mean-field approximation); we compare with its results.",
    springsLinearOnly: "Linear response only (small strain). The paper minimised the nonlinear energy at 1% strain; at that strain the difference is of order 1%.",
    springsSynchronous: "Live solves and the automatic sweep currently run synchronously on the main thread. Large or prestressed networks can block navigation and Pause until a solve returns. Terminable workers and precomputed replay are pending.",
    springsFreeEdges: "The strip’s free edges bias the measured ν by O(1/width); the periodic moduli have no such bias.",
    springsEnsemble: "Our ensemble (10 samples per η) estimates the mean to about ±0.005 at η ≤ 0.3 and ±0.01 near 0.5.",
    springsNotDesign: "Agreement with a paper is not validation against experiments, and nothing here is an engineering design result.",
    springsCodeReferences: "Code and references",
    springsImplementation: "Implementation, tests, reference values and their provenance:",
    springsArticleSupplement: "Article and Supplemental Material:",
    springsFiguresCredit: ", CC BY 4.0. Figures on this page are drawn from our own runs; the paper’s points are its published data.",
    springsFoamCredit: "Foam construction after J. Liu, Y. Nie, H. Tong and N. Xu,",
    springsPaperReference: ", the paper’s Ref. 27.",
    springsOpenFull: "Open full editor ↗",
    springsExportDisabled: "Editor export is disabled: prestress and geometric stiffness are not supported by this conversion.",
    springsRetryFull: "Retry opening full editor",
    springsEditorDescription: "Stabileo editor (production engine): this strip as an ordinary truss, end rows pinned, the far end moved by the imposed strain. Edit and press Solve. Bar forces are 1000 × the experiment’s (E·A/L = 1000 k kN/m).",
    springsLoadCurrent: "Load the experiment’s current network",
    springsRetryEditor: "Retry loading editor",
    springsLoadingEditor: "Loading the Stabileo editor…",
    springsEditorTitle: "Stabileo editor (production engine)",
    springsBundleMissing: "The simulation bundle is not part of this build (",
    springsBuildBundle: "). Build it with research/metamaterials/grossman-2026/wasm/build.sh.",
    springsLoadingSolver: "Loading the solver…",
    springsLiveSweep: "Live sweep of η in your browser (our solver)",
    springsPauseSweep: "Pause sweep",
    springsViewerLabel: "Stabileo viewer: the spring network coloured by axial force on its deformed shape",
    springsPlaceholder: "The network appears here.",
    springsSolverRefused: "The solver refused the input:",
    springsStripReadout: "ν, strip (paper’s protocol)",
    springsPeriodicReadout: "ν along the pull, periodic (exact)",
    springsAffineReadout: "B / k · G / k (affine)",
    springsCoordinationReadout: "coordination z · nonaffinity",
    springsNetwork: "Network",
    springsFoamOption: "Foam (random node shifts η)",
    springsOrderedOption: "Ordered triangular lattice (φ, ψ, θ)",
    springsHoneyOption: "Honeycomb (ℓ)",
    springsSquareOption: "Square lattice",
    springsDisorder: "Disorder η",
    springsDisorderLabel: "Disorder eta",
    springsShear: "Shear φ",
    springsPhi: "phi",
    springsElongation: "Elongation ψ",
    springsPsi: "psi",
    springsOrientation: "Orientation θ",
    springsTheta: "theta",
    springsLaw: "Spring law",
    springsEqualK: "equal k (Eq. 3)",
    springsCornerDistance: "Corner distance ℓ",
    springsEll: "ell",
    springsDiagonals: "Diagonals",
    springsBondsKept: "Bonds kept",
    springsBondsFraction: "Fraction of bonds kept",
    springsPrestressControl: "Prestress (rest lengths shortened)",
    springsPrestressLabel: "Prestress: rest lengths shortened by",
    springsStrain: "Imposed strain",
    springsDeformation: "Deformation ×",
    springsDeformationScale: "Deformation scale",
    springsSeed: "Seed",
    springsSeedLabel: "Random seed",
    springsResolveNote: "Every change re-solves the strip and the periodic cell at once (",
    springsResolveTime: "ms for the last one).",
    springsReferenceUnavailable: "None is public: the authors’ code is “available at request”",
    springsThisNetwork: "This network",
    springsThisPeriodic: "This network (periodic)",
    springsThisShear: "This network: G",
    springsPaperChecks: "comparisons with published paper values",
    springsIndependentChecks: "independent checks",
    springsIndeterminate: "indeterminate",
    springsAxialNormalized: "Axial force N / (k ε)",
    springsAxial: "Axial force N / k",
    springsNodes: "nodes",
    springsBars: "springs",
    springsStripSeries: "Ours, the paper’s 13 × 52 strip protocol",
    springsFigureSeries: "Paper, Fig. 5 simulations (digitised, with error bars)",
    springsTextSeries: "Paper, text: ν = 0 at η ≃ 0.46, −0.1 as η → 0.5",
    springsBulkSeries: "Bulk modulus B / k",
    springsShearSeries: "Shear modulus G / k",
    springsHoneyPaperSeries: "Paper, Eq. (23)",
    springsHoneySeries: "Ours, periodic network, k_radial = 10⁻³",
    springsOrderedPaperSeries: "Paper, Supplemental Eq. (9)",
    springsEqualWeightSeries: "Ours, equal-weight springs (k ∝ 1/ℓ²)",
    springsHookeanSeries: "Ours, equal Hookean springs (Eq. 3)",
    springsBandSeries: "Ours, periodic {cells}² cells, ±1 s.d. of {seeds} samples",
    springsMeanSeries: "Ours, periodic (exact moduli), mean of {seeds}",
    springsFullEditorError: "The full editor could not be opened:",
    springsAlt: "The auxetic spring network (eta = 0.5) from our run, bars coloured by axial force on the deformed strip",
    springsHook: "Shake the nodes of a triangular lattice of springs until it widens when pulled: a truss network solved in your browser, against the paper’s published numbers.",
    shauerHook: "Pull a notched plate apart and watch an AT2 phase-field crack form and run, solved in your browser and checked step by step against the author’s code.",

    forceComparisonTolerance: "force comparison tolerance",
    referenceDots: " (dots where the reference differs; none expected)",
    coarseMesh: "Coarse: h = 0.0025 mm",
    mediumMesh: "Medium: h = 0.00167 mm",
    referenceMesh: "Reference: 5 600 elements, h = 0.00125 mm",
    viewer: "Viewer",
    force: "Force",
    convergence: "Convergence",
    parameters: "Parameters",
    precomputedSeries: "Stabileo (Rust, precomputed replay)",
    browserSeries: "Stabileo (Rust, in this browser)",
    referenceSeries: "Reference code (Python, committed outputs)",
    referenceDifference: "difference from the reference",
    elasticLabel: "elastic",
    fractureLabel: "fracture Gc·Γ",
    elasticEnergy: "Elastic energy",
    fractureEnergy: "Fracture energy Gc·Γ",
    thisReplay: "This replay",
    thisRun: "This run",
    nonConverged: "Non-converged run",
    referenceMismatch: "Reference mismatch",
    damageField: "Damage d",
    stressAvailable: "Stress is available after a run in this browser",
    hideBroken: "Hide broken",
    hideBrokenHint: "Hide elements with two or more corners at d > 0.95 (the open crack)",
    plate: "Plate",
    crackBand: "Crack band",
    notchTip: "Notch tip",
    degradedStress: "σyy (degraded)",
    clampedColours: "colours clamped to [0, 1]",
    elementCentres: "kN/mm², element centres",
    pause: "Pause",
    play: "Play",
    equal: "equal",
    differs: "differs",
    pass: "✓ pass",
    fail: "✗ fail",
    notConvergedSuffix: " (not converged)",
    referenceLower: "reference",
    noLicence: "no licence",
    deformed: "Deformed",
    undeformed: "undeformed",
    inTime: "in",
    peakReferenceLabel: "Stabileo (blue), reference (orange halo): peak",
    peakLabel: "Stabileo: peak",
    viewerMeshLabel: "Stabileo viewer: {field} on the {shape} mesh",
    replaySource: "Replay of a run precomputed with this solver",
    liveSource: "Live computation in your browser",
    cachedSource: "Cached result (computed in this browser)",
    researchTitle: "Stabileo Research",
    galleryLead: "Computational-mechanics papers you can run. We re-implement published methods and validate against available reference code, published results, and independent checks, and let you run it here with your own parameters, in Stabileo’s viewer.",
    galleryDisclaimer: "Nothing here is an engineering result; agreement with a reference code is not a certification. Contributions:",
    damageAlt: "Damage field from our run of the experiment",
    missingPage: "No such research page",
    backToResearch: "Back to Stabileo Research",
    iterationsChartLabel: "Staggered iterations per load step, log scale",
    iterations: "iterations",
    loadStepLower: "load step",
    step: "step",
    residualSuffix: "· residual",
    shauerTitle: "Phase-field fracture of a notched plate",
    shauerLead: "A square plate with a notch from its left edge to the centre is pulled apart at the top. The AT2 phase-field model represents the crack as a damage field d between 0 (intact) and 1 (broken), smeared over a length ℓ. The experiment pane runs the Stabileo Rust implementation in Stabileo’s viewer; the orange curve is what the author’s Python code computed.",
    paperShows: "What the paper shows",
    paperOverview: "The article presents a self-contained Python finite element code, under 500 lines, for brittle fracture with the phase-field method, and uses it on three examples: a bar in tension compared with the one-dimensional AT2 solution, a single-edge notched plate in tension (this page), and a three-point bending test. We read the code in full (the article’s text was not accessible to us) and everything below about the method comes from it.",
    replayGrowth: "In the replay the damage grows smoothly ahead of the notch while",
    theForce: "the force",
    risesTo: "rises linearly to",
    peakStepLink: "the peak load (step 56)",
    nextIncrement: "; at the next increment",
    crackStepLink: "the crack runs through the plate in a single step (step 57)",
    afterComma: ", after",
    alternating308: "308 alternating iterations",
    forceDrops: ", and the force drops to almost zero.",
    finalState: "The final state",
    openCrack: "shows the open crack on the deformed plate.",
    modelHeading: "The model",
    displacement: "Displacement",
    bilinearModel: "and damage d are both bilinear on quadrilaterals, integrated with 2×2 Gauss points; plane strain, small strain, quasi-static loading.",
    elasticity: "Elasticity",
    fixedDamage: "at fixed d: div(g(d)",
    wholeStress: ")) = 0 with g(d) = (1 − d)², applied to the whole stress.",
    damageAT2: "Damage (AT2)",
    atFixed: "at fixed",
    drivingEnergy: "Driving energy",
    positiveStrains: "over the positive principal strains, with σ",
    hybridModel: "the undamaged principal stresses: elasticity is degraded fully while damage is driven by tension only, a “hybrid” formulation.",
    alternatingSolution: "Alternating solution",
    solvePerStep: "per load step: solve",
    currentDamage: "with the current d, then d with the new",
    residualThreshold: ", until the elasticity residual ‖K(d)u − f‖ falls below 10",
    irreversibility: "Irreversibility",
    noIrreversibility: ": none in the reference code; damage is recomputed from the current energy and is not bounded by 1.",
    enableHistory: "Turn on the history field",
    keepOnUnloading: "to keep it on unloading (not in the reference).",
    unitsAndPeak: "Units are kN and mm. The homogeneous AT2 peak stress σ",
    lengthStrength: "/ 256 ℓ) ≈ 2.82 kN/mm² here, so ℓ behaves as a strength as much as a regularisation length:",
    tryLength: "try ℓ = 0.015 mm",
    meshMatters: "and the peak load falls. The mesh matters too: the crack band needs elements a few times smaller than ℓ;",
    tryCoarse: "try the coarse mesh",
    reproductionHeading: "How we reproduced it",
    referenceProcedure: "The author’s code (commit 61037c6, MIT licence) was run unmodified for its three examples in Python 3.12.15 with numpy 2.1.3 and scipy 1.14.1; every step’s force, iteration count, residual and damage range, and nodal fields at chosen steps, were saved with a manifest of versions and checksums.",
    rustProcedure: "The Rust implementation regenerates the same meshes (bit-identical), applies the same boundary conditions, loop and stopping rule, and solves with the Stabileo engine’s sparse Cholesky factorisation.",
    checksProcedure: "named checks compare the two, each with a stated tolerance, in continuous integration. The browser bundle and the replay on this page are checked separately against the native build.",
    referenceComparison: "Comparison with the reference",
    validationChecks: "Validation checks",
    checksCaption: "validation checks run in CI, each with its tolerance",
    check: "Check",
    observed: "Observed",
    tolerance: "Tolerance",
    result: "Result",
    symmetryFinding: "One finding: the plate is symmetric about the notch plane, and the crack runs along the row of elements just above it in one code and just below it in the other. Which row is chosen is decided by floating-point round-off; against the mirror image the final damage fields differ by 3.085970368132962 × 10",
    toleranceMeaning: ". The thresholds in the table are comparison tolerances, not mathematical error bounds. Displacement fields are compared at example 1 step 50, example 2 step 56, and example 3 step 56.",
    stepTable: "Step table (",
    stepsParen: "steps)",
    residual: "residual",
    referenceForce: "reference F, kN",
    paperComparison: "Comparison with the paper",
    paperNotCompared: "Not done: the article’s full text was not accessible to us, so no number printed in it has been compared. Figures here come from our own runs.",
    limitations: "Limitations",
    noCertification: "Agreement with a reference code is not validation against experiments, and none of this is an engineering certification.",
    meshLimitation: "The reference mesh refines only a 0.04 × 0.04 mm box around the notch tip; beyond it the crack crosses elements wider than 3ℓ.",
    damageLimitation: "No bound constraints: damage can exceed 1 slightly (the reference reaches 1.0096 here and 1.0021897551918642 in example 1) and undershoot 0. The recorded Python reference outputs have minimum nodal damage 3.076336950017797e-08 (example 1), -0.0031224948220514573 (example 2), and -0.06024191772700118 (example 3). This also occurs in the reference code’s unconstrained AT2 discretization. Negative damage is unphysical: (1-d)² at the example 3 minimum is about 1.124, above intact stiffness. Assembly uses interpolated damage at quadrature points, so this is not a 12.4% assembled-stiffness error. The solver does not clamp damage; the replay’s quantized nodal field and colour scale clamp it for display.",
    iterationLimitation: "The alternating scheme is not accelerated; at unstable crack growth it can take hundreds of iterations in one step.",
    browserLimitation: "Browser runs are limited in mesh size and parameter range.",
    codeReferences: "Code and references",
    implementationOutputs: "Implementation, tests and reference outputs:",
    adaptationCredit: "(mesh generators and loop adapted from the MIT reference, credited in the source).",
    referenceCode: "Reference code:",
    comparisonMatches: "agrees with reference forces, iterations, pre-peak maximum damage, damage at steps 56/57/78 and displacement at step 56 (replay fields quantized; stress has no reference snapshot): peak",
    atStep: "at step",
    identicalIterationsAt: ", identical iterations at",
    stepsPeriod: "steps.",
    details: "Details",
    replayMismatch: "Replay build or configuration mismatch: reference comparison disabled.",
    show: "Show",
    display: "Display",
    view: "View",
    reactionCaption: "Reaction force against imposed top displacement",
    topDisplacementAxis: "top displacement u (mm)",
    referenceCurveNote: "The reference curve is shown only for the reference parameters.",
    againstReferenceCode: "against the reference code",
    peakForce: "Peak force",
    knAtStep: "kN at step",
    referenceSemicolon: "; reference",
    relativeForceDifference: "Largest relative force difference up to the peak:",
    relativeTestTolerance: "(test tolerance 1e-9).",
    absoluteForceDifference: "Largest absolute force difference, fracture included:",
    absoluteTestTolerance: "kN (test tolerance 1e-5).",
    identicalIterations: "Identical number of staggered iterations at",
    iterationsCaption: "Staggered iterations per load step",
    energies: "Energies",
    energyAxis: "energy (kN·mm)",
    youngModulus: "Young’s modulus",
    youngModulusLabel: "Young’s modulus E, kN/mm²",
    poissonRatio: "Poisson’s ratio",
    poissonRatioLabel: "Poisson’s ratio ν",
    fractureToughness: "Fracture toughness",
    fractureToughnessLabel: "Fracture toughness Gc, kN/mm",
    lengthScale: "Length scale",
    lengthScaleLabel: "Length scale ℓ, mm",
    topDisplacement: "Top displacement at t = 1",
    topDisplacementLabel: "Top displacement u at t = 1, mm",
    loadStep: "Load step",
    mesh: "Mesh",
    historyField: "History field (irreversibility; not in the reference)",
    planeStrainLoaded: "Plane strain, loaded to t = 0.8 (",
    refinedRatio: "kN/mm². h/ℓ in the refined box =",
    underResolved: "— under-resolved (h > ℓ/2)",
    stop: "Stop",
    restart: "Restart",
    run: "Run",
    solveAgain: "Solve again in this browser",
    backToReplay: "Back to the replay",
    solverUnavailable: "The in-browser solver couldn’t be loaded in this build; the replay above is still our solver’s run.",
    solvingStep: "Solving step",
    done: "Done:",
    steps: "steps",
    completedRunsKept: ". Completed runs are kept, so earlier parameters replay instantly.",
    stoppedAfter: "Stopped after",
    solverRefused: "The solver refused the input:",
    runReuseNote: "Run reuses a result already computed for these parameters, if there is one; Solve again recomputes it here (about 15–30 s).",
    runBrowserNote: "Run computes these parameters in your browser.",
    loadStepShown: "Load step shown",
    afterAuthors: "After",
    citeThis: "Cite this",
    citationTitle: "Stabileo Research, “",
    reproductionOf: "”, reproduction of",
    implementationLabel: ". Implementation:",
    atCommit: "at commit",
    engineCitation: ". Engine: the Stabileo engine at the same commit. Permanent links to this exact build are planned.",
    theExperiment: "The experiment",
    experiment: "Experiment",
    viewerUnavailable: "Stabileo’s viewer couldn’t be loaded in this build.",
    resetParameters: 'Reset to the reference-code parameters',
    sourceLabel: { 'crossref-abstract': 'from the abstract', 'publisher-abstract': 'from the abstract', 'repository-readme': 'from the code’s README', 'full-text': 'from the paper', 'reference-code': 'from the reference code' },
    summaryIntro: 'Summary in our words,',
    noAbstract: 'Abstract not available.',
    runIt: 'Run it',
    comingNext: 'Coming next',
    inProgress: 'in progress',
    catalog: 'On our list: papers we plan to reproduce',
    field: 'Field',
    status: 'Status',
    all: 'All',
    readRun: 'Read & run',
    paper: 'Paper',
    code: 'Code',
    openInStabileo: 'Open in Stabileo',
    editInStabileo: 'Edit in Stabileo',
    soon: 'coming with research mode',
    notDesign: 'Research, not a design tool',
    checksPass: 'checks pass',
    notCompared: 'Published figures not compared',
    research: 'Research',
    suggest: 'Suggest a paper to reproduce →',
    onlyEnglish: '',
    againstCode: 'Against the author’s code',
    againstBenchmark: 'Against closed form and native engine',
    againstPaper: 'Against the paper’s figures',
    of: 'of',
    seeChecks: 'see the checks',
    disclaimer: 'Research, not a design tool. Nothing here is an engineering result.',
    notComparedWhy: 'Not compared: the full text was not accessible to us',
    benchmark: {
      viewer: 'Viewer', path: 'Convergence / Path', parameters: 'Parameters', case: 'Case', riseSpan: 'Rise / span',
      loadDirection: 'Load direction', downward: 'Downward', upward: 'Upward', arcLengthStep: 'Initial arc-length step',
      recompute: 'Recompute live', stop: 'Stop', restart: 'Restart', backToReplay: 'Back to replay', play: 'Play', pause: 'Pause',
      step: 'Load step shown', reference: 'Reference', stabileo: 'Stabileo', error: 'Error', result: 'Result', reset: 'Reset parameters',
    },
  },
  es: {
    ferrariNumbers: "Con 10 elementos por miembro, |λ₁ − {reference}| = {error}, menor que la tolerancia {tolerance}. La máxima discrepancia escalada de las derivadas es {derivative}, menor que {derivativeTolerance}. Estas comprobaciones cubren solo la parte implementada.",
    ferrariTitle: "Pórtico de Roorda: reproducción en curso",
    ferrariLead: "Pandeo del motor de producción y trayectoria no lineal imperfecta. La comparación de coeficientes de Koiter está pendiente.",
    ferrariScope: "Qué se reproduce",
    ferrariScopeText: "Esta primera versión comprueba la carga crítica del pórtico simple de §2.1.2 con el motor de producción. También calcula una trayectoria imperfecta con su solver corrotacional de longitud de arco. La trayectoria no es una reproducción validada de la Figura 2b.",
    ferrariModel: "Dos miembros de 1 m, articulados en los extremos exteriores y unidos rígidamente en la esquina. E = 21 MPa, A = {area} m², J = 10⁻⁴/12 m⁴. La carga de referencia es 1 kN hacia abajo en la esquina. La trayectoria añade un momento de referencia de +{moment} kN·m; hay 10 elementos por miembro.",
    ferrariEvidence: "Evidencia y limitaciones",
    ferrariEvidenceText: "La carga de pandeo lineal se compara con el artículo. Cada derivada parcial de la energía del elemento hasta orden cuatro se comprueba por diferencias centrales en tres estados. Esto verifica las derivadas de esta energía de viga, no los coeficientes de Koiter.",
    ferrariMissing: "Aún no se reproducen α, β, la corrección de desplazamiento de segundo orden, los coeficientes analíticos ni la concordancia cerca de la bifurcación. La optimización, los modos múltiples, los conjuntos mayores y la validación experimental quedan fuera de esta versión.",
    ferrariBlocker: "El desplazamiento lineal escalado y el modo de pandeo lineal no satisfacen las ecuaciones del punto crítico no lineal en la prueba inicial. No se muestran coeficientes ni predicciones de ese cálculo rechazado. Primero deben resolverse el estado crítico y la normalización modal.",
    ferrariAuthors: "Preguntas para los autores",
    ferrariQuestions: "¿Podrían compartir el modelo mínimo de §2.1.2, la malla y la formulación de viga; la normalización y los signos que relacionan ξ con el giro de esquina; y los datos de α, β y longitud de arco? Los porcentajes de error impresos no coinciden con los valores redondeados.",
    ferrariReference: "Referencia publicada",
    ferrariReferenceText: "§2.1.2, páginas 4–5: solución analítica (λ₁, α, β) = ({closed}); numérica ({numerical}). Figura 2b en página 4. Son referencias, no coeficientes calculados aquí.",
    ferrariReplay: "Repetición precalculada (mismo solver de producción)",
    ferrariLive: "Cálculo en vivo en tu navegador",
    ferrariCached: "Resultado guardado de este navegador",
    ferrariRun: "Recalcular en vivo",
    ferrariStop: "Detener",
    ferrariRestart: "Reiniciar repetición",
    ferrariStep: "Muestra de trayectoria",
    ferrariFailed: "Falló el cálculo en vivo. Se conservaron los últimos datos mostrados.",
    ferrariPath: "Trayectoria de longitud de arco",
    ferrariTheta: "Giro de esquina (rad)",
    ferrariLambda: "Factor de carga λ",
    ferrariViewer: "Desplazamiento del pórtico de Roorda",
    ferrariDisclaimer: "Investigación, no una herramienta de diseño.",
    ferrariPending: "Comparación de Koiter pendiente",
    formPositionError: "Error máximo de posición respecto a la referencia",
    formForceError: "Error máximo de fuerza respecto a la referencia",
    formTitle: "Cuatro cables, un equilibrio",
    formLead: "Encuentra la forma del sistema de cuatro barras de la Fig. 2 con densidades de fuerza positivas. Cambia la carga, recalcula en Rust y abre la geometría como cercha en Stabileo.",
    formScopeTitle: "Qué se reproduce",
    formScope: "Esta primera versión implementa el equilibrio directo de la sección 2.1, Fig. 2 y Ec. (7). La red tiene un nudo libre y cuatro apoyos fijos. Su topología sigue el artículo; sus dimensiones y cargas se eligen aquí explícitamente, sin extraerlas de la figura. El artículo desarrolla diseño inverso diferenciable; esa contribución queda fuera de esta versión.",
    formMethodTitle: "El método directo",
    formMethod: "La densidad de fuerza es la tracción axial dividida por la longitud. Densidades positivas dan una matriz de equilibrio definida positiva a una red anclada. El crate de investigación ensambla la matriz y usa Cholesky disperso del motor de producción para las tres coordenadas. Las fuerzas resultan de f = qℓ.",
    formInputs: "Los apoyos están en (±2, ±2, 0) m. La carga base hacia abajo es 4 kN y cada densidad es 1 kN/m. La Ec. (7) da z = −1 m, longitud = 3 m y tracción = 3 kN. Son valores derivados para nuestros datos, no observaciones numéricas publicadas.",
    formEvidenceTitle: "Evidencia y tolerancias",
    formEvidence: "Cinco casos comparan cada coordenada y fuerza con jax_fdm sin modificar en float64. Las tolerancias absolutas son 1e-12 m para coordenadas, 1e-12 kN para fuerzas de referencia y residuos, y 1e-9 kN para fuerzas de la cercha de producción. El archivo de validación registra cada error observado. La reproducción recorre cargas con el mismo solver Rust; no representa iteraciones de convergencia.",
    formReference: "Referencia: jax_fdm, MIT, revisión 9a17fd379071fb3511ca914f46e8d1e8c286460e. El manifiesto registra SHA-256 del archivo fuente, hashes de resultados y entorno instalado. No se ha confirmado que esta revisión corresponda a la publicación.",
    formEngineTitle: "Qué verifica el motor de producción",
    formEngine: "El editor recibe la geometría, las traslaciones fijas de los apoyos y la misma carga vertical como cercha elástica lineal 3D. Con rigideces iguales, la simetría hace que sus fuerzas axiales coincidan con FDM. Los tests también verifican el desplazamiento vertical con la solución elástica exacta. Es un análisis separado de barras inicialmente sin tensión: no se transfieren pretensión ni rigidez geométrica.",
    formLimitsTitle: "Aún no reproducido",
    formLimits: "No incluye adjuntos, gradientes, optimización, cáscaras, tracción/compresión mixta, cargas dependientes de la forma, pandeo ni afirmaciones de velocidad. No se reproducen formas optimizadas ni valores tabulados del artículo. La vista previa es una proyección indicada; el editor contiene el modelo espacial completo.",
    formDisclaimer: "La concordancia con otro código no es validación experimental ni certificación de ingeniería.",
    formQuestionsTitle: "Preguntas para los autores",
    formQuestions: "¿Qué commit y entorno generaron el artículo? ¿Están disponibles los datos exactos de la Fig. 2? ¿Qué red pequeña y coordenadas, fuerzas y gradientes de referencia recomiendan para una posterior reproducción del diseño inverso?",
    formReplay: "Reproducción precalculada (mismo solver)",
    formLive: "Cálculo Rust en vivo",
    formForce: "Tracción del cable",
    formHeight: "Cota del nudo libre",
    formDensity: "Densidad de fuerza",
    formLoad: "Carga hacia abajo",
    formControls: "Controles de búsqueda de forma",
    formRun: "Recalcular en vivo",
    formComputing: "Calculando…",
    formStop: "Detener",
    formRestart: "Reiniciar",
    formOblique: "Proyección oblicua",
    formElevation: "Proyección de elevación",
    formProjectionNote: "Red espacial proyectada · apoyos en los cuatro extremos · geometría completa en el editor",
    formReplayStep: "Paso del barrido de carga",
    formFailed: "No se pudo cargar el cálculo o editor. El resultado mostrado no cambió; reintenta.",
    formExportNote: "Abre el resultado mostrado como cercha elástica sin tensión inicial. No exporta pretensión. Investigación, no herramienta de diseño.",
    formEditorLabel: "Investigación: geometría de cuatro cables, verificación de cercha sin tensión inicial",
    formAlt: "Proyección de nuestro equilibrio de cuatro cables",
    springsEqualWeight: "k ∝ 1/ℓ² (como Ec. 9)",
    springsCompressionLegend: "compresión positiva al dividir por ε negativo · tira comprimida de izquierda a derecha, filas extremas sujetas",
    springsTensionLegend: "tracción positiva · tira estirada de izquierda a derecha, filas extremas sujetas",
    springsZeroLegend: "deformación impuesta nula · filas extremas sujetas",
    springsEditorChanged: "El experimento cambió mientras se cargaba el editor. Reintentá para cargar la red actual.",
    springsEditorFailed: "No se pudo cargar el editor de Stabileo:",

    springsTitle: "Redes de resortes auxéticas",
    springsLead: "Estirá una tira de resortes de Hooke y observá cuánto se estrecha. Al desplazar los nodos de la red triangular, empieza a ensancharse: se vuelve auxética. La red de la derecha se resuelve en tu navegador como un reticulado con el motor de Stabileo, y la misma tira se abre en el editor real de Stabileo. No hay código de referencia público («disponible a pedido»), así que comparamos con los números, fórmulas y figuras publicados en el artículo, y con resultados exactos.",
    springsPaperShows: "Qué muestra el artículo",
    springsOverview: "Muchos materiales, desde redes de metamateriales hasta membranas celulares, se modelan como redes de resortes de Hooke. Grossman y Boudaoud deducen el continuo elástico equivalente usando solo la geometría y la topología de la red, y calculan los desplazamientos",
    springsNonaffine: "no afines",
    springsOverviewRelaxation: ": las desviaciones locales de un estiramiento uniforme que hacen que las redes desordenadas sean más blandas que la estimación de deformación uniforme. Contrastan la teoría con simulaciones de una tira estirada para tres familias: redes triangulares ordenadas, un panal que se vuelve reentrante y una «espuma» formada al desplazar aleatoriamente los nodos de una red triangular, que se vuelve",
    springsAuxetic: "auxética",
    springsOverviewAuxetic: "(coeficiente de Poisson negativo: se ensancha al estirarla) al aumentar el desorden.",
    springsTry: "Probalo:",
    springsPerfect: "red perfecta, η = 0",
    springsTryAuxetic: "η = 0.5, auxética",
    springsModel: "El modelo que resolvemos",
    springsSprings: "Resortes",
    springsJoin: "unen nodos; cada uno tiene rigidez",
    springsRestLength: ", longitud de reposo ℓ̄",
    springsCurrentLength: "y longitud actual ℓ",
    springsEnergy: ", y la energía es",
    springsModelViewer: "(Ec. 3 del artículo). Una red de resortes es un reticulado articulado, así que el panel derecho la muestra en el visor de Stabileo: cada barra coloreada por su fuerza axial, sobre la forma deformada. Calculamos dos cosas.",
    springsStripTest: "El ensayo de tira del artículo.",
    springsStripMethod: "Una tira de 13 × 52 (unos 800 nodos), con las filas superior e inferior sujetas y la superior desplazada según la deformación impuesta; el coeficiente de Poisson se obtiene del cambio de ancho entre los dos nodos de borde más cercanos a media altura, como en la Sec. V A del artículo. Se resuelve como un reticulado lineal con la factorización dispersa de Cholesky del motor de Stabileo; el mismo modelo resuelto por el análisis de reticulados 2D del motor de producción coincide hasta 10⁻¹⁴.",
    springsExactModuli: "Módulos efectivos exactos.",
    springsPeriodicMethod: "Una celda periódica bajo deformación macroscópica impuesta, con todos los nodos libres para relajarse: la rigidez restante es el tensor elástico C de la red, incluido el ablandamiento no afín, sin efectos de borde. El tensor de deformación uniforme (afín) es la misma suma sin relajación.",
    springsPrestress: "Pretensión",
    springsPrestressMethod: "(un agregado, ausente en los cálculos del artículo): longitudes de reposo acortadas una fracción, la red relajada hasta el equilibrio por el método de Newton y la respuesta lineal tomada alrededor de ese estado, incluido el aumento de rigidez por tracción.",
    springsComparison: "Comparación con el artículo",
    springsFoamHeading: "Espuma: la transición auxética",
    springsFoamComparison: "El artículo informa que ν disminuye con el desorden η, cruza cero en η ≃ 0.46 y alcanza −0.1 cuando η → 0.5. Nuestros módulos periódicos exactos (10 muestras de 26 × 26 celdas por cada η) cruzan cero en η = 0.446 y dan ν = −0.148 en η = 0.5. Es una comparación entre protocolos: nuestra media de celda periódica queda dentro de todas las barras de error de las simulaciones de tiras sujetas de 13 × 52 de la Fig. 5 para η ≤ 0.45; no valida nuestro protocolo de tira. El marcador del artículo en η = 0.49 es una flecha debajo del gráfico (aproximadamente −0.14); nuestro valor allí es −0.117.",
    springsDisorderAxis: "desorden η",
    springsPoissonAxis: "coeficiente de Poisson ν",
    springsFoamPlot: "Coeficiente de Poisson frente al desorden: nuestro resultado y el artículo",
    springsStripBias: "Nuestra implementación del protocolo de tira (trazo discontinuo) da 0.371 para la red perfecta, donde el valor exacto es 1/3 y la Fig. 5 del artículo muestra 0.331. El exceso es un efecto de borde libre de orden 1/ancho: las tiras de anchos 26 y 52 dan 0.354 y 0.345, extrapolando a 0.336. La tira del artículo no lo muestra, y su texto no detalla lo suficiente la medición para saber por qué.",
    springsHoneyHeading: "Panal: Ec. (23)",
    springsHoneyComparison: "Un panal de aristas unitarias cuyos vértices opuestos están separados 2ℓ es regular en ℓ = 1 y reentrante por debajo de ℓ = ½. El artículo triangula cada hexágono con un nodo central y resortes de rigidez 10⁻³ respecto de las aristas, y compara con la fórmula ν(ℓ) = −(2 − 4ℓ)(ℓ + ½)/(3 + 4ℓ − 4ℓ²). Nuestra red periódica coincide hasta 3.4 × 10⁻³ con esos resortes y hasta 3.4 × 10⁻⁶ con resortes de rigidez relativa 10⁻⁶: la diferencia es la rigidez propia de los resortes blandos.",
    springsTryHoney: "Mostrar ℓ = 0.25 (reentrante)",
    springsHoneyPlot: "Coeficiente de Poisson del panal: Ec. 23 y nuestra red",
    springsOrderedHeading: "Redes ordenadas: una observación sobre las constantes elásticas",
    springsOrderedComparison: "Para redes triangulares ordenadas, el artículo da una fórmula, la Ec. suplementaria (9), para ν en función de la forma de la celda (φ, ψ) y la orientación θ, graficada en la Fig. 4. Una red de Bravais no tiene desplazamientos no afines, así que la respuesta exacta es la de deformación uniforme, que calculamos independientemente. La Ec. suplementaria (9) y la línea de cálculo de la Fig. 7 (módulo de Young de la red (3, 2), leído de los datos vectoriales del PDF y multiplicado por el área de un triángulo) coinciden con ese resultado afín para constantes elásticas k",
    springsOrderedConvention: "², hasta 10⁻¹⁴ y 6 × 10⁻⁴. Con constantes elásticas iguales obtenemos ν = 1/6 en (φ, ψ, θ) = (1, 0.5, 0), donde la Ec. (9) da 8/27. Esto podría reflejar una convención que no identificamos; está en nuestra lista de preguntas para los autores.",
    springsTryOrdered: "Mostrar (1, 0.5)",
    springsTryEqualWeight: "(2, 0.5) con θ = 0.7, peso igual",
    springsOrientationAxis: "orientación de la red θ, rad",
    springsOrderedPlot: "Coeficiente de Poisson de la red ordenada frente a la orientación",
    springsSelectOrdered: "Elegí una red ordenada (sin dilución ni pretensión) para comparar la Ec. (9) con ambas leyes de resortes.",
    springsUnreproduced: "No pudimos reproducir los puntos de simulación de la Fig. 7: el artículo no indica cómo mide el módulo de Young su simulación de tira, y nuestra lectura (fuerza vertical a media altura dividida por el ancho y la deformación) no reproduce esos puntos.",
    springsRigidityHeading: "Rigidez y conectividad (un control independiente)",
    springsRigidity: "Fuera del artículo: quitar enlaces aleatoriamente de la red triangular reduce la coordinación media z desde 6. El conteo de Maxwell (2 grados de libertad por nodo frente a z/2 enlaces por nodo) indica que una red genérica no puede ser rígida por debajo de z = 4. Nuestros módulos se anulan hasta el redondeo en z = 3 y permanecen finitos por encima de aproximadamente z = 3.9, el umbral de percolación de rigidez (por ejemplo, Jacobs y Thorpe,",
    springsTryDilute: "Diluir hasta z ≈ 3.7",
    springsTryTension: "…y ponerla en tracción",
    springsCoordinationAxis: "coordinación media z",
    springsModulusAxis: "módulo / k",
    springsModuliPlot: "Módulos frente a la coordinación",
    springsAllChecks: "Todos los controles",
    springsChecksRun: "ejecutados en CI, cada uno con su tolerancia",
    springsCheck: "Control",
    springsObserved: "Observado",
    springsTolerance: "Tolerancia",
    springsResult: "Resultado",
    springsLimitations: "Limitaciones",
    springsNoReference: "No hay código de referencia público. Las comparaciones se basan en el texto del artículo, sus fórmulas, los datos vectoriales de las Figs. 7–9 y una digitalización de la Fig. 5 rasterizada (±0.002).",
    springsNotImplemented: "No implementamos el método semianalítico propio del artículo (los tensores no afines W de su Ec. 20 en la aproximación de campo medio); comparamos con sus resultados.",
    springsLinearOnly: "Solo respuesta lineal (pequeña deformación). El artículo minimizó la energía no lineal a una deformación de 1%; a esa deformación la diferencia es de orden 1%.",
    springsSynchronous: "Las resoluciones en vivo y el barrido automático se ejecutan actualmente de forma síncrona en el hilo principal. Las redes grandes o pretensadas pueden bloquear la navegación y Pausa hasta que termine el cálculo. Quedan pendientes los trabajadores interrumpibles y la reproducción precalculada.",
    springsFreeEdges: "Los bordes libres de la tira sesgan el ν medido en O(1/ancho); los módulos periódicos no tienen ese sesgo.",
    springsEnsemble: "Nuestro conjunto (10 muestras por η) estima la media con aproximadamente ±0.005 en η ≤ 0.3 y ±0.01 cerca de 0.5.",
    springsNotDesign: "Coincidir con un artículo no es validar contra experimentos, y nada aquí es un resultado de diseño de ingeniería.",
    springsCodeReferences: "Código y referencias",
    springsImplementation: "Implementación, pruebas, valores de referencia y su procedencia:",
    springsArticleSupplement: "Artículo y material suplementario:",
    springsFiguresCredit: ", CC BY 4.0. Las figuras de esta página provienen de nuestras propias ejecuciones; los puntos del artículo son sus datos publicados.",
    springsFoamCredit: "Construcción de espuma a partir de J. Liu, Y. Nie, H. Tong y N. Xu,",
    springsPaperReference: ", Ref. 27 del artículo.",
    springsOpenFull: "Abrir editor completo ↗",
    springsExportDisabled: "La exportación al editor está deshabilitada: esta conversión no admite pretensión ni rigidez geométrica.",
    springsRetryFull: "Reintentar abrir el editor completo",
    springsEditorDescription: "Editor de Stabileo (motor de producción): esta tira como un reticulado común, con las filas extremas articuladas y el extremo opuesto desplazado según la deformación impuesta. Editá y presioná Resolver. Las fuerzas en las barras son 1000 × las del experimento (E·A/L = 1000 k kN/m).",
    springsLoadCurrent: "Cargar la red actual del experimento",
    springsRetryEditor: "Reintentar cargar el editor",
    springsLoadingEditor: "Cargando el editor de Stabileo…",
    springsEditorTitle: "Editor de Stabileo (motor de producción)",
    springsBundleMissing: "El paquete de simulación no forma parte de esta compilación (",
    springsBuildBundle: "). Compilalo con research/metamaterials/grossman-2026/wasm/build.sh.",
    springsLoadingSolver: "Cargando el solver…",
    springsLiveSweep: "Barrido de η en vivo en tu navegador (nuestro solver)",
    springsPauseSweep: "Pausar barrido",
    springsViewerLabel: "Visor de Stabileo: la red de resortes coloreada por fuerza axial sobre su forma deformada",
    springsPlaceholder: "La red aparece aquí.",
    springsSolverRefused: "El solver rechazó la entrada:",
    springsStripReadout: "ν, tira (protocolo del artículo)",
    springsPeriodicReadout: "ν en la dirección de tracción, periódica (exacta)",
    springsAffineReadout: "B / k · G / k (afín)",
    springsCoordinationReadout: "coordinación z · no afinidad",
    springsNetwork: "Red",
    springsFoamOption: "Espuma (desplazamientos aleatorios de nodos η)",
    springsOrderedOption: "Red triangular ordenada (φ, ψ, θ)",
    springsHoneyOption: "Panal (ℓ)",
    springsSquareOption: "Red cuadrada",
    springsDisorder: "Desorden η",
    springsDisorderLabel: "Desorden eta",
    springsShear: "Corte φ",
    springsPhi: "phi",
    springsElongation: "Elongación ψ",
    springsPsi: "psi",
    springsOrientation: "Orientación θ",
    springsTheta: "theta",
    springsLaw: "Ley de resortes",
    springsEqualK: "k iguales (Ec. 3)",
    springsCornerDistance: "Distancia entre vértices ℓ",
    springsEll: "ell",
    springsDiagonals: "Diagonales",
    springsBondsKept: "Enlaces conservados",
    springsBondsFraction: "Fracción de enlaces conservados",
    springsPrestressControl: "Pretensión (longitudes de reposo acortadas)",
    springsPrestressLabel: "Pretensión: acortamiento de longitudes de reposo",
    springsStrain: "Deformación impuesta",
    springsDeformation: "Deformación ×",
    springsDeformationScale: "Escala de deformación",
    springsSeed: "Semilla",
    springsSeedLabel: "Semilla aleatoria",
    springsResolveNote: "Cada cambio vuelve a resolver la tira y la celda periódica a la vez (",
    springsResolveTime: "ms en el último cálculo).",
    springsReferenceUnavailable: "No hay código público: el de los autores está «disponible a pedido»",
    springsThisNetwork: "Esta red",
    springsThisPeriodic: "Esta red (periódica)",
    springsThisShear: "Esta red: G",
    springsPaperChecks: "comparaciones con valores publicados del artículo",
    springsIndependentChecks: "controles independientes",
    springsIndeterminate: "indeterminado",
    springsAxialNormalized: "Fuerza axial N / (k ε)",
    springsAxial: "Fuerza axial N / k",
    springsNodes: "nodos",
    springsBars: "resortes",
    springsStripSeries: "Nuestro resultado, protocolo de tira de 13 × 52 del artículo",
    springsFigureSeries: "Artículo, simulaciones de la Fig. 5 (digitalizadas, con barras de error)",
    springsTextSeries: "Artículo, texto: ν = 0 en η ≃ 0.46, −0.1 cuando η → 0.5",
    springsBulkSeries: "Módulo volumétrico B / k",
    springsShearSeries: "Módulo de corte G / k",
    springsHoneyPaperSeries: "Artículo, Ec. (23)",
    springsHoneySeries: "Nuestro resultado, red periódica, k_radial = 10⁻³",
    springsOrderedPaperSeries: "Artículo, Ec. suplementaria (9)",
    springsEqualWeightSeries: "Nuestro resultado, resortes de peso igual (k ∝ 1/ℓ²)",
    springsHookeanSeries: "Nuestro resultado, resortes de Hooke iguales (Ec. 3)",
    springsBandSeries: "Nuestro resultado, {cells}² celdas periódicas, ±1 desv. est. de {seeds} muestras",
    springsMeanSeries: "Nuestro resultado, periódico (módulos exactos), media de {seeds}",
    springsFullEditorError: "No se pudo abrir el editor completo:",
    springsAlt: "La red de resortes auxética (eta = 0.5) de nuestra ejecución, con barras coloreadas por fuerza axial en la tira deformada",
    springsHook: "Desplazá los nodos de una red triangular de resortes hasta que se ensanche al estirarla: un reticulado resuelto en tu navegador, comparado con los números publicados del artículo.",
    shauerHook: "Estirá una placa entallada y observá cómo se forma y avanza una grieta de campo de fase AT2, resuelta en tu navegador y verificada paso a paso contra el código del autor.",

    forceComparisonTolerance: "tolerancia de comparación de fuerzas",
    referenceDots: " (puntos donde la referencia difiere; no se espera ninguno)",
    coarseMesh: "Gruesa: h = 0.0025 mm",
    mediumMesh: "Media: h = 0.00167 mm",
    referenceMesh: "Referencia: 5 600 elementos, h = 0.00125 mm",
    viewer: "Visor",
    force: "Fuerza",
    convergence: "Convergencia",
    parameters: "Parámetros",
    precomputedSeries: "Stabileo (Rust, reproducción precalculada)",
    browserSeries: "Stabileo (Rust, en este navegador)",
    referenceSeries: "Código de referencia (Python, resultados versionados)",
    referenceDifference: "diferencia respecto a la referencia",
    elasticLabel: "elástica",
    fractureLabel: "fractura Gc·Γ",
    elasticEnergy: "Energía elástica",
    fractureEnergy: "Energía de fractura Gc·Γ",
    thisReplay: "Esta reproducción",
    thisRun: "Esta ejecución",
    nonConverged: "Ejecución sin convergencia",
    referenceMismatch: "Discrepancia con la referencia",
    damageField: "Daño d",
    stressAvailable: "La tensión está disponible después de una ejecución en este navegador",
    hideBroken: "Ocultar rotos",
    hideBrokenHint: "Ocultar elementos con dos o más esquinas con d > 0.95 (la grieta abierta)",
    plate: "Placa",
    crackBand: "Banda de la grieta",
    notchTip: "Punta de la entalla",
    degradedStress: "σyy (degradada)",
    clampedColours: "colores limitados a [0, 1]",
    elementCentres: "kN/mm², centros de elementos",
    pause: "Pausar",
    play: "Reproducir",
    equal: "igual",
    differs: "difiere",
    pass: "✓ aprobado",
    fail: "✗ fallido",
    notConvergedSuffix: " (sin convergencia)",
    referenceLower: "referencia",
    noLicence: "sin licencia",
    deformed: "Deformada",
    undeformed: "sin deformar",
    inTime: "en",
    peakReferenceLabel: "Stabileo (azul), referencia (halo naranja): pico",
    peakLabel: "Stabileo: pico",
    viewerMeshLabel: "Visor de Stabileo: {field} en la malla {shape}",
    replaySource: "Reproducción de una ejecución precalculada con este solver",
    liveSource: "Cálculo en vivo en tu navegador",
    cachedSource: "Resultado en caché (calculado en este navegador)",
    researchTitle: "Stabileo Research",
    galleryLead: "Artículos de mecánica computacional que podés ejecutar. Reimplementamos métodos publicados y los validamos contra el código de referencia disponible, resultados publicados y controles independientes, y te dejamos ejecutarlos aquí con tus propios parámetros, en el visor de Stabileo.",
    galleryDisclaimer: "Nada de esto es un resultado de ingeniería; la concordancia con un código de referencia no es una certificación. Contribuciones:",
    damageAlt: "Campo de daño de nuestra ejecución del experimento",
    missingPage: "No existe esa página de investigación",
    backToResearch: "Volver a Stabileo Research",
    iterationsChartLabel: "Iteraciones alternadas por paso de carga, escala logarítmica",
    iterations: "iteraciones",
    loadStepLower: "paso de carga",
    step: "paso",
    residualSuffix: "· residuo",
    shauerTitle: "Fractura por campo de fase de una placa entallada",
    shauerLead: "Una placa cuadrada con una entalla desde su borde izquierdo hasta el centro se tracciona desde arriba. El modelo de campo de fase AT2 representa la grieta como un campo de daño d entre 0 (intacto) y 1 (roto), distribuido sobre una longitud ℓ. El panel del experimento ejecuta la implementación Rust de Stabileo en su visor; la curva naranja es lo que calculó el código Python del autor.",
    paperShows: "Qué muestra el artículo",
    paperOverview: "El artículo presenta un código autónomo de elementos finitos en Python, de menos de 500 líneas, para la fractura frágil con el método de campo de fase, y lo aplica a tres ejemplos: una barra a tracción comparada con la solución unidimensional AT2, una placa con entalla en un borde sometida a tracción (esta página) y un ensayo de flexión en tres puntos. Leímos todo el código (no tuvimos acceso al texto del artículo) y todo lo que sigue sobre el método proviene de él.",
    replayGrowth: "En la reproducción el daño crece suavemente por delante de la entalla mientras",
    theForce: "la fuerza",
    risesTo: "crece linealmente hasta",
    peakStepLink: "la carga máxima (paso 56)",
    nextIncrement: "; en el siguiente incremento",
    crackStepLink: "la grieta atraviesa la placa en un solo paso (paso 57)",
    afterComma: ", después de",
    alternating308: "308 iteraciones alternadas",
    forceDrops: ", y la fuerza cae casi a cero.",
    finalState: "El estado final",
    openCrack: "muestra la grieta abierta en la placa deformada.",
    modelHeading: "El modelo",
    displacement: "Desplazamiento",
    bilinearModel: "y el daño d son ambos bilineales en cuadriláteros, integrados con 2×2 puntos de Gauss; deformación plana, pequeñas deformaciones, carga cuasiestática.",
    elasticity: "Elasticidad",
    fixedDamage: "con d fijo: div(g(d)",
    wholeStress: ")) = 0 con g(d) = (1 − d)², aplicado a toda la tensión.",
    damageAT2: "Daño (AT2)",
    atFixed: "con valor fijo de",
    drivingEnergy: "Energía impulsora",
    positiveStrains: "sobre las deformaciones principales positivas, con σ",
    hybridModel: "las tensiones principales sin daño: la elasticidad se degrada por completo mientras que el daño es impulsado solo por la tracción, una formulación «híbrida».",
    alternatingSolution: "Solución alternada",
    solvePerStep: "por paso de carga: resolver",
    currentDamage: "con el d actual, luego d con el nuevo",
    residualThreshold: ", hasta que el residuo de elasticidad ‖K(d)u − f‖ sea menor que 10",
    irreversibility: "Irreversibilidad",
    noIrreversibility: ": ninguna en el código de referencia; el daño se recalcula a partir de la energía actual y no está acotado por 1.",
    enableHistory: "Activá el campo de historia",
    keepOnUnloading: "para conservarlo durante la descarga (no está en la referencia).",
    unitsAndPeak: "Las unidades son kN y mm. La tensión máxima homogénea AT2 σ",
    lengthStrength: "/ 256 ℓ) ≈ 2.82 kN/mm² aquí, por lo que ℓ actúa tanto como una resistencia como una longitud de regularización:",
    tryLength: "probá ℓ = 0.015 mm",
    meshMatters: "y la carga máxima baja. La malla también importa: la banda de la grieta necesita elementos varias veces más pequeños que ℓ;",
    tryCoarse: "probá la malla gruesa",
    reproductionHeading: "Cómo lo reprodujimos",
    referenceProcedure: "El código del autor (commit 61037c6, licencia MIT) se ejecutó sin modificaciones para sus tres ejemplos en Python 3.12.15 con numpy 2.1.3 y scipy 1.14.1; la fuerza, el número de iteraciones, el residuo y el rango de daño de cada paso, y los campos nodales en pasos seleccionados, se guardaron con un manifiesto de versiones y sumas de comprobación.",
    rustProcedure: "La implementación Rust regenera las mismas mallas (idénticas bit a bit), aplica las mismas condiciones de contorno, bucle y criterio de parada, y resuelve con la factorización de Cholesky dispersa del motor de Stabileo.",
    checksProcedure: "controles con nombre comparan ambas implementaciones, cada uno con una tolerancia declarada, en integración continua. El paquete del navegador y la reproducción de esta página se verifican por separado frente a la compilación nativa.",
    referenceComparison: "Comparación con la referencia",
    validationChecks: "Controles de validación",
    checksCaption: "controles de validación ejecutados en CI, cada uno con su tolerancia",
    check: "Control",
    observed: "Observado",
    tolerance: "Tolerancia",
    result: "Resultado",
    symmetryFinding: "Un hallazgo: la placa es simétrica respecto al plano de la entalla, y la grieta avanza por la fila de elementos justo encima en un código y justo debajo en el otro. La fila elegida depende del redondeo en coma flotante; frente a la imagen especular los campos de daño finales difieren en 3.085970368132962 × 10",
    toleranceMeaning: ". Los umbrales de la tabla son tolerancias de comparación, no cotas matemáticas del error. Los campos de desplazamiento se comparan en el ejemplo 1 paso 50, el ejemplo 2 paso 56 y el ejemplo 3 paso 56.",
    stepTable: "Tabla de pasos (",
    stepsParen: "pasos)",
    residual: "residuo",
    referenceForce: "F de referencia, kN",
    paperComparison: "Comparación con el artículo",
    paperNotCompared: "No realizada: no tuvimos acceso al texto completo del artículo, por lo que no se comparó ningún número publicado en él. Las figuras aquí provienen de nuestras propias ejecuciones.",
    limitations: "Limitaciones",
    noCertification: "La concordancia con un código de referencia no es una validación frente a experimentos, y nada de esto es una certificación de ingeniería.",
    meshLimitation: "La malla de referencia refina solo una caja de 0.04 × 0.04 mm alrededor de la punta de la entalla; fuera de ella la grieta cruza elementos más anchos que 3ℓ.",
    damageLimitation: "Sin restricciones de cota: el daño puede superar ligeramente 1 (la referencia alcanza 1.0096 aquí y 1.0021897551918642 en el ejemplo 1) y caer por debajo de 0. Los resultados de referencia Python registrados tienen daños nodales mínimos de 3.076336950017797e-08 (ejemplo 1), -0.0031224948220514573 (ejemplo 2) y -0.06024191772700118 (ejemplo 3). Esto también ocurre en la discretización AT2 sin restricciones del código de referencia. El daño negativo no es físico: (1-d)² en el mínimo del ejemplo 3 es aproximadamente 1.124, por encima de la rigidez intacta. El ensamblaje usa daño interpolado en puntos de cuadratura, así que esto no es un error de 12.4% en la rigidez ensamblada. El solver no recorta el daño; el campo nodal cuantizado de la reproducción y la escala de colores lo recortan para su visualización.",
    iterationLimitation: "El esquema alternado no está acelerado; durante el crecimiento inestable de la grieta puede requerir cientos de iteraciones en un paso.",
    browserLimitation: "Las ejecuciones en el navegador están limitadas en tamaño de malla y rango de parámetros.",
    codeReferences: "Código y referencias",
    implementationOutputs: "Implementación, pruebas y resultados de referencia:",
    adaptationCredit: "(generadores de malla y bucle adaptados de la referencia MIT, con atribución en el código fuente).",
    referenceCode: "Código de referencia:",
    comparisonMatches: "concuerda con las fuerzas, iteraciones, daño máximo anterior al pico, daño en los pasos 56/57/78 y desplazamiento en el paso 56 de la referencia (campos de reproducción cuantizados; la tensión no tiene una instantánea de referencia): pico",
    atStep: "en el paso",
    identicalIterationsAt: ", iteraciones idénticas en",
    stepsPeriod: "pasos.",
    details: "Detalles",
    replayMismatch: "La compilación o configuración de la reproducción no coincide: comparación con la referencia desactivada.",
    show: "Mostrar",
    display: "Visualización",
    view: "Vista",
    reactionCaption: "Fuerza de reacción frente al desplazamiento superior impuesto",
    topDisplacementAxis: "desplazamiento superior u (mm)",
    referenceCurveNote: "La curva de referencia se muestra solo para los parámetros de referencia.",
    againstReferenceCode: "frente al código de referencia",
    peakForce: "Fuerza máxima",
    knAtStep: "kN en el paso",
    referenceSemicolon: "; referencia",
    relativeForceDifference: "Mayor diferencia relativa de fuerza hasta el pico:",
    relativeTestTolerance: "(tolerancia de prueba 1e-9).",
    absoluteForceDifference: "Mayor diferencia absoluta de fuerza, incluida la fractura:",
    absoluteTestTolerance: "kN (tolerancia de prueba 1e-5).",
    identicalIterations: "Número idéntico de iteraciones alternadas en",
    iterationsCaption: "Iteraciones alternadas por paso de carga",
    energies: "Energías",
    energyAxis: "energía (kN·mm)",
    youngModulus: "Módulo de Young",
    youngModulusLabel: "Módulo de Young E, kN/mm²",
    poissonRatio: "Coeficiente de Poisson",
    poissonRatioLabel: "Coeficiente de Poisson ν",
    fractureToughness: "Tenacidad a la fractura",
    fractureToughnessLabel: "Tenacidad a la fractura Gc, kN/mm",
    lengthScale: "Longitud característica",
    lengthScaleLabel: "Longitud característica ℓ, mm",
    topDisplacement: "Desplazamiento superior en t = 1",
    topDisplacementLabel: "Desplazamiento superior u en t = 1, mm",
    loadStep: "Paso de carga",
    mesh: "Malla",
    historyField: "Campo de historia (irreversibilidad; no está en la referencia)",
    planeStrainLoaded: "Deformación plana, cargada hasta t = 0.8 (",
    refinedRatio: "kN/mm². h/ℓ en la caja refinada =",
    underResolved: "— resolución insuficiente (h > ℓ/2)",
    stop: "Detener",
    restart: "Reiniciar",
    run: "Ejecutar",
    solveAgain: "Resolver de nuevo en este navegador",
    backToReplay: "Volver a la reproducción",
    solverUnavailable: "No se pudo cargar el solver del navegador en esta compilación; la reproducción de arriba sigue siendo una ejecución de nuestro solver.",
    solvingStep: "Resolviendo el paso",
    done: "Completado:",
    steps: "pasos",
    completedRunsKept: ". Las ejecuciones completas se guardan, por lo que los parámetros anteriores se reproducen al instante.",
    stoppedAfter: "Detenido después de",
    solverRefused: "El solver rechazó la entrada:",
    runReuseNote: "Ejecutar reutiliza un resultado ya calculado para estos parámetros, si existe; Resolver de nuevo lo recalcula aquí (unos 15–30 s).",
    runBrowserNote: "Ejecutar calcula estos parámetros en tu navegador.",
    loadStepShown: "Paso de carga mostrado",
    afterAuthors: "A partir de",
    citeThis: "Citar esto",
    citationTitle: "Stabileo Research, “",
    reproductionOf: "”, reproducción de",
    implementationLabel: ". Implementación:",
    atCommit: "en el commit",
    engineCitation: ". Motor: el motor de Stabileo en el mismo commit. Se prevén enlaces permanentes a esta compilación exacta.",
    theExperiment: "El experimento",
    experiment: "Experimento",
    viewerUnavailable: "No se pudo cargar el visor de Stabileo en esta compilación.",
    resetParameters: 'Restablecer los parámetros del código de referencia',
    sourceLabel: { 'crossref-abstract': 'a partir del resumen', 'publisher-abstract': 'a partir del resumen', 'repository-readme': 'a partir del README del código', 'full-text': 'a partir del artículo', 'reference-code': 'a partir del código de referencia' },
    summaryIntro: 'Resumen en nuestras palabras,',
    noAbstract: 'Resumen no disponible.',
    runIt: 'Ejecutalo',
    comingNext: 'Próximamente',
    inProgress: 'en curso',
    catalog: 'En nuestra lista: artículos que planeamos reproducir',
    field: 'Área',
    status: 'Estado',
    all: 'Todos',
    readRun: 'Leer y ejecutar',
    paper: 'Artículo',
    code: 'Código',
    openInStabileo: 'Abrir en Stabileo',
    editInStabileo: 'Editar en Stabileo',
    soon: 'llega con el modo investigación',
    notDesign: 'Investigación, no una herramienta de diseño',
    checksPass: 'controles aprobados',
    notCompared: 'Sin comparar con las figuras publicadas',
    research: 'Investigación',
    suggest: 'Sugerí un artículo para reproducir →',
    onlyEnglish: 'Este artículo está disponible solo en inglés.',
    againstCode: 'Frente al código del autor',
    againstBenchmark: 'Frente a la forma cerrada y al motor nativo',
    againstPaper: 'Frente a las figuras del artículo',
    of: 'de',
    seeChecks: 'ver los controles',
    disclaimer: 'Investigación, no una herramienta de diseño. Nada de esto es un resultado de ingeniería.',
    notComparedWhy: 'No comparado: no tuvimos acceso al texto completo',
    benchmark: {
      viewer: 'Visor', path: 'Convergencia / Trayectoria', parameters: 'Parámetros', case: 'Caso', riseSpan: 'Flecha / luz',
      loadDirection: 'Dirección de carga', downward: 'Hacia abajo', upward: 'Hacia arriba', arcLengthStep: 'Paso inicial de longitud de arco',
      recompute: 'Recalcular en vivo', stop: 'Detener', restart: 'Reiniciar', backToReplay: 'Volver a la repetición', play: 'Reproducir', pause: 'Pausar',
      step: 'Paso de carga mostrado', reference: 'Referencia', stabileo: 'Stabileo', error: 'Error', result: 'Resultado', reset: 'Restablecer parámetros',
    },
  },
  pt: {
    ferrariNumbers: "Com 10 elementos por membro, |λ₁ − {reference}| = {error}, abaixo da tolerância {tolerance}. A maior discrepância escalada das derivadas é {derivative}, abaixo de {derivativeTolerance}. Estas verificações cobrem apenas a parte implementada.",
    ferrariTitle: "Pórtico de Roorda: reprodução em andamento",
    ferrariLead: "Flambagem do motor de produção e trajetória não linear imperfeita. A comparação dos coeficientes de Koiter está pendente.",
    ferrariScope: "O que é reproduzido",
    ferrariScopeText: "Esta primeira versão verifica a carga crítica do pórtico simples da §2.1.2 com o motor de produção. Também calcula uma trajetória imperfeita com seu solver corrotacional de comprimento de arco. A trajetória não é uma reprodução validada da Figura 2b.",
    ferrariModel: "Dois membros de 1 m, articulados nas extremidades externas e unidos rigidamente no canto. E = 21 MPa, A = {area} m², J = 10⁻⁴/12 m⁴. A carga de referência é 1 kN para baixo no canto. A trajetória acrescenta um momento de referência de +{moment} kN·m; há 10 elementos por membro.",
    ferrariEvidence: "Evidência e limitações",
    ferrariEvidenceText: "A carga de flambagem linear é comparada com o artigo. Cada derivada parcial da energia do elemento até ordem quatro é verificada por diferenças centrais em três estados. Isso verifica as derivadas desta energia de viga, não os coeficientes de Koiter.",
    ferrariMissing: "Ainda não reproduzidos: α, β, a correção de deslocamento de segunda ordem, os coeficientes analíticos e a concordância perto da bifurcação. Otimização, modos múltiplos, conjuntos maiores e validação experimental ficam fora desta versão.",
    ferrariBlocker: "O deslocamento linear escalado e o modo de flambagem linear não satisfazem as equações do ponto crítico não linear na tentativa inicial. Não são mostrados coeficientes nem previsões desse cálculo rejeitado. Primeiro é preciso resolver o estado crítico e a normalização modal.",
    ferrariAuthors: "Perguntas aos autores",
    ferrariQuestions: "Poderiam compartilhar o modelo mínimo da §2.1.2, a malha e a formulação de viga; a normalização e os sinais que relacionam ξ à rotação do canto; e os dados de α, β e comprimento de arco? As porcentagens de erro publicadas não coincidem com os valores arredondados.",
    ferrariReference: "Referência publicada",
    ferrariReferenceText: "§2.1.2, páginas 4–5: solução analítica (λ₁, α, β) = ({closed}); numérica ({numerical}). Figura 2b na página 4. São referências, não coeficientes calculados aqui.",
    ferrariReplay: "Reprodução pré-calculada (mesmo solver de produção)",
    ferrariLive: "Cálculo ao vivo no navegador",
    ferrariCached: "Resultado armazenado deste navegador",
    ferrariRun: "Recalcular ao vivo",
    ferrariStop: "Parar",
    ferrariRestart: "Reiniciar reprodução",
    ferrariStep: "Amostra da trajetória",
    ferrariFailed: "O cálculo ao vivo falhou. Os últimos dados exibidos foram mantidos.",
    ferrariPath: "Trajetória de comprimento de arco",
    ferrariTheta: "Rotação do canto (rad)",
    ferrariLambda: "Fator de carga λ",
    ferrariViewer: "Deslocamento do pórtico de Roorda",
    ferrariDisclaimer: "Pesquisa, não uma ferramenta de projeto.",
    ferrariPending: "Comparação de Koiter pendente",
    formPositionError: "Erro máximo de posição em relação à referência",
    formForceError: "Erro máximo de força em relação à referência",
    formTitle: "Quatro cabos, um equilíbrio",
    formLead: "Encontre a forma do sistema de quatro barras da Fig. 2 com densidades de força positivas. Altere a carga, recalcule em Rust e abra a geometria como treliça no Stabileo.",
    formScopeTitle: "O que é reproduzido",
    formScope: "Esta primeira versão implementa o equilíbrio direto da seção 2.1, Fig. 2 e Eq. (7). A rede tem um nó livre e quatro apoios fixos. Sua topologia segue o artigo; dimensões e cargas são escolhidas aqui explicitamente, sem extraí-las da figura. O artigo desenvolve projeto inverso diferenciável; essa contribuição está fora desta versão.",
    formMethodTitle: "O método direto",
    formMethod: "A densidade de força é a tração axial dividida pelo comprimento. Densidades positivas dão uma matriz de equilíbrio definida positiva a uma rede ancorada. O crate de pesquisa monta a matriz e usa Cholesky esparso do motor de produção para as três coordenadas. As forças resultam de f = qℓ.",
    formInputs: "Os apoios estão em (±2, ±2, 0) m. A carga base para baixo é 4 kN e cada densidade é 1 kN/m. A Eq. (7) dá z = −1 m, comprimento = 3 m e tração = 3 kN. São valores derivados para nossos dados, não observações numéricas publicadas.",
    formEvidenceTitle: "Evidências e tolerâncias",
    formEvidence: "Cinco casos comparam cada coordenada e força com jax_fdm sem modificações em float64. As tolerâncias absolutas são 1e-12 m para coordenadas, 1e-12 kN para forças de referência e resíduos, e 1e-9 kN para forças da treliça de produção. O arquivo de validação registra cada erro observado. A reprodução percorre cargas com o mesmo solver Rust; não representa iterações de convergência.",
    formReference: "Referência: jax_fdm, MIT, revisão 9a17fd379071fb3511ca914f46e8d1e8c286460e. O manifesto registra SHA-256 do arquivo fonte, hashes de resultados e ambiente instalado. Não foi confirmado que esta revisão corresponda à publicação.",
    formEngineTitle: "O que o motor de produção verifica",
    formEngine: "O editor recebe a geometria, as translações fixas dos apoios e a mesma carga vertical como treliça elástica linear 3D. Com rigidezes iguais, a simetria faz suas forças axiais coincidirem com FDM. Os testes também verificam o deslocamento vertical com a solução elástica exata. É uma análise separada de barras inicialmente sem tensão: pré-tensão e rigidez geométrica não são transferidas.",
    formLimitsTitle: "Ainda não reproduzido",
    formLimits: "Não inclui adjuntos, gradientes, otimização, cascas, tração/compressão mista, cargas dependentes da forma, flambagem nem afirmações de velocidade. Não reproduz formas otimizadas nem valores tabelados do artigo. A prévia é uma projeção indicada; o editor contém o modelo espacial completo.",
    formDisclaimer: "A concordância com outro código não é validação experimental nem certificação de engenharia.",
    formQuestionsTitle: "Perguntas aos autores",
    formQuestions: "Qual commit e ambiente geraram o artigo? Os dados exatos da Fig. 2 estão disponíveis? Qual rede pequena e coordenadas, forças e gradientes de referência recomendam para uma futura reprodução do projeto inverso?",
    formReplay: "Reprodução pré-calculada (mesmo solver)",
    formLive: "Cálculo Rust ao vivo",
    formForce: "Tração do cabo",
    formHeight: "Cota do nó livre",
    formDensity: "Densidade de força",
    formLoad: "Carga para baixo",
    formControls: "Controles de busca de forma",
    formRun: "Recalcular ao vivo",
    formComputing: "Calculando…",
    formStop: "Parar",
    formRestart: "Reiniciar",
    formOblique: "Projeção oblíqua",
    formElevation: "Projeção de elevação",
    formProjectionNote: "Rede espacial projetada · apoios nas quatro extremidades · geometria completa no editor",
    formReplayStep: "Passo da varredura de carga",
    formFailed: "Não foi possível carregar o cálculo ou editor. O resultado exibido não mudou; tente novamente.",
    formExportNote: "Abre o resultado exibido como treliça elástica sem tensão inicial. Não exporta pré-tensão. Pesquisa, não ferramenta de projeto.",
    formEditorLabel: "Pesquisa: geometria de quatro cabos, verificação de treliça sem tensão inicial",
    formAlt: "Projeção do nosso equilíbrio de quatro cabos",
    springsEqualWeight: "k ∝ 1/ℓ² (como Eq. 9)",
    springsCompressionLegend: "compressão positiva após divisão por ε negativo · faixa comprimida da esquerda para a direita, fileiras extremas presas",
    springsTensionLegend: "tração positiva · faixa tracionada da esquerda para a direita, fileiras extremas presas",
    springsZeroLegend: "deformação imposta nula · fileiras extremas presas",
    springsEditorChanged: "O experimento mudou enquanto o editor carregava. Tente novamente para carregar a rede atual.",
    springsEditorFailed: "Não foi possível carregar o editor do Stabileo:",

    springsTitle: "Redes de molas auxéticas",
    springsLead: "Tracione uma faixa de molas de Hooke e veja quanto ela se estreita. Ao deslocar os nós da rede triangular, ela começa a alargar: torna-se auxética. A rede à direita é resolvida no seu navegador como uma treliça pelo motor do Stabileo, e a mesma faixa abre no editor real do Stabileo. Não há código de referência público («disponível mediante solicitação»), então comparamos com os números, fórmulas e figuras publicados no artigo e com resultados exatos.",
    springsPaperShows: "O que o artigo mostra",
    springsOverview: "Muitos materiais, de redes de metamateriais a membranas celulares, são modelados como redes de molas de Hooke. Grossman e Boudaoud deduzem o contínuo elástico equivalente usando apenas a geometria e a topologia da rede e calculam os deslocamentos",
    springsNonaffine: "não afins",
    springsOverviewRelaxation: ": os desvios locais de um alongamento uniforme que tornam as redes desordenadas mais flexíveis que a estimativa de deformação uniforme. Comparam a teoria com simulações de uma faixa tracionada para três famílias: redes triangulares ordenadas, uma colmeia que se torna reentrante e uma «espuma» formada ao deslocar aleatoriamente os nós de uma rede triangular, que se torna",
    springsAuxetic: "auxética",
    springsOverviewAuxetic: "(coeficiente de Poisson negativo: alarga ao ser tracionada) com o aumento da desordem.",
    springsTry: "Experimente:",
    springsPerfect: "rede perfeita, η = 0",
    springsTryAuxetic: "η = 0.5, auxética",
    springsModel: "O modelo que resolvemos",
    springsSprings: "Molas",
    springsJoin: "unem nós; cada uma tem rigidez",
    springsRestLength: ", comprimento de repouso ℓ̄",
    springsCurrentLength: "e comprimento atual ℓ",
    springsEnergy: ", e a energia é",
    springsModelViewer: "(Eq. 3 do artigo). Uma rede de molas é uma treliça articulada, então o painel direito a mostra no visualizador do Stabileo: cada barra colorida pela força axial, sobre a forma deformada. Calculamos duas coisas.",
    springsStripTest: "O ensaio de faixa do artigo.",
    springsStripMethod: "Uma faixa de 13 × 52 (cerca de 800 nós), com as fileiras superior e inferior presas e a superior deslocada conforme a deformação imposta; o coeficiente de Poisson é obtido da mudança de largura entre os dois nós de borda mais próximos da meia altura, como na Seç. V A do artigo. Resolvida como treliça linear pela fatoração esparsa de Cholesky do motor do Stabileo; o mesmo modelo resolvido pela análise de treliças 2D do motor de produção concorda até 10⁻¹⁴.",
    springsExactModuli: "Módulos efetivos exatos.",
    springsPeriodicMethod: "Uma célula periódica sob deformação macroscópica imposta, com todos os nós livres para relaxar: a rigidez restante é o tensor elástico C da rede, incluindo o amolecimento não afim, sem efeitos de borda. O tensor de deformação uniforme (afim) é a mesma soma sem relaxamento.",
    springsPrestress: "Pré-tensão",
    springsPrestressMethod: "(um acréscimo, ausente nos cálculos do artigo): comprimentos de repouso encurtados por uma fração, a rede relaxada até o equilíbrio pelo método de Newton e a resposta linear tomada nesse estado, incluindo o enrijecimento por tração.",
    springsComparison: "Comparação com o artigo",
    springsFoamHeading: "Espuma: a transição auxética",
    springsFoamComparison: "O artigo relata ν decrescendo com a desordem η, cruzando zero em η ≃ 0.46 e chegando a −0.1 quando η → 0.5. Nossos módulos periódicos exatos (10 amostras de 26 × 26 células para cada η) cruzam zero em η = 0.446 e dão ν = −0.148 em η = 0.5. É uma comparação entre protocolos: nossa média da célula periódica fica dentro de todas as barras de erro das simulações de faixas presas de 13 × 52 da Fig. 5 para η ≤ 0.45; isso não valida nosso protocolo de faixa. O marcador do artigo em η = 0.49 é uma seta abaixo do gráfico (cerca de −0.14); nosso valor ali é −0.117.",
    springsDisorderAxis: "desordem η",
    springsPoissonAxis: "coeficiente de Poisson ν",
    springsFoamPlot: "Coeficiente de Poisson em função da desordem: nosso resultado e o artigo",
    springsStripBias: "Nossa implementação do protocolo de faixa (tracejada) dá 0.371 para a rede perfeita, onde o valor exato é 1/3 e a Fig. 5 do artigo mostra 0.331. O excesso é um efeito de borda livre de ordem 1/largura: faixas de larguras 26 e 52 dão 0.354 e 0.345, extrapolando para 0.336. A faixa do artigo não o mostra, e o texto não detalha suficientemente a medição para sabermos por quê.",
    springsHoneyHeading: "Colmeia: Eq. (23)",
    springsHoneyComparison: "Uma colmeia de arestas unitárias cujos vértices opostos estão separados por 2ℓ é regular em ℓ = 1 e reentrante abaixo de ℓ = ½. O artigo triangula cada hexágono com um nó central e molas de rigidez 10⁻³ em relação às arestas, e compara com a fórmula ν(ℓ) = −(2 − 4ℓ)(ℓ + ½)/(3 + 4ℓ − 4ℓ²). Nossa rede periódica concorda até 3.4 × 10⁻³ com essas molas e até 3.4 × 10⁻⁶ com molas de rigidez relativa 10⁻⁶: a diferença é a própria rigidez das molas flexíveis.",
    springsTryHoney: "Mostrar ℓ = 0.25 (reentrante)",
    springsHoneyPlot: "Coeficiente de Poisson da colmeia: Eq. 23 e nossa rede",
    springsOrderedHeading: "Redes ordenadas: uma observação sobre as constantes elásticas",
    springsOrderedComparison: "Para redes triangulares ordenadas, o artigo fornece uma fórmula, a Eq. suplementar (9), para ν em função da forma da célula (φ, ψ) e da orientação θ, mostrada na Fig. 4. Uma rede de Bravais não tem deslocamentos não afins, portanto a resposta exata é a de deformação uniforme, que calculamos independentemente. A Eq. suplementar (9) e a linha de cálculo da Fig. 7 (módulo de Young da rede (3, 2), lido dos dados vetoriais do PDF e multiplicado pela área de um triângulo) coincidem com esse resultado afim para constantes elásticas k",
    springsOrderedConvention: "², até 10⁻¹⁴ e 6 × 10⁻⁴. Com constantes elásticas iguais obtemos ν = 1/6 em (φ, ψ, θ) = (1, 0.5, 0), onde a Eq. (9) dá 8/27. Isso pode refletir uma convenção que não identificamos; está na nossa lista de perguntas aos autores.",
    springsTryOrdered: "Mostrar (1, 0.5)",
    springsTryEqualWeight: "(2, 0.5) com θ = 0.7, peso igual",
    springsOrientationAxis: "orientação da rede θ, rad",
    springsOrderedPlot: "Coeficiente de Poisson da rede ordenada em função da orientação",
    springsSelectOrdered: "Selecione uma rede ordenada (sem diluição ou pré-tensão) para comparar a Eq. (9) com ambas as leis de molas.",
    springsUnreproduced: "Não conseguimos reproduzir os pontos de simulação da Fig. 7: o artigo não informa como sua simulação de faixa mede o módulo de Young, e nossa leitura (força vertical à meia altura dividida pela largura e pela deformação) não reproduz esses pontos.",
    springsRigidityHeading: "Rigidez e conectividade (uma verificação independente)",
    springsRigidity: "Fora do artigo: remover ligações aleatoriamente da rede triangular reduz a coordenação média z a partir de 6. A contagem de Maxwell (2 graus de liberdade por nó contra z/2 ligações por nó) indica que uma rede genérica não pode ser rígida abaixo de z = 4. Nossos módulos se anulam até o arredondamento em z = 3 e permanecem finitos acima de cerca de z = 3.9, o limiar de percolação de rigidez (por exemplo, Jacobs e Thorpe,",
    springsTryDilute: "Diluir até z ≈ 3.7",
    springsTryTension: "…e colocá-la em tração",
    springsCoordinationAxis: "coordenação média z",
    springsModulusAxis: "módulo / k",
    springsModuliPlot: "Módulos em função da coordenação",
    springsAllChecks: "Todas as verificações",
    springsChecksRun: "executados em CI, cada um com sua tolerância",
    springsCheck: "Verificação",
    springsObserved: "Observado",
    springsTolerance: "Tolerância",
    springsResult: "Resultado",
    springsLimitations: "Limitações",
    springsNoReference: "Não há código de referência público. As comparações se baseiam no texto do artigo, suas fórmulas, os dados vetoriais das Figs. 7–9 e uma digitalização da Fig. 5 rasterizada (±0.002).",
    springsNotImplemented: "Não implementamos o método semianalítico próprio do artigo (os tensores não afins W da sua Eq. 20 na aproximação de campo médio); comparamos com seus resultados.",
    springsLinearOnly: "Apenas resposta linear (pequena deformação). O artigo minimizou a energia não linear a uma deformação de 1%; nessa deformação a diferença é de ordem 1%.",
    springsSynchronous: "As resoluções ao vivo e a varredura automática são executadas atualmente de forma síncrona na thread principal. Redes grandes ou pré-tensionadas podem bloquear a navegação e Pausar até o fim do cálculo. Workers interrompíveis e reprodução pré-calculada estão pendentes.",
    springsFreeEdges: "As bordas livres da faixa enviesam o ν medido em O(1/largura); os módulos periódicos não têm esse viés.",
    springsEnsemble: "Nosso conjunto (10 amostras por η) estima a média com cerca de ±0.005 em η ≤ 0.3 e ±0.01 perto de 0.5.",
    springsNotDesign: "Concordar com um artigo não é validar contra experimentos, e nada aqui é um resultado de projeto de engenharia.",
    springsCodeReferences: "Código e referências",
    springsImplementation: "Implementação, testes, valores de referência e sua origem:",
    springsArticleSupplement: "Artigo e material suplementar:",
    springsFiguresCredit: ", CC BY 4.0. As figuras desta página vêm das nossas próprias execuções; os pontos do artigo são seus dados publicados.",
    springsFoamCredit: "Construção de espuma a partir de J. Liu, Y. Nie, H. Tong e N. Xu,",
    springsPaperReference: ", Ref. 27 do artigo.",
    springsOpenFull: "Abrir editor completo ↗",
    springsExportDisabled: "A exportação para o editor está desativada: esta conversão não suporta pré-tensão nem rigidez geométrica.",
    springsRetryFull: "Tentar abrir o editor completo novamente",
    springsEditorDescription: "Editor do Stabileo (motor de produção): esta faixa como uma treliça comum, com as fileiras extremas articuladas e a extremidade oposta deslocada conforme a deformação imposta. Edite e pressione Resolver. As forças nas barras são 1000 × as do experimento (E·A/L = 1000 k kN/m).",
    springsLoadCurrent: "Carregar a rede atual do experimento",
    springsRetryEditor: "Tentar carregar o editor novamente",
    springsLoadingEditor: "Carregando o editor do Stabileo…",
    springsEditorTitle: "Editor do Stabileo (motor de produção)",
    springsBundleMissing: "O pacote de simulação não faz parte desta compilação (",
    springsBuildBundle: "). Compile com research/metamaterials/grossman-2026/wasm/build.sh.",
    springsLoadingSolver: "Carregando o solver…",
    springsLiveSweep: "Varredura de η ao vivo no seu navegador (nosso solver)",
    springsPauseSweep: "Pausar varredura",
    springsViewerLabel: "Visualizador do Stabileo: a rede de molas colorida pela força axial sobre sua forma deformada",
    springsPlaceholder: "A rede aparece aqui.",
    springsSolverRefused: "O solver rejeitou a entrada:",
    springsStripReadout: "ν, faixa (protocolo do artigo)",
    springsPeriodicReadout: "ν na direção de tração, periódica (exata)",
    springsAffineReadout: "B / k · G / k (afim)",
    springsCoordinationReadout: "coordenação z · não afinidade",
    springsNetwork: "Rede",
    springsFoamOption: "Espuma (deslocamentos aleatórios de nós η)",
    springsOrderedOption: "Rede triangular ordenada (φ, ψ, θ)",
    springsHoneyOption: "Colmeia (ℓ)",
    springsSquareOption: "Rede quadrada",
    springsDisorder: "Desordem η",
    springsDisorderLabel: "Desordem eta",
    springsShear: "Cisalhamento φ",
    springsPhi: "phi",
    springsElongation: "Alongamento ψ",
    springsPsi: "psi",
    springsOrientation: "Orientação θ",
    springsTheta: "theta",
    springsLaw: "Lei das molas",
    springsEqualK: "k iguais (Eq. 3)",
    springsCornerDistance: "Distância entre vértices ℓ",
    springsEll: "ell",
    springsDiagonals: "Diagonais",
    springsBondsKept: "Ligações mantidas",
    springsBondsFraction: "Fração de ligações mantidas",
    springsPrestressControl: "Pré-tensão (comprimentos de repouso encurtados)",
    springsPrestressLabel: "Pré-tensão: encurtamento dos comprimentos de repouso",
    springsStrain: "Deformação imposta",
    springsDeformation: "Deformação ×",
    springsDeformationScale: "Escala de deformação",
    springsSeed: "Semente",
    springsSeedLabel: "Semente aleatória",
    springsResolveNote: "Cada alteração resolve novamente a faixa e a célula periódica de uma vez (",
    springsResolveTime: "ms no último cálculo).",
    springsReferenceUnavailable: "Não há código público: o dos autores está «disponível mediante solicitação»",
    springsThisNetwork: "Esta rede",
    springsThisPeriodic: "Esta rede (periódica)",
    springsThisShear: "Esta rede: G",
    springsPaperChecks: "comparações com valores publicados do artigo",
    springsIndependentChecks: "verificações independentes",
    springsIndeterminate: "indeterminado",
    springsAxialNormalized: "Força axial N / (k ε)",
    springsAxial: "Força axial N / k",
    springsNodes: "nós",
    springsBars: "molas",
    springsStripSeries: "Nosso resultado, protocolo de faixa de 13 × 52 do artigo",
    springsFigureSeries: "Artigo, simulações da Fig. 5 (digitalizadas, com barras de erro)",
    springsTextSeries: "Artigo, texto: ν = 0 em η ≃ 0.46, −0.1 quando η → 0.5",
    springsBulkSeries: "Módulo volumétrico B / k",
    springsShearSeries: "Módulo de cisalhamento G / k",
    springsHoneyPaperSeries: "Artigo, Eq. (23)",
    springsHoneySeries: "Nosso resultado, rede periódica, k_radial = 10⁻³",
    springsOrderedPaperSeries: "Artigo, Eq. suplementar (9)",
    springsEqualWeightSeries: "Nosso resultado, molas de peso igual (k ∝ 1/ℓ²)",
    springsHookeanSeries: "Nosso resultado, molas de Hooke iguais (Eq. 3)",
    springsBandSeries: "Nosso resultado, {cells}² células periódicas, ±1 desvio padrão de {seeds} amostras",
    springsMeanSeries: "Nosso resultado, periódico (módulos exatos), média de {seeds}",
    springsFullEditorError: "Não foi possível abrir o editor completo:",
    springsAlt: "A rede de molas auxética (eta = 0.5) da nossa execução, com barras coloridas pela força axial na faixa deformada",
    springsHook: "Desloque os nós de uma rede triangular de molas até que ela alargue ao ser tracionada: uma treliça resolvida no seu navegador, comparada com os números publicados do artigo.",
    shauerHook: "Tracione uma placa entalhada e veja uma fissura de campo de fase AT2 se formar e avançar, resolvida no seu navegador e verificada passo a passo contra o código do autor.",

    forceComparisonTolerance: "tolerância de comparação de forças",
    referenceDots: " (pontos onde a referência difere; nenhum esperado)",
    coarseMesh: "Grossa: h = 0.0025 mm",
    mediumMesh: "Média: h = 0.00167 mm",
    referenceMesh: "Referência: 5 600 elementos, h = 0.00125 mm",
    viewer: "Visualizador",
    force: "Força",
    convergence: "Convergência",
    parameters: "Parâmetros",
    precomputedSeries: "Stabileo (Rust, reprodução pré-calculada)",
    browserSeries: "Stabileo (Rust, neste navegador)",
    referenceSeries: "Código de referência (Python, resultados versionados)",
    referenceDifference: "diferença em relação à referência",
    elasticLabel: "elástica",
    fractureLabel: "fratura Gc·Γ",
    elasticEnergy: "Energia elástica",
    fractureEnergy: "Energia de fratura Gc·Γ",
    thisReplay: "Esta reprodução",
    thisRun: "Esta execução",
    nonConverged: "Execução sem convergência",
    referenceMismatch: "Discrepância com a referência",
    damageField: "Dano d",
    stressAvailable: "A tensão fica disponível após uma execução neste navegador",
    hideBroken: "Ocultar rompidos",
    hideBrokenHint: "Ocultar elementos com dois ou mais cantos com d > 0.95 (a fissura aberta)",
    plate: "Placa",
    crackBand: "Faixa da fissura",
    notchTip: "Ponta do entalhe",
    degradedStress: "σyy (degradada)",
    clampedColours: "cores limitadas a [0, 1]",
    elementCentres: "kN/mm², centros dos elementos",
    pause: "Pausar",
    play: "Reproduzir",
    equal: "igual",
    differs: "difere",
    pass: "✓ aprovado",
    fail: "✗ falhou",
    notConvergedSuffix: " (sem convergência)",
    referenceLower: "referência",
    noLicence: "sem licença",
    deformed: "Deformada",
    undeformed: "sem deformação",
    inTime: "em",
    peakReferenceLabel: "Stabileo (azul), referência (halo laranja): pico",
    peakLabel: "Stabileo: pico",
    viewerMeshLabel: "Visualizador do Stabileo: {field} na malha {shape}",
    replaySource: "Reprodução de uma execução pré-calculada com este solver",
    liveSource: "Cálculo ao vivo no seu navegador",
    cachedSource: "Resultado em cache (calculado neste navegador)",
    researchTitle: "Stabileo Research",
    galleryLead: "Artigos de mecânica computacional que você pode executar. Reimplementamos métodos publicados e validamos em relação ao código de referência disponível, resultados publicados e verificações independentes, e permitimos que você os execute aqui com seus próprios parâmetros, no visualizador do Stabileo.",
    galleryDisclaimer: "Nada aqui é um resultado de engenharia; a concordância com um código de referência não é uma certificação. Contribuições:",
    damageAlt: "Campo de dano da nossa execução do experimento",
    missingPage: "Essa página de pesquisa não existe",
    backToResearch: "Voltar ao Stabileo Research",
    iterationsChartLabel: "Iterações alternadas por passo de carga, escala logarítmica",
    iterations: "iterações",
    loadStepLower: "passo de carga",
    step: "passo",
    residualSuffix: "· resíduo",
    shauerTitle: "Fratura por campo de fase de uma placa entalhada",
    shauerLead: "Uma placa quadrada com um entalhe da borda esquerda até o centro é tracionada pelo topo. O modelo de campo de fase AT2 representa a fissura como um campo de dano d entre 0 (íntegro) e 1 (rompido), distribuído ao longo de um comprimento ℓ. O painel do experimento executa a implementação Rust do Stabileo em seu visualizador; a curva laranja é o que o código Python do autor calculou.",
    paperShows: "O que o artigo mostra",
    paperOverview: "O artigo apresenta um código autônomo de elementos finitos em Python, com menos de 500 linhas, para fratura frágil pelo método de campo de fase, e o aplica a três exemplos: uma barra sob tração comparada com a solução unidimensional AT2, uma placa com entalhe em uma borda sob tração (esta página) e um ensaio de flexão em três pontos. Lemos todo o código (não tivemos acesso ao texto do artigo) e tudo abaixo sobre o método vem dele.",
    replayGrowth: "Na reprodução o dano cresce suavemente à frente do entalhe enquanto",
    theForce: "a força",
    risesTo: "cresce linearmente até",
    peakStepLink: "a carga máxima (passo 56)",
    nextIncrement: "; no incremento seguinte",
    crackStepLink: "a fissura atravessa a placa em um único passo (passo 57)",
    afterComma: ", após",
    alternating308: "308 iterações alternadas",
    forceDrops: ", e a força cai para quase zero.",
    finalState: "O estado final",
    openCrack: "mostra a fissura aberta na placa deformada.",
    modelHeading: "O modelo",
    displacement: "Deslocamento",
    bilinearModel: "e o dano d são ambos bilineares em quadriláteros, integrados com 2×2 pontos de Gauss; estado plano de deformação, pequenas deformações, carregamento quase estático.",
    elasticity: "Elasticidade",
    fixedDamage: "com d fixo: div(g(d)",
    wholeStress: ")) = 0 com g(d) = (1 − d)², aplicado a toda a tensão.",
    damageAT2: "Dano (AT2)",
    atFixed: "com valor fixo de",
    drivingEnergy: "Energia motriz",
    positiveStrains: "sobre as deformações principais positivas, com σ",
    hybridModel: "as tensões principais sem dano: a elasticidade é degradada integralmente enquanto o dano é impulsionado apenas pela tração, uma formulação “híbrida”.",
    alternatingSolution: "Solução alternada",
    solvePerStep: "por passo de carga: resolver",
    currentDamage: "com o d atual, depois d com o novo",
    residualThreshold: ", até que o resíduo de elasticidade ‖K(d)u − f‖ fique abaixo de 10",
    irreversibility: "Irreversibilidade",
    noIrreversibility: ": nenhuma no código de referência; o dano é recalculado a partir da energia atual e não é limitado por 1.",
    enableHistory: "Ative o campo de histórico",
    keepOnUnloading: "para mantê-lo durante o descarregamento (não está na referência).",
    unitsAndPeak: "As unidades são kN e mm. A tensão máxima homogênea AT2 σ",
    lengthStrength: "/ 256 ℓ) ≈ 2.82 kN/mm² aqui, portanto ℓ atua tanto como uma resistência quanto como um comprimento de regularização:",
    tryLength: "experimente ℓ = 0.015 mm",
    meshMatters: "e a carga máxima diminui. A malha também importa: a faixa da fissura precisa de elementos algumas vezes menores que ℓ;",
    tryCoarse: "experimente a malha grossa",
    reproductionHeading: "Como reproduzimos",
    referenceProcedure: "O código do autor (commit 61037c6, licença MIT) foi executado sem modificações para seus três exemplos em Python 3.12.15 com numpy 2.1.3 e scipy 1.14.1; a força, a contagem de iterações, o resíduo e a faixa de dano de cada passo, e os campos nodais em passos selecionados, foram salvos com um manifesto de versões e somas de verificação.",
    rustProcedure: "A implementação Rust regenera as mesmas malhas (idênticas bit a bit), aplica as mesmas condições de contorno, laço e critério de parada, e resolve com a fatoração de Cholesky esparsa do motor do Stabileo.",
    checksProcedure: "verificações nomeadas comparam as duas implementações, cada uma com uma tolerância declarada, na integração contínua. O pacote do navegador e a reprodução desta página são verificados separadamente em relação à compilação nativa.",
    referenceComparison: "Comparação com a referência",
    validationChecks: "Verificações de validação",
    checksCaption: "verificações de validação executadas em CI, cada uma com sua tolerância",
    check: "Verificação",
    observed: "Observado",
    tolerance: "Tolerância",
    result: "Resultado",
    symmetryFinding: "Uma constatação: a placa é simétrica em relação ao plano do entalhe, e a fissura percorre a fileira de elementos logo acima em um código e logo abaixo no outro. A fileira escolhida depende do arredondamento em ponto flutuante; em relação à imagem espelhada os campos de dano finais diferem em 3.085970368132962 × 10",
    toleranceMeaning: ". Os limiares da tabela são tolerâncias de comparação, não limites matemáticos do erro. Os campos de deslocamento são comparados no exemplo 1 passo 50, exemplo 2 passo 56 e exemplo 3 passo 56.",
    stepTable: "Tabela de passos (",
    stepsParen: "passos)",
    residual: "resíduo",
    referenceForce: "F de referência, kN",
    paperComparison: "Comparação com o artigo",
    paperNotCompared: "Não realizada: não tivemos acesso ao texto completo do artigo, portanto nenhum número publicado nele foi comparado. As figuras aqui vêm das nossas próprias execuções.",
    limitations: "Limitações",
    noCertification: "A concordância com um código de referência não é uma validação em relação a experimentos, e nada disso é uma certificação de engenharia.",
    meshLimitation: "A malha de referência refina apenas uma caixa de 0.04 × 0.04 mm ao redor da ponta do entalhe; fora dela a fissura atravessa elementos mais largos que 3ℓ.",
    damageLimitation: "Sem restrições de limite: o dano pode exceder ligeiramente 1 (a referência atinge 1.0096 aqui e 1.0021897551918642 no exemplo 1) e ficar abaixo de 0. Os resultados de referência Python registrados têm danos nodais mínimos de 3.076336950017797e-08 (exemplo 1), -0.0031224948220514573 (exemplo 2) e -0.06024191772700118 (exemplo 3). Isso também ocorre na discretização AT2 sem restrições do código de referência. Dano negativo não é físico: (1-d)² no mínimo do exemplo 3 é aproximadamente 1.124, acima da rigidez íntegra. A montagem usa dano interpolado nos pontos de quadratura, portanto isso não é um erro de 12.4% na rigidez montada. O solver não limita o dano; o campo nodal quantizado da reprodução e a escala de cores o limitam para exibição.",
    iterationLimitation: "O esquema alternado não é acelerado; durante o crescimento instável da fissura pode exigir centenas de iterações em um passo.",
    browserLimitation: "As execuções no navegador são limitadas em tamanho de malha e faixa de parâmetros.",
    codeReferences: "Código e referências",
    implementationOutputs: "Implementação, testes e resultados de referência:",
    adaptationCredit: "(geradores de malha e laço adaptados da referência MIT, com atribuição no código-fonte).",
    referenceCode: "Código de referência:",
    comparisonMatches: "concorda com as forças, iterações, dano máximo anterior ao pico, dano nos passos 56/57/78 e deslocamento no passo 56 da referência (campos da reprodução quantizados; a tensão não tem instantâneo de referência): pico",
    atStep: "no passo",
    identicalIterationsAt: ", iterações idênticas em",
    stepsPeriod: "passos.",
    details: "Detalhes",
    replayMismatch: "A compilação ou configuração da reprodução não corresponde: comparação com a referência desativada.",
    show: "Mostrar",
    display: "Exibição",
    view: "Vista",
    reactionCaption: "Força de reação em função do deslocamento superior imposto",
    topDisplacementAxis: "deslocamento superior u (mm)",
    referenceCurveNote: "A curva de referência é mostrada apenas para os parâmetros de referência.",
    againstReferenceCode: "em relação ao código de referência",
    peakForce: "Força máxima",
    knAtStep: "kN no passo",
    referenceSemicolon: "; referência",
    relativeForceDifference: "Maior diferença relativa de força até o pico:",
    relativeTestTolerance: "(tolerância do teste 1e-9).",
    absoluteForceDifference: "Maior diferença absoluta de força, incluindo a fratura:",
    absoluteTestTolerance: "kN (tolerância do teste 1e-5).",
    identicalIterations: "Número idêntico de iterações alternadas em",
    iterationsCaption: "Iterações alternadas por passo de carga",
    energies: "Energias",
    energyAxis: "energia (kN·mm)",
    youngModulus: "Módulo de Young",
    youngModulusLabel: "Módulo de Young E, kN/mm²",
    poissonRatio: "Coeficiente de Poisson",
    poissonRatioLabel: "Coeficiente de Poisson ν",
    fractureToughness: "Tenacidade à fratura",
    fractureToughnessLabel: "Tenacidade à fratura Gc, kN/mm",
    lengthScale: "Comprimento característico",
    lengthScaleLabel: "Comprimento característico ℓ, mm",
    topDisplacement: "Deslocamento superior em t = 1",
    topDisplacementLabel: "Deslocamento superior u em t = 1, mm",
    loadStep: "Passo de carga",
    mesh: "Malha",
    historyField: "Campo de histórico (irreversibilidade; não está na referência)",
    planeStrainLoaded: "Estado plano de deformação, carregado até t = 0.8 (",
    refinedRatio: "kN/mm². h/ℓ na caixa refinada =",
    underResolved: "— resolução insuficiente (h > ℓ/2)",
    stop: "Parar",
    restart: "Reiniciar",
    run: "Executar",
    solveAgain: "Resolver novamente neste navegador",
    backToReplay: "Voltar à reprodução",
    solverUnavailable: "Não foi possível carregar o solver do navegador nesta compilação; a reprodução acima continua sendo uma execução do nosso solver.",
    solvingStep: "Resolvendo o passo",
    done: "Concluído:",
    steps: "passos",
    completedRunsKept: ". As execuções concluídas são mantidas, então os parâmetros anteriores são reproduzidos instantaneamente.",
    stoppedAfter: "Parado após",
    solverRefused: "O solver rejeitou a entrada:",
    runReuseNote: "Executar reutiliza um resultado já calculado para estes parâmetros, se houver; Resolver novamente o recalcula aqui (cerca de 15–30 s).",
    runBrowserNote: "Executar calcula estes parâmetros no seu navegador.",
    loadStepShown: "Passo de carga exibido",
    afterAuthors: "A partir de",
    citeThis: "Citar isto",
    citationTitle: "Stabileo Research, “",
    reproductionOf: "”, reprodução de",
    implementationLabel: ". Implementação:",
    atCommit: "no commit",
    engineCitation: ". Motor: o motor do Stabileo no mesmo commit. Estão previstos links permanentes para esta compilação exata.",
    theExperiment: "O experimento",
    experiment: "Experimento",
    viewerUnavailable: "Não foi possível carregar o visualizador do Stabileo nesta compilação.",
    resetParameters: 'Restaurar os parâmetros do código de referência',
    sourceLabel: { 'crossref-abstract': 'a partir do resumo', 'publisher-abstract': 'a partir do resumo', 'repository-readme': 'a partir do README do código', 'full-text': 'a partir do artigo', 'reference-code': 'a partir do código de referência' },
    summaryIntro: 'Resumo em nossas palavras,',
    noAbstract: 'Resumo não disponível.',
    runIt: 'Execute',
    comingNext: 'Em breve',
    inProgress: 'em andamento',
    catalog: 'Na nossa lista: artigos que planejamos reproduzir',
    field: 'Área',
    status: 'Status',
    all: 'Todos',
    readRun: 'Ler e executar',
    paper: 'Artigo',
    code: 'Código',
    openInStabileo: 'Abrir no Stabileo',
    editInStabileo: 'Editar no Stabileo',
    soon: 'chega com o modo pesquisa',
    notDesign: 'Pesquisa, não uma ferramenta de projeto',
    checksPass: 'verificações aprovadas',
    notCompared: 'Sem comparar com as figuras publicadas',
    research: 'Pesquisa',
    suggest: 'Sugira um artigo para reproduzir →',
    onlyEnglish: 'Este artigo está disponível apenas em inglês.',
    againstCode: 'Frente ao código do autor',
    againstBenchmark: 'Frente à forma fechada e ao motor nativo',
    againstPaper: 'Frente às figuras do artigo',
    of: 'de',
    seeChecks: 'ver as verificações',
    disclaimer: 'Pesquisa, não uma ferramenta de projeto. Nada aqui é um resultado de engenharia.',
    notComparedWhy: 'Não comparado: não tivemos acesso ao texto completo',
    benchmark: {
      viewer: 'Visualizador', path: 'Convergência / Caminho', parameters: 'Parâmetros', case: 'Caso', riseSpan: 'Flecha / vão',
      loadDirection: 'Direção da carga', downward: 'Para baixo', upward: 'Para cima', arcLengthStep: 'Passo inicial de comprimento de arco',
      recompute: 'Recalcular ao vivo', stop: 'Parar', restart: 'Reiniciar', backToReplay: 'Voltar à reprodução', play: 'Reproduzir', pause: 'Pausar',
      step: 'Passo de carga mostrado', reference: 'Referência', stabileo: 'Stabileo', error: 'Erro', result: 'Resultado', reset: 'Restaurar parâmetros',
    },
  },
};

export function rs(): ResearchStrings {
  return STRINGS[publicI18n.locale as keyof typeof STRINGS] ?? STRINGS.en;
}

export const FIELD_NAMES: Record<string, Record<string, string>> = {
  en: { fracture: 'Fracture and damage', 'differentiable-fem': 'Differentiable FEM', optimization: 'Optimization', metamaterials: 'Metamaterials', constitutive: 'Constitutive models', 'digital-twins': 'Digital twins', 'numerical-methods': 'Numerical methods', seismic: 'Seismic and dynamics', shells: 'Shells and buckling' },
  es: { fracture: 'Fractura y daño', 'differentiable-fem': 'FEM diferenciable', optimization: 'Optimización', metamaterials: 'Metamateriales', constitutive: 'Modelos constitutivos', 'digital-twins': 'Gemelos digitales', 'numerical-methods': 'Métodos numéricos', seismic: 'Sísmica y dinámica', shells: 'Cáscaras y pandeo' },
  pt: { fracture: 'Fratura e dano', 'differentiable-fem': 'MEF diferenciável', optimization: 'Otimização', metamaterials: 'Metamateriais', constitutive: 'Modelos constitutivos', 'digital-twins': 'Gêmeos digitais', 'numerical-methods': 'Métodos numéricos', seismic: 'Sísmica e dinâmica', shells: 'Cascas e flambagem' },
};

export const STATUS_NAMES: Record<string, Record<string, string>> = {
  en: { proposed: 'Proposed', 'reference-reproduced': 'Reference reproduced', 'implementation-in-progress': 'Implementation in progress', 'numerically-validated': 'Numerically validated', 'published-figures-compared': 'Published figures compared', interactive: 'Interactive' },
  es: { proposed: 'Propuesto', 'reference-reproduced': 'Referencia reproducida', 'implementation-in-progress': 'Implementación en curso', 'numerically-validated': 'Validado numéricamente', 'published-figures-compared': 'Comparado con las figuras publicadas', interactive: 'Interactivo' },
  pt: { proposed: 'Proposto', 'reference-reproduced': 'Referência reproduzida', 'implementation-in-progress': 'Implementação em andamento', 'numerically-validated': 'Validado numericamente', 'published-figures-compared': 'Comparado com as figuras publicadas', interactive: 'Interativo' },
};

export const fieldName = (f: string) => FIELD_NAMES[publicI18n.locale]?.[f] ?? FIELD_NAMES.en[f] ?? f;
export const statusName = (s: string) => STATUS_NAMES[publicI18n.locale]?.[s] ?? STATUS_NAMES.en[s] ?? s;

/** The language actually used by the research strings, including fallback. */
export const researchLocale = () => ['es', 'pt'].includes(publicI18n.locale) ? publicI18n.locale : 'en';
