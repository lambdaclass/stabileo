# Readiness, convergencia y las tres cosas que un detallado puede ser

**Estado: implementado y verde. Sesión del 2026-08-26, rama `feat/pro-concrete-h2` (PR #170).**

Cierra el bloque de readiness/convergencia. No toca la reubicación de comandos de F3, que quedó
cerrada en `f3-command-relocation-audit.md` — salvo una corrección de hecho en §5 de este
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

## 2. La regla: convergencia por alcance seleccionado

**Definición de producto confirmada el 2026-08-26.** La convergencia se evalúa **sólo sobre las
familias que el usuario seleccionó**. No hay denominador global del modelo.

| situación | qué pasa |
|---|---|
| familia existente, no seleccionada | **no bloquea**; se nombra en `outOfScope` |
| familia seleccionada, ausente del modelo | no aporta nada — la ausencia no es faltante |
| familia seleccionada con rechazados / provisionales / no diseñados / no dibujables | **bloquea**, y nombra cuáles y por qué |
| agregar una familia al alcance | reabre el estado hasta que esa familia converja |
| quitar una familia | sale del **denominador**, no sólo de la lista de huecos |
| ninguna familia seleccionada | `EMPTY_SCOPE` — nunca un `CONVERGED` vacuo |

### Por qué el denominador es el alcance y no el modelo

La primera versión medía todos los elementos de pórtico del modelo. Estaba mal de una forma que
importa más de lo que parece: **diseñar vigas y columnas en un edificio que además tiene losas es
un trabajo completo y legítimo**, y un denominador global lo declaraba permanentemente no
convergido por losas que nadie pidió diseñar. Una gate que nunca se puede satisfacer es una gate
que la gente aprende a esquivar.

Lo que mantiene honesta la afirmación que **sí** pasa no es un denominador más grande: es que la
afirmación **nombra su alcance**. `CONSTRUCTIBLE` nunca aparece sin calificar.

## 3. Las tres afirmaciones

| afirmación | pregunta | evidencia |
|---|---|---|
| **detallado técnico** | ¿hay algo que dibujar? | `detailingReadiness.ready` |
| **propuesta provisional** | ¿lo dibujado es coherente? | las condiciones de constructibilidad |
| **documentación constructiva** | ¿el alcance dibujado está completo, y cuál es? | `design-convergence.ts` |

### Por qué el comando NO se deshabilita

Detallar un pórtico parcialmente diseñado es una operación ordinaria y necesaria: es cómo el
ingeniero ve qué le hacen los elementos rechazados al resto de la jaula. `h1e-refused-state`
assertea que el comando sigue habilitado con ocho columnas rechazadas, y tiene razón. Quitar el
dibujo no haría converger el diseño: sacaría la herramienta con la que se lo hace converger.

Lo que no puede sobrevivir al hueco es **la afirmación**.

## 4. Qué se construyó

**`lib/engine/detailing/design-convergence.ts`** (nuevo, puro). `assessDesignConvergence` recibe
los miembros con su familia, el **alcance vigente** y lo que se va a dibujar, y devuelve
`CONVERGED` · `PROPOSAL` · `INCOMPLETE` · `EMPTY_SCOPE`, más `scope`, `outOfScope` y los huecos
**nombrados por familia y por remedio**:

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

**`constructibility.ts`**: condición dieciséis **`selectedScopeDetailed`**, sobre el fact
`undetailedScopeMembers`. Veredicto degradado a **`NOT_ESTABLISHED`, nunca `CONFLICTED`**: una
columna rechazada no es una interferencia; la geometría dibujada puede estar perfecta y el remedio
es otra sección, no buscar un defecto que no existe. Un `EMPTY_SCOPE` reporta **uno**, no cero —
un pase vacuo es exactamente la falsa completitud que la gate existe para negar.

**`run-detailing.ts`**: `DetailingReadiness` lleva `convergence`, calculada en el mismo loop y con
la misma regla que `detailable`. `scope` por defecto es el par de pórtico
(`DEFAULT_DESIGN_FAMILIES`), que es exactamente lo que esta función siempre detalló, así que todo
llamador existente conserva su comportamiento.

**`detailing-project-inputs.ts`**: `currentReadiness()` — la selección entra ahí, desde
`designRunStore.familySelection`, que es el mismo array que la barra de comandos declara y las
casillas tildan. Un segundo origen para el alcance es cómo una corrida termina reportando una
cobertura que no tuvo. Y `presentFloorFamilies()`, porque una losa **no** es un `MemberContext`:
sin eso el calificador quedaría vacío en el edificio exacto para el que existe.

**`document-model.ts` + `document-render.ts`**: el documento lleva `scope` y `outOfScope`, y
`scopeStatement()` los estampa en **las tres exportaciones**. El reporte lo imprime en el banner,
la planilla lo lleva en su rótulo, y la lámina DXF lo recibe como nota — porque es la salida más
probable de llegar sola a una obra. Un documento sin información de alcance dice **`ALCANCE NO
DECLARADO`**, no todas las familias: un set que no nombra ninguna es visiblemente incorrecto; uno
que las reclama todas en silencio, no.

**`RcConvergenceNotice.svelte`**: la afirmación al lado del comando, con sus familias, antes de
correrlo. El estado se distingue por una regla en el borde **y** por la palabra, nunca sólo por el
color.

### Presupuesto de líneas

`RcStageTimeline` llegó a 646 contra el techo de 600 → salió `RcConvergenceNotice`.
`detailing.svelte.ts` llegó a 843 contra el de 800 → salieron `currentReadiness` y
`buildProjectDocument` a `detailing-project-inputs.ts`. Quedaron en 573 y 793.

## 4 bis. La limitación que queda, declarada

`floor-design.ts` pasa `undetailedScopeMembers: 0` y **dice por qué**: el alcance de ese pase son
las familias de piso, y `allApplicableFamiliesCertified` + `noStaleFamilyCertificate` ya las
cuentan, por familia y contra lo aplicable. Importar ahí el faltante del pórtico sería que una
condición falle por algo fuera de su sujeto.

Lo que cubre el faltante del pórtico en un proyecto mixto es que el documento toma el estado
**mínimo** entre sus conjuntos, más el calificador `outOfScope` en cada exportación.

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
npm run test        → 0   (7391 pasan · 12 skip · 1 todo — 394 archivos)
```

E2E, puerto dedicado 6301, todos en verde:

```
detailing-convergence (14)  · h1e-refused-state · pro-design-gates · pro-panel-consistency
pro-panel-structure         · pro-design-scopes · pro-workflow-shell · documents · detailing
detailing-review            · floor-design · floor-families-document · pro-documents-stage
h1b-panel-navigation        · h1c-documents-flow · i18n-languages · concrete-copy-contrast
f3-member-list              · f3-bar-states
                                                          → 214 pasan, 0 fallan
```

Idiomas: en · es · pt, sobre la afirmación **y sobre los nombres de familia** — una frase que
traduce el verbo e imprime `column` para el sustantivo es el estado a medias que
`i18n-coverage-gap.md` describe. Anchos: 1280 · 1024 · 900 · 820, midiendo que el párrafo nuevo
no desborde la franja *sticky* ni el viewport.

**CI del commit anterior (`4af3eb5c`): los seis checks en verde, e2e incluido (18 m).** Los cuatro
rojos de §5 quedaron cerrados en CI real, no sólo localmente.

## 7. Fixtures y contratos tocados, explícitamente

| archivo | qué cambió |
|---|---|
| `constructibility-invariant.test.ts` | quince → dieciséis; `spoil.selectedScopeDetailed`; `NOT_ESTABLISHED` sobre un alcance no cubierto |
| `fixture-acceptance.test.ts` | la lista por nombre incluye `selectedScopeDetailed`; `rc-design-qa-8` converge y pasa |
| `transverse-mutation.test.ts` | el conteo se **lee de la corrida**, no se asume cero |
| `assembly` · `coordinate-floor` · `spacing-margin` | fact nuevo con su medición dicha |
| `document-render.test.ts` | el helper `doc()` declara alcance; nueve casos de la regresión 7 |
| `document-liveness.test.ts` | lee la **capa** de store, que es lo que su propia nota decía que la aserción significaba |
| `h1e-refused-state.spec.ts` | un test más: el dibujo se ofrece y **no** como documentación constructiva |
| `pro-design-scopes.spec.ts` · `floor-families-document.spec.ts` | §5 |

### Las ocho regresiones pedidas

| # | caso | dónde |
|---|---|---|
| 1 | vigas/columnas convergidas, losas existentes no seleccionadas | `design-convergence.test.ts` §1 |
| 2 | agregar losas al alcance reabre el estado | §2 |
| 3 | quitar una familia la saca del denominador | §3 |
| 4 | familia ausente no aporta nada | §4 |
| 5 | familia seleccionada con rechazados | §5 + motor real sobre `rc-design-qa-8` hambreado |
| 6 | familia seleccionada con provisionales | §6 |
| 7 | exportación que declara exactamente las familias | `document-render.test.ts` |
| 8 | edición posterior que des-completa **sólo** el alcance afectado | §8 |

Más, contra el motor real: la corrida sin hambrear converge sobre el alcance de pórtico; la
hambreada queda `INCOMPLETE` con huecos `refused` **todos de familia `column`**; un alcance
sólo-vigas **converge sobre ese mismo modelo hambreado**, nombrando las columnas que no cubre; el
comando sigue habilitado; y regenerar con la sección restaurada vuelve a converger.

## 7 bis. La deuda de contraste de H2, cerrada de paso

`concrete-copy-contrast` estaba en 7 rojos, registrados como heredados. **No eran de H1**:
`205f40b1` es de esta rama. Medidos y arreglados, todos a un token de distancia:

| sitio | qué medía | ahora |
|---|---|---|
| `.row-id` · `.row-state` de `RcMemberList` | 3,62 contra 4,5 | `--st-text-2` |
| `.bar-id` · `.owners` de `RcBarList` | 3,74 contra 4,5 | `--st-text-2` |
| `h5` de `RcMemberList`, `.codes-head` de `RcTitleBlockFields` | 3,74 | `--st-text-2` |

El séptimo era distinto y vale escribirlo: `.sub` de `RcSubStage` es un **contenedor**, no copia.
No declara color, hereda `--st-text`, y `.pro-panel .sub` lo empezó a encontrar primero cuando
F2.1 metió el paso de pisos adentro de DISEÑAR — la misma reubicación que se llevó B15 y
`pro-design-scopes`, en su tercera forma. El auditor tenía razón y el componente también: la
colisión era el nombre de la clase. Renombrado a `.substage`, sin lista de excepciones.

`--st-text-3` es el token de lo **inactivo** — un control deshabilitado, un cursor que no apunta a
nada. Un id de elemento es lo que un fabricante lee para encontrar la barra en la planilla; el
tamaño lleva la jerarquía, el contraste no tiene por qué.

## 8. Lo que sigue

- **F3 continúa donde estaba.** Este bloque no lo tocó, ni la reubicación de comandos ya cerrada.
- La etiqueta `run-e2e` sobre el PR haría correr los `@slow`, incluido `h1e-refused-state`, que
  **no corre en CI de un PR**. Vale la pena antes de cerrar H2.
- La limitación de §4 bis es un candidato real para H2 o para integración, no un olvido.
