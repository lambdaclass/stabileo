# Los comandos del pipeline y la etapa a la que pertenecen — auditoría y retoma

> **Documento de retoma.** Leer §A antes de tocar nada.

---

## §A — Cómo retomar

**Rama:** `feat/pro-concrete-h2` · **PR:** [#170](https://github.com/lambdaclass/stabileo/pull/170) (draft)
**HEAD esperado:** `4a8ff151` · **39 commits** sobre `feat/pro-concrete-h1` · **árbol limpio**

```bash
cd web
git status --porcelain          # debe estar vacío
git log --oneline -1            # 4a8ff151 test(design): B15 asserts against the scroller …
NODE_OPTIONS="--max-old-space-size=4096" npm run typecheck   # baseline 479, sin nuevos
```

> **Aviso de entorno.** `NODE_OPTIONS` traía un `--require` de un preload que ya no existe, y
> cualquier `npx vitest` / `npx playwright` muere con `MODULE_NOT_FOUND` antes de arrancar.
> Correrlos con `NODE_OPTIONS=""` delante. `npm run typecheck` sí necesita su
> `--max-old-space-size=4096`.

**La reubicación F3 está completa: pasos 1 a 5, todos verdes** (§7). El paso 5 resolvió que
`cmd-open-3d` **se queda** en `DesignToolbar` —es una herramienta transversal del visor, no una
acción del pipeline— y que `cmd-group-detailing` por lo tanto no se retira. Ver §7.5.

**Los once objetivos de Detalle están hechos y verdes, y los cinco contratos que estaban
escritos sin consumidor están conectados** (§9.6.1, con la tabla de qué los llama). §8 está
cerrado: 1-4 en §9, el 5 en §9.8, 6 a 11 en §9.6.

**Antes de tocar Detalle, leer §9.6.2.** Son las decisiones de producto que él fijó, y una de
ellas corrigió lo que esta rama había construido: **fijar congela el MIEMBRO, no la barra**. Las
otras cuatro —longitud real en la planilla, normas del rótulo no editables, aviso antes de
regenerar, y qué dice Documentos— están ahí con sus porqués.

**Lo próximo NO es otro objetivo de §8.** Lo único que queda para declarar H2 completo es el
endurecimiento de readiness/convergencia (§7.6), que sigue sin empezar: es un cambio de
comportamiento con su propio radio y rompe fixtures que detallan modelos no convergidos a
propósito. Antes de tocarlo, leer §9.6.3 — el store de detalle tocó su techo de 800 líneas tres
veces en esta tanda y las tres se resolvió extrayendo, que es lo que la propia gate manda.

**Los rojos preexistentes B15 y B9 quedaron arreglados en `4a8ff151`, aparte** — confirmados en
árbol limpio en `6c090835`, antes de esta serie. Ver §9.6.4: es la cuarta vez que la serie hereda
un rojo.

### Reglas vigentes de la rama

No tocar H1, solver, Rust, Cargo ni WASM. Sin snapshots ni timeouts inflados. Playwright con
`E2E_PORT` dedicado, **nunca 4173**. Commits y descripción del PR en inglés. PR en draft. Árbol
limpio después de cada bloque. **No declarar H2 completo** hasta que Detalle cubra de verdad
edición, verificación, convergencia y documentación.

### Método que ya se pagó caro tres veces

1. **Cuando una spec falla después de un cambio, correrla PRIMERO en el árbol limpio.** D7 se
   diagnosticó al revés y costó revertir un movimiento entero que estaba bien. Ver §7.3.
2. **Correr el archivo de spec completo**, no el test que se está mirando. Cinco fallas de F2.2
   vivieron cuatro commits por saltear esto.
3. **No empezar una tanda que no se pueda terminar.** Commitear rojo y revertir a medias son las
   dos peores salidas, y las dos aparecieron por arrancar sin margen.
4. **Después de cada fase, correr `pro-panel-consistency` y `pro-panel-structure`**, no sólo las
   specs del área tocada. Una regresión de F1 vivió un commit entero por saltearlas.
5. **Un rojo preexistente no se hereda en silencio.** El paso 4 encontró dos, el objetivo 5 uno
   más, y los objetivos 6-11 dos (§9.6.4). Los cinco se confirmaron en árbol limpio antes de
   tocarlos —haciendo checkout del commit anterior a la tanda, no razonando sobre el diff— y se
   arreglaron en commits propios. Ver §7.7 y §9.6.4. Si una tanda termina con rojos, van acá.
6. **Correr los auditores transversales, no sólo las specs del área.** Esta tanda hizo fallar dos
   que nadie hubiera corrido: `h1c-documents-flow` mide el contraste de TODA copia nueva en
   Documentos, y `concrete-design-raw-colours` no deja crecer la deuda de colores crudos. Las dos
   fallaron por una línea de CSS copiada de la de al lado. Están en §9.7.

---

## §B — Estado por fase

| fase | estado | qué falta |
|---|---|---|
| **F0** contratos | ✅ 6 commits | — |
| **F1** franja de etapas | ✅ | — |
| **F2** etapa Diseñar | ✅ 2 commits | — |
| **F2.6** persistencia | ✅ | — |
| **Semántica de Diseñar** | ✅ `4ab876b5` | — |
| **F3 · reubicación** | ✅ **pasos 1-5 completos** | — |
| **F3 · Detalle** | ✅ **1-11 completos + decisiones de producto** | §9, §9.6, §9.6.2, §9.8 |
| **Readiness / convergencia** | ⛔ bloque separado, sin empezar | §7.6 |

### Commits de esta rama, en orden

```
88a986e0  docs: architecture audit and the H1/H2 scope split
8ef0f8d3  refactor(store): detailing readings leave the store + ceiling gate
686c616a  feat(flow): one stage vocabulary  (rc-stages.ts)
866ac7e5  feat(flow): selection vocabulary  (rc-selection.ts)
db2469ec  feat(flow): ExportRecord as separate state
3578a870  feat(flow): raw forces report contract
60d3fea3  feat(store): persist exports + manual-edit provenance
83d4c544  feat(pro): RcStageTimeline — five stages, sticky        ← F1
5059f378  refactor(pro): ProDesignTab inside DISEÑAR; floors sub-step  ← F2.1
d6f0b0b5  feat(pro): one design command, visible scope             ← F2.2
379de82b  fix(design): family run report reappears
4c283241  feat(pro): compute-demands → strip                       ← paso 1
2ba3429f  feat(pro): required steel → strip, stops calling itself a check  ← paso 2
ed23650d  feat(pro): design command + scope → strip                ← paso 3
a4198d0e  feat(detailing): a bar is named by its mark              ← F3a
d63ea5f6  docs: command relocation audit
660127e9  refactor(flow): extract pipeline actions (rc-commands.ts)
4ab876b5  fix(flow): DISEÑAR completes on convergence
3dd46033  docs: audit generate-detailing
76e9180c  test(detailing): D7 asserts the review gate's current contract
de46378c  docs: the audit becomes the resume document for H2
559127e0  test(i18n): the command row expects the label required steel carries  ← rojo del paso 2
a4d3a7c1  feat(pro): detailing command + prerequisites + auto → strip   ← paso 4
dfd40456  docs: step 4 done, and four things the audit had wrong
5983ce7f  feat(pro): the 3-D viewer stays on the Design row             ← paso 5
065a78e5  feat(flow): rc-member-list.ts — el censo de la lista          ← obj. 1-2, modelo
205f40b1  feat(pro): RcMemberList.svelte — la lista agrupada            ← obj. 1-2, UI
d1d6ae83  feat(pro): a row selects that member, and the viewer shows it ← obj. 3
fcbc422d  feat(pro): a member picked in the viewer is the one the list points at  ← obj. 4
1bc40fdc  docs: objectives 1-4 of Detalle are done
db929428  test(floor): F6 and F10 assert the review gate's current contract  ← rojo preexistente
6afe56d2  feat(detailing): a bar says what state it is in, and a conflict names bars  ← obj. 5
6c090835  docs: objective 5 is done, and the three decisions that shaped it
b5fb8df2  feat(detailing): a pinned bar says which members it froze          ← obj. 6
2229286c  feat(detailing): the sheets carry the concrete they draw steel for ← obj. 7
b967b882  feat(detailing): a sheet says which works it belongs to            ← obj. 8
a6735297  feat(detailing): the Shape column becomes a bending diagram        ← obj. 9
933b2f5e  feat(detailing): an edit reaches the detailing it invalidates      ← obj. 10
f52857d9  feat(documents): every export records itself, and its hand edits   ← obj. 11
4a8ff151  test(design): B15 asserts against the scroller the layout has      ← rojo preexistente
```

---

## 0. Las tres formas de esconder un comando, aprendidas de a una

Cada paso destapó una y **ninguna la encontré leyendo el código**: las cazaron gates que ya
existían. Quedan escritas porque `generate-detailing` las va a tener las tres a la vez.

1. **Detrás de un disclosure cerrado.** Mover el botón *dentro* de la etapa lo pone tras un
   `<details>` colapsado. Cuatro travesías E2E dejaron de alcanzarlo — y un usuario también.
   *Por eso los comandos viven en la franja, no en la sección.*
2. **Detrás de una condición de render.** Enganchar la fila a "la etapa actual" lo hacía
   desaparecer sin modelo resuelto; engancharla a "la etapa incompleta" hacía desaparecer *acero
   requerido* en el instante en que se volvía usable, porque calcular solicitaciones completa la
   etapa. *Por eso la fila es incondicional y cada comando se deshabilita explicándose.*
3. **Debajo de otro sticky.** La franja estaba en `z-index: 3` y los encabezados de sección
   también son sticky (S5 lo exige). Dos stickies en la misma capa pintan por orden de documento,
   así que un encabezado tapaba los comandos: un click en el centro exacto del botón aterrizaba
   en el encabezado. *La franja está en 12; el diálogo de lámina ampliada sigue en 950.*


Es el paso que la instrucción de F3 pide antes de editar: *"auditá todos los consumidores, testids
y accesos; identificá qué acciones necesitan estar disponibles en más de una etapa; evitá
duplicar comandos o crear dos fuentes de verdad"*.

---

## 1. Dónde están hoy, y por qué es un problema

Los once comandos viven en `DesignToolbar.svelte`, que `ProDesignTab` monta y que F2 metió
**dentro de la etapa Diseñar**. Así que la franja dice cinco etapas y las acciones de las cinco
están en una.

No es un problema estético y ya se manifestó: navegar a **Detalle** por la franja **cierra la
etapa Diseñar**, que es la que contiene `cmd-generate-detailing` — el comando que Detalle
necesita. La spec de F3a tuvo que abrir el disclosure directamente para esquivarlo.

| grupo actual | comandos | etapa a la que pertenece |
|---|---|---|
| `cmd-group-verify` | `cmd-compute-demands` | **Reglamentos** — las solicitaciones salen del cálculo, y §1 exige separarlas del diseño |
| | `cmd-code-check` | **Diseñar** — verificar armaduras es lo que *termina* la etapa, no un paso previo |
| `cmd-group-design` | `cmd-autodesign`, `cmd-autodesign-menu`, `cmd-autodesign-undesigned` | **Diseñar** ✅ ya está |
| | `cmd-design-all`, `cmd-design-scope` | **Diseñar** ✅ ya está |
| `cmd-group-detailing` | `cmd-generate-detailing` | **Detalle** |
| | `cmd-open-3d` (+ `-count`, `-error`) | **varias** — ver §3 |
| | `cmd-cancel` | **Diseñar** — cancela `designRunStore` |

`cmd-code-check` es el que más cambia de sentido al mudarse: hoy está en el grupo *Verificar*,
antes del grupo *Diseñar*, y eso repite en la barra de comandos exactamente la afirmación que F1
sacó de la franja — verificación antes de que exista armadura.

---

## 2. Radio de impacto, medido

| comando | refs en E2E | specs |
|---|---:|---:|
| `cmd-generate-detailing` | **47** | **28** |
| `cmd-design-all` | 22 | 8 |
| `cmd-open-3d` | 14 | 5 |
| `cmd-code-check` | 5 | 5 |
| `cmd-compute-demands` | 5 | 4 |
| `cmd-autodesign` | 4 | 2 |
| `cmd-cancel` | **0** | **0** |

Dos lecturas que importan:

- **`cmd-generate-detailing` es el más caro de mover y el que más lo necesita.** 28 specs lo
  tocan, y es justamente el comando cuya etapa no lo contiene. Mover el botón sin mover el testid
  no rompe nada: lo que cambia es **de qué disclosure cuelga**, y las specs que abren Diseñar
  antes de buscarlo seguirán encontrándolo sólo si Detalle está abierta. Hay que revisarlas una
  por una, no en lote.
- **`cmd-cancel` no tiene un solo test.** Cancela una corrida de diseño y nadie lo ejercita. Es
  un hallazgo aparte de esta reubicación y vale anotarlo.

---

## 3. Lo que sí tiene que estar en más de una etapa

**Abrir el visor 3-D**, y ya está resuelto correctamente. Cuatro entradas —`DesignOverview`,
`DesignToolbar`, `DocumentsSection` y `ProRibbon`— y **una sola función**: `openRebar3D` en
`lib/store/rebar-open.ts`. Los propios comentarios del árbol lo dicen: *"All of them call
`openRebar3D`, so the cage on screen is a projection of one document instance — three ways in,
one thing that happens. A fourth viewer is exactly what this must not be."*

Eso es el patrón a repetir para cualquier otro comando que necesite dos puntos de acceso: **una
función compartida, varios botones**, nunca dos implementaciones. No es duplicar un comando; es
una operación con varias puertas.

Ningún otro comando de la lista necesita más de una etapa.

---

## 4. El obstáculo real, y por qué no lo moví en este bloque

Los handlers **no son propiedades sueltas**. `ProDesignTab` los envuelve:

```ts
onComputeDemands={() => { diagnosticsWarning.arm(); designRunStore.computeDemands(); }}
onCodeCheck={()      => { diagnosticsWarning.arm(); designRunStore.runCodeCheck(); }}
```

`diagnosticsWarning` es estado local de `ProDesignTab`. Un botón mudado a la etapa Reglamentos que
llamara sólo a `designRunStore.computeDemands()` **perdería el armado del aviso de diagnósticos**
— un cambio de comportamiento silencioso, del tipo que esta rama viene evitando.

Y `generateDetailing` y `open3d` no son props en absoluto: son funciones internas de
`DesignToolbar`, con su lógica de prerrequisitos (`detailing-prerequisites`, `detailing-auto`)
alrededor.

**Entonces la reubicación no es mover markup: es extraer las acciones a un lugar que las cinco
etapas puedan alcanzar.** El orden correcto es:

1. **Extraer las acciones** a un módulo de comandos —`lib/flow/rc-commands.ts` o un store fino—
   que envuelva `diagnosticsWarning`, los prerrequisitos y las llamadas al store. Sin mover
   ningún botón todavía. Verificable con la suite actual completa: nada debe cambiar en pantalla.
2. **Mudar `cmd-compute-demands`** a Reglamentos. Es el más barato (5 refs / 4 specs) y el de
   semántica más clara.
3. **Mudar `cmd-code-check`** a Diseñar, junto al comando de diseño. Cierra en la barra la misma
   afirmación que F1 cerró en la franja.
4. **Mudar `cmd-generate-detailing`** a Detalle. El caro: 28 specs, una por una.
5. **Retirar los tres `cmd-group-*`** cuando queden vacíos o con un solo comando; el agrupador
   dejó de tener sentido cuando cada etapa contiene lo suyo.

Cada paso es un commit y cada uno corre la lista de gates completa.

---

## 5. Lo que no hay que hacer

- **No dejar el mismo comando en dos etapas** "por compatibilidad". Un comando en dos lugares es
  dos fuentes de verdad sobre qué está permitido, y es lo que ya pasó con `cmd-design-all` y
  `cmd-design-families` en F2.
- **No dejar la barra completa donde está y agregar atajos** en las otras etapas: mismo problema.
- **No mover el testid junto con el botón.** Los testids son el contrato con 28 specs; lo que se
  muda es de qué disclosure cuelgan.
- **No borrar specs para evitar migrarlas.** `cmd-cancel` ya demuestra qué pasa cuando un comando
  no tiene ninguna.


---

## 6. Paso 4 — `generate-detailing`, auditado

### 6.1 Las 28 specs, clasificadas por CÓMO llegan al comando

Es el dato que cambia el plan. La estimación anterior —"28 specs, una por una"— asumía que
habría que migrarlas. **No hace falta:**

| cómo alcanzan el comando | specs |
|---|---:|
| abren `detailing-disclosure` y después lo presionan | **27** |
| lo presionan sin abrir nada (tras `cmd-design-all`) | **1** — `rc-cad-production-download` |

Ninguna llega por la etapa Diseñar. Y ninguna de las dos vías se rompe si el comando se muda a la
**franja**, porque la fila de acciones es **incondicional**: abrir un disclosure es inofensivo, y
la que no abre ninguno ya presiona `cmd-design-all`, que vive en la franja desde el paso 3.

**Migraciones de spec estimadas: cero.** Lo que hay que verificar es que el testid siga
resolviendo a un único elemento visible; no hay recorridos que reescribir.

**16 de las 28 son `@slow`.** El costo del paso está en el tiempo de corrida, no en la edición.

### 6.2 Lo que tiene que viajar con el botón

El comando no está solo. Dos cosas lo rodean en `DesignToolbar` y **explican por qué está
deshabilitado**:

- `detailing-prerequisites` — la lista de lo que falta;
- `detailing-auto` / `detailing-auto-label` — la preferencia de detallar automáticamente después
  de diseñar, que gobierna a ese mismo comando.

Las dos se mudan **con** él. Dejarlas atrás convierte un comando deshabilitado en un acertijo, que
es el defecto que esta rama ya arregló una vez en `review-submit`. Duplicarlas es peor.

`generateDetailing` en sí es una línea —`detailingStore.generate()`, ya en `rc-commands.ts`— y el
store se niega solo reportando por `lastError`. No hay lógica de prerrequisitos que extraer: hay
markup explicativo que reubicar.

### 6.3 El caso que motivó todo esto

> **Resuelto en `a4d3a7c1`.** El párrafo se deja como estaba porque es el motivo del paso, y
> `f3-bar-labels` todavía lleva la nota que lo describe.

**Detalle no podía generar detallado con Diseñar cerrado.** El comando vivía en
`DesignToolbar`, dentro de la etapa Diseñar, y navegar a Detalle por la franja la cierra. La spec
de F3a tuvo que abrir el disclosure directamente para esquivarlo, y quedó anotado ahí.

Ése es el criterio de aceptación del paso 4, y hay que probarlo explícitamente en las dos
direcciones: Detalle abierto con Diseñar cerrado, y Diseñar abierto con Detalle cerrado.

### 6.4 Las tres formas de ocultamiento, aplicadas a este comando

De §0, y este es el primero que las enfrenta las tres a la vez:

1. **Disclosure cerrado** — resuelto por construcción: va a la franja, no a la sección.
2. **Condición de render** — la fila ya es incondicional. La trampa específica acá sería
   condicionarlo a que la etapa Detalle esté incompleta: generar el detallado **completa** la
   etapa, así que el comando desaparecería justo después de usarse, y regenerar es una operación
   normal. Mismo error que con *acero requerido* en el paso 2.
3. **Otro sticky** — la franja está en `z-index: 12`. Lo nuevo acá son los **overlays**: el visor
   3-D y el diálogo de lámina ampliada (950) se abren desde esta etapa. Hay que verificar que la
   franja no quede por encima de un overlay modal, que sería el defecto inverso.

### 6.5 Una condición de producto que este paso debe respetar

**No se puede generar documentación constructiva desde una propuesta no verificada.** La regla de
completitud de Diseñar ya distingue convergencia de actividad; el comando de detallado tiene que
apoyarse en esa misma señal y no en "hay armadura dibujada".

### 6.6 Orden sugerido para la tanda

1. Mover botón + `detailing-prerequisites` + `detailing-auto` a la franja de Detalle.
2. Correr `detailing.spec.ts` (6 refs, la más densa) y `documents.spec.ts` (3).
3. Correr las 16 `@slow` en una tanda propia con `E2E_PORT` dedicado.
4. Las gates estructurales.
5. Recién entonces retirar `cmd-group-detailing`, que queda sin consumidores.

> **1 a 4 hechos en `a4d3a7c1`.** Dos correcciones a este orden, aprendidas corriéndolo:
>
> - **Las gates conviene correrlas primero, no cuartas.** `pro-design-gates` y
>   `pro-design-workflow` son las que asertan dónde vive el comando: puestas al final, un locator
>   mal apuntado se paga después de 11 minutos de `@slow`. Corridas con la tanda 2, fallan en
>   minutos.
> - **El punto 5 supone que el grupo queda sin consumidores, y no queda.** `cmd-open-3d` sigue
>   ahí. Ver §7.5.


---

## §7 — Paso 4: qué ya se sabe y qué falta

### 7.1 La implementación, aplicada y publicada — `a4d3a7c1`

- botón `cmd-generate-detailing` + `detailing-prerequisites` + `detailing-auto` en la fila
  de acciones de `RcStageTimeline.svelte`;
- `detailingReady` / `hasDetailing` / `detailingBusy` / `detailingBlockers` leídos de
  `detailingStore` en la franja, no pasados por props;
- la acción sigue siendo `rcGenerateDetailing` de `rc-commands.ts`, sin copia;
- `DesignToolbar` conserva `detailingBusy` — lo único que `cmd-open-3d` necesita — y un comentario
  que dice dónde fue el resto.

**Corrección a lo que decía este párrafo antes.** Decía que `cmd-group-detailing` quedaba *vacío*.
No queda vacío: `cmd-open-3d` sigue viviendo ahí, con la etiqueta del grupo. Importa porque es la
premisa del paso 5 — ver §7.5.

**La tanda anterior midió 34 tests** y reportó D7 como única falla. Ese número era de una corrida
parcial, hecha antes de las gates. La tanda completa de este paso midió **276**:

| tanda | tests |
|---|---:|
| `detailing` (24) · `documents` (12) · `pro-design-gates` · `pro-design-workflow` | 48 ✅ (4 skipped) |
| las 16 `@slow` de §7.8 | 143 ✅ |
| `pro-panel-consistency` · `pro-panel-structure` · `f1-stage-timeline` · `f2-design-stage` · `rc-workflow-reachable` · `i18n-languages` | 85 ✅ |
| `run-detailing.test.ts` (unit) | 21 ✅ |

Más `typecheck` 479 = baseline, sin nuevos, y `build` limpio. Todo con `E2E_PORT` dedicado.

**Las 34 no cubrían las gates, y ahí estaba lo que faltaba ver:** el techo de altura de la franja
(§7.4) y dos rojos preexistentes (§7.7). Ninguno se veía en una corrida parcial.

### 7.2 Lo verificado, que no hay que rehacer

- **Cero migraciones de recorrido de specs.** La auditoría de §6.1 acertó: 27 de 28 abren
  `detailing-disclosure` y una llega tras `cmd-design-all`; ninguna de las dos vías se rompe.
  **Precisión que la corrida completa agregó:** cero *recorridos* migrados, pero **dos aserciones
  de ubicación** sí hubo que reapuntar, y son cosa distinta de un recorrido. `pro-design-workflow`
  buscaba la preferencia y el comando dentro de `cmd-group-detailing`; el reclamo —la preferencia
  está con el comando que gobierna— no cambió, sólo el contenedor, y ahora asierta además que
  ninguno de los dos testids tiene copia. Y `run-detailing.test.ts`, que ya estaba rojo (§7.7).
- **Las tres formas de ocultamiento están cerradas.** `pro-design-gates` imprimió los cinco
  comandos hit-testables a 1280×720 con la franja en `z-index: 12`:
  `cmd-compute-demands, cmd-code-check, cmd-design-all, cmd-generate-detailing, cmd-open-3d`.

### 7.3 D7 — el falso positivo que costó un revert

**Fallaba en el árbol limpio.** Preexistente, heredado de H1, y no tenía nada que ver con el paso 4.

D7 clickeaba `review-submit` sin nombre de ingeniero esperando un `review-error`. H1 deshabilitó
ese botón hasta que haya nombre y aceptación de cálculos provisorios, y puso los motivos al lado
en `review-blockers` — su guía de QA lo dice textual. **Expectativa obsoleta, no comportamiento
roto.** Corregido en `76e9180c`: el test aserta que se niega de antemano, nombra lo que falta, y
que la lista de bloqueos **responde** al campo que nombra.

Ninguna de las cuatro hipótesis previas era la causa. La lección está en §A.

### 7.4 El techo de la franja, recalibrado: 90 → 135 px

**Lo único que el movimiento rompió de verdad.** `f1-stage-timeline` — *stays compact at
1024×700* — exigía `< 90 px`, y la franja pasó a medir **129,2**. Falla real: la misma aserción
pasa en árbol limpio.

Medido en proyecto vacío a 1024×700, con la sonda desechada después:

| pieza | limpia | con paso 4 |
|---|---:|---:|
| `ol` (5 etapas) | 24,0 | 24,0 |
| `rc-stage-actions` | 23,0 (1 fila) | **50,8 (2 filas)** |
| `detailing-prerequisites` | — | **19,1** |
| `rc-stage-hint` | 15,1 | 15,1 |
| padding | 10,4 | 10,4 |
| **total** | **82,3** | **129,2** |

El 90 se había calibrado para **tres** comandos, con 7,7 px de margen sobre 82,3. El paso 4 agrega
un cuarto comando, la preferencia que lo gobierna y la frase que explica por qué se niega: +46,9 px
para 7,7 disponibles. **No hay disposición que mantenga todo eso visible y entre en 90**, y la fila
no puede volver a una línea porque a ese ancho no caben cinco botones más el alcance.

Las tres alternativas se descartaron, cada una contra una regla escrita a propósito en otro lado:

| alternativa | ahorro | por qué no |
|---|---:|---|
| esconder el comando cuando DETALLE se completa | — | la trampa de §6.4 forma 2: desaparece justo al usarlo |
| sacar el read-out de alcance | ~28 | §2 lo exige legible **antes** de correr; `pro-design-workflow` lo asierta |
| sacar los prerrequisitos de la franja | 19,1 | `pro-design-gates` los exige **visibles**: un `title` solo deja al usuario de teclado con un botón muerto |

Así que es **re-derivación, no un presupuesto inflado**: 135 = los 129,2 medidos más los mismos
~6 px de margen que 90 le daba a 82,3. El layout quedó tal como lo validó §7.1 — no se inventó
ninguna disposición para cerrar el número. La medición y el razonamiento están escritos en la
propia aserción, en `f1-stage-timeline.spec.ts`.

**La regla que queda para el próximo que lo toque:** si la franja vuelve a crecer, lo que se edita
es el contenido, no el número. El reclamo que la aserción defiende no cambió — la franja es una
franja, no un panel.

### 7.5 Paso 5 — resuelto: `cmd-open-3d` se queda, y por qué

**Decisión: es una herramienta transversal del visor, no una acción del pipeline.** Se queda en
`DesignToolbar`, y `cmd-group-detailing` **no** se retira, porque no queda sin consumidores.

Cinco propiedades de la operación, ninguna de gusto:

1. **Cuatro entradas a propósito, y está aserido.** `cmd-open-3d` en la fila de Diseño,
   `overview-open-3d`, `doc-3d` junto a los exports, y `pr-cmd-rebar3d` en el ribbon.
   `rc-commands.test.ts` asierta sobre la fuente que una sola función queda detrás de todas. Cada
   comando de la franja tiene el invariante **opuesto**: existe una sola vez, sin copia en ningún
   disclosure. Mudarlo habría dejado las otras tres entradas como copias.
2. **Una de esas entradas es el ribbon, que también sirve al flujo metálico** — y ese flujo no
   tiene `RcStageTimeline`. Un visor alcanzable sólo desde la franja RC no podría servirlo.
3. **No adelanta ninguna etapa.** `rc-stages.ts` no conoce el workspace, y la fila de acciones de
   la franja está keyeada por etapa: no hay etapa a la que pertenezca.
4. **Sus entradas son metadatos de documento** (autor, timestamp), no estado de etapa, y su
   prerrequisito es la **salida** del pipeline, no su progreso: que existan ensambles coordinados.
5. **`rebar-open.ts` ya lo decía:** *"the viewer is the RESULT of the design… Nothing here decides
   anything structural."*

El razonamiento quedó escrito junto a la operación, en `lib/store/rebar-open.ts`, y en el botón.

#### Lo que el paso 5 encontró de paso, y conviene no perder

**Las tres entradas del panel están dentro de disclosures.** El `DesignToolbar` entero vive dentro
del `<details>` de DISEÑAR desde F2, el overview dentro del suyo, y `doc-3d` dentro de Documentos.
Con esas secciones cerradas, **ninguna de las tres es alcanzable** — es la forma 1 de ocultamiento
de §0, la misma que motivó mudar el comando de detallado.

Es aceptable **sólo** porque la entrada del ribbon **no** está dentro de ningún disclosure. Eso
dejó de ser un supuesto: `pro-workflow-shell` lo asierta ahora explícitamente. **Si eso cambia, las
entradas del panel dejan de ser comodidades y una tiene que mudarse.**

Una primera versión de esta aserción exigía que `cmd-open-3d` **no** tuviera ancestro `<details>`,
y falló — correctamente, y en árbol con el cambio, no en limpio. Era la aserción la que estaba
mal, no la app. Queda anotado porque es la lección de §A número 1 al revés: un rojo nuevo puede ser
del test.

**El cambio de producción del paso 5 es sólo comentario.** No se corrió la tanda `@slow`, a
propósito: no hay cambio de comportamiento que pudiera romperla. Lo verificado fue
`pro-workflow-shell` completa (12 ✅ + 1 ❌ antes, **32 ✅** después junto a las dos gates de panel),
`rc-commands.test.ts` 9 ✅, typecheck 479 = baseline, build limpio.

### 7.6 Readiness y convergencia — bloque separado, sin empezar

El instructivo pide que el comando esté *"disabled cuando no exista convergencia real"* y que
**no** se genere documentación constructiva desde armaduras no verificadas. Hoy el botón se gatea
por `detailingStore.readiness`, no por la señal de convergencia de `rcStages`.

**Endurecerlo rompería fixtures que detallan a propósito modelos no convergidos** —
`h1e-refused-state` genera detallado sobre miembros REFUSED, y ése es su objeto. Es un cambio de
comportamiento con su propio radio, y **no va en el mismo commit que una reubicación**. Sigue sin
empezar, deliberadamente: el paso 4 se cerró sin tocarlo.

### 7.7 Los rojos preexistentes que aparecieron, y no eran del movimiento

Los dos **confirmados en árbol limpio antes de tocarlos**, que es la regla de §A, y arreglados en
commits propios para no mezclarlos con la reubicación.

**1. `i18n-languages`, en en/es/pt — arreglado en `559127e0`.** `COMMAND_ROW` esperaba
`design.cmd.codeCheck` cuando el **paso 2** renombró el botón a `design.cmd.requiredSteel`. La
clave vieja sigue existiendo en los tres diccionarios y sigue diciendo "Run code check", así que
resolvía a un string real y fallaba por **valor**, en los tres idiomas a la vez — lo que hacía
parecer un defecto de i18n en vez de una expectativa vencida. Misma forma que D7.

**2. `run-detailing.test.ts` — arreglado dentro de `a4d3a7c1`.** Leía `DesignToolbar` +
`DesignOverview` buscando `detailingStore.generate`, que se había ido a `rc-commands.ts` en
`660127e9`. **Se rompió en el primer movimiento, varios commits antes del paso 4**, y es
justamente el test cuyo objeto es detectar cableado que dejó de conectar: falló en su propio
asunto. Ahora lee la franja y `rc-commands.ts`.

**3. `pro-workflow-shell` — arreglado en el paso 5.** Exigía `cmd-design-all` dentro de
`design-toolbar .cmd-row`, y el **paso 3** mudó ese botón a la franja: la conjunción quedó
insatisfacible y la spec se puso roja por algo que no tenía nada que ver con el comando 3-D. Falló
igual en árbol limpio, medido dos veces —al detectarlo en el paso 4 y otra vez como base del paso
5, 12 ✅ + 1 ❌—. Ahora asierta la estructura vigente: el botón está en la fila de comandos del
toolbar, y el visor es alcanzable desde sus cuatro entradas, con la del ribbon fuera de todo
disclosure. Ver §7.5.

**Los tres rojos de esta serie tienen la misma forma**, y vale como patrón: un paso mueve algo, y
una aserción que nombraba la ubicación vieja queda colgada. No los detectó ninguna corrida parcial
—los tres aparecieron al correr archivos completos y gates— y ninguno era un defecto de la app.
Cuando un paso mueve un comando, **buscar quién nombraba el lugar anterior** antes de correr nada:
`grep` del testid y del contenedor viejo cuesta segundos y ahorra tandas enteras.

### 7.8 Las 16 specs `@slow` del paso 4

`viewer-typography` · `viewer-panel-tokens` · `status-token-consumers` · `rebar-workspace-open` ·
`rebar-toggles` · `rc-cad-production-download` · `project-restore` ·
`i18n-languages` · `h1e-refused-state` · `h1e-rail-and-section` · `h1e-conflict-states` ·
`h1e-absence-states` · `h1d-viewer-audit` · `h1c-documents-flow` · `h1b-panel-navigation` ·
`f3-bar-labels`

**Esta lista decía "16" y nombraba 17.** El decimoséptimo era `pro-design-workflow`, que §7.4
también pedía entre las gates: **un archivo contado dos veces**, no un error de cuenta. Sacado de
acá y corrido con las gates, donde ya estaba pedido. Ahora la lista son 16 nombres y 16 archivos.

**Medido en una tanda propia, sin otra sesión compitiendo: 143 tests en 11,2 minutos.** El estimado
anterior —lotes de 1,5 a 17 minutos— era con otra sesión corriendo Playwright en paralelo. Si hay
contención, **no matar la suite ni los servidores de la otra sesión**; informarla antes de
clasificar un timeout.

---

## §8 — Los doce objetivos de Detalle

**Cerrados los doce.** Este §8 queda como el enunciado contra el que se trabajó; el estado está
en §9 (1-4), §9.8 (5) y §9.6 (6-11). La lista original, para que el enunciado siga leyéndose:

1. agrupación barras / placas / fundaciones — contrato listo en `rc-selection.ts`, sin UI;
2. listar vigas y columnas; resto sólo si existe;
3. selección lista → resaltado en 3-D — canal listo (`rebarWorkspace.selection`), sin conectar;
4. resaltado bidireccional: seleccionar en 3-D enfoca la fila;
5. armadura long./transv., recubrimiento, conflictos y estado con nombres humanos — parcial;
6. fijar/liberar con estética Stabileo y estados accesibles;
7. láminas con contorno, recubrimientos, armaduras, cotas y orientación;
8. rótulo breve configurable con título y normas;
9. planilla de doblado con esquema gráfico por forma;
10. ediciones retroactivas Detalle ↔ 3-D — contrato `RcEditConsequence`, sin implementar;
11. trazabilidad de retocados para Documentos — contrato listo y persistido, sin conectar.

Dos módulos de F0 siguen sin consumidor de producción y **no son huérfanos, son contratos con
fecha**: `rc-selection.ts` lo consume el objetivo 1, y `rc-forces-report.ts` espera a F5.

### 8.1 Los once, contra los cinco frentes que cierran H2

Revisados al terminar el paso 5. **Son once, no nueve** — la cuenta se verificó contra la lista:
uno de doce hecho, quedan once.

| frente de cierre de H2 | objetivos | qué hay hoy |
|---|---|---|
| **edición** | 10 | contrato `RcEditConsequence` escrito, sin implementar |
| **selección sincronizada** | 3, 4 | canal `rebarWorkspace.selection` listo, sin conectar en ninguna dirección |
| **láminas** | 7, 8 | — |
| **planilla gráfica** | 9 | — |
| **trazabilidad** | 11 | contrato listo y persistido, sin conectar |
| **fuera de los cinco frentes** | 1, 2, 5, 6 | 1 tiene contrato (`rc-selection.ts`); 5 parcial |

**Cuatro de los once no entran en ninguno de los cinco frentes** —agrupación, listado, nombres
humanos de armadura y fijar/liberar— y eso importa para la regla de cierre: **cubrir los cinco
frentes no equivale a cerrar §8.** Son la capa de lectura de Detalle, y el objetivo 3 depende del 1
(hay que poder agrupar y listar antes de sincronizar una selección con el 3-D), así que el orden
natural es 1 → 2 → 3 → 4, y ahí recién los frentes de láminas y planilla.

**Cinco de los once ya tienen contrato escrito y sin consumidor** (1, 3, 4, 10, 11). Es la deuda
que F0 dejó a propósito, y es lo que hace que estos objetivos sean trabajo de UI y de cableado más
que de diseño: el vocabulario ya está decidido y asertado.

**Nada de esto se mezcla con el endurecimiento de readiness/convergencia (§7.6)**, que sigue siendo
un bloque aparte y sin empezar.

---

## §9 — Detalle: objetivos 1 a 4, hechos

Cuatro commits, cada uno con su tanda verde. Los dos hallazgos que cambiaron el plan están en
§9.1; lo que hay que saber para seguir, en §9.5.

| obj. | qué | commit |
|---|---|---|
| 1-2 | censo de la lista, puro y asertado sin browser | `065a78e5` |
| 1-2 | `RcMemberList.svelte`, la lista agrupada | `205f40b1` |
| 3 | fila → `rebarWorkspace.selection`, y el visor la muestra | `d1d6ae83` |
| 4 | pick en el visor → la fila que la lista marca | `fcbc422d` |

### 9.1 Los dos hallazgos que cambiaron cómo se construyen 1 y 2

**`AssemblyKind` no discrimina familia.** `run-detailing.ts` crea **un ensamble por nivel**, siempre
con `kind: 'beamLine'`, y sus `elementIds` son las vigas **y** las columnas de ese nivel juntas. Una
lista keyeada ahí archivaría todas las columnas bajo "vigas", con aspecto perfectamente creíble. La
familia por elemento sale de los contexts de verificación. **No volver a intentarlo desde el
ensamble.**

**Eso obliga a tres estados, no a un conteo.** Los contexts los llena la pasada de **demandas**, así
que antes de correrla la app no puede decir si un modelo tiene columnas, vigas o ambas.

| estado | significa | se muestra |
|---|---|---|
| `absent` | el modelo no tiene ninguna | no se renderiza: sin encabezado, sin filas, nada clickeable |
| `unknown` | hay candidatos, nadie los clasificó | **siempre visible**, "todavía sin contar" en ámbar |
| `present` | hay miembros clasificados | total + cantidad detallada, filas listadas |

Aplastar `unknown` en `absent` le diría al usuario que su edificio no tiene columnas porque no
apretó Calcular solicitaciones. El vocabulario ya existía —`design.families.census.unknown` contra
`design.families.state.noElements`— y se reusa.

**Límite honesto del alcance actual:** `MemberContext.elementType` es `'beam' | 'column' | 'wall'`, y
las bases salen del mapa de fundaciones del modelo. Losas y pedestales por lo tanto sólo pueden ser
`unknown` o `absent` en esta lista. No es un hueco tapado: es lo que la app puede afirmar hoy.

### 9.2 Selección lista ↔ visor: un solo canal

`rebarWorkspace.selection` es el único canal, en las dos direcciones. La lista **lee** y **escribe**
ese canal y no tiene estado local.

- **Lista → visor** (`selectAndFocus`): el método ya existía y estaba escrito para este llamador.
  Selección **por id técnico**, nunca por índice de fila — el ordinal de "Viga 1" es ayuda de
  lectura. Enter y Space son nativos del `<button>`; las flechas mueven con la selección siguiendo
  al foco y **no envuelven** (salir de Vigas hacia Columnas cruzaría un límite que el mouse
  respeta). Escape limpia por el mismo canal y no restaura: `goBack()` es la afordancia del
  workspace para eso.
- **Visor → lista**: no hay sincronización porque no hace falta. La lista lee el canal, así que el
  pick marca la fila al instante. Lo único que se agregó es `scrollIntoView({block:'nearest'})`,
  que es no-op si ya está visible.

**Verificable, no prometido:** el hook `rebarSelection()` expone `rebarWorkspace.selection` —**no**
`uiStore.selectedElements`, que es otro canal (viewport 2-D y tabla de diseño). Los specs comparan
los dos contra el `aria-selected` de las filas, así que "dos representaciones independientes del
mismo elemento" hoy es un test que falla si vuelve.

### 9.3 La decisión de foco, y por qué no es la literal

§8 item 4 dice "seleccionar en 3-D **enfoca** la fila". **No se toma el foco del DOM**, y es
deliberado: una selección del visor viene de un click en el canvas WebGL o en el panel de estado
dentro del overlay, y sacar el foco de ahí en cada pick rompería el teclado del propio visor y
movería el caret de abajo de las manos de alguien inspeccionando. Robar foco ante un cambio de
estado remoto es el antipatrón, no la feature.

Lo que la fila recibe es el **tab stop** de su familia. Un listbox tiene uno, no uno por fila
—tabular por cien miembros para llegar a lo que sigue es el defecto que el roving tabindex evita— y
lo gana el miembro seleccionado, así la lectura aterriza donde el visor la dejó. Sin nada
seleccionado cae en la primera fila: una familia con todas las filas en `-1` no se alcanza con Tab.

### 9.4 Dos cosas que costaron tiempo, para no repetirlas

**El test del edificio de siete pisos es `@slow`, por medición.** Solo pasa en 4,2 s; dentro de una
tanda de cinco archivos su `solveModel` dio timeout. Es la sensibilidad de carga que documenta
`fixtures.ts`, y recibe el mismo tratamiento que el barrido de i18n cuando empujó a `rc-design` B15
fuera de presupuesto: **la redundancia sale de la suite bloqueante, el presupuesto no se ensancha**,
porque ensancharlo taparía la contención. La tanda pasó de 2,7 a 1,7 min.

**Colisiones de prefijo en testids — tres veces en este trabajo, todas en los tests y ninguna en la
app.** Un testid de contenedor que comparte prefijo con los de sus hijos hace que todo selector
`^=` esté mal en **exactamente un índice**, y pasa inadvertido en el test que casualmente indexa
otro:

| selector flojo | qué capturaba de más |
|---|---|
| `[data-testid^="rc-member-"]` | `rc-member-label-*` y `rc-member-id-*` (sin `data-family`) |
| `[data-testid^="rebar-element-"]` | el `<ul data-testid="rebar-element-list">` en el índice 0 |

**Regla:** un selector `^=` necesita discriminante — un atributo (`[data-family]`), el tag
(`button`), o el contenedor como ancestro explícito. Y **al nombrar testids nuevos, no usar un
prefijo de contenedor que sea prefijo de sus hijos.**

Y una del primer intento: `computeDemands` necesita el modelo **resuelto**. `loadModel` →
`solveModel` → `computeDemands`, en ese orden, o `demandRevision()` queda en 0.

### 9.5 Objetivo 5 — el próximo, y con qué contratos

**Nombres humanos para armadura y conflictos.** Lo que pide el instructivo:

- nombres humanos de armaduras; conflictos legibles;
- ids técnicos como información secundaria;
- distinguir **sin marca**, **marcado** y **provisional**;
- es/en/pt; foco, teclado y accesibilidad;
- testids sin prefijos ambiguos (ver §9.4);
- integrado con el mismo modelo que usa el visor.

**Contratos que ya existen y hay que usar, no reinventar:**

- `lib/flow/rc-bar-label.ts` — `rcBarLabel` y `rcBarLabelParts`. `DetailingWorkflow.svelte` ya los
  consume para la lista de barras (`bar-mark-*`, `bar-id-*`). Una barra sin marca está **ausente del
  mapa a propósito**; ver el comentario de `rcBarLabel`.
- `assignMarks` / `BarMark.barIds` — la coordinación ya decidió las marcas; leerlas, no volver a
  marcar. `DetailingWorkflow` construye ese mapa en `markOf`.
- `provisionalMembers` en `DetailingAssembly` — miembros cuyo diseño es propuesta, distinto de
  "tiene una barra provisoria", y el comentario del campo explica por qué son conjuntos distintos.
- `maturityLabelKey` en `lib/codes/maturity.ts`, ya usado por la lista de ensambles.

**Dónde va:** `DetailingWorkflow.svelte` está en 509 líneas contra el techo de 600 que
`rc-design-gates.test.ts` hace cumplir. Si el objetivo 5 crece, va en componente propio, montado
**una sola vez**, como se hizo con `RcMemberList`.

### 9.8 Objetivo 5 — hecho, y las tres decisiones que lo definieron

Dos commits: `db929428` (el rojo preexistente que destapó) y `6afe56d2` (el objetivo).

| qué | dónde |
|---|---|
| los tres estados de una barra | `lib/flow/rc-bar-status.ts`, puro, 13 tests |
| nombre humano de un conflicto | `rcConflictLabel` en `lib/flow/rc-bar-label.ts`, 19 tests |
| la lista de barras, extraída | `components/pro/design/RcBarList.svelte`, montada una vez |
| 12 e2e sembrados, sin solver | `e2e/f3-bar-states.spec.ts` |

**1. "Sin marca / marcado / provisional" no es un enum de tres valores.** Son **dos ejes**:
si la coordinación ya le dio marca, y si el acero puede construirse. `assignMarks` agrupa por
geometría y no sabe nada de la procedencia del diseño, así que **una barra provisoria puede
llevar marca perfectamente buena** — y aplastarlos perdería la marca justo en las filas que un
doblador todavía fabrica. El módulo guarda los dos ejes y calcula **una** chapa: provisorio le
gana a la marca, porque "todavía sin marca" se resuelve volviendo a coordinar y "provisorio"
decide si la lámina se emite. Es la misma trampa de §9.1 con otro disfraz.

**2. Las dos fuentes de "provisorio" se mantienen separadas**, como pide el comentario de
`provisionalMembers`: la barra que *es* una propuesta (`BarPath.provisional`) y la barra que
*atraviesa* un miembro que lo es. Una columna certificada tiene barras provisorias sin ser
provisoria. Las dos son inconstruibles por motivos distintos y se resuelven en lugares
distintos, así que el motivo va como **texto en la fila** — no como `title`, que ningún teclado
alcanza. Las entradas son `bar.provisional` y el `provisionalMembers` del ensamble: los dos
campos que `scene-model.ts` usa para pintar el visor, leídos y no re-derivados.

**3. Una marca es un TIPO de fabricación, no una identidad.** Dos barras físicamente distintas
pueden chocar bajo la misma marca, y la fila leería `B4 / B4` como si una barra chocara consigo
misma. Por eso el conflicto muestra **siempre** los dos ids abajo, no sólo cuando un lado no se
resuelve. `sameMark` es ese caso y está testeado.

**Lo que costó tiempo, para no repetirlo:** `NODE_OPTIONS` del entorno rompe `npx vitest` y
`npx playwright` (ver §A). Y `floor-design` F6/F10 estaban **rojas en árbol limpio en `1bc40fdc`**:
H1 deshabilitó `review-submit` y movió el rechazo a `review-blockers` *antes* del click, D7 se
actualizó a ese contrato en `76e9180c` y estas dos quedaron atrás. Confirmadas primero en árbol
limpio, arregladas en commit propio. **Es la tercera vez que la serie hereda un rojo sin
registrarlo** — §A regla 5.

**Deuda que NO toqué, a propósito:** `DetailingWorkflow.svelte` conserva tres reglas CSS muertas
(`h5`, `.field input`, `.field textarea`), restos de cuando Documentos se mudó a
`DocumentsSection.svelte`. Salen como warnings de build y son previas a este bloque.

### 9.6 Objetivos 6 a 11 — hechos

Seis commits, uno por objetivo, cada uno con su tanda verde.

| obj. | qué | commit |
|---|---|---|
| 6 | fijar/liberar, y hasta dónde llega una fijación | `b5fb8df2` |
| 7 | láminas con contorno, recubrimiento y cotas | `2229286c` |
| 8 | rótulo breve configurable | `b967b882` |
| 9 | planilla de doblado con esquema gráfico | `a6735297` |
| 10 | ediciones retroactivas Detalle ↔ 3-D | `933b2f5e` |
| 11 | trazabilidad de retocados para Documentos | `f52857d9` |

**Los once objetivos de §8 están cerrados.** Con el 1-5 de §9 y §9.8, §8 queda completo.

#### 9.6.1 Las cinco cosas que estaban escritas y no las llamaba nadie — conectadas

Es el patrón de esta tanda y vale registrarlo, porque se repitió cinco veces: el contrato
existía, tenía tests unitarios, y **no tenía consumidor de producción**. Un test unitario prueba
que una función calcula; no prueba que alguien la llame — que es exactamente lo que
`document-liveness.test.ts` dice de sí mismo.

| contrato | consumidor de producción | qué costaba no tenerlo |
|---|---|---|
| `detailingStore.invalidate` | `applyEdit`, desde `_setOnReinforcementCommit` | una edición no llegaba a los conjuntos: lámina, planilla y 3-D seguían mostrando el acero anterior |
| `exportRecordStore.record` | `withExportLog`, en las tres exportaciones | la lista de emisiones estaba vacía en todo proyecto que existió |
| `RcEditConsequence` | lo devuelve `applyEdit`; lo muestra `RcEditNotice` | nadie sabía qué niveles dejaban de estar al día |
| `RcRetouchProvenance` | `retouchedIn` / `retouchSplitIn`, en cada exportación y en la lámina | ninguna exportación decía qué se había retocado a mano |
| setter de `sectionAt` | el control de estación en `DetailingWorkflow` | **toda** lámina de sección de la app era un corte en x = 0 |

`f3-product-decisions.spec.ts` recorre los ocho puntos de verificación contra un edificio real,
en cadena: editar → invalidar → fijar → regenerar → exportar → registrar. Los ocho pasan.

#### 9.6.2 Las decisiones de producto, fijadas

Las tomó él, y esta sección es el contrato. Lo que sigue **no** es "lo que salió": es lo que hay
que respetar al tocar cualquiera de estas superficies.

**Fijar congela el MIEMBRO, no la barra.** Ésta estaba mal. `runDetailing` honra `lockedBars`
por BARRA y el lazo de reparación honra `lockedMemberIds()` por MIEMBRO: fijando sólo la barra
apretada, una regeneración conservaba esa barra y reemplazaba todas las demás del mismo elemento
— el usuario recuperaba su barra dentro de una jaula que se le había movido alrededor. Ahora
`rcLockToggle` marca **todas** las barras del miembro, así que los dos motores ven el mismo
conjunto congelado. Una barra continua sobre un apoyo congela también la columna, y la fila lo
dice antes de apretar. El estado se ve en Detalle (`data-bar-lock` + censo), en 3-D
(`SceneModel.lockedMembers`, en el panel de selección tanto para una barra como para un miembro)
y en Documentos. Una sola semántica, un solo origen: `lockedMemberIds()`.

**La longitud de la planilla es el desarrollo real.** `cuttingLength` es
`developedLength(segments)` — rectos más cada arco a r·θ — y ya lo era; faltaba mostrarlo junto
al esquema y **probar** que nadie lo va a "simplificar" a la suma de las cotas rectas.
`bar-shape-diagram.test.ts` fija que `straightM + bendsM === cuttingLength` y que en una barra
doblada la suma de los tramos es **menor** que el largo de corte. En un estribo Ø8 con ganchos a
135° eso son 188 mm sobre 1 650.

**Las normas del rótulo salen de Reglamentos y no se editan.** Se quitó lo que había: un autor
podía DECLARAR una norma propia, que salía marcada como no verificada. Fuera por decisión.
`rcTitleBlockCodes` toma las vinculaciones y **ningún segundo argumento** — que es lo que hace
que "no editable" sea una propiedad del tipo y no una regla que alguien tiene que recordar. El
checkbox para ocultar normas queda como extensión futura y deliberadamente no está: un control
que puede esconder una norma vigente es la misma falla que uno que puede renombrarla. Título y
subtítulo siguen configurables.

**Regenerar avisa antes.** `rcRegenerationImpact` parte los retocados en dos por la pregunta del
candado: los fijados se conservan, los no fijados los reemplaza la regeneración —correctamente,
eso es regenerar— y hasta ahora nadie lo decía. El aviso está **al lado del comando**, no en un
diálogo: una confirmación que se descarta siempre deja de leerse. Documentos separa las dos
afirmaciones, que son distintas: retocado y FIJADO es lo que el próximo run conserva; retocado y
no fijado está en esa lámina y no va a sobrevivir.

**`unknown` sobrevive a todo.** Un proyecto abierto de un archivo anterior al registro no puede
decir qué se retocó y por lo tanto tampoco qué va a perder. Ni el aviso, ni la lámina, ni
Documentos dicen "ninguno" ahí. Es la sustitución que el tipo de cuatro estados existe para
impedir, y ahora aparece en tres superficies nuevas.

#### 9.6.2b Lo que un lector va a querer discutir igual

**El esquema mide el plano sobre el CUERPO, no sobre el camino entero.** Los ganchos a 135° de un
estribo giran hacia el núcleo — fuera del plano del estribo, por diseño. Medir el camino completo
rechazaba los 8 212 estribos del modelo. Se recortan por su longitud desarrollada, se abaten al
plano como hace cualquier planilla, y la fila dice que se abatieron.

**Regenerar no conserva un retoque NO fijado, y eso es correcto.** `runDetailing` detalla desde
los outcomes del diseño. La respuesta de la app a "conservá mi arreglo" es el candado, y ahora
el comando lo dice antes de correr.

#### 9.6.3 Lo que se movió, y por qué

El techo de 800 líneas de `detailing.svelte.ts` se tocó tres veces y las tres se resolvió
extrayendo, que es lo que la propia gate manda ("la respuesta es extraer, no subir el número"):

- `detailing-sheet-inputs.ts` — la geometría de las láminas (obj. 7);
- `detailing-sheet.svelte.ts` — **un store nuevo**: tipo de lámina, estación, rótulo, SVG (obj. 8);
- `collectCertificates` a `detailing-project-inputs.ts`.

`DetailingWorkflow.svelte` tocó su techo de 600 dos veces: salieron `RcTitleBlockFields`,
`RcBendingSchedule` y `RcEditNotice`.

#### 9.6.4 Rojos preexistentes, registrados

Regla 5 de §A, y esta vez la partición se hizo bien: **checkout de `6c090835`, correr, comparar**.
No razonar sobre el diff.

**Arreglados en commit propio** (`4a8ff151`): B15 y B9 de `rc-design.spec.ts`. B15 asertaba que
`design-table-scroll` era el scroller, y dejó de serlo cuando F2.1 metió `ProDesignTab` dentro de
la etapa DISEÑAR; B9 sólo fallaba en el mismo worker después de B15.

**Heredados y NO tocados** — rojos en `6c090835`, fuera del radio de esta tanda:

| spec | qué |
|---|---|
| `concrete-copy-contrast` (7) | `.row-id` de `RcMemberList` a `--st-text-3`, de `205f40b1` |
| `pro-design-scopes` (6) | — |
| `floor-families-document` FD-E | la gate de revisión |
| `rc-design-visual` overlay legend | baseline visual, declarado no bloqueante |

**Uno que sí era mío**: `h1b-panel-navigation` "the design panel skips no level", en los tres
idiomas. `RcExportLog` abría con `<h5>` bajo el `<h3>` de `DocumentsSection`. Es el mismo salto
`h3 → h5` que el propio spec registra haber encontrado una vez en "Engineer review", en ese
mismo archivo. Arreglado.

Y una advertencia de método, que costó dos triajes. Estos fallaron en alguna corrida completa y
**pasan en aislamiento**: `f3-member-list @slow`, `h1a`, `i18n-languages`, `pro-project-files`,
`rebar-workspace-focus`, `tab-reactivation`, `rebar-toggles` y `rc-design` B15. La suite entera
son 849 tests en un worker durante ~57 min, y los dos últimos fallaron por **timeout** —"the solve
did not finish in 480 s", `page.evaluate: Test timeout` — no por una aserción. Antes de perseguir
uno de esos: mirar si el error es un timeout, y correrlo solo.

### 9.7 Las gates de esta área

```bash
cd web
export E2E_PORT=6301   # dedicado, nunca 4173
export NODE_OPTIONS=""  # el del entorno rompe npx vitest / npx playwright — ver §A

npx playwright test e2e/f3-member-list.spec.ts e2e/f3-selection-to-viewer.spec.ts \
  e2e/f3-selection-from-viewer.spec.ts e2e/pro-panel-consistency.spec.ts \
  e2e/pro-panel-structure.spec.ts

# Los seis de esta tanda, más la cadena de las decisiones de producto.
# `f3-product-decisions` recorre los ocho puntos de verificación contra un edificio real y
# barre los cuatro anchos y los tres idiomas de las tres superficies nuevas.
npx playwright test e2e/f3-bar-lock.spec.ts e2e/f3-sheet-geometry.spec.ts \
  e2e/f3-title-block.spec.ts e2e/f3-bending-schedule.spec.ts \
  e2e/f3-edit-retroactive.spec.ts e2e/f3-export-log.spec.ts \
  e2e/f3-product-decisions.spec.ts

npx playwright test e2e/f3-bar-states.spec.ts e2e/detailing.spec.ts \
  e2e/detailing-review.spec.ts e2e/detailing-sheet-fieldset.spec.ts \
  e2e/documents.spec.ts e2e/floor-design.spec.ts

# Los dos auditores que esta tanda hizo fallar y hay que correr aunque no parezca:
#   h1c   contraste de TODA copia nueva en Documentos — `--st-text-3` no es color de texto
#   concrete-design-raw-colours / concrete-status-tokens — la deuda de colores crudos no crece
#   h1b   orden de encabezados: un `h5` bajo un `h3` saltea un nivel. Pasó dos veces en
#         `DocumentsSection`, y la segunda fue `RcExportLog`.
npx playwright test e2e/h1c-documents-flow.spec.ts e2e/h1b-panel-navigation.spec.ts
npx vitest run --project unit src/lib/__tests__/concrete-design-raw-colours.test.ts \
  src/lib/__tests__/concrete-status-tokens.test.ts

npx vitest run --project unit src/lib/flow/__tests__/ \
  src/lib/store/__tests__/ src/lib/engine/detailing/__tests__/
npx vitest run --project unit src/lib/i18n/__tests__/         # paridad de 13 locales
npx vitest run --project unit rc-design-gates                 # el techo de 600 líneas
npx vitest run --project unit detailing-store-ceiling         # el de 800 del store
NODE_OPTIONS="--max-old-space-size=4096" npm run typecheck && npm run build
```

**i18n: son 13 locales, no 3.** `locale-parity.test.ts` exige paridad de claves `design.*` contra
`en` en todas las que el repo lleva; las once que el selector no ofrece llevan valores en inglés por
convención. Una clave nueva va a los trece archivos o la gate se pone roja.
