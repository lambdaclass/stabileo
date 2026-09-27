/**
 * What a project is, as the title of its documents states it: the client, the job, where it is,
 * its revisions with their dates, and who designed, checked and approved it, with dates.
 *
 * Kept in the project file (a model field) because it belongs to the job, not to the office or
 * the machine. The office's own letterhead (its name and logo) stays with the office, in the
 * report dialog.
 *
 * Pure.
 */
export interface Signatory { name: string; date?: string }

export interface ProjectRevision {
  /** "A", "1", "P2"… as the office writes it. */
  code: string;
  /** ISO date, yyyy-mm-dd. */
  date: string;
  note?: string;
}

export interface ProjectInfo {
  client?: string;
  job?: string;
  jobNumber?: string;
  site?: string;
  revisions?: ProjectRevision[];
  designer?: Signatory;
  checker?: Signatory;
  approver?: Signatory;
}

/** The latest revision: the last one listed. */
export function currentRevision(info: ProjectInfo | undefined): ProjectRevision | null {
  const r = info?.revisions ?? [];
  return r.length > 0 ? r[r.length - 1]! : null;
}

/** A value with nothing stated in it is no value: empty strings and empty signatories removed. */
export function cleanProjectInfo(info: ProjectInfo): ProjectInfo | undefined {
  const s = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  const person = (p?: Signatory) => (p && s(p.name) ? { name: s(p.name)!, ...(s(p.date) ? { date: s(p.date) } : {}) } : undefined);
  const out: ProjectInfo = {
    ...(s(info.client) ? { client: s(info.client) } : {}),
    ...(s(info.job) ? { job: s(info.job) } : {}),
    ...(s(info.jobNumber) ? { jobNumber: s(info.jobNumber) } : {}),
    ...(s(info.site) ? { site: s(info.site) } : {}),
    ...(info.revisions?.some((r) => s(r.code)) ? { revisions: info.revisions.filter((r) => s(r.code)).map((r) => ({ code: s(r.code)!, date: r.date, ...(s(r.note) ? { note: s(r.note) } : {}) })) } : {}),
    ...(person(info.designer) ? { designer: person(info.designer) } : {}),
    ...(person(info.checker) ? { checker: person(info.checker) } : {}),
    ...(person(info.approver) ? { approver: person(info.approver) } : {}),
  };
  return Object.keys(out).length > 0 ? out : undefined;
}
