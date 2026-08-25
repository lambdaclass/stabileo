# Los comandos del pipeline y la etapa a la que pertenecen — auditoría y retoma

> **Documento de retoma.** Leer §A antes de tocar nada.

---

## §A — Cómo retomar

**Rama:** `feat/pro-concrete-h2` · **PR:** [#170](https://github.com/lambdaclass/stabileo/pull/170) (draft)
**HEAD esperado:** `a4d3a7c1` · **23 commits** sobre `feat/pro-concrete-h1` · **árbol limpio, pusheado**

```bash
cd web
git status --porcelain          # debe estar vacío
git log --oneline -1            # a4d3a7c1 feat(pro): the detailing command moves to the DETALLE strip …
git log --oneline origin/feat/pro-concrete-h2..HEAD   # debe estar vacío: remoto sincronizado
NODE_OPTIONS="--max-old-space-size=4096" npm run typecheck   # baseline 479, sin nuevos
```

**El paso 4 está hecho y verde** (§7). Lo pendiente inmediato es el **paso 5** —
retirar `cmd-group-detailing` si queda sin consumidores— y los objetivos de Detalle de §8.

**El endurecimiento de readiness/convergencia sigue siendo un bloque separado**, sin empezar.
Ver §7.6: es un cambio de comportamiento con su propio radio, y rompe fixtures que detallan
modelos no convergidos a propósito. No mezclarlo con una reubicación.

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
5. **Un rojo preexistente no se hereda en silencio.** El paso 4 encontró dos, y los dos habían
   quedado de pasos anteriores de esta misma serie sin que §A los registrara: uno del paso 2 y uno
   del commit de extracción. Los dos se confirmaron en árbol limpio antes de tocarlos y se
   arreglaron en commits propios. Ver §7.7. Si una tanda termina con rojos, van acá.

---

## §B — Estado por fase

| fase | estado | qué falta |
|---|---|---|
| **F0** contratos | ✅ 6 commits | — |
| **F1** franja de etapas | ✅ | — |
| **F2** etapa Diseñar | ✅ 2 commits | — |
| **F2.6** persistencia | ✅ | — |
| **Semántica de Diseñar** | ✅ `4ab876b5` | — |
| **F3 · reubicación** | 🔶 pasos 1-4 ✅, **5 pendiente** | §7.5 |
| **F3 · Detalle** | 🔶 1 de 12 objetivos | §8 |
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

### 7.5 Paso 5 — lo que falta de la reubicación

Retirar `cmd-group-detailing` **si** queda sin consumidores. Hoy **no** queda: conserva
`cmd-open-3d` y la etiqueta del grupo, y `pro-design-workflow` asierta que la fila son tres grupos
nombrados en orden de pipeline. Así que el paso 5 no es un borrado suelto — es decidir dónde va
`cmd-open-3d`, que es el **resultado** del pipeline y no un paso, y recién entonces el grupo queda
vacío. Ver también §7.7, segundo rojo: `pro-workflow-shell` ya exige ese botón en una fila que el
paso 3 dejó sin `cmd-design-all`.

### 7.6 Readiness y convergencia — bloque separado, sin empezar

El instructivo pide que el comando esté *"disabled cuando no exista convergencia real"* y que
**no** se genere documentación constructiva desde armaduras no verificadas. Hoy el botón se gatea
por `detailingStore.readiness`, no por la señal de convergencia de `rcStages`.

**Endurecerlo rompería fixtures que detallan a propósito modelos no convergidos** —
`h1e-refused-state` genera detallado sobre miembros REFUSED, y ése es su objeto. Es un cambio de
comportamiento con su propio radio, y **no va en el mismo commit que una reubicación**. Sigue sin
empezar, deliberadamente: el paso 4 se cerró sin tocarlo.

### 7.7 Los dos rojos preexistentes que aparecieron, y no eran del movimiento

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

**Y uno que queda rojo a propósito:** `pro-workflow-shell` — *the command is on the Design command
row* — exige `cmd-design-all` dentro de `design-toolbar .cmd-row`, y el **paso 3** mudó ese botón a
la franja. Falla igual en árbol limpio. Es otra reubicación, no la del paso 4, y va con el paso 5
(§7.5).

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

## §8 — Los objetivos de Detalle que siguen abiertos

Uno de doce hecho (`a4198d0e`, nombres de barra). Faltan:

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
