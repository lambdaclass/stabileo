# M2 — pase a QA

**Rama:** `feat/pro-steel-m2` · **PR #164, draft** · **base:** `feat/pro-steel-m1` (apilada, sin
rebase, `merge-base` en `f936f29c`).

**M2 se detiene acá.** No se abrieron áreas nuevas de uniones ni de visualización.

---

## 1. Qué probar, y qué debería ver QA

### 1.1 El workflow metálico (lo nuevo principal)

**Cómo llegar:** PRO → cinta, etapa **Diseño** → comando **Acero**.

Ocho etapas. Las dos que abren solas son las que tienen contenido: **verificación** (sus bloqueos
son la respuesta a «por qué no hay resultado») y **límites** (que contiene el inventario metálico,
que antes *era* toda la pestaña).

| Etapa | Qué debería verse |
|---|---|
| 1 · Reglamento | `elegido` si el proyecto declara CIRSOC 301; si no, `actual` |
| 2 · Material y grado | **una fila por miembro**: id, sección, familia, grado declarado, norma de producto, espesor, estado |
| 3 · Sección y perfil | **una fila por miembro**: origen, ID de catálogo, propiedades ausentes **por nombre**, y si el bloqueo es geométrico o de autoridad |
| 4 · Geometría | **bloqueada**, sobre el dato de arriostramiento |
| 5 · Hipótesis | las siete hipótesis del verificador, más **`Lb` por miembro con su fuente**, más lo no inferible |
| 6 · Análisis | `elegido` con resultados y combinaciones; `actual` sin ellos |
| 7 · Verificación | **bloqueada siempre**, con cinco bloqueos y ocho explicaciones |
| 8 · Límites y autoridad | el inventario metálico completo |

### 1.2 Lo que **no** debe pasar, y es lo que más importa mirar

- **Ningún tilde verde** en la etapa 7. `verificationState` es la constante `'blocked'`.
- **Ninguna palabra de aprobación** afirmada. Las frases que dicen «verificado» o «aprobado» son
  todas **negaciones** («ninguno se presenta como aprobado»). Si QA encuentra una afirmación, es un
  bug de primera prioridad.
- **Ningún grado inventado.** Un miembro sin grado declarado muestra una raya (`—`), nunca una
  designación deducida de `fy`.
- **Ninguna barra de progreso ni porcentaje.** No hay un total del que ser fracción.

### 1.3 El selector de conformados en frío

**Cómo llegar:** misma pestaña, etapa 8 (límites) → panel metálico → sección de conformados.

- Tipear `C 100x50x15x2` o `Z 200x75x20x2.5` debe resolver. También `c 100 × 50 × 15 × 2,0`.
- **La lista de la serie está vacía a propósito** y lo dice: no hay catálogo comercial con fuente.
- Cinco hechos de alcance arriba, el **primero** es una capacidad (geometría paramétrica
  disponible) y los otros cuatro límites. Si los cinco se ven como refutaciones, es un bug.
- Un **Z** muestra el aviso de ejes rotados con el ángulo medido; un **C** no.

### 1.4 Regresiones a vigilar

| Área | Por qué |
|---|---|
| **Selección de nodos en 3D** | no se tocó `nodes-instanced.ts`, pero se midió mucho. El gizmo **no** se implementó: las esferas siguen a 0,07 m fijos |
| **La pestaña de secciones PRO** | `handleShapeConfirm` pasa dos campos más (`tl` y `built`). Ninguna sección de hormigón debería cambiar |
| **Visor 3D con secciones** | un perfil Z ahora se dibuja; antes no existía |
| **Panel de tensiones (Basic)** | un Z ya **no** se dibuja como rectángulo en 2D |
| **Propiedades de un canal C paramétrico** | cambiaron: el labio se mide desde la cara exterior, así que el área baja `2t²` (~1,8 %) |

---

## 2. Estado de las puertas

| Puerta | Resultado |
|---|---|
| `npm run test:unit` | **7316 pasan**, 12 saltados, 1 todo |
| `npm run test:build` | **14 pasan** |
| `npm run typecheck` | **473**, sin errores nuevos; la base bajó de 479 (seis ocurrencias eliminadas, enumeradas en `170064c8`) |
| E2E del workflow | **26 pasan** (aislado) |
| E2E metálicos (todos los specs que tocan acero) | **107 pasan** (aislado) |
| **E2E completa del repo** | **4 fallidos, 613 pasados**, 1,0 h — ver §2 bis |
| i18n es/en/pt | **316 claves, en paridad** |

### 2 bis · Los cuatro fallos de la suite completa

Corrida del 22-ago 19:57 → 20:59, 52 specs, `workers: 1`. **No clasificados todavía**: los
dos de temporización no se pueden juzgar con la máquina cargada, y la comparación visual necesita
una corrida aislada.

| Hora | Spec / test | Error | Qué se sabe |
|---|---|---|---|
| 20:11 | `m2-steel-workflow` → «no progress bar or percentage» | `not.toMatch(/\d+\s?%/)` | **Bug del test, no del producto.** Baneaba cualquier `NN %`, y el panel muestra legítimamente `0,76 %` — la sobrestimación por esquinas vivas del conformado en frío, que es una **medición**, dentro de `SteelPanel` en la etapa 8, que abre por defecto. Aserción corregida |
| 20:29 | `project-restore` → restore/design/3-D/reload | timeout de 900 000 ms | temporización, sin aserción equivocada |
| 20:29 | `rc-design-visual` → overlay legend | esperaba 696×34, recibió **697×34**; 645 px distintos (ratio 0,03) | 1 px de ancho. El describe se llama `@slow visual baselines (non-blocking)`. La baseline `darwin` es de **2026-07-25**, nunca actualizada, y **M2 no tocó ninguna** |
| 20:46 | `ded-roundtrip` → «7-storey page» | solve no terminó en 480 s; el test informa **«fell back to sequential: no»** | por la regla del propio test, sin fallback debe tratarse como regresión. Pendiente de corrida aislada |

**Contexto de carga:** al cerrar la suite el promedio era **20,73 / 27,77 / 18,30**, con 17 procesos
node de otros worktrees vivos. Los dos timeouts ocurrieron dentro de esa ventana.

### 2 ter · Clasificación, después de repetir cada uno aislado

Todas las repeticiones con **una sola suite**, puerto dedicado **6211**, sin actualizar snapshots,
sin tocar timeouts y sin `force`.

| Test | Aislado | Duración | Carga | Clasificación |
|---|---|---|---|---|
| `m2-steel-workflow` → percentage | **27 pasan** | 58 s | 9,7 | **Bug de mi test, corregido.** Ver abajo |
| `project-restore` → restore/reload | **pasa** | **104 s** | 2,8 → 3,7 | **Saturación.** Venció los 900 s con carga 20+; corre en 104 s con carga 3. Factor **> 8** contra el propio deadline |
| `ded-roundtrip` → 7-storey | **pasa** | **65 s** | 3,1 → **18,1** | **Saturación.** «Solve no terminó en 480 s» con carga 20+; el test completo tarda 65 s con la máquina libre |
| `rc-design-visual` → overlay legend | **falla** | 23 s / 20 s | 12,0 → 9,0 | **Preexistente, no es regresión de M2** |

**`rc-design-visual`, con la evidencia completa:**

1. reproduce aislado en M2 — determinista, no saturación;
2. la baseline `darwin` mide **696 × 34**, coincide con el «expected», y es del **2026-07-25**
   (commit `15c74e18`), **nunca actualizada**;
3. **M2 no tocó ninguna baseline**, ni `Viewport3D.svelte` —donde la leyenda es markup fijo de
   verificación RC— ni las tres claves del diccionario general que usa;
4. **corrido sobre `feat/pro-steel-m1` falla igual**: mismo 696→697 px, mismos 645 píxeles.

El describe se declara `@slow visual baselines (non-blocking)`. Queda para quien mantenga las
baselines: 1 px de ancho, consistente con deriva de fuente o de versión de Chromium.

**Un matiz sobre `ded-roundtrip`:** el mensaje del propio test dice que sin fallback a secuencial
«debe tratarse como regresión». Esa regla no contempla carga externa — el solve **sí** termina
holgadamente con la máquina libre, así que la premisa no aplica acá. Vale revisar la redacción de
ese test, no el solver.

**El fallo mío, para que QA no lo busque:** la aserción baneaba cualquier `NN %`, y el panel muestra
legítimamente `0,77 %` —la sobrestimación por esquinas vivas, una **medición**— desde
`ColdFormedPanel`, dentro de `SteelPanel` en la etapa 8, que abre por defecto. Verificado con una
sonda, no razonado. Corregido: se chequea `progressbar`, porcentaje-como-completitud y
estado-como-fracción, no el signo `%`.

---

## 3. Lo que M2 entregó

**Conformados en frío C/Z** — geometría (el Z no existía en la app), catálogo paramétrico,
designación como especificación, renderizadores 2D y 3D, y la convención del labio unificada por
integración con `120f15cc` de H1, validada de forma independiente.

**Aviso de ejes no principales** — regla pura sobre `Section.shape`, que alcanza a los **37 ángulos
catalogados** además del Z. Consumidores compartidos **no** editados; contrato y patch preparados.

**Workflow CIRSOC 301** — ocho etapas montadas y alcanzables, con detalle por miembro en 2, 3 y 5, y
contenido explicativo en 7.

**Del verificador**, tres de cuatro bloqueos atendidos: 18 tests de referencia, el fin de siete
valores inventados (y un **defecto de inversión de ejes** que nadie había nombrado), y el mapa de
cláusulas citado del texto embarcado.

---

## 4. Lo que M2 **no** entregó, y por qué

| Pendiente | Por qué |
|---|---|
| **Verificación metálica habilitada** | falta la firma de alguien con competencia normativa. Ningún trabajo de código la reemplaza |
| **Validación del mapa de cláusulas** | las 14 entradas están en `unvalidated`. Y **aun firmadas** no resuelven `Lb`, ni la geometría de bulones, ni la autoridad completa |
| **La fuente de `Lb`** | el modelo no tiene dónde registrar un arriostramiento. Tres caminos en `m2-lb-assumption.md`; el más barato es que el generador conserve las riostras que ya coloca |
| **El tope `1,5·My` de F.2.1** | el código nunca calcula `My`. Es un límite superior faltante, del lado inseguro |
| **`Ae = Ag`** | necesita la geometría del grupo de bulones, que no existe |
| **§E.4** | pandeo torsional, que gobierna en ángulos, tes y cruciformes — justamente las secciones cuyos ejes M2 ya advierte |
| **Serie tabulada C/Z** | falta una fuente citable de acería o norma dimensional |
| **Gizmo de nodos** | medido y seguro, no implementado: es cosmético y quedó después del workflow |
| **Uniones y visualización** | investigado y documentado, sin implementar. No hay geometría de unión en el modelo |
| **Consumidores compartidos del aviso de ejes** | `SectionEditor`, `ProfileSelector`, `ProSectionsTab` son de hormigón también; `SectionStressPanel` es de Basic |

---

## 5. Los tres defectos con consecuencia que M2 encontró

Vale que QA los conozca, porque dos siguen abiertos.

1. **Inversión de ejes en el camino de flexión** — `SteelDesignParams` documenta `Iz` como eje
   fuerte y la app usa `iz` como débil. `checkSteelFlexure` toma `ry = √(Iy/A)` como radio del eje
   **débil**; alimentado con el fuerte, `ry` salía ≈3,7× grande en un IPE 200 y una viga que
   necesitaba reducción por pandeo lateral-torsional se juzgaba dentro de la plataforma.
   **Arreglado.** Compresión no se afectaba (toma `max` de las dos esbelteces).
2. **El tope de flexión faltante** — **abierto.** Necesita calcular `My`.
3. **Los ángulos se analizan respecto de ejes no principales** — **abierto y preexistente.** La
   inercia mínima real de un ángulo de alas iguales es ~40 % de la que la app guarda como eje débil:
   el valor almacenado es ~2,4× demasiado alto, del lado **inseguro**. La advertencia está
   implementada como regla pura y **no montada**, porque todas las superficies donde va son
   compartidas con hormigón o de Basic.

---

## 6. Documentos para revisar junto al código

| Documento | Qué decide |
|---|---|
| `m2-cirsoc301-workflow-roadmap.md` | el reordenamiento de M2 y la auditoría de los nueve puntos |
| `nonprincipal-axes-warning-proposal.md` | los 37 ángulos, con la medición validada contra el catálogo |
| `m2-axes-notice-contract.md` | el handoff de integración del aviso, con diff por archivo |
| `m2-lb-assumption.md` | de dónde debería venir `Lb`, y por qué no se reemplaza |
| `m2-lip-convention-proposal.md` + `-validation.md` | la decisión del labio y su validación independiente |
| `m2-metallic-visualisation-study.md` | uniones y visualización: la auditoría y las cinco fases |
| `m2-ixy-integration-handoff.md` | el producto de inercia: dónde falta y por qué no derivarlo |
| `share-codec-fields.md` | los cuatro campos que pierde un link compartido |
| `m1-section-shape-builder.md` | el componente huérfano y su decisión de producto pendiente |

---

## 7. Lo que necesito de una persona, no de más código

1. **La firma del mapa de cláusulas.** 14 entradas, cada una con expresión, cláusula, entradas,
   hipótesis y limitación. Están citadas del texto embarcado con la numeración **con puntos** de
   CIRSOC, no la de AISC. Lo que falta es que alguien competente confirme que cada expresión
   implementa la cláusula que dice.
2. **La decisión sobre `Lb`.** Cuál de los tres caminos, y quién toca el generador.
3. **El aviso de ejes en superficies compartidas.** Aprobarlo o rechazarlo, y definir quién escribe
   los tres patches. `SectionStressPanel` no lo puede tomar ninguna de las dos ramas.
4. **La fuente de la serie C/Z**, si existe.

**Nada de lo anterior hace que un miembro metálico aparezca como verificado.**
`steelCountsAsVerified()` sigue devolviendo el literal `false`.
