/**
 * What PRO is in the middle of drawing, shared by the viewport, the drawing bar and the panels.
 *
 * Each of them used to keep its own copy. The Members panel watched the selected node to build
 * members of its own while the viewport built them too, so a third click joined a stale first
 * node to the new one and left a member nobody drew. The plate panel held the material and
 * thickness that a drawn plate needs. One store, so there is one answer to "what happens on the
 * next click".
 *
 * Drawing preferences, not model data: none of this is saved with the project.
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { defaultShellMaterial } from '../pro/design-home';
import { DOF_SPRING, support3DFrom, type Dof3D } from '../model/support-3d';
import { t, tp } from '../i18n';

type Springs = { kx?: number; ky?: number; kz?: number; krx?: number; kry?: number; krz?: number };

/** The draft's restraints as the model takes them: an elastic restraint is a free DOF with a spring. */
function supportRestraints(s: { dofs: Record<Dof3D, boolean>; elastic: boolean; springs: Springs }): [Record<Dof3D, boolean>, Springs] {
  const dofs = { ...s.dofs };
  const springs: Springs = {};
  for (const [dof, key] of DOF_SPRING) {
    const k = s.springs[key] ?? 0;
    if (s.dofs[dof] && s.elastic && k > 0) { dofs[dof] = false; springs[key] = k; }
  }
  return [dofs, springs];
}

function createDrawState() {
  /** The first node of the member being drawn, once picked. */
  let memberStart = $state<number | null>(null);
  /**
   * After a member, its far end starts the next one (a polyline), until Escape or a click on
   * nothing. On by default, as drawing members has always chained; the bar can turn it off.
   */
  let memberChain = $state(true);

  /** Three corners make a triangle, four a quad. */
  let plateCorners = $state<3 | 4>(4);
  let plateMaterialId = $state<number | null>(null);
  let plateThickness = $state(0.2);

  /**
   * The support the Supports panel's "Add support" card puts on what it names. As in Basic's
   * 3D tool, a ticked degree of freedom is restrained; with `elastic` on, a restrained one with a
   * stiffness becomes a spring of that stiffness instead (`model/support-3d.ts`).
   */
  let support = $state<{ dofs: Record<Dof3D, boolean>; elastic: boolean; springs: Springs }>({
    dofs: { tx: true, ty: true, tz: true, rx: true, ry: true, rz: true },
    elastic: false,
    springs: {},
  });

  /**
   * The panel whose "Write …" card is open: 'node', 'element', 'plate', 'support' or 'load'.
   * Drawing and writing are two ways to add the same thing, so one excludes the other.
   */
  let writing = $state<string | null>(null);
  /** Counts the times a card was opened on the selection, so an open card turns to it (`writeOnSelection`). */
  let writeSeq = $state(0);

  return {
    get writing() { return writing; },
    set writing(v: string | null) {
      writing = v;
      if (v !== null && this.active) this.stop();
    },
    get writeSeq() { return writeSeq; },
    /** Open a panel's card on what is selected now: the model's context menu on a node. */
    writeOnSelection(kind: 'support' | 'load') {
      this.writing = kind;
      writeSeq++;
    },
    get support() { return support; },
    /** Put the support being drawn on a node; returns its id. */
    addSupportAt(nodeId: number): number {
      const { type, springs, opts } = support3DFrom(...supportRestraints(support), 'global');
      return modelStore.addSupport(nodeId, type, springs, opts);
    },

    get memberStart() { return memberStart; },
    set memberStart(v: number | null) { memberStart = v; },
    get memberChain() { return memberChain; },
    set memberChain(v: boolean) { memberChain = v; },

    get plateCorners() { return plateCorners; },
    set plateCorners(v: 3 | 4) {
      plateCorners = v;
      // A pick under way takes the new count; one already past it is cut to it.
      const p = uiStore.shellNodePick;
      if (p.target === 'quad' && (p.active || p.picked.length > 0)) {
        uiStore.startShellNodePick('quad', v);
        for (const id of p.picked.slice(0, v)) uiStore.pushShellNodePick(id);
        // Three picked and "3 nodes" chosen: that is a whole plate.
        this.finishPlate();
      }
    },
    /** The material a plate is drawn with; the model's first concrete when none was chosen. */
    get plateMaterialId() {
      return plateMaterialId !== null && modelStore.materials.has(plateMaterialId)
        ? plateMaterialId : defaultShellMaterial(modelStore.materials);
    },
    set plateMaterialId(v: number) { plateMaterialId = v; },
    get plateThickness() { return plateThickness; },
    set plateThickness(v: number) { plateThickness = v; },

    /**
     * Make the plate once its last corner is picked, with the material and thickness the drawing
     * bar shows, and start the next one. A corner that makes it invalid is taken back.
     */
    finishPlate(): void {
      const p = uiStore.shellNodePick;
      if (p.target !== 'quad' || p.picked.length < plateCorners) return;
      const r = addShellOnCorners(p.picked, this.plateMaterialId, plateThickness);
      if ('error' in r) {
        uiStore.toast(t(r.error), 'error');
        const kept = p.picked.slice(0, -1);
        this.startPlate();
        for (const id of kept) uiStore.pushShellNodePick(id);
        return;
      }
      uiStore.selectShell(r.key, false);
      uiStore.toast(tp('drawBar.plateCreated', { id: r.key.slice(1), n: p.picked.length }), 'success');
      this.startPlate();
    },

    /** Start picking plate corners in the model. */
    startPlate() {
      writing = null;
      memberStart = null;
      // The pointer selects corners while a plate is drawn; setting it ends any other drawing first.
      uiStore.currentTool = 'select';
      uiStore.startShellNodePick('quad', plateCorners);
    },

    /** Leave whatever is being drawn: the pending member end, the plate corners, the tool. */
    stop() {
      memberStart = null;
      if (uiStore.shellNodePick.active || uiStore.shellNodePick.picked.length > 0) uiStore.cancelShellNodePick();
      uiStore.currentTool = 'select';
    },

    /** Whether anything is being drawn. */
    get active() {
      const t = uiStore.currentTool;
      return t === 'node' || t === 'element' || t === 'support' || t === 'load'
        || (uiStore.shellNodePick.active && uiStore.shellNodePick.target === 'quad');
    },
  };
}

export const drawState = createDrawState();

export type ShellError = 'pro.shellNeedNodes' | 'pro.errNodesExist' | 'pro.errNodesDistinct' | 'pro.errMaterial' | 'pro.errThickness';

/**
 * Add a plate on these corners: three make a triangle, four a quad. Returns the key of the new
 * shell ("p<id>" or "q<id>"), or the i18n key of what is wrong with the input.
 *
 * One function for both ways in, typed corners in the panel and corners clicked in the model, so
 * the two cannot check different things.
 */
export function addShellOnCorners(
  ids: number[], materialId: number, thickness: number, curved = false,
): { key: string } | { error: ShellError } {
  if (ids.length < 3 || ids.length > 4) return { error: 'pro.shellNeedNodes' };
  if (ids.some((n) => !Number.isFinite(n) || !modelStore.nodes.has(n))) return { error: 'pro.errNodesExist' };
  if (new Set(ids).size !== ids.length) return { error: 'pro.errNodesDistinct' };
  if (!modelStore.materials.has(materialId)) return { error: 'pro.errMaterial' };
  if (!(thickness > 0)) return { error: 'pro.errThickness' };
  if (ids.length === 3) {
    return { key: 'p' + modelStore.addPlate(ids as [number, number, number], materialId, thickness) };
  }
  const id = modelStore.addQuad(ids as [number, number, number, number], materialId, thickness);
  /* A curved quad goes to the solver as a degenerated continuum rather than a flat MITC4. */
  const q = modelStore.model.quads.get(id);
  if (q && curved) q.curved = true;
  return { key: 'q' + id };
}
