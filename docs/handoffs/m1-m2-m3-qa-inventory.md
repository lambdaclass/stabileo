# Inventario de QA manual — integración M1 + M2 + M3

**Fecha:** 2026-09-03. **Rama de lectura:** `feat/pro-steel-m3` (`5c8bbbf7`).
**Servidor:** exclusivamente **`http://127.0.0.1:4005`** (`vite dev` con `VITE_E2E=1`, cwd
`stabileo-m3/web`). El **4004** sirve M1+M2 y **no se toca**.
**Compuerta de partida:** suite E2E completa sobre M3 (`c735c2c1`) — **[M] 841 pass · 1 failed ·
1 flaky · 4 skipped · 1 sin correr**, 39,5 min. La única falla es la baseline darwin de 1 px
(E-13), que se arregla actualizando un snapshot y por eso no se toca. **Cero fallas en superficie
metálica**: `m3-bolted-joint-3d` 14/14, `m2-joint-3d` 10/10, `m2-joint-persistence` 7/7,
`m2-steel-workflow` 14/14, `generators-steel` 10/10.

**Estado:** inventario. **No se implementó ninguna corrección.** M1 y M2 están congeladas; **M3 es
la única rama autorizada** a recibir después los cambios que salgan de este QA.

---

# 0 · Cómo se hizo, y qué tan verificado está cada dato

## 0.1 · El diff real, no los handoffs

Los tres PR forman una pila, así que el diff de cada uno es exactamente el tramo entre su base y su
cabeza:

| PR | Rama | Base | Diff medido | Archivos de producción |
|---|---|---|---|---|
| **#156** M1 | `feat/pro-steel-m1` | `b579de87` (main) | 56 arch., +9 937 / −52 | **26** |
| **#164** M2 | `feat/pro-steel-m2` | `feat/pro-steel-m1` | 135 arch., +24 058 / −1 242 | **73** |
| **#183** M3 | `feat/pro-steel-m3` | `feat/pro-steel-m2` | 15 arch., +1 672 / −47 | **11** |

Comandos usados: `git diff --stat <base>..<head> -- web/src web/e2e` y
`git diff --name-status ... | grep -v __tests__`.

## 0.2 · Nivel de verificación, por si alguien necesita saber en qué confiar

Cada afirmación de este documento se marca así:

- **[V]** verificada contra el código actual en esta sesión (grep/lectura del archivo);
- **[M]** medida ejecutando algo (test, script, servidor);
- **[H]** proviene de un handoff anterior y **no** se re-verificó — tratar como pista, no como hecho.

Se buscó deliberadamente **contradecir** los handoffs previos. Dos afirmaciones heredadas se
re-verificaron y **se confirmaron** (§F.1 y §F.2); ninguna se encontró falsa en esta pasada, y las
que no se pudieron comprobar quedan marcadas **[H]**.

## 0.3 · La ruta base, verificada

**[V]** La cinta PRO se construye en `ProRibbon.svelte` (`STAGES`, línea ~171). Etapas:
`model · conditions · analyse · design`. La etapa **`design`** tiene el grupo **`steel`**
(`proRibbon.groupSteel`) con dos comandos:

- **`steel`** → `proRibbon.cmdSteelProfiles` → en pantalla **«Profile design»**;
- **`connections`** → `proRibbon.cmdSteelJoints` → en pantalla **«Metallic joints»**.

**[M]** Reproducido en 4005: la etapa se muestra **DESIGN**, el panel se titula **METALLIC
JOINTS**, y la lista de nudos trae 226 filas sobre `3d-nave-industrial`.

**Prefijo de ruta común** — se abrevia `⟨PRO⟩` en todo el documento:

```
http://127.0.0.1:4005/app/pro?e2e=1
  → (hook) window.__stabileoActions.loadExample('3d-nave-industrial')
  → cinta ANALYSE → Solve         [necesario para todo lo que dependa de solicitaciones]
```

`?e2e=1` sólo habilita los hooks de inspección; **no cambia la UI**. Para QA puramente manual se
puede omitir, pero entonces los hooks de la columna «testids y hooks» no existen — **[V]** doble
compuerta en `main.ts:40` (`VITE_E2E`) más `?e2e=1` en runtime.

## 0.4 · Anchos responsive: los que la suite usa de verdad

**[V]** Medidos con `grep setViewportSize e2e/*.spec.ts`. Son **cinco** pares, no cuatro:

| Ancho × alto | Dónde se usa |
|---|---|
| **390 × 780** | `m1-steel-selectors`, `steel-ui-redesign` |
| **390 × 844** | `landing`, `blog` |
| **800 × 720** | `pro-panel-consistency`, `m2-generators-ui` |
| **1280 × 720** | varios PRO |
| **1280 × 800** | `pro-detailing-layout`, `rebar-*` |

**Corrección al enunciado del pedido:** son **cinco**, y los dos de 390 difieren sólo en alto. Si
«los cuatro anchos» quiere decir **390 / 800 / 1280 / 1440**, el **1440 no aparece en ningún spec**
— el `grep` lo encuentra sólo como valor de CSS. Se inventarían los cinco reales.

## 0.5 · Modelos de referencia

| Modelo | Cómo se carga | Para qué |
|---|---|---|
| **`3d-nave-industrial`** | `loadExample('3d-nave-industrial')` | **[M]** 232 nudos, 633 barras, 28 apoyos, **226 uniones**. El modelo obligatorio de casi todo el inventario |
| Nave por defecto del generador | Metallic structures → generar | **[M]** 300 nudos, 625 barras, 300 uniones. Para generadores |
| Modelo vacío | PRO recién abierto | Estados vacíos |

---

# A · QA obligatorio antes de aceptar M3

Cada entrada trae: origen · archivo · nombre visible · ruta · precondiciones · pasos · esperado ·
alternativos · persistencia · interacción · a11y · rendimiento · normativa · testids · severidad ·
M3 o aceptada.

---

## Bloque 1 · Perfiles metálicos, catálogo, modal, fichas y disposición

### A-01 · Catálogo de perfiles: filtros por organismo, código y altura

- **Origen:** M1 #156 · **[V]** `ProfileSelectorPanel.svelte` (24 testids), `lib/profiles/catalogue.ts`
- **Nombre visible:** panel **«Elegir sección estándar»** dentro del diálogo de secciones
- **Ruta:** `⟨PRO⟩` → cinta **MODEL** → *Properties* → **Sections** → **Agregar sección** → división **Elegir sección estándar**
- **Precondiciones:** ninguna (no requiere modelo ni solve)
- **Pasos:** 1) abrir el diálogo; 2) filtrar por organismo (`profile-body-*`); 3) por código (`profile-code`); 4) por altura mínima y máxima (`profile-hmin`, `profile-hmax`); 5) buscar por texto (`profile-search`); 6) leer el contador (`profile-count`)
- **Esperado:** el contador refleja el filtro; cada fila lleva su organismo; ninguna combinación de filtros deja el panel sin explicación
- **Alternativos / vacíos:** filtro sin resultados → `profile-empty`. Grupos con organismos mezclados → `profile-group-mixed-*`. Huecos declarados → `profile-gaps`
- **Persistencia:** la elección crea una sección del modelo; el filtro **no** persiste
- **Interacción:** la misma superficie la consume el generador por `ProfilePicker`
- **A11y / teclado:** el diálogo debe tener trampa de foco y Escape (ver A-06)
- **Normativa:** **[V]** la familia L declara **dos** normas (IRAM-IAS y EN 10056-1) y la procedencia se lee del array fuente, no del nombre
- **Testids:** `profile-selector` `profile-list` `profile-count` `profile-search` `profile-body-*` `profile-code` `profile-hmin` `profile-hmax` `profile-empty` `profile-gaps` `profile-option-*`
- **Severidad si falla:** **alta** — es la vía única de alta de secciones
- **Veredicto:** limitación aceptada si sólo es cosmético; **corrección en M3** si un filtro miente sobre el conteo

### A-02 · Ficha del perfil: procedencia por campo

- **Origen:** M1 #156 · **[V]** `lib/section/data-sheet.ts`, `SectionDataSheet.svelte`
- **Nombre visible:** ficha del perfil (toggle **`section-sheet-toggle`**)
- **Ruta:** como A-01 → elegir un perfil → abrir la ficha
- **Pasos:** para cada número de la ficha, buscar su base (`profile-basis-*` / `profile-prop-*`)
- **Esperado:** **[H]** radios de giro exactos; módulos resistentes con `c` del contorno canónico verificado y **refusados** donde nada los respalde; torsión tabulada o ausente, nunca derivada
- **Límites:** **[H]** media ancho de un UPN 200 sobreestimaría `Wz` en 46 % — el refuso es el comportamiento correcto
- **Testids:** `profile-card` `profile-prop-*` `profile-basis-*` `section-sheet-toggle`
- **Severidad:** **alta** — un número sin base es una afirmación inventada
- **Veredicto:** **corrección en M3** si aparece un valor derivado sin declarar su base

### A-03 · Comparación de perfiles, que sobrevive un cambio de filtro

- **Origen:** M1 #156 · **[V]** `ProfileSelectorPanel.svelte` (`profile-compare*`, `profile-pin-*`)
- **Ruta:** A-01 → fijar dos o tres perfiles (`profile-pin-*`)
- **Pasos:** fijar 2–3; cambiar el filtro; volver a mirar la comparación; limpiar (`profile-compare-clear`)
- **Esperado:** los fijados **sobreviven** al cambio de filtro
- **Testids:** `profile-compare` `profile-compare-*` `profile-pin-*` `profile-compare-clear`
- **Severidad:** media · **Veredicto:** M3 si se pierden al filtrar

### A-04 · Disposición y armados (`arrangement`, `gapMm`, rotación)

- **Origen:** M2 #164 · **[V]** `lib/section/profile-spec.ts` (7 disposiciones), `ProSectionModal.svelte`
- **Ruta:** A-01 → elegir perfil → **`section-arrangement`** → **`section-gap`** → **`section-rotation`**
- **Esperado:** **[V]** las 7 disposiciones son `single · doubleBack · doubleFacing · doubleParallel · doubleX · quadBack · quadBox`; un huelgo inválido produce `section-gap-problem`
- **Persistencia:** `composition` viaja en el `.ded`; **[V] NO viaja por URL** — ver E-01
- **Testids:** `section-arrangement` `section-gap` `section-gap-problem` `section-rotation` `section-apply` `section-refused` `section-closed-note`
- **Severidad:** **alta** · **Veredicto:** M3 si una disposición produce propiedades que no correspondan

### A-05 · Sección construida (paramétrica) y su reapertura

- **Origen:** M2 #164 · **[V]** `BuiltSectionPanel.svelte` (acepta `initial`)
- **Ruta:** diálogo de secciones → división **construcción** (`section-division-build`)
- **Pasos:** elegir plantilla (`section-template`); llenar parámetros; aplicar; **reabrir la sección y verificar que los parámetros vuelven**
- **Esperado:** **[V]** el registro `built` guarda plantilla y parámetros, y el panel los relee — una sección construida **se puede volver a editar**
- **Límites:** **[H]** la rama `built` descartaba `tw/tf/t/tl` y se corrigió en `806e1289`; verificar que una construida resuelve `geometry-backed` y no `properties-only`
- **Testids:** `section-division-build` `section-template` `section-template-desc` `section-build` `section-build-props`
- **Severidad:** **alta** · **Veredicto:** M3

### A-06 · El diálogo: modal, centrado, con trampa de foco

- **Origen:** M2 #164 · **[V]** `ProSectionModal.svelte`, `ProMaterialModal.svelte`
- **Pasos:** abrir con **Enter** desde el botón; tabular hasta el último control y una vez más; Shift+Tab desde el primero; **Escape**; clic en el fondo
- **Esperado:** el foco **cicla dentro** en ambas direcciones; Escape cierra sin aplicar; el foco **vuelve al botón** con anillo visible; el backdrop cierra
- **Riesgo:** **[H]** el foco se restauraba a `<body>` y se corrigió con `$effect.pre` — es sensible al orden de efectos de Svelte 5; cualquier hijo nuevo que enfoque al montar lo puede romper
- **Testids:** `pro-section-modal` `pro-material-modal`
- **Severidad:** **alta** (a11y) · **Veredicto:** **corrección en M3** si el foco se escapa

### A-07 · Conformados en frío C/Z

- **Origen:** M1 #156 (catálogo) + M2 #164 (panel) · **[V]** `cold-formed-catalogue.ts`
  (`COLD_FORMED_FAMILIES = { C: 'CFC', Z: 'CFZ' }`), `ColdFormedPanel.svelte`
- **Nombre visible:** panel de conformados en frío
- **Ruta:** `⟨PRO⟩` → **DESIGN** → **Profile design** → panel de conformados
- **Pasos:** designación (`cf-designation-input`); h, b, t, labio; leer propiedades (`cf-properties`) y su base (`cf-basis`); agregar (`cf-add`)
- **Esperado:** propiedades con base declarada; una designación fuera de alcance **se rechaza** (`cf-reject`) con el motivo (`cold-formed-scope`)
- **Alternativos:** **[V]** aviso de ejes no principales (`cf-axes-notice`) — ver E-04
- **Límites normativos:** **[H]** `m2-cold-formed-limits.md`; el catálogo C/Z es paramétrico y **es un tercer camino de alta a propósito** (no tiene equivalente en el modal)
- **Testids:** `cold-formed-panel` `cf-designation-input` `cf-h` `cf-b` `cf-t` `cf-corners` `cf-properties` `cf-basis` `cf-preview` `cf-add` `cf-added` `cf-reject` `cf-axes-notice` `cold-formed-scope`
- **Severidad:** **alta** · **Veredicto:** M3 si una designación aceptada da propiedades sin base

---

## Bloque 2 · Materiales, grados, procedencia y selección

### A-08 · El diálogo de materiales es la única vía de alta

- **Origen:** M2 #164 · **[V]** `ProMaterialModal.svelte`, `ProMaterialsTab.svelte`
- **Ruta:** `⟨PRO⟩` → **MODEL** → *Properties* → **Materials** → **Agregar material**
- **Pasos:** contar cuántos controles del panel dan de alta un material
- **Esperado:** **exactamente uno**, y abre el diálogo. Debajo queda la tabla de materiales, de lectura y borrado
- **Regresión que lo protege:** **[H]** `material-choice.test.ts` afirma la **ausencia de la maquinaria** (que la pestaña no importe `MATERIAL_CATEGORIES`, `searchPresets` ni `MaterialPreset`) y cuenta **exactamente un** `modelStore.addMaterial(`
- **Testids:** `pro-material-modal` `material-list` `material-search` `material-apply` `material-current` `material-no-results` `material-division-catalogue` `material-division-custom`
- **Severidad:** **alta** · **Veredicto:** M3 si aparece una segunda vía

### A-09 · Material a medida, acotado por física

- **Origen:** M2 #164 · **[V]** `CustomMaterialPanel.svelte`, `lib/material/material-choice.ts` (`kind: 'custom'`)
- **Ruta:** diálogo de materiales → división **custom** (`material-division-custom`)
- **Pasos:** llenar E, ν, ρ, fy; probar **ν = 3** y **ρ = −78,5**; probar **coma decimal** (`0,3`)
- **Esperado:** **[H]** ν fuera de (−1, 0,5) se rechaza (es un módulo volumétrico o de corte negativo) — el formulario inline anterior sólo chequeaba `isNaN`; la coma decimal se lee (`parseFloat('0,3')` daba `0`, un Poisson que el viejo aceptaba)
- **Clave:** **[V]** un material a medida **no** emite `gradeId`, `standard` ni `region` — sintetizarlos sería el defecto en la dirección contraria
- **Alternativos:** `material-custom-problem` nombra el campo
- **Testids:** `material-custom` `material-custom-e` `material-custom-nu` `material-custom-rho` `material-custom-fy` `material-custom-name` `material-custom-problem` `material-custom-caveat`
- **Severidad:** **alta** · **Veredicto:** **corrección en M3** si ν = 3 llega al modelo

### A-10 · `allowCustom = false` en generadores

- **Origen:** M2 #164 · **[V]** `ProGeneratorsPanel.svelte` no pasa `allowCustom`
- **Ruta:** `⟨PRO⟩` → **MODEL** → **Metallic structures** → elegir material
- **Esperado:** la división **custom no aparece**
- **Por qué:** **[H]** el `onApply` del generador guarda `choiceGradeId(choice)` y un material a medida responde `null`: aparecería como «sin grado elegido» después de llenar cinco campos
- **Severidad:** media · **Veredicto:** limitación aceptada, documentada

### A-11 · Catálogo profundo de grados: procedencia y bandas

- **Origen:** M1 #156 · **[V]** `GradePickerPanel.svelte` (21 testids), `lib/grades/catalogue.ts`
- **Ruta:** diálogo de materiales → división catálogo → panel de grados
- **Pasos:** filtrar por familia (`grade-family-*`), región (`grade-region-*`), código (`grade-code`); buscar (`grade-search`); leer bandas de espesor (`grade-bands`) y la base por campo (`grade-basis-*`)
- **Esperado:** **[H]** cada valor declara su autoridad: norma de producto; los **45 grados marcados como típicos de la aleación**; el módulo de corte **derivado**; y las bandas de espesor **siempre con el código que las publica**
- **Clave de honestidad:** **[V]** `grade-not-a-check` — el panel dice explícitamente que elegir un grado **no es una verificación**
- **Alternativos:** sin resultados → `grade-empty`; conteo → `grade-count`
- **Testids:** `grade-picker` `grade-list` `grade-search` `grade-family-*` `grade-region-*` `grade-code` `grade-bands` `grade-basis-*` `grade-prop-*` `grade-typical` `grade-pairing` `grade-not-a-check` `grade-empty` `grade-count`
- **Severidad:** **alta** · **Veredicto:** M3 si un valor no declara base

### A-12 · Emparejamiento perfil ↔ grado

- **Origen:** M1 #156 · **[V]** `grade-pairing`, `lib/engine/steel/grade-family.ts`
- **Pasos:** elegir un perfil de una familia y un grado de otra; leer el aviso
- **Esperado:** el emparejamiento improbable se **dice**, no se bloquea silenciosamente
- **Severidad:** media · **Veredicto:** M3

### A-13 · Aluminio se separa del acero

- **Origen:** M1 #156 · **[V]** `steel-inventory.ts` modificado, `grade-family.ts`
- **Pasos:** buscar miembros no ferrosos en el inventario
- **Esperado:** **[H]** el inventario **nombra** los miembros no ferrosos en lugar de perderlos silenciosamente al filtrar por `isSteel`
- **Severidad:** **alta** — perder filas en silencio es pérdida de información
- **Veredicto:** M3 si desaparecen sin mención

---

## Bloque 3 · Cargas, solicitaciones y resultados

### A-14 · El camino longitudinal de la nave

- **Origen:** M1 #156 · **[V]** `lib/engine/generators/shed.ts` modificado
- **Ruta:** `⟨PRO⟩` → **MODEL** → **Metallic structures** → generar nave → **ANALYSE** → Solve
- **Pasos:** cargar bajo el eje del edificio; leer el desplazamiento máximo
- **Esperado:** **[H]/[M]** la nave por defecto sin arriostrar devolvía **2,4·10¹¹ m** para 20 kN — no singular, así que **todo `isFinite` pasaba**. Con los tres elementos (vigas longitudinales + arriostramiento de fachada + de cordón) llega a **4,4 mm**; ninguno solo alcanza
- **Límite:** **[M]** el test que lo fija tarda **2,89 s** contra el timeout por defecto de 5 s de vitest — no hay nada que partir, es un solve solo, lento porque el sistema es casi singular a propósito
- **Severidad:** **crítica** — un mecanismo con número es la peor forma de defecto
- **Veredicto:** limitación aceptada (documentada y con test), **no** corrección

### A-15 · Solicitaciones por nudo

- **Origen:** M2 #164 · **[V]** `lib/connection/joint-demands.ts`, `computeDemands` (hook)
- **Ruta:** `⟨PRO⟩` → solve → **DESIGN** → **Metallic joints** → elegir nudo
- **Esperado:** **[V]** se muestran axial, corte y momento gobernantes **con su combinación y su barra** (`joint-demands`); los huecos se nombran (`joint-demand-gaps`)
- **[M] Reproducido:** N51 → axial 258,0 kN `1.2D+L+1.6W · E106 · I`, corte 2,2 kN, momento 3,1 kN·m
- **Clave:** **[V]** las demandas salen del análisis, **no** de números tipeados; `boltShearDemandKN` / `boltTensionDemandKN` nombran qué componente alimenta qué verificación
- **Alternativos:** sin solve → sin demandas, y debe decirlo
- **Testids:** `joint-demands` `joint-demand-gaps` · hook `computeDemands`
- **Severidad:** **crítica** · **Veredicto:** M3 si una demanda no cita su combinación

### A-16 · Diagramas y mapas con acero en el modelo

- **Origen:** preexistente, tocado por contexto
- **Ruta:** `⟨PRO⟩` → solve → **ANALYSE** → *Diagrams* / *Maps*
- **Pasos:** recorrer los 8 diagramas y los 2 mapas (`colorMap`, `verification`)
- **Esperado:** **[V]** los comandos están deshabilitados hasta que hay solve (`enabled: () => solved`); ningún mapa presenta un miembro metálico como verificado
- **Severidad:** **alta** · **Veredicto:** M3 si un mapa pinta acero como verificado

---

## Bloque 4 · Generadores y familias

### A-17 · Generadores: nave, celosía, columna reticulada

- **Origen:** M1 (nave) + M2 (UI) · **[V]** `ProGeneratorsPanel.svelte`, `truss-topology.ts`, `emit.ts`
- **Nombre visible:** **«Metallic structures»**
- **Ruta:** `⟨PRO⟩` → **MODEL** → **Metallic structures**
- **Pasos:** generar con parámetros válidos; luego con inválidos; leer la lista de problemas
- **Esperado:** los problemas de parámetros se listan **con el campo**; el modelo generado lleva el grado elegido
- **Clave:** **[H]** `generator.assume.placeholderGrade` **desaparece** cuando deja de ser verdad
- **Alternativos:** **[V]** `generator.assume.latticeBasesPinnedNoOutOfPlane` se declara y **no** se retira por arriostrar
- **Persistencia:** las asunciones viajan a la procedencia del modelo
- **Severidad:** **alta** · **Veredicto:** M3 si una asunción se declara y no es verdad (o al revés)

### A-18 · `purlins: false`, respondido en las dos mitades

- **Origen:** M1 #156 · **[H]** `m1-purlins-false-investigation.md`
- **Pasos:** generar sin correas; cargar vertical; cargar longitudinal
- **Esperado:** **[H]** con **todas** las crujías arriostradas resuelve bajo carga vertical (llega a cada pórtico); sigue **libre longitudinalmente** hasta agregar el arriostramiento vertical
- **Severidad:** **alta** · **Veredicto:** limitación aceptada, con tests

---

## Bloque 5 · Diseño y verificación de miembros

### A-19 · El workflow metálico de 8 etapas

- **Origen:** M2 #164 · **[V]** `ProSteelWorkflowTab.svelte` (49 testids)
- **Nombre visible:** **«Profile design»** → workflow
- **Ruta:** `⟨PRO⟩` → **DESIGN** → **Profile design**
- **Pasos:** recorrer las 8 etapas: model · geometry · grade · section · regulation · analysis · verification · documents
- **Esperado:** **[V]** cada etapa tiene cuerpo y estado propios (`steel-stage-*-body`, `steel-sub-*-state`); los bloqueos se nombran (`steel-stage-verification-blockers`)
- **Clave:** **[V]** **nunca `done`** en verificación — `steelCountsAsVerified()` devuelve el literal `false`
- **Alternativos:** sin grado → `steel-grade-empty`; sin sección → `steel-section-empty`; sin resultados → `steel-results-none`
- **Testids:** todos los `steel-*` de §0; `steel-review-state` para el estado de revisión
- **Severidad:** **crítica** — es donde el producto podría afirmar una verificación que no tiene
- **Veredicto:** **corrección en M3** ante cualquier tilde verde en verificación

### A-20 · Mapa de cláusulas y capacidades del adaptador

- **Origen:** M2 #164 · **[V]** `cirsoc301-clause-map.ts` (nuevo), `cirsoc301-capabilities.ts`
- **Ruta:** A-19 → etapa de regulación / resultados
- **Pasos:** leer `steel-results-clause-map`, `steel-clause-availability`, `steel-clause-cb`, `steel-clause-e4`, `steel-clause-f62`
- **Esperado:** **[V]** el estado de revisión declara **cuántas cláusulas están trazadas y cuántas pendientes** (`CIRSOC301_CLAUSE_MAP.length` vs `CIRSOC301_CLAUSES_UNVALIDATED.length`)
- **Normativa:** **[H]** `m2-cirsoc301-normative-audit.md`
- **Severidad:** **crítica** · **Veredicto:** M3 si el conteo miente

### A-21 · Pandeo local de ala, torsional y gradiente de momento

- **Origen:** M2 #164 · **[V]** `flange-local-buckling.ts`, `torsional-buckling.ts`, `moment-gradient.ts` (los tres nuevos)
- **Ruta:** A-19 → etapa de verificación con un miembro real
- **Esperado:** cada resultado cita su cláusula; lo que no se puede evaluar se declara y **no** se aproxima
- **Severidad:** **crítica** · **Veredicto:** M3

### A-22 · Nombres humanos y agrupación de miembros

- **Origen:** M2 #164 · **[V]** `lib/engine/steel/workflow-rows.ts` (nuevo)
- **Ruta:** A-19 → etapa de sección / resultados
- **Pasos:** leer `steel-results-human`, `steel-section-rows`, `steel-grade-rows`
- **Esperado:** los miembros se agrupan y se nombran de forma legible, no por id crudo
- **Severidad:** media · **Veredicto:** M3

---

## Bloque 6 · Conexiones y uniones

### A-23 · Detección de nudos

- **Origen:** preexistente en `main`, ampliado por M2 · **[V]** `engine/connection-design.ts` (`detectJoints`)
- **Ruta:** `⟨PRO⟩` → **DESIGN** → **Metallic joints**
- **Esperado:** **[M]** 226 nudos sobre `3d-nave-industrial`. La detección es **geométrica**: no distingue viga-columna de empalme o base, y **no lee liberaciones de extremo** — el panel lo dice
- **Alternativos:** ningún metálico → `conn-none-metallic` + `conn-none-metallic-why`; sin nudos → `conn-no-joints`; filtrados → `conn-filtered-note`
- **Testids:** `conn-sec-joints` `conn-joints-what` `conn-joint-row` `conn-none-metallic` `conn-no-joints`
- **Severidad:** **alta** · **Veredicto:** limitación aceptada (declarada)

### A-24 · Split por material en un nudo mixto

- **Origen:** M2 #164 · **[V]** `conn-members-metallic` / `conn-members-nonmetallic`
- **Pasos:** elegir un nudo con acero y hormigón concurrentes
- **Esperado:** **[M]** las barras se listan separadas por material (N51: `E88, E94, … metallic`), con nota (`conn-mixed-note`)
- **Severidad:** **alta** · **Veredicto:** M3 si un nudo mixto no dice de qué mitad habla el cálculo

### A-25 · Banner experimental y las cinco limitaciones

- **Origen:** preexistente + M2 · **[V]** `conn-experimental-banner`, `conn-gaps`, `conn-gap-{id}`
- **Esperado:** **[M]** el banner dice literalmente que **no es una verificación y no puede usarse como tal**; cada hueco declara alcance, si existe y qué afecta (`conn-gap-*-scope`, `-exists`, `-affects`, `-missing`)
- **Severidad:** **crítica** — es la afirmación de honestidad del bloque
- **Veredicto:** **corrección en M3** si el banner desaparece o se ablanda

---

## Bloque 7 · Bulones, chapas, agujeros, soldaduras, presillas

### A-26 · Grupo de bulones: las cinco cláusulas

- **Origen:** M2 #164 · **[V]** `lib/connection/bolted-joint.ts`, `bolt-geometry.ts`
- **Ruta:** `⟨PRO⟩` → solve → **DESIGN** → **Metallic joints** → nudo → bloque *Joint design*
- **Pasos:** llenar `jd-diameter`, `jd-grade`, `jd-count`, `jd-rows`, `jd-spacing`, `jd-edge`, `jd-plate-t`, `jd-plate-fu`; leer las verificaciones
- **Esperado:** **[M]** corte §J.3.6, tracción §J.3.6, combinado §J.3.7, aplastamiento §J.3.10, paso mínimo §J.3.3, distancia al borde mínima §J.3.4 — cada una con capacidad/demanda y cláusula
- **[V] Suma del grupo:** por bulón **el mínimo** entre corte y aplastamiento; para la unión **la suma** de los efectivos. **No** el mínimo de los dos totales — sería distinto y no conservador cuando el aplastamiento gobierna algunos y el corte otros
- **[V] Diámetros:** `jd-diameter` sólo ofrece los **tabulados**; ofrecer otro daría un bulón cuya distancia al borde no se puede verificar
- **Alternativos:** falta un input → `jd-input-problem` y estado `incomplete`; `conn-bolts-empty`
- **Testids:** `jd-*` `joint-checks` `joint-design-state` `conn-bolt-result` `conn-fvexcl-warning`
- **Severidad:** **crítica** · **Veredicto:** M3

### A-27 · Chapa: contorno, espesor y agujeros

- **Origen:** M2 #164 (geometría) + M3 #183 (dibujo) · **[V]** `plate-geometry.ts`, `joint-layout.ts`, `joint-meshes.ts`
- **Ruta:** A-26 → con la chapa completa
- **Esperado:** **[M]** con 6 bulones ⌀20 en 2 filas, paso 60, borde 35, espesor 12 → chapa **190 × 130 × 12 mm** con **6 agujeros de ⌀22 mm** en `(±60, ±30)` y `(0, ±30)`
- **[V] Clave:** el agujero es de Tabla J.3.3 y el vástago es el **nominal** (20,00 mm exactos desde `boltAreaCm2`) — la holgura de 2 mm es visible en el visor
- **Alternativos:** sin espesor → `GEOMETRY_UNAVAILABLE` con `plate.missing.thickness`; `joint-plate-unavailable`
- **Testids:** `joint-plate` `joint-plate-unavailable`
- **Severidad:** **crítica** · **Veredicto:** M3

### A-28 · Soldadura de filete

- **Origen:** M2 #164 · **[V]** `lib/connection/fillet-weld.ts`
- **Ruta:** A-26 → **`joint-weld-add`**
- **Pasos:** llenar `jw-leg`, `jw-length`, `jw-runs`, `jw-fexx`, `jw-thicker`, `jw-thinner`, `jw-process`, `jw-loading`; leer garganta (`jw-throat`), área (`jw-area`), longitud efectiva (`jw-effective-length`)
- **Esperado:** resistencia, tamaño mínimo, tamaño máximo, longitud mínima y metal base; **[V]** el metal base es **`notVerifiable`** porque Tabla J.2.5 remite al Capítulo J.4 (`joint-weld-j4`)
- **Clave:** **[V]** una soldadura **ausente no es incompleta** — la mayoría de las uniones abulonadas no tiene soldadura, y reportar «soldadura incompleta» en todas haría el estado inútil (`joint-weld-none`)
- **Testids:** `joint-weld` `joint-weld-add` `joint-weld-remove` `joint-weld-none` `joint-weld-state` `joint-weld-checks` `joint-weld-j4` `joint-weld-missing` `joint-weld-derived` `jw-*`
- **Severidad:** **crítica** · **Veredicto:** M3

### A-29 · Presillas (§E.6)

- **Origen:** M2 #164 · **[V]** `batten-geometry.ts`, `BattenPanel.svelte`, `lib/section/battens.ts`
- **Ruta:** A-26 → **`joint-battens-add`** (sólo con miembros armados)
- **Pasos:** disposición (`jb-facing`), huelgo (`jb-gap`), segmentos (`jb-segments`), radio de giro del cordón (`jb-chord-ri`), barra de referencia (`jb-member`); leer estaciones (`jb-stations`) y esbeltez (`jb-slenderness`)
- **Esperado:** **[V]** las estaciones se calculan; **la chapa de presilla queda `GEOMETRY_UNAVAILABLE`** porque §E.6 no da dimensiones (`joint-battens-plate`, `batten-geometry-unavailable`)
- **Clave:** **[V]** `chordRiMm` es un **input**, no un lookup: varias barras llegan al nudo y la app no puede saber cuál es el cordón — adivinarlo pondría un número en una esbeltez que el usuario no chequeó. `jb-preloaded` marca que la barra de referencia es una **selección inicial**, y una vez cambiada la elección es del usuario
- **Alternativos:** fuera de alcance → `batten-out-of-scope`; sin presillas → `joint-battens-none`
- **Testids:** `joint-battens*` `jb-*` `batten-panel` `batten-rules` `batten-geometry-unavailable` `batten-out-of-scope`
- **Severidad:** **alta** · **Veredicto:** limitación aceptada (la chapa) + M3 si una estación es incorrecta

---

## Bloque 8 · Los cuatro estados

### A-30 · `notDesigned · incomplete · notVerifiable · designed · exceeded`

- **Origen:** M2 #164 · **[V]** `bolted-joint.ts:148` y el orden en `joint-design.ts`
- **[V] Severidad del resumen (peor primero):** `exceeded · notDesigned · incomplete · notVerifiable · designed`. Una unión es **tan diseñada como su parte menos diseñada**, y **`exceeded` gana a todo**: una falla no es «incompleta» porque otra parte le falte un input
- **[V] `verified` está en la unión y nada lo produce** — existe para tener nombre traducible sin que ningún camino pueda emitirlo
- **Pasos por estado:**
  1. **`notDesigned`** — elegir un nudo y no tocar nada → `joint-design-state` = `notDesigned`, **nada dibujado**, y el panel explica por qué (`conn-scene-empty`)
  2. **`incomplete`** — bulones sin espesor de chapa → estado `incomplete`, `jd-input-problem`, nada dibujado
  3. **`exceeded`** — **[V]** paso de 10 mm (viola `s ≥ 3d`) → estado `exceeded` **y la geometría sigue dibujada**
  4. **`designed`** — todo completo y pasando → `designed`, **nunca `verified`**
  5. **`notVerifiable`** — **[V] alcanzable en soldadura** (metal base §J.4); **NO alcanzable en el grupo de bulones** — ver **F.2**
- **Persistencia:** **[V]** el estado **no** se guarda; se recalcula al leer. Una unión guardada no puede reportar una verificación contra una barra que ya no está
- **Severidad:** **crítica** · **Veredicto:** M3 si `exceeded` esconde geometría o si aparece `verified`

---

## Bloque 9 · Selección lista ↔ visor

### A-31 · Los dos sentidos

- **Origen:** M2 #164 (nudo) + M3 #183 (malla) · **[V]** `ProConnectionsTab.svelte`, `Viewport3D.svelte`
- **Pasos:** 1) elegir fila → el nudo queda seleccionado en el modelo; 2) seleccionar el nudo en el visor → el panel abre esa unión; 3) **clicquear la chapa** de la unión; 4) cambiar de fila con otra unión diseñada
- **Esperado:** **[M]** los cuatro funcionan. El (3) es el que **estaba roto**: las mallas viven en `jointsParent`, que ningún raycast consultaba, así que el clic caía en «sin impacto → limpiar selección» y **borraba lo que acababas de clicquear**
- **[V]** shift/ctrl se honran al clicquear el acero de la unión
- **Testids / hooks:** `conn-joint-row` · `selectedNodeIds()` `jointScene()` `jointMeshCount()`
- **Severidad:** **alta** · **Veredicto:** M3

---

## Bloque 10 · Visor 3-D de uniones abulonadas

### A-32 · Chapa orientada, y el defecto que se corrigió

- **Origen:** M3 #183 · **[V]/[M]** `joint-meshes.ts`, `joint-layout.ts`
- **Ruta:** A-26 → **«Frame the joint»** (`conn-scene-inspect`)
- **Esperado:** la chapa se dibuja **en el marco de la unión**, con sus agujeros perforados de verdad, y **todos los bulones dentro** de la chapa
- **[M] El defecto medido:** la chapa se dibujaba como caja **alineada a los ejes globales** mientras los bulones se colocaban en el marco de la barra. En la nave por defecto, nudo 9 (primera barra sobre **Z**), **4 de 6 bulones quedaban fuera**. Con el marco aplicado: **0 de 6**
- **[V]** marco ortonormal y **directo** (`n = u × v`), para que no espeje el patrón de agujeros de un armado asimétrico
- **Hook:** `jointScene().boltsInsidePlate`
- **Severidad:** **crítica** — geometría que no corresponde al diseño
- **Veredicto:** corregido en M3; **QA obligatorio** de confirmación

### A-33 · Bulón: vástago sobre la normal, cabeza visible

- **Origen:** M3 #183 · **[V]** `joint-meshes.ts`
- **Esperado:** un vástago y una cabeza por agujero; el vástago **atraviesa** la chapa (eje = normal), la cabeza queda **despejada** en la cara `+n`
- **[V] Limitación declarada:** la **cabeza es convención de dibujo, no dimensión**. El repo no tiene tabla de entrecaras y §J.3 no la da (dimensiona por área nominal del cuerpo). Está en **una** constante, documentada, y **nada calcula con ella**
- **Hook:** `jointScene().shanks` / `.heads` / `.boltDiameterMm`
- **Severidad:** media · **Veredicto:** limitación aceptada, **declarada explícitamente**

### A-34 · Nada dibujado, y por qué

- **Origen:** M2 (motivos) + M3 (renderizado) · **[V]** `conn-scene-empty`, `conn-scene-reason`
- **Pasos:** nudo sin diseñar; bulones sin espesor; deshacer un diseño
- **Esperado:** **[M]** nada dibujado **y el panel nombra el motivo** — con espesor faltante dice «espesor», no sólo «no se puede dibujar». **Ninguna clave i18n cruda en pantalla**
- **[V] Hallazgo de este QA:** `joint.scene.notDesigned` la emite el layout **desde M2** y **no tenía traducción en ningún idioma** — nadie la renderizaba. Agregada en es/en/pt en M3
- **Severidad:** **alta** · **Veredicto:** corregido en M3

---

## Bloque 11 · Modos de visualización, nodos, picking, cámara

### A-35 · La regla de visibilidad de nodos por modo

- **Origen:** M3 #183 · **[V]** `nodes-instanced.ts` (`setDrawn`, `suppress`), `Viewport3D.svelte`
- **Nombre visible:** selector **«View»** en el panel de uniones (`conn-scene-mode`)
- **Ruta:** `⟨PRO⟩` → **DESIGN** → **Metallic joints** → nudo → selector **View**
- **[V] Las dos reglas, separadas:**
  - **A — por modo:** `sections` **no dibuja ningún marcador**; los otros modos sí
  - **B — por selección:** el marcador **del nudo cuya unión se dibuja** se colapsa, en cualquier modo, **sólo mientras hay mallas**
- **Pasos:** 1) en wireframe, con la unión encuadrada, confirmar que **no** hay esfera sobre la chapa; 2) pasar a `sections` → **ningún** marcador; 3) volver a `solid` y `wireframe` → marcadores presentes; 4) **con marcadores ocultos, clicquear la unión** → sigue seleccionada; 5) confirmar que otros modos no se rompieron
- **[M] El defecto reproducido:** una esfera roja **más ancha que la chapa de 190 mm** cubría el centro de la unión **en el modo por defecto**, no sólo en secciones. El resaltado tapaba lo que resaltaba
- **[V] Por qué se puede ocultar sin perder picking:** `material.visible = false` saca la malla de la **lista de render** y la deja en el grafo; `InstancedMesh.raycast` **no consulta el material**. **No** es `mesh.visible = false`, que la habría sacado también del raycaster
- **Hooks:** `nodeMarkersDrawn()` `renderMode3D()` `nodeMarkerRadius()`
- **Severidad:** **alta** — geometría inspeccionable vs. tapada
- **Veredicto:** corregido en M3; **QA obligatorio** de confirmación

### A-36 · Cámara, encuadre y zoom

- **Origen:** M3 #183 · **[V]** `zoomToJoint()` en `Viewport3D.svelte`
- **Esperado:** **[M]** «Frame the joint» centra la unión y acerca por su **propio radio** (0,133 m en N51), con las **cabezas incluidas** para que no se recorten. Es un **comando**, no un re-encuadre automático
- **Pasos extra:** probar en cámara **ortográfica** (el frustum debe encogerse, no la posición); confirmar que el zoom general (`zoomToFit`) sigue funcionando
- **Severidad:** media · **Veredicto:** M3 si en ortográfica no encuadra

### A-37 · Overlays y z-index

- **Origen:** M3 #183 (nuevo bloque en el panel)
- **Pasos:** con el panel abierto, confirmar que el bloque de escena (`conn-scene`) no tapa las filas ni el banner; que el diálogo de secciones se dibuja **sobre** el panel; que el gizmo de ejes no queda debajo
- **Severidad:** media · **Veredicto:** M3

---

## Bloque 12 · Persistencia, snapshots, URL y compatibilidad

### A-38 · `.ded`, undo/redo, captura de pestaña, autosave

- **Origen:** M2 #164 · **[V]** `history.svelte.ts` (`jointDesigns?: StoredJointDesigns`), `model.svelte.ts`
- **Pasos:** diseñar una unión; guardar `.ded`; abrir; deshacer/rehacer; cambiar de pestaña y volver
- **Esperado:** **[V]** las **elecciones** vuelven por las cuatro rutas (las cuatro pasan por `snapshot()`/`restore()`); **nada calculado** viaja — el `.ded` **no** contiene `capacityKN`, `holesM`, `utilisation` ni `checks`
- **[V]** campo ausente = «no se diseñó ninguna unión»; y **ausente se queda ausente** en `snapshot()`, para que `restore(snapshot())` sea un no-op (Cancel de un borrador CAD depende de eso)
- **Testids / hooks:** `jointDesigns()` `jointDesignedNodeIds()` `autosaveNow()` `autosaveStored()`
- **Severidad:** **crítica** · **Veredicto:** M3

### A-39 · Obsolescencia: un id de nudo no es una identidad

- **Origen:** M2 #164 · **[V]** `joint-choices.ts` (`reconcileJointDesigns`)
- **Pasos:** diseñar una unión; **mover** el nudo; **borrarlo**; cambiar el abanico de barras; cargar **otro** modelo
- **Esperado:** **[V]** tres razones en **orden afirmado** — `nodeMissing` → `nodeMoved` → `topologyChanged`. El orden importa: un nudo ausente tampoco tiene barras, así que chequear el conteo primero reportaría cada nudo borrado como cambio de topología
- **[V]** una obsoleta **se conserva**, **no se aplica** (`choicesFor` responde vacío), **no se itera** (`designedNodeIds` la excluye, así que un documento no la tabula) y **se dice en pantalla** con dos remedios: descartar una o todas
- **[V]** tolerancia de 1 mm, y **tres `Number.isFinite`** antes de comparar — `JSON` convierte `NaN` en `null` y `null` coacciona a `0`, así que una huella sin avalar volvería coincidiendo con cualquier nudo en el origen
- **Testids / hooks:** `conn-obsolete-notice` `conn-obsolete-title` `conn-obsolete-discard-all` · `jointObsolete()`
- **Severidad:** **crítica** — es «un valor plausible ocupando el lugar de un dato ausente»
- **Veredicto:** M3

### A-40 · Share codec: uniones sí, cuatro campos de sección no

- **Origen:** M2 #164 · **[V]** `url-sharing.ts` (`SHARE_VERSION = 5`, `c.jd`)
- **Ruta:** `⟨PRO⟩` → **Project** → *Compartir* → Copiar link
- **Pasos:** 1) diseñar uniones y compartir → abrir el link; 2) abrir un link **v4 viejo**; 3) abrir un link con uniones **sobre otro modelo**; 4) armar una sección compuesta y un C/Z y compartir
- **Esperado:**
  - **[V]** las uniones vuelven, **sólo elecciones**, con su huella;
  - un link viejo **abre** y trae «sin decisiones de unión»;
  - un link abierto sobre otro modelo reporta **obsoleto**, no coincidencia;
  - **[V] se pierden cuatro campos de sección**: `composition`, `profileFamily`, `tl`, `built` — ver **E-01**
- **Límite declarado:** **[V]** un payload de uniones adulterado **invalida el link completo**, y por la ruta `#data=` la app abre vacía sin decir por qué
- **Severidad:** **alta** · **Veredicto:** E-01 es limitación aceptada; el silencio del hash es **apto para M3**

---

## Bloque 13 · i18n es / en / pt

### A-41 · Paridad y ausencia de claves crudas

- **Origen:** las tres ramas · **[V]** `locales/steel/{es,en,pt}.ts` + `locales/{es,en,pt}.ts`
- **Pasos:** recorrer **todo** el recorrido metálico en los tres idiomas; buscar claves crudas (`conn.`, `joint.`, `steel.`, `plate.missing.`, `grade.`, `profile.`)
- **Esperado:** ninguna clave cruda; ningún texto en inglés dentro de es/pt
- **[V] Hallazgo:** `joint.scene.notDesigned` **no tenía traducción en ningún idioma** hasta M3 — es exactamente el tipo de hueco que sólo aparece cuando alguien renderiza la clave
- **[M]** las 5 claves `plate.missing.*` **sí** estaban en los tres idiomas
- **Compuerta:** `npm run test:unit src/lib/i18n/__tests__/` → **[M] 12/12, 178 tests**
- **Severidad:** **alta** · **Veredicto:** M3 por cada clave cruda encontrada

---

## Bloque 14 · Responsive

### A-42 · Los cinco anchos reales

- **Origen:** las tres ramas · **[V]** anchos de §0.4
- **Pasos:** en **390×780**, **390×844**, **800×720**, **1280×720** y **1280×800**, recorrer: diálogo de secciones, diálogo de materiales, panel de grados, panel de uniones (con el bloque de escena **nuevo de M3**), workflow de 8 etapas
- **Esperado:** nada se corta; el bloque `conn-scene` (botón + selector **View**) **envuelve** y no desborda; los diálogos siguen centrados y con el foco atrapado
- **Riesgo nuevo de M3:** **[V]** `conn-scene` usa `flex-wrap: wrap`, pero **no se probó a 390 px**
- **Severidad:** media · **Veredicto:** **apto para M3** — probable ajuste de CSS

---

## Bloque 15 · Accesibilidad y teclado

### A-43 · Recorrido completo por teclado

- **Origen:** las tres ramas
- **Pasos:** llegar a **Metallic joints** sin mouse; recorrer la lista de nudos; llenar el diseño; activar **Frame the joint**; cambiar el selector **View**; abrir y cerrar los diálogos
- **Esperado:** todo alcanzable con Tab/Enter/flechas; foco visible; los diálogos atrapan y devuelven el foco
- **[V]** el `<select>` de **View** es un control nativo → teclado gratis; el botón de encuadre es un `<button>` real
- **[H]** la fila del catálogo inline retirado era `<tr onclick>` **sin tab stop, sin Enter y sin rol** — el modal existe justamente para eso
- **Severidad:** **alta** · **Veredicto:** M3 por cada control inalcanzable

### A-44 · Contraste WCAG AA

- **Origen:** M1 #156 · **[H]** cinco fallos medidos: tres de hormigón (corregidos por H1) y dos del panel de uniones (`--st-accent` y `--st-ok` a 3,55 y 3,75)
- **[H] Corregido después de revisión:** esos dos **nunca estaban en pantalla** — `.conn-ratio-badge` no se aplicaba desde `b71432cd`, así que las reglas se **removieron** en lugar de repintarse
- **Nuevo de M3:** **[V]** `conn-scene-empty` usa `--st-surface-2` con borde `--st-hair-strong` y texto `--st-text-2` — **no medido**
- **Severidad:** media · **Veredicto:** **apto para M3** — medir los estilos nuevos

---

## Bloque 16 · Rendimiento

### A-45 · El visor de uniones

- **Origen:** M3 #183 · **[M]** medido
- **Números:** chapa **24 → 1836** vértices; unión **408 → 2532** (×6,2); mallas **7 → 13**; reconstrucción **0,280 ms**; grupo de 24 bulones **0,918 ms**, 49 mallas, 10 020 vértices
- **Contexto:** **[M]** la nave dibuja **102 000 triángulos y 138 draw calls** por frame → la unión es ~1 % de los triángulos y ~9 % de los draw calls, con **una** sola unión seleccionada
- **[M]** la reconstrucción corre en el `$effect` de selección, **no** en el bucle de frame: 0,28 ms contra 16,7 ms de presupuesto a 60 fps
- **Reglas de nodos:** `setDrawn` **0,02 µs**; `suppress` **0,79 µs** sobre 300 nudos; pasada de `upsert` de 300 nudos indistinguible con y sin supresión (0,021 vs 0,011 ms — **ruido de JIT, no una mejora**)
- **Pasos de QA:** con la nave cargada, cambiar de unión 20 veces seguidas y alternar el modo; medir con el HUD (**Shift+P**)
- **Severidad:** media · **Veredicto:** aceptado con números

### A-46 · Modelos grandes

- **Pasos:** `la-bombonera` y `xl-diagrid-tower`; entrar al visor de uniones; cambiar de modo
- **[H] Riesgo conocido:** los specs `@perf` **expiran bajo contención de CPU** y pasan 4/4 aislados; el CI **nunca** corre `@perf`
- **Severidad:** media · **Veredicto:** limitación aceptada, documentada

---

## Bloque 17 · Documentos, láminas, planillas y exportaciones

### A-47 · No hay exportación metálica — y no debe aparentarla

- **Origen:** ninguna rama la agregó · **[V] verificado en esta sesión**
- **[V]** `grep jointDesign|designedNodeIds src/lib/export/ ProReportDialog.svelte` → **vacío**: **ningún documento tabula uniones**
- **[V]** `steelCountsAsVerified()` sigue devolviendo el literal `false`
- **Ruta:** `⟨PRO⟩` → **Project** → Exportar (Excel, CSV, PNG); cinta **ANALYSE** → *Output* → **Report**
- **Pasos:** exportar los tres; generar un Reporte; buscar contenido metálico
- **Esperado:** salen modelo y resultados como siempre; **no hay verificación metálica, ni estado de unión, ni mapa de cláusulas en ninguna exportación**, y **ninguna presenta un miembro metálico como verificado**
- **Riesgo:** **[V]** la etapa **Documents** del workflow describe lo que un documento **llevará** — futuro. Que no se lea como que **ya existe** es el QA de este ítem (`steel-stage-documents-body`)
- **Severidad:** **crítica** si algo aparenta verificación metálica
- **Veredicto:** limitación aceptada (fuera de alcance) + **corrección en M3** si algo la aparenta

---

## Bloque 18 · Trazabilidad y registros

### A-48 · Procedencia por sección, no por registro

- **Origen:** M1 (contratos) + M2 (superficies) · **[V]** `profileFamily` · `composition` · `built` · `gradeId`
- **Pasos:** para cada sección del modelo preguntarse «¿de dónde salió?» y buscar la respuesta
- **Esperado:** las tres formas tienen respuesta — catálogo → `profileFamily`; armado → `composition`; paramétrica → `built` con plantilla y parámetros
- **[V] Y no hay registros retroactivos:** el modelo guarda **qué es** cada sección, no un historial de por qué ruta entró. Un proyecto anterior **no dice** la procedencia y **no se le rellena** con el nombre ni con un `composition` falso
- **Severidad:** media · **Veredicto:** limitación aceptada

---

# B · QA recomendado

| # | Qué | Por qué no es obligatorio |
|---|---|---|
| B-01 | Recorrer los 8 diagramas y 2 mapas con acero en el modelo | superficie preexistente; las ramas no la cambiaron |
| B-02 | Los otros generadores (celosía plana, columna reticulada) fuera de la nave | menos usados que la nave |
| B-03 | Vista previa de sección (`section-preview`, `cf-preview`) contra la ficha | cosmético si difiere, salvo que contradiga los números |
| B-04 | Timeline / revisiones de autosave con uniones diseñadas | `jointDesigns` viaja por `snapshot()`, ya cubierto en A-38 |
| B-05 | `solid` con la unión encuadrada | la regla B ya quita el marcador de la unión; `solid` no es el modo de inspección |
| B-06 | Los 13 idiomas restantes | **[V]** `t()` cae a inglés; sólo es/en/pt están mantenidos |
| B-07 | Reporte PDF con un modelo metálico | no hay contenido metálico que verificar (A-47) |
| B-08 | Prueba de longitud de URL con muchas uniones | **[M]** medido: 19,6 caracteres por unión, 20 uniones bajo `MAX_URL_SAFE` |

---

# C · Hallazgos bloqueantes

**Ninguno abierto al cierre de este inventario.**

Los tres que hubo durante el trabajo se cerraron y quedan como registro:

| # | Qué era | Cómo se cerró |
|---|---|---|
| C-01 | **La chapa se dibujaba alineada a los ejes globales**, con 4 de 6 bulones fuera en la nave. Geometría que no corresponde al diseño | **corregido en M3** (`joint-meshes.ts` + marco exportado); test que fija la **forma** del defecto (`expect(outside).toBe(4)`) |
| C-02 | **Clicquear la chapa borraba la unión** — el clic caía en «limpiar selección» y las mallas existen sólo para el nudo seleccionado | **corregido en M3** (picking sobre `jointsParent`) |
| C-03 | **Afirmación falsa mía** en la descripción de #156 y en el addendum: un diagnóstico del flake del walkthrough que era incorrecto | **retirado** en ambos lugares, reemplazado por «acotado, no diagnosticado» |

**Criterio aplicado:** bloqueante = error de corrección, pérdida de datos, afirmación falsa o
ruptura del flujo principal. Los ítems de UX y deuda **no** califican, por severos que se vean.

---

# D · Hallazgos aptos para M3 (no bloquean)

| # | Hallazgo | Verificación | Por qué no bloquea |
|---|---|---|---|
| D-01 | **A-01 del inventario de M2** — el builder inline se retiró y la propuesta escrita decía no tocarlo. Decisión de producto **pendiente** | **[H]** `a-01-decision.md` | no es error, ni pérdida, ni afirmación falsa. **Pero el costo de revertir crece después del merge** |
| D-02 | **`conn-scene` no se probó a 390 px** | **[V]** usa `flex-wrap` | ajuste de CSS |
| D-03 | **Contraste de los estilos nuevos de M3 no medido** (`conn-scene-empty`) | **[V]** | medición pendiente, no defecto conocido |
| D-04 | **Un link con uniones corruptas abre vacío sin decir por qué** por la ruta `#data=` | **[V]** `loadFromURLHash` devuelve `null` | es el silencio que ya tiene cualquier link corrupto |
| D-05 | **La versión del contenedor de URL es la misma constante del `.ded`** — un bump por `.ded` dejaría todo link ya compartido **entero inabrible** | **[V]** `joint-share.ts:333` | inalcanzable hoy con una sola versión en circulación: trampa para el próximo cambio |
| D-06 | **La regla B es por nudo seleccionado, no por oclusión** — un marcador vecino podría tapar parcialmente | **[V]** | no ocurre en la nave a distancia de encuadre |
| D-07 | **El marco de la chapa sale de la primera barra** del nudo | **[V]** `Viewport3D` toma `joint.elementIds[0]` | para un nudo de 5 barras es una **elección**, no una derivación. Cambiarla es decisión de producto |
| D-08 | **Los cuatro campos de sección del share codec** (`composition`, `profileFamily`, `tl`, `built`) | **[V]** | preexistente, de hormigón y acero por igual — ver E-01 |
| D-09 | **Huecos de CI**: sin job de `typecheck` ni `svelte-check`, sin `concurrency`, `e2e` corre sólo `--grep @smoke` | **[H]** | de quien sea dueño de `ci.yml`. **Consecuencia medida:** un spec roto de origen nunca corrió en un PR |
| D-10 | **CSS muerto invisible en 30 de 169 componentes** — `css-prune` deja de podar cuando hay una clase que no puede leer estáticamente | **[H]** | hallable sólo por censo manual |
| D-11 | **`notVerifiable` del grupo de bulones no es alcanzable** desde la UI | **[V] re-verificado**, ver **F.2** | el estado existe y es correcto; falta el control |

---

# E · Limitaciones aceptadas

| # | Limitación | Verificación | Dónde está escrita |
|---|---|---|---|
| E-01 | **El share codec pierde `composition`, `profileFamily`, `tl` y `built`.** El análisis viaja bien (área e inercias); se degrada la **procedencia** y el **dibujo** | **[V]** | `share-codec-fields.md` §1–§6; `built-section-contract.test.ts` **afirma la pérdida** |
| E-02 | **No hay exportación ni verificación metálica.** `steelCountsAsVerified()` = literal `false` | **[V]** | A-47; I-09 del inventario de M2 |
| E-03 | **La chapa de presilla es `GEOMETRY_UNAVAILABLE`** porque §E.6 no da dimensiones | **[V]** | A-29 |
| E-04 | **Aviso de ejes no principales** en C/Z: el modelo no rota a ejes principales | **[V]** `cf-axes-notice` | `nonprincipal-axes-warning-proposal.md` |
| E-05 | **Las bases reticuladas articuladas no tienen restricción fuera del plano**, y lo declaran | **[V]** | `generator.assume.latticeBasesPinnedNoOutOfPlane` |
| E-06 | **La cabeza del bulón es convención de dibujo**, no dimensión de fabricación | **[V]** una constante, nada calcula con ella | A-33 |
| E-07 | **`exceeded` no cambia de color.** La misma geometría se dibuja igual pase o falle | **[V]** | el vocabulario de veredicto es del panel — decisión 2 de M2 |
| E-08 | **La detección de nudos es geométrica**: no distingue viga-columna de empalme ni lee liberaciones | **[V]** | A-23, dicho en el panel |
| E-09 | **Sin registros retroactivos de procedencia** | **[V]** | A-48 |
| E-10 | **Una unión obsoleta se excluye de `designedNodeIds`**, así que ningún documento la tabula | **[V]** | A-39 |
| E-11 | **El test de la nave sin arriostrar tarda 2,89 s** contra el timeout de 5 s. No hay nada que partir | **[M]** | A-14 |
| E-12 | **Los `@perf` expiran bajo contención** y pasan aislados; el CI nunca los corre | **[H]/[M]** | A-46 |
| E-13 | **Una baseline darwin es 1 px más ancha** (697 vs 696) | **[H]** | arreglarla es actualizar un snapshot |
| E-14 | **Sólo es/en/pt están mantenidos**; los otros 13 caen a inglés | **[V]** | B-06 |

---

# F · Existe en código, sin recorrido de usuario

**Las dos entradas de esta sección se re-verificaron contra el código en esta sesión**, porque venían
de un handoff y son exactamente el tipo de afirmación que envejece mal.

## F.1 · `SectionShapeBuilder.svelte` — un componente entero sin montar

- **[V] Verificación:** el archivo existe en `src/components/SectionShapeBuilder.svelte`. `grep -rn "<SectionShapeBuilder"` sobre `src` devuelve **cero**. Las 14 referencias al nombre son **13 archivos de i18n** (claves de traducción huérfanas) y **un comentario** en `lib/utils/section-drawing.ts`
- **Conclusión:** **nunca se monta.** La capacidad no se perdió — la tiene el modal de secciones
- **Naturaleza:** deuda de limpieza **con una decisión de producto adentro** (**[H]** `m1-section-shape-builder.md`)
- **Veredicto:** **apto para M3** — decidir si se borra el componente y sus claves, o si se monta

## F.2 · `notVerifiable` del grupo de bulones: el estado existe y ningún control lo alcanza

- **[V] Verificación, en tres pasos:**
  1. `bolted-joint.ts:357` — `notVerifiable` requiere una de tres claves: `bolted.missing.fnvNotTabulated`, `bolt.hole.notTabulated`, `bolt.minEdge.notTabulated`
  2. `ProConnectionsTab.svelte:186` — el bloque *Joint design* escribe **`threads: 'included'` como literal fijo** y **no expone control de roscas**. (El checkbox `conn.threadsInShear` de la línea 1300 pertenece al **otro** verificador de bulones, preexistente, no a los `jd-*`)
  3. `ProConnectionsTab.svelte:669` — `jd-diameter` sólo ofrece `TABULATED_DIAMETERS_MM`, con un comentario que dice que ofrecer otro daría un bulón cuya distancia al borde no se puede verificar
- **Conclusión:** `fnvNotTabulated` necesita roscas **excluidas** (inalcanzable: literal fijo) y las otras dos necesitan un diámetro **no tabulado** (inalcanzable: select restringido). **Por lo tanto `notVerifiable` del grupo de bulones no se puede producir desde la UI**
- **Matiz que importa:** **[V]** la **soldadura sí** alcanza `notVerifiable` (metal base §J.4, `joint-weld-j4`), así que el estado no es letra muerta en todo el panel — sólo en los bulones
- **Veredicto:** **apto para M3**. El estado es correcto y la restricción del diámetro también; lo que falta es decidir si el control de roscas se expone

## F.3 · Otros candidatos, **no** verificados en esta pasada

- **[H]** el inventario de M2 declaraba **6 capacidades sin superficie** y **6 funciones «todavía no accesibles desde la UI»**. En esta sesión se verificaron F.1 y F.2; **las demás no se re-verificaron** y quedan como pista
- **Veredicto:** **QA recomendado** — completar el censo antes de aceptar M3 si se quiere el número exacto

---

# G · Checklist resumido para ejecutar a mano

Preparación, una vez:

```
[ ] 4005 arriba y sirviendo M3     curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4005/
[ ] 4004 intacto sirviendo M1+M2   curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4004/
[ ] abrir  http://127.0.0.1:4005/app/pro?e2e=1
[ ] cargar 3d-nave-industrial  →  ANALYSE → Solve
```

Recorrido corto (**bloqueantes primero**, ~30 min):

```
[ ] G-01  DESIGN → Metallic joints → la lista trae 226 filas y cada una nombra su nudo
[ ] G-02  elegir N51 → demandas con combinación y barra (258,0 kN / 2,2 kN / 3,1 kN·m)
[ ] G-03  llenar 6 / 2 / 12 / 400 → estado «designed», NUNCA «verified»
[ ] G-04  Frame the joint → chapa 190×130×12 con 6 agujeros ⌀22 y 6 bulones ⌀20 DENTRO
[ ] G-05  NO hay esfera roja tapando la chapa
[ ] G-06  View → Extruded sections → NINGÚN marcador de nudo; la unión sigue dibujada
[ ] G-07  con marcadores ocultos, clicquear la unión → SIGUE seleccionada
[ ] G-08  View → Simple wireframe / Solid → los marcadores VUELVEN
[ ] G-09  paso = 10 → estado «exceeded» y la geometría SIGUE dibujada
[ ] G-10  borrar el espesor → nada dibujado + el panel NOMBRA «espesor» (no una clave cruda)
[ ] G-11  elegir otra fila sin diseñar → escena vacía y explicada
[ ] G-12  el banner experimental dice que NO es una verificación
```

Recorrido medio (~2 h):

```
[ ] G-13  MODEL → Sections → Agregar sección: UN solo control de alta, y abre el diálogo
[ ] G-14  diálogo: Enter abre, Tab cicla en ambos sentidos, Escape cierra y DEVUELVE el foco
[ ] G-15  catálogo: filtros de organismo/código/altura; el contador acompaña; vacío explicado
[ ] G-16  ficha del perfil: cada número declara su base; los sin respaldo se REFUSAN
[ ] G-17  fijar 2–3 perfiles y cambiar el filtro → los fijados sobreviven
[ ] G-18  división construcción: crear, aplicar, REABRIR y ver los parámetros de vuelta
[ ] G-19  MODEL → Materials → Agregar material: UN solo control; probar ν=3 y ρ=−78,5 → rechazo
[ ] G-20  probar coma decimal 0,3 en ν → se lee como 0,3
[ ] G-21  panel de grados: bandas de espesor CON el código que las publica; «no es una verificación»
[ ] G-22  Profile design: las 8 etapas; verificación NUNCA en «done»; bloqueos nombrados
[ ] G-23  C/Z: designación fuera de alcance → rechazo con motivo; aviso de ejes no principales
[ ] G-24  presillas: estaciones sí, chapa GEOMETRY_UNAVAILABLE con motivo
[ ] G-25  soldadura: metal base «notVerifiable» remitiendo a §J.4
[ ] G-26  mover el nudo de una unión diseñada → obsoleta con razón «nodeMoved» + dos remedios
[ ] G-27  borrar el nudo → «nodeMissing»;  cambiar barras → «topologyChanged»
[ ] G-28  guardar .ded, abrir: las elecciones vuelven; el archivo NO tiene capacityKN ni checks
[ ] G-29  compartir link y abrirlo: uniones vuelven; abrirlo sobre OTRO modelo → obsoletas
[ ] G-30  Project → Exportar (Excel/CSV/PNG) y Report: NADA metálico presentado como verificado
```

Recorrido largo (~4 h):

```
[ ] G-31  todo el recorrido metálico en es, en y pt → cero claves crudas
[ ] G-32  los cinco anchos: 390×780, 390×844, 800×720, 1280×720, 1280×800
[ ] G-33  recorrido completo por teclado, sin mouse, incluido el selector View
[ ] G-34  cámara ortográfica: Frame the joint encuadra encogiendo el frustum
[ ] G-35  la-bombonera / xl-diagrid-tower: entrar al visor y cambiar de modo (HUD con Shift+P)
[ ] G-36  cambiar de unión 20 veces seguidas → sin fuga de mallas (jointMeshCount() estable)
[ ] G-37  generadores: parámetros inválidos listados con su campo; asunciones que se retiran
[ ] G-38  nave sin arriostrar: carga longitudinal da un número absurdo (mecanismo) — esperado
```

---

# H · Cómo incorporar los hallazgos futuros en M3

**Esta sección es la que hay que leer antes de tocar código después del QA.**

## H.1 · Reglas duras

1. **M3 es la única rama que recibe cambios.** `feat/pro-steel-m1` (`b5d0cf49`) y
   `feat/pro-steel-m2` (`14c10a2e`) están **congeladas**: nada de commits, nada de merges hacia
   ellas, ni siquiera documentación.
2. **Si el defecto es de M1 o M2, se corrige igual en M3.** La pila es M1 → M2 → M3, así que un
   arreglo en M3 llega al producto por el mismo camino. En el commit hay que **decir de qué rama es
   el defecto**, para que la revisión sepa qué está mirando.
3. **Nunca:** solver, Rust, Cargo, WASM. Ni actualizar snapshots ni inflar timeouts para silenciar
   una falla.
4. **`JointDesign` sigue siendo la fuente única.** Cualquier arreglo que necesite un dato nuevo lo
   agrega **a la capa de diseño o al layout**, no a un modelo visual paralelo.
5. **Servidores:** M3 en **4005**, M1+M2 en **4004**. El 4004 no se toca ni para reiniciarlo.

## H.2 · Orden de trabajo por clase de hallazgo

| Clase | Qué hacer |
|---|---|
| **Bloqueante** (error, pérdida, afirmación falsa, flujo roto) | corregir **antes** de aceptar M3, con test de regresión que fije la **forma** del defecto, no sólo el síntoma |
| **Apto para M3** | agregar al PR #183 con su propio commit; si es una decisión de producto (D-01, D-07, F.1, F.2), **documentarla y no implementarla** hasta que esté decidida |
| **Limitación aceptada** | **no tocar el código**; verificar que esté escrita donde un usuario o revisor la encuentre |
| **Sin recorrido de usuario** (F) | decisión de producto primero. Montar una capacidad es alcance nuevo, no un arreglo |

## H.3 · Qué debe traer cada corrección

- **el id de este inventario** (`A-27`, `D-05`, …) en el mensaje del commit;
- **de qué PR es el defecto** (#156 / #164 / #183);
- **un test que falle antes y pase después** — unitario si es de la capa pura, E2E si sólo se ve en
  el flujo. La lección de este bloque: el spec nuevo pasaba 9/9 mientras **cuatro tests existentes
  estaban rojos**, y sólo la suite completa lo vio;
- **la medición**, si el hallazgo era de rendimiento o de geometría;
- si se toca un contrato existente, **afirmar el contrato y no el conteo** — la regresión de este
  bloque fue exactamente eso: `jointMeshes() === 7` era una consecuencia del contrato, no el
  contrato, y se rompió al agregar la cabeza del bulón.

## H.4 · Compuertas antes de cada push a M3

```
npm run typecheck          # 473 = baseline, cero nuevos
npm run check:gate         # limpio en las rutas guardadas
npm run test:unit          # 8133+ y CERO fallas
npm run test:build         # 19
npm run build              # OK
npx vitest run --project unit src/lib/i18n/__tests__/    # 12/12
E2E_PORT=<propio> npm run test:e2e                        # suite COMPLETA, no sólo el spec nuevo
```

**El último es el que no se puede saltear.** Es el único que detecta que un cambio correcto rompió
el contrato que otro test expresaba.

## H.5 · Lo que este inventario deliberadamente no hizo

- **No corrigió nada.** Ni siquiera D-02 (el CSS a 390 px), que es de un renglón.
- **No re-verificó todo lo heredado.** Lo marcado **[H]** es pista, no hecho. Si una decisión
  depende de un **[H]**, verificarlo primero.
- **No completó el censo de F.3.** Se verificaron dos candidatos y se confirmaron los dos; el resto
  del número heredado sigue sin comprobar.
