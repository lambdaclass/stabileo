# F4 — qué cubre un documento, elegido en pantalla y declarado en el archivo

**Estado: implementado y verde. Sesión del 2026-08-27, rama `feat/pro-concrete-h2` (PR #170, draft).**

Cierra **F4** de `h1-h2-scope-split.md` §3, contra la auditoría de huecos de `f5-forces-report.md`
§5. No toca F0–F3, ni F5, ni H1, ni solver, ni Rust, ni Cargo, ni WASM. Tampoco
`WorkflowStages.svelte` ni `ProRibbon.svelte`.

---

## §A — Cómo retomar

**árbol limpio** · **PR #170 sigue en draft** · servidor manual final en **4003** (dev server ya
levantado desde este worktree, sirve H1 + H2)

```bash
cd web
git status --porcelain                                        # vacío
NODE_OPTIONS="--max-old-space-size=4096" npm run typecheck     # 479 = baseline
```

> **Aviso de entorno, sigue vigente.** El `NODE_OPTIONS` del entorno trae un `--require` de un
> preload que ya no existe, y cualquier `npx vitest` / `npx playwright` muere con
> `MODULE_NOT_FOUND` antes de arrancar. Correrlos con `NODE_OPTIONS=""` delante. `npm run
> typecheck` sí necesita su `--max-old-space-size=4096`.

**Lo próximo es F6** (visor 3-D) y después **F7** (performance). Ver §7.

---

## 1. El defecto: tres respuestas a "qué cubre este documento"

Ninguna comparable con las otras, y ninguna falsa por separado:

| respuesta | quién la da | dónde se lee |
|---|---|---|
| las **familias** que el diseño pidió | `DocumentModel.scope` | estampada por `scopeStatement` en las tres exportaciones |
| los **conjuntos** que el detallado dibujó | `doc.assemblies` | las láminas y la planilla |
| los **elementos** de cada emisión | `ExportRecord.elements` | **en ninguna parte** — escrito desde F0, sin consumidor |

El caso concreto: se diseña vigas y columnas, se genera el detallado, y después se destilda
`column` en Diseñar. El juego sale con el banner **"ALCANCE: VIGAS"** y las láminas **dibujan las
columnas**. El lector en obra no tiene forma de encontrar la costura.

## 2. La regla de producto, confirmada el 2026-08-27

**Diseñar es dueño de las familias. Documentos puede reducir; nunca ampliar.**

| situación | qué pasa |
|---|---|
| conjunto base | los miembros del dibujo cuyas familias Diseñar seleccionó |
| reducir | un subconjunto de esa base, elemento por elemento |
| ampliar | imposible desde acá — la familia se agrega en Diseñar y en ningún otro lugar |
| pedir un elemento fuera de la base | **rechazado y nombrado**, nunca descartado en silencio |
| toda exportación | declara **familias y elementos** incluidos |

Es el mismo denominador que `detailing-convergence.md` §2 fijó para la convergencia, un nivel más
abajo — en los elementos — así que los dos no pueden separarse.

### 2.1 Un miembro sin familia se **incluye** y se nombra

La familia de un miembro de pórtico se lee de su `MemberContext`, y ese contexto puede faltar: un
modelo editado después de correr el detallado deja miembros en el dibujo que nada puede clasificar.
Descartarlos sería **sacar acero de un juego de planos en silencio**, que es la única falla que no
se cambia por prolijidad. Quedan en la base, se reportan como `unclassified`, y el panel lo dice.

Un miembro cuya familia **sí** se conoce y está fuera del alcance es otro caso: se excluye, y el
remedio se nombra — tildar la familia en Diseñar.

### 2.2 Un elemento puede pertenecer a dos familias, y hay que aceptarlo

`FootingDesignRecord.ownerElementIds` nombra a la **columna** que la zapata carga, porque una
zapata es una entidad y no un miembro del modelo. Así que el elemento 10 puede ser una columna de
una pila **y** el dueño de un registro de zapata, y las dos cosas son ciertas del mismo dibujo.

Una sola familia por miembro obliga a elegir, y las dos elecciones rompen un proyecto real: leer la
columna deja una obra **sólo de fundaciones** sin nada documentable, y leer la zapata mal-etiqueta
cada columna que se apoya en una. `RcDocumentableMember.families` es un array por eso.

## 3. La propiedad que sostiene todo lo demás

> **Un documento reducido nunca afirma más que el conjunto del que salió.**

La forma obvia era filtrar los conjuntos y llamar a `buildDocumentModel` sobre el subconjunto. Está
mal de una manera que importa: `documentReadiness` se mediría **sobre la selección**, así que
reducir un proyecto con columnas en conflicto a una viga limpia daría `FOR_REVIEW` — y
**`Issue for construction` se abriría**. Elegir menos elementos se habría vuelto la forma de
esquivar un bloqueo.

Es exactamente el defecto de `detailing-convergence.md`, en espejo: allá las quince condiciones se
medían sobre el subconjunto dibujado.

Así que el documento se construye **una vez, sobre todo**, y `narrowDocument` reduce el objeto ya
construido:

| se conserva del conjunto completo | se reduce a la selección |
|---|---|
| `readiness` · `openConflicts` · `maturity` · `refs` · `scope` · `outOfScope` | `assemblies` y su `source` · barras · marcas · empalmes · fusiones · conflictos · registros de familia · certificados |

Los conflictos son **el motivo** por el que el conjunto es un borrador, y un subconjunto de un
borrador es un borrador. Cargar un veredicto que **pasa** es seguro (un conjunto limpio no contiene
una parte sucia) y cargar uno que **falla** es pesimista, que es la dirección en la que un
documento puede equivocarse.

### 3.1 Las tres cosas que una selección no puede cortar

- **Una barra continua sobre un apoyo es una pieza.** Pertenece a la viga para la que se diseñó
  *y* a la columna que atraviesa. Se incluye si **cualquiera** de sus dueños está seleccionado, y
  los dueños no seleccionados se nombran en `DocumentSelection.sharedWith` — el acero de la página
  siempre tiene dueño declarado.
- **Una marca conserva su etiqueta.** Volver a correr `assignMarks` sobre las barras que quedan
  renumera, y dos exportaciones del mismo proyecto con selecciones distintas usarían `B3` para
  barras distintas, en papel, en un taller. La etiqueta se preserva y la cantidad y la masa se
  recalculan con **`markMassKg`**, extraída de `assignMarks` para que exista una sola definición.
- **Un empalme necesita sus dos barras.** Es una relación; un empalme a una barra que no está en el
  documento no es un empalme, es una longitud que nadie puede verificar.

## 4. Qué se construyó

| archivo | qué |
|---|---|
| `lib/flow/rc-document-scope.ts` *(nuevo, puro)* | `resolveDocumentScope` — base, reducción, exclusiones, rechazos, los dos vacíos. `documentScopeBlocker` los distingue |
| `lib/engine/detailing/document-narrow.ts` *(nuevo, puro)* | `narrowDocument` — §3 completo |
| `document-model.ts` | `DocumentSelection` y el campo `selection`, **opcional a propósito**: un documento no reducido no tiene selección que declarar, y `{elements: todo}` sería una afirmación disfrazada de hecho |
| `assembly.ts` | `markMassKg` exportada; `assignMarks` la usa |
| `lib/store/document-scope.svelte.ts` *(nuevo)* | el pedido del usuario. `null` = toda la base, y **no** es lo mismo que tildar todo |
| `detailing-project-inputs.ts` | `documentableMembers()`, y `buildProjectDocument` acepta `scope` y reduce |
| `detailing.svelte.ts` | `buildDocument({ scope })` |
| `rebar-open.ts` | `openRebar3D({ scope })` |
| `document-render.ts` | `scopeStatement` estampa **elementos** además de familias, con `memberStatement` |
| `lib/store/document-exports.ts` *(nuevo)* | los tres escritores, fuera del componente |
| `RcDocumentScope.svelte` *(nuevo)* | el selector y la declaración |
| `RcDocumentPreview.svelte` *(nuevo)* | previsualización de plano y de planilla |
| `DocumentsSection.svelte` | cablea todo, más la diferencia con Detalle **en pantalla** |
| `RcExportLog.svelte` | los **elementos incluidos** de cada emisión, por fin renderizados |

### 4.1 El alcance es una **función**, no un `$derived`

`scopeNow()` en `DocumentsSection`. Misma trampa que documentan `buildDocument` y
`detailing-sheet`: un derivado no necesariamente recomputa dentro del turno sincrónico que escribió
su dependencia, y una exportación es un gesto y un tick. Un alcance viejo reduciría el documento a
los miembros que eran documentables **antes** de la última regeneración.

### 4.2 El alcance de Documentos es estado de **sesión**, no del proyecto

Reducir es un **gesto**, no una propiedad de la obra — la misma línea que traza
`detailing-sheet.svelte.ts` sobre el tipo de lámina y la estación de corte. Persistirlo haría que
un proyecto reabierto exporte, en silencio, un subconjunto que alguien eligió hace semanas, desde
un botón rotulado con el nombre del conjunto completo. Y pediría un bump de versión de modelo para
un valor cuyo default honesto es "todo". `documentScope.reset()` cuelga de
`hydrateProjectProvenance` y de `resetProjectProvenance`, que es el único lugar donde un proyecto
pasa a estar vivo.

### 4.3 Previsualización: proyección del mismo documento, y no es una emisión

`SheetPreview.svelte` existe desde el objetivo 7 y está montado en **un** lugar: dentro de
`DetailingWorkflow`, mostrando la lámina del conjunto seleccionado **ahí**. Es la previsualización
correcta para la etapa que dibuja, y **no** es una previsualización de lo que Documentos va a
emitir: no sabe de la reducción y se arma del store de láminas en vez del documento.

Las dos de acá salen de `renderDrawings` y `renderSchedule` — las mismas funciones que las
exportaciones—, así que lo que se mira es lo que cae en la carpeta, reducción incluida.

`RcPreviewTarget` y `RcPreviewStatus` estaban escritos en `rc-export-record.ts` desde F0 **sin
consumidor**. Éste es el consumidor. Y `running` **nunca se escribe**: el renderizado es
sincrónico, así que un `running` no podría pintarse nunca — el navegador no tiene frame que dar
hasta que termina. Escribirlo sería un estado de progreso estructuralmente invisible, que es la
regla de progreso fabricado que esta rama heredó. La construcción va por botón explícito por el
mismo motivo por el que no es un `$derived`: son los 1,9 s que documenta `buildDocumentModel`.

El corte de la planilla a 40 filas **lo dice**. Un truncamiento silencioso se lee como una planilla
completa.

## 5. Cuatro huecos de la auditoría, y qué pasó con cada uno

| lo que pedía §4 | antes | ahora |
|---|---|---|
| **elementos incluidos** declarados | ⛔ registrado en `ExportRecord.elements`, invisible | ✅ `export-record-elements-{i}`, cuenta + ids con tope declarado |
| **selección de qué documentar** | ⛔ no existía | ✅ §2, §3 |
| **previsualización** de plano y planilla | ⚠️ sólo dentro de `DetailingWorkflow` | ✅ al lado de las exportaciones, del mismo documento |
| la diferencia conceptual con Detalle **en la pantalla** | ⚠️ sólo en el comentario de cabecera | ✅ `doc-vs-detailing`, primero en la etapa |

Lo que ya estaba (planos PDF/CAD, planilla, listado, revisión, tipo, estado de generación,
retocados a mano, limitaciones reales) no se tocó más que para que respete la reducción.

### 5.1 `ExportRecord` y el reporte de esfuerzos: la decisión de F5 se mantiene

El enunciado pedía "conectá ExportRecord". Para las tres exportaciones de detallado ya estaba
conectado (`withExportLog`) y ahora además **se muestra**. Para el **reporte de esfuerzos** sigue
deliberadamente desconectado, por §2.6 de `f5-forces-report.md`: `exportRecordStore` está keyeado
por el `seriesId` de un documento de detallado y sus filas llevan los miembros retocados **de ese
documento**. Un `seriesId` fabricado metería una fila en la lista de emisiones de detallado
reclamando una revisión de plano con la que no tiene nada que ver. No lo cambié.

### 4.4 Dos ausencias distintas en la misma línea del estampado

`outOfScope` es lo que el **modelo** tiene y el diseño nunca cubrió. Una reducción crea una
segunda ausencia: una familia que el diseño **sí** cubrió y este documento no, porque no se
seleccionó ningún miembro de ella. Estampar sólo la primera pondría **`ALCANCE: VIGAS`** en una
selección sólo-vigas de un proyecto de vigas y columnas, sin decir nunca dónde están las columnas
— y un lector que sabe que el diseño las cubrió tomaría este juego como que las contiene. Las dos
van en `NO INCLUYE`, deduplicadas y en orden de `DESIGN_FAMILIES`.

## 6. Dos hallazgos del camino, y presupuesto de líneas

- **`detailingStore.titleBlock` no tenía consumidor.** El rótulo propio de la planilla, construido
  en cada lectura y renderizado por nadie — grepeado en todo el árbol antes de borrarlo. El que
  **sí** llega a una planilla viene del documento, por `renderSchedule`. Es la **quinta** vez en
  esta serie: calculado y nunca renderizado (las cuatro anteriores, en §1.3 de
  `f5-forces-report.md`).
- **`document-liveness.test.ts` reapuntado, no debilitado, por tercera vez.** Es una gate de
  fuentes: leía `DocumentsSection.svelte` buscando `renderReportHtml`. Los escritores se fueron a
  `document-exports.ts` porque el componente cruzó su techo de 600, así que ahora lee la **capa**
  (`EXPORT_LAYER`), igual que ya leía `STORE_LAYER`. Y la aserción de "un solo modelo" cambió de
  forma: contaba tres `currentDoc()`, uno por handler, y F4 les dio **una** ruta (`runExport`) — la
  cuenta bajó a uno mientras la propiedad se **fortalecía**. Se asserta donde ahora vive: un
  constructor en la capa, los tres handlers por la única ruta, y un módulo escritor que no puede
  construir (`document-exports.ts` no contiene `buildDocument`).
- **Presupuesto.** `detailing.svelte.ts` llegó a 825 contra 800 → salió el `titleBlock` muerto y la
  reducción se mudó a `buildProjectDocument`; quedó en **799**. `DocumentsSection` iba a pasar de
  600 → salieron los tres escritores; quedó en **565**. Componentes nuevos: 231 y 264.

## 7. Verde, con exit code

```
npm run typecheck   → 0   (479 = baseline, ninguno nuevo)
npm run build       → 0   (ningún css_unused_selector propio en los componentes nuevos)
npm run test        → 0   (las dos pasadas, unit + build)
```

E2E, puertos dedicados 6321/6322, **nunca 4173**:

```
f4-document-scope (19)  · documents · pro-documents-stage · h1c-documents-flow · f3-export-log
detailing-convergence   · detailing · detailing-review     · pro-panel-consistency
pro-panel-structure     · concrete-copy-contrast · i18n-languages · pro-design-gates
pro-design-scopes       · pro-workflow-shell · floor-families-document · h1b-panel-navigation
project-restore         · ded-roundtrip · rebar-workspace-open
```

Idiomas: **en · es · pt** sobre el título del selector y la declaración del alcance. Anchos:
**1280 · 1024 · 900 · 820**, midiendo que ni el selector, ni la etapa, ni el body desborden
lateralmente.

Claves nuevas: **34 en cada uno de los tres locales ofrecidos** (`detailing.doc.select.*`,
`detailing.doc.preview.*`, `detailing.exports.elements*`, `detailing.doc.vsDetailing`), reales en
los tres — `pro-flow-coverage.test.ts` exige exactamente eso para todo lo que las superficies PRO
alcanzan.

## 8. Lo que sigue

- **F6 (§6, visor 3-D):** avisos compactos de provisional y torsión con cierre persistente en la
  sesión, y panel de selección a la derecha. **Hay base sin revisar:** `ProvisionalBanner.svelte`,
  `TorsionBanner.svelte` y `RebarStatusPanel.svelte` ya existen. Auditar antes de construir.
- **F7 (§7, performance):** instrumentar antes de optimizar. `rebarSceneBuilds()` y
  `sceneCacheStats()` ya están en `e2e-hooks.ts`. Ni optimización a ciegas ni barras de progreso
  falsas.
- La etiqueta `run-e2e` sobre el PR haría correr los `@slow`, incluido `h1e-refused-state`, que
  **no corre en CI de un PR**. Sigue valiendo la pena antes de cerrar H2.

**H2 no está completo.** Faltan F6 y F7.

## 9. Reglas vigentes de la rama, sin cambios

No tocar H1, solver, Rust, Cargo ni WASM. Ni `WorkflowStages.svelte` ni `ProRibbon.svelte`. Sin
snapshots ni timeouts inflados. Playwright con `E2E_PORT` dedicado, **nunca 4173**. Servidor manual
final en **4003**. Commits y descripción del PR en inglés. PR en draft. Sin `Co-authored-by`.
