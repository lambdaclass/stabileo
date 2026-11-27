import { parse } from 'svelte/compiler';

export function prunePublicBuildBranches(content, features) {
  if (!content.includes('__PUBLIC_FEATURES__.')) return { code: content };
  const unknown = Symbol();
  const changes = [];
  function value(node) {
    const key = /^__PUBLIC_FEATURES__\.(accounts|research|tools|diagramGame|globalAxes|proPlatesUnified|proRcSheets)$/.exec(content.slice(node.start, node.end));
    if (key) return features[key[1]];
    if (node.type === 'Literal') return node.value;
    if (node.type === 'UnaryExpression' && node.operator === '!') {
      const operand = value(node.argument);
      return operand === unknown ? unknown : !operand;
    }
    if (node.type === 'LogicalExpression') {
      const left = value(node.left);
      if (left === unknown) return unknown;
      if (node.operator === '&&') return left ? value(node.right) : left;
      if (node.operator === '||') return left ? left : value(node.right);
    }
    if (node.type === 'BinaryExpression') {
      const left = value(node.left), right = value(node.right);
      if (left === unknown || right === unknown) return unknown;
      if (node.operator === '===') return left === right;
      if (node.operator === '!==') return left !== right;
    }
    if (node.type === 'ConditionalExpression') {
      const condition = value(node.test);
      if (condition !== unknown) return value(condition ? node.consequent : node.alternate);
    }
    return unknown;
  }
  function visit(node, parent) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'IfBlock' && !node.elseif && !node.alternate?.nodes[0]?.elseif) {
      const condition = value(node.test);
      if (condition !== unknown) {
        const nodes = (condition ? node.consequent : node.alternate)?.nodes ?? [];
        if (!nodes.length) changes.push([node.start, node.end, '']);
        else {
          changes.push([node.start, nodes[0].start, ''], [nodes.at(-1).end, node.end, '']);
          nodes.forEach(child => visit(child, node));
        }
        return;
      }
    }
    if (node.type === 'StyleDirective' && parent?.type === 'RegularElement' && !parent.attributes.some(attribute => attribute.type === 'SpreadAttribute' || (attribute.type === 'Attribute' && attribute.name === 'style')) && node.value?.type === 'ExpressionTag' && value(node.value.expression) === null) {
      changes.push([node.start, node.end, '']);
      return;
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(item => visit(item, node));
      else if (child && typeof child === 'object') visit(child, node);
    }
  }
  visit(parse(content, { modern: true }).fragment);
  let code = content;
  for (const [start, end, replacement] of changes.sort((a, b) => b[0] - a[0])) code = code.slice(0, start) + replacement + code.slice(end);
  if (!changes.length) return { code };
  const retained = parse(code, { modern: true });
  const imports = [...retained.instance?.content.body ?? [], ...retained.module?.content.body ?? []]
    .filter(node => node.type === 'ImportDeclaration' && node.source.value.endsWith('.svelte')
      && node.specifiers.length === 1 && node.specifiers[0].type === 'ImportDefaultSpecifier');
  const discarded = changes.map(([start, end]) => content.slice(start, end));
  for (const declaration of imports.sort((a, b) => b.start - a.start)) {
    const name = declaration.specifiers[0].local.name;
    if (!discarded.some(markup => markup.includes(`<${name}`))) continue;
    const remainder = code.slice(0, declaration.start) + code.slice(declaration.end);
    if (!remainder.includes(name)) code = remainder;
  }
  return { code };
}
