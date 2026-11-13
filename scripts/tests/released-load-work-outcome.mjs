export function allowsUnresolved(reference,result,error,expected) {
  const nativeUnresolved=reference?.ok?.converged===false||/^Singular (tangent )?stiffness/.test(String(reference?.error));
  return expected&&nativeUnresolved&&(result?.converged===false||/^Singular (tangent )?stiffness/.test(String(error)));
}
