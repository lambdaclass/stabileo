# Readiness, convergencia y las tres cosas que un detallado puede ser

**Estado: implementado y verde. Sesión del 2026-08-26, rama `feat/pro-concrete-h2` (PR #170).**

Cierra el bloque de readiness/convergencia. No toca la reubicación de comandos de F3, que quedó
cerrada en `f3-command-relocation-audit.md` — salvo una corrección de hecho en §4 de este
documento, que es de diagnóstico de CI y no de aquel trabajo.

---

## 1. El hueco, medido

`runDetailing` detalla **`readiness.detailable` y nada más**. Un elemento sin diseño verificado no
entra a `byLevel`, no está en `elementIds`, y `applicableMembers` es literalmente
`elementIds.length` (`run-detailing.ts:2251`).

Consecuencia: **las quince condiciones de constructibilidad se medían sobre el subconjunto
dibujado**. En un pórtico donde el diseño rechazó ocho columnas y verificó cuatro, las cuatro
quedaban coordinadas, sin conflictos, reverificadas y con certificado coincidente — así que el
conjunto llegaba a `CONSTRUCTIBLE`, `reviewBlockers` se vaciaba, la revisión se registraba, y el
proyecto emitía planos para construcción de un edificio cuyas columnas no tienen diseño.

Ninguna afirmación de esa cadena era falsa **sobre el dibujo**. Ninguna era sobre la estructura.

Es el mismo defecto que `constructibility.ts` se escribió para arreglar, un nivel más arriba: allá
era *"existe una asignación"* haciendo de *"esto se puede construir"*; acá es *"lo dibujado es
sólido"* haciendo de *"la estructura está diseñada"*.

Y los cuatro botones de exportación (`doc-report`, `doc-dxf`, `doc-xlsx`, `doc-3d`) no tienen gate
propio: cuelgan del estado del documento, que cuelga del estado de los conjuntos.

## 2. Las tres afirmaciones

| afirmación | pregunta | evidencia |
|---|---|---|
| **detallado técnico** | ¿hay algo que dibujar? | `detailingReadiness.ready` |
| **propuesta provisional** | ¿lo dibujado es coherente? | las quince condiciones |
| **documentación constructiva** | ¿lo dibujado es *todo* el problema? | `design-convergence.ts` |

Son tres preguntas distintas y la app necesita las tres respondidas. Por eso la solución es una
**medición y una condición número dieciséis**, no un candado sobre el comando Generar.

### Por qué el comando NO se deshabilita

Detallar un pórtico parcialmente diseñado es una operación ordinaria y necesaria: es cómo el
ingeniero ve qué le hacen los elementos rechazados al resto de la jaula. `h1e-refused-state`
asserta que el comando sigue habilitado con ocho columnas rechazadas, y tiene razón. Quitar el
dibujo no haría converger el diseño: sacaría la herramienta con la que se lo hace converger.

Lo que no puede sobrevivir al hueco es **la afirmación**.

## 3. Qué se construyó

**`lib/engine/detailing/design-convergence.ts`** (nuevo, puro). `assessDesignConvergence`
devuelve `CONVERGED` · `PROPOSAL` · `INCOMPLETE`, más los huecos **nombrados por su remedio**:

| hueco | qué significa | qué hace el ingeniero |
|---|---|---|
| `refused` | `SECTION_INADEQUATE` o `SEARCH_EXHAUSTED` | cambiar la sección |
| `unsupported` | la app no implementa una verificación requerida | nada que él pueda hacer |
| `demandUnavailable` | faltan solicitaciones, sección o material | proveerlos |
| `notDesigned` | nunca se diseñó | correr el diseño |
| `notDetailable` | diseñó bien y no se pudo dibujar (`noStations`, orientación) | otro camino |

Un `PROVISIONAL_BIAXIAL` **está** en el dibujo, así que no cuenta como faltante — pero impide
`CONVERGED`. Y **no** suma a la condición dieciséis: `certificatesMatchGeometry` ya le niega el
certificado, y contarlo dos veces reportaría un mismo faltante bajo dos nombres.

**`constructibility.ts`**: condición dieciséis `wholeModelDetailed`, sobre el fact nuevo
`undetailedModelMembers`. Veredicto degradado a **`NOT_ESTABLISHED`, nunca `CONFLICTED`**: una
columna rechazada no es una interferencia; la geometría dibujada puede estar perfecta y el remedio
es otra sección, no buscar un defecto que no existe.

**`run-detailing.ts`**: `DetailingReadiness` lleva ahora `convergence`, calculada en el mismo
loop y con la misma regla que `detailable` — dos listas construidas por reglas distintas medirían
las reglas.

**`RcConvergenceNotice.svelte`** (nuevo): la afirmación al lado del comando, antes de correrlo.
Extraído porque `RcStageTimeline` llegó a 646 líneas contra el techo de 600 — misma decisión que
`RcBarList`, `RcTitleBlockFields`, `RcBendingSchedule`, `RcEditNotice` y `RcRegenerationWarning`.
El estado se distingue por una regla en el borde **y** por la palabra, nunca sólo por el color.

## 4. La limitación que queda, declarada

`floor-design.ts` pasa `undetailedModelMembers: 0` y **dice por qué**: su población son las
familias, no los elementos de pórtico, y `allApplicableFamiliesCertified` es la condición que las
cuenta. Medir convergencia de pórtico ahí exigiría cablear los contexts y outcomes del modelo
entero a un pase que diseña losas y fundaciones.

**Lo que queda descubierto**, sin disimulo: un proyecto con losas y zapatas y un pórtico que nunca
se diseñó. Ese piso puede llegar a `CONSTRUCTIBLE` por la fuerza de su propia evidencia de
familias — que es verdadera sobre el piso y no dice nada sobre las columnas que lo sostienen. En
un proyecto que tiene los dos, los conjuntos del pórtico sí llevan la condición y el documento
toma el estado **mínimo** entre sus conjuntos, así que un pórtico no convergido retiene la
afirmación del documento igual.

## 5. CI, diagnosticado antes de tocar nada

Checks configurados: **ninguno obligatorio**. El ruleset de la organización sobre `~DEFAULT_BRANCH`
pide revisión, firma y no-force-push; **no exige status checks**. Y el PR apunta a
`feat/pro-concrete-h1`, no a `main`, así que ese ruleset ni siquiera aplica.

Checks recibidos: los seis del workflow. `bench` se saltea por su propio `if` (sólo `main`). Sin
jobs ausentes. Base sin conflictos: `h2` está exactamente sobre `h1`, 42 commits, cero divergencia.

**La cobertura E2E de un PR es sólo `@smoke`.** `E2E slow suite` y las baselines visuales están
condicionadas a `main` o a la etiqueta `run-e2e`, que este PR no tiene. `h1e-refused-state` es
`@slow`: **no corre en CI de este PR**.

Cuatro fallos, de dos orígenes distintos, verificados corriendo la base:

- **`pro-design-scopes` D1/D2/D5 (+D8 ×3, fuera de `@smoke`) — regresión de H2.** F2 hizo que el
  selector ofrezca sólo las familias que el modelo tiene (`availableDesignFamilies`), y los tests
  leían cinco filas de un proyecto vacío. Es la misma reubicación que rompió B15, arreglado en
  `4a8ff151`. Corregido actualizando el contrato: cargan un modelo con shells y assertan lo que
  siempre buscaron — el censo y los estados **antes de la corrida de diseño** — más la aserción
  que la versión de cinco filas no podía hacer: una familia que el modelo no tiene no se ofrece.

  **Corrección de hecho:** `f3-command-relocation-audit.md` §9.6.4 los registró como *heredados*.
  No lo eran. Eran rojos en `6c090835`, que es un commit de H2, y el marco de aquella auditoría
  era esa tanda — pero como estado del PR son deuda de esta rama.

- **`floor-families-document` FD-E — heredado de H1.** Verificado corriendo el spec sobre
  `feat/pro-concrete-h1`: 18 pasan, ése falla. Clickeaba `review-submit`, que `reviewBlockers`
  deshabilita desde `3f2f409c` (H1), así que el click nunca llegaba y el test quemaba sus 60 s.
  La negativa no se debilitó: se **adelantó** a `review-blockers`, con las mismas claves que
  `assembly.ts` levanta. Se lee ahí ahora, con los acuses tildados y el ingeniero cargado.

## 6. Verde, con exit code

```
npm run typecheck   → 0   (479 errores, baseline 479, ninguno nuevo)
npm run build       → 0
npm run test        → 0   (7372 pasan · 12 skip · 1 todo — 394 archivos)
```

E2E, puerto dedicado 6301:

```
detailing-convergence · h1e-refused-state · pro-design-scopes · floor-families-document
detailing · detailing-review · documents · floor-design · pro-design-workflow
pro-workflow-shell · h1b-panel-navigation · h1c-documents-flow · pro-documents-stage
pro-detailing-layout · f3-product-decisions · f3-bar-states · f3-export-log
viewer-panel-tokens · status-token-consumers · i18n-languages · rebar-workspace-open
tab-reactivation · project-restore
```

## 7. Fixtures y contratos tocados, explícitamente

| archivo | qué cambió |
|---|---|
| `constructibility-invariant.test.ts` | quince → dieciséis; `spoil.wholeModelDetailed`; `NOT_ESTABLISHED` sobre un modelo no cubierto |
| `fixture-acceptance.test.ts` | la lista por nombre incluye `wholeModelDetailed`; `rc-design-qa-8` converge y pasa |
| `transverse-mutation.test.ts` | el conteo se **lee de la corrida**, no se asume cero |
| `assembly` · `coordinate-floor` · `spacing-margin` | fact nuevo con su medición dicha |
| `h1e-refused-state.spec.ts` | un test más: el dibujo se ofrece y **no** como documentación constructiva |
| `pro-design-scopes.spec.ts` · `floor-families-document.spec.ts` | §5 |

`design-convergence.test.ts` (12) cubre los cinco casos pedidos: propuesta, verificación,
convergencia, REFUSED y regeneración — los tres últimos contra el motor real sobre
`rc-design-qa-8` con la sección de columnas hambreada a 90 × 120 mm, con las inercias
recalculadas por las mismas fórmulas que el fixture usa.

## 8. Lo que sigue

- **F3 continúa donde estaba.** Este bloque no lo tocó.
- La etiqueta `run-e2e` sobre el PR haría correr los `@slow`, incluido `h1e-refused-state`. Vale
  la pena antes de cerrar H2.
- La limitación de §4 es un candidato real para H2 o para integración, no un olvido.
