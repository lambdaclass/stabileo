/** The solver writes its errors in English; the app shows them in its own language. */
import { describe, it, expect, afterAll } from 'vitest';
import { localizeEngineText } from '../engine-text';
import { setLocale } from '../index';

afterAll(() => setLocale('en'));

describe('engine sentences', () => {
  it('reads the mechanism error in Spanish and Portuguese, inside a longer message', () => {
    setLocale('es');
    expect(localizeEngineText('Error en caso 3D "CV": Singular stiffness matrix — structure is a mechanism'))
      .toBe('Error en caso 3D "CV": Matriz de rigidez singular: la estructura es un mecanismo');
    setLocale('pt');
    expect(localizeEngineText('Singular stiffness matrix — structure is a mechanism')).toBe('Matriz de rigidez singular: a estrutura é um mecanismo');
  });

  it('reads a degree of freedom tied by two constraints in Spanish', () => {
    setLocale('es');
    expect(localizeEngineText('DOF 648 (node 121) is constrained by 2 constraints — last one wins'))
      .toBe('El grado de libertad 648 (nodo 121) está sujeto a 2 restricciones; sólo vale la última');
  });

  it('translates invalid spring stiffness and cancelled combinations (#2292)', async () => {
    for (const [locale, invalid, cancelled] of [
      ['es', 'Ingresá un número finito en input.solver.supports.2.kx (valor recibido: NaN).', 'Los factores de los casos de carga repetidos se cancelan y dan cero en esta combinación.'],
      ['pt', 'Insira um número finito em input.solver.supports.2.kx (valor recebido: NaN).', 'Os fatores dos casos de carga repetidos se cancelam e resultam em zero nesta combinação.'],
    ] as const) {
      await setLocale(locale);
      expect(localizeEngineText('Non-finite number (NaN) at input.solver.supports.2.kx'))
        .toBe(invalid);
      expect(localizeEngineText('Repeated load case factors cancel to zero in this combination.')).toBe(cancelled);
    }
  });

  it('leaves a sentence it does not know as it is', () => {
    setLocale('es');
    expect(localizeEngineText('Residual 1.2e-3 exceeds tolerance')).toBe('Residual 1.2e-3 exceeds tolerance');
  });
});
