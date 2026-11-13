export function allowsUnresolved(reference,result,error,expected) {
  return expected&&(result?.converged===false||/^Singular (tangent )?stiffness/.test(String(error)));
}
