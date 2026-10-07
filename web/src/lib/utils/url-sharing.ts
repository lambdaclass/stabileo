// URL sharing: compress/decompress model snapshots for sharing via URL hash
// v1: LZ-String (legacy, still decoded for old links)
// v2: compact JSON + fflate deflate + base64url (new default)

import { defaultCodeSettings } from '../codes/project-code-settings';
import { emptyDetailingStore } from '../engine/detailing/assembly';
import { emptyGeotechnical } from '../model/geotechnical';
import { defaultFootingMatPreferences } from '../model/footing';
import LZString from 'lz-string';
import { deflateSync, inflateSync } from 'fflate';
import type { ModelSnapshot } from '../store/history.svelte';
import type { DiagramType } from '../store/results.svelte';
import { modelStore } from '../store/model.svelte';
import { viewVisibility } from '../store/view-state.svelte';
import { NO_RELEASE, type Release } from '../store/model.svelte';
import { uiStore } from '../store/ui.svelte';
import { resultsStore } from '../store/results.svelte';
import { noteAxisConventionMigrationIfNeeded, noteBasicSelfWeightRuleIfNeeded, statedSelfWeightCaseId } from '../store/file';
import { packJointDesigns, unpackJointDesigns } from '../connection/joint-share';
import { CODE_HASH, readCodeFragment, codeShareUrl } from '../model/code/share';
import { mergeCode } from '../model/code/apply';
import { prepareSharedSnapshot } from './share-snapshot';

/**
 * The wire schema tag.
 *
 * 6 = the groups travel (`gr`): floor-load definitions and load zones among them. 5 = the joint
 * designs travel (`jd`). 4 = typed per-axis releases (`ri`/`rj`). 3 = legacy
 * `hs`/`he` booleans plus the iy/iz convention. Compatible in both directions: 4 → 5 added a new
 * TOP-LEVEL key and no position to any existing tuple, and the two migrations below key off
 * `sv >= 3` and `sv >= 4`, which 5 satisfies. A reader that predates `jd` ignores it.
 */
const SHARE_VERSION = 6;

/**
 * The modes a link is written from.
 *
 * `generateShareURL`/`generateEmbedURL` write one of these or nothing (an edu
 * session shares no mode), so a link that names anything else — 'edu'
 * included — was not written by the app, and the reader keeps its own mode.
 */
const SHARED_ANALYSIS_MODES: readonly string[] = ['2d', '3d', 'pro'];

function sharedMode(mode: string | undefined): '2d' | '3d' | 'pro' | undefined {
  return mode !== undefined && SHARED_ANALYSIS_MODES.includes(mode) ? mode as '2d' | '3d' | 'pro' : undefined;
}

/**
 * Switch to the link's mode when it names one a link is written with.
 *
 * Returns the mode the model is loaded in, which is what the axis-convention
 * note has to be decided from: a refused mode was never entered.
 */
function applyLinkMode(mode: string | undefined): string {
  const m = sharedMode(mode);
  if (m) uiStore.analysisMode = m;
  return uiStore.analysisMode;
}

function packRelease(r: Release | undefined): Record<string, unknown> | undefined {
  if (!r) return undefined;
  const out: Record<string, unknown> = {};
  if (r.my) out.my = true;
  if (r.mz) out.mz = true;
  if (r.t) out.t = true;
  // 2D sliding joint (translational release) — carry the kind + axis frame so a
  // shared sliding-joint model isn't silently rebuilt as rigid.
  if (r.slide) out.s = r.slide;
  if (r.slideAxis) out.sa = r.slideAxis;
  return Object.keys(out).length > 0 ? out : undefined;
}

function unpackRelease(packed: unknown): Release {
  const r: Release = { ...NO_RELEASE };
  if (packed && typeof packed === 'object') {
    const p = packed as Record<string, unknown>;
    if (p.my) r.my = true;
    if (p.mz) r.mz = true;
    if (p.t) r.t = true;
    if (p.s) r.slide = p.s as Release['slide'];
    if (p.sa) r.slideAxis = p.sa as Release['slideAxis'];
  }
  return r;
}

/**
 * When a share link is long enough to be worth mentioning.
 *
 * This was 2000, described as the point "beyond this, many browsers/servers
 * truncate". Both halves were wrong, and together they talked people out of
 * links that work.
 *
 * Servers never see it. The payload rides in the FRAGMENT — `#data=…` — which
 * a browser keeps to itself and never puts on the wire, so there is no request
 * line to overflow and no proxy to trim it. (The one place that broke this was
 * our own 404.html, which folded the fragment into `/?route=` on the way to the
 * app: past about 8 000 characters the host answered 414 URI Too Long. It now
 * leaves the fragment where it is.)
 *
 * And browsers are nowhere near 2000; that number is the old Internet Explorer
 * address-bar limit. Measured on the 3D industrial shed — 232 nodes, 633
 * members, 242 loads — the link is 10 667 characters, opens in a clean tab,
 * and restores every node, member, material, section, support, load, load case
 * and combination with nothing lost. The test beside this file pins that.
 *
 * What DOES cut a long link is whatever you paste it into: mail clients wrap
 * plain text, and some chat clients linkify only the first stretch. That is a
 * property of the destination, not of the link, so the notice says so and
 * points at the file, which has no length at all. 16 000 is roughly where a
 * wrapped line stops being recoverable by hand — below it the warning would
 * fire on models that share fine, which is how the old one lost its meaning.
 */
const MAX_URL_SAFE = 16_000;

// ─── v2 format prefix ─────────────────────────────────────────────────────
// v2 compressed strings start with "2." so we can tell them apart from v1
const V2_PREFIX = '2.';

// ─── ShareMeta defaults ───────────────────────────────────────────────────
// Only non-default values are serialized → smaller payloads
const META_DEFAULTS: Record<string, unknown> = {
  diagramType: 'none',
  deformedScale: 100,
  diagramScale: 1,
  showDiagramValues: true,
  autoSolve: false,
  showGrid: true,
  gridSize: 1,
  snapToGrid: true,
  showNodeLabels: true,
  showElementLabels: false,
  showLengths: false,
  elementColorMode: 'uniform',
  showLoads: true,
  hideLoadsWithDiagram: true,
  showAxes: true,
  renderMode3D: 'wireframe',
  momentStyle3D: 'curved',
  cameraMode3D: 'perspective',
  showGrid3D: true,
  gridSize3D: 1,
  snapToGrid3D: true,
  showNodeLabels3D: true,
  showElementLabels3D: false,
  showLengths3D: false,
  showLoads3D: true,
  showAxes3D: true,
  localAxesMode3D: 'selected',
  axisConvention3D: 'rightHand',
  includeSelfWeight: false,
  liveCalc: false,
};

/** Metadata saved alongside the model to restore the exact view state */
export interface ShareMeta {
  diagramType?: DiagramType;
  deformedScale?: number;
  diagramScale?: number;
  autoSolve?: boolean;
  // 2D config
  showGrid?: boolean;
  gridSize?: number;
  snapToGrid?: boolean;
  showNodeLabels?: boolean;
  showElementLabels?: boolean;
  showLengths?: boolean;
  elementColorMode?: string;
  showLoads?: boolean;
  hideLoadsWithDiagram?: boolean;
  showAxes?: boolean;
  showDiagramValues?: boolean;
  // 3D config
  renderMode3D?: string;
  momentStyle3D?: string;
  cameraMode3D?: string;
  showGrid3D?: boolean;
  gridSize3D?: number;
  snapToGrid3D?: boolean;
  showNodeLabels3D?: boolean;
  showElementLabels3D?: boolean;
  showLengths3D?: boolean;
  showLoads3D?: boolean;
  showAxes3D?: boolean;
  localAxesMode3D?: 'always' | 'selected' | 'never';
  axisConvention3D?: string;
  // Self-weight
  includeSelfWeight?: boolean;
  /** `null`: the first dead-load case. Absent: an older link, which put it in every one. */
  selfWeightCaseId?: number | null;
  // Live calc
  liveCalc?: boolean;
  // Viewport state (2D)
  zoom?: number;
  panX?: number;
  panY?: number;
  // Camera state (3D)
  cameraPosition3D?: { x: number; y: number; z: number };
  cameraTarget3D?: { x: number; y: number; z: number };
}

// ─── Base64-URL helpers ───────────────────────────────────────────────────
function uint8ToBase64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToUint8(str: string): Uint8Array {
  // Restore standard base64
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ─── Round numbers to reduce JSON noise ───────────────────────────────────
// Ten significant figures, not a fixed number of decimals: sections are in m² and m⁴, and six
// decimals turned an IPE's Iy of 1.42e-6 into 1e-6 and its J into 0 in every link. `decimals`
// stays for what is a length on screen (the camera), where a fixed step is what is wanted.
function r(n: number, decimals?: number): number {
  if (Number.isInteger(n) || !Number.isFinite(n)) return n;
  if (decimals !== undefined) {
    const f = Math.pow(10, decimals);
    return Math.round(n * f) / f;
  }
  return Number(n.toPrecision(10));
}

// ─── v2 compact serialization ─────────────────────────────────────────────
// Converts verbose ModelSnapshot+ShareMeta into a compact object with short keys
// and positional arrays instead of key-value objects.

function toCompact(snapshot: ModelSnapshot, meta?: ShareMeta): Record<string, unknown> {
  const c: Record<string, unknown> = {};

  // Analysis mode
  if (snapshot.analysisMode) c.m = snapshot.analysisMode;
  if (snapshot.name) c.nm = snapshot.name;
  // Local-axis convention tag — carry it so a shared NEW (post-fix) model stays
  // self-describing and the migration note (see noteAxisConventionMigrationIfNeeded)
  // does not false-fire on URL load; absence still flags a genuine legacy model.
  if (snapshot.localAxisConvention) c.lx = snapshot.localAxisConvention;

  // Nodes: [[id, x, y, z?], ...]  (z omitted when undefined/0 in 2D)
  c.n = snapshot.nodes.map(([, v]) => {
    const arr: number[] = [v.id, r(v.x), r(v.y)];
    if (v.z !== undefined && v.z !== 0) arr.push(r(v.z));
    return arr;
  });

  // Materials: [[id, name, e, nu, rho, fy?], ...]
  c.mt = snapshot.materials.map(([, v]) => {
    const arr: (string | number | null | Record<string, unknown>)[] = [v.id, v.name, r(v.e), r(v.nu), r(v.rho)];
    if ((v as any).fy != null) arr.push(r((v as any).fy));
    // The grade and its ultimate strength, which steel design reads: without them a shared steel
    // model arrived with no fu and no grade, and the link switched to code form to carry them.
    const m = v as { fu?: number; gradeId?: string; standard?: string; region?: string };
    const extra: Record<string, unknown> = {};
    if (m.fu != null) extra.fu = r(m.fu);
    if (m.gradeId) extra.g = m.gradeId;
    if (m.standard) extra.st = m.standard;
    if (m.region) extra.rg = m.region;
    if (Object.keys(extra).length > 0) {
      if (arr.length === 5) arr.push(null);
      arr.push(extra);
    }
    return arr;
  });

  // Schema version: 4 = typed per-axis releases (`ri`/`rj`) on elements.
  // 3 = legacy `hs`/`he` booleans + iy/iz section convention. 4 keeps the iy/iz convention.
  c.sv = SHARE_VERSION;

  // Sections: [[id, name, a, iz, {s?, b?, h?, w?, f?, t?, iy?, j?}], ...]
  c.sc = snapshot.sections.map(([, v]) => {
    const base: (string | number)[] = [v.id, v.name, r(v.a), r(v.iz)];
    const opt: Record<string, number | string> = {};
    if (v.shape) opt.s = v.shape;
    if (v.b != null) opt.b = r(v.b);
    if (v.h != null) opt.h = r(v.h);
    if (v.tw != null) opt.w = r(v.tw);
    if (v.tf != null) opt.f = r(v.tf);
    if (v.t != null) opt.t = r(v.t);
    if (v.iy != null) opt.iy = r(v.iy);
    if (v.j != null) opt.j = r(v.j);
    if ((v as any).rotation) opt.rot = r((v as any).rotation);
    if (Object.keys(opt).length > 0) base.push(opt as any);
    return base;
  });

  // Elements: [[id, type(0=frame/1=truss), nodeI, nodeJ, matId, secId, flags?], ...]
  c.e = snapshot.elements.map(([, v]) => {
    const arr: (number | Record<string, unknown>)[] = [
      v.id, v.type === 'truss' ? 1 : 0, v.nodeI, v.nodeJ, v.materialId, v.sectionId,
    ];
    const opt: Record<string, unknown> = {};
    const ri = packRelease(v.releaseI);
    const rj = packRelease(v.releaseJ);
    if (ri) opt.ri = ri;
    if (rj) opt.rj = rj;
    if (v.localYx != null) opt.lx = r(v.localYx);
    if (v.localYy != null) opt.ly = r(v.localYy);
    if (v.localYz != null) opt.lz = r(v.localYz);
    if ((v as any).rollAngle != null) opt.ra = r((v as any).rollAngle);
    const off = (v as any).offset;
    if (off && (off.i || off.j)) {
      const enc: Record<string, unknown> = { f: off.frame === 'local' ? 'l' : 'g' };
      if (off.i) enc.i = [r(off.i.x), r(off.i.y), r(off.i.z)];
      if (off.j) enc.j = [r(off.j.x), r(off.j.y), r(off.j.z)];
      opt.of = enc;
    }
    // 3D internal joints — carry the 6-DOF release mask per end so a shared joint
    // model isn't silently rebuilt as rigid (only when some DOF is released).
    const ji = (v as any).jointI as { dof?: boolean[] } | undefined;
    const jj = (v as any).jointJ as { dof?: boolean[] } | undefined;
    if (ji?.dof?.some(Boolean)) opt.ji = ji.dof.map(d => (d ? 1 : 0));
    if (jj?.dof?.some(Boolean)) opt.jj = jj.dof.map(d => (d ? 1 : 0));
    // "Keep both" on an overlap, so the link does not ask again (connection-questions.ts).
    const ko = (v as { keptOver?: number[] }).keptOver;
    if (ko?.length) opt.ko = ko;
    if (Object.keys(opt).length > 0) arr.push(opt);
    return arr;
  });

  // Supports: [[id, nodeId, type, opts?], ...]
  c.s = snapshot.supports.map(([, v]) => {
    const arr: (number | string | Record<string, unknown>)[] = [v.id, v.nodeId, v.type];
    const opt: Record<string, unknown> = {};
    if (v.angle) opt.a = r(v.angle);
    if (v.isGlobal) opt.g = true;
    if (v.kx) opt.kx = r(v.kx);
    if (v.ky) opt.ky = r(v.ky);
    if (v.kz) opt.kz = r(v.kz);
    if (v.dx) opt.dx = r(v.dx);
    if (v.dy) opt.dy = r(v.dy);
    if (v.drz) opt.rz = r(v.drz);
    if (v.dz) opt.dz = r(v.dz);
    if (v.drx) opt.rx = r(v.drx);
    if (v.dry) opt.ry = r(v.dry);
    if (v.krx) opt.Rx = r(v.krx);
    if (v.kry) opt.Ry = r(v.kry);
    if (v.krz) opt.Rz = r(v.krz);
    if (Object.keys(opt).length > 0) arr.push(opt);
    return arr;
  });

  // Loads: kept as-is (already compact-ish, type+data varies widely)
  c.l = snapshot.loads;

  // Load cases
  if (snapshot.loadCases?.length) c.lc = snapshot.loadCases;
  // Combinations
  if (snapshot.combinations?.length) c.co = snapshot.combinations;

  // Plates: [[id, [n1,n2,n3], matId, thickness, 0?, offset?], ...]
  // Slot 4 held a shell family, a field nothing read and that was removed; it is written as 0
  // when an offset follows, so older links keep their layout. Slot 5 is a compact offset
  // [frame, x, y, z].
  const encShellOffset = (v: any): unknown[] | null => {
    const o = v.offset;
    return o ? [o.frame === 'local' ? 'l' : 'g', r(o.x), r(o.y), r(o.z)] : null;
  };
  if (snapshot.plates?.length) {
    c.pl = snapshot.plates.map(([, v]) => {
      const arr: unknown[] = [v.id, v.nodes, v.materialId, r(v.thickness)];
      const off = encShellOffset(v);
      if (off) { arr.push(0); arr.push(off); }
      return arr;
    });
  }

  // Quads: [[id, [n1,n2,n3,n4], matId, thickness, 0?, offset?], ...]
  if (snapshot.quads?.length) {
    c.qu = snapshot.quads.map(([, v]) => {
      const arr: unknown[] = [v.id, v.nodes, v.materialId, r(v.thickness)];
      const off = encShellOffset(v);
      if (off) { arr.push(0); arr.push(off); }
      return arr;
    });
  }

  // Constraints: kept as-is (already compact, type+data varies by variant)
  if (snapshot.constraints?.length) {
    c.cn = snapshot.constraints;
  }

  // Connectors (joint/spring/bearing primitives): kept as-is, [id, payload] entries
  if (snapshot.connectors?.length) {
    c.cx = snapshot.connectors;
  }

  // Footings and the ground they bear on: kept verbatim, like connectors. Both travel
  // together on purpose — a shared footing without its soil profile is a foundation whose
  // bearing check cannot run, which is worse than not sharing it at all.
  if (snapshot.footings?.length) c.fo = snapshot.footings;
  if (snapshot.geotechnical?.profiles.length) c.gt = snapshot.geotechnical;
  // Bottom-mat preferences ride with the footings for the same reason the soil does: they set
  // the effective depth every footing in the link was designed at, so a shared project without
  // them would reopen designed to a different mat than the one that was shared. Emitted only
  // when a footing exists — a link with no foundation has nothing to state a mat about.
  if (snapshot.footings?.length && snapshot.footingMatPreferences) {
    c.fm = snapshot.footingMatPreferences;
  }

  // Provenance (CAD-draft "unreviewed" tag + assumptions): kept verbatim so the
  // honesty badge survives URL share/embed — the one persistence path that
  // crosses a trust boundary. Small structured object; deflate handles the size.
  if (snapshot.provenance) c.pv = snapshot.provenance;

  /*
   * The joint designs — I-08. NOT kept verbatim, unlike the four above.
   *
   * `joint-share.ts` walks a field table, so the CHOICES travel and nothing computed can, even if
   * a capacity somehow reached the model. Absent when there are none, which is what makes «no
   * joint decisions» distinguishable from «an empty joint designed at every node».
   */
  const jd = packJointDesigns(snapshot.jointDesigns);
  if (jd) c.jd = jd;

  /*
   * Groups: kept verbatim, like connectors. The floor-load definitions and load zones are groups,
   * and their loads travel marked with them (`fromDef`): without the groups an embed arrived with
   * the marks and no definitions, and the first rewrite took the floors' loads away.
   */
  if (snapshot.groups?.length) c.gr = snapshot.groups;

  // NextId: [node, mat, sec, elem, sup, load, loadCase?, combination?, plate?, quad?,
  //          connector?, footing?, soilProfile?]
  // Appended at the END so a link shared before footings existed still decodes: the
  // missing trailing slots read as undefined and fall back.
  const nid = snapshot.nextId;
  c.ni = [nid.node, nid.material, nid.section, nid.element, nid.support, nid.load,
    nid.loadCase ?? 3, nid.combination ?? 1, nid.plate ?? 1, nid.quad ?? 1, nid.connector ?? 1,
    nid.footing ?? 1, nid.soilProfile ?? 1];

  // ShareMeta: only non-default values
  if (meta) {
    const sm: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(meta)) {
      if (key === 'cameraPosition3D' || key === 'cameraTarget3D') {
        // Round camera values
        const v = val as { x: number; y: number; z: number };
        sm[key] = [r(v.x, 2), r(v.y, 2), r(v.z, 2)];
        continue;
      }
      if (val !== META_DEFAULTS[key]) {
        sm[key] = val;
      }
    }
    if (Object.keys(sm).length > 0) c._ = sm;
  }

  return c;
}

function fromCompact(c: Record<string, unknown>): ModelSnapshot {
  const snapshot: ModelSnapshot = {
    analysisMode: c.m as '2d' | '3d' | 'pro' | 'edu' | undefined,
    name: c.nm as string | undefined,
    localAxisConvention: c.lx as ModelSnapshot['localAxisConvention'],

    // Nodes
    nodes: (c.n as number[][]).map(a => [a[0], { id: a[0], x: a[1], y: a[2], ...(a[3] !== undefined ? { z: a[3] } : {}) }]),

    // Materials
    materials: (c.mt as unknown[][]).map(a => [
      a[0] as number,
      {
        id: a[0] as number, name: a[1] as string, e: a[2] as number, nu: a[3] as number, rho: a[4] as number,
        ...(a[5] != null ? { fy: a[5] as number } : {}),
        ...(() => {
          const x = (a as unknown[])[6] as { fu?: number; g?: string; st?: string; rg?: string } | undefined;
          return x ? { ...(x.fu != null ? { fu: x.fu } : {}), ...(x.g ? { gradeId: x.g } : {}), ...(x.st ? { standard: x.st } : {}), ...(x.rg ? { region: x.rg } : {}) } : {};
        })(),
      },
    ]),

    // Sections — handle iy/iz convention migration
    // sv=3: new convention (iz = about Z vertical, iy = about Y horizontal)
    // no sv: old convention (iz was about Y / large, iy was about Z / small) → swap
    sections: (c.sc as any[]).map(a => {
      const opt = typeof a[4] === 'object' ? a[4] : {};
      const isNewConvention = (c.sv as number) >= 3;

      let iz: number, iy: number | undefined;
      if (isNewConvention) {
        iz = a[3]; // about Z vertical (new convention)
        iy = opt.iy ?? undefined; // about Y horizontal
      } else {
        // Old convention: a[3] was the large (about Y) value, opt.iy was the small (about Z) value
        iy = a[3]; // old iz → now iy (about Y horizontal)
        iz = opt.iy ?? a[3]; // old iy → now iz (about Z vertical); fallback to same value
      }

      return [a[0], {
        id: a[0], name: a[1], a: a[2], iz,
        ...(opt.s ? { shape: opt.s } : {}),
        ...(opt.b != null ? { b: opt.b } : {}),
        ...(opt.h != null ? { h: opt.h } : {}),
        ...(opt.w != null ? { tw: opt.w } : {}),
        ...(opt.f != null ? { tf: opt.f } : {}),
        ...(opt.t != null ? { t: opt.t } : {}),
        ...(iy != null ? { iy } : {}),
        ...(opt.j != null ? { j: opt.j } : {}),
        ...(opt.rot != null ? { rotation: opt.rot } : {}),
      }];
    }),

    // Elements — sv ≥ 4 carries typed releases (`ri`/`rj`); sv ≤ 3 carries legacy `hs`/`he`
    // booleans which migrate to releaseI.mz / releaseJ.mz.
    elements: (c.e as any[]).map(a => {
      const opt = typeof a[6] === 'object' ? a[6] : {};
      const sv = (c.sv as number | undefined) ?? 0;
      const releaseI: Release = sv >= 4 ? unpackRelease(opt.ri) : { ...NO_RELEASE, mz: opt.hs === true };
      const releaseJ: Release = sv >= 4 ? unpackRelease(opt.rj) : { ...NO_RELEASE, mz: opt.he === true };
      return [a[0], {
        id: a[0], type: a[1] === 1 ? 'truss' : 'frame', nodeI: a[2], nodeJ: a[3],
        materialId: a[4], sectionId: a[5],
        releaseI, releaseJ,
        ...(opt.lx != null ? { localYx: opt.lx } : {}),
        ...(opt.ly != null ? { localYy: opt.ly } : {}),
        ...(opt.lz != null ? { localYz: opt.lz } : {}),
        ...(opt.ra != null ? { rollAngle: opt.ra } : {}),
        ...(opt.of ? { offset: {
          frame: opt.of.f === 'l' ? 'local' : 'global',
          ...(opt.of.i ? { i: { x: opt.of.i[0], y: opt.of.i[1], z: opt.of.i[2] } } : {}),
          ...(opt.of.j ? { j: { x: opt.of.j[0], y: opt.of.j[1], z: opt.of.j[2] } } : {}),
        } } : {}),
        // Only accept a well-formed 6-DOF mask: a truncated/forward-version array
        // would build a wrong-length releases mask straight into the solver.
        ...(Array.isArray(opt.ji) && opt.ji.length === 6 ? { jointI: { dof: (opt.ji as number[]).map(d => d === 1) } } : {}),
        ...(Array.isArray(opt.jj) && opt.jj.length === 6 ? { jointJ: { dof: (opt.jj as number[]).map(d => d === 1) } } : {}),
        ...(Array.isArray(opt.ko) && opt.ko.every((x: unknown) => typeof x === 'number') ? { keptOver: opt.ko as number[] } : {}),
      }];
    }),

    // Supports
    supports: (c.s as any[]).map(a => {
      const opt = typeof a[3] === 'object' ? a[3] : {};
      return [a[0], {
        id: a[0], nodeId: a[1], type: a[2],
        ...(opt.a ? { angle: opt.a } : {}),
        ...(opt.g ? { isGlobal: true } : {}),
        ...(opt.kx ? { kx: opt.kx } : {}),
        ...(opt.ky ? { ky: opt.ky } : {}),
        ...(opt.kz ? { kz: opt.kz } : {}),
        ...(opt.dx ? { dx: opt.dx } : {}),
        ...(opt.dy ? { dy: opt.dy } : {}),
        ...(opt.rz ? { drz: opt.rz } : {}),
        ...(opt.dz ? { dz: opt.dz } : {}),
        ...(opt.rx ? { drx: opt.rx } : {}),
        ...(opt.ry ? { dry: opt.ry } : {}),
        ...(opt.Rx ? { krx: opt.Rx } : {}),
        ...(opt.Ry ? { kry: opt.Ry } : {}),
        ...(opt.Rz ? { krz: opt.Rz } : {}),
      }];
    }),

    // Loads
    loads: c.l as ModelSnapshot['loads'],

    // Load cases & combinations
    loadCases: c.lc as ModelSnapshot['loadCases'],
    combinations: c.co as ModelSnapshot['combinations'],

    // Plates (a[4] held a shell family, ignored now; a[5] = offset [f,x,y,z])
    plates: (c.pl as any[] | undefined)?.map((a: any) => [a[0], {
      id: a[0], nodes: a[1], materialId: a[2], thickness: a[3],
      ...(Array.isArray(a[5]) ? { offset: { frame: a[5][0] === 'l' ? 'local' : 'global', x: a[5][1], y: a[5][2], z: a[5][3] } } : {}),
    }]) as ModelSnapshot['plates'],

    // Quads
    quads: (c.qu as any[] | undefined)?.map((a: any) => [a[0], {
      id: a[0], nodes: a[1], materialId: a[2], thickness: a[3],
      ...(Array.isArray(a[5]) ? { offset: { frame: a[5][0] === 'l' ? 'local' : 'global', x: a[5][1], y: a[5][2], z: a[5][3] } } : {}),
    }]) as ModelSnapshot['quads'],

    // Constraints
    constraints: c.cn as ModelSnapshot['constraints'],

    // Connectors
    connectors: c.cx as ModelSnapshot['connectors'],

    // Footings and the ground they bear on. Both pass through `migrateFootings` /
    // `migrateGeotechnical` in `restore()`, which is what validates the shapes — a URL is
    // user-editable, so nothing here may be trusted to be well formed.
    footings: c.fo as ModelSnapshot['footings'],
    geotechnical: c.gt as ModelSnapshot['geotechnical'],
    footingMatPreferences: c.fm as ModelSnapshot['footingMatPreferences'],

    // Provenance (CAD-draft tag) — undefined for ordinary models
    provenance: c.pv as ModelSnapshot['provenance'],

    /*
     * The joint designs — I-08. Validated rather than cast, because a URL is user-editable and
     * this is the one field whose contents end up presented to the user as «what you chose».
     * `unpackJointDesigns` throws on a payload that is not what it claims to be, and the `catch`
     * in `decompressV2` turns that into the null this function's callers already handle.
     *
     * Absent stays absent. Reconciliation against the OPEN model then decides which of these
     * still apply — so a link opened over a different project reports its joints obsolete instead
     * of matching them by node id.
     */
    jointDesigns: unpackJointDesigns(c.jd),

    // Groups; their shape is checked by `prepareSharedSnapshot`, as a legacy link's are.
    groups: c.gr as ModelSnapshot['groups'],

    // NextId
    nextId: (() => {
      const a = c.ni as number[];
      return { node: a[0], material: a[1], section: a[2], element: a[3], support: a[4], load: a[5], loadCase: a[6], combination: a[7], plate: a[8] ?? 1, quad: a[9] ?? 1, connector: a[10] ?? 1, footing: a[11] ?? 1, soilProfile: a[12] ?? 1 };
    })(),
  };

  // Restore ShareMeta from compact format
  const sm = c._ as Record<string, unknown> | undefined;
  if (sm) {
    const meta: Record<string, unknown> = { ...META_DEFAULTS };
    for (const [key, val] of Object.entries(sm)) {
      if (key === 'cameraPosition3D' || key === 'cameraTarget3D') {
        const a = val as number[];
        meta[key] = { x: a[0], y: a[1], z: a[2] };
        continue;
      }
      meta[key] = val;
    }
    (snapshot as any)._shareMeta = meta;
  }

  return snapshot;
}

// ─── v2 compress/decompress ───────────────────────────────────────────────

function compressV2(snapshot: ModelSnapshot, meta?: ShareMeta): string {
  const compact = toCompact(snapshot, meta);
  const json = JSON.stringify(compact);
  const bytes = new TextEncoder().encode(json);
  const deflated = deflateSync(bytes, { level: 9 });
  return V2_PREFIX + uint8ToBase64url(deflated);
}

function decompressV2(data: string): ModelSnapshot | null {
  try {
    const b64 = data.slice(V2_PREFIX.length);
    const deflated = base64urlToUint8(b64);
    const bytes = inflateSync(deflated);
    const json = new TextDecoder().decode(bytes);
    const compact = JSON.parse(json);
    if (!Array.isArray(compact.ni)) return null;
    return prepareSharedSnapshot(fromCompact(compact));
  } catch {
    return null;
  }
}

// ─── v1 (legacy LZ-String) ───────────────────────────────────────────────

/**
 * Compress a ModelSnapshot to a URL-safe string (v2 — fflate + base64url, sv:4).
 */
export function compressSnapshot(snapshot: ModelSnapshot): string {
  return compressV2(snapshot);
}

/**
 * Decompress a URL-safe string back to a ModelSnapshot.
 * Auto-detects v2 (prefix "2.") vs v1 (LZ-String) format.
 */
export function decompressSnapshot(data: string): ModelSnapshot | null {
  // v2 format
  if (data.startsWith(V2_PREFIX)) {
    return decompressV2(data);
  }
  // v1 (legacy LZ-String) — migrate hingeStart/hingeEnd → releaseI.mz/releaseJ.mz
  try {
    const json = LZString.decompressFromEncodedURIComponent(data);
    if (!json) return null;
    const parsed = prepareSharedSnapshot(JSON.parse(json));
    if (!parsed) return null;

    const elems = parsed.elements as Array<[number, Record<string, unknown>]>;
    if (Array.isArray(elems)) {
      for (const [, elem] of elems) {
        if (!elem) continue;
        if (!elem.releaseI) elem.releaseI = { ...NO_RELEASE, mz: elem.hingeStart === true };
        if (!elem.releaseJ) elem.releaseJ = { ...NO_RELEASE, mz: elem.hingeEnd === true };
        delete elem.hingeStart;
        delete elem.hingeEnd;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

// ─── Shared meta builder ──────────────────────────────────────────────────

function buildShareMeta(includeViewport: boolean): ShareMeta {
  const hasResults = resultsStore.results !== null || resultsStore.results3D !== null;
  const meta: ShareMeta = {
    diagramType: resultsStore.diagramType,
    deformedScale: resultsStore.deformedScale,
    diagramScale: resultsStore.diagramScale,
    showDiagramValues: resultsStore.showDiagramValues,
    autoSolve: hasResults,
    showGrid: uiStore.showGrid,
    gridSize: uiStore.gridSize,
    snapToGrid: uiStore.snapToGrid,
    showNodeLabels: uiStore.showNodeLabels,
    showElementLabels: uiStore.showElementLabels,
    showLengths: uiStore.showLengths,
    elementColorMode: uiStore.elementColorMode,
    showLoads: uiStore.showLoads,
    hideLoadsWithDiagram: uiStore.hideLoadsWithDiagram,
    showAxes: uiStore.showAxes,
    renderMode3D: uiStore.renderMode3D,
    momentStyle3D: uiStore.momentStyle3D,
    cameraMode3D: uiStore.cameraMode3D,
    showGrid3D: uiStore.showGrid3D,
    gridSize3D: uiStore.gridSize3D,
    snapToGrid3D: uiStore.snapToGrid3D,
    showNodeLabels3D: uiStore.showNodeLabels3D,
    showElementLabels3D: uiStore.showElementLabels3D,
    showLengths3D: uiStore.showLengths3D,
    showLoads3D: uiStore.showLoads3D,
    showAxes3D: uiStore.showAxes3D,
    localAxesMode3D: uiStore.localAxesMode3D,
    axisConvention3D: uiStore.axisConvention3D,
    includeSelfWeight: uiStore.includeSelfWeight,
    // Always written (`null` is not a default the compact form drops): see statedSelfWeightCaseId.
    selfWeightCaseId: statedSelfWeightCaseId(),
    liveCalc: uiStore.liveCalc,
  };
  if (includeViewport) {
    meta.zoom = uiStore.zoom;
    meta.panX = uiStore.panX;
    meta.panY = uiStore.panY;
    meta.cameraPosition3D = { ...uiStore.cameraPosition3D };
    meta.cameraTarget3D = { ...uiStore.cameraTarget3D };
  }
  return meta;
}

// ─── Generate URLs ────────────────────────────────────────────────────────

/**
 * Generate a share URL with the current model compressed in the hash fragment.
 * Returns { url, length } or null if model is empty.
 */
export function generateShareURL(): { url: string; length: number } | null {
  const snapshot = modelStore.snapshot();
  if (snapshot.nodes.length === 0) return null;

  const mode = uiStore.analysisMode;
  snapshot.analysisMode = sharedMode(mode);
  // A model the compact format would change (every PRO addition: behaviours, sections' own
  // properties, supports that lift, the analysis rules, the grid…) is shared as its code, which
  // carries all of it. The feedback widget attaches this link to every report, PRO ones included.
  if (mode === 'pro' || compactLoses(snapshot)) return codeShareUrl(snapshot, `${location.origin}${location.pathname}`);
  const meta = buildShareMeta(true);

  const compressed = compressV2(snapshot, meta);
  const url = `${location.origin}${location.pathname}#data=${compressed}`;
  // The whole link, as PRO's is measured: the ceiling is about what a reader pastes.
  return { url, length: url.length };
}

/**
 * Whether the compact format would open as a different model.
 *
 * The compact format predates PRO. A list of the fields it drops went stale every time a field
 * was added (custom supports, curved shells, saved views, grades, arcs…), so this encodes the
 * model, decodes it back and compares: what the format does not carry shows up as a difference,
 * whatever it is called. Absent, null, false, zero, '' and empty lists and objects count as the
 * same, since the format omits them; numbers compare to the ten figures the format keeps.
 */
export function compactLoses(snapshot: ModelSnapshot): boolean {
  let back: ModelSnapshot;
  try { back = fromCompact(JSON.parse(JSON.stringify(toCompact(snapshot)))); } catch { return true; }
  const a = { ...(snapshot as unknown as Record<string, unknown>) }, b = { ...(back as unknown as Record<string, unknown>) };
  for (const k of IGNORED_TOP) { delete a[k]; delete b[k]; }
  // The project's documents the store fills in when a model does not state them: a link that
  // omits them opens with the same defaults.
  for (const [k, make] of Object.entries(STORE_DEFAULTS)) { if (a[k] === undefined) a[k] = make(); if (b[k] === undefined) b[k] = make(); }
  return !sameValue(a, b);
}

const STORE_DEFAULTS: Record<string, () => unknown> = {
  codeSettings: defaultCodeSettings, detailing: emptyDetailingStore,
  geotechnical: emptyGeotechnical, footingMatPreferences: defaultFootingMatPreferences,
};

/** Bookkeeping the decoder rebuilds or the link sets itself. */
const IGNORED_TOP = ['nextId', 'analysisMode', '_shareMeta', 'localAxisConvention'] as const;

function isBlank(v: unknown): boolean {
  if (v === undefined || v === null || v === false || v === 0 || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).every(isBlank);
  return false;
}

function sameValue(x: unknown, y: unknown): boolean {
  if (isBlank(x) && isBlank(y)) return true;
  if (typeof x === 'number' && typeof y === 'number') return Math.abs(x - y) <= 1e-9 * Math.max(Math.abs(x), Math.abs(y));
  if (Array.isArray(x) && Array.isArray(y)) return x.length === y.length && x.every((v, i) => sameValue(v, y[i]));
  if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x) && !Array.isArray(y)) {
    const ox = x as Record<string, unknown>, oy = y as Record<string, unknown>;
    for (const k of new Set([...Object.keys(ox), ...Object.keys(oy)])) if (!sameValue(ox[k], oy[k])) return false;
    return true;
  }
  return x === y;
}

/**
 * Generate an embed URL (same as share but with #embed= prefix).
 */
export function generateEmbedURL(): { url: string; length: number } | null {
  const snapshot = modelStore.snapshot();
  if (snapshot.nodes.length === 0) return null;

  snapshot.analysisMode = sharedMode(uiStore.analysisMode);
  const meta = buildShareMeta(false);

  const compressed = compressV2(snapshot, meta);
  const url = `${location.origin}${location.pathname}#embed=${compressed}`;
  return { url, length: compressed.length };
}

// ─── Restore meta helper ──────────────────────────────────────────────────

function restoreMeta(snapshot: ModelSnapshot): void {
  const meta = (snapshot as any)._shareMeta as ShareMeta | undefined;
  if (!meta) return;

  // Results visualization
  if (meta.deformedScale !== undefined) resultsStore.deformedScale = meta.deformedScale;
  if (meta.diagramScale !== undefined) resultsStore.diagramScale = meta.diagramScale;
  if (meta.showDiagramValues !== undefined) resultsStore.showDiagramValues = meta.showDiagramValues;
  // 2D visualization config
  if (meta.showGrid !== undefined) uiStore.showGrid = meta.showGrid;
  if (meta.gridSize !== undefined) uiStore.gridSize = meta.gridSize;
  if (meta.snapToGrid !== undefined) uiStore.snapToGrid = meta.snapToGrid;
  if (meta.showNodeLabels !== undefined) uiStore.showNodeLabels = meta.showNodeLabels;
  if (meta.showElementLabels !== undefined) uiStore.showElementLabels = meta.showElementLabels;
  if (meta.showLengths !== undefined) uiStore.showLengths = meta.showLengths;
  if (meta.elementColorMode !== undefined) uiStore.elementColorMode = meta.elementColorMode as any;
  if (meta.showLoads !== undefined) uiStore.showLoads = meta.showLoads;
  if (meta.hideLoadsWithDiagram !== undefined) uiStore.hideLoadsWithDiagram = meta.hideLoadsWithDiagram;
  if (meta.showAxes !== undefined) uiStore.showAxes = meta.showAxes;
  // 3D visualization config
  if (meta.renderMode3D !== undefined) uiStore.renderMode3D = meta.renderMode3D as any;
  if (meta.momentStyle3D !== undefined) uiStore.momentStyle3D = meta.momentStyle3D as any;
  if (meta.cameraMode3D !== undefined) uiStore.cameraMode3D = meta.cameraMode3D as any;
  if (meta.showGrid3D !== undefined) uiStore.showGrid3D = meta.showGrid3D;
  if (meta.gridSize3D !== undefined) uiStore.gridSize3D = meta.gridSize3D;
  if (meta.snapToGrid3D !== undefined) uiStore.snapToGrid3D = meta.snapToGrid3D;
  if (meta.showNodeLabels3D !== undefined) uiStore.showNodeLabels3D = meta.showNodeLabels3D;
  if (meta.showElementLabels3D !== undefined) uiStore.showElementLabels3D = meta.showElementLabels3D;
  if (meta.showLengths3D !== undefined) uiStore.showLengths3D = meta.showLengths3D;
  if (meta.showLoads3D !== undefined) uiStore.showLoads3D = meta.showLoads3D;
  if (meta.showAxes3D !== undefined) uiStore.showAxes3D = meta.showAxes3D;
  if (meta.localAxesMode3D !== undefined) uiStore.localAxesMode3D = meta.localAxesMode3D;
  if (meta.axisConvention3D !== undefined) uiStore.axisConvention3D = meta.axisConvention3D as any;
  // Other settings
  if (meta.includeSelfWeight !== undefined) uiStore.includeSelfWeight = meta.includeSelfWeight;
  uiStore.selfWeightCaseId = meta.selfWeightCaseId ?? null;
  noteBasicSelfWeightRuleIfNeeded(meta.selfWeightCaseId !== undefined, uiStore.analysisMode);
  viewVisibility.showAll();
  if (meta.liveCalc !== undefined) uiStore.liveCalc = meta.liveCalc;
  // Viewport state
  if (meta.zoom !== undefined) uiStore.zoom = meta.zoom;
  if (meta.panX !== undefined) uiStore.panX = meta.panX;
  if (meta.panY !== undefined) uiStore.panY = meta.panY;
  if (meta.cameraPosition3D) uiStore.cameraPosition3D = { ...meta.cameraPosition3D };
  if (meta.cameraTarget3D) uiStore.cameraTarget3D = { ...meta.cameraTarget3D };
  // Diagram type + autoSolve
  if (meta.autoSolve) {
    uiStore.pendingSolveFromURL = meta.diagramType ?? 'deformed';
  } else if (meta.diagramType) {
    resultsStore.diagramType = meta.diagramType;
  }
}

// ─── Load from URL / link ─────────────────────────────────────────────────

/**
 * Try to load a model from the current URL hash.
 * Returns 'data' | 'embed' | null depending on what was found.
 */
export function loadFromURLHash(): 'data' | 'embed' | null {
  const hash = location.hash;
  if (!hash) return null;

  // A PRO link carries the model code (`model/code/share.ts`).
  if (hash.startsWith(CODE_HASH)) {
    const r = readCodeFragment(hash);
    if (!r.snapshot) return null;
    modelStore.clear();
    const { snapshot } = mergeCode(modelStore.snapshot(), r.snapshot);
    applyLinkMode(snapshot.analysisMode);
    modelStore.restore(snapshot);
    queueMicrotask(() => window.dispatchEvent(new Event('stabileo-restore-camera-3d')));
    history.replaceState(null, '', location.pathname + location.search);
    return 'data';
  }

  let mode: 'data' | 'embed' | null = null;
  let compressed: string | null = null;

  if (hash.startsWith('#data=')) {
    mode = 'data';
    compressed = hash.slice(6);
  } else if (hash.startsWith('#embed=')) {
    mode = 'embed';
    compressed = hash.slice(7);
  }

  if (!mode || !compressed) return null;

  const snapshot = decompressSnapshot(compressed);
  if (!snapshot) return null;

  const loadedMode = applyLinkMode(snapshot.analysisMode);

  modelStore.restore(snapshot);
  restoreMeta(snapshot);
  // Same pre-metadata convention note as a .ded open — a shared link is the most
  // common cross-machine entry point, so a legacy 3D model must not change axes
  // silently here. (New models carry the tag below, so this never false-fires.)
  noteAxisConventionMigrationIfNeeded(snapshot, loadedMode);

  // Notify 3D viewport to restore camera from uiStore
  queueMicrotask(() => {
    window.dispatchEvent(new Event('stabileo-restore-camera-3d'));
  });

  // Clean hash from URL without triggering navigation
  history.replaceState(null, '', location.pathname + location.search);

  return mode;
}

/**
 * Parse a share URL and return the compressed data portion (or null if invalid).
 * Accepts full URLs like "https://stabileo.com/#data=..." or just the hash "#data=..."
 */
export function parseShareURL(url: string): { compressed: string; mode: 'data' | 'embed' } | null {
  try {
    let hash: string;
    if (url.includes('#')) {
      hash = '#' + url.split('#')[1];
    } else {
      return null;
    }
    if (hash.startsWith('#data=')) {
      return { compressed: hash.slice(6), mode: 'data' };
    } else if (hash.startsWith('#embed=')) {
      return { compressed: hash.slice(7), mode: 'embed' };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Load a model from a share link string (for "Pegar enlace" — opens in current context).
 * Returns true if successfully loaded, false otherwise.
 */
export function loadFromShareLink(url: string): boolean {
  // A link that carries the model code (PRO's, and any model the compact format would change).
  const i = url.indexOf(CODE_HASH);
  if (i >= 0) {
    const r = readCodeFragment(url.slice(i));
    if (!r.snapshot) return false;
    modelStore.clear();
    const { snapshot } = mergeCode(modelStore.snapshot(), r.snapshot);
    applyLinkMode(snapshot.analysisMode);
    modelStore.restore(snapshot);
    queueMicrotask(() => window.dispatchEvent(new Event('stabileo-restore-camera-3d')));
    return true;
  }
  const parsed = parseShareURL(url);
  if (!parsed) return false;

  const snapshot = decompressSnapshot(parsed.compressed);
  if (!snapshot) return false;

  const loadedMode = applyLinkMode(snapshot.analysisMode);

  modelStore.restore(snapshot);
  restoreMeta(snapshot);
  // Same pre-metadata convention note as a .ded open — a shared link is the most
  // common cross-machine entry point, so a legacy 3D model must not change axes
  // silently here. (New models carry the tag below, so this never false-fires.)
  noteAxisConventionMigrationIfNeeded(snapshot, loadedMode);

  // Notify 3D viewport to restore camera from uiStore
  queueMicrotask(() => {
    window.dispatchEvent(new Event('stabileo-restore-camera-3d'));
  });

  return true;
}

export { MAX_URL_SAFE };
