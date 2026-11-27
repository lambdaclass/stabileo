import { parse } from 'svelte/compiler';

export function prunePublicBuildBranches(content, features) {
  if (!content.includes('__PUBLIC_FEATURES__.')) return { code: content };
  const unknown = Symbol();
  const changes = [];
  const discarded = new Set();
  function remove(start, end) {
    changes.push([start, end, '']);
  }
  function componentNames(node) {
    if (node.type === 'Component') discarded.add(node.name.split('.')[0]);
    for (const child of children(node)) componentNames(child);
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
        const inactive = condition ? node.alternate : node.consequent;
        if (featureGuard && inactive) componentNames(inactive);
        if (!nodes.length) remove(node.start, node.end);
        else {
          remove(node.start, nodes[0].start);
          remove(nodes.at(-1).end, node.end);
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
  const component = parse(content, { modern: true });
  visit(component.fragment);
  function children(node) {
    return Object.values(node).flat().filter(child => child && typeof child.type === 'string');
  }
  function shadowsFeatures(node, parent) {
    if (node.type === 'Identifier' && node.name === '__PUBLIC_FEATURES__') {
      return parent?.type !== 'MemberExpression' || parent.object !== node;
    }
    return children(node).some(child => shadowsFeatures(child, node));
  }
  function selectedBranch(expression) {
    if (expression?.type !== 'ConditionalExpression') return null;
    const flags = new Set();
    const condition = value(expression.test, flags);
    if (condition === unknown || !flags.size || [...flags].some(key =>
      !['proPlatesUnified', 'proRcSheets'].includes(key) || typeof features[key] !== 'boolean')) return null;
    return condition ? expression.consequent : expression.alternate;
  }
  function scriptChoices(node) {
    const chosen = selectedBranch(node);
    if (chosen) {
      changes.push([node.start, chosen.start, '('], [chosen.end, node.end, ')']);
      scriptChoices(chosen);
      return;
    }
    if (node.type === 'ArrayExpression' && node.elements.every(Boolean)) {
      for (const item of node.elements) {
        const branch = item.type === 'SpreadElement' && selectedBranch(item.argument);
        if (branch?.type === 'ArrayExpression' && !branch.elements.length) {
          const suffix = content.slice(item.end, node.end);
          const comma = /^\s*,/.exec(suffix);
          if (comma || /^\s*\]$/.test(suffix)) {
            remove(item.start, item.end + (comma?.[0].length ?? 0));
            continue;
          }
        }
        scriptChoices(item);
      }
      return;
    }
    for (const child of children(node)) scriptChoices(child);
  }
  const scripts = [component.instance, component.module].filter(Boolean);
  if (!scripts.some(script => shadowsFeatures(script.content))) {
    for (const script of scripts) scriptChoices(script.content);
  }
  let code = content;
  for (const [start, end, replacement] of changes.sort((a, b) => b[0] - a[0])) code = code.slice(0, start) + replacement + code.slice(end);
  if (!changes.length) return { code };
  const retained = parse(code, { modern: true });
  const imports = [...retained.instance?.content.body ?? [], ...retained.module?.content.body ?? []]
    .filter(node => node.type === 'ImportDeclaration' && node.source.value.endsWith('.svelte')
      && node.specifiers.length === 1 && ['ImportDefaultSpecifier', 'ImportNamespaceSpecifier'].includes(node.specifiers[0].type));
  for (const declaration of imports.sort((a, b) => b.start - a.start)) {
    const name = declaration.specifiers[0].local.name;
    if (!discarded.has(name)) continue;
    const remainder = code.slice(0, declaration.start) + code.slice(declaration.end);
    if (!remainder.includes(name)) code = remainder;
  }
  return { code };
}
