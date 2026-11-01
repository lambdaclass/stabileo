/**
 * The paper as a LaTeX article, written from the same data as the page (`jaie-2026.ts`).
 * `scripts/paper-pdf.ts` typesets it into the PDF the page offers; `jaie-2026.tex` is its last
 * output, kept so a change to the text that was not typeset again fails a test.
 */
import { PAPER, BODY, REFERENCES, type PaperBlock } from './jaie-2026';
import { segments } from './inline';

const SPECIAL: Record<string, string> = {
  '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$', '&': '\\&', '#': '\\#', '%': '\\%', '_': '\\_',
  '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
  '×': '$\\times$', 'Δ': '$\\Delta$', 'Φ': '$\\Phi$', '≤': '$\\leq$', '≥': '$\\geq$', '→': '$\\rightarrow$', '≈': '$\\approx$',
};

function escape(s: string): string {
  return s
    .replace(/[\\{}$&#%_~^×ΔΦ≤≥→≈]/g, (c) => SPECIAL[c])
    .replace(/"([^"]*)"/g, '``$1\'\'')
    .replace(/(\d) (kN|MPa|m\b|cm\b)/g, '$1~$2')
    .replace(/\b(Table|Figure) (\d)/g, '$1~$2');
}

export function inline(s: string): string {
  return segments(s)
    .map((p) =>
      p.k === 'text' ? escape(p.t)
      : p.k === 'i' ? `\\emph{${escape(p.t)}}`
      : p.k === 'b' ? `\\textbf{${escape(p.t)}}`
      : p.k === 'math' ? `$${p.tex}$`
      : `~\\cite{${p.n.map((n) => `ref${n}`).join(',')}}`,
    )
    .join('');
}

function header(h: string, wide: boolean): string {
  const [first, rest] = h.split(/ (?=\()/);
  return wide && rest
    ? `\\textbf{\\begin{tabular}[b]{@{}l@{}}${inline(first)}\\\\${inline(rest)}\\end{tabular}}`
    : `\\textbf{${inline(h)}}`;
}

function block(b: PaperBlock): string {
  switch (b.k) {
    case 'h1': return `\\section{${inline(b.t)}}\\label{sec:${b.n}}`;
    case 'h2': return `\\subsection{${inline(b.t)}}\\label{sec:${b.n}}`;
    case 'p': return inline(b.t);
    case 'ol': return ['\\begin{enumerate}', ...b.items.map((i) => `  \\item ${inline(i)}`), '\\end{enumerate}'].join('\n');
    case 'eq': return ['\\begin{equation}', `  ${b.tex}`, `  \\label{eq:${b.n}}`, '\\end{equation}'].join('\n');
    case 'table': {
      const wide = b.head.join('').length > 80;
      return [
        '\\begin{table}[htbp]',
        '  \\centering\\small',
        `  \\caption{${inline(b.caption)}}\\label{tab:${b.n}}`,
        wide
          ? `  \\begin{tabularx}{\\linewidth}{>{\\raggedright\\arraybackslash}X${'l'.repeat(b.head.length - 1)}}`
          : `  \\begin{tabular}{${'l'.repeat(b.head.length)}}`,
        '    \\toprule',
        `    ${b.head.map((h) => header(h, wide)).join(' & ')} \\\\`,
        '    \\midrule',
        ...b.rows.map((r) => `    ${r.map(inline).join(' & ')} \\\\`),
        '    \\bottomrule',
        `  \\end{${wide ? 'tabularx' : 'tabular'}}`,
        '\\end{table}',
      ].join('\n');
    }
    case 'figure':
      return [
        '\\begin{figure}[htbp]',
        '  \\centering',
        `  \\includegraphics[width=${b.width < 1200 ? '0.8' : '1'}\\linewidth]{figura-${b.n}.png}`,
        `  \\caption{${inline(b.caption)}}\\label{fig:${b.n}}`,
        '\\end{figure}',
      ].join('\n');
  }
}

function reference(r: string, i: number): string {
  const url = r.match(/https?:\/\/\S+$/)?.[0];
  const text = url ? `${escape(r.slice(0, r.length - url.length))}\\url{${url}}` : escape(r);
  return `\\bibitem{ref${i + 1}} ${text}`;
}

export function paperLatex(): string {
  const authors = PAPER.authors.map((a) => `${a.name}\\textsuperscript{${a.marks}}`).join(', ');
  const affiliations = PAPER.affiliations.map(([m, name]) => `\\textsuperscript{${m}}${escape(name)}`).join('\\\\\n');
  return `\\documentclass[11pt,a4paper]{article}
\\usepackage{fontspec}
\\usepackage[margin=2.5cm]{geometry}
\\usepackage{amsmath,amssymb}
\\usepackage{booktabs,tabularx}
\\usepackage{graphicx}
\\usepackage[font=small,labelfont=bf]{caption}
\\usepackage[hidelinks]{hyperref}
\\usepackage{url}

\\title{${escape(PAPER.title)}\\thanks{${escape(PAPER.note)}}}
\\author{${authors}\\\\[0.6em]
\\normalsize ${affiliations}\\\\[0.4em]
\\small\\texttt{${PAPER.authors.map((a) => a.email).join(', ')}}}
\\date{}

\\begin{document}
\\maketitle

\\begin{abstract}
${escape(PAPER.abstract)}

\\medskip
\\noindent\\textbf{Keywords:} ${escape(PAPER.keywords)}
\\end{abstract}

${BODY.map(block).join('\n\n')}

\\begin{thebibliography}{99}
${REFERENCES.map(reference).join('\n')}
\\end{thebibliography}

\\end{document}
`;
}
