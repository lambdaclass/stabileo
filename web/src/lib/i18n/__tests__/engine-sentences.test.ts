/** The solver writes its errors in English; the app shows them in its own language. */
import { describe, it, expect, afterAll } from 'vitest';
import { localizeEngineText } from '../engine-text';
import { requireMaterialDensity } from '../../section/weight';
import { errorText } from '../../utils/error-text';
import { ensureLocale, OFFERED_LOCALES, setLocale, t } from '../index';
import { axesStore } from '../../axes/axes.svelte';
import { globalAxes } from '../../features';

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

  it('translates a negative shell self-weight density refusal', () => {
    setLocale('es');
    expect(localizeEngineText('Parse error: Mass density must be finite and nonnegative'))
      .toBe('Parse error: La densidad de masa debe ser finita y no negativa');
  });

  it('#2100 explains a failed P-Delta equilibrium check in the active language', async () => {
    await setLocale('es');
    const message = 'P-Delta results were withheld because the physical free-DOF residual did not meet the requested tolerance.';
    const refusal = JSON.stringify({ message, structuredDiagnostics: [{ code: 'result_quantity_unavailable', severity: 'error' }] });
    expect(localizeEngineText(errorText(refusal, 'Unknown error')))
      .toBe('Se retuvieron los resultados de P-Delta porque el residuo físico en los grados de libertad libres no cumplió la tolerancia solicitada.');
  });

  it('translates an out-of-plane nodal refusal and keeps the field name', async () => {
    await setLocale('es');
    const message = 'Parse error: out-of-plane nodal component `mx`';
    expect(localizeEngineText(message))
      .toBe('Parse error: Esta componente está fuera del plano de la carga nodal. Use nodal3d para cargas espaciales. `mx`');
  });

  it('translates a reduced stiffness rank refusal by diagnostic code', async () => {
    await setLocale('es');
    const refusal = JSON.stringify({
      message: 'The reduced stiffness rank cannot be resolved at assembly precision.',
      structuredDiagnostics: [{ code: 'reduced_stiffness_rank', severity: 'error' }],
    });
    expect(localizeEngineText(errorText(refusal, 'Unknown error')))
      .toBe('El rango de la rigidez reducida no se puede determinar con la precisión del ensamblaje. Revisá las liberaciones, los apoyos, los resortes y las restricciones para detectar un mecanismo.');
  });

  it('requires the rank code to localize unfamiliar rank causes', async () => {
    await setLocale('es');
    const message = 'Independent motion at node 42 needs verification.';
    const envelope = (code: string) => JSON.stringify({
      message,
      structuredDiagnostics: [{ code, severity: 'error' }],
    });
    expect(localizeEngineText(errorText(envelope('reduced_stiffness_rank'), 'Unknown error')))
      .toBe('El rango de la rigidez reducida no se puede determinar con la precisión del ensamblaje. Revisá las liberaciones, los apoyos, los resortes y las restricciones para detectar un mecanismo. ' + message);
    expect(localizeEngineText(errorText(envelope('result_quantity_unavailable'), 'Unknown error'))).toBe(message);
    expect(localizeEngineText(message)).toBe(message);
  });

  it('translates a coded rank refusal and retains an unrecognized cause', async () => {
    await setLocale('es');
    const cause = 'Check node 42 before continuing.';
    const message = 'The reduced stiffness rank cannot be resolved at assembly precision. ' + cause;
    const refusal = JSON.stringify({ message, structuredDiagnostics: [{ code: 'reduced_stiffness_rank', severity: 'error' }] });
    expect(localizeEngineText(errorText(refusal, 'Unknown error')))
      .toBe('El rango de la rigidez reducida no se puede determinar con la precisión del ensamblaje. Revisá las liberaciones, los apoyos, los resortes y las restricciones para detectar un mecanismo. ' + cause);
  });

  it('translates the affected nodes and guidance in coded and plain constraint rank diagnoses', async () => {
    await setLocale('es');
    const cause = 'the structure is a mechanism or so close to one that its stability cannot be decided in double precision at nodes [2, 3]: constraint reduction cancels stiffness contributions whose rounding is too large to resolve the remaining stiffness; reduce extreme stiffness contrasts or revise the constraints';
    const refusal = JSON.stringify({ message: cause, structuredDiagnostics: [{ code: 'reduced_stiffness_rank', severity: 'error' }] });
    const translated = 'La reducción de las restricciones cancela aportes de rigidez en los nodos [2, 3]. El redondeo impide determinar la rigidez restante. Reducí los contrastes extremos de rigidez o revisá las restricciones.';
    for (const text of [refusal, cause]) expect(localizeEngineText(text)).toBe(translated);
    expect(localizeEngineText(cause.replace(' at nodes [2, 3]', '')))
      .toBe(translated.replace(' en los nodos [2, 3]', ''));
  });

  it('localizes proven axial joint freedom and keeps the joint identifier', async () => {
    await setLocale('es');
    const message = 'the structure is a mechanism at nodes [2]: a translation of this joint leaves all attached trusses unstrained and satisfies the restraints';
    const refusal = JSON.stringify({
      message,
      structuredDiagnostics: [{ code: 'reduced_stiffness_rank', severity: 'error', nodeIds: [2] }],
    });
    expect(localizeEngineText(errorText(refusal, 'Unknown error')))
      .toBe('Hay un mecanismo en el nudo 2. El nudo puede desplazarse sin deformar las barras articuladas conectadas ni violar las restricciones.');
  });

  it('localizes the proven axial displacement components in every offered language (#2608)', async () => {
    for (const locale of OFFERED_LOCALES) {
      setLocale(locale);
      await ensureLocale(locale);
      const cause = 'the structure is a mechanism at nodes [2]: a translation of this joint leaves all attached trusses unstrained and satisfies the restraints';
      const message = cause + ' (displacement components: X, Z)';
      const coded = JSON.stringify({
        message,
        structuredDiagnostics: [{ code: 'reduced_stiffness_rank', severity: 'error', nodeIds: [2], message }],
      });
      for (const text of [message, coded]) {
        const translated = localizeEngineText(text);
        expect(translated, locale).toContain(localizeEngineText(cause));
        expect(translated, locale).toContain(t('kin.dof3dUx'));
        expect(translated, locale).toContain(t('kin.dof3dUz'));
        expect(translated, locale).not.toContain(t('kin.dof3dUy'));
        expect(translated, locale).not.toContain('{components}');
      }
    }
  });

  it('uses the active axes for a proven axial displacement component', async () => {
    setLocale('en');
    await ensureLocale('en');
    try {
      axesStore.choice = { up: '-Y', right: '+X', hand: 'right' };
      const message = 'the structure is a mechanism at nodes [2]: a translation of this joint leaves all attached trusses unstrained and satisfies the restraints (displacement components: Z)';
      const [vertical, other] = globalAxes() ? ['Y', 'Z'] : ['Z', 'Y'];
      expect(localizeEngineText(message)).toContain(`displacement in ${vertical}`);
      expect(localizeEngineText(message)).not.toContain(`displacement in ${other}`);
    } finally {
      axesStore.reset();
    }
  });

  it('localizes the proven released frame swing', async () => {
    await setLocale('es');
    const message = 'the structure is a mechanism at nodes [2]: a frame can swing about a released end without straining its members or moving its restraints';
    const refusal = JSON.stringify({
      message,
      structuredDiagnostics: [{ code: 'reduced_stiffness_rank', severity: 'error', nodeIds: [2] }],
    });
    const modalRefusal = 'MODAL-MECHANISM: ' + JSON.stringify({
      message: `Modal analysis: ${message}. The swing moves node 2 along ux. No modes are returned.`,
      structuredDiagnostics: [{ code: 'reduced_stiffness_rank', severity: 'error', nodeIds: [2], phase: 'modal', message }],
    });
    for (const text of [message, refusal, modalRefusal]) {
      expect(localizeEngineText(text)).toBe('Hay un mecanismo en el nudo 2. Una barra puede girar alrededor de un extremo liberado sin deformarse ni mover sus restricciones.');
    }
  });

  it('translates the plain reduced stiffness rank sentence', async () => {
    await setLocale('es');
    const message = 'The reduced stiffness rank cannot be resolved at assembly precision. Check member releases, supports, springs and constraints for a mechanism.';
    const reason = 'the structure is a mechanism or so close to one that its stability cannot be decided in double precision: ';
    for (const text of [message, reason + message[0].toLowerCase() + message.slice(1)]) {
      expect(localizeEngineText(text))
        .toBe('El rango de la rigidez reducida no se puede determinar con la precisión del ensamblaje. Revisá las liberaciones, los apoyos, los resortes y las restricciones para detectar un mecanismo.');
    }
  });

  it('renders the English rank sentence once', async () => {
    await setLocale('en');
    const message = 'The reduced stiffness rank cannot be resolved at assembly precision. Check member releases, supports, springs and constraints for a mechanism.';
    const refusal = JSON.stringify({ message, structuredDiagnostics: [{ code: 'reduced_stiffness_rank', severity: 'error' }] });
    expect(localizeEngineText(refusal)).toBe(message);
  });

  it('leaves a sentence it does not know as it is', () => {
    setLocale('es');
    expect(localizeEngineText('Residual 1.2e-3 exceeds tolerance')).toBe('Residual 1.2e-3 exceeds tolerance');
  });
});

it('translates the whole unknown-field diagnostic in Spanish', async () => {
  await setLocale('es');
  expect(localizeEngineText('Parse error: unknown field `methdo`, expected one of `id`, `method`, `factors` at line 4 column 8'))
    .toBe('Error de análisis: Campo desconocido methdo. Campos permitidos: `id`, `method`, `factors`. (línea 4, columna 8)');
  expect(localizeEngineText('Parse error: Error: unknown field `fram`, expected `frame`'))
    .toBe('Error de análisis: Campo desconocido fram. Campos permitidos: `frame`.');
  expect(localizeEngineText('unknown field `fram`, expected `frame`'))
    .toBe('Campo desconocido fram. Campos permitidos: `frame`.');
  expect(localizeEngineText('unknown field `fram`')).toBe('Campo desconocido fram.');
});

it('translates the whole missing-field diagnostic in Spanish', async () => {
  await setLocale('es');
  expect(localizeEngineText('Parse error: missing field `method` at line 4 column 8'))
    .toBe('Error de análisis: Falta el campo method o su valor no es compatible. (línea 4, columna 8)');
  expect(localizeEngineText('Parse error: Error: missing field `method`'))
    .toBe('Error de análisis: Falta el campo method o su valor no es compatible.');
});

it('known wrong result: #2595 — an Italian P-Delta refusal explains why no result was supplied', async () => {
  await setLocale('it');
  const message = 'P-Delta results were withheld because the physical free-DOF residual did not meet the requested tolerance.';
  const refusal = JSON.stringify({ message, structuredDiagnostics: [{ code: 'result_quantity_unavailable', severity: 'error' }] });
  expect(localizeEngineText(errorText(refusal, 'Unknown error')))
    .toBe('I risultati P-Delta non sono stati forniti perché il residuo fisico dei gradi di libertà liberi non rispettava la tolleranza richiesta.');
});

it('retains the Italian density and non-finite input refusals', async () => {
  await ensureLocale('it');
  await setLocale('it');
  expect(requireMaterialDensity(7, { rho: 0 })).toBe(0);
  expect(() => requireMaterialDensity(7, { rho: -1 })).toThrow('Inserisci una densità (rho) finita e non negativa per il materiale 7 (ricevuto -1).');
  expect(localizeEngineText('Mass density must be finite and nonnegative')).toBe('La densità di massa deve essere finita e non negativa');
  expect(localizeEngineText('Non-finite number (NaN) at input.E')).toBe('Inserisci un numero finito per input.E (ricevuto NaN).');
});
