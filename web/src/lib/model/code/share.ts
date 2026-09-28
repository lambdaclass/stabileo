/**
 * Share a PRO model as a link that carries its code.
 *
 * The compact link format (`#data=`) is Basic's: it carries nodes, members, materials, sections,
 * supports, loads, cases and combinations, and PRO models are more than that — shells, groups,
 * a mass source, foundations, settings. A PRO link now carries the model code instead, compressed,
 * so it carries exactly what the code does and nothing is dropped on the way.
 *
 * A link has a practical ceiling (`MAX_URL_SAFE`): past it, whatever it is pasted into starts to
 * break it. A model above the ceiling is not offered a link at all; its code is shared instead,
 * which has no length.
 */
import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';
import { modelToCode, codeToModel, type CodeError } from './format';
import type { ModelSnapshot } from '../../store/history.svelte';

export const CODE_HASH = '#code=';

function toB64Url(u8: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64Url(s: string): Uint8Array {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeCode(code: string): string {
  return toB64Url(deflateSync(strToU8(code), { level: 9 }));
}

export function decodeCode(payload: string): string | null {
  try { return strFromU8(inflateSync(fromB64Url(payload))); } catch { return null; }
}

/** The link for a snapshot, and its length. */
export function codeShareUrl(snapshot: ModelSnapshot, base: string): { url: string; length: number } {
  const url = `${base}${CODE_HASH}${encodeCode(modelToCode(snapshot))}`;
  return { url, length: url.length };
}

/** A `#code=` fragment read back into covered snapshot fields, or its errors. */
export function readCodeFragment(hash: string): { snapshot: Partial<ModelSnapshot> | null; errors: CodeError[] } {
  const code = decodeCode(hash.slice(CODE_HASH.length));
  if (code === null) return { snapshot: null, errors: [{ line: 0, message: 'the link is damaged' }] };
  return codeToModel(code);
}
