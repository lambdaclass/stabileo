import { deskUi, type DeskTab } from '../store/design-desk-ui.svelte';
import { openDeskAt } from './design-navigation';

/** Whether the desk is on screen on `place`: what lights a Design command. */
const deskOn = (place: DeskTab): boolean => deskUi.open && deskUi.tab === place;
import { TWO_D_INTERNAL_FORCE_LABELS as F2D } from '../geometry/coordinate-system';
import { resultsStore } from '../store/results.svelte';
import { uiStore } from '../store/ui.svelte';

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
  /**
   * When the button reads as on. Absent: its tab is the open panel, its diagram is on screen, or
   * its tool is armed. A command that shows something INSIDE a shared panel says it here — Stress
   * opens the Results panel, which is open whenever results are read, so "its tab is open" lit it
   * permanently.
   */
  activeWhen?: () => boolean;
  /**
   * Arms a POINTER tool rather than opening a destination.
   *
   * The viewport has implemented click-to-place nodes and two-click members
   * since 3D existed, gated on `uiStore.currentTool`. PRO's ribbon set that
   * value to exactly two things — `select` and `pan` — so the whole of
   * drawing was unreachable from this mode and geometry had to be typed into
   * a table by coordinate and by node id. This is the field that reaches it.
   */
  tool?: string;
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
  /*
   * There is no `overflow` flag any more, and this note is here so nobody
   * adds one back without also adding the thing that showed it.
   *
   * It meant "shown only when the group is expanded", and the ribbon read it
   * as `!c.overflow || openMenu === g.id`. When the Select dropdown became
   * the Selection panel, the last code that ever set `openMenu` to a group
   * id went with it — leaving a flag whose only effect was to hide a command
   * permanently, with no error and no way to tell from the call site.
   *
   * Nothing had set it, so nothing was hidden. A group that needs to overflow
   * again needs an affordance that opens it first.
   */
};

/**
 * A group of commands. `menu`: drawn by the desktop ribbon as one button that opens its commands
 * on demand, for tools a reader reaches for now and then; the phone grid lists them as any group.
 */
export type ProGroup = { id: string; labelKey: string; cmds: ProCmd[]; menu?: boolean };
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
  /** Whether the Design stage is offered (`uiStore.designInPro`); absent, the setting decides. */
  design?: boolean;
};

export function buildProStages(ctx: ProStageContext): ProStage[] {
  const stages = allProStages(ctx);
  // The normative design is offered only when PRO's settings turn it on (`uiStore.designInPro`).
  return (ctx.design ?? uiStore.designInPro) ? stages : stages.filter((s) => s.id !== 'design');
}

function allProStages(ctx: ProStageContext): ProStage[] {
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
        /*
         * ── One Draw group: the table AND the tool are the same command ──
         *
         * It was briefly two groups — Draw with the pointer tools, Tables with
         * the grids — and that split the one thing a reader does into two
         * places. The professional flow is not "choose a way to work": it is
         * type the nodes with their coordinates in the panel, then click those
         * nodes to lay members, supports and plates on them. Both halves of
         * that sentence are Nodes.
         *
         * So each command opens its table. It does NOT arm the tool: the
         * panel that opens carries a "draw this in the model" button, and
         * that is where the mode is entered. One button in this bar is lit
         * at a time and it is always the panel you are looking at; being in
         * a drawing mode is said by the pointer box over the model, which is
         * where the pointer is and where you switch back to Select.
         *
         * Plates arm the SHELL PICK rather than a viewport tool: a plate is
         * three or four nodes, so it is picked by node, and the panel counts
         * them as they go in. Repeat has no tool because it operates on a
         * selection that already exists.
         */
        /*
         * Selection is NOT a group here.
         *
         * It is reached from the top bar, beside undo and redo, because it is
         * about the POINTER rather than about the model — every stage selects,
         * so filing it under MODEL claimed it was a step of building one. The
         * panel it opens is the same `SelectionPanel` Basic uses.
         */
        /*
         * ── Organize, then Draw ───────────────────────────────────────
         *
         * View, Grid and levels, and Groups draw nothing: they set how the model is looked at,
         * what it is laid out on and how it is gathered. They were in Draw with the commands
         * that make things, which made a list of nine where a reader looked for "Nodes". They
         * come first because they are set before drawing and consulted while drawing.
         */
        {
          id: 'organize',
          labelKey: 'proRibbon.groupOrganize',
          cmds: [
            { id: 'view', labelKey: 'view.title', icon: 'eye', tab: 'view' },
            { id: 'grid', labelKey: 'grid.title', icon: 'grid', tab: 'grid' },
            { id: 'groups', labelKey: 'groups.title', icon: 'groups', tab: 'groups' },
          ],
        },
        /*
         * Generators close Draw. A generated structure goes in like a paste, with its ghost, at
         * the pointer or at typed coordinates (`GeneratorOutput`): it draws, many members at once,
         * and no longer replaces the model.
         */
        {
          id: 'draw',
          labelKey: 'ribbon.groupDraw',
          cmds: [
            { id: 'nodes', labelKey: 'pro.tabNodes', icon: 'node', tab: 'nodes' },
            { id: 'elements', labelKey: 'pro.tabElements', icon: 'element', tab: 'elements' },
            { id: 'shells', labelKey: 'pro.tabShells', icon: 'shell', tab: 'shells' },
            { id: 'transform', labelKey: 'transform.title', icon: 'transform', tab: 'transform' },
            { id: 'edit', labelKey: 'edit.title', icon: 'edit', tab: 'edit' },
          ],
        },
        /*
         * ── The tools for building and design, on demand ─────────────────
         *
         * The building constructor, the foundations, the physical elements and the generators make
         * or describe a building for design. A finite-element model does not need them on screen
         * while it is drawn node by node, so they sit behind one button; design's «Prepare» opens
         * each of them in context. Same commands and same panels, one click further away.
         */
        {
          id: 'moreTools',
          labelKey: 'proRibbon.groupMoreTools',
          menu: true,
          cmds: [
            { id: 'building', labelKey: 'building.title', icon: 'building', tab: 'building' },
            { id: 'foundations', labelKey: 'fdn.title', icon: 'foundation', tab: 'foundations' },
            { id: 'physical', labelKey: 'physical.title', icon: 'physical', tab: 'physical' },
            {
              id: 'generators',
              labelKey: 'proRibbon.cmdGenerators',
              descKey: 'proRibbon.cmdGeneratorsDesc',
              icon: 'examples',
              tab: 'generators',
            },
          ],
        },
        {
          id: 'properties',
          labelKey: 'proRibbon.groupProperties',
          cmds: [
            { id: 'materials', labelKey: 'pro.tabMaterials', icon: 'material', tab: 'materials' },
            { id: 'sections', labelKey: 'pro.tabSections', icon: 'section', tab: 'sections' },
            { id: 'specifications', labelKey: 'spec.title', icon: 'constraint', tab: 'specifications' },
          ],
        },
        /*
         * ── Conditions live inside Model ─────────────────────────────
         *
         * Supports, constraints and loads were a STAGE of their own, beside
         * Model and Analyse. They are not a stage: nothing is produced by
         * moving to them and nothing follows from leaving. They are part of
         * describing the structure, exactly like its geometry and its
         * materials — which is why a reader building a frame crossed between
         * two top-level stages to place a support and then crossed back.
         *
         * One group, to the right of Properties: draw it, give it materials,
         * and say how it is held and loaded.
         */
        {
          id: 'conditions',
          labelKey: 'ribbon.groupConditions',
          cmds: [
            /* None of these arm a tool: a command in this bar opens its
               PANEL, and the panel carries the button that arms the tool.
               See the note on the Draw group. */
            { id: 'supports', labelKey: 'pro.tabSupports', icon: 'support', tab: 'supports' },
            { id: 'loads', labelKey: 'pro.tabLoads', icon: 'load', tab: 'loads' },
          ],
        },
        /*
         * The model as text, last: it is the one command that is not a step of building the
         * model but another way to write all of it. Its own section, named for what it is for,
         * so what else automates the work (a macro, a command line) has a place to go.
         */
        {
          id: 'automate',
          labelKey: 'proRibbon.groupAutomate',
          cmds: [
            { id: 'code', labelKey: 'code.title', icon: 'code', tab: 'code' },
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
            /*
             * Stress belongs with the quantities, at the right of them.
             *
             * It had a group of its own holding one command, which made a
             * caption over a single button and put "the moment" and "the
             * stress" in two different sections of a bar that otherwise
             * reads as one row of things a solved model can show.
             */
            {
              id: 'stress',
              labelKey: 'pro.varStress',
              descKey: 'proRibbon.stressDesc',
              icon: 'stress',
              diagram: 'colorMap',
              action: () => { resultsStore.colorMapKind = 'stress'; },
              tab: 'results',
              enabled: () => solved,
              activeWhen: () => resultsStore.diagramType === 'colorMap' && resultsStore.colorMapKind === 'stress',
            },
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
      // The desk, where it was left (`design-navigation.ts`).
      home: 'desk',
      /*
       * ── Design is one workspace, and these are its places ─────────────
       *
       * The stage had seven commands in four groups (design data, the desk, the concrete
       * workflow, the 3-D detailing, the steel profiles, the steel connections and a check under
       * other codes), each opening a screen of its own, so a reader entering Design had to choose
       * between «Desk», «Rebar design» and a «Classic view» to find where the work was. Now the
       * stage IS the desk, docked around the viewer, and every screen the commands opened is a
       * place inside it. On a desktop the desk's own bar, with the four steps and their state,
       * takes this row (`ProRibbon` draws no groups for Design while the desk is docked). These
       * commands are what the phone grid and the command palette list, and what the ribbon shows
       * the moment the desk is not on screen; each one opens the desk on its place
       * (`openDeskAt`), the same place the rail opens.
       */
      groups: [
        {
          id: 'designPrepare',
          labelKey: 'desk.step.prepare',
          cmds: [
            { id: 'designPrepare', labelKey: 'desk.rail.model', icon: 'building', action: () => openDeskAt('prepare'), activeWhen: () => deskOn('prepare') },
            { id: 'designData', labelKey: 'designData.title', icon: 'settings', action: () => openDeskAt('designData'), activeWhen: () => deskOn('designData') },
          ],
        },
        {
          id: 'designSize',
          labelKey: 'desk.step.size',
          cmds: [
            { id: 'design', labelKey: 'desk.tab.plan', descKey: 'desk.cmd.planDesc', icon: 'grid', action: () => openDeskAt('plan'), activeWhen: () => deskOn('plan') },
            { id: 'designList', labelKey: 'desk.rail.list', descKey: 'desk.cmd.listDesc', icon: 'data', action: () => openDeskAt('list'), activeWhen: () => deskOn('list') },
            /*
             * Profiles and connections are the steel route inside sizing: the same panels, with
             * the optimiser, the assumptions, the connection typologies, the bolts, the welds and
             * the tension connection editor, in the desk.
             */
            { id: 'steel', labelKey: 'proRibbon.cmdSteelProfiles', descKey: 'proRibbon.cmdSteelProfilesDesc', icon: 'section', action: () => openDeskAt('steel'), activeWhen: () => deskOn('steel') },
            { id: 'connections', labelKey: 'proRibbon.cmdSteelJoints', descKey: 'proRibbon.cmdSteelJointsDesc', icon: 'element', action: () => openDeskAt('connections'), activeWhen: () => deskOn('connections') },
            // One «Other code», with its two modes inside (`DeskOtherCodes.svelte`).
            { id: 'otherCodes', labelKey: 'desk.rail.otherCodes', descKey: 'desk.codes.desc', icon: 'data', action: () => openDeskAt('codes'), activeWhen: () => deskOn('codes') },
          ],
        },
        {
          id: 'designDetail',
          labelKey: 'desk.step.detail',
          cmds: [
            { id: 'detailing', labelKey: 'desk.rail.detailing', icon: 'view3d', action: () => openDeskAt('detailing'), activeWhen: () => deskOn('detailing') },
            {
              /*
               * A view of the design work, on the member design is on: `openRebar3DView`, the one
               * path every entry to the 3-D reinforcement takes.
               */
              id: 'rebar3d',
              labelKey: 'desk.rebar3d',
              descKey: 'proRibbon.cmdRebar3DDesc',
              icon: 'view3d',
              action: onRebar3D,
              enabled: canRebar3D,
              blockedKeys: rebar3DMissingSteps,
            },
          ],
        },
        {
          id: 'designDocument',
          labelKey: 'desk.step.document',
          cmds: [
            { id: 'sheets', labelKey: 'desk.tab.sheets', icon: 'section', action: () => openDeskAt('sheets'), activeWhen: () => deskOn('sheets') },
            { id: 'listings', labelKey: 'desk.tab.listings', icon: 'data', action: () => openDeskAt('listings'), activeWhen: () => deskOn('listings') },
            { id: 'documents', labelKey: 'desk.tab.documents', icon: 'project', action: () => openDeskAt('documents'), activeWhen: () => deskOn('documents') },
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
    /* What a selection picks up is set while modelling, and the command that
       opens it sits at the head of MODEL. */
    selection: 'model',
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
    /* Settings is reached from the header corner, like the AI drawer. */
    settings: '',
    nodes: 'model', elements: 'model', shells: 'model', materials: 'model', sections: 'model',
    grid: 'model', generators: 'model', transform: 'model', edit: 'model', groups: 'model', physical: 'model', building: 'model', foundations: 'model', code: 'model', view: 'model',
    /* Conditions is a GROUP inside Model now, not a stage of its own. */
    supports: 'model', specifications: 'model', loads: 'model',
    advanced: 'analyse', results: 'analyse', diagnostics: 'analyse',
    /*
     * Design's views name the desk's places (`DESK_PLACE_OF_TAB` in `design-navigation.ts`, the
     * same list): `desk` the stage itself, the others the places that were panels of their own.
     */
    desk: 'design', design: 'design', designData: 'design', steel: 'design', connections: 'design', otherCodes: 'design',
  };

/** Every command in every stage, flattened — for callers that want a lookup. */
export function proCmds(stages: ProStage[]): ProCmd[] {
  return stages.flatMap((s) => s.groups.flatMap((g) => g.cmds));
}
