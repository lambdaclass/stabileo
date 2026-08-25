# Los comandos del pipeline y la etapa a la que pertenecen — auditoría y retoma

> **Documento de retoma.** Leer §A antes de tocar nada.

---

## §A — Cómo retomar

**Rama:** `feat/pro-concrete-h2` · **PR:** [#170](https://github.com/lambdaclass/stabileo/pull/170) (draft)
**HEAD esperado:** `76e9180c` · **20 commits** sobre `feat/pro-concrete-h1` · **árbol limpio**

```bash
cd web
git status --porcelain          # debe estar vacío
git log --oneline -1            # 76e9180c test(detailing): D7 asserts …
NODE_OPTIONS="--max-old-space-size=4096" npm run typecheck   # baseline 479, sin nuevos
```

**Lo único pendiente inmediato es el paso 4** (§6 y §7). Todo lo anterior está verde y publicado.

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

---

## §B — Estado por fase

| fase | estado | qué falta |
|---|---|---|
| **F0** contratos | ✅ 6 commits | — |
| **F1** franja de etapas | ✅ | — |
| **F2** etapa Diseñar | ✅ 2 commits | — |
| **F2.6** persistencia | ✅ | — |
| **Semántica de Diseñar** | ✅ `4ab876b5` | — |
| **F3 · reubicación** | 🔶 pasos 1-3 ✅, **4 y 5 pendientes** | §6, §7 |
| **F3 · Detalle** | 🔶 1 de 12 objetivos | §8 |

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

**Hoy Detalle no puede generar detallado con Diseñar cerrado.** El comando vive en
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


---

## §7 — Paso 4: qué ya se sabe y qué falta

### 7.1 La implementación existe y funcionó

Se aplicó completa en una tanda anterior y **compiló y corrió**:

- botón `cmd-generate-detailing` + `detailing-prerequisites` + `detailing-auto` movidos a la fila
  de acciones de `RcStageTimeline.svelte`;
- `detailingReady` / `hasDetailing` / `detailingBusy` / `detailingBlockers` leídos de
  `detailingStore` en la franja, no pasados por props;
- la acción sigue siendo `rcGenerateDetailing` de `rc-commands.ts`, sin copia;
- `DesignToolbar` queda con el `cmd-group-detailing` vacío y un comentario que dice dónde fue.

**Resultado medido: 34 tests pasaron**, y la única falla era D7 — que **no** era del movimiento.

### 7.2 Lo verificado, que no hay que rehacer

- **Cero migraciones de recorrido de specs.** La auditoría de §6.1 acertó: 27 de 28 abren
  `detailing-disclosure` y una llega tras `cmd-design-all`; ninguna de las dos vías se rompe.
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

### 7.4 Lo que falta para cerrar el paso 4

1. **Reaplicar el movimiento** (7.1). No hay diseño que redecidir.
2. **Correr con margen**, en este orden:
   - `detailing.spec.ts` (6 refs, la más densa) y `documents.spec.ts` (3);
   - **las 16 `@slow`**, en tanda propia con `E2E_PORT` dedicado — acá está todo el costo;
   - `pro-panel-consistency`, `pro-panel-structure`, `f1-stage-timeline`, `f2-design-stage`,
     `pro-design-workflow`, `pro-design-gates`;
   - typecheck, build, y revisión es/en/pt a 1280/1024/900/820.
3. **Una condición de producto todavía sin resolver**, y conviene decidirla antes de commitear:
   el instructivo pide que el comando esté *"disabled cuando no exista convergencia real"* y que
   **no** se genere documentación constructiva desde armaduras no verificadas. Hoy el botón se
   gatea por `detailingStore.readiness`, no por la señal de convergencia de `rcStages`.
   **Endurecerlo rompería fixtures que detallan a propósito modelos no convergidos** —
   `h1e-refused-state` genera detallado sobre miembros REFUSED, y ése es su objeto. Es un cambio
   de comportamiento con su propio radio, y merece su bloque separado, no el mismo commit que la
   reubicación.

### 7.5 Las 16 specs `@slow` del paso 4

`viewer-typography` · `viewer-panel-tokens` · `status-token-consumers` · `rebar-workspace-open` ·
`rebar-toggles` · `rc-cad-production-download` · `project-restore` · `pro-design-workflow` ·
`i18n-languages` · `h1e-refused-state` · `h1e-rail-and-section` · `h1e-conflict-states` ·
`h1e-absence-states` · `h1d-viewer-audit` · `h1c-documents-flow` · `h1b-panel-navigation` ·
`f3-bar-labels`

Con otra sesión corriendo Playwright en paralelo, los lotes tardaron entre 1,5 y 17 minutos.
**No matar la suite ni los servidores de la otra sesión**; si hay contención, informarla antes de
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
