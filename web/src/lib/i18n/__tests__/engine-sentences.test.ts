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

  it('translates a member point moment refusal and preserves its component', () => {
    setLocale('es');
    expect(localizeEngineText('Unsupported point load field mx: apply the moment at a 3D node at the original load position'))
      .toBe('Momento no compatible con una carga puntual de barra en mx: aplicá el momento en un nodo 3D en la posición original de la carga');
  });

  it('leaves a sentence it does not know as it is', () => {
    setLocale('es');
    expect(localizeEngineText('Residual 1.2e-3 exceeds tolerance')).toBe('Residual 1.2e-3 exceeds tolerance');
  });
});
