/**
 * Which drawn sections a steel check can read, and why the others cannot.
 *
 * The member checks this app carries are written for a small set of shapes: doubly symmetric I and
 * H, closed tubes, and the catalogue's own families. A drawn section is read by them only when it IS
 * one of those shapes, exactly:
 *
 *   · a welded I of three plates, flanges equal and centred on the web, one material; or
 *   · a single catalogue profile, unrotated, uncut and unmirrored, with nothing added.
 *
 * Anything else (cover plates, a cut tee, two profiles, a filled tube, a free outline) has a scope
 * reason instead, and the section carries no `shape`, so no check can take it for an I. The
 * composite column check a filled tube would need is not carried; its scope says so rather than
 * leaving the member unchecked without a word.
 */
import type { DrawnSection, DrawnPart } from './drawn';
import { findProfile } from '../engine/generators/profile-resolve';
import { familyToShape } from '../data/steel-profiles';

export type DrawnScope =
  | 'composite'
  | 'coverPlated'
  | 'cutProfile'
  | 'severalProfiles'
  | 'freeOutline';

/** The fields a checker reads, when the drawing is exactly one of its shapes. Metres. */
export interface DrawnDesignShape {
  shape: 'I' | 'H' | 'U' | 'L' | 'T' | 'RHS' | 'CHS';
  h: number;
  b: number;
  tw?: number;
  tf?: number;
  t?: number;
  /** The catalogue profile it is, when it is one. */
  profileName?: string;
}

const TOL = 1e-6;
const near = (a: number, b: number) => Math.abs(a - b) <= TOL;
const plain = (p: DrawnPart) => !p.void && !p.mirror && p.materialId == null && Math.abs(p.rotationDeg % 360) < 1e-9;

export function drawnDesignShape(d: DrawnSection): { shape: DrawnDesignShape } | { scope: DrawnScope } {
  const solids = d.parts.filter((p) => !p.void);
  if (d.parts.some((p) => p.materialId != null)) return { scope: 'composite' };
  if (solids.length !== d.parts.length) return { scope: 'freeOutline' };

  // A single catalogue profile.
  if (solids.length === 1 && solids[0]!.shape.kind === 'profile') {
    const p = solids[0]!;
    if (p.shape.kind !== 'profile') return { scope: 'freeOutline' };
    if (p.shape.cut) return { scope: 'cutProfile' };
    const prof = findProfile(p.shape.name);
    if (!prof || !plain(p)) return { scope: 'freeOutline' };
    const mm = (v: number | undefined) => (v == null ? undefined : v / 1000);
    return {
      shape: {
        shape: familyToShape(prof.family) as DrawnDesignShape['shape'],
        h: prof.h / 1000, b: prof.b / 1000, tw: mm(prof.tw), tf: mm(prof.tf), t: mm(prof.t), profileName: prof.name,
      },
    };
  }

  const profiles = solids.filter((p) => p.shape.kind === 'profile');
  if (profiles.some((p) => p.shape.kind === 'profile' && p.shape.cut)) return { scope: 'cutProfile' };
  if (profiles.length > 1) return { scope: 'severalProfiles' };
  if (profiles.length === 1) return { scope: 'coverPlated' };

  // A welded I: two equal flanges and a web between them, all centred on one vertical line.
  if (solids.length === 3 && solids.every((p) => p.shape.kind === 'rect' && plain(p))) {
    const r = solids.map((p) => {
      const s = p.shape as { b: number; h: number };
      return { b: s.b, h: s.h, y: p.at[0], z: p.at[1] };
    }).sort((a, b) => b.z - a.z);
    const [top, web, bot] = r as [typeof r[0], typeof r[0], typeof r[0]];
    const flangesEqual = near(top.b, bot.b) && near(top.h, bot.h);
    const centred = near(top.y, web.y) && near(bot.y, web.y);
    const webBetween = near(top.z - top.h / 2, web.z + web.h / 2) && near(bot.z + bot.h / 2, web.z - web.h / 2);
    const symmetric = near(top.z - web.z, web.z - bot.z);
    if (flangesEqual && centred && webBetween && symmetric && web.b < top.b) {
      const h = top.z + top.h / 2 - (bot.z - bot.h / 2);
      return { shape: { shape: near(h, top.b) || top.b >= h ? 'H' : 'I', h, b: top.b, tw: web.b, tf: top.h } };
    }
  }
  return { scope: 'freeOutline' };
}
