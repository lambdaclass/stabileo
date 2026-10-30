import { exportMessages, warningImage, warningCanvas } from '../export/containment';
// File operations: save/load projects, export results, autosave

import { noteDesignHeldIfOff } from './design-presence';
import { adoptLoadCases } from './load-cases-mode';
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { historyStore } from './history.svelte';
import { uiStore } from './ui.svelte';
import { is3DWorkspace } from '../utils/workspace';
import type { ModelSnapshot } from './history.svelte';
import { NO_RELEASE, type Release } from './model.svelte';
import { exportToExcel } from '../export/excel';
import { tabManager } from './tabs.svelte';
import type { TabState } from './tabs.svelte';
import { resetSwitchBackup } from './switch-2d';
import { t } from '../i18n';
import { plainDeepCopy, findUncloneablePath } from '../utils/plain-deep-copy';
import {
  LEGACY_AUTOSAVE_KEY,
  autosaveClear, autosaveRead, autosaveStatus, autosaveWrite,
  type AutosaveFingerprint, type AutosavePolicy, type AutosaveReadResult, type AutosaveWriteResult,
} from './autosave-db';
import {
  type ViewportPresentation3D,
  get2DDisplayDisplacementVertical,
  get2DDisplayMoment,
  get2DDisplayReactionVertical,
  get2DDisplayRotation,
} from '../geometry/coordinate-system';

// ─── File Format ────────────────────────────────────────────────

/**
 * v2.0: typed per-axis releases on elements (`releaseI`/`releaseJ`).
 * v1.0: legacy `hingeStart`/`hingeEnd` booleans — read-migrated on load, never written.
 * Unknown versions are rejected.
 */
export const DEDAL_FILE_VERSION = '2.0' as const;
const KNOWN_VERSIONS = new Set(['1.0', '2.0']);

export interface DedalFile {
  version: typeof DEDAL_FILE_VERSION;
  name: string;
  timestamp: string;
  snapshot: ModelSnapshot;
  appMode?: 'basico' | 'educativo' | 'pro';
  analysisMode?: '2d' | '3d' | 'pro' | 'edu';
  axisConvention3D?: 'rightHand' | 'leftHand';
  viewportPresentation3D?: ViewportPresentation3D;
  /**
   * Whether the model is solved with its own weight.
   *
   * Optional because files written before this existed do not carry it, and those must
   * keep opening. The restore below tells "absent" from "false" and leaves the toggle
   * alone in the first case rather than asserting a value the file never stated.
   */
  includeSelfWeight?: boolean;
  /**
   * The load case Basic's self-weight goes in; `null`: the first dead-load case. Absent: a file
   * written while Basic put self-weight in EVERY dead-load case (see
   * noteBasicSelfWeightRuleIfNeeded), so a newer file always writes the key.
   */
  selfWeightCaseId?: number | null;
}

/** Migrate a snapshot in place: converts legacy hingeStart/hingeEnd → releaseI.mz/releaseJ.mz. */
export function migrateSnapshotV1ToV2(snapshot: Record<string, unknown>): void {
  const elements = snapshot.elements;
  if (!Array.isArray(elements)) return;
  for (const entry of elements as Array<[number, Record<string, unknown>]>) {
    const elem = entry[1];
    if (!elem) continue;
    const releaseI: Release = elem.releaseI as Release | undefined ?? { ...NO_RELEASE };
    const releaseJ: Release = elem.releaseJ as Release | undefined ?? { ...NO_RELEASE };
    if (elem.hingeStart === true) releaseI.mz = true;
    if (elem.hingeEnd === true) releaseJ.mz = true;
    elem.releaseI = releaseI;
    elem.releaseJ = releaseJ;
    delete elem.hingeStart;
    delete elem.hingeEnd;
  }
}

export interface DedalSessionFile {
  version: '1.0';
  type: 'session';
  timestamp: string;
  activeTabId: string;
  tabs: TabState[];
}

// ─── Download Helpers ───────────────────────────────────────────

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadText(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  downloadBlob(blob, filename);
}

/**
 * Whether the browser can offer a "where do you want this?" dialog.
 *
 * `showSaveFilePicker` is the File System Access API. Chromium has it;
 * Firefox and Safari do not, and there is no polyfill worth the name — a
 * page cannot choose a folder without the user's browser offering to. So
 * the capability is reported rather than assumed, and the UI says which of
 * the two behaviours the reader is about to get instead of promising a
 * chooser that may never appear.
 */
export function canChooseSaveLocation(): boolean {
  return typeof window !== 'undefined'
    && typeof (window as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';
}

/**
 * Save `content`, letting the reader pick the folder where that is possible.
 *
 * Falls back to an ordinary download — which lands in whatever the browser
 * calls Downloads — both where the API is missing and where the reader
 * dismisses the dialog... except that a dismissal is a DECISION not to save,
 * and quietly downloading anyway would ignore it. `AbortError` is therefore
 * the one failure that does nothing at all.
 */
export async function saveTextTo(
  content: string,
  filename: string,
  mime: string,
  opts: { chooseLocation?: boolean } = {},
): Promise<'saved' | 'downloaded' | 'cancelled'> {
  if (opts.chooseLocation && canChooseSaveLocation()) {
    try {
      const picker = (window as unknown as {
        showSaveFilePicker: (o: unknown) => Promise<{
          createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }>;
        }>;
      }).showSaveFilePicker;
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: 'Stabileo', accept: { [mime]: ['.ded'] } }],
      });
      const w = await handle.createWritable();
      await w.write(content);
      await w.close();
      return 'saved';
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return 'cancelled';
      /* Anything else — a permission refusal, a quota — still deserves the file. */
    }
  }
  downloadText(content, filename, mime);
  return 'downloaded';
}

/** The project as text plus the name it should be saved under. */
export function projectPayload(): { content: string; filename: string } {
  const safeName = modelStore.model.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim()
    || t('file.defaultProject');
  return { content: serializeProject(), filename: `${safeName}.ded` };
}

/** The whole session — every tab — plus its name. */
export function sessionPayload(): { content: string; filename: string } {
  tabManager.syncCurrentTab();
  const session: DedalSessionFile = {
    version: '1.0',
    type: 'session',
    timestamp: new Date().toISOString(),
    activeTabId: tabManager.activeTabId ?? '',
    tabs: sessionTabsCopy(),
  };
  return {
    content: JSON.stringify(session, null, 2),
    filename: `${t('file.session')}-${session.tabs.length}-${t('file.tabs')}.ded`,
  };
}

// ─── Serialize / Deserialize ────────────────────────────────────

/**
 * The current project as a plain, structured-cloneable `DedalFile`.
 *
 * `plainDeepCopy` rather than trusting `modelStore.snapshot()` alone: the snapshot is built
 * with `$state.snapshot`, which is the right tool inside a component and is the IDENTITY
 * FUNCTION when the module is compiled for the server — so the "no reactive proxies" property
 * holds in the browser and evaporates under Vitest, which is where it is asserted. It also
 * matters more than it used to: `localStorage` took a string, so a proxy could only ever have
 * cost a slower `JSON.stringify`, whereas IndexedDB takes the object itself and structured
 * clone refuses a proxy outright with `DataCloneError`.
 */
export function buildProjectFile(): DedalFile {
  return plainDeepCopy<DedalFile>({
    version: DEDAL_FILE_VERSION,
    name: modelStore.model.name,
    timestamp: new Date().toISOString(),
    snapshot: modelStore.snapshot(),
    appMode: uiStore.appMode,
    analysisMode: uiStore.analysisMode,
    axisConvention3D: uiStore.axisConvention3D,
    viewportPresentation3D: uiStore.viewportPresentation3D,
    /*
     * Self-weight belongs to the model, not to the session.
     *
     * It was not saved, and the default is ON, so a project solved without its own weight
     * reopened with it — quietly. On the reconstructed frame that is ΣRz 1500 kN becoming
     * 1965: a 31 % heavier structure, the same file name, and nothing said. Every number
     * downstream moves with it, including the D/C the drawings were accepted on.
     *
     * The share link has carried this since it was written (see url-sharing.ts). The `.ded`
     * is the format people actually keep, and it was the one dropping it.
     */
    includeSelfWeight: uiStore.includeSelfWeight,
    selfWeightCaseId: statedSelfWeightCaseId(),
  });
}

/**
 * The case Basic's self-weight goes in, as a file or a link writes it: the one chosen while it
 * still exists, else `null` (the first dead-load case — what the solve reads for a deleted one).
 * Always a value, never absent: absence is how an older project is told apart.
 */
export function statedSelfWeightCaseId(): number | null {
  const chosen = uiStore.selfWeightCaseId;
  return chosen !== null && modelStore.model.loadCases.some((c) => c.id === chosen) ? chosen : null;
}

/**
 * The project as a `.ded`, serialised COMPACT.
 *
 * ── What the indentation was costing ───────────────────────────────
 *
 * Measured on `pro-edificio-7p` after the whole chain — 203 members solved, designed, detailed,
 * floors designed, about 21 000 bars in the coordinated document:
 *
 *     JSON.stringify(payload, null, 2)   110 341 310 bytes    202 ms
 *     JSON.stringify(payload)             47 783 950 bytes     56 ms
 *
 * Sixty-two megabytes of a hundred-and-ten were spaces and newlines. A detailing document is
 * mostly deeply-nested arrays of numbers, and at that depth `null, 2` spends about twenty bytes
 * of indentation on every six-byte coordinate.
 *
 * ── Why this is safe ───────────────────────────────────────────────
 *
 * Whitespace is not part of the format. `deserializeProject` and `loadFile` both go through
 * `JSON.parse`, which does not care, and every `.ded` ever written — including the committed
 * `rc-footing-cad-poc.ded.json`, which stays pretty-printed on disk — still opens. The change is
 * one-directional and needs no migration: new files are smaller, old files are unaffected.
 *
 * One consequence worth knowing rather than discovering: regenerating that committed fixture
 * (`WRITE_FIXTURE=1`) now writes it on one line, because it is deliberately produced by this
 * same production writer.
 *
 * `saveSession` keeps its indentation. A session is a handful of tab records and is read by
 * people far more often than it is large.
 */
export function serializeProject(): string {
  return JSON.stringify(buildProjectFile());
}

/**
 * Pure deserializer for a single-tab .ded file. Parses, validates, migrates legacy
 * v1.0 snapshots into the typed-release shape, restores the model, and returns
 * `true` on success. Unknown/invalid payloads return `false` without mutating state.
 */
export function deserializeProject(text: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== 'object') return false;
  const d = parsed as Record<string, unknown>;
  if (typeof d.version !== 'string' || !KNOWN_VERSIONS.has(d.version)) return false;
  const snapshot = d.snapshot as Record<string, unknown> | undefined;
  if (!snapshot) return false;
  if (d.version === '1.0') migrateSnapshotV1ToV2(snapshot);
  if (!isValidDedalFile({ ...d, version: DEDAL_FILE_VERSION })) return false;

  const data = d as unknown as DedalFile;
  adoptStoredProject(data.snapshot, data.name);
  // appMode is derived from analysisMode (getter-only) — assigning it throws
  // in strict mode, which broke opening any .ded that carried appMode.
  // Restoring analysisMode below already yields the right appMode.
  if (data.analysisMode) uiStore.analysisMode = data.analysisMode;
  if (data.axisConvention3D) uiStore.axisConvention3D = data.axisConvention3D;
  if (data.viewportPresentation3D) uiStore.viewportPresentation3D = data.viewportPresentation3D;
  // `!== undefined`, not truthiness: `false` is the value that most needs restoring, and a
  // plain `if (data.includeSelfWeight)` would drop exactly the case this fixes.
  if (data.includeSelfWeight !== undefined) uiStore.includeSelfWeight = data.includeSelfWeight;
  uiStore.selfWeightCaseId = data.selfWeightCaseId ?? null;
  noteBasicSelfWeightRuleIfNeeded(data.selfWeightCaseId !== undefined, uiStore.analysisMode);
  viewVisibility.showAll();
  validateAxisSafety(data);
  resultsStore.clear(); // stale results dropped — the model must be re-solved
  resultsStore.forgetView();
  onProjectOpened(data.snapshot, uiStore.analysisMode);
  return true;
}

/**
 * A stored project made the one in the store, as a `.ded` open and an autosave restore both make
 * it: one undo step back to what was there, the project announced as new (the previous one's
 * runs, marks and design view forgotten), and its provenance (hand edits, exports) adopted. The
 * autosave restore used to do only the `restore()`, so the hand-edit record was the session's
 * empty one: «Size…» then replaced bars edited by hand, and the next autosave wrote it empty.
 */
export function adoptStoredProject(snapshot: ModelSnapshot, name: string): void {
  forgetSessionDemandRevisions(snapshot);
  historyStore.pushState();
  modelStore.restore(snapshot);
  modelStore.announceNewProject();
  // Adopted separately from `restore()`, which is also the undo path — see project-provenance.ts.
  // A file written before these fields existed hydrates to "we do not know", not to "none".
  hydrateProjectProvenance(snapshot);
  adoptLoadCases();
  modelStore.model.name = name;
  // A different model now occupies the store: any 3D original held for the
  // simplified-2D round trip belongs to the model that was just replaced, and
  // restoring it from here on would wipe THIS one. (See switch-2d.ts.)
  resetSwitchBackup();
}

/**
 * What every load path does once a stored project is the one on screen: the one-time notes about
 * conventions it was saved under, and the re-check of results it was last solved with
 * (`recheck.svelte.ts`). Shared by `.ded` open, tab activation, autosave restore and share links,
 * so no entry point opens an old project in silence.
 */
export function onProjectOpened(snap: ModelSnapshot | undefined, analysisMode: string | undefined): void {
  noteAxisConventionMigrationIfNeeded(snap, analysisMode);
  if (snap) {
    // Assess the model that restore actually installed (including legacy defaults,
    // such as Wind/Earthquake load cases), which is also what the next save writes.
    // Otherwise reloading that save adds applicability to the unread notice and
    // changes the snapshot. Provenance still belongs to the opened project, not
    // the previous project's session state captured by modelStore.snapshot().
    recheckStore.openProject({
      ...modelStore.snapshot(),
      solvedWith: snap.solvedWith,
      pendingRecheckNotice: snap.pendingRecheckNotice,
    } as never, analysisMode);
  }
  // Design kept in the project while it is off in PRO's settings: offered, not switched on.
  noteDesignHeldIfOff(analysisMode);
}

/**
 * Surface the one-time "loaded under the corrected local-axis convention" note
 * for a pre-metadata 3D/PRO model that carries members. Shared by EVERY load
 * path — .ded open, URL share, autosave restore, tab/session restore — so the
 * warning is not silently skipped on the non-.ded entry points (under the new
 * convention the model's member diagrams/checks change). 2D models are
 * unaffected. New models always carry localAxisConvention, so the note never
 * fires for them — provided every serializer round-trips the field (URL sharing
 * included, see url-sharing.ts).
 */
export function noteAxisConventionMigrationIfNeeded(
  snap: { localAxisConvention?: string; elements?: unknown[] } | undefined,
  analysisMode: string | undefined,
): void {
  if (!snap) return;
  if (!snap.localAxisConvention && is3DWorkspace(analysisMode ?? '')
    && Array.isArray(snap.elements) && snap.elements.length > 0) {
    uiStore.toast(t('file.loadedNoAxisConvention'), 'info');
  }
}

/**
 * Basic put self-weight in every dead-load case; it now goes in one (basicSelfWeight in
 * model.svelte.ts). On a project written before, with two or more dead-load cases, every
 * combination that adds them changes on opening — a cantilever with D1 = 10 kN, D2 = 5 kN and
 * U = 1.2·D1 + 1.2·D2 went from about 23.2 to 20.6 kN — so it is said once, with PRO's words for
 * the same change. Shared by every load path, as the note above is: `.ded`, link, tab, autosave.
 *
 * `statesCase`: the project wrote `selfWeightCaseId` (a number or `null`); every newer one does.
 * Only a Basic workspace with self-weight on and members is told: PRO migrates on its own
 * (self-weight-migration.ts), and with the weight off or no members nothing changed.
 */
export function noteBasicSelfWeightRuleIfNeeded(statesCase: boolean, analysisMode: string | undefined): void {
  if (statesCase || analysisMode === 'pro' || !uiStore.includeSelfWeight) return;
  if (modelStore.elements.size === 0) return;
  const dead = modelStore.model.loadCases.filter((c) => c.type === 'D');
  if (dead.length < 2) return;
  uiStore.toast(t('selfWeight.migratedMany').replaceAll('{case}', dead[0]!.name).replaceAll('{n}', String(dead.length)), 'info');
}

/**
 * `validateDedalFile`, but a payload malformed enough to make the checks themselves throw
 * (a `null` where an element record should be) is refused like any other invalid file rather
 * than escaping as a TypeError from the middle of a load.
 */
function isValidDedalFile(data: unknown): data is DedalFile {
  try {
    return validateDedalFile(data);
  } catch {
    return false;
  }
}

/**
 * Mark every detailing assembly in a snapshot as generated against unknown demands.
 *
 * `demandRevision` is a counter of THIS session's solves (`verificationStore.demandRevision`,
 * starting at 0), and an assembly is "current" when its stamp equals the counter. A stamp read
 * back from a file, an autosave or a stored session was minted by another session, so equality
 * with this session's counter is a coincidence — or, for a crafted file, a choice: a project whose
 * assemblies say `0` opened in a fresh tab passed the staleness gate (and the CAD export behind
 * it) without anything having been solved. -1 is the value the migration already uses for
 * "unknown", and the counter never takes it, so the bars read as stale until the model is
 * solved and detailing regenerated in this session.
 *
 * Applied at the load boundaries only. `modelStore.restore()` is also the undo path, where the
 * stamps were minted by this session and must be kept.
 */
export function forgetSessionDemandRevisions(snapshot: unknown): void {
  const det = (snapshot as { detailing?: { assemblies?: unknown } } | null | undefined)?.detailing;
  if (!det || !Array.isArray(det.assemblies)) return;
  for (const a of det.assemblies) {
    if (a && typeof a === 'object') (a as { demandRevision: number }).demandRevision = -1;
  }
}

const SESSION_TAB_MODES = new Set(['2d', '3d', 'pro', 'edu']);

/**
 * Every tab, as plain data.
 *
 * This module is plain TypeScript, so the Svelte compiler never sees it and `$state.snapshot`
 * was a bare global reference: a `ReferenceError` at runtime, in the browser as under Vitest.
 * `saveWorkspaceToLocalStorage` swallowed it, so the workspace was never written, and
 * `saveSession`/`sessionPayload` threw it at the user. `plainDeepCopy` is what the project
 * payload already uses for the same job.
 */
function sessionTabsCopy(): TabState[] {
  return plainDeepCopy(tabManager.tabs);
}

/** A stored tab the project gate refused: where it was and what it was called. */
export interface DroppedSessionTab {
  index: number;
  /** The tab's own name, or null when the record did not carry a usable one. */
  name: string | null;
}

export interface SessionTabsVerdict {
  /** The tabs that passed, in their stored order. May be empty. */
  tabs: TabState[];
  /** The tabs that did not, so the caller can say which. */
  dropped: DroppedSessionTab[];
}

/**
 * Validate a stored session (a session `.ded` or the localStorage workspace) before any of it
 * reaches the stores, and stamp it as foreign to this session.
 *
 * A single-tab `.ded` has always gone through `validateDedalFile`; a session went straight to
 * `restoreSession`, so the same file wrapped in `{type:'session', tabs:[…]}` skipped every
 * structural and referential check. Each tab's snapshot now passes the project gate, and the
 * undo/redo stacks — also snapshots, restored on Ctrl+Z — are dropped if any entry would not.
 *
 * Tab by tab, not all or nothing. Refusing the whole session over one tab used to cost every
 * other tab: for the workspace, App restored nothing and the next save wrote the empty session
 * over the stored one. The refused tabs are returned by name so the caller tells the user.
 */
export function acceptSessionTabs(rawTabs: unknown): SessionTabsVerdict {
  const verdict: SessionTabsVerdict = { tabs: [], dropped: [] };
  if (!Array.isArray(rawTabs)) return verdict;
  rawTabs.forEach((raw, index) => {
    const tab = acceptSessionTab(raw);
    if (tab) {
      verdict.tabs.push(tab);
    } else {
      const name = (raw as { name?: unknown } | null)?.name;
      verdict.dropped.push({ index, name: typeof name === 'string' && name.trim() !== '' ? name : null });
    }
  });
  return verdict;
}

function acceptSessionTab(raw: unknown): TabState | null {
  try {
    if (!raw || typeof raw !== 'object') return null;
    const tab = raw as TabState;
    if (typeof tab.id !== 'string' || typeof tab.name !== 'string') return null;
    if (!SESSION_TAB_MODES.has(tab.analysisMode)) return null;
    const asFile = (snapshot: unknown) => ({ version: DEDAL_FILE_VERSION, name: tab.name, snapshot });
    if (!isValidDedalFile(asFile(tab.modelSnapshot))) return null;
    const stacksOk = [tab.undoStack, tab.redoStack].every(
      (stack) => Array.isArray(stack) && stack.every((snap) => isValidDedalFile(asFile(snap))),
    );
    if (!stacksOk) {
      tab.undoStack = [];
      tab.redoStack = [];
      tab.undoKinds = [];
      tab.redoKinds = [];
    }
    for (const snap of [tab.modelSnapshot, ...tab.undoStack, ...tab.redoStack]) {
      forgetSessionDemandRevisions(snap);
    }
    return tab;
  } catch {
    // A record shaped badly enough to throw inside the gate is refused like any other.
    return null;
  }
}

/** "«A», «B»" for the toast; a tab without a name is called by its position. */
function droppedTabNames(dropped: DroppedSessionTab[]): string {
  return dropped
    .map((d) => `«${d.name ?? t('file.sessionTabUnnamed').replace('{n}', String(d.index + 1))}»`)
    .join(', ');
}

function validateDedalFile(data: unknown): data is DedalFile {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;

  if (typeof d.version !== 'string') return false;
  if (typeof d.name !== 'string') return false;

  const s = d.snapshot as Record<string, unknown> | undefined;
  if (!s) return false;
  if (!Array.isArray(s.nodes)) return false;
  if (!Array.isArray(s.elements)) return false;
  if (!Array.isArray(s.materials)) return false;
  if (!Array.isArray(s.sections)) return false;
  if (!Array.isArray(s.supports)) return false;
  if (!Array.isArray(s.loads)) return false;

  const nextId = s.nextId as Record<string, unknown> | undefined;
  if (!nextId || typeof nextId.node !== 'number') return false;

  // Verify referential integrity: element nodes exist
  const nodeIds = new Set((s.nodes as Array<[number, unknown]>).map(([id]) => id));
  for (const [, elem] of s.elements as Array<[number, { nodeI: number; nodeJ: number }]>) {
    if (!nodeIds.has(elem.nodeI) || !nodeIds.has(elem.nodeJ)) {
      return false;
    }
  }

  // Shells (plates/quads) node refs — ubiquitous in PRO/CAD-draft models. An
  // orphan ref would load verbatim and feed a phantom node into shell render/
  // solve (convertSurfaceLoad/WASM); reject the file like a bad element ref.
  for (const [, q] of (s.quads as Array<[number, { nodes: number[] }]> | undefined) ?? []) {
    if (!Array.isArray(q.nodes) || q.nodes.some((n) => !nodeIds.has(n))) return false;
  }
  for (const [, p] of (s.plates as Array<[number, { nodes: number[] }]> | undefined) ?? []) {
    if (!Array.isArray(p.nodes) || p.nodes.some((n) => !nodeIds.has(n))) return false;
  }

  // Surface/thermal loads must target an existing quad (CAD drafts attach one
  // per slab quad); a dangling target is silently dropped at solve time.
  const quadIds = new Set(((s.quads as Array<[number, unknown]> | undefined) ?? []).map(([id]) => id));
  const plateIds = new Set(((s.plates as Array<[number, unknown]> | undefined) ?? []).map(([id]) => id));
  for (const l of s.loads as Array<{ type: string; data?: { quadId?: number; on?: string } }>) {
    if ((l.type === 'surface3d' || l.type === 'thermalQuad3d')
      && l.data?.quadId !== undefined && !(l.data.on === 'plate' ? plateIds : quadIds).has(l.data.quadId)) {
      return false;
    }
  }

  return true;
}

/**
 * Axis safety validation for loaded files.
 * Checks that 2D snapshots don't contain mixed z coordinates that would indicate
 * a 3D model was saved with the wrong analysisMode.
 */
function validateAxisSafety(data: DedalFile): void {
  const mode = data.analysisMode ?? '2d';
  if (is3DWorkspace(mode)) return; // 3D/PRO files can have any coordinates

  const nodes = data.snapshot.nodes as Array<[number, { x: number; y: number; z?: number }]>;
  if (nodes.length === 0) return;

  let hasNonZeroZ = false;
  for (const [, node] of nodes) {
    if (node.z !== undefined && node.z !== 0) {
      hasNonZeroZ = true;
      break;
    }
  }

  // If a 2D file has non-zero z coordinates, upgrade it to 3D mode
  // to prevent the model from being silently flattened
  if (hasNonZeroZ) {
    uiStore.analysisMode = '3d';
    console.warn('[Dedaliano] File loaded as 2D but contains non-zero Z coordinates — upgraded to 3D mode');
  }
}

// ─── Save / Load ────────────────────────────────────────────────

export function saveProject(): void {
  const json = serializeProject();
  const safeName = modelStore.model.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || t('file.defaultProject');
  downloadText(json, `${safeName}.ded`, 'application/json');
}

export async function loadProject(file: File): Promise<void> {
  const text = await file.text();
  if (!deserializeProject(text)) {
    throw new Error(t('file.invalidFormat'));
  }
  // Members lying over each other: ask about each, as drawing one would.
  askAboutOverlapsInModel();
}

// ─── Session Save / Load (all tabs) ─────────────────────────────

export function saveSession(): void {
  // Ensure the active tab is up-to-date before serializing
  tabManager.syncCurrentTab();
  const session: DedalSessionFile = {
    version: '1.0',
    type: 'session',
    timestamp: new Date().toISOString(),
    activeTabId: tabManager.activeTabId ?? '',
    tabs: sessionTabsCopy(),
  };
  const json = JSON.stringify(session, null, 2);
  const tabCount = session.tabs.length;
  downloadText(json, `${t('file.session')}-${tabCount}-${t('file.tabs')}.ded`, 'application/json');
}

function isSessionFile(data: unknown): data is DedalSessionFile {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return d.type === 'session' && Array.isArray(d.tabs);
}

/** Load a .ded file — auto-detects single tab vs full session */
export async function loadFile(file: File): Promise<{ type: 'tab' | 'session'; count: number }> {
  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(t('file.invalidJson'));
  }

  if (isSessionFile(data)) {
    // Session file: restore its tabs — through the same gate a single-tab file passes.
    //
    // The tabs that pass are opened and the others named, rather than refusing the file over
    // one of them. Nothing is lost either way, since the file stays on disk as it was; but
    // refusing it kept every good tab out of reach, and the toast says what did not open.
    const { tabs, dropped } = acceptSessionTabs(data.tabs);
    if (tabs.length === 0) throw new Error(t('file.invalidFormat'));
    const activeTabId = typeof data.activeTabId === 'string' ? data.activeTabId : '';
    tabManager.restoreSession(tabs, activeTabId);
    if (dropped.length > 0) {
      uiStore.toast(t('file.sessionTabsDropped').replace('{names}', droppedTabNames(dropped)), 'error');
    }
    return { type: 'session', count: tabs.length };
  } else if (deserializeProject(text)) {
    askAboutOverlapsInModel();
    return { type: 'tab', count: 1 };
  } else {
    throw new Error(t('file.invalidFormat'));
  }
}

// ─── Export Results CSV ─────────────────────────────────────────

/**
 * The results as CSV. With `solveError` (the solve run for this export failed) and no results,
 * the file is its header and the reason, so the download still says what happened.
 */
export function exportResultsCSV(solveError?: string, record?: ResultProvenance): string {
  const is3D = uiStore.is3DWorkspace;
  const r3d = resultsStore.results3D;
  const r2d = resultsStore.results;

  if (!r3d && !r2d && !solveError) return '';

  const lines: string[] = [];
  lines.push(`# Stabileo — ${t('file.csvResults')} ${is3D ? '3D' : '2D'}`);
  lines.push(`# ${t('file.csvProject')}: ${modelStore.model.name}`);
  lines.push(`# ${t('file.csvDate')}: ${new Date().toLocaleString()}`);
  // Which build produced these numbers from which model and settings (`provenance/result-provenance.ts`).
  // The status row comes first and says STALE when the results predate registered changes.
  for (const [k, v] of provenanceTextLines(record ?? currentResultProvenance(), provenanceLabels())) lines.push(`# ${k}: ${v}`);
  lines.push('');
  if (!r3d && !r2d) {
    lines.push(`# ${t('excel.solveFailed')}`);
    lines.push(`# ${solveError!.replace(/\s*\n\s*/g, ' ')}`);
    lines.push(`# ${t('file.csvSolveFailedHint')}`);
    return lines.join('\n');
  }

  if (is3D && r3d) {
    // 3D Displacements
    lines.push(`# ${t('file.displacements')}`);
    lines.push(`${t('file.node')},ux (m),uy (m),uz (m),rx (rad),ry (rad),rz (rad)`);
    for (const d of r3d.displacements) {
      lines.push(`${d.nodeId},${d.ux},${d.uy},${d.uz},${d.rx},${d.ry},${d.rz}`);
    }
    lines.push('');

    // 3D Reactions
    lines.push(`# ${t('file.reactions')}`);
    lines.push(`${t('file.node')},Fx (kN),Fy (kN),Fz (kN),Mx (kN·m),My (kN·m),Mz (kN·m)`);
    for (const r of r3d.reactions) {
      lines.push(`${r.nodeId},${r.fx},${r.fy},${r.fz},${r.mx},${r.my},${r.mz}`);
    }
    lines.push('');

    // 3D Element forces
    lines.push(`# ${t('file.internalForces')}`);
    lines.push(`${t('file.element')},L (m),Ni (kN),Nj (kN),Vyi (kN),Vyj (kN),Vzi (kN),Vzj (kN),Mxi (kN·m),Mxj (kN·m),Myi (kN·m),Myj (kN·m),Mzi (kN·m),Mzj (kN·m)`);
    for (const f of r3d.elementForces) {
      lines.push(`${f.elementId},${f.length},${f.nStart},${f.nEnd},${f.vyStart},${f.vyEnd},${f.vzStart},${f.vzEnd},${f.mxStart},${f.mxEnd},${f.myStart},${f.myEnd},${f.mzStart},${f.mzEnd}`);
    }
  } else if (r2d) {
    // 2D Displacements
    lines.push(`# ${t('file.displacements')}`);
    lines.push(`${t('file.node')},ux (m),uz (m),ry (rad)`);
    for (const d of r2d.displacements) {
      lines.push(`${d.nodeId},${d.ux},${get2DDisplayDisplacementVertical(d)},${get2DDisplayRotation(d)}`);
    }
    lines.push('');

    // 2D Reactions
    lines.push(`# ${t('file.reactions')}`);
    lines.push(`${t('file.node')},Rx (kN),Rz (kN),My (kN·m)`);
    for (const r of r2d.reactions) {
      lines.push(`${r.nodeId},${r.rx},${get2DDisplayReactionVertical(r)},${get2DDisplayMoment(r)}`);
    }
    lines.push('');

    // 2D Element forces
    lines.push(`# ${t('file.internalForces')}`);
    lines.push(`${t('file.element')},N_i (kN),N_j (kN),V_i (kN),V_j (kN),M_i (kN·m),M_j (kN·m),L (m),qI (kN/m),qJ (kN/m)`);
    for (const f of r2d.elementForces) {
      lines.push(`${f.elementId},${f.nStart},${f.nEnd},${f.vStart},${f.vEnd},${f.mStart},${f.mEnd},${f.length},${f.qI},${f.qJ}`);
    }
  }

  return lines.join('\n');
}

/**
 * The results CSV with its provenance prepared as every export prepares it: engine hashes awaited
 * (off the main thread), record bound to the state the export started on. Null, said to the
 * reader, when the project moved meanwhile.
 */
export async function prepareResultsCSV(solveError?: string): Promise<string | null> {
  let record: ResultProvenance;
  try {
    record = await provenanceForExport(captureProvenanceToken());
  } catch (e) {
    if (e instanceof ExportChangedError) { uiStore.toast(e.message, 'error'); return null; }
    throw e;
  }
  return exportResultsCSV(solveError, record);
}

/**
 * Download the results CSV. Async like every export that prints provenance: the record is
 * prepared with the engine hashes awaited (off the main thread) and bound to the state the export
 * started on (`provenanceForExport`); if the project moved meanwhile, nothing is written, and the
 * reader is told.
 */
export async function downloadResultsCSV(solveError?: string): Promise<void> {
  const csv = await prepareResultsCSV(solveError);
  if (!csv) return;
  const safeName = modelStore.model.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || t('file.defaultResults');
  downloadText(csv, `${safeName}_${t('file.defaultResults')}.csv`, 'text/csv');
}

// ─── Export PNG ─────────────────────────────────────────────────

/** A PNG given as a data URL, saved under the project's name. */
export async function downloadDataUrlPNG(dataUrl: string, embed?: (png: Uint8Array) => Uint8Array): Promise<void> {
  const warnings = exportMessages(); if (warnings === null) return;
  dataUrl = await warningImage(dataUrl, warnings);
  const safeName = modelStore.model.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || t('file.defaultStructure');
  const bin = atob(dataUrl.split(',')[1] ?? '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  downloadBlob(new Blob([(embed ? embed(bytes) : bytes) as BlobPart], { type: 'image/png' }), `${safeName}.png`);
}

export function downloadCanvasPNG(canvas: HTMLCanvasElement, embed?: (png: Uint8Array) => Uint8Array): void {
  const warnings = exportMessages(); if (warnings === null) return;
  canvas = warningCanvas(canvas, warnings);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const safeName = modelStore.model.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || t('file.defaultStructure');
    if (!embed) { downloadBlob(blob, `${safeName}.png`); return; }
    void blob.arrayBuffer().then((b) => downloadBlob(new Blob([embed(new Uint8Array(b)) as BlobPart], { type: 'image/png' }), `${safeName}.png`));
  }, 'image/png');
}

import { hydrateProjectProvenance } from './project-provenance';
import { recheckStore } from './recheck.svelte';
import { currentResultProvenance, provenanceLabels, captureProvenanceToken, provenanceForExport, ExportChangedError } from './result-provenance';
import type { ResultProvenance } from '../provenance/result-provenance';
import { provenanceTextLines } from '../provenance/result-provenance';
import { askAboutOverlapsInModel } from '../model/edit/connection-questions';
import { viewVisibility } from './view-state.svelte';

// ─── Export Excel ────────────────────────────────────────────────

export async function downloadExcel(opts: Omit<Parameters<typeof exportToExcel>[0] & object, 'filename'> = {}): Promise<void> {
  const safeName = modelStore.model.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || t('file.defaultAnalysis');
  // Async because xlsx is fetched on demand — see lib/export/excel.ts.
  await exportToExcel({ ...opts, filename: `${safeName}.xlsx` });
}

// ─── AutoSave ───────────────────────────────────────────────────

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function';
  } catch { return false; }
}

/**
 * The oldest storage key, from before the rename.
 *
 * Still migrated forward: `autosave-db` imports the `stabileo-autosave` slot into IndexedDB
 * once and then removes it, so a project last saved under the original name still survives
 * two migrations rather than one.
 */
if (hasLocalStorage()) {
  if (localStorage.getItem('dedaliano-autosave') !== null && localStorage.getItem(LEGACY_AUTOSAVE_KEY) === null) {
    localStorage.setItem(LEGACY_AUTOSAVE_KEY, localStorage.getItem('dedaliano-autosave')!);
    localStorage.removeItem('dedaliano-autosave');
  }
}

const WORKSPACE_KEY = 'stabileo-workspace';

// ─── AutoSave (IndexedDB) ───────────────────────────────────────

/**
 * Validate and migrate one stored autosave payload, or refuse it.
 *
 * Same gate as opening a `.ded`, deliberately: the migrations, the version allow-list and the
 * referential-integrity checks are the project's, not the storage layer's, and a payload that
 * would be rejected as a file has no business being restored as an autosave.
 */
export function acceptAutosavePayload(raw: unknown): DedalFile | null {
  if (!raw || typeof raw !== 'object') return null;
  // Copied before migrating: `migrateSnapshotV1ToV2` rewrites in place, and mutating a record
  // that is still sitting in IndexedDB would make a read a write.
  const data = plainDeepCopy(raw) as Record<string, unknown>;
  if (typeof data.version !== 'string' || !KNOWN_VERSIONS.has(data.version)) return null;
  if (data.version === '1.0' && data.snapshot) {
    migrateSnapshotV1ToV2(data.snapshot as Record<string, unknown>);
    data.version = DEDAL_FILE_VERSION;
  }
  if (!isValidDedalFile(data)) return null;
  // An autosave is read back by a later page load — a different session (see the helper).
  forgetSessionDemandRevisions(data.snapshot);
  return data as unknown as DedalFile;
}

/**
 * Structural census of a stored project.
 *
 * A count per family, not a hash — see the note in `autosave-db.ts`. It is here rather than
 * there because only this module knows what families a project has.
 */
export function autosaveFingerprint(raw: unknown): AutosaveFingerprint {
  const snap = (raw as { snapshot?: Record<string, unknown> } | null)?.snapshot;
  const n = (k: string): number => {
    const v = snap?.[k];
    return Array.isArray(v) ? v.length : 0;
  };
  return {
    nodes: n('nodes'),
    elements: n('elements'),
    materials: n('materials'),
    sections: n('sections'),
    supports: n('supports'),
    loads: n('loads'),
    plates: n('plates'),
    quads: n('quads'),
    footings: n('footings'),
    // Reinforcement is the payload that overflowed localStorage in the first place, so it is
    // the one whose disappearance between write and read must not go unnoticed.
    reinforced: Array.isArray(snap?.elements)
      ? (snap.elements as Array<[number, { reinforcement?: unknown }]>)
        .filter((e) => Array.isArray(e) && !!e[1]?.reinforcement).length
      : 0,
  };
}

export const projectAutosavePolicy: AutosavePolicy<DedalFile> = {
  accept: acceptAutosavePayload,
  fingerprint: autosaveFingerprint,
};

/** Reported once per session per kind — a warning on a 30 s timer is a warning nobody reads. */
const autosaveNoticesShown = new Set<string>();

/** Test seam: forget which notices have already been shown. */
export function resetAutosaveNotices(): void {
  autosaveNoticesShown.clear();
}

function noticeOnce(kind: string, message: string, type: 'error' | 'info' = 'error'): void {
  if (autosaveNoticesShown.has(kind)) return;
  autosaveNoticesShown.add(kind);
  uiStore.toast(message, type);
}

/**
 * Autosave the project, and SAY SO when it cannot.
 *
 * ── The silence this removes ───────────────────────────────────────
 *
 * `localStorage` gives an origin a few megabytes. A structural model fits easily; the same
 * model once every member carries reinforcement and a coordinated detailing does not. Measured
 * on `Edificio H.A. 7 pisos — PRO`: 172 kB before the design, over quota after `designAll`.
 *
 * The write therefore started throwing `QuotaExceededError` at exactly the moment the project
 * became worth saving. The consequence was not a missing feature, it was lost work presented
 * as saved work: the key still held the PRE-DESIGN snapshot, so a reload offered a restore
 * banner, the user pressed Restaurar believing they were getting their afternoon back, and
 * they got the model as it was before they designed anything.
 *
 * IndexedDB removes the ceiling. It does not remove the obligation, which is why this returns
 * the write result rather than a bare boolean: a caller — the timer, a post-design hook, a
 * test — can tell "saved as revision 7" from "refused for quota" from "this browser has no
 * storage at all". Nothing here ever reports a save that did not happen.
 */
export async function saveAutosave(): Promise<AutosaveWriteResult> {
  let payload: DedalFile;
  try {
    payload = buildProjectFile();
  } catch (err) {
    noticeOnce('build', t('file.autosaveFailed'));
    return {
      ok: false, backend: 'none', revision: null,
      failure: { kind: 'unknown', detail: err instanceof Error ? err.message : String(err) },
    };
  }

  const result = await autosaveWrite(payload, projectAutosavePolicy);
  if (result.ok) {
    if (result.backend === 'localstorage') noticeOnce('degraded', t('file.autosaveDegraded'), 'info');
    return result;
  }

  switch (result.failure?.kind) {
    case 'quota':
      noticeOnce('quota', t('file.autosaveTooLarge'));
      break;
    case 'clone':
      // A payload the browser refuses to clone is a defect in this app, not in the project.
      // Name the field so the report is actionable instead of `[object Array]`.
      console.error('[stabileo] autosave payload is not structured-cloneable:',
        findUncloneablePath(payload, 'project'));
      noticeOnce('clone', t('file.autosaveFailed'));
      break;
    case 'unavailable':
      noticeOnce('unavailable', t('file.autosaveUnavailable'));
      break;
    default:
      noticeOnce('unknown', t('file.autosaveFailed'));
  }
  return result;
}

/**
 * The newest autosave that survives every check — and a plain statement of what did not.
 *
 * A caller that ignores `rejected` and `unfinishedRevision` gets the old behaviour, which is
 * why they are on the result rather than in a log: handing back an older save without saying
 * so is the exact defect this whole change exists to remove.
 */
export async function loadAutosave(): Promise<AutosaveReadResult<DedalFile>> {
  const result = await autosaveRead(projectAutosavePolicy);

  if (result.unfinishedRevision !== null) {
    noticeOnce('unfinished', t('file.autosaveUnfinished'));
  }
  if (result.rejected.length > 0) {
    console.warn('[stabileo] autosave revisions refused on read:', result.rejected);
    noticeOnce('rejected', result.value
      ? t('file.autosaveOlderRestored')
      : t('file.autosaveCorrupt'));
  }
  if (result.backend === 'localstorage') {
    noticeOnce('degraded', t('file.autosaveDegraded'), 'info');
  } else if (result.backend === 'none') {
    noticeOnce('unavailable', t('file.autosaveUnavailable'));
  }
  return result;
}

/** Drop every stored autosave revision. Used by Descartar and by "new project". */
export async function clearAutosave(): Promise<void> {
  await autosaveClear();
}

export { autosaveStatus };

// ─── Workspace (every open tab, localStorage) ───────────────────

/** Where the stored workspace is copied when it cannot be restored whole. */
export const WORKSPACE_BACKUP_KEY = 'stabileo-workspace-backup';
/** Copies kept, newest first. Older ones are evicted first when the quota is short. */
export const WORKSPACE_BACKUP_LIMIT = 3;

export interface WorkspaceBackup {
  /** When the copy was taken (ISO 8601). */
  savedAt: string;
  /** `tabs-dropped`: some or all tabs were refused; `unreadable`: the text is not a session. */
  reason: 'tabs-dropped' | 'unreadable';
  /** Names of the refused tabs (empty for `unreadable`). */
  dropped: string[];
  /** The stored workspace text, exactly as it was found. */
  raw: string;
}

/**
 * Set when the stored workspace could not be restored whole AND no copy of it could be kept.
 * The workspace is then left as it was for the rest of this page's life: overwriting it is the
 * loss the backup exists to prevent. The project autosave (IndexedDB) is unaffected.
 */
let workspaceOverwriteHeld = false;

/** Test seam: forget a hold from an earlier load. */
export function resetWorkspaceGuard(): void {
  workspaceOverwriteHeld = false;
}

/** The kept copies, newest first. Never throws; unreadable storage reads as none. */
export function readWorkspaceBackups(): WorkspaceBackup[] {
  try {
    const raw = localStorage.getItem(WORKSPACE_BACKUP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { entries?: unknown };
    return Array.isArray(parsed?.entries)
      ? (parsed.entries as WorkspaceBackup[]).filter((e) => e && typeof e.raw === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * Keep `raw` before anything can overwrite it. Returns whether a copy is now stored.
 *
 * Bounded twice: at most `WORKSPACE_BACKUP_LIMIT` copies, and when the quota refuses the write
 * the oldest are evicted one at a time until the newest fits or nothing else is left to evict.
 * The same text read twice is one copy (a reload before the next save would otherwise fill the
 * list with one workspace).
 */
function backupStoredWorkspace(raw: string, reason: WorkspaceBackup['reason'], dropped: string[]): boolean {
  const previous = readWorkspaceBackups();
  if (previous[0]?.raw === raw) return true;
  const entry: WorkspaceBackup = { savedAt: new Date().toISOString(), reason, dropped, raw };
  let entries = [entry, ...previous].slice(0, WORKSPACE_BACKUP_LIMIT);
  for (;;) {
    try {
      localStorage.setItem(WORKSPACE_BACKUP_KEY, JSON.stringify({ version: 1, entries }));
      return true;
    } catch {
      if (entries.length <= 1) break;
      entries = entries.slice(0, -1);
    }
  }
  // Not even the newest copy fits. Put back what was there rather than leave a half state.
  try {
    if (previous.length > 0) localStorage.setItem(WORKSPACE_BACKUP_KEY, JSON.stringify({ version: 1, entries: previous }));
  } catch { /* unchanged on failure */ }
  return false;
}

/**
 * The stored workspace could not be restored whole: keep a copy, and say so either way.
 * Called before App's first save, which is the first moment it could be overwritten.
 */
function protectStoredWorkspace(raw: string, reason: WorkspaceBackup['reason'], dropped: DroppedSessionTab[]): void {
  const names = dropped.map((d) => d.name ?? t('file.sessionTabUnnamed').replace('{n}', String(d.index + 1)));
  const kept = backupStoredWorkspace(raw, reason, names);
  if (!kept) workspaceOverwriteHeld = true;
  const head = reason === 'unreadable'
    ? t('file.workspaceUnreadable')
    : t('file.workspaceTabsDropped').replace('{names}', droppedTabNames(dropped));
  const tail = kept ? t('file.workspaceBackupKept') : t('file.workspaceBackupFailed');
  uiStore.toast(`${head} ${tail}`, 'error');
}

export function saveWorkspaceToLocalStorage(): boolean {
  if (workspaceOverwriteHeld) return false;
  try {
    tabManager.syncCurrentTab();
    const session: DedalSessionFile = {
      version: '1.0',
      type: 'session',
      timestamp: new Date().toISOString(),
      activeTabId: tabManager.activeTabId ?? '',
      // The tabs without their undo stacks: a reload does not undo across it, and the stacks (up to
      // 50 snapshots a tab, the detailing in each) are what overflowed localStorage on a designed
      // project.
      tabs: sessionTabsCopy().map((tab) => ({ ...tab, undoStack: [], redoStack: [], undoKinds: [], redoKinds: [] })),
    };
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(session));
    return true;
  } catch {
    // localStorage is full or unavailable. The workspace written before stays behind otherwise, and
    // at the next start it would be restored over the newer autosave: withdrawn, so the autosave is
    // offered instead.
    clearWorkspaceFromLocalStorage();
    return false;
  }
}

export function loadWorkspaceFromLocalStorage(): DedalSessionFile | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(WORKSPACE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    protectStoredWorkspace(raw, 'unreadable', []);
    return null;
  }
  if (!isSessionFile(data)) {
    protectStoredWorkspace(raw, 'unreadable', []);
    return null;
  }
  // An empty session holds nothing to lose.
  if (data.tabs.length === 0) return null;
  // localStorage is shared by everything served from this origin and survives the session
  // that wrote it: read back through the same gate as a session file.
  const { tabs, dropped } = acceptSessionTabs(data.tabs);
  if (dropped.length > 0) {
    protectStoredWorkspace(raw, 'tabs-dropped', dropped);
  }
  if (tabs.length === 0) return null;
  // The active tab may be one of the refused; then the first survivor, as `restoreSession` does.
  const activeTabId = tabs.some((tab) => tab.id === data.activeTabId) ? data.activeTabId : tabs[0].id;
  return { ...data, activeTabId, tabs };
}

export function clearWorkspaceFromLocalStorage(): void {
  try {
    localStorage.removeItem(WORKSPACE_KEY);
  } catch {
    // ignore
  }
}

// ─── Aggregate API ──────────────────────────────────────────────

export const fileOps = {
  serializeProject,
  deserializeProject,
  saveProject,
  loadProject,
  loadFile,
  saveSession,
  exportResultsCSV,
  downloadResultsCSV,
  downloadCanvasPNG,
  downloadExcel,
  saveAutosave,
  loadAutosave,
  clearAutosave,
  saveWorkspaceToLocalStorage,
  loadWorkspaceFromLocalStorage,
  clearWorkspaceFromLocalStorage,
};
