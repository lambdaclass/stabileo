<script lang="ts">
  import { t } from '../../lib/i18n';
  import { showDiagram, armTool } from '../../lib/store/view-mode';
  import { commandShowsQuantity, showStressMap, activeMapMeasure } from '../../lib/store/result-view';
  import { needsPlaneChoice, switchPlain, hasBackup, restore3D } from '../../lib/store/switch-2d';
  import { TWO_D_INTERNAL_FORCE_LABELS as F2D } from '../../lib/geometry/coordinate-system';
  import { uiStore, EDIT_TOOLS } from '../../lib/store/ui.svelte';
  import { historyStore } from '../../lib/store/history.svelte';
  import { resultsStore } from '../../lib/store/results.svelte';
  import Icon from './Icon.svelte';
  import { runSolve } from '../../lib/actions/solve';
  import { TOOL_KEY_MAP } from '../../lib/tool-keys';
  import { saveProject } from '../../lib/store/file';

  /**
   * Ribbon toolbar.
   *
   * ── Groups, not tabs ──────────────────────────────────────────────────
   *
   * The first version made Model / Analyse / Results into tabs, so two thirds
   * of the commands were always hidden and getting from "draw a node" to "show
   * the moment diagram" cost a tab switch. Structural work does not divide into
   * three separate activities; it is one loop — build, solve, look — travelled
   * many times a minute, and a tab is the wrong control for something you cross
   * constantly.
   *
   * So the three are GROUPS on one permanent row, divided by rules and labelled
   * underneath. Everything is one click away and nothing moves under the cursor.
   *
   * ── Sizing ────────────────────────────────────────────────────────────
   *
   * Microsoft's ribbon guidance is that a group should carry three or four
   * predefined variants, so a narrowing window degrades smoothly instead of
   * truncating. This has four, and no variant ever drops a command — only
   * labels and scale give way:
   *
   *     ≥ 1500   large icons, a label under every command
   *     ≥ 1180   smaller icons, labels kept
   *     ≥  900   icons only; the group label carries the meaning
   *     <  900   the ribbon yields to the mobile tool strip entirely
   *
   * ── Disabled, not hidden ──────────────────────────────────────────────
   *
   * From the same guidance: a command that cannot run is greyed, never removed.
   * A control that vanishes teaches nothing and shifts its neighbours under the
   * cursor; a greyed one says the feature exists and its tooltip says what it is
   * waiting for. The diagram commands are therefore present and disabled before
   * the first solve, rather than appearing after it.
   */

  type Props = {
    onOpenPanel: (panel: string | null, opts?: { toggle?: boolean; dataTab?: string }) => void;
    activePanel: string | null;
    /** Which data tab is showing, so only that command lights. */
    activeDataTab?: string;
  };
  let { onOpenPanel, activePanel, activeDataTab }: Props = $props();

  type Cmd = {
    id: string;
    /** Icon name, or a function when it depends on state. */
    icon: string | (() => string);
    /** Translation key for the button label. */
    labelKey?: string | (() => string);
    /** Literal label, for symbols like N, My, Vz that are not translated. */
    label?: string;
    /** Translation key for the human name, shown in the tooltip. */
    nameKey?: string;
    /** Which Model-data tab to land on, for the Properties group. */
    dataTab?: string;
    /** Degrees to turn the icon, for a force about a perpendicular axis. */
    rotate?: number;
    tool?: string;
    panel?: string;
    diagram?: string;
    /** Paints a stress measure rather than an internal force. */
    stressMap?: boolean;
    action?: () => void;
    /** Greyed when false. Never hidden. */
    enabled?: () => boolean;
    /** Only meaningful for a 3D frame; explains its own greying in 2D. */
    needs3d?: boolean;
    /** Sole command of its group: drawn larger, since it carries the group. */
    prominent?: boolean;
  };

  type Group = { id: string; labelKey: string; cmds: Cmd[] };

  const solved = $derived(resultsStore.results != null || resultsStore.results3D != null);

  /*
   * The phone gets a different ARRANGEMENT of the same commands, and that is a
   * structural change rather than a styling one, so it needs a flag and not
   * only a media query. `uiStore.isMobile` is `windowWidth < 768`, which is the
   * same threshold as the `max-width: 767px` variant in the stylesheet — the
   * two must agree or the row would be laid out for one shape and painted for
   * the other.
   */
  const narrow = $derived(uiStore.isMobile);

  /*
   * Greying beats hiding for a command that could apply here but cannot run
   * yet — that is why the whole results group is present and disabled before
   * the first solve. It does NOT apply to a quantity that has no meaning in
   * the current mode: Mz and Vy are out-of-plane and simply do not exist in a
   * 2D model, so in 2D they are absent rather than greyed. See below.
   */
  const threeD = $derived(uiStore.analysisMode === '3d');

  /*
   * Ordered N, My, Vz, Mz, Vy, T — the pairs that share a plane sit together,
   * rather than the alphabetical order the store happens to use.
   *
   * ── Which axis a 2D diagram is about ──────────────────────────────────
   *
   * The 2D plane is x–z, and a 2D node's degrees of freedom are ux, uz and θy.
   * A 2D frame therefore bends about its local y and shears along its local z:
   * its two diagrams are **My and Vz**, the same two an identical model shows
   * in 3D. Mz and Vy are the out-of-plane pair and cannot exist in 2D at all,
   * so they are not offered there.
   *
   * These were labelled Mz and Vy, which is the pre-migration Y-up naming from
   * before the app moved to Z-up. The engine still carries that history: the
   * Rust `Reaction` struct serialises `rx`, `rz`, `my` and keeps `ry`/`mz` only
   * as deserialise aliases for old files. Anything in the UI still saying Mz or
   * Vy about a 2D model is a leftover from that migration.
   *
   * The consequence was not cosmetic. The same model solved in 2D and in 3D
   * put the identical diagram under two different names — 2D's "Mz" was 3D's
   * "My" — so comparing the two modes suggested the solver disagreed with
   * itself.
   *
   * My/Mz and Vz/Vy each share an icon; the out-of-plane one is turned 90°,
   * because it is the same action about a perpendicular axis.
   */
  const diagramCmds = $derived.by((): Cmd[] => {
    const any = () => solved;
    const only3d = () => solved && threeD;
    const cmds: Cmd[] = [
      { id: 'none', icon: 'none', labelKey: 'ribbon.noDiagram', panel: 'results', diagram: 'none', enabled: any },
      { id: 'deformed', icon: 'deformed', labelKey: 'ribbon.deformed', panel: 'results', diagram: 'deformed', enabled: any },
      { id: 'axial', icon: 'axial', label: F2D.axial, nameKey: 'ribbon.nameAxial', panel: 'results', diagram: 'axial', enabled: any },
      { id: 'momentY', icon: 'moment', label: F2D.moment, nameKey: 'ribbon.nameMomentY', panel: 'results', diagram: threeD ? 'momentY' : 'moment', enabled: any },
      { id: 'shearZ', icon: 'shear', label: F2D.shear, nameKey: 'ribbon.nameShearZ', panel: 'results', diagram: threeD ? 'shearZ' : 'shear', enabled: any },
    ];
    /*
     * Out-of-plane, so absent rather than disabled in 2D. A greyed-out Mz would
     * imply the quantity exists here and is merely unavailable; it does not.
     */
    if (threeD) {
      cmds.push(
        { id: 'moment', icon: 'moment', rotate: 90, label: 'Mz', nameKey: 'ribbon.nameMomentZ', panel: 'results', diagram: 'momentZ', enabled: only3d, needs3d: true },
        { id: 'shear', icon: 'shear', rotate: 90, label: 'Vy', nameKey: 'ribbon.nameShearY', panel: 'results', diagram: 'shearY', enabled: only3d, needs3d: true },
        { id: 'torsion', icon: 'torsion', label: 'T', nameKey: 'ribbon.nameTorsion', panel: 'results', diagram: 'torsion', enabled: only3d, needs3d: true },
      );
    }
    /*
     * Stress goes last, after the forces, because it is DERIVED from all of
     * them: utilisation, Von Mises, and the normal and shear peaks. It names no
     * single force, which is why it could not live among them and why it had
     * no command at all — the maps existed and were reachable only by pressing
     * 9, with the control that chooses between them appearing once you were
     * already there.
     */
    cmds.push({
      id: 'stress', icon: 'stress', labelKey: 'ribbon.stress',
      panel: 'results', stressMap: true, enabled: any,
    });
    return cmds;
  });

  /*
   * Derived, not a plain const.
   *
   * This was evaluated once at component init, which read `diagramCmds` and
   * froze that snapshot. It happened to work while the diagram list was always
   * the same length and only its `enabled`/`diagram` closures varied — those
   * are re-read on every render. It stops working the moment the list's LENGTH
   * depends on the mode, which is what hiding the out-of-plane Mz and Vy in 2D
   * does: switching to 3D left the ribbon showing the 2D list forever.
   */
  const GROUPS: Group[] = $derived([
    {
      id: 'view',
      labelKey: 'ribbon.groupView',
      cmds: [
        /*
         * Selection CONFIGURATION, not the pointer mode.
         *
         * Select and Pan used to be two commands here, and they were the
         * exception that broke the ribbon's one rule: every other command
         * opens a panel, so the highlight means "this is what the panel is
         * showing" — but a pointer mode shows nothing, so after a solve a lit
         * diagram and a lit Select both claimed to be the current activity.
         *
         * The pointer mode moved onto the model, where the pointer is. What
         * stays here is what selecting needs a PANEL for: which kinds of thing
         * a drag picks up.
         */
        { id: 'select', icon: 'select', labelKey: 'ribbon.selection', panel: 'selection' },
        /*
         * One button, not two. A pair where one is always lit reads as a
         * permanent alarm — the accent is for what you are doing now, and
         * "the view is 2D" is a condition, not an action. The button shows the
         * mode you would switch TO, which is how a toggle explains itself.
         */
        {
          id: 'dim',
          icon: () => (threeD ? 'view2d' : 'view3d'),
          labelKey: () => (threeD ? 'ribbon.view2d' : 'ribbon.view3d'),
          /*
           * Going UP is free — a 2D model is a 3D model with one coordinate
           * at zero. Coming DOWN throws a dimension away, and what to do with
           * it is a decision only the author can make: flatten everything, or
           * take the frame on one grid line. So that direction asks, unless
           * the model is already flat and there is nothing to decide.
           */
          action: () => {
            /*
             * Coming back up restores the 3D original if this 2D model was cut
             * or flattened out of one. Without that the trip is one-way: the
             * button returns to a 3D viewport showing the derived model, and
             * the structure the user built is gone with no message saying so.
             */
            if (!threeD) {
              if (hasBackup()) restore3D();
              else uiStore.analysisMode = '3d';
              return;
            }
            if (needsPlaneChoice()) uiStore.switchTo2DPrompt = true;
            else switchPlain();
          },
        },
      ],
    },
    /*
     * There is no standalone Data command any more.
     * ─────────────────────────────────────────────
     * It had its own group, on the reasoning that model data spans drawing,
     * conditions and results and so belongs to none of them. True, and beside
     * the point: EVERY command that produces model data already opens that
     * panel on its own tab — `run()` below sends node, element, support, load,
     * materials and sections to `panel: 'data'` with `dataTab` set. So the
     * button opened a panel the user reached anyway, on whichever tab they had
     * last used, and pressing it was never the shortest way to anything.
     *
     * Removed at both widths. On a phone it was one of nine slots in a row that
     * has exactly nine; on a desktop it was a command that did nothing its
     * neighbours did not already do. The panel itself is untouched — the tools
     * open it, `openPanel('data')` opens it, and the walkthroughs use that
     * event rather than this button, which is why none of them notices.
     */
    {
      id: 'draw',
      labelKey: 'ribbon.groupDraw',
      cmds: [
        { id: 'node', icon: 'node', labelKey: 'float.node', tool: 'node', panel: 'data', dataTab: 'nodes' },
        { id: 'element', icon: 'element', labelKey: 'float.element', tool: 'element', panel: 'data', dataTab: 'elements' },
      ],
    },
    {
      id: 'conditions',
      labelKey: 'ribbon.groupConditions',
      cmds: [
        { id: 'support', icon: 'support', labelKey: 'float.support', tool: 'support', panel: 'data', dataTab: 'supports' },
        { id: 'load', icon: 'load', labelKey: 'float.load', tool: 'load', panel: 'data', dataTab: 'loads' },
      ],
    },
    {
      /*
       * Materials and sections had no home on the ribbon at all: they were
       * reachable only by opening Model data and finding the right tab, or by
       * going through an element. They are properties of the model in exactly
       * the sense supports and loads are conditions of it, so they belong on
       * the same row — between the conditions that act on the structure and the
       * analysis that consumes both. PRO already groups them this way.
       */
      id: 'properties',
      labelKey: 'ribbon.groupProperties',
      cmds: [
        { id: 'materials', icon: 'material', labelKey: 'pro.tabMaterials', panel: 'data', dataTab: 'materials' },
        { id: 'sections', icon: 'section', labelKey: 'pro.tabSections', panel: 'data', dataTab: 'sections' },
      ],
    },
    {
      id: 'analyse',
      labelKey: 'ribbon.tabAnalyse',
      cmds: [
        /*
         * Solve opens Results.
         *
         * A solve already selects the deformed shape — `setResults` falls back
         * to it — so the canvas changed while the panel that governs it stayed
         * shut, and the scale slider that makes a 1:1 deformation legible was
         * two clicks away from the command that produced it. Picking a diagram
         * opens this panel; producing one should too.
         */
        { id: 'solve', icon: 'solve', labelKey: 'pro.solve', panel: 'results',
          action: () => {
            runSolve();
            if (EDIT_TOOLS.includes(uiStore.currentTool)) uiStore.currentTool = 'select';
          } },
        { id: 'advanced', icon: 'advanced', labelKey: 'ribbon.advanced', panel: 'advanced' },
      ],
    },
    {
      id: 'results',
      labelKey: 'ribbon.tabResults',
      cmds: diagramCmds,
    },
  ]);

  /* ── The phone's row ───────────────────────────────────────────────────
   *
   * Same commands, gathered instead of scrolled.
   *
   * Laid out flat, seventeen commands at 44 px are 748 px of content in a
   * 375 px row: everything past the seventh needs a swipe, and the swipe is
   * the interface. Two of the groups are the ones you cross constantly and
   * they are also the two that are long — so those two collapse to a single
   * button each that opens the group, and everything else stays flat.
   *
   * Nine controls: Project, undo, redo, Selection, 2D/3D, Model, Solve,
   * Advanced, Results. That is the whole application, and it very nearly fits
   * without scrolling at 375 px — see the size variant in the stylesheet.
   *
   * PRO already works this way, which is where the shape comes from.
   *
   * `cmdsOf` reads the groups defined above rather than restating their
   * contents. A command added to `draw` or `conditions` appears on the phone
   * for free; a second list here would be a second definition of the ribbon
   * and would drift the first time only one of them was updated.
   */
  function cmdsOf(...groupIds: string[]): Cmd[] {
    return groupIds.flatMap((id) => GROUPS.find((g) => g.id === id)?.cmds ?? []);
  }

  type Cluster = { id: string; labelKey: string; icon: string; cmds: Cmd[] };

  const CLUSTERS: Cluster[] = $derived([
    {
      id: 'results',
      labelKey: 'ribbon.tabResults',
      icon: 'moment',
      cmds: cmdsOf('results'),
    },
  ]);

  /*
   * Modelado is a COMMAND, not a menu.
   * ──────────────────────────────────
   * It was a cluster: tap it, get six buttons, tap one, get the Model data
   * panel opened on that entity's tab with its tool armed. But the panel's own
   * tabs are those same six choices and they already do exactly that — see
   * `pickTab` in `DataTable.svelte`, which arms the tab's tool for precisely
   * this reason. The menu was a second copy of the panel's tab strip, shown
   * for one tap and then thrown away.
   *
   * So the button opens the panel and the tabs ARE the six buttons. Below
   * 768 px the strip is laid out as a 3×2 grid of real targets across the full
   * width, pinned above the table — see `DataTable.svelte`.
   *
   * It lands on the tab the reader last used and arms that tab's tool, so the
   * command leaves you able to draw rather than merely looking at a table.
   * Materials and sections have no tool and correctly arm none.
   */
  function toolForTab(tab: string): string | undefined {
    // Read off the ribbon's own definitions rather than restating the pairing.
    return cmdsOf('draw', 'conditions').find((c) => c.dataTab === tab)?.tool;
  }

  const modelCmd: Cmd = $derived.by(() => {
    const tab = activeDataTab || 'nodes';
    return {
      id: 'model',
      icon: 'element',
      labelKey: 'ribbon.groupModel',
      panel: 'data',
      dataTab: tab,
      tool: toolForTab(tab),
    };
  });

  /** The phone's row, in order, with the one remaining cluster spliced in. */
  const PHONE_ROW: ({ kind: 'cmd'; cmd: Cmd } | { kind: 'cluster'; cluster: Cluster })[] = $derived([
    ...cmdsOf('view').map((cmd) => ({ kind: 'cmd' as const, cmd })),
    { kind: 'cmd' as const, cmd: modelCmd },
    ...cmdsOf('analyse').map((cmd) => ({ kind: 'cmd' as const, cmd })),
    { kind: 'cluster' as const, cluster: CLUSTERS[0] },
  ]);

  /**
   * Which cluster is open, or null.
   *
   * Closed by everything that ends the errand: running one of its commands,
   * pressing the button again, or touching anything else — the backdrop below
   * covers the rest of the screen for that last one, so a tap outside does not
   * also arm a tool on the canvas it landed on.
   */
  let openCluster = $state<string | null>(null);

  /*
   * The walkthroughs need to open a cluster before pointing inside it.
   *
   * A step whose target is a diagram command has nothing to spotlight while
   * this menu is shut, and on a phone it is shut by default — the tour would
   * darken the screen and say nothing, which is the exact failure mode
   * `basic-demos.spec.ts` exists to catch. Driven by an event rather than by
   * exporting the state, for the same reason `openPanel` is: a step definition
   * describes cards, not the shell's layout.
   */
  $effect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string | null>).detail;
      if (id === null) { openCluster = null; return; }
      if (narrow && CLUSTERS.some((c) => c.id === id)) openCluster = id;
    };
    window.addEventListener('stabileo-open-cluster', onOpen);
    return () => window.removeEventListener('stabileo-open-cluster', onOpen);
  });

  /*
   * A cluster lights when the command it is standing in for is the active one.
   *
   * Without this the phone loses the ribbon's one rule — lit means "this is
   * what the panel is showing" — because the lit command is inside a closed
   * button. Reusing `isActive` rather than restating the condition keeps the
   * two from ever disagreeing about what is on.
   */
  function clusterActive(c: Cluster): boolean {
    return c.cmds.some(isActive);
  }

  /** The phone drops to icons, so the tooltip is all the naming there is. */
  function clusterTitle(c: Cluster): string {
    const open = c.cmds.find(isActive);
    return open ? `${t(c.labelKey)} — ${cmdLabel(open)}` : t(c.labelKey);
  }

  /*
   * Editing and viewing results are two different jobs, and the ribbon should
   * only ever look like it is doing one of them.
   *
   * The tool highlight and the diagram highlight were independent, so after a
   * solve you could have Node lit in Draw AND My lit in Results at once — the
   * ribbon claiming you were placing nodes on a moment diagram. Picking a
   * diagram now disarms an editing tool, and arming one clears the diagram.
   *
   * The pointer modes are not here at all any more: Select and Pan live on
   * the model, so there is no "view tool" for this rule to exempt.
   */
  /*
   * EDIT_TOOLS comes from the store — main made it the single source while
   * this branch was open, and a second copy here is the kind of list that
   * drifts. VIEW_TOOLS is gone with the commands it described: select and pan
   * are not ribbon commands any more, they are the pointer mode, and it lives
   * on the model.
   */

  function run(cmd: Cmd) {
    if (cmd.enabled && !cmd.enabled()) return;
    if (cmd.tool) {
      armTool(cmd.tool);
      /*
       * Arming a tool now OPENS the data panel on that tool's own tab.
       *
       * It used to close whatever panel was open, on the reasoning that the
       * panel belonged to a different task. That was right when the panel could
       * only be results or settings — and wrong once Materials and Sections
       * joined the ribbon, because those DO open a table and the row then
       * behaved two different ways for commands that look identical.
       *
       * The table is what you are editing when you place a node, so showing it
       * is showing your work. `toggle: false`: arming a tool means "show me
       * this", and a second press should re-show rather than hide.
       */
      if (cmd.dataTab) onOpenPanel('data', { dataTab: cmd.dataTab, toggle: false });
      return;
    }
    if (cmd.stressMap) {
      // Defaults to utilisation; the panel switches between the four measures.
      showStressMap();
      onOpenPanel(cmd.panel ?? null, { toggle: false });
      return;
    }
    if (cmd.diagram) {
      /*
       * Picking a diagram OPENS the panel; it never toggles it shut. Routing it
       * through the toggle meant choosing Shear while Results was already open
       * closed the panel — the command reads as "show me this", and "show" has
       * no off state.
       */
      // One call, because the rule that reading a result leaves editing belongs
      // to the app rather than to this component — the results toolbar used to
      // write `diagramType` directly and forgot it entirely.
      showDiagram(cmd.diagram as never);
      if (cmd.action) cmd.action();
      onOpenPanel(cmd.panel ?? null, { toggle: false });
      return;
    }
    if (cmd.action) cmd.action();
    /*
     * A Properties command opens a table, so it leaves editing too.
     *
     * Materials and Sections carry no `tool`, so they fell through the branch
     * above and left whatever was armed still armed — pressing Sections while
     * the element tool was up lit both, which is the same "editing and reading
     * at once" contradiction wearing different clothes. There is nothing to
     * draw on a properties table.
     */
    if (cmd.dataTab && !cmd.tool && EDIT_TOOLS.includes(uiStore.currentTool)) {
      uiStore.currentTool = 'select';
    }
    // `solve` shows its panel rather than toggling it: pressing it twice means
    // "solve again", not "solve and hide the answer".
    if (cmd.panel) onOpenPanel(cmd.panel, {
      ...(cmd.id === 'solve' ? { toggle: false } : {}),
      ...(cmd.dataTab ? { dataTab: cmd.dataTab, toggle: false } : {}),
    });
  }

  /**
   * Lit means: THIS is what the right-hand panel is showing.
   *
   * One rule, and it is the one a reader can verify at a glance — look at the
   * panel, look at the ribbon, they say the same thing. It replaces a set of
   * per-command conditions that each answered a slightly different question
   * ("is this tool armed", "is this diagram drawn") and could therefore be true
   * at the same time: after a solve, a lit diagram plus a lit Advanced plus a
   * lit drawing tool, three commands claiming to be the current activity while
   * the panel showed one of them.
   *
   * A diagram left on the canvas while the panel moved elsewhere is not
   * highlighted, and that is deliberate: the highlight tracks the panel, not
   * the canvas, and the canvas has its own legends to say what it is drawing.
   */
  function isActive(cmd: Cmd): boolean {
    if (cmd.tool) return activePanel === 'data' && uiStore.currentTool === cmd.tool;
    /*
     * A command that names a data tab lights when THAT tab is showing.
     *
     * Materials, Sections and Data all opened `panel: 'data'`, so all three lit
     * at once — the ribbon claiming three things were selected when one was.
     * The tab is what distinguishes them, so the tab is what decides.
     */
    if (cmd.dataTab && cmd.id !== 'data') {
      return activePanel === 'data' && activeDataTab === cmd.dataTab;
    }
    /*
     * Data itself never lights. It is the container, not a selection: what is
     * selected is the tab inside it, and lighting both said the same thing
     * twice while suggesting they were separate choices.
     */
    if (cmd.id === 'data') return false;
    if (cmd.diagram) {
      const shown = resultsStore.diagramType;
      /*
       * "None" lights only while the Results panel is the one open.
       *
       * It is the empty option of the diagram radio group, and "no diagram" is
       * also the state of every model you are still building — so lighting it
       * on the plain condition `diagramType === 'none'` put a Results command
       * on beside Materials or Node, which is the very thing the group is
       * supposed to prevent. Inside Results it is a real selection; outside, it
       * is just the absence of one.
       */
      if (cmd.diagram === 'none') return solved && activePanel === 'results' && shown === 'none';
      /*
       * A command names a QUANTITY, so it stays lit however that quantity is
       * being drawn — diagram, member colour or colour map. The choice of
       * representation lives in the panel beside the scale.
       *
       * Treating them as different diagrams left the ribbon dark the moment a
       * user switched to a colour map, as if nothing were on screen, while the
       * members were painted by exactly the quantity whose command had gone
       * out.
       */
      return solved && activePanel === 'results' && commandShowsQuantity(cmd.diagram);
    }
    // Solve OPENS Results but is not a state — it is an action you run, and a
    // lit Solve while the panel happens to be open would read as "solving".
    // The Stress command owns the shell contours too: they are chosen in the
    // same select, so a map it cannot claim would leave panel and ribbon
    // disagreeing about whether anything is on screen.
    if (cmd.stressMap) return solved && activePanel === 'results' && activeMapMeasure() !== null;
    if (cmd.id === 'solve') return false;
    if (cmd.panel) return activePanel === cmd.panel;
    return false;  // `dim` is a switch, not a state: it never lights up.
  }

  const mod = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl';

  /** Keyboard shortcuts the application already listens for (lib/tool-keys.ts). */
  const KEYS: Record<string, string> = { ...TOOL_KEY_MAP, solve: 'Enter' };

  function cmdLabel(c: Cmd): string {
    if (c.label) return c.label;
    const k = typeof c.labelKey === 'function' ? c.labelKey() : c.labelKey;
    return k ? t(k) : '';
  }

  /**
   * Name, then shortcut, then why it is unavailable. A tooltip that only
   * repeats the visible label is wasted: these carry the full name of a symbol
   * like Mz, the key that arms the tool, and the reason a greyed command is
   * greyed.
   */
  function cmdTitle(c: Cmd, enabled: boolean): string {
    const name = c.nameKey ? t(c.nameKey) : cmdLabel(c);
    const full = c.label ? `${name} (${c.label})` : name;
    const key = KEYS[c.id];
    const withKey = key ? `${full} — ${key}` : full;
    if (enabled) return withKey;
    return `${withKey} — ${c.needs3d && !threeD ? t('ribbon.needs3d') : t('ribbon.needsSolve')}`;
  }
</script>

<!--
  One button, written once, used by the desktop row, the phone row and the
  cluster popovers. `labelled` is the popover's only difference: there is room
  for a word there, and six unlabelled glyphs in a menu is a quiz.
-->
{#snippet cmdButton(c: Cmd, labelled: boolean)}
  {@const on = !c.enabled || c.enabled()}
  <button
    class="rb-cmd"
    class:active={isActive(c)}
    class:labelled
    disabled={!on}
    data-testid="rb-cmd-{c.id}"
    onclick={() => { run(c); openCluster = null; }}
    title={cmdTitle(c, on)}
  >
    <span class="rb-icon"><Icon name={typeof c.icon === 'function' ? c.icon() : c.icon} rotate={c.rotate ?? 0} /></span>
    <span class="rb-label" class:symbol={!!c.label}>{cmdLabel(c)}</span>
  </button>
{/snippet}

<div class="ribbon" data-testid="ribbon">
  {#if narrow}
    <!--
      The phone row. Nine controls, no group captions, no horizontal scroll to
      reach anything: Project, undo, redo, Selection, 2D/3D, Model, Solve,
      Advanced, Results.
    -->
    <div class="rb-row rb-row-phone">
      <!--
        Save is not here, and that is not an omission. It lives inside the
        Project panel this button opens, beside Save session and Open — so on a
        phone it is one tap further and the row is one slot shorter, which is
        the trade the row needed. Undo and redo stay: those ARE per-gesture on a
        touch screen, where a mis-tap places a node.
      -->
      <div class="rb-quick" data-testid="rb-quick">
        <button
          class="rb-quick-btn"
          class:active={activePanel === 'project'}
          onclick={() => { onOpenPanel('project'); openCluster = null; }}
          title={t('ribbon.project')}
          aria-label={t('ribbon.project')}
          data-testid="hdr-project"
        ><Icon name="project" size={21} /></button>
        <button
          class="rb-quick-btn"
          onclick={() => historyStore.undo()}
          disabled={!historyStore.canUndo}
          title={t('toolbar.undo')}
          aria-label={t('toolbar.undo')}
        ><Icon name="undo" size={19} /></button>
        <button
          class="rb-quick-btn"
          onclick={() => historyStore.redo()}
          disabled={!historyStore.canRedo}
          title={t('toolbar.redo')}
          aria-label={t('toolbar.redo')}
        ><Icon name="redo" size={19} /></button>
      </div>

      {#each PHONE_ROW as item (item.kind === 'cmd' ? item.cmd.id : item.cluster.id)}
        {#if item.kind === 'cmd'}
          {@render cmdButton(item.cmd, false)}
        {:else}
          {@const c = item.cluster}
          <button
            class="rb-cmd rb-cluster"
            class:active={clusterActive(c)}
            class:open={openCluster === c.id}
            data-testid="rb-cluster-{c.id}"
            aria-expanded={openCluster === c.id}
            onclick={() => openCluster = openCluster === c.id ? null : c.id}
            title={clusterTitle(c)}
          >
            <span class="rb-icon"><Icon name={c.icon} /></span>
            <span class="rb-caret" aria-hidden="true"></span>
          </button>
        {/if}
      {/each}
    </div>

    {#if openCluster}
      {@const c = CLUSTERS.find((x) => x.id === openCluster)}
      {#if c}
        <!--
          A tap anywhere else closes the menu AND is swallowed. Without the
          backdrop the same tap would fall through to the canvas underneath and
          place a node, which is the classic way a menu dismissal becomes an
          edit the reader has to undo.
        -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="rb-backdrop" onclick={() => openCluster = null}></div>
        <div class="rb-pop" data-testid="rb-pop-{c.id}">
          <p class="rb-pop-title">{t(c.labelKey)}</p>
          <div class="rb-pop-cmds">
            {#each c.cmds as cmd (cmd.id)}
              {@render cmdButton(cmd, true)}
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  {:else}
  <div class="rb-row">
    <!--
      Document-level commands, in their own box before the first group.
      ─────────────────────────────────────────────────────────────────
      Project, Save, Undo and Redo do not act on the model in front of you —
      they act on WHICH model you have. Filing them under a group heading would
      misstate their scope, and scattering them (two in the title bar, three at
      the far right) made the most consequential commands the hardest to find.

      Two rows of two, not a row of four: at ribbon height a single row of small
      square buttons reads as a strip of unrelated glyphs, while a 2×2 block
      reads as one control with the document pair above and the history pair
      below. It also costs half the width, which the groups want.
    -->
    <div class="rb-quick" data-testid="rb-quick">
      <div class="rb-quick-row">
        <button
          class="rb-quick-btn"
          class:active={activePanel === 'project'}
          onclick={() => onOpenPanel('project')}
          title={t('ribbon.project')}
          aria-label={t('ribbon.project')}
          data-testid="hdr-project"
        ><Icon name="project" size={21} /></button>
        <button
          class="rb-quick-btn"
          onclick={() => saveProject()}
          title="{t('project.saveTab')} ({mod}+S)"
          aria-label={t('project.saveTab')}
          data-testid="rb-save"
        ><Icon name="save" size={21} /></button>
      </div>
      <div class="rb-quick-row">
        <button
          class="rb-quick-btn"
          onclick={() => historyStore.undo()}
          disabled={!historyStore.canUndo}
          title="{t('toolbar.undo')} ({mod}+Z)"
          aria-label={t('toolbar.undo')}
        ><Icon name="undo" size={16} /></button>
        <button
          class="rb-quick-btn"
          onclick={() => historyStore.redo()}
          disabled={!historyStore.canRedo}
          title="{t('toolbar.redo')} ({mod}+Y)"
          aria-label={t('toolbar.redo')}
        ><Icon name="redo" size={16} /></button>
      </div>
    </div>

    {#each GROUPS as g (g.id)}
      <section class="rb-group" data-group={g.id} aria-label={t(g.labelKey)}>
        <div class="rb-cmds">
          {#each g.cmds as c (c.id)}
            {@render cmdButton(c, false)}
          {/each}
        </div>
        <p class="rb-group-label">{t(g.labelKey)}</p>
      </section>
    {/each}

    <div class="rb-spacer"></div>
  </div>
  {/if}
</div>

<style>
  .ribbon {
    background: var(--st-surface);
    border-bottom: 1px solid var(--st-hair);
    font-family: var(--st-sans);
    flex: none;
    user-select: none;
    /*
       The anchor for the phone's cluster menu, which is `top: 100%` of THIS.
       Without it the menu resolves against whatever positioned ancestor it
       finds — the app container — and `100%` becomes the height of the whole
       page, so the menu opens at the bottom of the screen, behind the sheet.
    */
    position: relative;
  }

  .rb-row {
    display: flex;
    align-items: stretch;
    padding: 0.3rem 0.5rem 0;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  /*
     The vertical rule is what makes a ribbon scan faster than a row of
     buttons: it turns seventeen commands into four things to choose between.
  */
  .rb-group {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 0 0.6rem 0.2rem;
    border-right: 1px solid var(--st-hair);
    flex: none;
  }

  .rb-cmds { display: flex; align-items: flex-start; gap: 0.1rem; }

  .rb-cmd {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    min-width: 52px;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    padding: 0.3rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }

  /*
     The lone command of a group has to read as one, so it takes the height the
     icon-plus-label pairs beside it occupy and a larger glyph to fill it.
  */
  .rb-cmd.prominent {
    justify-content: center;
    align-self: stretch;
    padding: 0.45rem 0.7rem;
  }

  .rb-cmd.prominent :global(svg) {
    width: 30px;
    height: 30px;
  }

  .rb-cmd:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }

  .rb-cmd.active {
    background: var(--st-selected-bg);
    border-color: var(--st-accent);
    color: var(--st-text);
  }

  .rb-cmd.active .rb-icon { color: var(--st-accent); }

  /*
     Greyed, never removed. A command that disappears when it cannot run
     teaches nothing and shifts its neighbours under the cursor; a greyed one
     says the feature exists, and its tooltip says what it is waiting for.
  */
  .rb-cmd:disabled { opacity: 0.34; cursor: default; }

  .rb-icon {
    display: flex;
    color: var(--st-text);
  }

  .rb-cmd:disabled .rb-icon { color: var(--st-text-2); }

  /* A symbol is the engineering notation itself, so it takes the mono face. */
  .rb-label.symbol {
    font-family: var(--st-mono);
    font-size: 0.72rem;
    letter-spacing: 0.02em;
  }

  .rb-label {
    font-size: 0.63rem;
    line-height: 1.15;
    text-align: center;
    max-width: 9ch;
  }

  .rb-group-label {
    margin: 0.2rem 0 0;
    text-align: center;
    font-family: var(--st-mono);
    font-size: 0.57rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--st-text-3);
    white-space: nowrap;
  }

  .rb-spacer { flex: 1; min-width: 0.5rem; }

  /*
     Boxed off, ahead of the first group, with the same rule the groups use
     between themselves — so it reads as a peer of the groups rather than as
     part of View, which is what it would look like sitting flush against it.
  */
  /*
     Ruled like the groups beside it, not merely spaced.
     ───────────────────────────────────────────────────
     The four commands read as one undifferentiated block of glyphs. The ribbon
     already has a vocabulary for "these belong together but are not the same
     thing" — the hairline between View and Draw — so the block uses it: a rule
     between Project and Save, and one under both separating the document pair
     from the history pair.

     The rules are borders on cells that already existed, so the block is the
     same width it was; nothing here widens the ribbon.
  */
  /*
     A 2×2 grid filling the block, so the rules are edges rather than segments.
     ─────────────────────────────────────────────────────────────────────────
     As a centred column the two rows occupied only their own height and left a
     gap above and below, so the vertical rule stopped short of the top and the
     horizontal one stopped short of the sides — two lines floating inside a box
     rather than dividing it. A grid stretched to the block's full height makes
     each rule the full edge of the cell it belongs to.

     `margin-left: -0.5rem` cancels the row's own left padding so the block sits
     flush against the window edge and the horizontal rule reaches it. The
     ribbon's height is unchanged: the block still fits between the row padding
     and the group labels.
  */
  .rb-quick {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    padding: 0;
    margin: -0.3rem 0.3rem 0 -0.5rem;
    border-right: 1px solid var(--st-hair);
    align-self: stretch;
    flex: none;
  }

  /* The grid places the four cells; the rows are transparent wrappers. */
  .rb-quick-row {
    display: contents;
  }

  /*
     The document pair carries the dividers; history sits plain beneath it.
     `--st-hair-strong` rather than `--st-hair`: the group separators run the
     ribbon's full height, so they read at a low alpha — these are short
     segments and disappear at the same value.

     With `display: contents` the rows vanish from the box model but remain in
     the DOM, so the rules are still addressed through them — `:nth-child` on
     the buttons would count within each row and hit both.
  */
  .rb-quick-row:first-child .rb-quick-btn { border-bottom: 1px solid var(--st-hair-strong); }
  .rb-quick-row:first-child .rb-quick-btn:first-child { border-right: 1px solid var(--st-hair-strong); }


  .rb-quick-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    /* Square cells: the dividers are cell edges, and a radius would round them. */
    border: none;
    color: var(--st-text-2);
    font-size: 1rem;
    line-height: 1;
    padding: 0.3rem 0.55rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .rb-quick-btn:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .rb-quick-btn.active { color: var(--st-accent); border-color: var(--st-hair); }
  .rb-quick-btn:disabled { opacity: 0.32; cursor: default; }

  /* ── Size variants ───────────────────────────────────────────────────
     Four steps, so a narrowing window degrades smoothly rather than
     truncating. No variant drops a command: only labels and scale give way.
     ────────────────────────────────────────────────────────────────── */

  @media (max-width: 1500px) {
    .rb-cmd { min-width: 46px; }
    .rb-group { padding: 0 0.45rem 0.2rem; }
  }

  @media (max-width: 1180px) {
    .rb-label { display: none; }
    .rb-cmd { min-width: 34px; padding: 0.35rem 0.3rem; }
    .rb-group { padding: 0 0.35rem 0.2rem; }
  }

  /* ── The phone ───────────────────────────────────────────────────────
     A fourth variant, and the only one that changes the ARRANGEMENT rather
     than the scale. See `PHONE_ROW` in the script for why: seventeen commands
     laid flat are 748 px of content in a 375 px row, so the interface becomes
     the swipe. Two long groups collapse to one button each and the row holds
     nine controls — Project, undo, redo, Selection, 2D/3D, Model, Solve,
     Advanced, Results.

     Nine × 44 px is 396 px, so at 375 px the row still gives up about 20 px to
     a scroll and at 390 px and above it fits outright. Twenty pixels and four
     hundred and sixty are not the same problem.
     ────────────────────────────────────────────────────────────────── */
  @media (max-width: 767px) {
    /*
       Nine slots that share the width, whatever the width is.
       ──────────────────────────────────────────────────────
       Fixed 44 px squares came to 396 px, so the smallest phone gave up 32 px
       to a scroll while a large one left 34 px of dead space at the end. Both
       are the same mistake: a fixed size on a row whose job is to be the width
       of the screen.

       Every slot is `flex: 1 1 0` instead, so nine equal shares divide whatever
       there is — about 40 px at 375, 46 at 430, 41 at 390. Nothing ever
       scrolls and nothing is ever cut.

       40 px is under the 44 px guideline and that is the deliberate trade: a
       control four pixels narrow but always visible beats one at the reference
       size that has to be swiped into view. Height stays at 44, so the target
       is short in one dimension only, and it is the dimension a thumb moving
       along a row is least sensitive to.
    */
    .rb-row-phone {
      display: flex;
      align-items: stretch;
      gap: 0;
      padding: 3px 4px;
      /* Kept as a floor for anything narrower than the design allows for. */
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
    }
    .rb-row-phone::-webkit-scrollbar { display: none; }

    /*
       One share each. `min-width: 0` is what lets a flex item shrink below its
       content — without it the icons hold the row at its natural width and the
       whole arrangement silently goes back to scrolling.
    */
    .rb-row-phone .rb-cmd {
      flex: 1 1 0;
      min-width: 0;
      min-height: 44px;
      padding: 0;
      justify-content: center;
      border-radius: var(--st-radius);
    }

    /*
       The document block is three slots, so it takes three shares and divides
       them among its own buttons. Written as `flex: 3` rather than as a width,
       so it stays in step if the row ever gains or loses a control.
    */
    .rb-row-phone .rb-quick {
      flex: 3 1 0;
      min-width: 0;
      display: flex;
      margin: 0 2px 0 0;
      padding: 0;
      border-right: 1px solid var(--st-hair);
      align-self: stretch;
    }

    .rb-row-phone .rb-quick-btn {
      flex: 1 1 0;
      min-width: 0;
      min-height: 44px;
      padding: 0;
      border: none;
    }

    /* Icons only in the row; the popover is where words fit. */
    .rb-row-phone .rb-label { display: none; }

    /*
       The document block keeps the ribbon's own separator so it reads as a
       group of three rather than as the first three of nine. It is a plain
       flex row here — the desktop 2×2 grid is 88 px tall, which is more
       ribbon than a 667 px screen can spare.
    */
    .rb-row-phone .rb-quick {
      display: flex;
      margin: 0 2px 0 0;
      padding: 0;
      border-right: 1px solid var(--st-hair);
      align-self: center;
    }

    .rb-row-phone .rb-quick-btn { border: none; }

    /*
       A cluster is a command that opens a group, so it is drawn as a command
       with a caret rather than as a different kind of control.
    */
    .rb-cluster { position: relative; }

    .rb-caret {
      position: absolute;
      right: 5px;
      bottom: 5px;
      width: 0;
      height: 0;
      border-left: 3.5px solid transparent;
      border-right: 3.5px solid transparent;
      border-top: 4px solid currentColor;
      opacity: 0.75;
    }

    .rb-cluster.open {
      background: var(--st-surface-3);
      color: var(--st-text);
    }

    /*
       Open and ACTIVE are different states and both can be true: the menu is
       showing, and one of the commands inside it is what the panel is drawing.
       The accent border is the ribbon's existing "this is on" and it stays.
    */
    .rb-cluster.active {
      background: var(--st-selected-bg);
      border-color: var(--st-accent);
    }
    .rb-cluster.active .rb-icon { color: var(--st-accent); }

    /* ── The cluster menu ─────────────────────────────────────────── */

    .rb-backdrop {
      position: fixed;
      inset: 0;
      /*
         Above the bottom sheet (z-index 60), not below it. The menu is the
         thing the reader is interacting with; a sheet painting over it would
         make half the commands untappable while they are visibly on screen.
      */
      z-index: 70;
      /* Invisible, but it must still take the tap — see the markup. */
      background: transparent;
    }

    .rb-pop {
      position: absolute;
      z-index: 71;
      left: 4px;
      right: 4px;
      top: 100%;
      background: var(--st-surface);
      border: 1px solid var(--st-hair-strong);
      border-radius: 0 0 8px 8px;
      border-top: none;
      box-shadow: 0 10px 22px -8px rgba(0, 0, 0, 0.55);
      padding: 6px 8px 10px;
    }

    .rb-pop-title {
      margin: 0 0 6px;
      font-family: var(--st-mono);
      font-size: 0.6rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--st-text-3);
    }

    /*
       Wraps, because the results group is six commands in 2D and nine in 3D
       and a menu that scrolls sideways is the problem this whole variant was
       written to remove.
    */
    .rb-pop-cmds {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    /* In the menu there is room for the word, so the word comes back. */
    .rb-pop .rb-cmd.labelled {
      width: auto;
      min-width: 66px;
      height: auto;
      min-height: 56px;
      padding: 6px 4px;
      gap: 3px;
      flex: 1 1 66px;
      max-width: 96px;
      border: 1px solid var(--st-hair);
    }

    .rb-pop .rb-cmd.labelled .rb-label {
      display: block;
      font-size: 0.62rem;
      max-width: none;
    }

    .rb-pop .rb-cmd.labelled.active {
      border-color: var(--st-accent);
      background: var(--st-selected-bg);
    }

    /* `prominent` sizes a lone command to carry its group's height; with the
       captions gone there is no extra height to carry. */
    .rb-cmd.prominent { padding: 0; }
    .rb-cmd.prominent :global(svg) { width: 22px; height: 22px; }
  }

</style>
