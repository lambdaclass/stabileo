# F5 — el panel que había que partir, y el reporte que no es un diseño

**Estado: implementado y verde. Sesión del 2026-08-27, rama `feat/pro-concrete-h2` (PR #170, draft).**

Dos commits sobre el merge de integración `7f756119`:

```
fbc0e17c  refactor(pro): ProPanel splits by responsibility, and stops hiding dead CSS
cabb6c97  feat(results): the raw forces report, and it says what it is not
```

Cierra **F5** de `h1-h2-scope-split.md` §3. No toca F0–F3, ni H1, ni solver, ni Rust, ni WASM.

---

## §A — Cómo retomar

**HEAD esperado:** `cabb6c97` · **árbol limpio** · **PR #170 sigue en draft**

```bash
cd web
git status --porcelain                                        # vacío
NODE_OPTIONS="--max-old-space-size=4096" npm run typecheck     # 479 = baseline
```

> **Aviso de entorno, sigue vigente.** El `NODE_OPTIONS` del entorno trae un `--require` de un
> preload que ya no existe, y cualquier `npx vitest` / `npx playwright` muere con
> `MODULE_NOT_FOUND` antes de arrancar. Correrlos con `NODE_OPTIONS=""` delante. `npm run
> typecheck` sí necesita su `--max-old-space-size=4096`.

**Lo próximo es F4**, no F6. Ver §5, que es la auditoría de lo que falta y por qué es menos de lo
que el enunciado sugiere.

---

## 1. El bloqueo de F5 era un archivo, y el archivo era el problema

`h1-h2-scope-split.md` §1.6 nombra `ProPanel.svelte` como uno de los dos presupuestos ya agotados
justo donde el alcance golpea: **1319 líneas contra el techo de 600**, y encima es el que hospeda
el botón de reporte que §5 necesitaba. La instrucción de F5 lo dice sin vueltas: *"hay que extraer
antes de tocar"*.

Quedó en **537**, y ahora hay una gate que lo mantiene ahí (`rc-design-gates.test.ts`, describe
`GATE: ProPanel was decomposed`). No la tenía: era una guía repo-wide sin gate sobre este archivo,
que es exactamente cómo llegó a 1319 mientras cada componente de `pro/design` tiene la suya desde
PR15.

### 1.1 Qué salió, y por responsabilidad

| destino | qué | por qué no era del panel |
|---|---|---|
| `lib/data/pro-examples.ts` | el catálogo: 17 casos con nombre, intención, tamaño y loader | es data. Sin markup, un test asegura sin browser que no hay dos tarjetas cargando el mismo fixture |
| `components/pro/ProExampleMenu.svelte` | la galería: posicionamiento `fixed` contra el viewport, sus dos regímenes, y 130 líneas de estilo de tarjeta | `open` sigue siendo estado del padre — el ribbon abre este menú desde afuera del panel, y una segunda copia de esa bandera es una segunda respuesta |
| `lib/engine/pro-report-inputs.ts` | el armado del reporte: nueve lecturas del modelo en una función de 230 líneas | misma forma que `detailing-project-inputs.ts` y por el mismo motivo: pasar nueve mapas por parámetro es cómo un reporte termina describiendo un modelo que el usuario no está mirando |

Las **cotas que el panel ya aplicaba** —cuatro nudos, tres líneas de pórtico, tres pilas de
columnas— son constantes ahora, y el 1,5 % de distorsión de piso está nombrado como el **umbral de
reporte** que es, en vez de estar inline donde se lee como una verificación reglamentaria.

### 1.2 Lo que NO salió, y por qué

- **La captura de pantalla.** Es una lectura del DOM en el instante en que se apretó el botón —el
  canvas como está—, no una propiedad del modelo.
- **La gate de pre-cálculo.** `handleSolve` se niega **antes** de correr y manda a Diagnósticos.
  Una gate que vive lejos del comando que gatea es el acertijo que esta rama ya arregló dos veces
  (`review-submit`, `cmd-generate-detailing`).

### 1.3 Las 110 líneas de CSS muerto

Nombres de clase que no aparecen en ningún markup del árbol: `.pm-tools-row`, `.pm-tool` y
`.pm-sel` de la fila de herramientas móvil que se mudó al toolbar superior de `App.svelte`, y
`.pro-actions`, `.pro-example-wrap`, `.pro-example-btn`, `.pro-solve-btn`, `.pro-report-btn` de la
barra de acciones de escritorio que se volvió comandos del ribbon.

Veintitantos `css_unused_selector` en cada build — la misma forma en que `.pro-quality-gate` y
`.autosave-banner` sobrevivieron un release cada uno. **`ProPanel` ahora no emite ninguno.**

También se fueron `getTabCount` y `diagCount`, los dos calculados y nunca renderizados, los tres
conteos que alimentaban al primero, los imports sin uso de `historyStore` y `classifyElement`, y
`TabGroup.badge`, un campo que ningún grupo seteó nunca.

### 1.4 Tres aserciones de ubicación, repuntadas y **no** debilitadas

`convention-regression-gates` y `zup-field-names` (×2) asertaban **contra `ProPanel.svelte`** que
el Mu por combinación del reporte es el momento del eje **fuerte** y que su tabla de cargas usa los
helpers canónicos `get2DDisplay*`. Los dos reclamos no cambiaron; se movió el archivo que tiene el
código.

**Es la cuarta vez en esta serie** que mover algo deja una aserción nombrando el lugar viejo. §7.7
de `f3-command-relocation-audit.md` registra las tres primeras, y la regla que enuncia —grepear el
contenedor viejo antes de correr nada— es lo que las encontró en segundos.

---

## 2. El reporte de esfuerzos crudos

`lib/flow/rc-forces-report.ts` tenía el contrato y ningún consumidor desde F0. Éste es el
consumidor. Todo lo que emite sale de `AnalysisResults3D` o de los diagramas del propio motor
evaluados en una estación.

### 2.1 Dónde vive, y por qué no en Documentos

En la solapa **Resultados**, como una respuesta más a *"qué salida estoy leyendo"*, que es la
pregunta que esa franja ya hace.

**No en Documentos.** §5 mantiene resultados crudos y diseño de armaduras como dos documentos, y
Documentos —al lado de los planos y la planilla de doblado— es el único lugar donde un lector
razonablemente supondría lo contrario.

### 2.2 Qué sale

Cinco hojas, en el orden del contrato sea cual sea el orden en que se pidieron: reacciones,
desplazamientos, esfuerzos en extremos, estaciones, y todas las estaciones que calculó el motor.
XLSX recibe una hoja por sección vía `exportToExcel({ onlyExtras })`; la página imprimible renderiza
**las mismas** `sheets`, así que una planilla y una impresión no pueden discrepar sobre un número.
Es la regla que `currentDoc()` ya hace cumplir sobre las exportaciones de detallado.

Tres reglas del contrato, ahora sostenidas por tests:

- **una selección de barras acota las tablas de barras y NUNCA las reacciones.** Una reacción de
  vínculo es una propiedad del modelo; filtrarla por una selección produce una tabla que no
  equilibra, y eso se lee como un defecto del solver. Los **desplazamientos sí** se acotan, a los
  nodos que esas barras tocan, y la hoja lo dice.
- **elegir la convención de cuartos nunca esconde una estación crítica.** `rawStations` es hoja
  propia y no una alternativa.
- **una sección pedida que no tiene nada igual produce su hoja**, con encabezado y nota. Una
  solapa ausente se lee como "no la pedí"; una vacía, como "la pedí y no había nada". Son
  respuestas distintas.

`comboIds` conserva la distinción `null` / `[]`: `null` es todas las combinaciones calculadas, `[]`
es ninguna elegida y bloquea. La combinación es la **primera columna de cada tabla** y no una
solapa por combinación: treinta combinaciones no son treinta solapas.

### 2.3 Hubo que partir el extractor de estaciones

`buildCriticalStations` y `extractForcesAtStation` vivían en `station-design-forces.ts`, que
importa `design/design-axes` y `design/outcome`. Importar eso desde un reporte de resultados crudos
es la mezcla que §5 prohíbe, **a nivel de import**.

Reimplementarlos del lado crudo era la otra opción y es peor: dos definiciones de *"las estaciones
que usó el motor"* es cómo un reporte termina discrepando con el diseño que tiene al lado. Así que
la mitad libre de diseño se mudó a **`station-forces.ts`**, sin cambios, y `station-design-forces.ts`
reexporta las tres. **Ningún llamador de diseño cambió.**

> Ojo con el reexport: `export { x } from './y'` **no** crea un binding local. El archivo importa y
> reexporta, porque además las usa.

### 2.4 Lo que se niega a afirmar

`FORCES_REPORT_IS_NOT` viaja en cada documento y se imprime **arriba** de las tablas, y en pantalla
**arriba** del botón: no es un diseño, no es documentación constructiva, no lleva verificación
reglamentaria. Una tabla de momentos al lado de un nombre de obra parece un reporte de cálculo, y
una salvedad que el lector alcanza después de cuarenta páginas de momentos ya falló. Mismo
razonamiento que `EXPORT_CANNOT_ASSERT`.

La grilla de cuartos **se nombra como convención** al lado del control que la elige, y la misma
frase queda estampada en el archivo. Cinco números equiespaciados parecen un resultado y son una
elección.

### 2.5 Dos correcciones encontradas en el camino

- **`design.forcesReport.needStations` decía la condición equivocada:** *"Recalculá con
  combinaciones definidas"*. `extractForcesAtStation` evalúa los diagramas del motor y necesita
  esfuerzos de extremo de barra, no combinaciones. El mensaje nombra lo que realmente falta.
- **La franja de `ProResultsTab` tenía la consulta cableada por id en tres lugares** para que un
  conteo cero no la deshabilite. Eso es una propiedad —`always`— y el reporte la tiene también,
  por el mismo motivo: es una configuración, no una tabla de filas.

### 2.6 No escribe `ExportRecord`, a propósito

`exportRecordStore` está keyeado por el `seriesId` de un documento de detallado y sus filas llevan
los miembros retocados a mano **de ese documento**. Un reporte de esfuerzos no tiene ni serie ni
retoques, y un `seriesId` fabricado metería una fila en la lista de emisiones de detallado
reclamando una revisión de plano con la que no tiene nada que ver.

Lo que hace en cambio es decir qué acaba de producir, y decir cuándo falló.

---

## 3. Verde, con exit code

```
npm run typecheck   → 0   (479 = baseline, ninguno nuevo)
npm run build       → 0   (ProPanel y ProForcesReport sin warnings propios)
npm run test        → 0   (las dos pasadas, unit + build)
```

E2E, `E2E_PORT=6311` dedicado:

```
f5-forces-report (10)  · pro-panel-consistency · pro-panel-structure · pro-project-files
pro-workflow-shell     · pro-design-gates      · f1-stage-timeline   · f2-design-stage
rc-workflow-reachable  · h1b-panel-navigation  · h1c-documents-flow  · concrete-copy-contrast
                                                        → 172 pasan, 0 fallan
```

Unitarios del área: `forces-report` 24 ✅ · `rc-forces-report` 18 ✅ · `rc-design-gates` 33 ✅ ·
`convention-regression-gates` 27 ✅ · `zup-field-names` 20 ✅ · flow + auditores de color/token 268 ✅ ·
paridad i18n de 13 locales 123 ✅.

**38 claves nuevas en los catorce locales**, reales en en/es/pt e inglés en el resto, que es la
convención que este árbol ya sigue.

---

## 4. Un hallazgo que no arreglé, y hay que decidir

**`ProPanel.examples()` no tiene disparador en escritorio.** `ProRibbon` declara y destructura
`onExamples`, y **nunca lo invoca**; el `pro-example-btn` de escritorio se borró cuando las
acciones se volvieron comandos del ribbon, y por eso su CSS estaba muerto. Así que la galería sólo
se abre desde el botón `pm-example` de móvil.

En escritorio la galería real es la de `ProProjectTab`, que consume los mismos grupos. **No es una
regresión de este trabajo** y no lo toqué: borrar una galería es una decisión de producto y agregar
un comando al ribbon está prohibido por §2.1 de `h1-h2-scope-split.md`. Es la **cuarta forma de
esconder un comando** de §0 del audit de F3, y merece quedar escrita: *cableado de punta a punta y
sin nadie que lo llame*.

---

## 5. Lo que sigue — F4, y es menos de lo que parece

El enunciado de §4 en `h1-h2-scope-split.md` suena grande, pero los objetivos 7 a 11 de F3 ya
entregaron la mayor parte. Auditado contra el árbol de hoy:

| lo que pide §4 | estado | dónde |
|---|---|---|
| planos de detalle (PDF/CAD) | ✅ | `doc-report`, `doc-dxf` |
| planilla de doblado (Excel) | ✅ | `doc-xlsx` + `renderSchedule` |
| listado (Excel) | ✅ | mismo workbook |
| arquitectura lista para reportes de esfuerzos | ✅ | y ahora **implementado**, fuera de Documentos (§2.1) |
| cada exportación declara **revisión** | ✅ | `RcExportLog` |
| … **tipo** | ✅ | `detailing.exports.kind.*` |
| … **estado de generación** | ✅ | `data-state`: `current` / `stale` / `failed` |
| … **retocados a mano** | ✅ | `retouchedIn` / `retouchSplitIn` |
| … **limitaciones reales** | ✅ | `EXPORT_CANNOT_ASSERT`, una vez bajo la lista |
| … **elementos incluidos** | ⛔ | **se registra en `ExportRecord.elements` y no se muestra en ninguna parte** |
| **selección de qué documentar** | ⛔ | no existe: el documento cubre lo que tenga el ensamble seleccionado |
| **previsualización** de plano y planilla | ⚠️ | `SheetPreview.svelte` existe y está montado **sólo** dentro de `DetailingWorkflow` (etapa Detalle), no al lado de las exportaciones |
| la diferencia conceptual con Detalle, **escrita en la pantalla** | ⚠️ | está en el comentario de cabecera de `DocumentsSection`, hay que ver cuánto llega al usuario |

**Son tres huecos reales y uno a verificar.** El más caro es la selección de qué documentar, porque
toca `buildDocument` y por lo tanto el alcance que estampan las tres exportaciones —y eso se cruza
con `design-convergence.ts`, que ya tiene su propia noción de alcance por familias. **Leer
`detailing-convergence.md` §2 antes de diseñarlo:** si la selección de documentado es un tercer
denominador, van a existir tres respuestas a "qué cubre esto".

El de **elementos incluidos** es el patrón de §9.6.1 otra vez —contrato escrito, sin consumidor— y
es de una tarde.

### F6 y F7, sin auditar todavía

- **F6 (§6, visor 3-D):** avisos compactos de provisional y torsión con cierre persistente en la
  sesión, y panel de selección a la derecha. **Hay base que no revisé:** `ProvisionalBanner.svelte`,
  `TorsionBanner.svelte` y `RebarStatusPanel.svelte` ya existen. Auditar antes de construir.
- **F7 (§7, performance):** instrumentar antes de optimizar. `rebarSceneBuilds()` y
  `sceneCacheStats()` ya están en `e2e-hooks.ts`. Ni optimización a ciegas ni barras de progreso
  falsas.

**H2 no está completo.** Faltan F4, F6 y F7.

---

## 6. Reglas vigentes de la rama, sin cambios

No tocar H1, solver, Rust, Cargo ni WASM. Ni `WorkflowStages.svelte` ni `ProRibbon.svelte`. Sin
snapshots ni timeouts inflados. Playwright con `E2E_PORT` dedicado, **nunca 4173**. Servidor manual
final en **4003**. Commits y descripción del PR en inglés. PR en draft. Sin `Co-authored-by`.
