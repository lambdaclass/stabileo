import { indexProfiles, ProfileError, resolveProfile } from './load';
import type { CodeProfile, LoadsProfile, RcProfile } from './types';
import cirsoc101 from './profiles/loads/cirsoc-101-2025.json';
import en1990 from './profiles/loads/en-1990-1991.json';
import en1990uk from './profiles/loads/en-1990-1991-uk.json';
import asce7 from './profiles/loads/asce7-22.json';
import ts498 from './profiles/loads/ts498-1997.json';
import en1992 from './profiles/rc/en-1992-1-1.json';
import en1992uk from './profiles/rc/bs-en-1992-1-1.json';

export const SHIPPED_PROFILES: readonly unknown[] = [cirsoc101, en1990, en1990uk, asce7, ts498, en1992, en1992uk];

const DOCS = indexProfiles(SHIPPED_PROFILES);
const resolved = new Map<string, CodeProfile>();

export function profile(id: string): CodeProfile {
  let p = resolved.get(id);
  if (!p) { p = resolveProfile(id, DOCS); resolved.set(id, p); }
  return p;
}

function ofRole<P extends CodeProfile>(id: string, role: P['meta']['role']): P {
  const p = profile(id);
  if (p.meta.role !== role) throw new ProfileError(id, [{ path: 'meta.role', message: `is ${p.meta.role}, not ${role}` }]);
  return p as P;
}

export const loadsProfile = (id: string): LoadsProfile => ofRole<LoadsProfile>(id, 'loads');
export const rcProfile = (id: string): RcProfile => ofRole<RcProfile>(id, 'rc');
