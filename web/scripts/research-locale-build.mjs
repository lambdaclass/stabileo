import ts from 'typescript';

export function researchLocaleBuildPlugin(environment) {
  return {
    name: 'research-locale-build',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (environment().VITE_RESEARCH === '1' || !/\/src\/components\/(research|tools)\/.*\.ts$/.test(id) || /\.(test|spec)\.ts$/.test(id)) return null;
      const source = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      if (source.parseDiagnostics.length) throw new Error(`Cannot gate research locales in ${id}: invalid TypeScript`);
      const edits = [];
      function visit(node) {
        if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) && node.name.getText(source).replace(/^['"]|['"]$/g, '') === 'hu') {
          edits.push([node.getStart(source), node.end]);
          return;
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
      if (!edits.length) return null;
      for (const [start, end] of edits.reverse()) code = code.slice(0, start) + '...{}' + code.slice(end);
      return { code, map: null };
    },
  };
}
