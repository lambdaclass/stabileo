/** Publisher metadata supplements incomplete Crossref records without changing the verified source. */
export function bibliography(paper: { crossref: { title: string; authors: string[]; venue: string; year: number }; bibliography?: { authors: string[]; venue: string } }) {
  return { ...paper.crossref, ...paper.bibliography };
}
export function citation(paper: Parameters<typeof bibliography>[0]) {
  const b = bibliography(paper);
  const authors = b.authors.length > 3 ? `${b.authors.slice(0, 3).join(', ')} et al.` : b.authors.join(', ');
  return [authors, b.venue, b.year].filter(Boolean).join(', ');
}
