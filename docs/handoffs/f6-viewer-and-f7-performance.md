# F6 y F7 — el visor 3-D, y lo que la performance del visor realmente cuesta

**Estado: implementado y verde. Sesión del 2026-08-27, rama `feat/pro-concrete-h2` (PR #170, draft).**

Cierra **F6** y **F7** de `h1-h2-scope-split.md` §3, que eran lo que faltaba según §8 de
`f4-documents-scope.md`. No toca F0–F5, ni H1, ni solver, ni Rust, ni Cargo, ni WASM. Tampoco
`WorkflowStages.svelte` ni `ProRibbon.svelte`.

---

## §A — Cómo retomar

**árbol limpio** · **PR #170 sigue en draft** · servidor manual final en **4003**, sirviendo H1 + H2

```bash
cd web
git status --porcelain                                        # vacío
NODE_OPTIONS="--max-old-space-size=4096" npm run typecheck     # 479 = baseline
```

> **Aviso de entorno, sigue vigente.** El `NODE_OPTIONS` del entorno trae un `--require` de un
> preload que ya no existe, y cualquier `npx vitest` / `npx playwright` muere con
> `MODULE_NOT_FOUND` antes de arrancar. Correrlos con `NODE_OPTIONS=""` delante. `npm run
> typecheck` sí necesita su `--max-old-space-size=4096`.

**H2 cubre F0–F7.** Lo que sigue es QA manual conjunto con H1 y M1/M2 — ver §8.

---

## 1. La auditoría, antes de tocar nada

Se auditaron los tres componentes que el alcance nombra —`RcStageTimeline`, `DetailingWorkflow`
y el visor/escena— en el browser y no leyéndolos. El arnés de auditoría se borró; lo que queda
son las **mediciones**, y cada corrección de abajo cita la suya.

`RcStageTimeline` salió limpio: sticky, cinco etapas sin envolver, un comando por operación,
`sr-only` real, tokens en su lugar. No se le tocó una línea.

Lo que la medición encontró, en orden de gravedad:

| # | hallazgo | medido |
|---|---|---|
| 1 | **DETALLE no podía abrir el visor** | recorriendo las cinco secciones: MODELADO `overview-open-3d`, DISEÑAR `cmd-open-3d`, DOCUMENTOS `doc-3d`, DETALLE `[]` |
| 2 | **Escape dejaba el foco en `<body>`**, no en el botón que abrió | traza de foco: `out← cmd-open-3d`, `focus(rebar-workspace)`, luego `focus(BODY)` — y ningún `focus(cmd-open-3d)` |
| 3 | **Una propuesta restaurada se reportaba como trabajo terminado** | 7 pisos restaurado: el panel decía `MODELLED 203` y el aviso de la misma pantalla decía 5 propuestas |
| 4 | **Los avisos no se podían cerrar** y costaban 96 px fijos | 48 px cada uno, 0 botones, canvas 569 px de 720 |
| 5 | **El panel de selección estaba abajo y colapsaba** | 1008 × 96 px con algo seleccionado, **15 px** sin nada |
| 6 | **La grilla de `DetailingWorkflow` nunca estuvo encendida** | `display: block`, `grid-template-columns` computado e inerte, `container-type: normal` |
| 7 | **26 selectores CSS muertos en cuatro archivos** | el build reportaba **11** de los 26 |

---

## 2. La entrada que faltaba, y por qué era más que un atajo

`selectAndFocus` —lo que una fila de `RcMemberList` llama— escribe la selección **y** encola un
pedido de cámara, y el efecto que sirve ese pedido vive **dentro del overlay**. Así que con el
visor cerrado, hacer clic en una viga en DETALLE marcaba la fila, encolaba un foco que nadie iba
a ejecutar, y dejaba al lector sin ninguna ruta al elemento que acababa de elegir. La etapa cuyo
tema entero es la jaula coordinada era la única que no podía mostrarla.

Es la **misma operación** que las otras cuatro: `openRebar3D`, una instancia de documento, ninguna
segunda proyección. `rebar-open.ts` ya explica por qué esa es la forma correcta para este comando
y la incorrecta para un comando de etapa —no avanza ninguna etapa, y es "una herramienta
transversal para mirar lo que el pipeline produjo, alcanzable desde donde se lo esté leyendo".
Esta etapa es donde se lo lee.

`member-list-open-3d`, arriba de las filas, deshabilitado —no oculto— cuando no hay nada
coordinado, con el motivo como **texto** y no sólo como `title`.

## 3. El foco, arreglado en su causa

Chromium desenfoca un control cuando pasa a `disabled`. `opening3d` se ponía en `true` **antes**
del `requestAnimationFrame` que el handler cede, así que la secuencia era: clic → el botón se
deshabilita → el browser lo desenfoca → `document.activeElement` es `<body>` → el overlay monta y
`captureFocus` registra **`<body>`** como el opener. `<body>` está conectado, así que la guarda
`isConnected` pasaba y el restore lo enfocaba — que es literalmente lo que `dialog-focus.ts` dice
que existe para prevenir.

Dos mitades:

- **La causa.** Los tres openers con estado pendiente conservan el foco: siguen habilitados, dicen
  `aria-busy` mientras trabajan, y rechazan la reentrada en JS. `SelectionDetails` ya documenta el
  mismo defecto en su forma "el botón se desmonta bajo el foco"; ésta era su forma deshabilitada.
- **La guarda.** `captureFocus` ya no acepta `<body>` ni `<html>` como opener. Un opener inservible
  significa **ningún** restore, así que el foco queda donde el browser lo dejó en vez de ser
  enviado activamente al tope del documento. Es lo que impide que el próximo caller lo reintroduzca
  en silencio.

### 3.1 El defecto que apareció **por** arreglarlo

Con el foco yéndose a `<body>` nada scrolleaba, así que este conflicto no podía aparecer. En cuanto
el opener volvió a recibir foco de verdad, `f3-selection-from-viewer` se puso rojo:
`f3-selection-from-viewer` verificaba —correctamente— que la fila que el visor seleccionó queda a la
vista al cerrar, y enfocar `cmd-open-3d`, que vive en una etapa **anterior** de la misma columna
scrolleable, volvía a subir el panel y se llevaba esa fila fuera de pantalla.

Las dos propiedades son legítimas y la resolución es que el restore haga **sólo su trabajo**:
`opener.focus({ preventScroll: true })`. El teclado queda donde el usuario lo dejó, la lista sigue
mostrando el elemento en el que el visor lo dejó, y el próximo Tab scrollea a donde aterrice. Para
todo diálogo cuyo opener siguió donde estaba —el caso ordinario— no cambia nada: no hay scroll que
prevenir.

Verificado antes y después con `git stash`: verde en HEAD, rojo con el arreglo del foco, verde con
`preventScroll`. Las dos propiedades quedan fijadas **juntas** en `f6-viewer.spec.ts`, para que no
puedan volver a pelearse en silencio.

## 4. Una propuesta persistida no es trabajo terminado

El hallazgo más serio, y no es del visor sino de la frontera entre lo que se guarda y lo que no.

`verificationStore` es **estado de sesión**: nada lo hidrata. Así que un proyecto reabierto desde
el autosave llega sin outcome de diseño para ningún elemento, y `statusOf` leía "hay acero, no hay
outcome" como `MODELLED` para todos. Ese default es correcto para el acero de losas y zapatas —que
por construcción no tiene outcome por elemento— y es **falso** para una propuesta.

Medido en el edificio de 7 pisos restaurado: el panel de estados ofrecía `MODELLED 203` y nada
más, mientras el aviso provisional de la misma pantalla, leyendo el `provisionalMembers` que **sí**
se persiste, decía 5 elementos con propuesta no apta para construcción. Dos lecturas de un hecho,
en desacuerdo en la dirección peligrosa.

**El documento es la autoridad**, porque es la mitad que sobrevive. `reportElementStatus` ahora le
pasa `scene.provisionalMembers` a la decisión, así que el aviso y el panel son dos lecturas de un
hecho en vez de dos derivaciones de él.

Se consulta **último, nunca primero**: `FAILED` y `REFUSED` siguen adelante. Una edición de sección
puede hacer que un elemento registrado como propuesta hoy realmente falle, y una propuesta
persistida no puede suavizar una falla viva. Los tres casos —el que faltaba, el que no debe
ascender, y el acero de piso que se queda como estaba— están fijados en
`element-status.test.ts`.

Efecto de producto: el estado que el aviso anuncia ahora **se ofrece como filtro**, con el mismo
recuento, y filtrar angosta la escena. El lector al que se le dice "5 elementos llevan una
propuesta" puede encontrar los cinco, por el canal que ya existía.

## 5. Los avisos: compactos, con cierre, y sin poder desaparecer

F6 pide avisos compactos y cerrables. `ProvisionalBanner` dice que la frase tiene que ser
"imposible de no ver y permanente". Las dos cosas se reconcilian en **qué** se cierra: el pliegue
se lleva la *explicación* y deja la *afirmación*.

Plegado, el aviso conserva la etiqueta al contraste completo y el recuento; lo que se va es el
párrafo. Un control que pudiera sacar la frase sería un control para que el dibujo parezca
terminado, y ése es el único riesgo que este aviso existe para nombrar.

| | |
|---|---|
| `RebarNotice.svelte` *(nuevo)* | la forma: etiqueta, recuento, pliegue, `aria-expanded`. **No declara ningún color de estado** — el violeta de una propuesta y el ámbar de una torsión son significados distintos, y un shell compartido es exactamente donde dos estados se contagian un color |
| `viewer-notices.svelte.ts` *(nuevo)* | el estado del pliegue. Sesión, nunca proyecto, y **keyeado en el recuento** |
| `ProvisionalBanner` / `TorsionBanner` | siguen siendo dos componentes: son hechos distintos sobre elementos distintos. Aportan sus palabras y su tono |

**Por qué la sesión y no el proyecto.** Plegar es un gesto de lectura, no una propiedad de la
obra — la misma línea que `document-scope.svelte.ts` traza sobre qué elementos cubre un documento.
Persistirlo haría que un proyecto reabierto semanas después esconda una advertencia de
construcción porque alguien la plegó una vez, y pediría un bump de versión de modelo para un valor
cuyo default honesto es "abierto". Nada se escribe a storage, y hay un test que lo asserta como
propiedad del módulo.

**Por qué el pliegue se keyea en el RECUENTO.** Porque otro recuento es otra afirmación. Plegar
"5 elementos llevan una propuesta" no puede plegar también "60 elementos llevan una propuesta"
después de una regeneración — el único caso en que plegar una explicación equivale a esconder un
cambio. El aviso se reabre solo cuando el número cambia.

Lo que devuelve, medido en el 7 pisos: los dos avisos plegados dejan de tomar 96 px de una ventana
de 720, y el canvas crece por esa misma cantidad.

## 6. El panel de selección, a la derecha

Estaba abajo del canvas, ancho completo: **1008 × 96 px** con una barra seleccionada y **15 px**
sin nada — una hairline en el lugar donde se le dijo al lector que mirara. Y una columna es la
forma correcta para lo que contiene: una `<dl>` de una docena de pares etiqueta/valor se lee para
abajo, no a lo ancho.

`RebarInspector.svelte` *(nuevo)*: columna de 17 rem —el ancho del rail de enfrente, así que la
jaula queda entre dos columnas iguales—, con encabezado, región con nombre accesible, y un
**piso** debajo, que es lo que a los 15 px le faltaba.

**El umbral está en 1100 px y sale de la aritmética, no de una cifra redonda.** Con el rail abierto
el canvas es la ventana menos sus 17 rem, y el panel quiere otros 17: a 1280 quedan ~740 px de
jaula, legibles; a 1024 quedarían ~490 y a 900 unos 370, que es una ranura y no un viewport — el
defecto exacto que el encabezado de `RebarWorkspace` registra sobre el sidebar del que este
overlay se construyó para escapar. Debajo del umbral el panel es una franja bajo el canvas, con el
mismo contenido y el mismo testid.

El número se declara **una vez**: la dirección de `.stage` y la forma del panel son la misma
decisión, y dos media queries en dos componentes serían ese número escrito dos veces. `RebarWorkspace`
ya observa la ventana para el umbral del rail; también es dueño de éste y pasa la respuesta.

## 7. El CSS que describía otra pantalla

`DetailingWorkflow` nunca declaró `display: grid`. Medido: `display: block`,
`grid-template-columns: minmax(128px, 192px) minmax(0px, 1fr)` computado e inerte, y
`container-type: normal` — así que el `@container (max-width: 34rem)` no tenía contenedor y estaba
preguntando por la **ventana**, que es el defecto exacto que el comentario ahí paradoescribía haber
arreglado. `pro-detailing-layout.spec.ts` lo dice con sus propias palabras sin saberlo: "a 1280×720
el panel derecho mide unos 540 px … así que la sección **ya** es una columna".

La columna única ahora está **declarada**. No se cambió a una columna flex: un `gap` movería a
todos los hijos, y esta edición corrige la descripción, no el layout.

Y veintiséis selectores para markup que estos archivos ya no tienen — de los cuales el build
reportaba **once**, porque el pase de selectores no acusa un selector de clase que no puede probar
inalcanzable. En un solo archivo el build decía "tres" sobre dieciséis. Borrados por el motivo que
`.autosave-banner` le enseñó a este árbol: una regla que sobrevive a su markup no es un repuesto,
es un señuelo que el próximo edita esperando un efecto. Dos de ellas incluso cargaban ratios de
contraste medidos, que es lo que las hacía convincentes.

| archivo | qué salió |
|---|---|
| `DetailingWorkflow.svelte` | la grilla inerte, la container query, `h5`, y quince reglas de la era Documentos |
| `ProRcWorkflowTab.svelte` | `.stage-tag`, `.count`, `summary`, `summary:focus-visible`, `.attention` |
| `DesignToolbar.svelte` | `.cmd-scope` y `.cmd-all` — la pintura del comando "correr todo", que ahora se define en `RcStageTimeline` |
| `RcTitleBlockFields.svelte` | `.sr-only` — un helper de accesibilidad abandonado se lee como accesibilidad resuelta |

---

## F7 — medir antes de optimizar, y lo que la medición dijo

### 7.1 Las diez operaciones

`rebar-viewport-cost.spec.ts` ya medía las que ocurren con el visor **abierto**: selección en el
viewport y en la lista, un toggle por familia, aislar, filtrar por estado, opacidad, corte, ida y
vuelta de pestaña, y un rebuild deliberado para que cada fila signifique algo. Todas asertadas
contra un **contador** (`rebarSceneBuilds`) y no contra un cronómetro.

Lo que no estaba medido en ninguna parte era la operación más cara de la feature: **la apertura**.
`open-timeline.ts` graba sus seis fases en el producto desde PR20 y nada las leía.

Primera apertura, 7 pisos, 1280×720, en este runner:

| fase | ms | qué es |
|---|---:|---|
| click | 0 | |
| document | 143 | el `DocumentModel`, sincrónico, dentro del handler |
| scene | 412 | la proyección — 269 ms de muestrear 23 393 barras |
| renderer | 558 | contexto WebGL, cámara, controles |
| geometry | 782 | 1 458 540 triángulos y 8 116 marcadores en la GPU |
| **frame** | **2135** | ← **1 353 ms**, el driver vaciando ese upload |

**Dos tercios de una apertura de dos segundos son el primer frame**, y eso es costo de fill de GPU
en un rasterizador de software, no trabajo de la app — la misma conclusión a la que
`open-timeline.ts` llegó por el otro lado, después de que un profile le echara la culpa a `setSize`
por 1,7 s de eso.

Así que el techo se pone en **`geometry`**, no en `frame`: todo hasta que la geometría se entrega a
la GPU es trabajo propio de esta aplicación, y es donde aterrizaría una regresión. El salto de ahí
al primer frame es el driver, y acotarlo convertiría esto en un test del rasterizador del runner.
Se reporta, no se acota.

La reapertura mide lo mismo, que es la confirmación de que el techo está bien puesto: `geometry`
732 ms y `frame` 2 147 ms, contra 782 y 2 135 de la primera. **Una apertura, un build** —
verificado en el contador, que es la propiedad que el build diferido existe para proteger.

Y el modelo chico, para tener la otra punta de la escala:

| fase | 7 pisos | control chico |
|---|---:|---:|
| document | 133 | 5 |
| scene | 432 | 24 |
| renderer | 564 | 32 |
| geometry | 732 | 49 |
| frame | 2 147 | 546 |
| lámina a ventana completa | 271 | 150 |
| regenerar el detallado | *(ver abajo)* | 553 |

Se agregaron también: la lámina a ventana completa (SVG, y se asserta que no agrega canvas ni
contexto) y la regeneración del detallado. La **carga del edificio grande** ya la cronometra
`prepared-building.ts` por etapa, y sigue así.

**La "actualización después de editar" no se cronometra como un gesto solo, y conviene decir por
qué.** Se descompone en dos cosas que ya están medidas: el *retiro* del documento —una escritura de
store, sin geometría, cuya corrección fija `f3-edit-retroactive.spec.ts` a través del control real
`count-bottomSpanLayers-*`— y la *reconstrucción*, que es la reapertura o la regeneración de la
tabla de arriba. Medirla como un gesto único exigiría, dentro de un benchmark, cerrar el overlay,
navegar a la tabla de DISEÑAR y expandir una fila: el número quedaría dominado por la navegación y
diría menos que las dos mitades por separado.

**Y apareció otra cara del mismo hecho de §4.** En un proyecto **restaurado** el comando de
regenerar el detallado está **deshabilitado**: `verificationStore` es de sesión, así que el
proyecto reabierto trae su modelo, su armadura y su detallado pero **no sus solicitaciones**, y
regenerar las necesita. El botón lo dice —"No members have design demands yet. Solve the model and
run the code check first."— y la misma frase está renderizada como texto en
`detailing-prerequisites`, no sólo en el `title`. Es la app siendo honesta sobre una limitación del
restore, no un comando que ofrecería refusar. El benchmark asserta las dos caras: mide el gesto
donde es alcanzable y fija la negativa —y que se explique— donde no lo es.

### 7.2 Las seis patologías que F7 nombra

Auditadas contra la medición, no contra la lectura:

| | veredicto |
|---|---|
| **operaciones síncronas largas** | una: la apertura. Su fase dominante es el flush de GPU, ya atacado dos veces (batching por familia, marcadores de 10×8 → 6×4). Lo que queda pide dibujar menos de lo que el documento contiene, que es lo único que F7 prohíbe |
| **renders redundantes** | ninguno. No hay loop de `requestAnimationFrame`: los frames se piden cuando algo cambia, y la cola de damping se cuenta en vez de adivinarse |
| **geometría duplicada** | ninguna. Cinco ciclos abrir/cerrar: `canvasCount` fijo en 3, `rebarSceneBuilds` +1 exacto por visita. Un toggle, un corte, la opacidad y una selección mueven el contador en **0**; sólo la exageración de diámetro lo mueve, y debe |
| **listeners que sobreviven al desmontaje** | ninguno. El `ResizeObserver` se desconecta, `controls.dispose()` corre, `setLiveRebarScene(null)` se limpia **antes** del dispose. `<svelte:window>` pertenece a un componente montado permanentemente, así que no sobrevive a nada |
| **fugas de contexto** | ninguna. `forceContextLoss()` + `dispose()` + `domElement.remove()`, verificado contando los contextos vivos por canvas |
| **recalculaciones innecesarias** | ninguna alcanzable. Los `$derived` del visor son perezosos y **sólo se leen dentro del `{#if}`**, así que con el overlay cerrado no computan nada: ni `built`, ni `outcomes`, ni las 203 traducciones de `reasons`. La parte cara de `built` la absorbe `cachedSceneModel` |

**F7 no produjo ninguna optimización, y eso es el resultado, no trabajo faltante.** Las seis
patologías se auditaron contra medición y ninguna está presente; el único costo largo que queda es
el fill de GPU del primer frame, ya atacado dos veces (batching por familia, y los marcadores de
10×8 a 6×4, que es 3,89× menos geometría por 1,9× de mejora — el resto es fill rate, que ninguna
tesselación alcanza). Bajarlo más pide **dibujar menos de lo que el documento contiene**, que es
exactamente lo que F7 prohíbe.

Lo que F7 sí dejó es lo que pedía primero: **la medición existe, está en el producto y ahora tiene
gate.** No se bajó precisión, no se ocultaron elementos, no se metió debouncing y no se infló
ningún timeout.

### 7.3 Un no-defecto que conviene dejar escrito

La proyección de escena **falla el caché en cada reapertura** —`{hits: 0, misses: N}`— y eso es
deliberado, no un descuido. `openRebar3D` reconstruye el documento a propósito, y `scene-cache.ts`
compara por identidad porque "un documento reconstruido desde el mismo detallado sigue siendo una
afirmación nueva, con su propia revisión y readiness". Cuesta los 412 ms de arriba. Cachear por
contenido serviría una escena con la revisión equivocada en la carátula, que es peor que 412 ms.

`onResize` de `RebarWorkspace` tampoco está guardado por `rebarWorkspace.open`, a diferencia de
`onKeydown`, y **debe seguir así**: si estuviera guardado, redimensionar con el visor cerrado
dejaría `railOpen` e `inspectorSide` viejos y la próxima apertura montaría una columna de 17 rem
en una ventana de 820 px. Cuesta dos lecturas de entero.

---

## 8. Verde, con exit code

```
npm run typecheck   → 0   (479 = baseline, ninguno nuevo)
npm run build       → 0   (ningún css_unused_selector propio queda en las superficies de hormigón)
npm run test        → 0   (7 615 tests, las dos pasadas)
```

E2E, puertos derivados por worktree, **nunca 4173**:

```
f6-viewer (9)  ·  rebar-workspace-notices (5, @slow)  ·  rebar-viewport-cost
rebar-3d  ·  rebar-toggles  ·  rebar-workspace-open  ·  rebar-workspace-focus
documents  ·  pro-documents-stage  ·  f4-document-scope  ·  h1c-documents-flow
detailing  ·  detailing-review  ·  detailing-convergence  ·  f3-member-list
f3-selection-to-viewer  ·  f3-selection-from-viewer  ·  h1d-viewer-audit
h1e-absence-states  ·  h1e-conflict-states  ·  h1e-rail-and-section
pro-panel-consistency  ·  pro-panel-structure  ·  i18n-languages  ·  pro-design-gates
```

Idiomas: **en · es · pt**, sobre el visor entero. Ninguna clave cruda, ningún desborde lateral:
`3-D reinforcement workspace` / `Visor 3D de armaduras` / `Visualizador 3D de armaduras`.
Anchos: **1280 · 1024 · 900 · 820** — el panel es columna en el primero y franja en los otros
tres, con piso en los cuatro y `scrollWidth === clientWidth` en todos.

Claves nuevas: **3 en cada uno de los tres locales ofrecidos**
(`detailing.scene.notice.fold`, `detailing.scene.notice.expand`,
`detailing.scene.selection.title`).

### 8.1 Un gate reapuntado, y por qué se fortaleció

`concrete-status-tokens.test.ts` leía el color del cuerpo del aviso de torsión **en**
`TorsionBanner.svelte`. Esa declaración se mudó a `RebarNotice.svelte` con la extracción, así que
ahora está escrita **una vez para los dos avisos** en vez de dos veces — la dirección que ese
describe quiere. Se reapuntó a donde vive cada mitad (el shell el cuerpo, cada banda su `strong`,
`SelectionDetails` las dos) y se le agregó una aserción que antes no tenía sentido pedir: **el shell
compartido no declara ningún color de estado**, porque un shell compartido es exactamente donde el
violeta de una propuesta y el ámbar de una torsión se contagian.

Es la cuarta vez en esta serie que un gate de fuentes se reapunta al mudarse el código, y la cuarta
vez que la propiedad queda más fuerte, no más débil.

### 8.2 Un `vite preview` huérfano, y las 21 fallas que no existían

Vale anotarlo porque cuesta una hora cada vez que pasa, y porque el propio
`playwright.config.ts` ya lo describe. Al cortar una corrida trabada quedó vivo un
`vite preview` en el puerto derivado de este worktree (5401), sirviendo el `dist/` de un
`npm run build` **manual** — es decir, sin `VITE_E2E=1`. Con `reuseExistingServer` activo en
local, la corrida siguiente se enganchó a ese servidor y **las 21 pruebas fallaron idénticas**
en `page.waitForFunction: Test timeout of 60000ms exceeded`, esperando un `window.__stabileo`
que ese bundle no contiene.

La firma es inconfundible y conviene reconocerla: **todas las fallas con el mismo tiempo
exacto**, ninguna con una aserción de producto. Matar el listener del puerto derivado y
repetir dio **41/41 en 2,5 minutos**. Ninguna de esas 21 era real.

Regla práctica: después de un `npm run build` a mano en este worktree, verificar que no quedó
nada escuchando en la banda 5200–6199 antes de correr Playwright.

### 8.3 La inanición del solve, otra vez, y no es una regresión

Dos corridas de los specs del 7 pisos murieron en la preparación con
`the solve did not finish in 480 s`, sin fallback a secuencial. Es exactamente
`pr20-heavy-spec-starvation.md`: la máquina venía de ocho y diez minutos de otras corridas. Cada
uno de esos tests **pasa solo** — verificado para los dos. No se toca el deadline ni se infla nada;
queda anotado con el resto en `pr19-readiness.md` §9, que es donde el remedio real (menos setups
completos del 7 pisos) está escrito.

---

## 9. Lo que sigue: parar

**H2 cubre F0–F7 y ninguna función visible quedó sin conexión end-to-end.** Las dos que lo estaban
—la lista de DETALLE pidiendo una cámara que nadie servía, y el aviso de propuestas nombrando
elementos que ningún filtro ofrecía— están cerradas y con gate.

Desarrollo **detenido**. Ningún PR nuevo. Lo que corresponde ahora es lo que §5 de
`h1-h2-scope-split.md` fijó: guía de QA de H2 en el formato de `h1-manual-qa.md`, QA manual de
**las dos ramas** más M1/M2, y los hallazgos registrados **antes** de integrar.

Para el QA manual, los cuatro lugares donde mirar primero:

1. **DETALLE → `Ver modelo 3D`**, con un elemento ya elegido en la lista: la cámara tiene que
   aterrizar en ése y el panel derecho tiene que nombrarlo.
2. **Escape y el botón de cerrar**, desde los cinco puntos de entrada: el foco vuelve al control
   que se dejó.
3. **Un proyecto reabierto** con propuestas: el panel de estados tiene que ofrecer `PROVISIONAL`
   con el mismo número que el aviso.
4. **Los dos avisos plegados**, cerrando y reabriendo el visor: siguen plegados, siguen diciendo
   qué y cuántos, y el canvas se queda con los 96 px.

## 10. Reglas vigentes de la rama, sin cambios

No tocar H1, solver, Rust, Cargo ni WASM. Ni `WorkflowStages.svelte` ni `ProRibbon.svelte`. Sin
snapshots ni timeouts inflados. Playwright con puerto derivado del worktree, **nunca 4173**.
Servidor manual final en **4003**. Commits y descripción del PR en inglés. PR en draft. Sin
`Co-authored-by`.
