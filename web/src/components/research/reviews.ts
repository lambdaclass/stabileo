import type { ResearchStrings } from './i18n';

export type Review = {
  reviewer: string;
  date: string;
  commit: string;
  verdict: string;
  followup?: number;
};
export type ReviewPaper = { version_stage?: string; reviews?: Review[] };

export function reviewerName(reviewer: string, s: ResearchStrings): string {
  return ({ codex: 'Codex', kimi: 'Kimi', grok: 'Grok', human: s.reviewHuman })[reviewer] ?? reviewer;
}

export function reviewStatus(paper: ReviewPaper, s: ResearchStrings): string {
  const reviews = paper.reviews ?? [];
  const stage = ({ 'first-version': s.reviewFirstVersion, improved: s.reviewImproved, complete: s.reviewComplete })[paper.version_stage ?? ''];
  const status = reviews.length
    ? s.reviewCount.replace('{count}', String(reviews.length)).replace('{reviewers}', [...new Set(reviews.map(r => reviewerName(r.reviewer, s)))].join(', '))
    : s.reviewNone;
  return stage ? `${stage} · ${status}` : status;
}

export function reviewVerdict(verdict: string, s: ResearchStrings): string {
  return ({ 'not ready': s.reviewNotReady, 'ready after should-fix items': s.reviewShouldFix, 'ready to merge': s.reviewReady })[verdict] ?? verdict;
}
