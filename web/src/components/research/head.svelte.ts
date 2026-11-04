/** The title and lead the open paper renders, so ResearchPage can state them in the document head. */
export type PaperHead = { paperId: string; name: string; lead: string };

export const paperHead = $state<{ current: PaperHead | null }>({ current: null });
