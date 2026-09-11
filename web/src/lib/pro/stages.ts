import { TWO_D_INTERNAL_FORCE_LABELS as F2D } from '../geometry/coordinate-system';

/**
 * PRO's command tree — ONE definition, read by every surface that shows it.
 *
 * ## Why this is not inside `ProRibbon.svelte` any more
 *
 * It was, and that was fine while the ribbon was the only thing that drew it.
 * The phone draws the same commands too: it cannot show a four-stage ribbon in
 * 375 px, so it shows the stage's commands as a grid inside the panel instead.
 * Two surfaces, one set of commands — and if the set lived in one of them,
 * adding a command would mean remembering to add it to the other.
 *
 * PRO is under active development, so that is not a hypothetical. The point of
 * this module is that **adding a command is one line here** and both the
 * desktop ribbon and the phone grid pick it up, with no layout to revisit in
 * either. `__tests__/stages-coherence.test.ts` guards the rules a new entry has
 * to satisfy — above all that its tab is mapped below, which is the one a
 * reader has no reason to know about.
 *
 * ## Four stages, not five
 *
 * Examples and DXF are document commands and live in the block with Project and
 * Save; Report is the deliverable of an analysis, not a file operation, so it
 * sits in ANALYSE beside Solve. With those placed, a DOCUMENT stage had nothing
 * left to hold.
 *
 * ## Why a function and not a constant
 *
 * Several commands need to know things only a component can answer — whether a
 * solve is possible, whether there is anything to report, what to call when
 * pressed, and which steps a gated command is still waiting on. Those come in
 * as `ProStageContext` rather than being reached for, so this module imports no
 * stores and can be read, and tested, on its own.
 */

export type ProCmd = {
  id: string;
  labelKey: string;
  icon?: string;
  /** A literal symbol, for N / My / Vz — these are not translated. */
  label?: string;
  /** Turns the icon, for a force about a perpendicular axis. */
  rotate?: number;
  /** Destination: which panel view this opens. */
  tab?: string;
  /** Sets the diagram drawn on the model. */
  diagram?: string;
  action?: () => void;
  enabled?: () => boolean;
  /**
   * One sentence saying what the command opens, when its label cannot.
   *
   * "Generators" names a category, not a destination. Rendered into the `title`
   * AND into a visually-hidden description the button points at, because a
   * `title` reaches neither a keyboard nor a screen reader.
   */
  descKey?: string;
  /**
   * The steps still missing, as i18n keys, when the command is gated.
   *
   * A LIST rather than a sentence so a disabled button can name each one —
   * "solve first" is not what is missing when the model is solved and the
   * detailing has not been generated.
   */
  blockedKeys?: () => string[];
  /** Shown only when the group is expanded. Desktop ribbon only. */
  overflow?: boolean;
};

export type ProGroup = { id: string; labelKey: string; cmds: ProCmd[] };
export type ProStage = { id: string; labelKey: string; home: string; groups: ProGroup[] };

/**
 * What the stages need from whoever is drawing them.
 *
 * Everything a command cannot answer for itself. Adding a field here is the
 * signal that a command has grown a dependency on live state — which is worth
 * noticing, because both surfaces then have to supply it.
 */
export type ProStageContext = {
  /** A solve has produced results — the diagrams depend on it. */
  solved: boolean;
  canSolve: boolean;
  canReport: boolean;
  onSolve: () => void;
  onReport: () => void;
  /** Opens the 3-D reinforcement workspace. */
  onRebar3D: () => void;
  canRebar3D: () => boolean;
  /** Which steps that workspace is still waiting on, as i18n keys. */
  rebar3DMissingSteps: () => string[];
};

export function buildProStages(ctx: ProStageContext): ProStage[] {
  const {
    solved, canSolve, canReport, onSolve, onReport,
    onRebar3D, canRebar3D, rebar3DMissingSteps,
  } = ctx;
  return [
    {
      id: 'model',
      labelKey: 'proRibbon.stageModel',
      home: 'nodes',
      groups: [
        {
          id: 'geometry',
          labelKey: 'ribbon.groupDraw',
          cmds: [
            { id: 'nodes', labelKey: 'pro.tabNodes', icon: 'node', tab: 'nodes' },
            { id: 'elements', labelKey: 'pro.tabElements', icon: 'element', tab: 'elements' },
            { id: 'shells', labelKey: 'pro.tabShells', icon: 'shell', tab: 'shells' },
          ],
        },
        {
          id: 'properties',
          labelKey: 'proRibbon.groupProperties',
          cmds: [
            { id: 'materials', labelKey: 'pro.tabMaterials', icon: 'material', tab: 'materials' },
            { id: 'sections', labelKey: 'pro.tabSections', icon: 'section', tab: 'sections' },
          ],
        },
        /*
         * Generators are their own sub-section, to the RIGHT of Properties.
         *
         * They were folded into Draw, beside nodes and elements, on the reasoning that a
         * generator draws. It does — but Draw is where you place one thing at a time, and a
         * generator replaces the whole model from a parameter form. Sitting in the same group
         * as `Nodes` made it read as one more drawing tool, and sitting anywhere near
         * Properties made it read as a property of the model.
         *
         * Last in the stage because that is the order of the work: draw or generate, then
         * give what you have its materials and sections.
         */
        {
          id: 'generators',
          labelKey: 'proRibbon.groupGenerators',
          cmds: [
            {
              // Named for what it opens, not for its category. "Generators" is the SECTION;
              // a button repeating it would say the same word twice and still not say that
              // what comes out is a truss, a latticed column or a shed.
              id: 'generators',
              labelKey: 'proRibbon.cmdSteelStructures',
              descKey: 'proRibbon.cmdSteelStructuresDesc',
              icon: 'examples',
              tab: 'generators',
            },
          ],
        },
      ],
    },
    {
      id: 'conditions',
      labelKey: 'ribbon.groupConditions',
      home: 'supports',
      groups: [
        {
          id: 'restraints',
          labelKey: 'proRibbon.groupRestraints',
          cmds: [
            { id: 'supports', labelKey: 'pro.tabSupports', icon: 'support', tab: 'supports' },
            { id: 'constraints', labelKey: 'pro.tabConstraints', icon: 'constraint', tab: 'constraints' },
          ],
        },
        {
          id: 'loads',
          labelKey: 'proRibbon.groupLoads',
          cmds: [
            { id: 'loads', labelKey: 'pro.tabLoads', icon: 'load', tab: 'loads' },
          ],
        },
      ],
    },
    {
      id: 'analyse',
      labelKey: 'ribbon.tabAnalyse',
      home: 'results',
      groups: [
        {
          id: 'run',
          labelKey: 'proRibbon.groupRun',
          cmds: [
            { id: 'solve', labelKey: 'pro.solve', icon: 'solve', action: onSolve, enabled: () => canSolve },
            { id: 'advanced', labelKey: 'ribbon.advanced', icon: 'advanced', tab: 'advanced' },
          ],
        },
        /*
         * The diagrams belong in the ribbon, as they do in Basic.
         *
         * They were a <select> inside the Results panel — eleven entries in a
         * dropdown, for the control an engineer touches more than any other
         * after solving. Basic reaches them in one click from the row that is
         * always on screen, and there is no reason PRO should be slower at the
         * same job. Same order and same symbols as Basic (N, My, Vz, Mz, Vy,
         * T), because a user who moves between modes should not have to
         * relearn where the moment diagram is.
         */
        {
          id: 'diagrams',
          labelKey: 'ribbon.tabResults',
          cmds: [
            { id: 'none', labelKey: 'ribbon.noDiagram', icon: 'none', diagram: 'none', enabled: () => solved },
            { id: 'deformed', labelKey: 'ribbon.deformed', icon: 'deformed', diagram: 'deformed', enabled: () => solved },
            { id: 'axial', label: F2D.axial, labelKey: 'ribbon.nameAxial', icon: 'axial', diagram: 'axial', enabled: () => solved },
            { id: 'momentY', label: 'My', labelKey: 'ribbon.nameMomentY', icon: 'moment', diagram: 'momentY', enabled: () => solved },
            { id: 'shearZ', label: 'Vz', labelKey: 'ribbon.nameShearZ', icon: 'shear', diagram: 'shearZ', enabled: () => solved },
            { id: 'momentZ', label: 'Mz', labelKey: 'ribbon.nameMomentZ', icon: 'moment', rotate: 90, diagram: 'momentZ', enabled: () => solved },
            { id: 'shearY', label: 'Vy', labelKey: 'ribbon.nameShearY', icon: 'shear', rotate: 90, diagram: 'shearY', enabled: () => solved },
            { id: 'torsion', label: 'T', labelKey: 'ribbon.nameTorsion', icon: 'torsion', diagram: 'torsion', enabled: () => solved },
          ],
        },
        /*
         * Not quantities: whole-model colourings. A colour map paints every
         * member by a variable you choose, and the verification map paints them
         * by their code-check outcome — neither is "a diagram of X", so they do
         * not belong in the row of six that are.
         */
        {
          id: 'maps',
          labelKey: 'proRibbon.groupMaps',
          cmds: [
            { id: 'colorMap', labelKey: 'pro.diagColorMap', icon: 'view2d', diagram: 'colorMap', enabled: () => solved },
            { id: 'verification', labelKey: 'pro.diagVerification', icon: 'support', diagram: 'verification', enabled: () => solved },
          ],
        },
        {
          id: 'inspect',
          labelKey: 'proRibbon.groupInspect',
          cmds: [
            { id: 'results', labelKey: 'ribbon.results', icon: 'data', tab: 'results', enabled: () => solved },
            { id: 'diagnostics', labelKey: 'pro.tabDiagnostics', icon: 'advanced', tab: 'diagnostics' },
          ],
        },
        {
          id: 'output',
          labelKey: 'proRibbon.groupOutput',
          cmds: [
            { id: 'report', labelKey: 'pro.reportBtn', icon: 'project', action: onReport, enabled: () => canReport },
          ],
        },
      ],
    },
    {
      id: 'design',
      labelKey: 'proRibbon.stageDesign',
      home: 'design',
      groups: [
        /*
         * Two materials, two sub-sections — not one group with three buttons.
         *
         * The first arrangement put Design, Metallic structures and Connections side by side
         * under the Concrete heading, which said that the metallic surface was part of the
         * concrete workflow. It is not: it is a different material, a different code, and a
         * different maturity. Reading the row left to right you could not tell which button
         * designed concrete and which one did not.
         *
         * Same stage, because an engineer on a mixed structure moves between them without
         * changing where they are. Separate groups, because that is the sentence the ribbon
         * is for: what this does, and to what.
         */
        {
          id: 'rc',
          labelKey: 'proRibbon.groupDesign',
          cmds: [
            {
              // "Design" alone answered nothing once a second material appeared beside it.
              id: 'design',
              labelKey: 'proRibbon.cmdRebarDesign',
              descKey: 'proRibbon.cmdRebarDesignDesc',
              icon: 'settings',
              tab: 'design',
            },
            {
              /*
               * The SAME operation as the button on the Design overview and the one inside
               * the detailing section. All of them call `openRebar3D`, so the cage on screen
               * is a projection of one document instance — three ways in, one thing that
               * happens. A fourth viewer is exactly what this must not be.
               */
              id: 'rebar3d',
              labelKey: 'proRibbon.cmdRebar3D',
              descKey: 'proRibbon.cmdRebar3DDesc',
              icon: 'view3d',
              action: onRebar3D,
              enabled: canRebar3D,
              blockedKeys: rebar3DMissingSteps,
            },
          ],
        },
        {
          id: 'steel',
          labelKey: 'proRibbon.groupSteel',
          cmds: [
            {
              /*
               * The entry point the future profile workflow lands on — the same tab that
               * today shows the metallic inventory. Deliberately NOT a second button beside
               * the old "Metallic structures" one: that button became this one.
               *
               * Its label says `design`, and the panel it opens says in its own banner that
               * it verifies nothing. That is the honest pairing: the command names the place,
               * the surface states its maturity. See `steel.panel.experimentalBanner`.
               */
              id: 'steel',
              labelKey: 'proRibbon.cmdSteelProfiles',
              descKey: 'proRibbon.cmdSteelProfilesDesc',
              icon: 'section',
              tab: 'steel',
            },
            {
              /*
               * Renamed from "Connections" after auditing what it does, not before.
               *
               * `ProConnectionsTab` computes exactly two things — `checkBoltGroup` and
               * `checkFilletWeld` — over bolt grades 4.6 to 10.9 and fillet welds with a
               * plate thickness and an Fexx. Both are steel connection checks; there is no
               * concrete, timber or masonry path in `connection-design.ts`, which mentions
               * no material at all. So the narrower name hides nothing.
               *
               * What it does NOT narrow: mixed joints. `ProConnectionsTab` hands
               * `detectJoints` the metallic inventory's verdict, so a joint with no
               * metallic member at all is not listed — and the panel says how many it
               * hid. A steel beam framing into a concrete column still is listed, with
               * its members split by material, because that is a real detail an
               * engineer checks.
               */
              id: 'connections',
              labelKey: 'proRibbon.cmdSteelJoints',
              descKey: 'proRibbon.cmdSteelJointsDesc',
              icon: 'element',
              tab: 'connections',
            },
          ],
        },
      ],
    },];
}

/**
 * Which stage owns each panel view.
 *
 * Beside the stages because it is the same fact read the other way round, and
 * two lists that describe one relationship drift the moment only one is
 * updated. **A new command with a new tab has to be added here too** — the
 * coherence test fails if it is not, because otherwise the ribbon looks right
 * and the phone silently names the wrong stage.
 *
 * Project is reached from its own button rather than from a stage, so it maps
 * to none — the callers keep showing the stage you came from.
 */
export const PRO_TAB_STAGE: Record<string, string> = {
    // Project is reached from its own button, not from a tab, so it belongs to
    // no stage — the tab row simply keeps showing the stage you came from.
    project: '',
    /*
     * Stabileo AI, for the same reason and it is worth stating.
     *
     * The assistant spans modelling, results and design, so it is not a step of
     * the work — which is precisely what makes Project stageless too. Giving it
     * a fifth stage would have claimed it IS a step; filing it under ANALYSE
     * would have claimed it only reads results. It is reached from the header
     * corner, where the controls that act on the application live.
     */
    ai: '',
    nodes: 'model', elements: 'model', shells: 'model', materials: 'model', sections: 'model',
    generators: 'model',
    supports: 'conditions', constraints: 'conditions', loads: 'conditions',
    advanced: 'analyse', results: 'analyse', diagnostics: 'analyse',
    design: 'design', steel: 'design', connections: 'design',
  };

/** Every command in every stage, flattened — for callers that want a lookup. */
export function proCmds(stages: ProStage[]): ProCmd[] {
  return stages.flatMap((s) => s.groups.flatMap((g) => g.cmds));
}
