/**
 * PRO's command tree — ONE definition, read by every surface that shows it.
 *
 * ## Why this is not inside `ProRibbon.svelte` any more
 *
 * It was, and that was fine while the ribbon was the only thing that drew it.
 * The phone now draws the same commands too: it cannot show a four-stage ribbon
 * in 375 px, so it shows the stage's commands as a grid inside the panel
 * instead. Two surfaces, one set of commands — and if the set lived in one of
 * them, adding a command would mean remembering to add it to the other.
 *
 * PRO is under active development, so that is not a hypothetical. The point of
 * this module is that **adding a command is one line here** and both the
 * desktop ribbon and the phone grid pick it up, with no layout to revisit in
 * either.
 *
 * ## Four stages, not five
 *
 * Examples and DXF are document commands and live in the block with Project
 * and Save; Report is the deliverable of an analysis, not a file operation, so
 * it sits in ANALYSE beside Solve. With those placed, a DOCUMENT stage had
 * nothing left to hold.
 *
 * ## Why a function and not a constant
 *
 * Four commands need to know things only a component can answer — whether a
 * solve is possible, whether there is anything to report, and what to call when
 * pressed. Those come in as `ProStageContext` rather than being reached for, so
 * this module imports no stores and can be read, and tested, on its own.
 */

import { TWO_D_INTERNAL_FORCE_LABELS as F2D } from '../geometry/coordinate-system';

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
  /** Shown only when the group is expanded. Desktop ribbon only. */
  overflow?: boolean;
};

export type ProGroup = { id: string; labelKey: string; cmds: ProCmd[] };
export type ProStage = { id: string; labelKey: string; home: string; groups: ProGroup[] };

/** What the stages need from whoever is drawing them. */
export type ProStageContext = {
  /** A solve has produced results — the diagrams depend on it. */
  solved: boolean;
  canSolve: boolean;
  canReport: boolean;
  onSolve: () => void;
  onReport: () => void;
};

export function buildProStages(ctx: ProStageContext): ProStage[] {
  const { solved, canSolve, canReport, onSolve, onReport } = ctx;
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
        {
          id: 'rc',
          labelKey: 'proRibbon.groupDesign',
          cmds: [
            { id: 'design', labelKey: 'pro.tabDesign', icon: 'settings', tab: 'design' },
            { id: 'connections', labelKey: 'pro.tabConnections', icon: 'element', tab: 'connections' },
          ],
        },
      ],
    },
  ];
}

/**
 * Which stage owns each panel view.
 *
 * Beside the stages because it is the same fact read the other way round, and
 * two lists that describe one relationship drift the moment only one is
 * updated. Project is reached from its own button rather than from a stage, so
 * it maps to none — see the callers, which keep showing the stage you came
 * from rather than jumping to the first one.
 */
export const PRO_TAB_STAGE: Record<string, string> = {
  project: '',
  nodes: 'model', elements: 'model', shells: 'model', materials: 'model', sections: 'model',
  supports: 'conditions', constraints: 'conditions', loads: 'conditions',
  advanced: 'analyse', results: 'analyse', diagnostics: 'analyse',
  design: 'design', connections: 'design',
};

/** Every command in every stage, flattened — for callers that want a lookup. */
export function proCmds(stages: ProStage[]): ProCmd[] {
  return stages.flatMap((s) => s.groups.flatMap((g) => g.cmds));
}
