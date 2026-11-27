export const SETTLEMENT_CASE_ID = 2 ** 31 - 1;

const independentOfSettlementCase = new WeakSet<object>();

export function mayUseSettlementCase(result: object): boolean {
  return !independentOfSettlementCase.has(result);
}

export function recordSettlementDependency<T extends object>(result: T, usesSettlementCase: boolean): T {
  if (usesSettlementCase) independentOfSettlementCase.delete(result);
  else independentOfSettlementCase.add(result);
  return result;
}

export function preserveSettlementDependency<T extends object>(source: object, result: T): T {
  if (source === result) return result;
  return recordSettlementDependency(result, mayUseSettlementCase(source));
}
