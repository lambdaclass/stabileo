# M1 + M2 — inventario de QA manual, previo al merge

Continúa `m1-m2-audit.md`, `m1-m2-ci-audit-and-three-decisions.md` y
`m1-m2-open-findings-proposals.md`. **No agrega código, no abre PR y no toca ninguna rama.**

Lo que sigue es la lista completa de lo que un usuario puede tocar en M1 + M2 desde
`http://127.0.0.1:4004`, con la ruta exacta para llegar, los pasos, el resultado esperado y lo que
hay que mirar aunque los tests estén verdes. **Un test verde no es QA visual**: la suite afirma que
un elemento existe, que un estado no dice «verificado» y que un número cambia cuando cambia su
entrada. No afirma que algo quepa, que se lea, que aparezca en el momento correcto ni que el dibujo
sea el correcto.

---

## 0 · Preparación, y la trampa del puerto

**Servidor:** `http://127.0.0.1:4004` — **no** `localhost:4004`.

Verificado al escribir este documento:

```
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4004/     → 200
lsof -nP -iTCP:4004 -sTCP:LISTEN                                    → node, pid 15965
lsof -a -p 15965 -d cwd                                             → .../stabileo-steel/web
git -C .../stabileo-steel rev-parse --abbrev-ref HEAD               → feat/pro-steel-m2
```

**El 4004 sirve M1 + M2 juntas**, porque M2 contiene M1 por merge. Eso es lo que se quiere probar y
es lo único que se puede probar acá: **no hay forma de recorrer M1 sola desde este puerto**. Si
hiciera falta, es otro worktree en otro puerto — nunca el 4173, que ya se ocupó una vez con el
preview de otra rama y midió el bundle equivocado.

**Viewport:** 1280×720 para todo. Varios ítems son específicamente sobre ese tamaño.

**Idioma:** los ítems marcados **[3×]** se repiten en `Español` / `English` / `Português`.

### 0.1 Navegación, una sola vez

| Destino | Ruta |
|---|---|
| **Secciones** | Modo PRO → cinta **Modelo** → grupo *Propiedades* → **Secciones** |
| **Materiales** | cinta **Modelo** → *Propiedades* → **Materiales** |
| **Generadores** | cinta **Modelo** → *Generadores* → **Estructuras metálicas** |
| **Workflow metálico** | cinta **Diseño** → *Metálicas* → **Diseño de perfiles** |
| **Uniones** | cinta **Diseño** → *Metálicas* → **Uniones metálicas** |
| **Calcular** | cinta **Análisis** → *Ejecutar* → **Calcular** |
| **Ejemplos** | botón **Ejemplos** del panel PRO → grupo *Industrial* → **Nave Industrial** |
| **Conformados C/Z** | Workflow metálico → pie **Límites y autoridad** → panel metálico → sección de conformados |

### 0.2 Modelos de prueba, y cuál sirve para qué

| Modelo | Cómo se consigue | Para qué |
|---|---|---|
| **Vacío** | recargar | estados vacíos de todos los paneles |
| **Cabriada generada** | Generadores → Cabriada → Generar | nudos metálicos, uniones, composición |
| **Nave industrial** | Ejemplos → Industrial → Nave Industrial | 633 elementos, 232 nudos, rendimiento 3D, A36 |
| **Nave calculada** | la anterior + **Calcular** | solicitaciones, J.3.6, J.3.7, J.3.10, estado `designed` |
| **Hormigón** | Ejemplos → `rc-design-qa-8` | «tiene nudos y ninguno es metálico» |
| **Mixto** | cargar hormigón y generar una cabriada encima | nudo mixto, split por material |

> `portico2d` **no existe** como ejemplo. Está anotado en `m1-qa-checklist.md` §8 y se repite acá
> porque es el error que hace perder diez minutos.

### 0.3 Las cinco categorías

| Categoría | Qué significa |
|---|---|
| **QA obligatorio** | no se mergea sin que una persona lo haya visto en pantalla |
| **QA recomendado** | conviene mirarlo, pero un fallo acá no bloquea |
| **Sólo verificación automática** | la suite lo cubre y mirarlo a mano no agrega nada |
| **Limitación conocida** | se comporta así a propósito; el QA es confirmar que la app lo *dice* |
| **Fuera del alcance actual** | no está implementado; el QA es confirmar que no aparenta estarlo |

### 0.4 Cómo leer cada entrada

Cada función lleva: nombre visible · archivo · módulo técnico · rama/PR · acceso · precondiciones ·
pasos · esperado · estados alternativos · riesgos · qué modelo requiere · limitación normativa ·
categoría. Donde una entrada no tenga precondición o limitación, dice **—**.

**Ramas:** M1 = PR **#156** (`feat/pro-steel-m1`, base `main`). M2 = PR **#164**
(`feat/pro-steel-m2`, base `feat/pro-steel-m1`). «Compartida» = superficie que también usa hormigón
o Basic.

**Prioridad:** las entradas revisadas llevan **crítica / alta / media / baja**. Donde no la lleven,
la categoría manda: *QA obligatorio* se lee como **alta** salvo que diga otra cosa.

### 0.5 Revisión del 2026-08-27 — seis entradas cambiaron de veredicto

Este inventario se escribió **antes** de que entraran B-01, I-06, I-07 e I-08 a M2. Cinco entradas
describían el estado anterior y **cuatro de ellas afirmaban lo contrario de lo que la rama hace
hoy**. Eso no es una imprecisión de redacción: un revisor que siguiera la entrada vieja iba a
esperar el defecto, encontrar el arreglo, y reportar el arreglo como defecto — o peor, concluir que
la rama está rota.

| Entrada | Decía | Dice ahora | Commit |
|---|---|---|---|
| **B-01** | tres vías de alta de material conviven; decisión de producto pendiente | **el diálogo es la única vía**; ya no hay decisión pendiente | `9ed71247` |
| **B-13** | material a medida como control inline, validado con `isNaN` | **división del diálogo**, con cotas sobre la física y coma decimal | `9ed71247` |
| **I-06** | las uniones **no** se guardan; fuera de alcance | **se guardan** en `StructureModel.jointDesigns`; sólo las elecciones | `d12ad5cb` |
| **I-07** | posible arrastre entre modelos, a verificar | **reconciliación en cada lectura**, con tres razones y dos remedios | `d12ad5cb` |
| **I-08** | el link pierde cuatro campos | **las uniones viajan** (`SHARE_VERSION 5`, clave `jd`); los cuatro campos de sección siguen sin viajar | `9c9f9506` |
| **E-25** | *(no existía)* | **superficie nueva**: aviso de uniones obsoletas | `d12ad5cb` |

Lo que **no** cambió: A-01 sigue siendo la decisión de producto abierta, y sigue documentada en
`a-01-decision.md`. Es la simétrica de B-01 para **secciones**, y es la única de las dos que queda.

---

# A · Selector de secciones

Precondición común a todo el bloque: estar en PRO, pestaña **Secciones**. Ninguna necesita modelo
cargado salvo donde se diga.

---

### A-01 · Botón único de alta

- **UI:** *Agregar sección* — un botón, sin desplegable alrededor.
- **Archivo:** `web/src/components/pro/ProSectionsTab.svelte`
- **Técnico:** `applyChoice()` → `toSectionFields(choice, 0)` → `modelStore.addSection`
- **Rama:** **M2** (`4a458b39`, decisión 1). Modificada: el panel pasó de 724 a 205 líneas.
- **Acceso:** cinta **Modelo** → *Propiedades* → **Secciones**.
- **Precondiciones:** —
- **Pasos:** 1) abrir Secciones; 2) contar cuántos controles del panel dan de alta una sección.
- **Esperado:** **exactamente uno**, y abre el diálogo. No hay tira de familias, ni buscador, ni
  tabla de perfiles, ni formulario de construcción inline. Debajo queda la tabla de secciones del
  modelo, que es de lectura y borrado.
- **Estados alternativos:** modelo sin secciones → «no hay secciones» en la tabla.
- **Riesgos:** es **la divergencia de mayor alcance de M2** — se retiró también el *builder*
  inline, que la propuesta escrita decía no tocar. Si el criterio era conservarlo, esto se revierte
  ahora y no después del merge.
- **Requiere:** —
- **Normativa:** —
- **Categoría:** **QA obligatorio**

---

### A-02 · El diálogo: centrado, modal, con trampa de foco

- **UI:** *Elegir sección* — diálogo centrado sobre fondo oscurecido.
- **Archivo:** `web/src/components/pro/section/ProSectionModal.svelte`
- **Técnico:** `role="dialog"`, `aria-modal`, `keydown()` con ciclo de Tab, `$effect.pre` con
  `wasOpen` para capturar y restaurar el foco
- **Rama:** **M2** (`9567636b`, corregido en `ca20995b`). Nueva.
- **Acceso:** Secciones → *Agregar sección*.
- **Precondiciones:** —
- **Pasos:** 1) abrir con **Enter** desde el botón; 2) tabular hasta el último control y una vez
  más; 3) Shift+Tab desde el primero; 4) **Escape**.
- **Esperado:** el foco cicla **dentro** del diálogo en las dos direcciones; Escape cierra sin
  aplicar; el foco vuelve al botón `Agregar sección` y se le ve el anillo.
- **Estados alternativos:** clic en el fondo oscurecido también cierra (el backdrop es un `<button>`
  con nombre accesible).
- **Riesgos:** el foco se restauraba a `<body>` y se corrigió con `$effect.pre` — es sensible al
  orden de efectos de Svelte 5. Cualquier hijo nuevo que enfoque al montar lo puede volver a romper.
- **Requiere:** —
- **Normativa:** —
- **Categoría:** **QA obligatorio**

---

### A-03 · División «Elegir sección estándar»

- **UI:** pestaña **Elegir sección estándar** (activa al abrir).
- **Archivo:** `ProSectionModal.svelte` → `ProfileSelectorPanel.svelte`
- **Técnico:** `type Division = 'standard' | 'build'`
- **Rama:** **M2** (shell) sobre panel de **M1**.
- **Acceso:** el diálogo abre acá.
- **Precondiciones:** —
- **Pasos:** contar las divisiones del `role="tablist"`.
- **Esperado:** **exactamente dos** — estándar y construcción.
- **Estados alternativos:** —
- **Riesgos:** —
- **Requiere:** —
- **Normativa:** —
- **Categoría:** **QA recomendado**

---

### A-04 · Ausencia de sección amorfa

- **UI:** no hay una tercera división.
- **Archivo:** `ProSectionModal.svelte`
- **Técnico:** el tipo `Division` es la garantía; hay un test que falla si aparece una tercera
- **Rama:** **M2**. Nueva.
- **Acceso:** el diálogo.
- **Precondiciones:** —
- **Pasos:** confirmar que **no** se puede crear una sección tipeando sólo área e inercia.
- **Esperado:** no existe ese camino en PRO. Basic sí lo tiene, y es deliberado: una sección sin
  estructura no se clasifica, no se dibuja, no se compone y no se verifica contra una cláusula.
- **Estados alternativos:** —
- **Riesgos:** **es una capacidad que Basic tiene y PRO no.** Si alguien la usaba en PRO, se perdió.
- **Requiere:** —
- **Normativa:** —
- **Categoría:** **Sólo verificación automática**

---

### A-05 · División «Construir sección»

- **UI:** pestaña **Construir sección** → plantillas de pared delgada y macizas.
- **Archivo:** `web/src/components/pro/section/BuiltSectionPanel.svelte`
- **Técnico:** `SECTION_SHAPES` / `THIN_SHAPES` / `SOLID_SHAPES`, `computeSectionProperties()`,
  `toSectionFields()` rama `built`
- **Rama:** **M2** (`9567636b`); el contrato `built` es de **M1** (`ae3a6186`).
- **Acceso:** diálogo → pestaña **Construir sección**.
- **Precondiciones:** —
- **Pasos:** 1) elegir `hollow-rect`; 2) escribir b, h, tw, tf; 3) mirar las propiedades
  (`section-build-props`) mientras se tipea; 4) **Aplicar**; 5) mirar la fila nueva en la tabla.
- **Esperado:** las propiedades se recalculan a cada cambio; Aplicar está **deshabilitado** mientras
  un campo esté a medio escribir (un número parcial lee `null`, no «el último valor bueno»); la
  sección entra con área e inercias correctas.
- **Estados alternativos:** composición y rotación **no** se ofrecen acá — una disposición coloca
  copias de un perfil de catálogo y una sección construida no tiene parte de catálogo.
- **Riesgos:** las ocho plantillas dibujan contorno propio; ninguna cae al `default:`. Eso se fijó
  en `built-section-contract.test.ts`, pero el dibujo se ve a ojo y conviene mirarlo.
- **Requiere:** —
- **Normativa:** —
- **Categoría:** **QA obligatorio**

---

### A-06 · Los espesores de una sección construida (`tw`, `tf`, `t`, `tl`)

- **UI:** invisible — se ve en que la sección construida **se dibuja** en 3D.
- **Archivo:** `web/src/lib/section/section-choice.ts`
- **Técnico:** rama `built` de `toSectionFields`; `resolveCanonicalSection` llama
  `need('b','h','tw','tf')`
- **Rama:** **M2** (`806e1289`, prerrequisito de la decisión 1). Modificada.
- **Acceso:** Construir sección → aplicar → asignar a un elemento → visor en modo secciones.
- **Precondiciones:** un elemento al que asignar la sección.
- **Pasos:** 1) construir un `hollow-rect`; 2) asignarlo a un elemento; 3) ver el modelo con
  secciones.
- **Esperado:** **se extruye**. Antes de `806e1289` una sección construida por el modal resolvía
  `properties-only` con `missing: ['tw','tf']` y no se dibujaba, mientras la construida por el
  formulario inline resolvía `geometry-backed`.
- **Estados alternativos:** una plantilla maciza no tiene espesores y eso es correcto.
- **Riesgos:** **nada lo detectaba** porque las propiedades eran idénticas por los dos caminos: el
  área, la inercia, la masa y todo resultado del solver coincidían, y sólo difería la geometría.
  Ésta es la razón por la que este ítem es obligatorio y no automático.
- **Requiere:** —
- **Normativa:** —
- **Categoría:** **QA obligatorio**

---

### A-07 · Búsqueda del catálogo

- **UI:** caja de búsqueda, enfocada al abrir el diálogo.
- **Archivo:** `web/src/components/pro/generators/ProfileSelectorPanel.svelte`
- **Técnico:** `searchProfiles()` sobre `steelProfileSource`
- **Rama:** el buscador ya estaba en `main`; **M2** lo embebió en el diálogo y `ca20995b` le
  devolvió el foco inicial. Modificada.
- **Acceso:** diálogo → división estándar.
- **Precondiciones:** —
- **Pasos:** 1) al abrir, mirar dónde está el cursor; 2) tipear `IPE 200`; 3) tipear `ipe200`;
  4) tipear `IPE  200`.
- **Esperado:** el cursor arranca **en el buscador**, no en la pestaña de división; las tres formas
  de tipearlo dan el mismo resultado; el contador (`profile-count`) dice cuántos quedan y con
  «IPE 200» queda **1**.
- **Estados alternativos:** búsqueda sin resultados → estado vacío que dice **qué filtro soltar**.
- **Riesgos:** este foco es exactamente lo que rompió `ca20995b`. Si el cursor aparece en la
  pestaña, ArrowDown recorre las pestañas y no la lista: el camino teclear→flecha→Enter deja de
  funcionar.
- **Requiere:** —
- **Normativa:** —
- **Categoría:** **QA obligatorio**

---

### A-08 · Filtros: familia, organismo, código de diseño, altura

- **UI:** chips de familia, chips de organismo, desplegable de código, dos campos de altura.
- **Archivo:** `ProfileSelectorPanel.svelte`
- **Técnico:** `queryProfiles()` en `lib/profiles/catalogue.ts`
- **Rama:** los chips de familia ya estaban en `main`; **organismo, código de diseño y altura son
  de M1** (`4504845c`, `956defce`). Nuevos en M1.
- **Acceso:** diálogo → división estándar.
- **Precondiciones:** —
- **Pasos:** 1) organismo **IRAM-IAS** + familia **L**; 2) organismo **CEN** + familia **L**;
  3) código **CIRSOC 301**; 4) altura `200`–`300`; 5) vaciar el campo de altura máxima.
- **Esperado:** (1) **once** filas, todas con etiqueta `IRAM-IAS`; (2) las europeas, sin etiqueta;
  (3) desaparecen IPE/HEA/HEB; (4) sólo h entre 200 y 300 mm **inclusive** en los dos extremos;
  (5) el límite desaparece — un campo vacío es «sin límite», nunca cero.
- **Estados alternativos:** combinación imposible → estado vacío con instrucción.
- **Riesgos:** el filtro por altura es `input[type=number]`: **no se puede** dejar a medio escribir,
  el navegador rechaza la pulsación no numérica. El camino NaN existe y está testeado a nivel
  unitario pero **no es alcanzable desde este control**.
- **Requiere:** —
- **Normativa:** —
- **Categoría:** **QA obligatorio**

---

### A-09 · Las quince familias

- **UI:** chips `IPN · IPE · HEB · HEA · W · HP · M · UPN · C · MC · T · L · RHS · SHS · CHS`.
- **Archivo:** `web/src/lib/data/steel-profiles.ts:253` (`FAMILY_LIST`)
- **Técnico:** `PROFILE_FAMILIES`, `familyToShape()`
- **Rama:** compartida; **M1** la publicó al selector, **M2** la dejó como única fuente.
- **Acceso:** diálogo → división estándar.
- **Precondiciones:** —
- **Pasos:** recorrer las quince y confirmar que **todas** tienen filas.
- **Esperado:** las quince presentes. Conteo medido en la auditoría: IPN 21 · IPE 18 · HEB 19 ·
  HEA 19 · W 267 · HP 11 · M 6 · UPN 12 · C 28 · MC 33 · T 11 · L 37 · RHS 55 · SHS 89 · CHS 95 —
  **721 perfiles**.
- **Estados alternativos:** con un filtro de organismo o código activo, una familia puede quedar
  vacía y eso es correcto.
- **Riesgos:** el mapa familia→forma se corregía a mano en `ProSectionsTab` y **ocho de quince
  divergían** (siete a CHS, HEA a `'H'`). Ese archivo ya no lo hace; la fuente es `familyToShape`,
  que es exhaustivo por construcción. Conviene confirmar en pantalla que un perfil **W** se dibuja
  como doble T y no como tubo redondo.
- **Requiere:** —
- **Normativa:** —
- **Categoría:** **QA obligatorio**

---

### A-10 · Encabezados de grupo con su norma dimensional, y las «2 normas» de L

- **UI:** cada grupo de familia muestra su norma; el grupo **L** muestra **«2 normas»** en itálica.
- **Archivo:** `ProfileSelectorPanel.svelte` (`profile-group-*`, `profile-group-mixed-*`)
- **Técnico:** `FAMILY_CLASSIFICATION`, `ownStandardFor()`
- **Rama:** **M1** (`956defce`). Nueva.
- **Acceso:** diálogo → división estándar.
- **Precondiciones:** —
- **Pasos:** 1) mirar `EN 10365`, `DIN 1025-1`, `IRAM-IAS U 500-215-6`; 2) buscar el grupo **L**;
  3) hover sobre «2 normas»; 4) mirar las filas de L.
- **Esperado:** tooltip con las dos designaciones; las filas IRAM llevan etiqueta chica `IRAM-IAS`
  y las europeas (`L 50x50x5`, `L 100x100x10`) no llevan nada.
- **Estados alternativos:** —
- **Riesgos:** las designaciones **no se traducen** — deben verse iguales en los tres idiomas.
- **Requiere:** —
- **Normativa:** norma **dimensional**, no código de diseño. La distinción es el motivo de que
  `section-catalog.ts` exista.
- **Categoría:** **QA recomendado** **[3×]**

---

### A-11 · Comparación de hasta tres perfiles

- **UI:** botón **⊕** en cada fila; tabla comparativa al pie.
- **Archivo:** `ProfileSelectorPanel.svelte` (`profile-pin-*`, `profile-compare`)
- **Técnico:** `COMPARED`, `profile-compare-clear`
- **Rama:** **M1** (`4504845c`). Nueva.
- **Acceso:** diálogo → división estándar.
- **Precondiciones:** —
- **Pasos:** 1) ⊕ en `IPE 200`, `HEA 200`, `HEB 200`; 2) ⊕ en un cuarto; 3) cambiar los filtros
  hasta que ninguno de los tres esté en la lista; 4) vaciar la comparación.
- **Esperado:** tabla con tres columnas y las filas h, A, masa, Iy, Wy, ry, Iz, Wz, rz; el cuarto
  **no entra**; **la comparación sobrevive al filtro que esconde sus filas** — ése es el punto;
  vaciar la cierra.
- **Estados alternativos:** un solo perfil comparado ya muestra la tabla.
- **Riesgos:** **a 1280×720 la tabla debe scrollear dentro de su propio contenedor y el panel no
  debe scrollear de costado.** Es el ítem de layout más frágil del selector.
- **Requiere:** —
- **Normativa:** —
- **Categoría:** **QA obligatorio**

---

### A-12 · Composición: las siete disposiciones

- **UI:** desplegable **Composición**.
- **Archivo:** `ProSectionModal.svelte` (`section-arrangement`)
- **Técnico:** `BUILT_UP_ARRANGEMENTS`, `availableArrangements()`, `canCompose()`,
  `built-up-section.ts`
- **Rama:** **M2** (`842cb5ab`, `9567636b`). Nueva **fuera** de un generador.
- **Acceso:** diálogo → división estándar → panel derecho.
- **Precondiciones:** un perfil que resuelva geometría (IPE, HEA, L…).
- **Pasos:** 1) con `IPE 200` abrir el desplegable; 2) elegir una compuesta; 3) mirar la
  previsualización.
- **Esperado:** **siete** disposiciones; la figura muestra **la disposición**, no sólo el perfil.
- **Estados alternativos:** con un perfil properties-only la lista se acorta — ver **A-15**.
- **Riesgos:** esto es lo que **no se podía hacer antes** fuera de un generador. Una sección
  compuesta creada acá y una creada dentro de un generador tienen que ser el **mismo objeto**
  (`ProfileSpec`): mismo `arrangement`, mismo `gapMm`, misma `rotationDeg`.
- **Requiere:** —
- **Normativa:** §E.6.1 clasifica las barras armadas en cinco grupos — ver bloque **G**.
- **Categoría:** **QA obligatorio**

---

### A-13 · Espalda con espalda, y el huelgo

- **UI:** disposición *espalda con espalda* + campo **Huelgo** (mm).
- **Archivo:** `ProSectionModal.svelte` (`section-gap`)
- **Técnico:** `parseNumericInput(value, { min: 0, zero: 'valid' })`, `isCompound()`
- **Rama:** **M2** (`9567636b` + `09fa7635`). Nueva.
- **Acceso:** diálogo → composición compuesta.
- **Precondiciones:** disposición compuesta elegida.
- **Pasos:** 1) elegir espalda con espalda; 2) confirmar que aparece el campo Huelgo; 3) escribir
  `12`; 4) escribir `0`; 5) escribir `-5`.
- **Esperado:** el campo **sólo aparece si la disposición es compuesta**; `12` se guarda; **`0` se
  guarda como 0 y sin mensaje de error** — cero es una entrada válida, es el contacto continuo;
  `-5` se **rechaza con mensaje** (`section-gap-problem`) y la caja vuelve a mostrar el valor
  almacenado.
- **Estados alternativos:** disposición cerrada (cajón) → nota
  `generator.builtUp.torsion.closedCellNotComputed`.
- **Riesgos:** el patrón `Number(x) || default` convertía un 0 deliberado en 10 y **hacía
  inalcanzable el Grupo I de §E.6.1**. Es el defecto que originó toda la auditoría del cero. Si la
  caja acepta `-5` en silencio o convierte `0` en otra cosa, es regresión de primera prioridad.
- **Requiere:** —
- **Normativa:** §E.6.1 — huelgo 0 es Grupo I (cordones en contacto continuo, **sin presillas**).
- **Categoría:** **QA obligatorio**

---

### A-14 · Rotación

- **UI:** desplegable **Rotación**: automática, 0°, 90°, 180°, 270°.
- **Archivo:** `ProSectionModal.svelte` (`section-rotation`)
- **Técnico:** `ProfileSpec.rotationDeg`, `resolveRotationDeg()`
- **Rama:** **M2**. Nueva fuera de un generador.
- **Acceso:** diálogo → división estándar.
- **Precondiciones:** —
- **Pasos:** 1) elegir 90°; 2) mirar la previsualización; 3) aplicar; 4) asignar a un elemento y
  ver el modelo con secciones.
- **Esperado:** la figura gira; la sección entra al modelo con la rotación registrada.
- **Estados alternativos:** `auto` significa «diferir al roll del miembro». Una sección creada en
  esta pestaña **no pertenece a ningún miembro todavía**, así que `applyChoice` pasa `0`
  explícitamente. Eso es correcto y está comentado en el código.
- **Riesgos:** `auto` aplicado desde acá no tiene a qué diferir. Conviene ver qué muestra la figura
  con `auto` elegido y si eso confunde.
- **Requiere:** —
- **Normativa:** —
- **Categoría:** **QA obligatorio**

---

### A-15 · Rechazo de disposición compuesta para una familia properties-only

- **UI:** nota `section-refused` bajo los controles.
- **Archivo:** `ProSectionModal.svelte`, `lib/engine/generators/profile-resolve.ts`
- **Técnico:** `refused = BUILT_UP_ARRANGEMENTS.length - arrangements.length`
- **Rama:** **M1** (regla) + **M2** (superficie). Modificada.
- **Acceso:** diálogo → elegir un **MC** (p. ej. `MC18x58`).
- **Precondiciones:** —
- **Pasos:** 1) buscar `MC18x58`; 2) abrir el desplegable de composición; 3) leer la nota.
- **Esperado:** la lista de disposiciones **se acorta** y la nota nombra el perfil y la familia, y
  dice que el centroide es desconocido. **MC no dibuja previsualización** — es correcto: es la
  familia properties-only, y dibujar un contorno inventado es justo lo que el alcance prohíbe.
- **Estados alternativos:** si venía con una compuesta elegida y se cambia a MC, la disposición
  **cae a `single`** en vez de quedar en un estado que nada puede construir.
- **Riesgos:** que la opción desaparezca en silencio sin la nota. El conteo de rechazadas existe
  justamente para que no pase.
- **Requiere:** —
- **Normativa:** —
- **Categoría:** **QA obligatorio**

---

### A-16 · Ficha de propiedades

- **UI:** desplegable **Ficha de la sección** en el panel derecho.
- **Archivo:** `web/src/components/pro/section/SectionDataSheet.svelte`
- **Técnico:** `sectionDataSheet()` en `lib/section/data-sheet.ts`
- **Rama:** **M2** (`9567636b`) sobre las propiedades de **M1** (`b2a559e3`). Nueva.
- **Acceso:** diálogo → división estándar → abrir la ficha.
- **Precondiciones:** un perfil de catálogo elegido.
- **Pasos:** con **IPE 200**, **UPN 200**, **MC18x58**, **W12x26**, **IPN 200** y **C9x20**,
  recorrer identidad, centroide, propiedades, «lo que esta fuente no da» y limitaciones.
- **Esperado:**
  - **IPE 200** — `Wy ≈ 194 cm³` y `Wz ≈ 28 cm³` con `derivado de la geometría`; `ry ≈ 8,26 cm` con
    `derivado de tabla`; **J → no disponible**, con el motivo «no se deriva del contorno: la
    aproximación poligonal no es J»; `r = 12 mm` con `de tabla`;
  - **UPN 200** — `Wz` **con nota** de que la sección no es simétrica respecto de ese eje y que se
    muestra el módulo **mínimo**; el valor debe estar **entre 20 y 30 cm³**. Si se ve ≈ 39, está
    usando medio ancho y es un bug;
  - **MC18x58** — `Wz` y `r` **no disponibles**, con el motivo del centroide desconocido y «radio de
    acuerdo no publicado»;
  - **W12x26** — `r` `derivado de tabla`, despejado del alma libre (`hw = d − 2(tf + r)`);
  - **IPN 200** — `r` no disponible con «la norma no lo tabula: fija los radios como reglas…».
    **No** debe decir que falta un dato: el contorno es exacto;
  - **C9x20** — `r` no disponible con «el 0 del dato es una ausencia, no un radio nulo publicado».
- **Estados alternativos:** familia properties-only → sección «lo que esta fuente no da» larga.
- **Riesgos:** cuatro casos distintos de «no disponible» con cuatro motivos distintos. Que dos de
  ellos digan lo mismo es el bug a buscar.
- **Requiere:** —
- **Normativa:** —
- **Categoría:** **QA obligatorio** **[3×]**

---

### A-17 · Procedencia de cada número

- **UI:** tercera columna de la tabla de propiedades, en cada fila.
- **Archivo:** `SectionDataSheet.svelte` (`sheet-basis-*`)
- **Técnico:** `Quantity.basis` ∈ `tabulated · derivedFromTable · derivedFromGeometry · unavailable`
- **Rama:** **M1** (`b2a559e3`) + **M2** (superficie). Modificada.
- **Acceso:** ficha de la sección.
- **Precondiciones:** —
- **Pasos:** recorrer todas las filas y buscar una sin procedencia.
- **Esperado:** **ninguna**. Es la regla alrededor de la que está construida la ficha: un módulo
  leído de tabla y uno invertido de una inercia son los dos correctos y **no son el mismo hecho**.
  Etiquetas es: `de tabla` · `derivado de tabla` · `derivado de la geometría` · `sin dato`.
- **Estados alternativos:** —
- **Riesgos:** que la procedencia compita visualmente con el valor. Está en `--st-text-3` y 0,65rem
  a propósito.
- **Categoría:** **QA obligatorio** **[3×]**

---

### A-18 · Centroide en la ficha

- **UI:** bloque **Centroide** — `y = … mm · z = … mm`, o la frase de que no se resolvió.
- **Archivo:** `ProSectionModal.svelte` (paso de `canonical`), `SectionDataSheet.svelte` (`mm()`)
- **Técnico:** `resolveProfile().centroid`, `sectionDataSheet({ entry, canonical })`
- **Rama:** **M2** (`e5c8b2a0`). **Corrección de un defecto de M2.**
- **Acceso:** ficha, con **IPE 200** y con **MC18x58**.
- **Precondiciones:** —
- **Pasos:** 1) IPE 200 → leer el centroide; 2) MC18x58 → leer el centroide.
- **Esperado:** IPE 200 muestra **`y = 0.0 mm · z = 0.0 mm`**, sin signo menos; MC18x58 dice que no
  hay geometría canónica.
- **Estados alternativos:** —
- **Riesgos:** dos cosas que ya fallaron acá. (1) La ficha decía «No canonical geometry resolved»
  para **todo** perfil, incluido un IPE, porque el modal llamaba `sectionDataSheet({ entry })` sin
  `canonical` — la frase no era poco útil, **era falsa**. (2) Una sección doblemente simétrica
  resuelve al origen pero el motor la devuelve unos nanómetros corrida, y `(-1e-9).toFixed(1)`
  imprime **«-0.0»**: un desplazamiento medido y con dirección, que es justo lo que no es.
  **Si aparece un `-0.0`, la corrección se perdió.**
- **Categoría:** **QA obligatorio**

---

### A-19 · Bloque de conformados en la ficha

- **UI:** sección **Conformado en frío** de la ficha: espesor, `Ixy`, ángulo principal, `J`.
- **Archivo:** `SectionDataSheet.svelte` (`sheet-coldformed`, `sheet-coldformed-absent`)
- **Técnico:** `sheet.coldFormed`
- **Rama:** **M2**. Nueva.
- **Acceso:** ficha, con un perfil laminado y con uno conformado.
- **Precondiciones:** —
- **Pasos:** 1) IPE 200 → leer el bloque; 2) un C/Z paramétrico → leer el bloque.
- **Esperado:** con un laminado, el bloque **explica por qué está ausente** en vez de quedar vacío,
  y el motivo distingue «no aplica» de «no catalogado». Con un conformado, cuatro valores y la
  procedencia debajo.
- **Estados alternativos:** —
- **Riesgos:** —
- **Categoría:** **QA recomendado**

---

### A-20 · Previsualización de la sección

- **UI:** figura grande del panel derecho (`section-preview`).
- **Archivo:** `web/src/components/pro/generators/SectionFigure.svelte`
- **Técnico:** polígonos SVG con `isVoid`; `--st-bg`, `--st-hair-strong`, `--st-text-2`
- **Rama:** **M1** (uso en filas de generador) + **M2** (`4b0afd2b`, decisión 3). Modificada.
- **Acceso:** diálogo → división estándar.
- **Precondiciones:** —
- **Pasos:** 1) elegir un **SHS** (tubo, tiene vacío); 2) mirar el agujero; 3) mirar el marco contra
  el pozo que lo contiene; 4) elegir una disposición compuesta y volver a mirar.
- **Esperado:** el agujero se lee como **vacío**, no como material: el relleno del vacío y el fondo
  del contenedor deben ser **exactamente el mismo color**; el marco se distingue del pozo; la figura
  sigue la **disposición**, no sólo el perfil.
- **Estados alternativos:** MC → sin previsualización, a propósito.
- **Riesgos:** el truco del vacío **exige** que los dos colores coincidan. Migrar uno solo rompe el
  dibujo, y por eso los dos se movieron juntos a `--st-bg`. `--st-hair` era la lectura obvia para el
  marco y era la equivocada (1,48 de contraste contra el 1,74 del literal); se usó
  `--st-hair-strong` (2,03). **Esto se ve o no se ve: ningún test de píxeles lo cubre.**
- **Normativa:** —
- **Categoría:** **QA obligatorio**

---

### A-21 · Teclado completo del catálogo

- **UI:** ↓ ↑ Inicio Fin Enter sobre la lista; Enter sobre **Aplicar**.
- **Archivo:** `ProfileSelectorPanel.svelte`, `ProSectionModal.svelte`
- **Técnico:** el `keydown` vive en el **contenedor del panel**, no en `<svelte:window>`
- **Rama:** **M2** (`ca20995b`). Corrección de una regresión de M2.
- **Acceso:** diálogo → división estándar.
- **Precondiciones:** —
- **Pasos:** 1) abrir, tipear, ↓, Enter — sin tocar el mouse; 2) tabular hasta **Aplicar** y pulsar
  **Enter**; 3) tabular hasta **Cancelar** y pulsar **Enter**; 4) abrir y pulsar Enter de una:
  el cursor arranca sobre la selección actual.
- **Esperado:** (1) elige un perfil; (2) **Aplicar confirma y cierra**; (3) cancela; (4) es un
  no-op, no cambia nada.
- **Estados alternativos:** en la división **construcción** no hay buscador, así que el foco inicial
  cae en la pestaña — es la reserva deliberada.
- **Riesgos:** **cinco specs venían fallando acá y nadie había leído los fallos.** El botón Aplicar
  quedaba enfocado, habilitado y **sin poder activarse**: un listener a nivel ventana interceptaba
  el Enter y lo re-enrutaba a «elegir la fila bajo el cursor». Un usuario de teclado podía elegir un
  perfil y no tenía forma de confirmarlo.
- **Categoría:** **QA obligatorio**

---

### A-22 · Selector paramétrico de conformados C/Z

- **UI:** **Designación** — `C 100x50x15x2.0` — con canto, ala, labio y espesor.
- **Archivo:** `web/src/components/pro/steel/ColdFormedPanel.svelte`
- **Técnico:** `lib/profiles/cold-formed.ts`, `cold-formed-catalogue.ts`, `COLD_FORMED_SCOPE`
- **Rama:** **M1** (`01da50cb`, `280c4870`, `685ff173`) + **M2** (`04019c97`, `8ba26a80`,
  `a1975e98`). Nueva.
- **Acceso:** **Workflow metálico → pie «Límites y autoridad» → panel metálico → conformados.**
  No está en el modal de secciones.
- **Precondiciones:** —
- **Pasos:** 1) escribir `C 100x50x15x2`; 2) escribir `c 100 × 50 × 15 × 2,0`; 3) escribir
  `Z 200x75x20x2.5`; 4) editar una dimensión; 5) escribir algo geométricamente imposible;
  6) **Agregar**; 7) mirar la tabla de secciones.
- **Esperado:** (1) y (2) resuelven a lo mismo — la app **normaliza** lo que una persona tipea;
  (3) resuelve y **avisa de ejes rotados con el ángulo medido**; (4) la designación y las
  propiedades se re-derivan; (5) dice **cuál dimensión** es imposible, no sólo «no válido»;
  (6)–(7) la sección entra con la designación como nombre.
- **Estados alternativos:** **la lista de la serie está vacía a propósito** y lo dice: no hay
  catálogo comercial con fuente citable. El selector paramétrico funciona igual — la designación
  **es** la especificación.
- **Riesgos:** los **cinco hechos de alcance** de arriba: el **primero es una capacidad** (geometría
  paramétrica disponible) y los otros cuatro son límites. **Si los cinco se leen como refutaciones,
  es un bug** — y es un bug de tono, que ningún test ve.
- **Requiere:** —
- **Normativa:** **CIRSOC 301 excluye estas secciones por nombre y remite a CIRSOC 303, que no está
  incorporado.** Por lo tanto **no hay verificación normativa**: ni resistencia, ni aprovechamiento,
  ni resultado. Todo número es `derivado de la geometría`. Se muestra además la sobrestimación por
  esquinas vivas como una **medición** (≈ 0,76 %) — no es un porcentaje de completitud.
- **Categoría:** **Limitación conocida** + **QA obligatorio** (el tono de los cinco hechos)

---

### A-23 · Aviso de ejes no principales

- **UI:** aviso con el ángulo, sobre un **Z**.
- **Archivo:** `ColdFormedPanel.svelte` (`cf-axes-notice`), `lib/section/axes.ts`
- **Técnico:** regla pura sobre `Section.shape`
- **Rama:** **M2** (`a1975e98`). Nueva.
- **Acceso:** panel de conformados.
- **Precondiciones:** —
- **Pasos:** 1) un **Z** → leer el aviso; 2) un **C** → confirmar que no aparece.
- **Esperado:** el Z avisa con el ángulo medido; el C **no**, porque sus ejes geométricos **sí** son
  principales.
- **Estados alternativos:** —
- **Riesgos:** **la regla alcanza a los 37 ángulos catalogados además del Z, y sólo está montada
  acá.** `SectionEditor`, `ProfileSelector`, `ProSectionsTab` y `SectionStressPanel` son superficies
  compartidas con hormigón o de Basic y **no se editaron**: el contrato y el patch están escritos en
  `m2-axes-notice-contract.md` y no aplicados. Así que **un ángulo elegido desde el selector de
  secciones no avisa nada**, y la inercia mínima real de un ángulo de alas iguales es ~40 % de la
  que la app guarda como eje débil — el valor almacenado es ~2,4× demasiado alto, **del lado
  inseguro**.
- **Normativa:** sí — es exactamente una limitación de alcance.
- **Categoría:** **Limitación conocida** (montada) + **fuera del alcance actual** (superficies
  compartidas)

---

### A-24 · Presillas dentro del modal de secciones

- **UI:** desplegable **Presillas** del panel derecho, sólo con disposición compuesta.
- **Archivo:** `web/src/components/pro/section/BattenPanel.svelte`
- **Técnico:** `battenPlan({ arrangement, gapMm })` en `lib/section/battens.ts`
- **Rama:** **M2** (`9567636b`). Nueva.
- **Acceso:** diálogo → disposición compuesta → **Presillas**.
- **Precondiciones:** disposición compuesta.
- **Pasos:** 1) perfil simple → confirmar que **no hay** bloque; 2) disposición compuesta → abrirlo;
  3) leer la separación.
- **Esperado:** con un perfil simple **no hay bloque** (no es una barra armada y la cláusula no tiene
  nada que decir); con una compuesta aparece el grupo de §E.6.1 y sus reglas punteadas; **la
  separación `a` queda en `—`** con la regla nombrada.
- **Estados alternativos:** huelgo 0 → Grupo I, sin presillas.
- **Riesgos:** —
- **Normativa:** **una sección no tiene longitud.** `a = L/3` recién existe cuando la sección está
  sobre un miembro; mostrar `L/3` contra una longitud supuesta sería la geometría ficticia que el
  alcance prohíbe. Y **§E.6 no da ninguna dimensión de chapa** → `GEOMETRY_UNAVAILABLE`.
- **Categoría:** **Limitación conocida** + **QA recomendado**

---

### A-25 · La sección aplicada llega al modelo con su vocabulario

- **UI:** fila nueva en la tabla de secciones del panel.
- **Archivo:** `ProSectionsTab.svelte`, `lib/section/section-choice.ts`
- **Técnico:** `toSectionFields(choice, 0)`; `Section.composition`, `Section.rotation`,
  `Section.profileFamily`, `Section.built`
- **Rama:** **M2** (alta) sobre contratos de **M1** y PR21. Modificada.
- **Acceso:** diálogo → Aplicar.
- **Precondiciones:** —
- **Pasos:** 1) aplicar un `IPE 200` simple; 2) aplicar un `L 100x100x10` espalda con espalda con
  huelgo 8 y rotación 90°; 3) aplicar un `hollow-rect` construido; 4) guardar el proyecto, abrirlo y
  volver a mirar las tres.
- **Esperado:** las tres sobreviven con **su procedencia**: la de catálogo con `profileFamily`, la
  armada con `composition` (perfil, disposición, huelgo), la construida con `built` (plantilla y
  parámetros). Ver **I-01** a **I-04**.
- **Estados alternativos:** un nombre que el catálogo no conoce → **no se agrega nada**, en vez de
  una sección sin área.
- **Riesgos:** el **link compartido pierde cuatro de esos campos** — ver **I-08**.
- **Categoría:** **QA obligatorio**

---

# B · Selector de materiales

Precondición común: PRO, pestaña **Materiales** (cinta **Modelo** → *Propiedades* → **Materiales**).

---

### B-01 · El diálogo es la única vía de alta ✅ CERRADO

> **Reescrita el 2026-08-27.** La versión anterior de esta entrada decía que **convivían tres**
> caminos de alta y la clasificaba como decisión de producto pendiente. Ya no es cierto: el trabajo
> `9ed71247` retiró la ruta inline. Se deja el cambio anotado porque un revisor que pruebe la
> entrada vieja va a buscar una lista de presets que no existe y va a concluir que algo se rompió.

- **UI:** panel *Agregar material* reducido a **un** botón — **Elegir material** — que abre el
  diálogo. La tabla de materiales del proyecto queda debajo, sin cambios.
- **Archivo:** `web/src/components/pro/ProMaterialsTab.svelte` (531 → 264 líneas)
- **Técnico:** un solo `modelStore.addMaterial(`, dentro de `applyChoice`. La pestaña ya **no
  importa** `MATERIAL_CATEGORIES`, `searchPresets` ni `MaterialPreset` — verificado: cero
  referencias.
- **Rama:** **M2**. **Modificada** respecto de la versión anterior de M2, y es una **regresión
  potencial** para quien ya conocía la ruta corta.
- **Acceso:** Materiales → *Agregar material*.
- **Precondiciones:** —
- **Pasos:** 1) contar los controles del panel que dan de alta un material; 2) abrir el diálogo y
  confirmar que están las dos divisiones (`material-division-catalogue`, `material-division-custom`);
  3) agregar un acero por catálogo; 4) agregar un **hormigón** y una **madera** por el mismo
  diálogo.
- **Esperado:** **uno solo** (`pro-open-material-modal`). Y el diálogo conserva todo lo que la ruta
  corta no tenía: filtro por procedencia, ficha con autoridad por campo, bandas de espesor con su
  norma, panel profundo de grados y teclado completo. Los materiales **no metálicos** siguen
  llegando por acá.
- **Estados alternativos:** desde un **generador** el diálogo abre **sin** la división *custom*
  (`allowCustom = false`): un material a medida no tiene grado, y el generador guarda un grado — el
  control aparecería como que no hace nada. Ver **B-14**.
- **Riesgos:** el `<details>` que envolvía el panel desapareció. Si alguien esperaba el disclosure,
  ahora ve el botón directamente — es intencional: con el selector afuera, un disclosure era un clic
  para revelar un botón.
- **Requiere:** —
- **Normativa:** —
- **Categoría:** **QA obligatorio** — porque retira una ruta que existía; **ya no es** una decisión
  de producto pendiente
- **Prioridad:** **alta**

---

### B-02 · Las seis categorías

- **UI:** chips **Aceros · Conformados en frío · Inoxidables · Aluminio · Hormigones · Maderas**.
- **Archivo:** `web/src/components/pro/material/ProMaterialModal.svelte`
- **Técnico:** `MATERIAL_CATEGORIES` (`acero`, `conformado`, `inox`, `aluminio`, `hormigon`,
  `madera`), `categoryFamily()`
- **Rama:** **M2** (`9ef17d8d`). Nueva en el diálogo.
- **Acceso:** Materiales → **Elegir material**.
- **Precondiciones:** —
- **Pasos:** recorrer las seis.
- **Esperado:** las seis presentes. **No es sólo un selector de metales**: es el catálogo de Basic
  entero, sin duplicarlo.
- **Estados alternativos:** abierto **desde un generador**, la tira se acorta a las metálicas —
  ver **B-14**.
- **Riesgos:** cambiar de categoría debe resetear el cursor a 0 y no dejar la selección apuntando a
  una pestaña que ya no está en pantalla.
- **Categoría:** **QA obligatorio**

---

### B-03 · Cuerpo metálico: el panel profundo de grados

- **UI:** al elegir una categoría metálica, el cuerpo del diálogo **es** el panel de grados de M1,
  con su propio buscador, sus chips de familia, su desplegable de código y sus chips de procedencia.
- **Archivo:** `web/src/components/pro/steel/GradePickerPanel.svelte`
- **Técnico:** `structuralGradeSource`, `isMetal = categoryFamily(category) != null`
- **Rama:** **M1** (`b68115e9`) contenido por **M2**. Modificada.
- **Acceso:** diálogo → **Aceros**.
- **Precondiciones:** —
- **Pasos:** confirmar que **no hay dos buscadores** ni dos filtros de región sobre la misma lista.
- **Esperado:** el buscador y los chips de región propios del diálogo **desaparecen** en las
  categorías metálicas, porque los del panel de grados son mejores: conocen la base de grados.
- **Estados alternativos:** hormigón y madera → lista de presets del diálogo (**B-04**).
- **Riesgos:** que aparezcan los dos. Es exactamente el defecto que la separación evita.
- **Categoría:** **QA obligatorio**

---

### B-04 · Cuerpo no metálico: lista de presets, búsqueda y procedencia

- **UI:** lista de filas `nombre · norma · fy · región`, con buscador y chips de región.
- **Archivo:** `ProMaterialModal.svelte` (`material-list`, `material-search`, `material-region-*`)
- **Técnico:** `materialPresetSource.list({ text, category, regions })`
- **Rama:** **M2**. Nueva.
- **Acceso:** diálogo → **Hormigones** o **Maderas**.
- **Precondiciones:** —
- **Pasos:** 1) buscar; 2) tildar una región; 3) filtrar hasta vaciar la lista.
- **Esperado:** la búsqueda y la región **componen**; lista vacía → `material-no-results`.
- **Estados alternativos:** —
- **Riesgos:** **el filtro por procedencia es el eje que el selector de Basic no puede expresar**:
  Basic filtra por región y PRO muestra todo, así que las filas extra llegan sin explicación. Acá se
  explican.
- **Categoría:** **QA recomendado**

---

### B-05 · Búsqueda de grados, incluida la norma de producto

- **UI:** caja de búsqueda del panel de grados.
- **Archivo:** `GradePickerPanel.svelte` (`grade-search`, `grade-count`)
- **Técnico:** `structuralGradeSource.list({ text })`
- **Rama:** **M1** (`b68115e9`).
- **Acceso:** diálogo → Aceros.
- **Precondiciones:** —
- **Pasos:** 1) escribir `EN 10025`; 2) escribir `f-24`.
- **Esperado:** (1) filtra **por norma de producto**, no sólo por designación: aparecen
  S235/S275/S355/S450; (2) aparece F-24, IRAM-IAS U 500-503.
- **Estados alternativos:** vacío → estado que dice **qué filtro soltar**, no sólo «sin resultados».
- **Riesgos:** —
- **Categoría:** **QA recomendado** **[3×]**

---

### B-06 · Filtro por familia y por código de diseño

- **UI:** chips de familia; desplegable **Código de diseño**, condicionado.
- **Archivo:** `GradePickerPanel.svelte` (`grade-family-*`, `grade-code`, `grade-code-hint`)
- **Técnico:** `catalogueGradeFamily()`
- **Rama:** **M1**.
- **Acceso:** diálogo → Aceros.
- **Precondiciones:** —
- **Pasos:** 1) tildar **Laminado en caliente**; 2) tildar **además** Aluminio; 3) volver a una sola
  familia y elegir `EN 1993-1-1:2005`.
- **Esperado:** (1) **aparece** el desplegable de código; (2) **desaparece** y sale la frase de que
  el filtro por código aplica con una sola familia; (3) la lista se reduce a los grados europeos.
- **Estados alternativos:** —
- **Riesgos:** —
- **Categoría:** **QA obligatorio**

---

### B-07 · Filtro por procedencia

- **UI:** chips de región.
- **Archivo:** `GradePickerPanel.svelte` (`grade-region-*`), `ProMaterialModal.svelte`
  (`material-region-*`)
- **Técnico:** `populatedRegions()`
- **Rama:** **M1** (metales) + **M2** (no metales).
- **Acceso:** diálogo.
- **Precondiciones:** —
- **Pasos:** 1) tildar **Argentina**; 2) mirar qué regiones se ofrecen.
- **Esperado:** sólo grados AR. **No hay chips de Australia, India ni Sudáfrica** — el catálogo no
  trae grados de esas regiones y `populatedRegions()` no ofrece una región vacía.
- **Estados alternativos:** —
- **Riesgos:** —
- **Categoría:** **QA recomendado**

---

### B-08 · Bandas de espesor, y quién las tabula

- **UI:** bloque **Bandas de espesor** de la ficha del grado, con la norma que las publica debajo.
- **Archivo:** `GradePickerPanel.svelte` (`grade-bands`),
  `web/src/components/pro/material/MaterialDataSheet.svelte` (`msheet-bands`,
  `msheet-band-standard`)
- **Técnico:** `GradeEntry.bands`, `bandStandard`
- **Rama:** **M1** (`b68115e9`) + **M2** (ficha del diálogo).
- **Acceso:** diálogo → Aceros → **S355**.
- **Precondiciones:** —
- **Pasos:** 1) S355 → leer fy, las bandas y la nota; 2) **6082-T6** → leer las bandas.
- **Esperado:** S355 muestra **fy 355 MPa** con etiqueta `Norma de producto` y la nota de que es la
  **primera banda**; **dos filas** de banda, la segunda con fy **menor** (335); y debajo:
  «Tabuladas por **EN 1993-1-1 t.3.1** — no por la norma de producto». **Ésta es la línea más
  importante de la pantalla.** 6082-T6 tiene las bandas **al revés** — la segunda fy es **mayor**:
  es correcto y está documentado.
- **Estados alternativos:** grado sin bandas → `msheet-bands-absent`, con el motivo.
- **Riesgos:** que la nota de la norma de banda se pierda: sin ella, un lector concluye que
  EN 10025-2 tabula las bandas, y no las tabula.
- **Normativa:** sí — las bandas son de un **código de diseño**, no de la norma de producto.
- **Categoría:** **QA obligatorio** **[3×]**

---

### B-09 · La procedencia de cada propiedad del grado

- **UI:** etiqueta a la derecha de cada valor: `Norma de producto` · `Derivado` · `Valor típico`.
- **Archivo:** `GradePickerPanel.svelte` (`grade-basis-*`, `grade-typical`),
  `MaterialDataSheet.svelte`
- **Técnico:** `GradeEntry.verification` ∈ `standard | typical`; `G = E / 2(1 + ν)`
- **Rama:** **M1**.
- **Acceso:** diálogo → Aceros.
- **Precondiciones:** —
- **Pasos:** 1) **S355** → mirar E, ν, γ, G; 2) **A529 Gr.50** → mirar fy y fu.
- **Esperado:** S355 muestra `G` como **81 GPa** con etiqueta `Derivado` y la nota `G = E / 2(1+ν)`
  — la ficha pasa a GPa por encima de 10 000 MPa, y el valor exacto (80 769 MPa) es el 81 000 que
  fija CIRSOC 301 capítulo 2; E, ν, γ con `Norma de producto`. A529 Gr.50 muestra fy y fu con
  **`Valor típico`** en naranja y la frase de que son típicos de la aleación y **no leídos de la
  tabla que gobierna**.
- **Estados alternativos:** —
- **Riesgos:** —
- **Categoría:** **QA obligatorio** **[3×]**

---

### B-10 · El `gradeId` en pantalla

- **UI:** fila **Identificador de grado** en la ficha del material.
- **Archivo:** `MaterialDataSheet.svelte` (`msheet-grade-id`)
- **Técnico:** `MaterialPreset.gradeId` → `Material.gradeId`
- **Rama:** **M2** (`9ef17d8d`). Nueva.
- **Acceso:** diálogo → ficha del material.
- **Precondiciones:** —
- **Pasos:** 1) un preset de acero con grado → leer el id; 2) un preset sin grado → leer qué dice.
- **Esperado:** el id se muestra; sin id, la ficha **dice que ese grado vive fuera de la base
  metálica** en vez de dejar el campo vacío.
- **Estados alternativos:** —
- **Riesgos:** **es lo que hace clasificable a un material.** Sin él, `materialFamilyOf` cae en
  `fy > 80`.
- **Categoría:** **QA recomendado**

---

### B-11 · Los presets ya no tiran el grado

- **UI:** invisible en el selector; se ve en el **inventario metálico** y en la columna **Grado**.
- **Archivo:** `web/src/lib/material/material-choice.ts`, `ProMaterialsTab.svelte:45`
- **Técnico:** `toMaterialFields()` emite `gradeId`, `standard`, `region`, `fu` **sólo cuando la
  fuente los trae**
- **Rama:** **M2** (`9ef17d8d`). **Corrección de un defecto preexistente.**
- **Acceso:** Materiales → elegir un preset de acero → Workflow metálico → etapa 3.
- **Precondiciones:** un modelo con elementos.
- **Pasos:** 1) agregar un preset de acero; 2) asignarlo a un elemento; 3) mirar la fila en la etapa
  de grado y en el inventario.
- **Esperado:** la fila muestra **designación y norma de producto**, no «sin declarar».
- **Estados alternativos:** **1 de los 28 presets de acero no trae grado** y esa fila dirá «sin
  declarar» legítimamente.
- **Riesgos:** `addPreset` escribía **cinco** campos y descartaba `gradeId`, `standard`, `region` y
  `fu`. **27 de los 28 presets de acero traían un id que se estaba tirando en el momento de la
  selección.**
- **Categoría:** **QA obligatorio**

---

### B-12 · Clasificación correcta: el aluminio no es acero

- **UI:** el miembro de aluminio **no** aparece en la tabla de miembros metálicos; aparece un aviso
  que lo nombra.
- **Archivo:** `lib/engine/steel/grade-family.ts`, `steel-inventory.ts`,
  `components/pro/steel/SteelPanel.svelte`
- **Técnico:** `materialFamilyOf` prefiere el **grado declarado**; si no hay, cae en `fy > 80`
- **Rama:** **M1** (regla, `grade-family.ts`) + **M2** (el defecto de alta que la rompía).
- **Acceso:** Materiales → **Aluminio** → `5052-H32` o `6082-T6` → asignar → Workflow → Límites.
- **Precondiciones:** un modelo con al menos un elemento.
- **Pasos:** 1) agregar `5052-H32` (fy = 195) desde el diálogo; 2) asignarlo; 3) mirar el inventario
  metálico.
- **Esperado:** clasificado **`aluminium` / `declaredGrade`**; **no** aparece en la tabla de
  miembros; aparece un **aviso** que lo nombra y dice que ninguna autoridad de aluminio está
  implementada; si es el único metal, dice «su único metal es no ferroso (aluminio). Es metal, pero
  no el que esta superficie puede tratar» — **no** «ninguno es metálico».
- **Estados alternativos:** —
- **Riesgos:** **con `fy = 195` y sin `gradeId`, la regla `fy > 80` lo clasificaba como acero y
  entraba al inventario metálico.** Éste es el caso testigo del defecto B-11.
- **Normativa:** sí — no hay autoridad de aluminio en la app.
- **Categoría:** **QA obligatorio**

---

### B-13 · Material a medida — ahora una división del diálogo, con cotas físicas

> **Reescrita el 2026-08-27.** Cambió la **ruta** (era un control inline de la pestaña, ahora es una
> división del diálogo) y cambió la **validación** (era `isNaN`, ahora son cotas sobre la física).

- **UI:** diálogo de materiales → división **Material personalizado** → nombre, E, ν, densidad, fy.
- **Archivo:** `web/src/components/pro/material/CustomMaterialPanel.svelte` *(nuevo)*
- **Técnico:** `MaterialChoice` con `kind: 'custom'`. **No emite** `gradeId`, `standard` ni `region`
  — un material a mano no tiene ninguno de los tres, y sintetizarlos sería el mismo defecto que
  `material-choice.ts` existe para evitar, en la dirección contraria.
- **Rama:** **M2**. **Modificada** — es la única capacidad que la ruta inline tenía en exclusiva, y
  se movió **antes** de retirarla.
- **Acceso:** Materiales → *Elegir material* → división **Material personalizado**
  (`material-division-custom`).
- **Precondiciones:** —
- **Pasos:** 1) crear uno con fy 250 (`material-custom-name`, `-e`, `-nu`, `-rho`, `-fy`);
  2) asignarlo y mirar la columna **Grado**; 3) probar **ν = 3**; 4) probar **densidad = −78,5**;
  5) escribir **`0,3`** con coma en ν.
- **Esperado:** (2) la celda dice **«sin declarar»** y aparece el aviso de que la familia se dedujo
  de la magnitud de fy; (3) y (4) **rechazados con motivo** en `material-custom-problem` — ν fuera
  de (−1; 0,5) es un módulo volumétrico o de corte negativo; (5) se lee como **0,3**, no como 0.
- **Estados alternativos:** con grado y sin grado **conviven** en el mismo modelo, cada fila con lo
  suyo. `material-custom-caveat` declara que este material no tiene grado.
- **Riesgos:** el formulario viejo sólo chequeaba `isNaN`, así que **`ν = 3` y `ρ = −78,5` llegaban
  al modelo**, y `parseFloat('0,3')` daba `0` — un Poisson que el formulario aceptaba. Las tres cosas
  son casos límite que conviene mirar a mano, porque son los que la validación nueva cierra.
- **Requiere:** —
- **Normativa:** —
- **Categoría:** **QA obligatorio** **[3×]** — las siete claves `material.custom.*` viven en el
  bundle **de acero** (`locales/steel/{en,es,pt}.ts`), verificadas presentes en los tres; una de
  ellas es la advertencia larga de que un material a medida no declara grado ni procedencia, y es
  la que hay que leer completa en cada idioma
- **Prioridad:** **alta** — toca la física que entra al solver

---

### B-14 · El mismo selector desde un generador, acortado a los metales

- **UI:** botón **Material** de la fila del generador (dice «Sin grado declarado» al principio).
- **Archivo:** `ProGeneratorsPanel.svelte` → `ProMaterialModal` con `categories={METAL_CATEGORIES}`
- **Técnico:** `choiceGradeId(choice)`
- **Rama:** **M2** (`7f8c8704`). Modificada — antes era un popover propio (`GradePickerPanel`
  inline).
- **Acceso:** Generadores → cualquier generador → **Material**.
- **Precondiciones:** —
- **Pasos:** 1) abrir; 2) contar las categorías; 3) elegir S355; 4) Escape desde el diálogo.
- **Esperado:** **la misma** ficha, el mismo teclado y la misma conversión que en la pestaña de
  materiales; **sólo la tira de categorías es más corta**; el grado elegido persiste en la fila; el
  foco vuelve al botón.
- **Estados alternativos:** sin grado → la fila dice qué recibe el modelo **en su lugar** (ver
  **C-05**).
- **Riesgos:** un generador de cabriada que ofreciera C25/30 estaría ofreciendo un material que su
  emisor no puede usar.
- **Categoría:** **QA obligatorio**

---

### B-15 · Emparejamiento perfil / grado

- **UI:** aviso `gen-grade-pairing`, junto a los controles que eligieron el perfil.
- **Archivo:** `ProGeneratorsPanel.svelte`
- **Técnico:** `unusualRoles`, `generator.notice.gradeUnusualForRoles`
- **Rama:** **M1**.
- **Acceso:** Generadores → Cabriada.
- **Precondiciones:** —
- **Pasos:** 1) poner el perfil de **diagonal** en `L 50x50x5`; 2) elegir grado **F-36**; 3) elegir
  **F-24**.
- **Esperado:** con F-36, aviso que **nombra los roles** cuyos perfiles no se laminan habitualmente
  en ese acero, aclara que es **costo y plazo, no un error**, y **no bloquea Generar**. Con F-24
  desaparece.
- **Estados alternativos:** —
- **Riesgos:** el aviso tiene que estar **junto al control**, no tres secciones más arriba.
- **Categoría:** **QA recomendado**

---

### B-16 · «Elegir un grado no es una verificación»

- **UI:** línea antes de la lista, no cerrable.
- **Archivo:** `GradePickerPanel.svelte` (`grade-not-a-check`)
- **Técnico:** `steel.grade.notACheck`
- **Rama:** **M1**.
- **Acceso:** diálogo → Aceros.
- **Precondiciones:** —
- **Pasos:** leerla, e intentar cerrarla o condicionarla.
- **Esperado:** dice que elegir un grado **configura el modelo y no es una verificación**; no se
  puede cerrar ni condicionar.
- **Riesgos:** —
- **Normativa:** sí.
- **Categoría:** **Sólo verificación automática** (la fija `steel-never-verified`), pero **[3×]** en
  el pase de idiomas

---

### B-17 · Teclado y foco del diálogo de materiales

- **UI:** ↓ ↑ Inicio Fin Enter; Tab cíclico; Escape.
- **Archivo:** `ProMaterialModal.svelte`, `GradePickerPanel.svelte`
- **Técnico:** `$effect.pre` + `wasOpen`, mismo patrón que el modal de secciones
- **Rama:** **M2**.
- **Acceso:** Materiales → Elegir material.
- **Precondiciones:** —
- **Pasos:** 1) bajar con ↓ y subir con ↑; 2) Inicio / Fin; 3) Enter sobre S355; 4) Escape.
- **Esperado:** la ficha de abajo **sigue al cursor**; Inicio/Fin van a los extremos; Enter
  selecciona y cierra; Escape cierra y devuelve el foco al botón.
- **Riesgos:** mismo riesgo de orden de efectos que **A-02**: el panel de grados enfoca su buscador
  al montar.
- **Categoría:** **QA obligatorio**

---

# C · Generadores

Precondición común: PRO, cinta **Modelo** → *Generadores* → **Estructuras metálicas**.

> **Generar reemplaza el modelo.** El panel lo dice antes del botón. Todo lo de este bloque se
> prueba sobre un modelo descartable.

---

### C-01 · Previsualización fija y desbloqueable

- **UI:** botón **Fijar / Liberar previsualización** sobre el dibujo.
- **Archivo:** `web/src/components/pro/generators/ProGeneratorsPanel.svelte` (`gen-dock`,
  `gen-dock-toggle`)
- **Técnico:** `previewDocked = $state(true)`; el panel es una columna con **un** scroller y **un**
  pie fijo
- **Rama:** **M2** (`7f8c8704`). Nueva.
- **Acceso:** Generadores.
- **Precondiciones:** —
- **Pasos:** 1) abrir y mirar dónde está el dibujo; 2) scrollear los parámetros hasta abajo;
  3) pulsar el botón; 4) scrollear otra vez.
- **Esperado:** arranca **fija**: el dibujo, los conteos y el botón Generar **no se van** al
  scrollear. Liberada, vuelven al flujo que scrollea. En los dos estados **hay una sola
  previsualización**, no dos.
- **Estados alternativos:** `aria-pressed` refleja el estado.
- **Riesgos:** en un viewport corto una previsualización fija le come a los parámetros el espacio
  que necesitan — por eso es desbloqueable, y **por eso hay que mirarlo a 1280×720**. Si el pie
  queda empujado fuera de la pantalla, es el defecto que el dock existe para cerrar.
- **Requiere:** —
- **Categoría:** **QA obligatorio**

---

### C-02 · Los campos numéricos

- **UI:** cada parámetro con su **nombre** y una línea que dice **qué controla y en qué unidad**.
- **Archivo:** `ProGeneratorsPanel.svelte` (snippet `fieldHead`)
- **Técnico:** `aria-describedby="gen-hint-<key>"`; `role="spinbutton"` nativo; sin flechas nativas
  encima del valor
- **Rama:** **M2** (`7f8c8704`) sobre el rediseño de **M1**. Modificada.
- **Acceso:** Generadores → cualquier tipo.
- **Precondiciones:** —
- **Pasos:** 1) leer la línea de cada campo; 2) subir/bajar con ↑ ↓ desde el teclado; 3) escribir un
  valor **a medio tipear** (`1.` , `0.0`).
- **Esperado:** la línea lleva la **unidad**; ↑ ↓ mueven el valor con su `step`; un valor parcial
  **no salta** a otra cosa mientras se tipea; las flechas nativas no tapan el número.
- **Estados alternativos:** —
- **Riesgos:** ninguno grave; es la mitad legible del panel y sólo se juzga mirándolo.
- **Categoría:** **QA recomendado** **[3×]**

---

### C-03 · Perfil por rol → el mismo modal de secciones

- **UI:** botón con el nombre del perfil en cada fila de rol; muestra sección, familia y tamaño
  **antes** de abrir nada.
- **Archivo:** `web/src/components/pro/generators/ProfilePicker.svelte`
- **Técnico:** abre `ProSectionModal`; devuelve un `ProfileSpec`
- **Rama:** **M2** (`7f8c8704`). Modificada — antes abría un popover propio.
- **Acceso:** Generadores → fila de un rol.
- **Precondiciones:** —
- **Pasos:** 1) leer la fila sin abrir nada; 2) abrir; 3) elegir composición, huelgo y rotación;
  4) Aplicar; 5) volver a leer la fila; 6) reabrir y pulsar Escape.
- **Esperado:** la fila ya dice qué hay elegido; se abre **el modal de PRO**, no un segundo
  catálogo; **la composición, el huelgo y la rotación viajan** y quedan en la fila; Escape devuelve
  el foco a la fila.
- **Estados alternativos:** perfil properties-only + disposición compuesta → nota de rechazo, que
  **aparece al aplicar**, no al elegir (M2 movió la disposición al modal y lo dejó como única
  fuente).
- **Riesgos:** partir esto habría dejado una rama donde el generador ofrece un catálogo y la pestaña
  de secciones otro.
- **Categoría:** **QA obligatorio**

---

### C-04 · A36 como estado provisional declarado

- **UI:** cuando no hay grado elegido, la fila dice qué recibe el modelo **en su lugar**.
- **Archivo:** `ProGeneratorsPanel.svelte` (`gen-grade-line`, `gen-grade-scope`)
- **Técnico:** `generator.ui.materialPlaceholder`, `generator.ui.materialScope`
- **Rama:** **M1** (`a3465903`) + **M2** (redacción). Modificada.
- **Acceso:** Generadores → bloque Material.
- **Precondiciones:** —
- **Pasos:** 1) sin elegir grado, leer la línea; 2) elegir S355; 3) pulsar **Quitar grado**.
- **Esperado:** sin grado, la línea nombra el **placeholder** y es **corta** — un estado provisional
  de una línea, no un párrafo; con grado, muestra norma de producto y fy; quitarlo vuelve al
  placeholder. La frase de alcance dice que elegir un grado configura y no verifica.
- **Estados alternativos:** —
- **Riesgos:** un control vacío al lado de «sin grado» deja al usuario asumir que los miembros no
  tienen material. Tienen un placeholder, y el modelo generado lo declara como hipótesis.
- **Normativa:** sí — declarar no es verificar.
- **Categoría:** **QA obligatorio**

---

### C-05 · Pratt

- **UI:** desplegable **Patrón del alma** → *Pratt*, con la etiqueta que dice hacia dónde bajan sus
  diagonales.
- **Archivo:** `web/src/lib/engine/generators/truss-topology.ts`
- **Técnico:** `WEB_PATTERNS = ['pratt','howe','warren']`;
  `descendsToCentre = (webPattern === 'pratt') === leftOfCentre`
- **Rama:** **M2** (`367fe522`). **Corrección: toda cabriada Pratt que esta app construyó era una
  Howe.**
- **Acceso:** Generadores → Cabriada.
- **Precondiciones:** —
- **Pasos:** 1) elegir Pratt; 2) mirar la previsualización en elevación; 3) leer la etiqueta;
  4) Generar y **Calcular** con cargas gravitatorias; 5) mirar el signo de las diagonales.
- **Esperado:** las diagonales **descienden hacia el centro** (arriba en la estación exterior, abajo
  en la interior), que es lo que las pone en **tracción**; la etiqueta lo dice.
- **Estados alternativos:** media cabriada (`halfTruss`) → todo el tramo se trata como mitad
  izquierda.
- **Riesgos:** **es la corrección de mayor consecuencia estructural de M2 y se verificó por
  estática, no por parecido.** Si el signo de las diagonales sale invertido, la corrección se
  perdió. Este ítem no se puede delegar en un test de existencia.
- **Requiere:** cabriada generada y calculada.
- **Normativa:** —
- **Categoría:** **QA obligatorio**

---

### C-06 · Howe

- **UI:** *Howe* en el mismo desplegable.
- **Archivo / técnico:** idem C-05, rama espejo.
- **Rama:** **M2** (`367fe522`). Modificada — es el que antes salía cuando se pedía Pratt.
- **Acceso:** Generadores → Cabriada.
- **Pasos:** elegir Howe y comparar la previsualización contra la de Pratt.
- **Esperado:** **espejo exacto** de Pratt; diagonales en compresión bajo carga gravitatoria.
- **Estados alternativos:** —
- **Riesgos:** que Pratt y Howe dibujen lo mismo. Es el síntoma de que el intercambio volvió.
- **Categoría:** **QA obligatorio**

---

### C-07 · Warren

- **UI:** *Warren*, nuevo en el desplegable.
- **Archivo:** `truss-topology.ts`
- **Técnico:** diagonales alternadas por índice de panel; **sin montantes interiores**; los **dos
  montantes de extremo se conservan**
- **Rama:** **M2** (`367fe522`, `646c9588`). Nueva.
- **Acceso:** Generadores → Cabriada.
- **Precondiciones:** —
- **Pasos:** 1) elegir Warren; 2) contar montantes en la previsualización; 3) Generar; 4) Calcular.
- **Esperado:** **ningún montante interior** y **sí** los dos de extremo; el modelo **resuelve** —
  sin los montantes de extremo el apoyo no transfiere la reacción al cordón superior y el solver
  encuentra un mecanismo.
- **Estados alternativos:** con cordones que se tocan en el extremo (apoyo en punta), el montante de
  longitud cero se omite.
- **Riesgos:** si el modelo no resuelve o el solver reporta mecanismo, los montantes de extremo se
  perdieron.
- **Categoría:** **QA obligatorio**

---

### C-08 · Subdivisión de diagonales

- **UI:** casilla **Subdividir diagonales** + su explicación, sólo donde hace algo.
- **Archivo:** `ProGeneratorsPanel.svelte` (`gen-subdivide`, `gen-subdivide-hint`),
  `truss-topology.ts`
- **Técnico:** `subdivisionApplies(p)` = `WEB_PATTERNS.includes(pattern) && panelsPerHalf > 1`
- **Rama:** **M2**. Nueva.
- **Acceso:** Generadores → Cabriada.
- **Precondiciones:** —
- **Pasos:** 1) con **2** paneles por media, confirmar que la casilla aparece con su explicación;
  2) tildarla y contar elementos; 3) bajar a **1** panel por media.
- **Esperado:** tildarla **agrega miembros** (parte la diagonal y el cordón, no los cruza); con un
  solo panel por media **desaparece**, porque el punto nuevo caería sobre el de centro de vano y
  sería un no-op.
- **Estados alternativos:** —
- **Riesgos:** un control que se puede tildar sin efecto enseña a desconfiar del panel.
- **Categoría:** **QA recomendado**

---

### C-09 · Previsualización geométrica

- **UI:** dibujo en elevación (y en isométrica para la nave), con leyenda y conteos.
- **Archivo:** `web/src/components/pro/generators/TopologyPreview.svelte`
- **Técnico:** el **mismo** objeto `topology` que Generar emite; `gen-previews`, `gen-preview`
- **Rama:** **M1** (base) + **M2** (dock, iso, leyenda). Modificada.
- **Acceso:** Generadores.
- **Precondiciones:** —
- **Pasos:** 1) cambiar tipo, luz, flecha, paneles y mirar; 2) abrir **Hipótesis** y contar; 3) para
  la nave, confirmar las **dos** vistas.
- **Esperado:** la previsualización y los conteos por rol **se mueven juntos**; la línea de totales
  dice miembros, nodos y longitud, y la pendiente en % donde aplica; la nave muestra elevación e
  isométrica.
- **Estados alternativos:** pórtico laminado → sólo elevación de pórtico.
- **Riesgos:** **el spec verifica que el dibujo cambie, no que sea correcto.** Que la geometría se
  vea bien es estrictamente manual.
- **Categoría:** **QA obligatorio**

---

### C-10 · Colores literales de la previsualización de topología

- **UI:** el dibujo de topología, junto a la figura de sección.
- **Archivo:** `TopologyPreview.svelte`
- **Técnico:** **nueve literales hex**, uno de ellos el mismo `#071322` que la figura de sección ya
  no usa
- **Rama:** **M2** (`4b0afd2b` movió la otra, ésta no). **Abierta.**
- **Acceso:** Generadores.
- **Precondiciones:** —
- **Pasos:** mirar las dos previsualizaciones **juntas**, en el mismo panel.
- **Esperado:** hoy conviven una superficie tokenizada y una con literales. Se ve o no se ve.
- **Riesgos:** mover una sin la otra es una decisión sobre **cómo deben relacionarse**, no una
  limpieza. Está afirmado por lista invertida: una superficie metálica nueva con literales hace
  fallar el test salvo que se la escriba en `LITERALS_REMAIN`.
- **Categoría:** **Limitación conocida**

---

### C-11 · Generar, y el conteo que aterriza

- **UI:** botón **Generar**, con el número de elementos al lado, y el resultado debajo.
- **Archivo:** `ProGeneratorsPanel.svelte` (`gen-generate`, `gen-result`)
- **Técnico:** `emit.ts`; `role="status"` en el resultado
- **Rama:** **M1** (`a1440f47`) + **M2**. Modificada.
- **Acceso:** Generadores.
- **Precondiciones:** —
- **Pasos:** 1) anotar el número junto a Generar; 2) Generar; 3) contar nodos y elementos del modelo.
- **Esperado:** **el número de antes es el número que entra**, para los tres tipos.
- **Estados alternativos:** —
- **Riesgos:** —
- **Categoría:** **QA obligatorio**

---

### C-12 · Problemas de parámetro y de perfil, atados al botón

- **UI:** listas `gen-param-problems` / `gen-profile-problems`, y Generar deshabilitado.
- **Archivo:** `ProGeneratorsPanel.svelte`
- **Técnico:** `aria-describedby` apunta a la lista que esté en pantalla; `role="alert"`
- **Rama:** preexistente en `main`.
- **Acceso:** Generadores.
- **Precondiciones:** —
- **Pasos:** 1) poner luz 0; 2) mirar Generar; 3) corregir.
- **Esperado:** lista de problemas, **Generar deshabilitado**, y el problema **atado al botón** —
  un lector de pantalla lee el motivo con el botón, no un rectángulo gris cuya razón vive arriba.
- **Estados alternativos:** —
- **Riesgos:** —
- **Categoría:** **QA recomendado**

---

### C-13 · Correas y arriostramiento de la nave

- **UI:** casillas **Correas**, tres arriostramientos, **Vigas de alero**, selector **Vanos
  arriostrados**, y los avisos `gen-bracing-notice` / `gen-stability-notice`.
- **Archivo:** `ProGeneratorsPanel.svelte`, `web/src/lib/engine/generators/shed.ts`
- **Técnico:** `shed-bracing.ts`; avisos con `role="status"`
- **Rama:** **M1** (`5def6ca0`). Nueva.
- **Acceso:** Generadores → **Nave**.
- **Precondiciones:** —
- **Pasos:** 1) destildar **Correas**; 2) tildar sólo **arriostramiento de cubierta**; 3) tildar los
  tres; 4) tildar además **Vigas de alero**; 5) Generar y contar; 6) destildar todo el
  arriostramiento.
- **Esperado:** (1) aviso **antes** de Generar de que la cubierta queda sin restricción fuera de su
  plano, y Generar **sigue habilitado**; (2) aviso de **camino de carga incompleto**, que nombra el
  recorrido entero (plano de cubierta → vertical entre cerchas → aleros → vigas de alero → fachada →
  suelo); (3) aparece **Vanos arriostrados** (extremos / todos) y, sin vigas de alero, el aviso de
  que la reacción sólo llega al suelo en los vanos arriostrados; (4) **ningún** aviso; (5) más
  elementos que la nave por defecto, y el panel pide perfil para el rol *arriostramiento*;
  (6) vuelve **exactamente** a los conteos por defecto.
- **Estados alternativos:** —
- **Riesgos:** el punto (6) es el que prueba que las casillas son **aditivas** y que los defaults no
  se movieron.
- **Requiere:** nave.
- **Categoría:** **QA obligatorio** **[3×]**

---

### C-14 · Un modelo generado sale sin casos de carga

- **UI:** al resolver una nave recién generada, «sin resultados».
- **Archivo:** `emit.ts`
- **Técnico:** el emisor no inventa hipótesis de carga
- **Rama:** preexistente.
- **Acceso:** Generadores → Nave → Generar → **Calcular**.
- **Precondiciones:** —
- **Pasos:** generar con todo por defecto y resolver.
- **Esperado:** informa **sin resultados**, a propósito. **No es un bug.**
- **Riesgos:** que se lea como fallo. Está anotado en `m1-qa-checklist.md` §3.9 y se repite acá.
- **Categoría:** **Limitación conocida**

---

### C-15 · La frontera selector / modelo

- **UI:** invisible.
- **Archivo:** `lib/engine/generators/__tests__/selector-model-boundary.test.ts`
- **Técnico:** **antes** de Generar, el cambio se refleja; **después**, no muta el modelo emitido
- **Rama:** **M1** (`a1440f47`). Nueva (fija una propiedad que era implícita).
- **Acceso:** Generadores.
- **Precondiciones:** —
- **Pasos:** 1) Generar; 2) cambiar un perfil en el selector; 3) mirar el modelo.
- **Esperado:** el modelo **no cambia**. Un modelo generado es geometría en el store; el selector es
  el formulario que la creó. Que editar el formulario mutara un modelo ya emitido rompería el undo.
- **Riesgos:** —
- **Categoría:** **Sólo verificación automática**

---

# D · Workflow metálico

Precondición común: PRO, cinta **Diseño** → *Metálicas* → **Diseño de perfiles**.

> **Eran ocho etapas y son cinco.** Las ocho no estaban mal: eran *las piezas en el orden en que se
> construyeron*, no un recorrido. Cuatro de ellas —grado, sección, geometría, hipótesis— más
> verificación son **una sola pregunta hecha sobre cinco entradas**: «¿son adecuadas las secciones
> que elegí?».

---

### D-01 · Acceso y contenedor

- **UI:** pestaña del panel PRO con las cinco etapas.
- **Archivo:** `web/src/components/pro/ProSteelWorkflowTab.svelte` (`pro-steel-workflow`)
- **Técnico:** montado en `ProPanel.svelte` bajo `activeTab === 'steel'`
- **Rama:** **M2** (`94dfd0d3`, `170064c8`, `74241e26`). Nueva.
- **Acceso:** cinta **Diseño** → *Metálicas* → **Diseño de perfiles**.
- **Precondiciones:** —
- **Pasos:** 1) abrir; 2) volver a otra pestaña PRO y regresar; 3) abrir y cerrar varias veces.
- **Esperado:** las cinco etapas presentes y en el orden en que corre la tubería; abrirla **no
  pierde el modelo ni la cinta**; las demás pestañas siguen funcionando después de visitarla.
- **Estados alternativos:** el comando de la cinta se llama *Diseño de perfiles* y el panel que abre
  dice en su propio banner que **no verifica nada**. Es la pareja honesta: el comando nombra el
  lugar, la superficie declara su madurez.
- **Riesgos:** —
- **Categoría:** **QA obligatorio**

---

### D-02 · Etapa 1 · Modelado

- **UI:** **Modelado** — qué hay modelado en acero y si ya se calculó.
- **Archivo:** `ProSteelWorkflowTab.svelte` (`steel-stage-model-body`)
- **Técnico:** `steelStore.inventory`, `resultsStore.results3D`
- **Rama:** **M2**. Nueva.
- **Acceso:** workflow → etapa 1.
- **Precondiciones:** —
- **Pasos:** 1) modelo vacío; 2) modelo de hormigón; 3) nave sin calcular; 4) nave calculada.
- **Esperado:** (1) «no hay miembros metálicos»; (2) «ningún miembro se clasifica como metálico»;
  (3) «N miembro(s) metálico(s). Falta calcular: Análisis → Calcular»; (4) «N miembro(s) metálico(s),
  con solicitaciones calculadas».
- **Estados alternativos:** los cuatro de arriba.
- **Riesgos:** el estado (3) tiene que **decir cómo seguir**, no sólo que falta algo.
- **Requiere:** nave.
- **Categoría:** **QA obligatorio**

---

### D-03 · Etapa 2 · Reglamentos

- **UI:** **Reglamento** — `elegido` si el proyecto declara CIRSOC 301; si no, `actual`.
- **Archivo:** `ProSteelWorkflowTab.svelte` (`steel-stage-regulation-body`,
  `steel-stage-code-scope`)
- **Técnico:** `regulationsStore.binding('steel')`; **avanzar depende de `steelCodeDeclared`, no de
  `roleUsable`**
- **Rama:** **M2** (`74241e26`). Modificada.
- **Acceso:** workflow → etapa 2; y el panel de **Reglamentos** para declararlo.
- **Precondiciones:** —
- **Pasos:** 1) sin declarar → leer; 2) declarar **CIRSOC 301:2018** en Reglamentos; 3) volver.
- **Esperado:** sin declarar, invita a elegir uno y aclara que **se puede declarar aunque sus
  capacidades sigan limitadas**; declarado, dice que **determina qué verificaciones y limitaciones
  aplican y no certifica ningún resultado**.
- **Estados alternativos:** —
- **Riesgos:** **`roleUsable` devuelve `false` en cuanto la madurez es `UNSUPPORTED`, y CIRSOC 301
  lo es** — correctamente, no hay adaptador. Condicionar el avance a `usable` significaba que elegir
  un reglamento no destrabara nada **nunca**. La madurez no se tocó: sólo un resultado **certificado**
  depende de `usable`.
- **Normativa:** sí — declarar no es certificar.
- **Categoría:** **QA obligatorio**

---

### D-04 · Etapa 3 · Secciones y verificación (contenedor)

- **UI:** **Secciones y verificación**, con **cinco sub-secciones, cada una con su propio estado**.
- **Archivo:** `ProSteelWorkflowTab.svelte` (`steel-stage-section-body`)
- **Técnico:** `StageSection` compartido con hormigón (dueña: H1)
- **Rama:** **M2** (`74241e26`). Nueva.
- **Acceso:** workflow → etapa 3.
- **Precondiciones:** —
- **Pasos:** plegar y desplegar cada sub-sección y confirmar que **cada una responde por sí sola**.
- **Esperado:** se sigue viendo **cuál** de las cinco bloquea.
- **Estados alternativos:** —
- **Riesgos:** **si eso se pierde, la etapa 3 se vuelve una caja negra.** Fusionar cinco etapas en
  una no fusionó cinco respuestas en una, y es exactamente lo que hay que confirmar en pantalla.
- **Categoría:** **QA obligatorio**

---

### D-05 · Sub-etapa · Material y grado, fila por miembro

- **UI:** una fila por miembro: id, sección, familia, **grado declarado**, norma de producto,
  espesor, estado.
- **Archivo:** `ProSteelWorkflowTab.svelte` (`steel-sub-grade`, `steel-grade-rows`),
  `lib/engine/steel/workflow-rows.ts`
- **Técnico:** `gradeRows()`; `withoutGrade` decide el estado
- **Rama:** **M2** (`ad919ec9`). Nueva.
- **Acceso:** workflow → etapa 3 → primera sub-sección.
- **Precondiciones:** modelo con miembros metálicos.
- **Pasos:** 1) nave (A36 declarado) → leer las filas; 2) modelo con un material a mano sin grado.
- **Esperado:** con grado, designación y norma; **sin grado, una raya (`—`), nunca una designación
  deducida de `fy`**; la sub-sección dice **qué falta y por qué importa**.
- **Estados alternativos:** sin miembros metálicos → `optional`, con estado vacío.
- **Riesgos:** **ningún grado inventado.** Es el primer lugar donde una app podría mentir.
- **Requiere:** nave.
- **Categoría:** **QA obligatorio**

---

### D-06 · Sub-etapa · Sección y perfil, fila por miembro

- **UI:** una fila por miembro: **origen**, ID de catálogo, **propiedades ausentes por nombre**, y si
  el bloqueo es **geométrico** o **de autoridad**.
- **Archivo:** `ProSteelWorkflowTab.svelte` (`steel-sub-section`, `steel-section-rows`,
  `steel-stage-section-gaps`)
- **Técnico:** `sectionRows()`, `steelInputCompleteness()` — **la misma función que consulta el
  camino de verificación**
- **Rama:** **M2** (`ad919ec9`). Nueva.
- **Acceso:** workflow → etapa 3 → segunda sub-sección.
- **Precondiciones:** modelo con miembros metálicos.
- **Pasos:** leer las filas y la lista de huecos distintos del modelo.
- **Esperado:** los huecos se **nombran**, no se cuentan; **ningún estado de fila se lee como un
  aprobado**.
- **Estados alternativos:** sin huecos → `done`.
- **Riesgos:** la pantalla y el motor no pueden discrepar sobre qué miembros están listos — por eso
  se le pregunta a la misma función.
- **Requiere:** nave.
- **Categoría:** **QA obligatorio**

---

### D-07 · Sub-etapa · Geometría y arriostramiento (bloqueada)

- **UI:** sub-sección **bloqueada**, sobre el dato de arriostramiento.
- **Archivo:** `ProSteelWorkflowTab.svelte` (`steel-sub-geometry`, `steel-sub-geometry-blocked`)
- **Técnico:** `geometryState = hasSteel ? 'blocked' : 'optional'`;
  `verification-service.ts` pasa **`Lb = L`**
- **Rama:** **M2**. Nueva.
- **Acceso:** workflow → etapa 3 → tercera sub-sección.
- **Precondiciones:** miembros metálicos.
- **Pasos:** leer el motivo del bloqueo.
- **Esperado:** dice que **el modelo no tiene dónde registrar un arriostramiento**, así que el
  verificador toma el miembro **no arriostrado en toda su longitud**. Es conservador para flexión
  tomada sola, y **sigue siendo una hipótesis que el usuario nunca hizo**.
- **Estados alternativos:** sin acero → `optional`.
- **Riesgos:** **es el bloqueo honesto del workflow.** Reemplazar `Lb` por una fracción de `L` sería
  una invención. Los tres caminos posibles están en `m2-lb-assumption.md` y el más barato es que el
  generador conserve las riostras que ya coloca — **decisión pendiente de una persona**.
- **Normativa:** sí — `Lb` sin fuente.
- **Categoría:** **Limitación conocida** + **QA obligatorio** (que lo diga)

---

### D-08 · Sub-etapa · Hipótesis, con `Lb` por miembro y su fuente

- **UI:** las **siete** hipótesis del verificador, más **`Lb` por miembro con su procedencia**, más
  lo **no inferible**, separado.
- **Archivo:** `ProSteelWorkflowTab.svelte` (`steel-sub-assumptions`, `steel-assumption-rows`,
  `steel-assumption-not-inferable`, `steel-assumption-bracing`)
- **Técnico:** `lib/engine/steel/workflow-assumptions.ts`
- **Rama:** **M2** (`6df7d89d`). Nueva.
- **Acceso:** workflow → etapa 3 → cuarta sub-sección.
- **Precondiciones:** miembros metálicos.
- **Pasos:** leer las siete, después `Lb` por miembro, después la lista de lo no inferible.
- **Esperado:** cada `Lb` con **su fuente**; lo **no inferible** está **separado** de lo **asumido**
  — son dos cosas distintas y mezclarlas es lo que hace ilegible una lista de hipótesis.
- **Estados alternativos:** —
- **Riesgos:** —
- **Categoría:** **QA obligatorio**

---

### D-09 · Sub-etapa · Verificación — nunca `hecho`

- **UI:** sub-sección de verificación, con siete limitaciones, ocho explicaciones y el **estado de
  revisión**.
- **Archivo:** `ProSteelWorkflowTab.svelte` (`steel-sub-verification`,
  `steel-stage-verification-blockers`, `steel-stage-verification-note`, `steel-review-state`)
- **Técnico:** `verificationState = !hasSteel ? 'optional' : (!hasDemands || inputGaps.length) ?
  'blocked' : 'current'`. **`'done'` no está entre sus salidas posibles.**
- **Rama:** **M2** (`6df7d89d`, `74241e26`). Modificada — antes era la constante `'blocked'`.
- **Acceso:** workflow → etapa 3 → quinta sub-sección.
- **Precondiciones:** para verla en `current`, **nave calculada** y sin huecos de entrada.
- **Pasos:** 1) nave sin calcular → leer el estado y el motivo; 2) **Calcular** → volver a leer;
  3) buscar un tilde verde en toda la etapa.
- **Esperado:** sin esfuerzos, **bloqueada** y dice por qué; con esfuerzos y datos completos,
  **`actual`**; **nunca `hecho`, nunca un ✓ verde**. La firma profesional aparece como **metadata de
  revisión**, no como bloqueo.
- **Estados alternativos:** el mapa de cláusulas se cuenta como entradas **UNVALIDATED**, no como
  progreso.
- **Riesgos:** **es el ítem de primera prioridad de todo el pase.** El estado era la constante
  `'blocked'` y eso confundía «el cálculo no puede correr» —pregunta de desarrollo, respuesta
  fáctica— con «nadie lo revisó» —estado de revisión que llega después—. Si aparece un ✓, es bug de
  máxima prioridad.
- **Normativa:** sí — `steelCountsAsVerified()` devuelve el literal `false`.
- **Categoría:** **QA obligatorio** **[3×]**

---

### D-10 · Cláusulas auditadas: `Cb`, §E.4, §F.6.2

- **UI:** bloque `steel-clause-availability` con tres entradas.
- **Archivo:** `ProSteelWorkflowTab.svelte` (`steel-clause-cb`, `steel-clause-e4`,
  `steel-clause-f62`), `lib/engine/steel/moment-gradient.ts`, `torsional-buckling.ts`,
  `flange-local-buckling.ts`
- **Técnico:** `e4Applicability()`, `f62Report()` — **por la primera sección metálica del modelo**,
  porque son propiedades de una **forma**, no de un miembro
- **Rama:** **M2** (`bb15c294`, `e2e3dc12`). Nueva.
- **Acceso:** workflow → etapa 3.
- **Precondiciones:** modelo con al menos una sección metálica; para `Cb`, calculado.
- **Pasos:** leer las tres.
- **Esperado:** **`Cb` (F.1.1)** calculado del diagrama de momentos **o en 1 con su razón**;
  **§E.4** con sus **cuatro faltantes nombrados**; **§F.6.2** con `λf` y `Fcr` calculados y **la
  rama sin determinar**.
- **Estados alternativos:** sin sección metálica, el bloque no dice nada.
- **Riesgos:** **calcular `Cb` no certifica el arriostramiento.** §E.4 está bloqueado por un dato:
  `Cw`, el módulo de alabeo, **no lo declara ninguna sección de la app** y E.4.9 lo exige — más `kz`,
  la clasificación de E.4.2(a) y la longitud no arriostrada torsional. §F.6.2 es medio calculable:
  `λf = bf/tf`, `Sy` y `Fcr = 138000/(bf/tf)²` se calculan, y **la rama no se puede elegir** porque
  λpf y λrf son la Tabla B.4.1b caso 14, que **es una imagen en el PDF fuente**.
- **Normativa:** sí, las tres.
- **Categoría:** **Limitación conocida** + **QA obligatorio** (que las cuatro ausencias de §E.4
  estén **nombradas**)

---

### D-11 · Etapa 4 · Uniones (alcance)

- **UI:** **Diseño de uniones** — los nudos reales y **qué se puede definir de cada uno**.
- **Archivo:** `ProSteelWorkflowTab.svelte` (`steel-stage-joints-body`, `steel-joints-scope`)
- **Técnico:** `detectJoints`
- **Rama:** **M2** (`74241e26`). Nueva.
- **Acceso:** workflow → etapa 4.
- **Precondiciones:** —
- **Pasos:** leer las dos mitades: lo que se calcula y lo que no.
- **Esperado:** nombra las dos, en vez de dejarlas inferir de un campo vacío:
  | Dato | Estado | Cláusula |
  |---|---|---|
  | Separación mínima entre bulones | calculado | J.3.3 |
  | Distancia mínima al borde | de tabla | Tabla J.3.4 |
  | Distancia y separación máximas | calculado | J.3.5 |
  | Agujero normal | de tabla | Tabla J.3.3 |
  | Dimensiones de chapa | `GEOMETRY_UNAVAILABLE` | se dimensiona desde una solicitación que la etapa no tiene |
  | Tamaño de soldadura | `GEOMETRY_UNAVAILABLE` | requiere solicitación y espesores |
  | Dimensiones de presilla | `GEOMETRY_UNAVAILABLE` | §E.6 no da ninguna; sólo `np·Ip/h ≥ 10·I1/a` (E.6.19) |
- **Estados alternativos:** modelo sin nudos → «ningún nodo reúne dos o más barras».
- **Riesgos:** —
- **Normativa:** sí.
- **Categoría:** **QA obligatorio**

---

### D-12 · Etapa 5 · Documentación

- **UI:** **Documentación** — qué llevará un documento.
- **Archivo:** `ProSteelWorkflowTab.svelte` (`steel-stage-documents-body`)
- **Técnico:** `documentsState`
- **Rama:** **M2**. Nueva.
- **Acceso:** workflow → etapa 5.
- **Precondiciones:** —
- **Pasos:** leerla; intentar exportar algo metálico.
- **Esperado:** sin resultados dice «todavía no hay resultados que documentar»; con ellos, describe
  qué **llevará** un documento: inventario metálico, hipótesis por miembro con su procedencia,
  cláusulas evaluadas y no evaluadas, y el estado de cada nudo. **Nada se marcará como verificado
  mientras no exista autoridad de diseño metálico.**
- **Estados alternativos:** —
- **Riesgos:** **es una promesa, no una función.** No hay exportación metálica implementada — ver
  **I-09**. Lo que QA verifica acá es que **no aparente** estarlo.
- **Categoría:** **Fuera del alcance actual**

---

### D-13 · Pie · Límites y autoridad (inventario metálico)

- **UI:** desplegable al pie, **abierto por defecto**, con el inventario metálico completo.
- **Archivo:** `ProSteelWorkflowTab.svelte` (`steel-limits`) → `steel/SteelPanel.svelte`
- **Técnico:** `steelStore.capabilityGaps`, `steel-member-table`, `steel-census`,
  `steel-inferred-warning`, `steel-notices`
- **Rama:** el panel ya estaba en `main`; **M2** lo bajó a pie de página. Modificada.
- **Acceso:** workflow → pie.
- **Precondiciones:** —
- **Pasos:** 1) leer el banner experimental; 2) modelo vacío; 3) modelo todo de hormigón; 4) modelo
  con material sin resistencia; 5) nave sin calcular; 6) nave calculada.
- **Esperado:** el **banner experimental va primero y no se puede cerrar**; (2) «el modelo no tiene
  elementos»; (3) «tiene N elementos y ninguno es metálico», con el **censo por familia**;
  (4) «ninguno declara resistencia, así que no puede clasificarse»; (5) **`—` DEMAND_UNAVAILABLE**,
  con texto y no sólo color; (6) **`○` NOT_DESIGNED** — **nunca verde, nunca VERIFIED**.
- **Estados alternativos:** los cuatro estados metálicos son `NOT_DESIGNED`, `EXPERIMENTAL`,
  `DEMAND_UNAVAILABLE`, `NOT_APPLICABLE`. Ninguno es un aprobado.
- **Riesgos:** **`limits` dejó de ser etapa y es pie de página** — aplica a todas las de arriba, así
  que numerarla después de la última implicaba que llegaba al final. Confirmar que **abre por
  defecto**: solía **ser** toda la pestaña.
- **Categoría:** **QA obligatorio** **[3×]**

---

### D-14 · La edición del reglamento en el panel metálico

- **UI:** línea de código con edición y nota del adaptador.
- **Archivo:** `SteelPanel.svelte` (`steel-code-line`, `steel-code-edition`,
  `steel-code-experimental`, `steel-code-maturity`)
- **Técnico:** `roles.ts`; `steelCodeDeclared` vs `steelCodeUsable`
- **Rama:** **M1** (`a1440f47`, tarea B del estudio de factibilidad). Nueva.
- **Acceso:** workflow → pie → panel metálico.
- **Precondiciones:** CIRSOC 301 declarado en Reglamentos.
- **Pasos:** declararlo y leer la línea.
- **Esperado:** dice que está **declarado**, con su **edición**, y marcado **experimental**; el
  panel de Reglamentos marca `regulations.problem.experimentalAdapter`.
- **Estados alternativos:** sin declarar → `actual`.
- **Riesgos:** el hueco que M1 cerró era que la superficie distinguía «declarado» de «utilizable»
  pero **no mostraba la edición ni el `noteKey`** del adaptador elegido.
- **Normativa:** sí.
- **Categoría:** **QA obligatorio**

---

### D-15 · Ni barra de progreso ni porcentaje de completitud

- **UI:** ausencia deliberada.
- **Archivo:** todo el workflow
- **Técnico:** no hay `role="progressbar"`, ni porcentaje-como-completitud, ni estado-como-fracción
- **Rama:** **M2**.
- **Acceso:** workflow.
- **Precondiciones:** —
- **Pasos:** recorrer las cinco etapas buscando una barra o un «3 de 5».
- **Esperado:** **ninguna. No hay un total del que ser fracción.**
- **Estados alternativos:** **sí hay porcentajes legítimos**: el panel de conformados muestra
  `0,76 %` como la **sobrestimación por esquinas vivas**, que es una **medición**. Un test propio
  llegó a prohibir cualquier `NN %` y estaba mal escrito; se corrigió a chequear el concepto, no el
  signo.
- **Riesgos:** confundir los dos.
- **Categoría:** **Sólo verificación automática**

---

# E · Uniones abulonadas

Precondición común: PRO, cinta **Diseño** → *Metálicas* → **Uniones metálicas**.

> **El camino completo de punta a punta es el abulonado**, y sólo él: seleccionar el nudo, elegir
> bulones y chapa, ver las verificaciones con su cláusula, y ver la chapa y los bulones aparecer en
> el visor. Soldaduras y presillas no llegan tan lejos, y eso es el bloque F y el G.

---

### E-01 · Banner experimental

- **UI:** franja al tope del panel, antes de cualquier número.
- **Archivo:** `web/src/components/pro/ProConnectionsTab.svelte` (`conn-experimental-banner`)
- **Técnico:** `conn.experimentalBanner`, `role="note"`
- **Rama:** preexistente en `main` — superficie metálica anterior a estas dos ramas.
- **Acceso:** Uniones metálicas.
- **Pasos:** leerlo e intentar cerrarlo.
- **Esperado:** **antes** de cualquier número y **no cerrable**.
- **Categoría:** **Sólo verificación automática**, pero **[3×]**

---

### E-02 · Detección de nudos, y el conteo

- **UI:** sección **1 · Nudos**, con el número al lado del título y la explicación de **qué es** un
  nudo.
- **Archivo:** `ProConnectionsTab.svelte` (`conn-sec-joints`, `conn-joint-count`,
  `conn-joints-what`)
- **Técnico:** `detectJoints(nodes, elements, supports)` filtrado por el veredicto del inventario
  metálico
- **Rama:** **M1** (detección) + **M2** (`c7e87fbc`, `cf99f655`). Modificada.
- **Acceso:** Uniones.
- **Precondiciones:** —
- **Pasos:** 1) nave → contar; 2) cabriada generada → contar; 3) leer la explicación.
- **Esperado:** la nave da **226 nudos** metálicos sobre 633 elementos; la explicación dice que la
  detección es **geométrica** y por qué eso importa.
- **Estados alternativos:** ver **E-04**.
- **Riesgos:** dos defectos vivieron acá. (1) El ejemplo de la nave traía **dos materiales llamados
  «Acero A36»**, el segundo **sin `fy`**, y los 633 elementos apuntaban al segundo: el inventario
  daba **0 de 633** y `detectJoints` filtrado daba **0**. Se arregló **el dato**, no el filtro:
  ahora declara `fy`, `fu` y **`gradeId: 'astm-a36'`**. (2) El merge de M1 en M2 dejó tres
  referencias a `allJointCount` sin declaración y **el panel lanzaba al montar** — 19 fallos E2E que
  eran un solo `ReferenceError`, que ni el build ni 7970 unitarios vieron.
- **Requiere:** nave.
- **Categoría:** **QA obligatorio**

---

### E-03 · Nudos no metálicos, contados y no omitidos

- **UI:** nota `conn-filtered-note` sobre la lista.
- **Archivo:** `ProConnectionsTab.svelte`
- **Técnico:** `hiddenJointCount`
- **Rama:** preexistente en `main`; **M2** (`cf99f655`) corrigió el número que informaba.
  Modificada.
- **Acceso:** Uniones, con un modelo **mixto**.
- **Precondiciones:** hormigón + acero en el mismo modelo.
- **Pasos:** cargar hormigón, generar una cabriada encima, abrir Uniones.
- **Esperado:** dice **cuántos nudos no metálicos no está listando**. Una lista más corta que el
  conteo del modelo, sin explicación, es lo que un usuario descubre en el peor momento posible.
- **Estados alternativos:** —
- **Riesgos:** `conn.jointsNotShown` recibía **el total** en vez de `hiddenJointCount`: un modelo con
  84 nudos y 6 ocultos habría informado **84 no mostrados**. Corregido en `cf99f655` — vale
  confirmarlo con un modelo mixto real.
- **Requiere:** modelo mixto.
- **Categoría:** **QA obligatorio**

---

### E-04 · Los tres estados vacíos

- **UI:** `conn-no-joints` · `conn-none-metallic` · `conn-none-metallic-why`.
- **Archivo:** `ProConnectionsTab.svelte`
- **Técnico:** `emptyReason` ∈ `noModel | noneMetallic`; `unclassifiedCount`
- **Rama:** **M2** (`c7e87fbc`). Modificada.
- **Acceso:** Uniones.
- **Precondiciones:** —
- **Pasos:** 1) modelo vacío; 2) modelo todo de hormigón.
- **Esperado:** (1) «no hay nudos»; (2) «el modelo tiene N nudos y **ninguno se puede mostrar**»,
  con **cuántos miembros quedaron sin clasificar** y **qué hacer**. Un modelo de hormigón cae en el
  segundo, que es lo correcto: **tiene nudos, ninguno es metálico**.
- **Riesgos:** que los dos digan lo mismo. Antes el panel **mentía sobre la ausencia**.
- **Requiere:** modelo de hormigón.
- **Categoría:** **QA obligatorio**

---

### E-05 · Selección de nudo desde la lista

- **UI:** filas `N<id> · N elementos · (x, y, z)`, con badge de apoyo donde corresponde.
- **Archivo:** `ProConnectionsTab.svelte` (`conn-joint-row`)
- **Técnico:** `selectJoint(nodeId)` + `highlightJoint(j)` → `uiStore.selectedNodes`
- **Rama:** preexistente en `main`; **M2** (`a47d6208`) sincronizó la selección con la escena.
  Modificada.
- **Acceso:** Uniones → lista de nudos.
- **Precondiciones:** modelo metálico.
- **Pasos:** 1) clic en una fila; 2) tabular por la lista y activar con Enter; 3) volver a clic sobre
  la misma fila.
- **Esperado:** la fila queda **marcada**; el nudo se resalta en la escena; las filas son
  **alcanzables por teclado** (son `<button>`); volver a clickear **deselecciona**.
- **Riesgos:** —
- **Categoría:** **QA obligatorio**

---

### E-06 · Miembros del nudo, separados por material

- **UI:** `conn-joint-members` con dos grupos: metálicos y no metálicos, más `conn-mixed-note`.
- **Archivo:** `ProConnectionsTab.svelte`
- **Técnico:** `metallicElementIds` / `nonMetallicElementIds`
- **Rama:** preexistente en `main`.
- **Acceso:** Uniones, con un nudo mixto seleccionado.
- **Precondiciones:** modelo mixto.
- **Pasos:** seleccionar un nudo donde concurra una viga metálica y una columna de hormigón.
- **Esperado:** separa las dos mitades y **explica de qué mitad hablan los cálculos**.
- **Riesgos:** **el split es la razón de que un nudo mixto se ofrezca**: una viga de acero que llega
  a una columna de hormigón es un detalle real que un ingeniero verifica.
- **Requiere:** modelo mixto.
- **Categoría:** **QA obligatorio**

---

### E-07 · Solicitación gobernante, con su procedencia

- **UI:** `joint-demands` — axil, corte y momento, cada uno con **qué combinación, qué miembro y qué
  extremo**.
- **Archivo:** `ProConnectionsTab.svelte`, `lib/connection/joint-demands.ts`
- **Técnico:** `GoverningDemand { value, comboName, elementId, end }`
- **Rama:** **M2** (`1f95f42f`). Nueva.
- **Acceso:** Uniones → nudo seleccionado.
- **Precondiciones:** **modelo calculado**.
- **Pasos:** 1) nave **sin calcular** → leer; 2) **Calcular** → volver a leer.
- **Esperado:** sin resultados, **`—`** en las tres; con resultados, el valor **y su procedencia**.
  Una envolvente sin procedencia es un número con el que nadie puede discutir.
- **Estados alternativos:** `joint-demand-gaps` cuando hay miembros sin esfuerzos; con un modelo
  resuelto **sin combinaciones**, cae al conjunto único de resultados en vez de negarse.
- **Riesgos:** **el panel mostraba ceros en todas las solicitaciones, en todos los modelos.**
  `getJointForces` leía `NI`, `VyI`, `MzJ`… y los campos reales de `ElementForces3D` son
  `nStart`/`nEnd`, `vyStart`/`vyEnd`, `mzStart`/`mzEnd`. Cada lectura devolvía `undefined` y caía en
  `?? 0`. Sobrevivió porque **un esfuerzo en cero se lee como una barra descargada**, no como un
  campo que no existe. **Si todos los valores dan 0 sobre la nave calculada, el defecto volvió.**
- **Requiere:** nave calculada.
- **Categoría:** **QA obligatorio**

---

### E-08 · Diámetro de bulón

- **UI:** desplegable **Diámetro**.
- **Archivo:** `ProConnectionsTab.svelte` (`jd-diameter`), `lib/connection/bolt-geometry.ts`
- **Técnico:** `TABULATED_DIAMETERS_MM` = los diámetros que **Tabla J.3.4 tabula**
- **Rama:** **M2** (`1935b83e`). Nueva.
- **Acceso:** Uniones → nudo seleccionado.
- **Precondiciones:** nudo seleccionado.
- **Pasos:** abrir el desplegable y contar.
- **Esperado:** **sólo los tabulados.** Ofrecer uno que el código no tabula sería ofrecer un bulón
  cuya distancia al borde no se puede verificar.
- **Estados alternativos:** —
- **Normativa:** **un diámetro entre dos filas de la tabla devuelve `—`, no un valor interpolado**:
  interpolar una tabla de reglamento es inventar un límite que no fija. Sólo *por encima* de la
  tabla hay una regla (`d + 3` sobre 28 mm), y ésa sí se aplica.
- **Categoría:** **QA obligatorio**

---

### E-09 · Calidad de bulón

- **UI:** desplegable **Calidad** → `A307`, `A325`, `A490`.
- **Archivo:** `ProConnectionsTab.svelte` (`jd-grade`), `lib/connection/bolted-joint.ts`
- **Técnico:** `BOLT_GRADES`; `A307: { fnt: 260, fnvIncluded: 140, fnvExcluded: null }`
- **Rama:** **M2**. Nueva.
- **Acceso:** Uniones → nudo seleccionado.
- **Pasos:** recorrer las tres y mirar cómo cambian las capacidades.
- **Esperado:** las tres presentes; las capacidades se mueven.
- **Estados alternativos:** —
- **Riesgos:** **el panel de diseño no ofrece control de roscas.** Por eso `A307` con rosca excluida
  —el caso vivo de `notVerifiable` por cláusula no tabulada— **no es alcanzable desde la UI**: el
  panel usa rosca incluida, que sí está tabulada. Ver **E-19** y la tabla final.
- **Normativa:** Tabla J.3.2 no da columna de rosca excluida para A307, e inventarla sería inventar
  un límite.
- **Categoría:** **QA recomendado**

---

### E-10 · Cantidad y filas de bulones

- **UI:** campos **Cantidad** y **Filas**.
- **Archivo:** `ProConnectionsTab.svelte` (`jd-count`, `jd-rows`)
- **Técnico:** `readField(..., { min: 1 })` + `reflect()`
- **Rama:** **M2** (`1f95f42f`, `09fa7635`). Nueva.
- **Acceso:** Uniones → nudo seleccionado.
- **Pasos:** 1) subir la cantidad y mirar la capacidad; 2) escribir `0`; 3) escribir texto.
- **Esperado:** la capacidad sube con la cantidad; una entrada inusable **mantiene la anterior y la
  caja vuelve a mostrarla** — no se queda mostrando lo rechazado.
- **Riesgos:** los inputs son de **una sola vía** (`value=` + `onchange`, sin `bind:`), así que
  cuando el manejador rechaza, Svelte no tiene motivo para tocar el DOM: **la caja seguía mostrando
  el texto rechazado mientras el modelo guardaba otra cosa**. `reflect()` es lo que lo cierra.
- **Categoría:** **QA obligatorio**

---

### E-11 · Disposición: separación y distancia al borde

- **UI:** campos **Separación** y **Distancia al borde**, en mm.
- **Archivo:** `ProConnectionsTab.svelte` (`jd-spacing`, `jd-edge`)
- **Técnico:** `readField(..., { min: 0 })` — **el cero pasa a propósito**
- **Rama:** **M2**. Nueva.
- **Acceso:** Uniones → nudo seleccionado.
- **Pasos:** 1) poner una separación **menor a 3·d**; 2) mirar la tabla de verificaciones.
- **Esperado:** el `0` y los valores chicos **no los traga el input**: los rechaza **§J.3.3**, que es
  mejor lugar para la negativa que una caja que se la come en silencio. La fila de separación pasa a
  **`exceeded`**.
- **Estados alternativos:** una violación de separación deja la unión en `exceeded` **aunque la
  resistencia esté bien**.
- **Normativa:** §J.3.3 (`s ≥ 3·d`), Tabla J.3.4 (borde), §J.3.5 (máximos).
- **Categoría:** **QA obligatorio**

---

### E-12 · Chapa: espesor y `Fu`

- **UI:** campos **Espesor de chapa** y **Fu de la chapa**.
- **Archivo:** `ProConnectionsTab.svelte` (`jd-plate-t`, `jd-plate-fu`)
- **Técnico:** `readField(..., { zero: 'invalid' })`
- **Rama:** **M2** (`1f95f42f`). Nueva.
- **Acceso:** Uniones → nudo seleccionado.
- **Pasos:** 1) dejar el espesor vacío → leer el estado; 2) poner `0`; 3) poner `12` y `400`;
  4) cambiar el espesor y mirar los veredictos.
- **Esperado:** vacío → **`incomplete`** con el dato faltante nombrado; **`0` se rechaza** — una
  chapa de 0 mm no es una chapa fina, es ninguna chapa, y una capacidad calculada sobre ella se
  leería como sobretensión ordinaria en vez de como entrada faltante; con los dos valores, la
  verificación de aplastamiento **corre**; editar el espesor **cambia los veredictos**.
- **Riesgos:** —
- **Normativa:** §J.3.10.
- **Categoría:** **QA obligatorio**

---

### E-13 · Agujero normal (Tabla J.3.3)

- **UI:** fila de agujero en la tabla de verificaciones, con su cláusula.
- **Archivo:** `lib/connection/bolt-geometry.ts`
- **Técnico:** por diámetro; `d + 3` **por encima de 28 mm**
- **Rama:** **M2** (`1935b83e`). Nueva.
- **Acceso:** Uniones → nudo con bulones elegidos.
- **Pasos:** con un bulón de 20 mm, leer el agujero.
- **Esperado:** **22 mm**.
- **Normativa:** **el agujero de §J.3.2 no es la deducción de §B.4.2**: un bulón de 20 tiene agujero
  de 22 y **descuenta 24**. Que el panel no confunda los dos es exactamente el punto.
- **Categoría:** **QA recomendado**

---

### E-14 · §J.3.3 — separación mínima entre centros

- **UI:** fila `separación mínima` en `joint-checks`, con `§J.3.3`.
- **Técnico:** `s ≥ 3·d`; **regla geométrica: no tiene capacidad asociada**
- **Rama:** **M2**.
- **Precondiciones:** bulones elegidos. **No necesita solicitación.**
- **Pasos:** con la nave **sin calcular**, leer esta fila.
- **Esperado:** **corre igual**, porque es geométrica. La nota dice que no tiene capacidad asociada.
- **Categoría:** **QA obligatorio**

---

### E-15 · §J.3.4 — distancia mínima al borde

- **UI:** fila `distancia al borde`, con `§J.3.4`.
- **Técnico:** Tabla J.3.4 por diámetro y tipo de borde; `1,75·d` / `1,25·d` por encima de 30 mm
- **Rama:** **M2**.
- **Precondiciones:** bulones elegidos. **No necesita solicitación.**
- **Pasos:** con la nave sin calcular, leer esta fila; después poner un diámetro **entre** dos filas
  de la tabla.
- **Esperado:** corre sin solicitación; un diámetro no tabulado da **`—`** con el motivo, **no un
  valor interpolado**.
- **Normativa:** sí — la tabla es texto transcribible, no imagen, y por eso se pudo implementar.
- **Categoría:** **QA obligatorio**

---

### E-16 · §J.3.6 — corte y tracción del bulón

- **UI:** filas `corte` y `tracción`, con `§J.3.6`, y `demanda / capacidad` en kN.
- **Rama:** **M2**.
- **Precondiciones:** **modelo calculado.**
- **Pasos:** 1) sin calcular → leer; 2) calcular → leer.
- **Esperado:** sin solicitación queda **`unavailable`**, y **eso es la respuesta correcta, no un
  hueco**; con solicitación, demanda y capacidad con su cláusula.
- **Categoría:** **QA obligatorio**

---

### E-17 · §J.3.7 — tracción y corte combinados

- **UI:** fila `combinada`, con `§J.3.7`.
- **Técnico:** la tracción disponible **baja al crecer el corte**, con tope en `Fnt`
- **Rama:** **M2**.
- **Precondiciones:** modelo calculado, con corte y tracción a la vez.
- **Pasos:** leer la fila y su nota.
- **Esperado:** la nota lo explica; requiere **las dos** solicitaciones y lo dice cuando falta una.
- **Normativa:** **no incluye el efecto de palanca** — depende de la flexibilidad de la chapa y de la
  distancia del bulón al alma, que el modelo no registra. La nota lo declara.
- **Categoría:** **QA obligatorio**

---

### E-18 · §J.3.10 — aplastamiento de la chapa

- **UI:** fila `aplastamiento`, con `§J.3.10`.
- **Técnico:** corre sobre el espesor y `Fu` **elegidos**
- **Rama:** **M2**.
- **Precondiciones:** modelo calculado + chapa con espesor y `Fu`.
- **Pasos:** 1) con chapa de 12 mm → leer; 2) bajarla a 8 mm → volver a leer.
- **Esperado:** el veredicto **cambia**. La nota dice si la deformación alrededor del agujero se
  considera o no en el proyecto.
- **Riesgos:** **la chapa dibujada en 3D es la misma sobre la que corre esta verificación**, por
  construcción y no por cuidado: `jointSceneLayout` consume el mismo `JointDesign`.
- **Categoría:** **QA obligatorio**

---

### E-19 · Estado de la unión

- **UI:** chip de estado en el encabezado del diseño (`joint-design-state`).
- **Archivo:** `lib/connection/joint-design.ts`, `bolted-joint.ts`
- **Técnico:** cinco estados — `notDesigned`, `incomplete`, `notVerifiable`, `designed`, `exceeded`
- **Rama:** **M2** (`1f95f42f`). Nueva.
- **Acceso:** Uniones → nudo seleccionado.
- **Precondiciones:** —
- **Pasos:** 1) nudo recién seleccionado; 2) elegir bulones sin chapa; 3) completar todo con la nave
  **calculada**; 4) bajar la cantidad hasta que no alcance; 5) violar la separación con la
  resistencia holgada.
- **Esperado:** (1) **`notDesigned`** — no hay elección todavía; (2) **`incomplete`**, **no
  «adecuada»**, con el dato faltante nombrado; (3) **`designed`**; (4) **`exceeded`**;
  (5) **`exceeded`** igual. **Ningún estado que no sea adecuado se lee como aprobado, y ninguno
  lleva ✓ verde ni la palabra «verificado».**
- **Estados alternativos:** **`notVerifiable`** = todas las entradas están y **una cláusula igual no
  se puede evaluar**. Es la diferencia con `incomplete`, que es lo que el usuario puede aportar.
  **Desde el panel de bulones no es alcanzable hoy** (ver E-09); sí lo es en soldaduras (**F-08**).
- **Riesgos:** cada nudo guarda **su propio** diseño; conviene confirmarlo cambiando entre dos.
- **Requiere:** nave calculada.
- **Categoría:** **QA obligatorio** **[3×]**

---

### E-20 · Entradas rechazadas, dichas en voz alta

- **UI:** `jd-input-problem` bajo el formulario.
- **Archivo:** `ProConnectionsTab.svelte`, `web/src/lib/utils/numeric-input.ts`
- **Técnico:** `parseNumericInput` con tres respuestas que no se mezclan: `value` (incluido 0),
  `empty`, `invalid`; cada campo **declara qué significa cero para él**
- **Rama:** **M2** (`09fa7635`). Nueva.
- **Acceso:** Uniones → nudo seleccionado.
- **Precondiciones:** —
- **Pasos:** por cada campo: escribir un negativo, texto, y vaciarlo.
- **Esperado:** el rechazo **se dice**; el valor almacenado queda intacto; la caja deja de mostrar lo
  rechazado; la queja **se borra en cuanto el campo vuelve a parsear**.
- **Riesgos:** **no hay un default seguro para el cero**: un huelgo de 0 es contacto continuo y un
  cateto de soldadura de 0 no es una soldadura fina sino **ninguna** soldadura. Trece manejadores de
  este panel y uno del modal de secciones pasaron por acá, y **ya no queda ninguna ocurrencia de
  `Number(...) || default` en `src/components/pro/`**.
- **Categoría:** **QA obligatorio**

---

### E-21 · El cálculo auxiliar Vu/Tu, sin veredicto

- **UI:** secciones **2 · Bulones** y **3 · Soldaduras** — entradas manuales, botón de cálculo y una
  ficha de resultado **rotulada como control auxiliar**.
- **Archivo:** `ProConnectionsTab.svelte` (`conn-bolt-result`, `conn-bolt-aux-label`,
  `conn-bolt-aux-normative`, `conn-weld-result`, …)
- **Técnico:** `auxTone(status)`; vocabulario propio **`within / near the limit / over the limit`**
- **Rama:** **M2** (`8e538631`, decisión 2). Modificada.
- **Acceso:** Uniones → secciones 2 y 3.
- **Precondiciones:** nudo elegido (las dos secciones **no ofrecen nada hasta que hay uno**).
- **Pasos:** 1) apretar **Verificar** con los valores por defecto; 2) mirar el glifo, la redacción y
  el color; 3) mirar el **encabezado** de la sección; 4) correr las dos calculadoras y buscar un ✓ en
  todo el panel.
- **Esperado:** **ningún `✓`**, ningún tono de éxito, la **etiqueta de control auxiliar antes de
  cualquier número**, y un puntero a **§1** para el estado que cuenta. Los encabezados de las
  secciones 2 y 3 son **`optional`**, **nunca `done`**.
- **Estados alternativos:** **§1, la detección de nudos, conserva su `done` a propósito**: significa
  que el detector corrió y encontró nudos — un hecho sobre un paso, sin decir nada sobre adecuación.
- **Riesgos:** **la tilde estaba en dos lugares.** Además de la ficha, `StageSection` pinta `done`
  como `✓` en `--st-ok`, y las dos secciones llegaban a `done` **apenas existía un objeto
  resultado** — no cuando el resultado era bueno: cuando **existía**. Un grupo de bulones por encima
  de su capacidad ponía su propio encabezado en verde, y también lo hacía apretar Verificar con
  Vu = Tu = 0, donde la utilización da 0 % **porque no se le pidió nada al nudo**. El vocabulario es
  deliberadamente distinto del canónico: `conn.checkState.adequate` es «cumple» en español, y la
  colisión estaba a una palabra.
- **Normativa:** el bloque está rotulado «cálculo experimental, sin tests y sin cláusulas mapeadas».
- **Categoría:** **QA obligatorio** **[3×]**

---

### E-22 · Aviso `FvExcl`

- **UI:** `conn-fvexcl-warning`, **junto al resultado**.
- **Archivo:** `ProConnectionsTab.svelte`
- **Técnico:** condicionado al **grado**, no a la casilla de roscas
- **Rama:** preexistente en `main`.
- **Acceso:** Uniones → sección **Bulones** (cálculo auxiliar).
- **Precondiciones:** nudo elegido.
- **Pasos:** 1) elegir grado **4.6** **antes** de calcular nada; 2) elegir **8.8**; 3) elegir
  **10.9**; 4) calcular con 4.6 y mirar dónde está el aviso.
- **Esperado:** aparece **al elegir 4.6 o 5.6, antes de que exista cualquier resultado** — así que
  alguien que nunca toca la casilla igual se entera de que destildarla no cambiaría el número;
  **desaparece con 8.8 y 10.9**, que es lo que evita que el lector aprenda a ignorarlo; y está
  **junto al resultado**, no sólo al pie.
- **Riesgos:** el comentario del código decía que estaba atado a la casilla; la condición real es
  **más conservadora**. Auditado y sin defecto.
- **Normativa:** sí — Tabla J.3.2 no tabula roscas fuera del plano de corte para 4.6 y 5.6.
- **Categoría:** **QA obligatorio**

---

### E-23 · Las cinco limitaciones

- **UI:** sección **4 · Limitaciones**, cinco entradas, **cada una con cuatro facetas**: qué existe,
  qué falta, si afecta el resultado, alcance. Y al pie: nada de esto es certificable.
- **Archivo:** `ProConnectionsTab.svelte` (`conn-gaps`, `conn-gap-*-exists|missing|affects|scope`,
  `conn-gaps-not-certifiable`)
- **Técnico:** `steel-surface-audit.test.ts` las fija por nombre
- **Rama:** preexistente en `main`; **M1** (`1ea7893b`) corrigió la cuarta.
- **Acceso:** Uniones → sección 4.
- **Precondiciones:** —
- **Pasos:** confirmar las cinco y sus cuatro facetas.
- **Esperado:**
  1. **Rotura del metal base, no verificada** — afecta: **sí**;
  2. **Geometría del grupo de bulones, incompleta** — afecta: **sí**;
  3. **Torsión calculada y no mostrada** — afecta: **no**. Es un hueco de exposición: el número
     existe y no se dibuja. **Que diga «no» es lo correcto**;
  4. **Aluminio fuera del filtro** — afecta: **sí**. La frase de alcance ya **no** afirma que el
     inventario metálico lista los miembros de aluminio (era falso desde M1, corregido en
     `1ea7893b`);
  5. **Roscas fuera del plano de corte, sin tabular para 4.6 y 5.6** — afecta: **sí**.
- **Riesgos:** que la 3 pase a decir «sí» junto con las otras cuatro. La asimetría es el contenido.
- **Normativa:** sí, las cinco.
- **Categoría:** **QA obligatorio** **[3×]**

---

### E-24 · Visualización 3D de la unión abulonada

- **UI:** la chapa y **un bulón por agujero**, en el visor.
- **Archivo:** `web/src/components/Viewport3D.svelte`, `web/src/lib/three/joint-layout.ts`
- **Técnico:** `jointSceneLayout(design, axis)` consume **el mismo `JointDesign`** que lista el
  panel; el vástago se dibuja **al diámetro del bulón**, no al del agujero
- **Rama:** **M2** (`1f95f42f`, `a47d6208`). Nueva.
- **Acceso:** Uniones → nudo diseñado → visor 3D.
- **Precondiciones:** nave calculada, bulones y chapa completos.
- **Pasos:** 1) diseñar un nudo completo; 2) mirar el visor; 3) contar los bulones; 4) deshacer el
  diseño; 5) cambiar la cantidad de bulones.
- **Esperado:** **la chapa y un bulón por agujero, ni uno más**; deshacer el diseño **borra las
  mallas**; cambiar la cantidad las reconstruye.
- **Estados alternativos:** ver **H-09** a **H-12**.
- **Riesgos:** la Tabla J.3.3 da 22 mm de agujero para un bulón de 20; un vástago que llenara el
  agujero sería **2 mm más gordo en cada uno**. Y **el grupo 3D de la unión no era reactivo**: un
  `let` plano asignado durante el montaje no notifica, así que el efecto corría una vez con
  `undefined` y no volvía — `state: "designed"`, chapa visible en el panel, **cero mallas y el
  contador nunca escrito**, que es distinto de un contador en cero.
- **Requiere:** nave calculada.
- **Categoría:** **QA obligatorio**

---

### E-25 · Aviso de uniones obsoletas ⭐ SUPERFICIE NUEVA

> **Agregada el 2026-08-27.** No existía cuando se escribió este inventario: la creó `d12ad5cb` al
> cerrar **I-07**. Es la mitad visible de esa reparación, y la parte que un revisor no va a encontrar
> buscando en la lista original.

- **UI:** nota al pie del panel de uniones: **cuántas** uniones quedaron colgadas, **por qué** cada
  una, y **dos remedios** — descartar una, o descartar todas.
- **Archivo:** `web/src/components/pro/ProConnectionsTab.svelte` (`conn-obsolete-notice`,
  `conn-obsolete-title`, `conn-obsolete-{nodeId}`, `conn-obsolete-reason-{nodeId}`,
  `conn-obsolete-discard-{nodeId}`, `conn-obsolete-discard-all`)
- **Técnico:** `jointDesignStore.obsolete` — se conserva la unión, **no se aplica**
  (`choicesFor` responde vacío) y **no se itera** (`designedNodeIds` la excluye, así que un documento
  no la tabula).
- **Rama:** **M2**. **Nueva.**
- **Acceso:** cinta **Diseño** → *Metálicas* → **Uniones metálicas**, al pie.
- **Precondiciones:** un modelo con al menos un nudo diseñado, y después modificado.
- **Pasos:** 1) diseñar tres nudos; 2) **borrar** uno; 3) **mover** otro; 4) agregarle **una barra**
  al tercero; 5) leer el aviso; 6) **descartar una**; 7) **descartar todas**; 8) confirmar que un
  documento/exportación **no** las tabula; 9) recorrerlo en `Español` / `English` / `Português`.
- **Esperado:** (5) tres entradas, con `nodeMissing`, `nodeMoved` y `topologyChanged`
  respectivamente, cada una como **oración**, no como código; (6) desaparece sólo ésa; (7) el aviso
  entero desaparece; (8) las obsoletas no aparecen en ningún conteo de uniones diseñadas.
- **Estados alternativos:** sin obsoletas el aviso **no se renderiza** — vale confirmar que no queda
  un contenedor vacío. Un nudo obsoleto se reporta como `notDesigned` en el panel, porque **para este
  modelo** nada se diseñó ahí.
- **Riesgos:** el punto de todo esto es que **una entrada obsoleta que simplemente se ignora es
  indistinguible de una unión que nadie diseñó nunca**, y una de las dos es trabajo que el usuario
  hizo. Si el aviso no aparece, el usuario pierde trabajo sin enterarse. Es el ítem con el peor modo
  de falla silencioso de esta sección.
- **Requiere:** —
- **Normativa:** —
- **Categoría:** **QA obligatorio** **[3×]**
- **Prioridad:** **crítica**

---

# F · Soldaduras

Precondición común: Uniones metálicas → nudo seleccionado → sub-sección **Soldadura** del bloque de
diseño.

> **Una soldadura de filete completa y adecuada nunca llega a `designed`.** Queda en
> `notVerifiable`, y no es un defecto: la Tabla J.2.5 hace que el metal base esté «Gobernado por la
> Sección J.4», que necesita las áreas del miembro en la unión. **QA no debería leer eso como un
> bug.**

---

### F-01 · Alta y baja de la soldadura

- **UI:** botón **Agregar** en el encabezado de la sub-sección; **Quitar** al pie.
- **Archivo:** `ProConnectionsTab.svelte` (`joint-weld-add`, `joint-weld-remove`,
  `joint-weld-none`)
- **Técnico:** `setWeld({ legMm: 6, lengthMm: 200, runs: 2, process: 'manual', loading: 'other' })`
- **Rama:** **M2** (`f9eb1fe0`). Nueva.
- **Acceso:** Uniones → nudo → sub-sección Soldadura.
- **Precondiciones:** nudo seleccionado.
- **Pasos:** 1) leer el estado inicial; 2) Agregar; 3) Quitar.
- **Esperado:** arranca **ausente**, y el texto dice que **una soldadura ausente no es una
  incompleta** — la mayoría de las uniones abulonadas no lleva ninguna. Agregar abre los controles
  con valores de arranque; Quitar la vuelve a ausente.
- **Riesgos:** —
- **Categoría:** **QA obligatorio**

---

### F-02 · Cateto (lado)

- **UI:** campo **Cateto**, en mm.
- **Archivo:** `ProConnectionsTab.svelte` (`jw-leg`)
- **Técnico:** `readField('w-leg', ..., { zero: 'invalid' })`
- **Rama:** **M2**. Nueva.
- **Pasos:** 1) escribir `6`; 2) escribir `0`; 3) escribir un cateto por debajo del mínimo de la
  parte más gruesa.
- **Esperado:** `0` **se rechaza** — un cateto de 0 no es una soldadura fina, es **ninguna**
  soldadura; un cateto insuficiente da **`exceeded`** contra la **Tabla J.2.4**.
- **Normativa:** §J.2.4 — mínimo por la parte más gruesa, máximo por la más delgada.
- **Categoría:** **QA obligatorio**

---

### F-03 · Longitud, y longitud efectiva

- **UI:** campo **Longitud** y valor derivado **Longitud efectiva**.
- **Archivo:** `ProConnectionsTab.svelte` (`jw-length`, `jw-effective-length`)
- **Rama:** **M2**. Nueva.
- **Pasos:** 1) escribir `200`; 2) leer la longitud efectiva; 3) probar `L < 4a`.
- **Esperado:** la longitud efectiva se deriva y se muestra; la condición **`L ≥ 4a`** aparece como
  verificación con su cláusula.
- **Normativa:** §J.2.2 y la reducción de §J.2.1.
- **Categoría:** **QA obligatorio**

---

### F-04 · Corridas

- **UI:** desplegable **Corridas** → una / dos.
- **Archivo:** `ProConnectionsTab.svelte` (`jw-runs`)
- **Rama:** **M2**.
- **Pasos:** alternar y mirar el área efectiva.
- **Esperado:** dos opciones y nada más — un filete de un lado de la chapa, o de los dos. **No hay
  otro conteo de corridas que un detallista nombre.**
- **Categoría:** **QA recomendado**

---

### F-05 · `FEXX`

- **UI:** campo **FEXX**, en MPa.
- **Archivo:** `ProConnectionsTab.svelte` (`jw-fexx`)
- **Técnico:** `readField('w-fexx', ..., { zero: 'invalid' })`
- **Rama:** **M2**.
- **Pasos:** 1) dejarlo vacío → leer el estado; 2) cargarlo → volver a leer.
- **Esperado:** vacío deja la soldadura **`incomplete`** con el dato nombrado; cargado, la capacidad
  del electrodo entra en la verificación.
- **Normativa:** §J.2.4 — capacidad del electrodo.
- **Categoría:** **QA obligatorio**

---

### F-06 · Espesores de las partes

- **UI:** campos **Parte más gruesa** y **Parte más delgada**.
- **Archivo:** `ProConnectionsTab.svelte` (`jw-thicker`, `jw-thinner`)
- **Rama:** **M2**.
- **Pasos:** cargar los dos y mirar el **rango de tamaño** que aparece.
- **Esperado:** el mínimo sale de la más gruesa y el máximo de la más delgada, cada uno con su
  cláusula.
- **Normativa:** §J.2.4.
- **Categoría:** **QA obligatorio**

---

### F-07 · Proceso: manual vs. arco sumergido

- **UI:** desplegable **Proceso** → *manual* / *arco sumergido*.
- **Archivo:** `ProConnectionsTab.svelte` (`jw-process`), `lib/connection/fillet-weld.ts`
- **Técnico:** para arco sumergido la garganta **es el cateto** hasta 9 mm; para manual es `0,707·w`
- **Rama:** **M2** (`f9eb1fe0`). Nueva.
- **Acceso:** sub-sección Soldadura.
- **Precondiciones:** cateto cargado.
- **Pasos:** 1) con cateto 6 y proceso manual, leer **Garganta**; 2) cambiar a arco sumergido y
  volver a leerla.
- **Esperado:** la garganta cambia — **hasta un 41 % de diferencia**. Por eso es una **elección** y
  no una hipótesis.
- **Riesgos:** si la garganta no se mueve al cambiar el proceso, el caso de arco sumergido se perdió.
- **Normativa:** §J.2.2(a).
- **Categoría:** **QA obligatorio**

---

### F-08 · Estado `notVerifiable`, y la explicación de §J.4

- **UI:** chip de estado de la soldadura + `joint-weld-j4`.
- **Archivo:** `ProConnectionsTab.svelte`, `lib/connection/fillet-weld.ts`
- **Técnico:** `design.weld.state === 'notVerifiable'` → aparece la explicación
- **Rama:** **M2** (`f9eb1fe0`). Nueva.
- **Acceso:** sub-sección Soldadura, con todos los campos cargados.
- **Precondiciones:** cateto, longitud, FEXX y los dos espesores.
- **Pasos:** completar todo, con valores holgados, y leer el estado.
- **Esperado:** **`notVerifiable`**, y **debajo, la frase que nombra §J.4** — porque «notVerifiable»
  por sí solo **no dice cuál estado límite se salteó**.
- **Estados alternativos:** con un cateto insuficiente, **`exceeded`**; con un campo faltante,
  **`incomplete`**.
- **Riesgos:** **como la Tabla J.2.5 remite el metal base al Capítulo J.4, cualquier unión que
  incluya una soldadura queda en `notVerifiable` aunque todo lo demás cumpla.** En la práctica
  `designed` sólo se alcanza en uniones **puramente abulonadas**. Es la diferencia entre «esta unión
  pasó lo que la app sabe verificar» y «esta unión está verificada», y la app se niega a decir la
  segunda.
- **Normativa:** §J.4 (J.4.1 tracción, J.4.2 corte, J.4.3 **rotura de bloque de corte**, J.4.4
  compresión, J.4.5 flexión). Está entero en el texto embarcado y **no se implementó**: necesita las
  áreas bruta y neta **del miembro en la unión**. Declararlo pendiente es más útil que media
  implementación sin la rotura de bloque de corte, que es justamente la que suele gobernar.
- **Categoría:** **Limitación conocida** + **QA obligatorio** (que la explicación esté)

---

### F-09 · Cada verificación de soldadura nombra su cláusula

- **UI:** tabla `joint-weld-checks`, columna de cláusula.
- **Rama:** **M2**.
- **Pasos:** recorrer las filas.
- **Esperado:** §J.2.1, §J.2.2, §J.2.4 según corresponda; **una verificación que no pudo correr dice
  por qué**.
- **Categoría:** **QA obligatorio**

---

### F-10 · Ausencia de tilde verde en soldaduras

- **UI:** ninguna.
- **Rama:** **M2** (`8e538631`).
- **Pasos:** con las dos calculadoras corridas, buscar un `✓` en cualquier estado de la soldadura.
- **Esperado:** **ninguno**, en ningún estado.
- **Categoría:** **Sólo verificación automática**, **[3×]** en el pase de idiomas

---

### F-11 · La soldadura no se dibuja en 3D

- **UI:** ausencia deliberada.
- **Archivo:** `lib/three/joint-layout.ts` — no hay `PlacedWeld`
- **Rama:** **M2**.
- **Pasos:** diseñar una soldadura completa y mirar el visor.
- **Esperado:** **no aparece nada** de soldadura. El modelo **no registra dónde va el cordón** —
  dónde empieza, dónde termina, sobre qué caras.
- **Riesgos:** que el usuario lo lea como que la soldadura no se guardó. La sub-sección sí muestra su
  estado.
- **Categoría:** **Fuera del alcance actual**

---

# G · Presillas y perfiles compuestos

Dos superficies, y conviene no confundirlas:

- **en el modal de secciones** (`BattenPanel`) — reglas y grupo, **sin longitud** → ver **A-24**;
- **en el panel de uniones** (sub-sección **Presillas**) — **con** el miembro y su longitud, así que
  hay estaciones y separación reales.

Precondición común de este bloque: Uniones metálicas → nudo seleccionado → sub-sección **Presillas**.

---

### G-01 · Alta y baja de presillas

- **UI:** botón **Agregar** / **Quitar** de la sub-sección.
- **Archivo:** `ProConnectionsTab.svelte` (`joint-battens-add`, `joint-battens-remove`,
  `joint-battens-none`)
- **Técnico:** `setBattens({ arrangement: 'doubleBack', gapMm: 10, segments: 3, memberId, lengthM })`
- **Rama:** **M2** (`09fa7635`). Nueva.
- **Pasos:** 1) leer el estado inicial; 2) Agregar; 3) Quitar.
- **Esperado:** arranca ausente y lo dice; agregar abre el formulario con la disposición espalda con
  espalda, huelgo 10 y tres tramos.
- **Categoría:** **QA obligatorio**

---

### G-02 · Grupo I con huelgo cero

- **UI:** campo **Huelgo** → `0` → el panel declara **Grupo I** y **no coloca presillas**.
- **Archivo:** `ProConnectionsTab.svelte` (`jb-gap`), `lib/connection/batten-geometry.ts`
- **Técnico:** `builtUpGroup()` lee `gapMm <= 0` como Grupo I; `battenLayout` rechaza el negativo
  **antes** de clasificar
- **Rama:** **M2** (`09fa7635`). **Corrección de un defecto con consecuencia normativa.**
- **Acceso:** sub-sección Presillas.
- **Precondiciones:** presillas agregadas.
- **Pasos:** 1) escribir `0`; 2) leer el grupo, las estaciones y si hay mensaje de error;
  3) **volver a escribir `12`**.
- **Esperado:** `0` → **Grupo I, sin presillas, sin estaciones, y sin mensaje de error** — 0 es una
  entrada válida. Y **se puede salir de ahí**: el campo del huelgo sigue en pantalla.
- **Estados alternativos:** `0` y `12` **no** producen el mismo panel.
- **Riesgos:** dos defectos encadenados vivían acá. (1) `Number(e.target.value) || 10` guardaba un
  **0 escrito a propósito como 10**, y lo que se perdía no era un número: era **el Grupo I de
  §E.6.1** — cordones en contacto continuo unidos por bulones o soldadura, que **no llevan
  presillas**. Ese grupo quedaba inalcanzable desde el panel, y la sección seguía declarando
  presillas sobre una disposición donde el reglamento no coloca ninguna. (2) El formulario vivía
  **dentro** de la rama «layout disponible», así que escribir 0 desmontaba el propio campo que se
  acababa de usar: **una puerta de una sola dirección**. El formulario se sacó fuera de la
  bifurcación.
- **Normativa:** §E.6.1, Grupo I.
- **Categoría:** **QA obligatorio**

---

### G-03 · Grupo V con huelgo mayor que cero

- **UI:** con huelgo > 0, el panel declara **Grupo V** y muestra estaciones y separación.
- **Archivo / técnico:** idem G-02.
- **Rama:** **M2**.
- **Pasos:** escribir `12` y leer el grupo, las estaciones y `a`.
- **Esperado:** **Grupo V** — «cordones unidos por presillas a intervalos regulares» —, **cuatro
  estaciones** con tres tramos (dos extremos + dos intermedias), `a = L/n`, y la longitud no
  arriostrada del cordón **igual a `a`**.
- **Normativa:** §E.6.1 Grupo V; §E.6.3.1(b)(1) para `k = 1`.
- **Categoría:** **QA obligatorio**

---

### G-04 · Mínimo de tres tramos

- **UI:** desplegable **Tramos** → `3, 4, 5, 6, 8`.
- **Archivo:** `ProConnectionsTab.svelte` (`jb-segments`)
- **Rama:** **M2**.
- **Pasos:** 1) abrir el desplegable y buscar el `2`; 2) subir a 6 y mirar la separación.
- **Esperado:** **no ofrece nada por debajo de 3** — §E.6.3.2(b)(2) no permite dos; **más tramos dan
  una separación más corta**.
- **Normativa:** §E.6.3.2(b)(2).
- **Categoría:** **QA obligatorio**

---

### G-05 · Miembro de referencia, nombrado

- **UI:** línea `jb-reference` — `E<id> · familia · longitud · extremo`.
- **Archivo:** `ProConnectionsTab.svelte`
- **Rama:** **M2** (`09fa7635`). Nueva.
- **Pasos:** leerla.
- **Esperado:** dice **cuál** miembro. «Longitud» a secas era la ambigüedad que esto reemplaza: a un
  nudo llegan varios miembros y **sólo uno se está presillando**.
- **Categoría:** **QA obligatorio**

---

### G-06 · Selector de miembro

- **UI:** desplegable `jb-member`, **sólo cuando concurre más de un miembro**.
- **Archivo:** `ProConnectionsTab.svelte` (`jb-member`, `jb-preloaded`)
- **Rama:** **M2**. Nueva.
- **Precondiciones:** un nudo con dos o más miembros.
- **Pasos:** 1) nudo con un solo miembro → confirmar que es texto, no desplegable; 2) nudo con
  varios → cambiar de miembro; 3) mirar las estaciones.
- **Esperado:** con un solo miembro **no hay control** — un control con una sola opción enseña que
  existe una decisión donde no la hay; **cambiar el miembro cambia las estaciones**; y el panel dice
  que la preselección (el más largo) es **una selección inicial, no una regla**.
- **Riesgos:** el miembro elegido se guarda para que un re-render **no lo devuelva en silencio** al
  más largo.
- **Categoría:** **QA obligatorio**

---

### G-07 · Estaciones

- **UI:** `jb-stations` — la lista de posiciones en metros.
- **Archivo:** `lib/connection/batten-geometry.ts`
- **Rama:** **M2**.
- **Pasos:** leerlas con 3 tramos y con 6.
- **Esperado:** intermedias **iguales y uniformemente espaciadas**, y presillas **en los extremos,
  lo más próximas posible**.
- **Normativa:** §E.6.3.2(b)(1) y (b)(2).
- **Categoría:** **QA obligatorio**

---

### G-08 · Separación `a`, planos y enfrentamiento

- **UI:** `battens.spacing`, `battens.planes`, `jb-facing`.
- **Rama:** **M2**.
- **Pasos:** leer los tres.
- **Esperado:** la separación en mm; el número de planos; y la instrucción de que **las presillas de
  cada plano van enfrentadas** — es una instrucción de fabricación que ninguna dimensión carga.
- **Normativa:** §E.6.3.2(b)(3).
- **Categoría:** **QA recomendado**

---

### G-09 · `a / ri`

- **UI:** campo **ri del cordón** + valor derivado `jb-slenderness`.
- **Archivo:** `ProConnectionsTab.svelte` (`jb-chord-ri`, `jb-slenderness`)
- **Técnico:** `chordUnbracedLengthM · 1000 / chordRiMm`; `zero: 'invalid'`
- **Rama:** **M2**. Nueva.
- **Pasos:** 1) dejarlo vacío → leer `a/ri`; 2) cargarlo; 3) escribir `0`.
- **Esperado:** vacío → **`—`**; cargado → el cociente; `0` **rechazado** — un radio de giro nulo no
  es un cordón esbelto, es **ningún** cordón.
- **Riesgos:** **es una entrada y no una búsqueda a propósito**: a un nudo llegan varios miembros y
  la app **no puede saber cuál es el cordón que se está presillando**. Adivinarlo pondría un número
  en una esbeltez que el usuario nunca verificó.
- **Normativa:** §E.6.3.1(b) — λ₁; y §E.6.2.2(a)(3), `a/ri ≤ 3/4` de la esbeltez gobernante.
- **Categoría:** **QA obligatorio**

---

### G-10 · La chapa de la presilla: `GEOMETRY_UNAVAILABLE`

- **UI:** línea `joint-battens-plate` — estado, faltantes y la cláusula de la condición.
- **Archivo:** `ProConnectionsTab.svelte`, `lib/connection/batten-geometry.ts`
- **Rama:** **M2**.
- **Pasos:** leerla.
- **Esperado:** **`GEOMETRY_UNAVAILABLE`**, con lo que falta y con la condición que tendría que
  satisfacer, para que se sepa **qué** falta y no sólo **que** falta algo.
- **Normativa:** **§E.6 no da espesor, ancho ni altura de presilla en ninguna parte.** La única
  propiedad que nombra es `Ip`, y sólo dentro de `np·Ip/h ≥ 10·I1/a` (E.6.19); el dimensionamiento
  se remite al Capítulo F para la chapa y al J para sus uniones. **Posiciones correctas con un
  espesor inventado serían una ficción vestida de respuesta correcta.**
- **Categoría:** **Limitación conocida**

---

### G-11 · Fuera de alcance: disposición que no es Grupo V

- **UI:** `joint-battens-unavailable` con el motivo.
- **Rama:** **M2**.
- **Pasos:** poner una disposición que no sea una barra armada de Grupo V.
- **Esperado:** lo dice, en vez de mostrar un layout vacío.
- **Categoría:** **QA recomendado**

---

### G-12 · Huelgo negativo

- **UI:** `jb-input-problem`.
- **Rama:** **M2** (`09fa7635`).
- **Pasos:** 1) escribir `-5`; 2) vaciar el campo.
- **Esperado:** `-5` → **rechazo visible**, el huelgo anterior **intacto**, y la caja deja de mostrar
  el texto rechazado; campo **vacío** → vuelve al default explícito de **10 mm**, **escrito de vuelta
  en la caja** y **sin queja** — el usuario no expresó nada, así que el panel propone lo usual.
- **Riesgos:** `builtUpGroup` lee `gapMm <= 0` como Grupo I, lo cual es correcto para 0 y
  **silenciosamente falso para −5**. Por eso el rechazo va **antes** de clasificar.
- **Categoría:** **QA obligatorio**

---

# H · Nudos y visor 3D

Precondición común: modelo cargado y visor 3D abierto. Casi todo este bloque se mide sobre la
**nave**, que es donde los números importan.

---

### H-01 · Escala de los marcadores de nodo

- **UI:** las esferas de nodo, en cualquier modelo.
- **Archivo:** `web/src/lib/three/node-scale.ts`, `nodes-instanced.ts`
- **Técnico:** radio = fracción de la **diagonal del modelo**, acotada arriba y abajo; en modo
  secciones se reduce a la mitad, **nunca por debajo del piso**
- **Rama:** **M2** (`a47d6208`, medido en `81c27283`). Nueva.
- **Acceso:** visor 3D.
- **Precondiciones:** —
- **Pasos:** 1) modelo chico (una viga de 2 m); 2) la **nave** (30 m); 3) alternar a modo secciones
  en los dos.
- **Esperado:** el marcador se ve razonable en los dos; en modo secciones **se achica pero sigue
  siendo clickeable**.
- **Estados alternativos:** —
- **Riesgos:** eran una esfera **fija de 0,07 m** — un tercio de una barra en un modelo de 2 m, una
  mota en una nave de 30 m; el banco de picking midió **8 px en un extremo y 144 px en el otro para
  el mismo marcador**. Y el piso **no es estético**: `NodesInstanced` hace raycast sobre la malla
  visible, así que **el marcador ES el blanco de click**. Achicarlo para que se vea prolijo achica lo
  que se puede seleccionar. **Un nodo clickeable en un modo y no en otro es peor que uno grande.**
  Apareció además un defecto latente: el caché de geometría de esferas **ignoraba el radio que
  recibía**, así que el primero que se pidiera ganaba para toda la sesión.
- **Requiere:** nave + un modelo chico.
- **Categoría:** **QA obligatorio**

---

### H-02 · Picking

- **UI:** clic sobre un nodo lo selecciona.
- **Archivo:** `nodes-instanced.ts`
- **Rama:** **M2** (`a47d6208`). Modificada.
- **Pasos:** 1) clickear nodos en la nave; 2) **redimensionar la ventana** y volver a clickear;
  3) cambiar a modo secciones y clickear.
- **Esperado:** el picking sigue funcionando después del resize y en los dos modos.
- **Riesgos:** el gizmo de nodos **se midió, se declaró seguro y no se implementó** — es cosmético y
  quedó después del workflow. **Las esferas siguen siendo el blanco.**
- **Categoría:** **QA obligatorio**

---

### H-03 · Lista → escena

- **UI:** elegir un nudo en el panel lo resalta en el visor.
- **Archivo:** `ProConnectionsTab.svelte` (`highlightJoint`)
- **Rama:** **M1** + **M2**.
- **Pasos:** clickear filas de la lista y mirar el visor.
- **Esperado:** el nodo se resalta y el visor lo enfoca.
- **Categoría:** **QA obligatorio**

---

### H-04 · Escena → lista

- **UI:** clickear un nodo en el visor abre **ese** nudo en el panel.
- **Archivo:** `ProConnectionsTab.svelte`, `$effect` sobre `uiStore.selectedNodes`
- **Técnico:** sólo cuenta una selección de **un** nodo; la lectura de `joints` va `untrack`
- **Rama:** **M2** (`a47d6208`). Nueva.
- **Acceso:** Uniones + visor.
- **Pasos:** 1) clickear un nodo metálico en la escena; 2) hacer un box-select de cuarenta nodos;
  3) clickear un nodo **no** metálico.
- **Esperado:** (1) el panel pasa a describir ese nudo y **borra los resultados auxiliares
  anteriores**; (2) **no** cambia la selección del panel — cuarenta nodos no tienen **un** nudo que
  describir, y elegir el primero sería inventar un foco que el usuario no expresó; (3) no pasa nada,
  porque no es un nudo listado.
- **Riesgos:** **esta dirección no funcionaba**: `selectedJointId` era puramente local, así que
  clickear un nodo en el visor lo resaltaba y **el panel seguía describiendo otro nudo, sin que nada
  lo dijera** — dos superficies mostrando dos cosas distintas.
- **Categoría:** **QA obligatorio**

---

### H-05 · Modo secciones: perfiles simples

- **UI:** «Modelo con secciones» — cada barra extruida con su perfil.
- **Archivo:** `web/src/lib/three/create-element-mesh.ts`, `section-profiles.ts`
- **Rama:** compartida; **M1** agregó el Z al union de formas (`8f80481e`).
- **Pasos:** nave → modo secciones → mirar IPE, HEB, tubos.
- **Esperado:** cada familia con su contorno; **un W no se dibuja como tubo redondo** (ver **A-09**).
- **Categoría:** **QA obligatorio**

---

### H-06 · Modo secciones: perfiles compuestos

- **UI:** una sección armada se extruye **como armado**.
- **Archivo:** `section-profiles.ts`, `lib/engine/generators/built-up-section.ts`
- **Técnico:** el contorno se arma **desde la misma tabla de posiciones de la que salieron las
  propiedades**
- **Rama:** PR21 + **M2** (composición fuera del generador).
- **Precondiciones:** una sección compuesta asignada a un elemento.
- **Pasos:** crear un `L 100x100x10` espalda con espalda desde el modal, asignarlo y mirar.
- **Esperado:** se ven **las dos partes con su huelgo**, no un perfil simple.
- **Riesgos:** una sección compuesta creada en la pestaña de Secciones y una creada dentro de un
  generador tienen que dibujarse **igual**.
- **Categoría:** **QA obligatorio**

---

### H-07 · Modo secciones: el Z conformado

- **UI:** un perfil Z se dibuja.
- **Archivo:** `lib/three/section-profiles.ts`, `lib/utils/section-drawing.ts`
- **Rama:** **M1** (`8f80481e`) + **M2** (`04019c97`, `8ba26a80`). Nueva.
- **Precondiciones:** una sección Z agregada desde el panel de conformados.
- **Pasos:** 1) agregar un `Z 200x75x20x2.5`; 2) asignarlo; 3) modo secciones; 4) además, abrir el
  panel de tensiones de Basic con esa sección.
- **Esperado:** **el Z se dibuja** — antes no existía en la app; y en 2D **ya no se dibuja como
  rectángulo**.
- **Riesgos:** **las propiedades de un canal C paramétrico cambiaron**: el labio se mide desde la
  **cara exterior**, así que el área baja `2t²` (~1,8 %). Es la unificación de convención con
  `120f15cc` de H1, validada de forma independiente. Un modelo viejo con un C paramétrico **da
  números ligeramente distintos** y eso es esperado.
- **Categoría:** **QA obligatorio**

---

### H-08 · La chapa dibujada

- Ver **E-24**. Categoría: **QA obligatorio**.

---

### H-09 · Los bulones dibujados

- **UI:** un cilindro por agujero, al **diámetro del bulón**.
- Ver **E-24**. Categoría: **QA obligatorio**.

---

### H-10 · `exceeded` **sí** se dibuja

- **UI:** una unión que no cumple **aparece igual** en el visor.
- **Archivo:** `lib/three/joint-layout.ts`
- **Técnico:** **sólo la ausencia de geometría frena el dibujo, nunca el veredicto sobre ella**
- **Rama:** **M2**.
- **Precondiciones:** un nudo con geometría completa y capacidad insuficiente.
- **Pasos:** bajar la cantidad de bulones hasta `exceeded` y mirar el visor.
- **Esperado:** **se sigue dibujando.** Una unión que no cumple **existe**; ocultarla sería esconder
  el problema.
- **Riesgos:** **es la distinción que conviene mirar en QA.** Si desaparece al pasar a `exceeded`, la
  regla se invirtió.
- **Categoría:** **QA obligatorio**

---

### H-11 · Estados sin geometría: no se dibuja nada

- **UI:** ausencia.
- **Técnico:**
  | Estado | Se dibuja | Por qué |
  |---|---|---|
  | `notDesigned` | nada | no hay elección todavía |
  | `incomplete` | nada | falta un dato que el usuario puede aportar |
  | `GEOMETRY_UNAVAILABLE` | nada | no hay geometría que dibujar |
  | **`exceeded`** | **sí** | tiene geometría, y esconderla escondería lo que hay que mirar |
- **Rama:** **M2**.
- **Pasos:** recorrer los cuatro estados.
- **Esperado:** la tabla de arriba, exactamente.
- **Riesgos:** **un nudo renderizado en 3D parece terminado y no lo está.** Chapa, soldadura y
  presilla siguen sin geometría propia, y dibujar las barras que concurren a un nodo **no dice nada**
  sobre si la unión entre ellas fue verificada.
- **Categoría:** **QA obligatorio**

---

### H-12 · Las presillas no se dibujan

- **UI:** ausencia deliberada.
- **Archivo:** `joint-layout.ts` **sí** calcula `PlacedBatten[]`; `Viewport3D.svelte` **sólo dibuja
  chapa y bulones**
- **Rama:** **M2**.
- **Precondiciones:** un nudo con presillas en estado `available`.
- **Pasos:** diseñar presillas sin bulones ni chapa y mirar el visor.
- **Esperado:** **nada dibujado.** La presilla tiene **estación** y **no tiene chapa**, porque §E.6
  no da ninguna dimensión.
- **Riesgos:** el layout calcula estaciones que el visor no consume. `hasSceneContent()` devuelve
  `true` si hay presillas, así que en ese caso el efecto entra y **sale sin agregar mallas**: el
  contador de mallas queda en 0. No es un defecto de comportamiento —no hay nada que dibujar— pero
  conviene saberlo antes de leer el contador como síntoma.
- **Normativa:** §E.6 no dimensiona la chapa.
- **Categoría:** **Fuera del alcance actual**

---

### H-13 · Las soldaduras no se dibujan

- Ver **F-11**. Categoría: **Fuera del alcance actual**.

---

### H-14 · Rendimiento sobre la nave

- **UI:** fluidez al entrar al visor y al cambiar de nudo.
- **Archivo:** `web/src/lib/utils/e2e-hooks.ts` publica los tiempos
- **Rama:** **M2**.
- **Precondiciones:** nave cargada y calculada.
- **Pasos:** 1) entrar al visor; 2) cambiar de nudo varias veces; 3) cambiar la cantidad de bulones.
- **Esperado, medido en esta rama:** `load ≈ 1176–2066 ms · switch ≈ 93–121 ms · build ≈ 62–65 ms ·
  rebuild ≈ 18–19 ms`. La entrada al visor **incluye ahora el primer solve en frío**.
- **Riesgos:** los números **quedan registrados y no fijados con umbrales estrechos**: un umbral duro
  en una máquina compartida mide la máquina. Si el cambio de nudo se siente lento (≫ 200 ms), vale
  anotarlo.
- **Requiere:** nave calculada.
- **Categoría:** **QA recomendado**

---

### H-15 · El primer solve en frío

- **UI:** el primer **Calcular** de la sesión tarda un poco más.
- **Archivo:** `web/src/lib/engine/solver-pool.ts`
- **Técnico:** mientras haya workers que nunca ejecutaron, el primer trabajo de cada uno corre **de a
  uno y sobre un worker distinto**; después el despacho vuelve a ser simultáneo
- **Rama:** **M2** (`c7dc7e2e`). Nueva. **Mitigación, no reparación.**
- **Acceso:** nave → Calcular → Calcular otra vez.
- **Precondiciones:** nave.
- **Pasos:** 1) recargar; 2) cargar la nave; 3) Calcular y cronometrar; 4) Calcular otra vez.
- **Esperado:** primer solve ≈ **144–150 ms**, siguientes ≈ **44–46 ms**. Costo: **~88 ms una sola
  vez por sesión**; la mediana de sesión no se mueve.
- **Riesgos:** **el disparador medido era la primera ejecución de un worker recién instanciado
  coincidiendo con la de otro**: 180 solves dieron 7 caídas y **las siete en el primer solve**.
  Elimina la condición; **no arregla la caída**, que está por debajo de este archivo —ruta de
  ejecución de WASM o V8— y fuera del alcance autorizado.
- **Categoría:** **QA recomendado**

---

### H-16 · La caída del renderer (riesgo preexistente)

- **UI:** la pestaña muere al resolver un modelo grande.
- **Archivo:** proceso GPU de Chromium; mitigado en `solver-pool.ts` y nombrado en
  `web/e2e/fixtures.ts`
- **Rama:** **preexistente**, no activado por M2. Medido: **10 % en M2 contra 12 % en la rama base**;
  con Metal **sube** a 16 %; en **Google Chrome real, 17,5 %**.
- **Acceso:** nave → Calcular, varias veces en sesiones nuevas.
- **Precondiciones:** nave.
- **Pasos:** cargar la nave y resolver en varias sesiones limpias.
- **Esperado:** **no debería caerse.** Si se cae, anotar cuántas veces sobre cuántas.
- **Riesgos:** **un usuario resolviendo un modelo grande puede perder la pestaña.** El aborto ocurre
  dentro del proceso GPU, no en JavaScript de la app; el único parámetro WebGL propio del viewport es
  `preserveDrawingBuffer: true`, que la exportación PNG necesita, y apagarlo **no distinguió nada**
  con las muestras disponibles, así que no se tocó. Se corrigió además que
  `renderer.dispose()` dejaba **vivo el contexto WebGL**: ahora se libera, como ya hacía
  `RebarViewport3D`. Eso es un defecto latente real, **no la causa**.
- **Categoría:** **Limitación conocida** + **QA recomendado** (medir la tasa)

---

# I · Persistencia y exportaciones

Precondición común: panel PRO → pestaña **Proyecto** (o el botón *Proyecto* de la cinta).

> Cuatro rutas de persistencia comparten `snapshot()` / `restore()`: el `.ded`, el undo, la captura
> de pestaña y el autosave. **El link compartido no**, y ése es el agujero. Y hay una quinta cosa
> que no viaja por ninguna: los diseños de unión.

---

### I-01 · Guardar y abrir un `.ded`

- **UI:** **Guardar Pestaña** · **Guardar Sesión** · **Abrir** (`pp-save`, `pp-save-session`,
  `pp-open`).
- **Archivo:** `web/src/components/pro/ProProjectFileActions.svelte`,
  `web/src/lib/store/model.svelte.ts` (`snapshot()` / `restore()`)
- **Técnico:** `snapshot()` desestructura la sección **entera** y `restore()` la copia — por eso los
  campos nuevos persisten sin tocar el par
- **Rama:** compartida; **M1** agregó el campo `built` (`ae3a6186`) sin tocar `snapshot`/`restore`.
- **Acceso:** Proyecto → Archivo.
- **Precondiciones:** un modelo con las tres formas de sección y con materiales del catálogo.
- **Pasos:** 1) armar un modelo con (a) un `IPE 200` de catálogo, (b) un `L 100x100x10` espalda con
  espalda huelgo 8 rotación 90°, (c) un `hollow-rect` construido, (d) un `C 100x50x15x2`, y con un
  material de preset y uno a medida; 2) **Guardar Pestaña**; 3) recargar; 4) **Abrir**.
- **Esperado:** todo vuelve **con su procedencia**: `profileFamily`, `composition`, `built`, `tl`,
  `rotation`, `gradeId`, `standard`, `region`, `fu`.
- **Estados alternativos:** el autosave del navegador puede quedarse corto en un modelo grande y lo
  **dice** (`file.autosaveTooLarge`).
- **Riesgos:** —
- **Categoría:** **QA obligatorio**

---

### I-02 · Proyectos antiguos

- **UI:** un `.ded` viejo abre y funciona.
- **Archivo:** `model.svelte.ts`
- **Técnico:** `built`, `composition`, `gradeId` son **opcionales**; su ausencia es un estado
  legítimo
- **Rama:** **M1** (contrato aditivo).
- **Acceso:** Proyecto → Abrir, con un archivo anterior a estas ramas.
- **Precondiciones:** un `.ded` viejo.
- **Pasos:** 1) abrir uno viejo; 2) mirar la tabla de secciones; 3) mirar la columna **Grado** del
  inventario metálico.
- **Esperado:** abre; las secciones sin `built` no dicen de dónde salieron **y lo declaran**; los
  materiales sin `gradeId` muestran **«sin declarar»** y el aviso de que **la familia se dedujo de
  la magnitud de `fy`**.
- **Riesgos:** que un proyecto viejo **aparente** tener procedencia. La raya es el estado correcto.
- **Categoría:** **QA obligatorio**

---

### I-03 · La composición sobrevive

- Cubierto por **I-01**, y vale mirarlo aparte porque es el campo que PR21 agregó y el que M2 hizo
  alcanzable fuera de un generador.
- **Pasos:** guardar, abrir, y confirmar en el **visor con secciones** que sigue siendo un armado.
- **Categoría:** **QA obligatorio**

---

### I-04 · Los materiales sobreviven con su grado

- Cubierto por **I-01** y **B-11**.
- **Pasos:** guardar, abrir, y confirmar que la etapa de grado del workflow sigue mostrando
  designación y norma.
- **Categoría:** **QA obligatorio**

---

### I-05 · Los reglamentos sobreviven

- **UI:** el reglamento metálico declarado sigue declarado al reabrir.
- **Archivo:** `modelStore.model.regulations`, `regulations-persistence.test.ts`
- **Técnico:** **no** están en `file.ts`: van por `snapshot()`/`restore()`, que es lo que comparten
  las cuatro rutas
- **Rama:** anterior a M1; confirmado por el estudio de factibilidad.
- **Pasos:** declarar CIRSOC 301, guardar, recargar, abrir.
- **Esperado:** sigue declarado. El defecto que ese test cerró era que **un proyecto abierto de disco
  volvía silenciosamente a los reglamentos por defecto**.
- **Categoría:** **QA recomendado**

---

### I-06 · Los diseños de unión **sí** se guardan ✅ CERRADO

> **Reescrita el 2026-08-27.** La versión anterior decía que **no** se guardaban y lo clasificaba
> como fuera de alcance. `d12ad5cb` lo cerró. Un revisor que pruebe la entrada vieja va a esperar
> `notDesigned` después de reabrir y va a reportar como defecto el comportamiento correcto.

- **UI:** los bulones, la chapa, la soldadura y las presillas elegidas para cada nudo.
- **Archivo:** `web/src/lib/store/joint-design.svelte.ts` + `StructureModel.jointDesigns`
- **Técnico:** el campo vive **en el modelo** y el store es una **vista** sobre él — la misma forma
  que `regulations.svelte.ts`. Por eso viaja `.ded`, undo/redo, captura de pestaña y autosave
  **gratis**: las cuatro rutas pasan por `snapshot()`/`restore()`.
- **Rama:** **M2**. **Nueva.**
- **Acceso:** Uniones → diseñar un nudo → Proyecto → Guardar → recargar → Abrir.
- **Precondiciones:** nave calculada, un nudo diseñado.
- **Pasos:** 1) diseñar un nudo completo; 2) guardar el `.ded`; 3) recargar la página; 4) abrirlo;
  5) volver a Uniones y seleccionar el mismo nudo; 6) **deshacer** con Ctrl+Z después de diseñar;
  7) abrir el `.ded` en un editor y buscar `capacityKN`, `holesM`, `utilisation`, `checks`.
- **Esperado:** (5) el nudo vuelve **con sus elecciones**; (6) el undo deshace el diseño; (7) **los
  cuatro campos no están** — sólo se guardan las elecciones, y demandas, capacidades, contorno de
  chapa y estaciones de presilla se **recalculan al leer**.
- **Estados alternativos:** un proyecto **anterior** no tiene el campo, y su ausencia se lee como
  «no se diseñó ninguna unión», que es la respuesta verdadera. Y ausente **se queda ausente** en
  `snapshot()`, porque `restore(snapshot())` tiene que ser un no-op — Cancel sobre un borrador CAD
  está implementado así.
- **Riesgos:** la regla que sostiene todo esto es que **una unión guardada no puede reportar una
  verificación contra un miembro que ya no está**. Vale mirar que después de reabrir el nudo muestre
  su verificación **recalculada** y no un número congelado.
- **Requiere:** —
- **Normativa:** —
- **Categoría:** **QA obligatorio**
- **Prioridad:** **crítica** — es persistencia de trabajo del usuario, y su modo de falla silencioso
  es mostrar un veredicto viejo

---

### I-07 · Un id de nudo no es una identidad ✅ CERRADO

> **Reescrita el 2026-08-27.** La versión anterior describía el arrastre entre modelos como hallazgo
> a verificar. `d12ad5cb` lo cerró, y lo cerró **conservando** el trabajo en vez de borrarlo — así
> que lo que hay que probar ahora es distinto y hay más superficie (ver **E-25**).

- **UI:** ninguna unión aparece como elegida en un modelo donde no se eligió; y las que quedaron
  colgadas se **dicen** en el panel, con su motivo.
- **Archivo:** `joint-design.svelte.ts`, `lib/connection/joint-choices.ts`
  (`reconcileJointDesigns`)
- **Técnico:** cada unión guarda contra qué se diseñó — `atMm` (dónde estaba el nudo, al milímetro)
  y `memberCount` (cuántas barras lo tocaban) — y se **reconcilia en cada lectura**, no una vez al
  cargar: borrar un nudo a mitad de sesión deja su unión obsoleta **en el acto**.
- **Rama:** **M2**. **Nueva.**
- **Acceso:** Uniones.
- **Precondiciones:** dos modelos distintos en la misma sesión.
- **Pasos:** 1) cargar la nave, diseñar **N5** con bulones y chapa; 2) **sin recargar**, cargar otro
  ejemplo; 3) Uniones → seleccionar **N5** del modelo nuevo; 4) volver a la nave, **borrar** un nudo
  diseñado; 5) **mover** un nudo diseñado; 6) agregarle **una barra más** a un nudo diseñado.
- **Esperado:** (3) **`notDesigned`** — reemplazar el proyecto **es** el reset, porque `restore()` y
  `clear()` reemplazan el campo; (4) razón **`nodeMissing`**; (5) razón **`nodeMoved`**;
  (6) razón **`topologyChanged`**.
- **Estados alternativos:** una unión obsoleta **no se borra** (sería tirar trabajo por un nudo
  movido) y **no se aplica** (sería la asociación silenciosa). Se conserva, no se itera —un documento
  no la tabula— y se declara en pantalla.
- **Riesgos:** el **orden** de las tres razones importa y está afirmado: un nudo ausente tampoco
  tiene barras, así que chequear el conteo primero reportaría cada nudo borrado como cambio de
  topología y mandaría al usuario a buscar una barra que nunca sacó. Vale confirmar en pantalla que
  un nudo borrado dice `nodeMissing` y no `topologyChanged`.
- **Requiere:** —
- **Normativa:** —
- **Categoría:** **QA obligatorio**
- **Prioridad:** **crítica** — es la forma de defecto que esta rama persiguió tres veces: un valor
  plausible ocupando el lugar de un dato ausente

---

### I-08 · El link: las uniones **sí** viajan; los cuatro campos de sección **no**

> **Reescrita el 2026-08-27.** La entrada tenía **una** mitad y ahora tiene dos, con estados
> opuestos. `9c9f9506` cerró la mitad de uniones; la de secciones sigue abierta y **no es de acero**
> — es de hormigón y de acero por igual.

- **UI:** botón **Copiar link** de la pestaña Proyecto — y también el link que **cada reporte de
  feedback adjunta automáticamente**, y los ejercicios de Education.
- **Archivo:** `web/src/lib/utils/url-sharing.ts` (`SHARE_VERSION = 5`),
  `lib/connection/joint-share.ts`
- **Rama:** mitad de uniones: **M2, nueva**. Mitad de secciones: **preexistente**, detectada por M1.
- **Acceso:** Proyecto → Compartir → Copiar link.
- **Precondiciones:** un modelo con un armado, con un C/Z paramétrico **y con un nudo diseñado**.

**Mitad cerrada — las uniones viajan.**
- **Pasos:** 1) diseñar un nudo; 2) copiar el link; 3) abrirlo en una pestaña nueva; 4) Uniones →
  seleccionar el nudo; 5) mover el nudo **antes** de copiar el link y repetir.
- **Esperado:** (4) el nudo vuelve **con sus elecciones**, por la clave `jd`; (5) vuelve como
  **obsoleto con su razón** — la huella `atMm`/`memberCount` de **I-07** viaja con el link, así que
  la reconciliación funciona igual del otro lado. Nada calculado viaja.
- **Estados alternativos:** un lector que **precede** a `jd` lo ignora; `sv >= 3` y `sv >= 4` siguen
  satisfechos por 5, así que los links viejos siguen abriendo.

**Mitad abierta — la procedencia de la sección se degrada.**
- **Pasos:** 1) armar el modelo de **I-01**; 2) copiar el link; 3) abrirlo en una pestaña nueva;
  4) mirar las secciones.
- **Esperado (hoy):** **el análisis está bien** —el solver tiene área e inercias— y lo que se pierde
  es `composition`, `profileFamily`, `tl` y `built`. Un armado vuelve **sin su composición**, y un
  C/Z vuelve **sin el espesor de labio** (con lo cual `case 'C'` sustituye el espesor **del ala**).
- **Riesgos:** el peor caso sigue siendo el **widget de feedback**: si un usuario reporta un problema
  con una sección armada, el link que llega al issue reconstruye el modelo **sin el campo del que
  habla el reporte**. Y hay un borde nuevo anotado en `share-codec-fields.md` §7: acoplar la versión
  del contenedor de URL a la del modelo.
- **Requiere:** —
- **Normativa:** —
- **Categoría:** mitad de uniones **QA obligatorio**; mitad de secciones **limitación conocida que
  no bloquea** — no es de estas ramas
- **Prioridad:** uniones **alta**; secciones **media**

---

### I-09 · Exportaciones

- **UI:** Proyecto → **Exportar**: Excel, CSV, PNG; cinta **Análisis** → *Salida* → **Reporte**.
- **Archivo:** `ProProjectTab.svelte`, `ProReportDialog.svelte`, `lib/export/*`
- **Técnico:** `rc-cad-handoff*` es **hormigón**; `steelCountsAsVerified()` sigue devolviendo el
  literal `false`
- **Rama:** ninguna — **M1 y M2 no agregaron exportación metálica**.
- **Acceso:** Proyecto → Exportar; cinta → Reporte.
- **Precondiciones:** nave calculada.
- **Pasos:** 1) exportar Excel y CSV; 2) generar un Reporte; 3) buscar contenido metálico en los
  tres.
- **Esperado:** salen los datos de modelo y de resultados como siempre. **No hay verificación
  metálica, ni estado de nudo, ni mapa de cláusulas en ninguna exportación**, y **ninguna debe
  presentar un miembro metálico como verificado**.
- **Estados alternativos:** CSV pide modelo resuelto y lo dice (`ribbon.needsSolve`).
- **Riesgos:** la etapa **Documentación** del workflow describe lo que un documento **llevará** —
  futuro. Que no se lea como que ya existe es el QA de este ítem.
- **Categoría:** **Fuera del alcance actual** + **QA recomendado**

---

### I-10 · Trazabilidad: la procedencia está en la sección, no en un registro

- **UI:** la ficha de la sección y las etapas 2 y 3 del workflow.
- **Técnico:** `profileFamily` (catálogo) · `composition` (armado) · `built` (paramétrica) ·
  `gradeId` (material)
- **Rama:** **M1** (contratos) + **M2** (superficies).
- **Acceso:** ficha, workflow.
- **Precondiciones:** —
- **Pasos:** para cada sección del modelo, preguntarse «¿de dónde salió?» y buscar la respuesta.
- **Esperado:** las tres formas de crear una sección tienen respuesta: una de catálogo lleva
  `profileFamily`, un armado lleva `composition`, una paramétrica lleva `built` con la plantilla y
  los parámetros.
- **Riesgos:** era el hueco más valioso de M1: una sección construida **no se podía volver a editar**
  porque nada guardaba lo que se tipeó, y era **la única de las tres formas sin respuesta a “de dónde
  salió”**.
- **Categoría:** **QA recomendado**

---

### I-11 · No hay registros retroactivos

- **UI:** ausencia deliberada.
- **Técnico:** el modelo **no guarda un historial de por qué ruta entró cada sección**; guarda **qué
  es** cada sección
- **Rama:** —
- **Acceso:** —
- **Pasos:** abrir un proyecto anterior a estas ramas y buscar procedencia donde no se registró.
- **Esperado:** **no aparece nada inventado.** Un proyecto guardado **no dice** por qué ruta entró
  cada sección, y **no se le rellena** el campo con el nombre ni con un `composition` falso.
- **Riesgos:** que alguien espere que las ramas «arreglen hacia atrás» proyectos viejos. No lo hacen
  y no deberían.
- **Categoría:** **Limitación conocida**

---

# J · Recuento

**Criterio de conteo:** una «función» es una entrada numerada de arriba. Donde una entrada agrupa
varias reglas —las cinco cláusulas de bulones, los cuatro filtros del catálogo— se cuenta como una,
y las reglas están enumeradas adentro.

## J.1 · Tabla final

| Métrica | Cantidad |
|---|---|
| **Funciones totales inventariadas** | **146** |
| Funciones **nuevas** (no existían antes de estas dos ramas) | **91** |
| Funciones **modificadas** (existían y estas ramas las retocaron) | **42** |
| Funciones **preexistentes sin cambios**, incluidas por contexto de QA | **13** |
| Funciones de **M1** (#156) | **11** |
| Funciones de **M2** (#164) | **91** |
| Funciones **compartidas** — tocadas por las dos ramas, o sobre superficie que ya estaba en `main` o pertenece a hormigón/Basic | **44** |
| Funciones con **limitación o atribución normativa explícita** | **40** |
| Funciones **todavía no accesibles desde la UI** | **6** |

**Cómo se atribuyó cada rama, y por qué el número de M1 es más chico de lo que parece.** No se
dedujo de los handoffs: se midió con `git show <ref>:<archivo>` contra `origin/main`,
`feat/pro-steel-m1` y `feat/pro-steel-m2`. La superficie de **Uniones metálicas**
(`ProConnectionsTab.svelte`) **ya está entera en `main`** salvo lo que M2 agregó — el banner, la
lista de nudos, el split por material, el aviso `FvExcl` y las cinco limitaciones son trabajo
metálico **anterior a estas dos ramas**, y por eso figuran como preexistentes y no como M1. Lo
mismo con el buscador del catálogo de perfiles y con la lista de problemas del generador. Lo que
**sí** es de M1 y no está en `main`: `GradePickerPanel.svelte` entero, los filtros de organismo,
código de diseño y altura, la comparación de tres, las «2 normas» del grupo L, la procedencia por
campo del catálogo, el arriostramiento de la nave, el emparejamiento perfil/grado, la edición del
adaptador y el contrato `built`.

Las trece preexistentes sin cambios, por id, para que el número sea auditable: **B-13, C-10, C-12,
C-14, E-01, E-06, E-22, E-23, H-16, I-05, I-08, I-09, I-11**.

## J.2 · Por categoría

| Categoría | Cantidad |
|---|---|
| **QA obligatorio antes del merge** | **103** |
| **QA recomendado** | **20** |
| **Sólo verificación automática** | **6** |
| **Limitación conocida** | **12** |
| **Fuera del alcance actual** | **5** |
| **Total** | **147** |

Diez entradas llevan **dos** categorías (p. ej. *limitación conocida* + *QA obligatorio, que
lo diga*); en esta tabla cuenta la primera, que es la que manda para el merge.

> **Recuento corregido el 2026-08-27.** +1 función (**E-25**, superficie nueva) y **I-06** salió de
> *fuera del alcance* a *QA obligatorio*, porque dejó de ser una capacidad ausente y pasó a ser una
> capacidad que hay que probar. Las revisiones de esta fecha están listadas en §0.5.

## J.3 · Por recorrido

| Recorrido | Funciones | De las cuales QA obligatorio |
|---|---|---|
| **A · Selector de secciones** | 25 | 18 |
| **B · Selector de materiales** | 17 | 11 |
| **C · Generadores** | 15 | 9 |
| **D · Workflow metálico** | 15 | 11 |
| **E · Uniones abulonadas** | 25 | 22 |
| **F · Soldaduras** | 11 | 7 |
| **G · Presillas y compuestos** | 12 | 9 |
| **H · Nudos y visor 3D** | 16 | 11 |
| **I · Persistencia y exportaciones** | 11 | 6 |
| **Total** | **147** | **103** |

## J.4 · Las seis que existen en código y no tienen superficie

| # | Qué | Dónde vive | Por qué no se ve |
|---|---|---|---|
| 1 | **`notVerifiable` del grupo de bulones** | `bolted-joint.ts` — A307 con rosca excluida, Tabla J.3.2 sin fila | **el panel de diseño no ofrece control de roscas**; el único estado `notVerifiable` alcanzable desde la UI es el de soldadura (**F-08**) |
| 2 | **Aviso de ejes no principales** en las cuatro superficies compartidas | `lib/section/axes.ts`; regla pura que alcanza a **37 ángulos** además del Z | `SectionEditor`, `ProfileSelector`, `ProSectionsTab` y `SectionStressPanel` son de hormigón o de Basic; contrato y patch escritos en `m2-axes-notice-contract.md`, **sin aplicar** |
| 3 | **Torsión del nudo** | se calcula | **no se dibuja** — es la limitación 3 de **E-23**, la única de las cinco que declara *no afecta el resultado*, y esa asimetría es su contenido |
| 4 | **Estaciones de presilla en 3D** | `joint-layout.ts` produce `PlacedBatten[]` | `Viewport3D` sólo dibuja chapa y bulones; sin chapa de presilla, **no hay qué dibujar** (**H-12**) |
| 5 | **Persistencia de los diseños de unión** | `jointDesignStore` en memoria | **no está en `snapshot()`, ni en `restore()`, ni en el codec de URL** (**I-06**) |
| 6 | **`SectionShapeBuilder.svelte`** | componente completo, con claves i18n en **diez** idiomas | **ningún componente lo importa**. La capacidad no se perdió —el modal la tiene— pero es un componente entero sin montar, y su decisión de producto sigue pendiente (`m1-section-shape-builder.md`) |

Verificado al escribir esto: `grep -rn "SectionShapeBuilder" --include='*.svelte' src/` no devuelve
ningún import.

---

# K · Merge

## K.1 · Estado medido de las dos ramas

> **Re-medido el 2026-08-27, y cambió lo suficiente para importar.** Las dos cabezas se movieron, el
> retraso contra `main` pasó de 6 a **9** commits, y los tres nuevos son **del solver**. La tabla
> vieja queda reemplazada, no anotada: un estado de merge desactualizado es peor que ninguno.

| | M1 (#156) | M2 (#164) |
|---|---|---|
| Cabeza | `b5d0cf49` | `14c10a2e` |
| Base del PR | **`main`** | `feat/pro-steel-m1` |
| Sincronía con `origin` | **0 / 0** | **0 / 0** |
| `git merge-tree` contra `main` | **limpio**, 0 conflictos | idem, a través de M1 |
| Detrás de `main` | **9 commits** | idem |
| `mergeStateStatus` | **BLOCKED** (ruleset, no CI) | **UNSTABLE** (CI en rojo) |
| `mergeable` | MERGEABLE | MERGEABLE |
| Estado del PR | OPEN, **draft** | OPEN, **draft** |
| CI sobre la cabeza | **todo verde** | `lint` · `test` · `suite (1)` · `suite (2)` **verde**; **`e2e` rojo**; `web` corriendo |

**Los nueve commits de `main` que faltan, y por qué esta vez no son cosmética.** Cinco son los de
antes (favicon, README, gate de assets, la tangente factorizada). Los **cuatro nuevos son del
motor**:

| Commit | Qué |
|---|---|
| `c6b7af71` | AMD reescrito como grafo cociente con grados aproximados |
| `672b17b2` | patrón simbólico de Cholesky por árbol de eliminación |
| `7d856b1f` | Cholesky numérico supernodal sobre paneles densos |
| `9a2f26d2` | rechazo de pivotes `NaN`, y test de contrato de tensión de placa térmica |
| `8af9b9d6` | el control por desplazamiento deja de reportar un éxito que no ganó |
| `0844f01d` | **CI: sube artefactos de Playwright y declara `retries` sobre el test de canvas flaky** |

Dos consecuencias concretas:

1. **Reescribir el ordenamiento y la factorización cambia los números que salen del solver** —dentro
   de la tolerancia, es de esperar, pero **es de esperar, no está medido para estas ramas**. Todo lo
   que en este inventario compara una solicitación contra un valor conviene re-mirarlo **después** de
   traer `main`, no antes. Es la razón más fuerte para que el merge de `main` vaya **antes** del
   recorrido de QA y no después.
2. **`0844f01d` es la contención del flake** que el addendum de `m1-m2-b01-i06-i07.md` describe.
   Traer `main` es lo que la pone en estas ramas. Hasta entonces ese test puede enrojecer el job
   `e2e` de cualquiera de los dos PR **sin que sea un defecto de estas ramas**.

### K.1.1 · El rojo de `e2e` en M2, ubicado

El job `e2e` de la cabeza `14c10a2e` falló **en 28 segundos**, y la suite tarda veintidós minutos: no
llegó a correr un test. El paso que falló es **`Build WASM engine`** — el instalador de `wasm-pack`,
que es exactamente lo que el PR **#137** («pin and cache wasm-pack instead of curl-piping the
installer») existe para arreglar.

**Es la tercera causa distinta de rojo en `e2e` que estas ramas vieron**, y conviene no confundirlas:

| Causa | Naturaleza | Dónde se arregla |
|---|---|---|
| El flake del walkthrough de sección | intermitente, acotado y **no** diagnosticado | `main`, por `0844f01d` (`retries`) |
| El `aria-pressed` de `basic-selection-permutations` | defecto real, **de origen** | ya arreglado, en M1 |
| **`Build WASM engine`** ← ésta | infraestructura de CI, no código | `main`, por **#137** |

**Ninguna de las tres es del trabajo de M1 ni de M2.** Pero la tercera significa que **el `e2e` de M2
no está probado verde sobre su cabeza actual**, y eso es un hecho que hay que decir antes de aceptar
la rama, no después. La corrida anterior completa (`13086a93`) fue verde entera.

## K.2 · Recomendación de merge de M1 (#156)

**Mergeable, con una condición de proceso y ninguna de código.**

M1 aporta **11** de las 146 funciones de este inventario, y eso subestima su peso: buena parte de
su trabajo son **contratos y datos** —`GradeSource`, `ProfileSource`, el campo `built`, la
geometría C/Z, el camino de carga longitudinal de la nave— que M2 después usa. Lo que se cuenta
acá es superficie que el usuario toca, no líneas.

- los tres hallazgos abiertos de M1 se cerraron: `.conn-ratio-badge` era CSS muerto **desde
  `b71432cd`, un commit de M1**, y se borró en `6448e89d`; la ceguera de `svelte-check` resultó ser
  el compilador y no el checker, y quedó documentada;
- `mergeStateStatus: BLOCKED` **no es CI**: el ruleset de la organización sobre la rama por defecto
  no declara **ningún** status check requerido. Lo único que bloquea es **la aprobación que falta**;
- **condición (actualizada el 2026-08-27)**: la cabeza volvió a moverse a **`b5d0cf49`**, y el CI de
  esa cabeza está **verde entero**. Ya no hay que mirar un sha viejo: **`b5d0cf49` es el evaluado**;
- **condición 2 (reforzada)**: traer los **9** commits de `main` — `merge-tree` da limpio, 0
  conflictos — y volver a correr los gates locales. Ya no es por una optimización: son **cuatro
  commits que reescriben el ordenamiento y la factorización del solver**. Ver K.1.

**Salir de draft, pedir la aprobación, y mergear.**

## K.3 · Recomendación de merge de M2 (#164)

**No mergear todavía.** Actualizado el 2026-08-27: ahora son **cuatro** cosas, y una **sí** es un job
rojo — aunque no sea un test rojo:

1. **el recorrido de QA de este documento**, o al menos sus 103 obligatorios. M2 aporta **92** de las
   147 funciones y **casi todo lo que un usuario toca**;
2. **una decisión de producto abierta** — A-01. Eran dos; B-01 se cerró (§0.5);
3. **reapuntar la base**: hoy es `feat/pro-steel-m1`. Cuando M1 entre a `main`, la base de #164 pasa
   a ser `main` y el diff no crece, igual que pasó con `feat/pro-steel-family`;
4. **`mergeStateStatus: UNSTABLE`** — el job `e2e` de la cabeza actual está rojo. Ubicado en
   **K.1.1**: es el instalador de `wasm-pack`, no código de M2. **No es un bloqueante de producto,
   pero sí un bloqueante de proceso**: nadie debería aceptar una rama cuyo `e2e` no corrió. Se
   resuelve trayendo `main` (que además trae la contención del flake) o relanzando el job.

## K.4 · Orden

**M1 primero, M2 después. No hay alternativa razonable**, y no es preferencia:

1. **M2 está apilada sobre M1** — 57 commits por delante, base `feat/pro-steel-m1`. Mergear M2 antes
   arrastraría M1 entera sin que M1 se haya revisado;
2. **el CSS que M1 le devuelve a main** ya se limpió **en M1**, precisamente para que el orden
   funcione;
3. **el 4004 sirve las dos juntas**, así que el QA de este documento **valida el resultado del orden
   propuesto**, no cada rama por separado.

Secuencia concreta:

```
1. traer main a M1 (merge --no-ff), correr gates locales
2. mirar el CI de la cabeza de M1
3. salir de draft → aprobación → merge de M1 a main
4. reapuntar #164 a main; traer main a M2
5. QA manual de este documento sobre el 4004
6. resolver las dos decisiones abiertas (K.5)
7. salir de draft → aprobación → merge de M2
```

## K.5 · Bloqueantes reales

Separados de lo que **parece** bloqueante y no lo es.

### Bloqueantes de verdad

> **Reescrita el 2026-08-27.** Dos de los cinco bloqueantes se cerraron y uno cambió de naturaleza.

| # | Qué | Por qué bloquea |
|---|---|---|
| **1** | **Los 103 ítems de QA obligatorio** de este documento, y en particular los ocho de máxima prioridad: **D-09** (la verificación nunca `hecho`), **E-21** (el cálculo auxiliar sin veredicto), **C-05** (Pratt/Howe), **A-18** (el centroide), **E-07** (las solicitaciones que fueron cero en todos los modelos), **E-25** (el aviso de uniones obsoletas), **I-06** (las uniones que ahora se guardan) e **I-07** (la reconciliación) | los cinco primeros son casos en que la app **afirmaba algo falso** y ningún test los detectó; los tres últimos son **capacidad nueva sin recorrer a mano** |
| **2** | ~~**B-01** — la lista inline de materiales~~ | **CERRADO** por `9ed71247`. Queda como **QA obligatorio** porque retira una ruta que existía, no como bloqueante de decisión |
| **3** | **A-01 — el *builder* inline se retiró y la propuesta escrita decía no tocarlo** | **sigue abierto**, y ahora es la **única** decisión de producto pendiente. Es la divergencia de mayor alcance de M2; revertirla después del merge cuesta mucho más. Las cuatro alternativas, en lenguaje de producto, en `a-01-decision.md` |
| **4** | ~~**I-06 / I-07** — las uniones no se guardan y el store no se limpia~~ | **CERRADOS** por `d12ad5cb`. Pasan de bloqueante-de-alcance a **QA obligatorio de prioridad crítica**: hay que recorrer en pantalla la persistencia, las tres razones de obsolescencia y los dos remedios |
| **5** | **La aprobación de #156** | el ruleset la exige y no exige ningún status check |
| **6** | **Traer `main` ANTES del recorrido de QA** | los cuatro commits de solver de K.1 reescriben ordenamiento y factorización. Recorrer 103 ítems contra números que van a cambiar es recorrerlos dos veces |
| **7** | **El `e2e` de M2 sobre su cabeza actual** | rojo por el instalador de `wasm-pack` (K.1.1). No es de M2, pero nadie debería aceptar una rama cuyo `e2e` no corrió |

### Lo que **no** bloquea, con la evidencia de por qué

| Qué | Por qué no |
|---|---|
| **Los 5 fallos E2E locales** | los cinco **reproducen idénticos en un checkout limpio de `origin/main`**; los textos de tres de ellos son iguales carácter por carácter. Ninguna rama toca `basic-demos` ni `basic-selection-permutations` |
| **La baseline visual de 1 px** (`rc-design-visual`) | `696 → 697`, ratio 0,03; la baseline `darwin` es del **2026-07-25**, ninguna rama tocó `e2e/__screenshots__`, y su `describe` se llama literalmente `@slow visual baselines (non-blocking)`. **No se actualizó ningún snapshot** |
| **`basic-demos:160` en *flaky*** | **determinista y dependiente de la sesión**, no un flake de baja tasa: corrido solo casi nunca falla, corrido tras sus hermanos falla el primer intento **siempre** y se recupera en contexto nuevo. `main` está **marginalmente peor** (llegó a consumir los dos reintentos) |
| **`viewport-perf @perf`** | **no es un umbral**: falla en `keyboard.up`, un `ArrowLeft` mantenido que no se suelta en 60 s. Mismo modo de falla en main, y `@perf` **no corre nunca en CI** |
| **El rojo que M1 mostró sobre `9883e2bd`** | dos corridas sobre el **mismo sha** con **un segundo** de diferencia, una verde y una roja, por un `base_ref_changed` legítimo sin bloque `concurrency`. Relanzada, verde. **Cuarta demostración del mismo sha con dos colores** |
| **La caída del renderer** | **preexistente**: 10 % en M2 contra **12 %** en la rama base, y **17,5 % en Google Chrome real**. Fuera del alcance autorizado; mitigada, no reparada |

### Deuda que **no** es de estas ramas y conviene abrir aparte

Cuatro cosas que cambian **qué significa un verde** en este repositorio, y que ninguna rama de acero
es el lugar para arreglar:

1. **falta `concurrency` en `ci.yml`** — el parche está escrito en
   `m1-m2-ci-audit-and-three-decisions.md` §30, con el matiz de que `cancel-in-progress: true`
   cambia un rojo por un cancelado si el grupo se elige mal;
2. **no existe job de `typecheck` ni de `svelte-check`** — los dos gates que este trabajo usó
   localmente **no existen del lado remoto**. Costeado: **14,4 s** como un paso más del job `web`, y
   las rutas metálicas están hoy en **cero errores**, así que entran gratis;
3. **el `@slow` y las baselines visuales nunca corrieron en ningún PR** — falta la etiqueta
   `run-e2e`. **El modelo de 408 barras no se ejercitó en CI en ninguna rama**;
4. **`css_unused_selector` no cubre 30 de los 169 componentes con estilos, 24 de ellos bajo `pro/`**
   — `css-prune` deja de podar en cuanto un componente tiene un `class` que el compilador no puede
   leer estáticamente. Mientras eso siga así, **el CSS muerto en esas superficies sólo lo encuentra
   un censo a mano**;
5. **el instalador de `wasm-pack` se baja por `curl` en cada corrida** — agregado el 2026-08-27,
   porque dejó de ser hipotético: es lo que puso en rojo el `e2e` de la cabeza de M2 (K.1.1), en 28
   segundos y sin correr un test. El arreglo ya está escrito y abierto: **PR #137**, «pin and cache
   wasm-pack instead of curl-piping the installer». **Es de `main`, no de estas ramas**, y mientras
   no entre cualquier PR del repositorio puede enrojecer por esto.

## K.6 · Recomendación explícita sobre `/clear`

**Sí, hacé `/clear` — pero después de leer este documento y antes de empezar el QA.**

El razonamiento, sin vueltas:

- **este documento reemplaza el contexto de la conversación.** Todo lo que hacía falta recordar —
  rutas, precondiciones, pasos, riesgos, atribución por rama, categorías y el estado de merge —
  está acá y en los tres handoffs que continúa. No hay nada en la ventana de contexto que no esté
  escrito;
- **el QA es tuyo, no mío.** Los 103 obligatorios se hacen en el navegador. Nada de eso necesita que
  yo tenga cargada la historia de cómo se llegó hasta acá;
- **lo que sigue después del QA es otro trabajo** — cerrar B-01, decidir sobre A-01, verificar I-06 e
  I-07, traer main a M1 — y arranca mejor con la cabeza limpia y este documento como entrada, que
  arrastrando una conversación de auditoría de la que ya se destiló todo.

**Lo único que conviene no perder** al hacer `/clear`, y por eso queda escrito acá:

1. el 4004 sirve **M1 + M2 juntas**, desde `stabileo-steel/web`, rama `feat/pro-steel-m2`, pid 15965;
2. **M1 primero, M2 después**, y el CI que hay que mirar de M1 es el de **`3abf86c4`**, no el de
   `9883e2bd`;
3. las cinco funciones de máxima prioridad del QA: **D-09, E-21, C-05, A-18, E-07**;
4. los dos hallazgos nuevos de este inventario, que ningún handoff anterior tiene: **B-01** (la lista
   inline de materiales) e **I-06 / I-07** (las uniones no persisten y el store no se limpia).

---

## Anexo · Qué cubre la automatización, para no re-testear a mano

Si algo de esta lista falla en la app, **es un bug del test además de un bug de la app**.

| Superficie | Spec | Tests |
|---|---|---|
| Modal de secciones | `m2-section-modal.spec.ts` | 19 |
| Modal de materiales | `m2-material-modal.spec.ts` | 12 |
| Generadores (dock, inputs, perfil, material) | `m2-generators-ui.spec.ts` | 18 |
| Patrones de alma | `m2-truss-web-patterns.spec.ts` | 6 |
| Workflow metálico | `m2-steel-workflow.spec.ts` | 34 |
| Diseño de unión abulonada | `m2-joint-design.spec.ts` | 17 |
| Soldaduras y presillas | `m2-weld-battens.spec.ts` | 24 |
| Unión en 3D | `m2-joint-3d.spec.ts` | 10 |
| Nudos en 3D | `m2-3d-joints.spec.ts` | 7 |
| Nudos de la nave | `m2-shed-joints.spec.ts` | 7 |
| Conformados C/Z | `m2-cold-formed-selector.spec.ts` | 15 |
| Selector de perfiles | `profile-selector.spec.ts` | 14 |
| Selectores M1 (§1, §2, §3.10, §5.9, §6, §7) | `m1-steel-selectors.spec.ts` | 21 |
| Generadores y uniones M1 (§3, §4) | `m1-generators-joints.spec.ts` | 14 |
| Estados e idiomas M1 (§5, §6) | `m1-states-and-languages.spec.ts` | 12 |
| Uniones metálicas | `metallic-joints.spec.ts` | 23 |
| Generadores metálicos | `generators-steel.spec.ts` | 10 |
| Rediseño de la superficie metálica | `steel-ui-redesign.spec.ts` | 10 |

**Lo que ningún test ve, y por lo que existe este documento:** que las cosas **quepan y se lean**;
que un aviso aparezca **cuando el usuario espera verlo**; que la **previsualización sea correcta** y
no sólo que cambie; que los tres idiomas **suenen escritos por una persona**; que el **tono** de los
cinco hechos de alcance de los conformados se lea como una capacidad y cuatro límites y no como
cinco refutaciones; y que un dibujo en 3D **no parezca terminado** cuando no lo está.

---

# L · Candidatos a M3

**Agregada el 2026-08-27.** El objetivo declarado del QA manual es **decidir qué correcciones entran
en M3**, y este documento no tenía esa lista: tenía bloqueantes de merge, que es otra cosa. Un
bloqueante hay que resolverlo **antes** de aceptar la rama; un candidato a M3 es algo que se puede
aceptar con la rama y arreglar después, y confundirlos es lo que convierte un merge en un rehén.

**Nada de esta sección está implementado, y M3 no está abierto.** Es material para la decisión.

## L.1 · Lo que el QA puede convertir en trabajo de M3

Ordenado por lo que cuesta si se deja, no por lo que cuesta arreglarlo.

| # | Candidato | Origen | Por qué puede esperar | Prioridad |
|---|---|---|---|---|
| **1** | **A-01 — el *builder* paramétrico quedó a un clic de distancia** | decisión abierta, `a-01-decision.md` | **no es un defecto**: la capacidad está completa y ganó poder reeditarse. Lo que cambió es por dónde se entra. Si el QA dice que el clic extra molesta, la vuelta atrás es acotada y conocida | **alta** — es la única decisión de producto abierta |
| **2** | **Los cuatro campos de sección que el link no lleva** (`composition`, `profileFamily`, `tl`, `built`) | I-08, mitad abierta | el análisis viaja correcto; lo que se degrada es la procedencia. **No es de acero**: es del codec compartido con hormigón | **media** — el peor caso es el link del widget de feedback |
| **3** | **`SectionShapeBuilder.svelte` es un componente entero sin montar** | J.4 punto 6 | la capacidad no se perdió, la tiene el modal. Es deuda de limpieza con una decisión de producto adentro (`m1-section-shape-builder.md`) | **baja** |
| **4** | **Las seis capacidades que existen en código y no tienen superficie** | J.4 | cada una es una decisión de alcance, no un arreglo. La más filosa es el `notVerifiable` del grupo de bulones: **existe y no hay control que lo alcance** | **media** para la de bulones, **baja** para las otras cinco |
| **5** | **La caída del renderer 3D** | K.5, «lo que no bloquea» | **preexistente y peor en la rama base** (10 % contra 12 %, y 17,5 % en Chrome real). Mitigada, no reparada. Fuera del alcance autorizado de estas ramas | **media** — es una caída, aunque no sea nueva |
| **6** | **Las presillas y las soldaduras no se dibujan en 3D** | G-12, F-11, H-12, H-13 | están **declaradas**, no silenciadas. Un usuario que diseña una presilla y no la ve en el visor puede creer que no se aplicó | **media** |
| **7** | **Los huecos de CI** — `concurrency`, jobs de `typecheck` y `svelte-check`, `run-e2e`, `wasm-pack` (#137) | K.5, «deuda que no es de estas ramas» | **no son de M1 ni de M2**. Van a PRs propios contra `main`. El de `wasm-pack` ya existe: **#137** | **alta** para `wasm-pack` y `concurrency`; **media** para los otros |

## L.2 · Lo que el QA puede descubrir, y donde va a estar

Los ítems de este inventario con el peor **modo de falla silencioso** — los que, si están mal, no
se ven mal. Si el QA encuentra algo, lo más probable es que sea uno de éstos, y conviene mirarlos
primero:

| Ítem | Qué falla en silencio |
|---|---|
| **E-25** | una unión obsoleta que no se anuncia es indistinguible de una que nadie diseñó — y una de las dos es trabajo del usuario |
| **I-06** | un veredicto **congelado** en vez de recalculado: la unión reabierta mostraría una verificación contra un miembro que cambió |
| **I-07** | una elección que el usuario **nunca hizo para este modelo**, presentada como hecha |
| **D-09** | una verificación que se declare `hecho` cuando no lo está |
| **E-21** | el cálculo auxiliar Vu/Tu leído como veredicto |
| **E-07** | una solicitación gobernante en **cero** que se lea como «no hay demanda» en vez de «no se calculó» |
| **A-18** | un centroide mal ubicado en la ficha — el número se ve plausible siempre |
| **B-13** | ν o ρ físicamente imposibles entrando al solver (era el defecto del formulario viejo) |

## L.3 · Qué NO debería entrar a M3

Para que la lista no crezca por inercia:

- **nada que este inventario clasifique como «sólo verificación automática»** — la suite lo cubre;
- **nada de los cinco fallos E2E locales ni de la baseline visual de 1 px**: los seis reproducen
  idénticos en `origin/main` y ninguna rama de acero los toca;
- **el flake del walkthrough de sección**: la contención está en `main` (`0844f01d`) y llega por
  merge. Diagnosticarlo es trabajo aparte y **está acotado, no diagnosticado** — el estado honesto;
- **los `@perf`**: no corren en CI en ninguna rama, así que un rojo ahí no es información nueva.
