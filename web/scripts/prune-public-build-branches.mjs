import { parse } from 'svelte/compiler';

export function prunePublicBuildBranches(content, features) {
  if (!content.includes('__PUBLIC_FEATURES__.')) return { code: content };
  const unknown = Symbol();
  const changes = [];
  const discarded = [];
  function remove(start, end, featureGuard = false) {
    changes.push([start, end, '']);
    if (featureGuard) discarded.push(content.slice(start, end));
  }
  function value(node, flags) {
    const key = /^__PUBLIC_FEATURES__\.(accounts|research|tools|diagramGame|globalAxes|proPlatesUnified|proRcSheets)$/.exec(content.slice(node.start, node.end));
    if (key) {
      flags?.add(key[1]);
      return features[key[1]];
    }
    if (node.type === 'Literal') return node.value;
    if (node.type === 'UnaryExpression' && node.operator === '!') {
      const operand = value(node.argument, flags);
      return operand === unknown ? unknown : !operand;
    }
    if (node.type === 'LogicalExpression') {
      const left = value(node.left, flags);
      if (left === unknown) return unknown;
      if (node.operator === '&&') return left ? value(node.right, flags) : left;
      if (node.operator === '||') return left ? left : value(node.right, flags);
    }
    if (node.type === 'BinaryExpression') {
      const left = value(node.left, flags), right = value(node.right, flags);
      if (left === unknown || right === unknown) return unknown;
      if (node.operator === '===') return left === right;
      if (node.operator === '!==') return left !== right;
    }
    if (node.type === 'ConditionalExpression') {
      const condition = value(node.test, flags);
      if (condition !== unknown) return value(condition ? node.consequent : node.alternate, flags);
    }
    return unknown;
  }
  function visit(node, parent) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'IfBlock' && !node.elseif && !node.alternate?.nodes[0]?.elseif) {
      const flags = new Set();
      const condition = value(node.test, flags);
      if (condition !== unknown) {
        const nodes = (condition ? node.consequent : node.alternate)?.nodes ?? [];
        const featureGuard = flags.has('proPlatesUnified') || flags.has('proRcSheets');
        if (!nodes.length) remove(node.start, node.end, featureGuard);
        else {
          remove(node.start, nodes[0].start, featureGuard);
          remove(nodes.at(-1).end, node.end, featureGuard);
          nodes.forEach(child => visit(child, node));
        }
        return;
      }
    }
    if (node.type === 'StyleDirective' && parent?.type === 'RegularElement' && !parent.attributes.some(attribute => attribute.type === 'SpreadAttribute' || (attribute.type === 'Attribute' && attribute.name === 'style')) && node.value?.type === 'ExpressionTag' && value(node.value.expression) === null) {
      remove(node.start, node.end);
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
  for (const declaration of imports.sort((a, b) => b.start - a.start)) {
    const name = declaration.specifiers[0].local.name;
    if (!discarded.some(markup => markup.includes(`<${name}`))) continue;
    const remainder = code.slice(0, declaration.start) + code.slice(declaration.end);
    if (!remainder.includes(name)) code = remainder;
  }
  return { code };
}
