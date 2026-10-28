/**
 * The project with the models of the other disciplines, and its published versions.
 *
 *  · Linking: an IFC file read as its objects (`engine/federation/linked.ts`), kept in the design
 *    data with its discipline, file, version label and date, and shown as background drawings
 *    per storey (`modelStore.underlays`, ids `link-…`, kept apart from the person's own).
 *  · Updating: a new version of a linked file is compared object by object; the person sees the
 *    added, modified and removed objects and applies the rules for each. The new structural
 *    objects can also be brought into the analysis model, through the IFC import's own mapping.
 *  · Publishing: a version is a numbered fingerprint of the model with its date, author and note,
 *    and a package (the project file, its IFC and the version's record) downloaded at that moment.
 *    Any version can be compared with the model now.
 */
import { zipSync, strToU8 } from 'fflate';
import { modelStore } from './model.svelte';
import { designData, patchOwnDesignData } from './design-data';
import { serializeProject, downloadBlob } from './file';
import { exportProjectIfc } from './ifc-export';
import { applyUpdate, diffLinked, entitiesFromParse, linkUnderlays, type Discipline, type LinkedDiff, type LinkedModel, type UpdateRules } from '../engine/federation/linked';
import { compareFingerprints, countsOf, fingerprintOf, type PublishedVersion } from '../engine/federation/versions';
import { buildIfcFragment, connectShells } from '../ifc/ifc-physical';
import { insertFragment } from '../model/edit/transformed-copy';
import { IDENTITY } from '../model/edit/affine';
import type { IfcMember, IfcSurface } from '../ifc/ifc-mapper';
import type { Underlay } from '../model/underlay';

export type { LinkedModel, Discipline, UpdateRules, PublishedVersion, LinkedDiff };

type Data = NonNullable<ReturnType<typeof designData>['federation']>;
export const federation = (): Data => designData().federation ?? { links: [], versions: [] };
const patch = (p: Partial<Data>) => patchOwnDesignData({ federation: { ...federation(), ...p } });

interface Parsed { members: IfcMember[]; surfaces: IfcSurface[]; storeys: Array<{ name: string; elevation: number }> }
async function parse(buffer: ArrayBuffer): Promise<Parsed> {
  const { parseIfc } = await import('../ifc/ifc-parser');
  return parseIfc(buffer);
}

/** The links' drawings in the model, after the person's own drawings. */
export function syncUnderlays(): void {
  const own = modelStore.underlays.filter((u) => !u.id.startsWith('link-'));
  const linked: Underlay[] = federation().links.filter((l) => l.visible).flatMap((l) => linkUnderlays(l).map((u) => ({ ...u, dx: 0, dy: 0, rotationDeg: 0, visible: true })));
  modelStore.setUnderlays([...own, ...linked]);
}

/** Link a file of another discipline from what was parsed. */
export function linkParsed(p: Parsed, o: { name: string; discipline: Discipline; fileName: string; version: string }): LinkedModel {
  const link: LinkedModel = {
    id: `lk-${Date.now().toString(36)}`, name: o.name, discipline: o.discipline, fileName: o.fileName, version: o.version, date: new Date().toISOString(),
    entities: entitiesFromParse(p.members, p.surfaces), visible: true, storeys: Object.fromEntries(p.storeys.map((s) => [s.name, s.elevation])),
  };
  patch({ links: [...federation().links, link] });
  syncUnderlays();
  return link;
}
export async function linkIfc(buffer: ArrayBuffer, o: { name: string; discipline: Discipline; fileName: string; version: string }): Promise<LinkedModel> {
  return linkParsed(await parse(buffer), o);
}

export function removeLink(id: string): void { patch({ links: federation().links.filter((l) => l.id !== id) }); syncUnderlays(); }
export function setLinkVisible(id: string, visible: boolean): void { patch({ links: federation().links.map((l) => (l.id === id ? { ...l, visible } : l)) }); syncUnderlays(); }

// ─── Updates ───

interface Pending { linkId: string; diff: LinkedDiff; parsed: Parsed; fileName: string; version: string }
let pending = $state<Pending | null>(null);
export const federationState = { get pending() { return pending; } };

/** Compare a new version of a linked file with what the link holds; nothing changes until applied. */
export function prepareUpdateParsed(linkId: string, p: Parsed, fileName: string, version: string): LinkedDiff | null {
  const link = federation().links.find((l) => l.id === linkId);
  if (!link) return null;
  const diff = diffLinked(link.entities, entitiesFromParse(p.members, p.surfaces));
  pending = { linkId, diff, parsed: p, fileName, version };
  return diff;
}
export async function prepareUpdate(linkId: string, buffer: ArrayBuffer, fileName: string, version: string): Promise<LinkedDiff | null> {
  return prepareUpdateParsed(linkId, await parse(buffer), fileName, version);
}

/** Apply the pending update under the rules. */
export function applyPendingUpdate(rules: UpdateRules): void {
  if (!pending) return;
  const p = pending;
  patch({ links: federation().links.map((l) => (l.id === p.linkId ? {
    ...l, entities: applyUpdate(l.entities, p.diff, rules), fileName: p.fileName, version: p.version, date: new Date().toISOString(),
    storeys: { ...l.storeys, ...Object.fromEntries(p.parsed.storeys.map((s) => [s.name, s.elevation])) },
  } : l)) });
  syncUnderlays();
}
export function discardPendingUpdate(): void { pending = null; }

/**
 * Bring the pending update's new structural objects into the analysis model, mapped as the IFC
 * import maps them (classes by default, declared as physical elements on the model's levels),
 * welded to the model's nodes, in one undo step. How many bars and shells came in.
 */
export function contributeAdded(): { bars: number; shells: number } {
  if (!pending) return { bars: 0, shells: 0 };
  const added = new Set(pending.diff.added.map((e) => e.guid));
  const members = pending.parsed.members.filter((m) => m.globalId && added.has(m.globalId));
  const surfaces = pending.parsed.surfaces.filter((s) => s.globalId && added.has(s.globalId));
  if (!members.length && !surfaces.length) return { bars: 0, shells: 0 };
  const b = buildIfcFragment(members, surfaces, { snapTolerance: 0.01, membersAsTruss: true, choices: {}, meshSize: 1, declare: true, levels: modelStore.grid?.levels ?? [] });
  modelStore.batch(() => {
    const r = insertFragment(b.fragment, [{ A: IDENTITY, t: [0, 0, 0] }], { weldTol: 0.01 });
    connectShells(r.quads, r.plates);
  });
  return { bars: b.bars, shells: b.shells };
}

// ─── Versions ───

export const currentFingerprint = () => fingerprintOf(modelStore.model as never);

/** Publish the model as the next version; its package's bytes (project file, IFC, record). */
export function publishVersion(author: string, note: string, tr: (k: string, p?: Record<string, string | number>) => string, locale: string): { version: PublishedVersion; zip: Uint8Array } {
  const fp = currentFingerprint();
  const versions = federation().versions;
  const v: PublishedVersion = { number: (versions.at(-1)?.number ?? 0) + 1, date: new Date().toISOString(), author, note, fingerprint: fp, counts: countsOf(fp) };
  patch({ versions: [...versions, v] });
  const name = (modelStore.model.name || 'project').replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || 'project';
  const record = { number: v.number, date: v.date, author, note, counts: v.counts };
  const zip = zipSync({
    [`${name}-v${v.number}.ded`]: strToU8(serializeProject()),
    [`${name}-v${v.number}.ifc`]: strToU8(exportProjectIfc(tr, locale, name)),
    [`version-${v.number}.json`]: strToU8(JSON.stringify(record, null, 2)),
  }, { level: 6 });
  return { version: v, zip };
}
export function downloadPackage(zip: Uint8Array, number: number): void {
  const name = (modelStore.model.name || 'project').replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || 'project';
  downloadBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), `${name}-v${number}.zip`);
}

/** What changed from a published version to the model now. */
export function compareWithVersion(number: number) {
  const v = federation().versions.find((x) => x.number === number);
  return v ? compareFingerprints(v.fingerprint, currentFingerprint()) : null;
}
