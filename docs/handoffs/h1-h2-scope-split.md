# Ampliación del flujo PRO de hormigón — arquitectura, fases y reparto H1 / H2

**Estado: auditoría y plan. Ningún componente modificado por este documento.**

Responde a las tres preguntas que el alcance nuevo plantea antes de escribir código: *cómo se
relacionan hoy las superficies*, *en qué orden pueden cambiarse sin romperse entre sí*, y *qué
queda en H1 y qué en H2*.

---

## 1. La arquitectura actual, medida

### 1.1 Tres vocabularios de etapa, incompatibles entre sí

Es el defecto que §1 del alcance nombra como *"numeraciones incompatibles"*, y es peor que una
numeración: son tres listas distintas de **conceptos**.

| dónde | cuántas | cuáles |
|---|---:|---|
| `WorkflowStages.svelte` — la franja que se ve | 6 | `model` · `demands` · `check` · `design` · `detailing` · `documents` |
| `ProRcWorkflowTab.svelte` — los `<details>` que existen | 5 | overview · code-settings · floor-families · detailing · documents |
| `onGoTo(...)` — lo que la franja puede pedir | 5 | `model` · `design` · **`floors`** · `detailing` · `documents` |

Las tres se contradicen. `demands` y `check` se dibujan como etapas y **no tienen destino**;
`floors` es un destino que **no tiene etapa**; y `model` y `design` caen los dos en el mismo
`scrollTo('design-toolbar')`, así que dos etapas distintas de la franja llevan al mismo lugar.

La navegación, además, es `scrollIntoView({ block: 'nearest' })` sobre un `data-testid`: no hay
etapa activa, no hay estado, no hay forma de preguntar "¿en qué etapa estoy?".

### 1.2 La franja no es fija

La columna del tab es `overflow-y: auto` (`ProRcWorkflowTab.svelte:255`) y la franja vive dentro
de ella. Scrollea con el contenido y desaparece. No hay `position: sticky` en el archivo.

### 1.3 `WorkflowStages` y `StageSection` son superficie compartida con la rama metálica

```
WorkflowStages ← ProRibbon.svelte (metálico)   + ProRcWorkflowTab.svelte (hormigón)
StageSection   ← ProConnectionsTab.svelte (metálico) + ProjectRegulationsPanel + ProRcWorkflowTab
```

H1 tiene **0 commits** contra los dos. Es la razón por la que el chevron colgado y el contraste
de `.mark` siguen abiertos en `h1-shared-chrome-proposal.md`, y por la que el QA manual pide
explícitamente **no** reportarlos.

### 1.4 El canal de selección existe, y la etapa Detalle está fuera de él

`lib/store/rebar-workspace.svelte.ts` mantiene **un solo** `selection: WorkspaceSelection | null`,
y el archivo se explica a sí mismo en los términos exactos del alcance §3:

> *"Carried on the selection rather than in a channel of its own so that 'what is selected' has
> exactly one answer. A second selection channel is how a panel comes to highlight one thing
> while the viewport highlights another."*

Sus consumidores son ocho, y **los ocho son del overlay 3-D**: `RebarWorkspace`,
`RebarScenePanel`, `RebarStatusPanel`, `RebarLayersPanel`, `SelectionDetails`,
`ConflictInspector`, `DesignFamilyPanel`, `App`.

`DetailingWorkflow.svelte` y `ProRcWorkflowTab.svelte` lo referencian **cero veces**.

**Conclusión operativa:** la sincronía bidireccional que pide §3 no necesita un mecanismo nuevo.
Necesita que el canal que ya existe deje de estar confinado al overlay. Inventar un segundo canal
para la lista de la etapa produciría exactamente la patología que el store documenta.

### 1.5 Qué produce el solver, y qué no (§5)

Verificado en `engine/types-3d.ts` y `engine/station-design-forces.ts`:

| pedido en §5 | existe | dónde |
|---|---|---|
| reacciones | ✅ | `AnalysisResults3D.reactions` |
| esfuerzos en barras | ✅ | `AnalysisResults3D.elementForces` |
| por estación, con signo | ✅ | `StationForces { t, x, n, vy, vz, my, mz, torsion }` |
| desplazamientos | ✅ | `AnalysisResults3D.displacements` |
| tensiones de placa/quad | ✅ | `plateStresses`, `quadStresses` |
| **estaciones fijas a 0/25/50/75/100 %** | ✅ **sí, siempre** | ver abajo |

**Corregido al implementar F0.5.** La primera lectura de esta auditoría decía que los cinco puntos
eran "alcanzables interpolando". Es mejor: `buildCriticalStations` **siembra 0, 0.25, 0.5, 0.75 y
1 incondicionalmente** (líneas 224-228) antes de agregar posiciones de carga y extremos. En un
elemento normal el default no pide nada que el motor no haya calculado ya.

Hay **un** caso donde no vale, y es la razón de que el default se defina como *evaluación* y no
como *filtro*: un elemento de longitud efectivamente nula cortocircuita a `[0, 1]` (línea 231).
Filtrar devolvería dos filas donde el usuario pidió cinco, en silencio. `extractForcesAtStation`
evalúa el diagrama en cualquier `t`, así que evaluar es correcto en los dos regímenes e idéntico
a filtrar donde filtrar habría funcionado.

Las dos modalidades conviven: `stations` sigue la convención elegida y `rawStations` es una hoja
aparte con todo lo que el motor calculó. Elegir la convención de cuartos **nunca** puede ser lo
que oculte las estaciones críticas.

**Ninguna magnitud de §5 hay que inventarla.** Todas salen del solver.

### 1.6 El presupuesto de líneas ya está agotado donde el alcance golpea

| archivo | LOC | techo | quién lo toca en el alcance |
|---|---:|---:|---|
| `lib/store/detailing.svelte.ts` | **1566** | 800 | §3, §4 (`ExportRecord`) |
| `components/pro/ProPanel.svelte` | **1316** | 600 | §5 (`pro.reportBtn`, `openReport`) — y es **compartido** |
| `DetailingWorkflow.svelte` | 469 | 600 | §3 |
| `DocumentsSection.svelte` | 453 | 600 | §4 |
| `ProRcWorkflowTab.svelte` | 305 | 600 | §1, §2 |
| `WorkflowStages.svelte` | 246 | 600 | §1 — **compartido** |
| `rebar-workspace.svelte.ts` | 342 | 800 | §3, §6 |

Los dos archivos sin margen son justamente los dos que §4 y §5 necesitan. Eso no es un detalle de
estilo: `rc-design-gates.test.ts` es una gate roja, y ya frenó a H1 dos veces por comentarios.

---

## 2. Las dos decisiones de arquitectura que el resto presupone

### 2.1 La franja de hormigón deja de ser la franja compartida

**Decisión: `ProRcWorkflowTab` monta un `RcStageTimeline.svelte` nuevo, propio de hormigón.
`WorkflowStages.svelte` queda intacto y `ProRibbon` (metálico) lo sigue usando.**

No es una maniobra para esquivar el archivo compartido. Es que **los dos flujos tienen etapas
distintas**: el alcance pide cinco etapas de hormigón (Modelado · Reglamentos · Diseñar · Detalle ·
Documentos) y el flujo metálico tiene las suyas. Obligar a un componente a servir a los dos es
precisamente lo que produjo el desajuste 6-contra-5 de §1.1.

Lo que se paga: la cromática de la franja queda escrita dos veces. Es aceptable y es acotado —son
tokens `--st-*` y un `ol` horizontal—, y a cambio **cero riesgo para M1**: el alcance completo de
§1 puede ejecutarse sin un solo commit sobre archivos que la rama metálica renderiza.

Los tres arreglos pendientes de `h1-shared-chrome-proposal.md` **siguen pendientes** y siguen
siendo de quien integre las dos ramas. Este documento no los cierra.

`StageSection` **sí** se sigue usando compartido: es un `<details>` con encabezado, no tiene
vocabulario de etapas, y no hay motivo para duplicarlo.

### 2.2 El canal de selección sube de alcance, no se duplica

**Decisión: `rebarWorkspace.selection` pasa a ser el canal único del flujo de hormigón —
overlay 3-D *y* etapa Detalle— sin crear un segundo estado.**

Es lo que hace posible el requisito duro de §3 (*"no puede haber dos representaciones
independientes de un mismo elemento"*) sin inventar sincronización: seleccionar en la lista **es**
seleccionar en el visor, porque es el mismo `$state`.

Consecuencia que hay que aceptar de antemano: el store deja de ser "estado del overlay" y pasa a
ser "estado de la selección de hormigón". Su `reset()` —que hoy se dispara al cambiar el
documento— pasa a afectar también a la lista. Es correcto: si el documento cambió, la selección
vieja ya no apunta a nada.

---

## 3. Las fases, y por qué ese orden

Cada fase termina con la auditoría obligatoria de §8 (tres idiomas, 1280×720 y 1024×700, teclado,
foco, nombres accesibles, estados vacíos, desborde, tokens, y re-auditoría de lo declarado
cerrado). **No es una fase final**: es la condición de cierre de cada una.

```
F0 ─┬─> F1 ─┬─> F2
    │       ├─> F3a ─┬─> F3b
    │       │        ├─> F3c
    │       │        └─> F3d
    │       └─> F4
    ├─────────────> F5        (independiente, salvo el botón)
    ├─────────────> F6
    └─────────────> F7        (instrumentación primero)
```

### F0 — Contratos, sin una sola pantalla nueva ✅

**Cerrada.** Seis commits, cero cambio visible, y una decisión que apareció al implementar:
`manualOverrides` y `ExportRecord` se persisten como campos **opcionales** del snapshot, pero
`restore()` **no los lee**. Es la única forma de que undo no deshaga una exportación: la entrada
de undo se apiló *antes* de que el archivo saliera, así que restaurarla borraría el registro de
algo que realmente pasó. Se adoptan una vez por proyecto, al abrir un `.ded` y al activar una
pestaña.

Y la procedencia de retoque manual pasó de un booleano a **cuatro estados**, porque tres de ellos
no son "ninguno": conocido-con-elementos, conocido-y-vacío (una afirmación real), desconocido
(archivo viejo) y no-aplica (nada diseñado).


Lo que §-todo presupone y hoy no existe. Nada visible cambia; todo lo demás depende de esto.

1. **Vocabulario único de etapas**: un módulo con las cinco etapas de hormigón, su id, su título,
   su `<details>`, y **el estado de la etapa** (pendiente / disponible / hecha / bloqueada). Hoy no
   hay estado de etapa en ningún lado — es lo que impide que la franja marque la activa.
2. **Elevar `rebarWorkspace.selection`** a canal del flujo (§2.2), sin consumidor nuevo todavía.
3. **`ExportRecord`** tal como está especificado en `h1-export-coverage-and-contract.md` §5–§6:
   estado separado, sin migración, **sin registro retroactivo**.
4. **Presupuesto de LOC**: extraer de `detailing.svelte.ts` (1566) antes de agregarle `ExportRecord`.

**Criterio de cierre:** la suite entera sigue verde y la UI es idéntica pixel a pixel. Una fase de
contratos que cambia algo en pantalla es una fase que se pasó de alcance.

### F1 — La franja y la semántica de las etapas (§1) ✅

**Cerrada.** `RcStageTimeline` propio, sticky, cinco etapas numeradas 1–5, y las secciones de
abajo renumeradas para coincidir — venían 0, 1, 4, 5, 6 para cinco cosas.

Tres cosas que aparecieron al implementar y no estaban en el plan:

- **Una sola derivación de estado.** El tab derivaba cinco estados de sección por su cuenta y la
  franja derivaba los suyos. Ahora `rcStages()` se calcula una vez en el tab y alimenta a las dos.
- **La sección *Familias de piso* conserva su propio estado `opcional`**, que **no** es el de la
  etapa Diseñar. Son sujetos distintos: Diseñar es una etapa requerida, el paso de pisos es un
  paso opcional adentro. Enchufarle el estado de la etapa la hacía decir "en espera" de un paso
  que nadie tiene que dar.
- **El chevron colgado queda cerrado para hormigón.** El `test.fail()` de `h1b-panel-navigation`
  documentaba que `WorkflowStages` envuelve en dos filas dejando `stage-documents` solo abajo.
  La franja nueva no envuelve. `WorkflowStages` sigue **intacta** y el flujo metálico sigue
  envolviendo: eso sigue siendo de integración.

**Hueco conocido, anotado y no disimulado:** la etapa Diseñar apunta a `floor-families-disclosure`
porque es el único `<details>` que tiene; vigas y columnas se diseñan en `ProDesignTab`, abajo.
**F2 funde las dos**, que es exactamente lo que pide §2.


`RcStageTimeline` nuevo (§2.1): baja, ancho completo, **sticky**, etapa activa evidente, ligada a
su `<details>`, y el título de la sección abierta visible debajo. Cinco etapas, un vocabulario.

Incluye lo que §1 pide de contenido y no es cosmético:
- **Modelado** explica los estados de preparación del modelo;
- **Reglamentos** deja de sugerir que "Verificar" calcula solicitaciones, y separa las tres cosas
  que hoy se confunden: *solicitaciones* · *elección de reglamento* · *verificación de armaduras*.
  Ninguna copia puede implicar armadura verificada antes de diseñar.

### F2 — Etapa Diseñar (§2)

Fuera "Familias a diseñar" como explicación y su duplicación. Selección directa de vigas ·
columnas · losas · tabiques · fundaciones, con vigas y columnas por defecto y el resto sólo si
existen en el modelo. **Un** comando, alcance visible antes de ejecutar, y distinción explícita
entre diseñar / regenerar detallado / revisar / exportar.

Restricción heredada y vigente: **ningún progreso, cancelación ni estado que el store no soporte**.
Es la misma regla que produjo el guion en vez del cero en las familias de pisos.

### F3 — Etapa Detalle (§3) — la fase grande, en cuatro

- **F3a · Grupos y sincronía.** Lineales / superficiales / Fundaciones. Cada grupo lista sus
  elementos con estado legible; seleccionar **selecciona en el modelo y en el visor** por el canal
  de F0. Es la fase que cierra el requisito de "una sola representación".
- **F3b · Conflictos.** Elemento · tipo · qué significa · por qué importa · valor actual ·
  propuesta · acción recomendada · estado tras fijar o liberar. Fijar/Liberar con UI de Stabileo y
  estados accesibles. Hoy `ConflictInspector` ya nombra las dos barras y mide separación contra
  requerida: es base, no punto de partida en cero.
- **F3c · Armado 2D/3D.** Contorno de hormigón, recubrimientos, longitudinal, estribos,
  separaciones, zonas críticas. Edición con actualización retroactiva.
- **F3d · Entrega.** Carátula compacta y configurable; y la **columna de forma de la planilla de
  doblado como diagrama de barras visual**, no como texto.

### F4 — Documentos (§4)

La diferencia conceptual con Detalle, escrita en la pantalla. Selección de qué documentar. Planos
de detalle (PDF/CAD/preview), planos de doblado (Excel/PDF/CAD/preview), listado (Excel), y la
arquitectura preparada para reportes de esfuerzos sin implementarlos acá.

Cada exportación declara: elementos incluidos · retocados a mano · revisión · tipo · estado de
generación · limitaciones reales. Consume el `ExportRecord` de F0. **Sin registro retroactivo.**

### F5 — Reporte de esfuerzos (§5)

Reporte crudo y configurable sobre lo que el solver **sí** produce (§1.5): reacciones, esfuerzos
de barra, por tramo en las estaciones elegidas, solicitaciones características. Selección por tipo
de elemento, solapas separadas en Excel, PDF con LaTeX, columnas y magnitudes configurables.

**No mezcla resultados crudos con diseño de armaduras.** Son dos documentos.

Bloqueo propio: el botón y `openReport` viven en `ProPanel.svelte`, 1316 LOC y compartido. Hay que
extraer antes de tocar. El arreglo de contraste del botón entra acá, con la extracción.

### F6 — Visor 3-D (§6)

Avisos compactos de provisional y torsión, con cierre y estado cerrado persistente en la sesión.
Panel de selección a la derecha, alineado con la app.

### F7 — Performance (§7)

**Instrumentar antes de optimizar.** Primer frame, panel listo, primera interacción, construcción
de escena, renders, canvas/contextos, bloqueo del hilo principal; modelo chico contra 7 pisos.

Hay base: `rebarSceneBuilds()` y `sceneCacheStats()` ya están expuestos en `e2e-hooks.ts`. Falta
casi todo lo demás. **Ni optimización a ciegas ni barras de progreso falsas.**

---

## 4. El reparto exacto

### Por qué el alcance no entra en PR #161

1. H1 está **detenida en modo cierre**, con el árbol limpio, la guía de QA escrita
   (`h1-manual-qa.md`) y el PR en draft esperando QA manual. Meterle ocho secciones nuevas
   invalida la guía y el QA que la acompaña.
2. El alcance nuevo **cambia contratos** —vocabulario de etapas, canal de selección,
   `ExportRecord`— y H1 se cerró explícitamente sin tocar superficie de store más allá de la
   corrección autorizada de `retireDocument()`.
3. Cinco handoffs de H1 son entregas *a la integración*, no trabajo pendiente. Reabrir la rama los
   vuelve ambiguos.

**H2 se abre por continuidad, no para esconder nada.** H1 no queda con trabajo incompleto: queda
con trabajo **cerrado y documentado**, más cinco traspasos que ya tienen dueño nombrado.

### Qué cubre cada una — juntas, el 100 %

| | **H1 — `feat/pro-concrete-h1` (PR #161, draft, CERRADA)** | **H2 — `feat/pro-concrete-h2` (draft, base H1)** |
|---|---|---|
| Tokens y cromática de estado | ✅ contrato físico + consumidores migrados | consume; no redefine |
| Estados de elemento | ✅ REFUSED visible, fallado/rechazado separados | los muestra en los grupos de F3a |
| Familias de pisos | ✅ sin ceros fabricados, madera fuera del pipeline | los reusa en F2 |
| Documentos — base | ✅ readiness, revisión, bloqueos, `doc-contents` | **§4** lo amplía sobre esa base |
| Visor 3-D — base | ✅ tipografía, rail, corte, conflictos, aislamiento | **§6** avisos y panel derecho |
| Convención C/Z | ✅ `120f15cc` + evidencia; espejo es de M1 | no lo toca |
| Fixtures y E2E | ✅ 683 tests / 61 archivos | los extiende por fase |
| **§1 franja y semántica de etapas** | — | **F1** |
| **§2 etapa Diseñar** | — | **F2** |
| **§3 etapa Detalle** | — | **F3a–F3d** |
| **§4 Documentos ampliado + `ExportRecord`** | 📄 contrato escrito, sin implementar | **F0 + F4** |
| **§5 reporte de esfuerzos** | — | **F5** |
| **§7 performance** | 📄 dos hooks existentes | **F7** |
| **§8 auditoría** | ✅ método establecido y aplicado | condición de cierre de **cada** fase |

Leyenda: ✅ hecho y verificado · 📄 documentado, no implementado · — no le corresponde.

### Lo que H2 hereda como restricción, no como sugerencia

- **No tocar** `WorkflowStages.svelte` ni `ProRibbon.svelte` (§2.1). Ni M1, ni V1, ni golden, ni
  Landing, ni Basic/Education. Ni solver, Rust, Cargo o WASM.
- **No fabricar** resultados VERIFIED, progreso, cancelación, estados que el store no soporte, ni
  un `ExportRecord` retroactivo.
- **No ocultar** conflictos ni limitaciones.
- **Sin `Co-authored-by`.**
- Techos vigentes: componentes < 600 LOC, stores < 800. Las gates son rojas.

### Lo que queda fuera de las dos, y de quién es

Ya estaba escrito antes de este alcance y sigue igual:

| | dueño |
|---|---|
| espejo C/Z en `cold-formed.ts` + cota de `lipsCollide` | M1 / integración — `cz-divergence-integration.md` |
| chevron, contraste de `.mark`, glifos de DesignOverview | integración — `h1-shared-chrome-proposal.md` |
| 1172 claves de `pt` fuera de hormigón | fuera de alcance — `i18n-coverage-gap.md` |
| los 462 sitios restantes de `--st-text-3` | propuesta medida — `h1-text-3-contrast-proposal.md` |

---

## 5. Al llegar al 100 %

Detener el desarrollo. Ningún PR nuevo. Guía de QA de H2 en el mismo formato que
`h1-manual-qa.md`, QA manual de **las dos ramas**, y los hallazgos registrados **antes** de
integrar.
