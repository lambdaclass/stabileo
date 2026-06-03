# Plan de mejora visual del viewport 3D (perfiles + ejes locales)

**Fecha:** 2026-06-03
**Estado:** Diseño / brainstorming (pre-implementación)
**Inspiración:** calcsteel.com (editor 3D CAD en browser)
**Objetivo:** Acercar la calidad visual del viewport 3D de Stabileo a un editor CAD profesional, con foco en (1) **render de perfiles 3D** y (2) **ejes locales por barra**.

> Este documento es autocontenido para que otra persona pueda continuar el análisis e implementar. Cita los archivos reales del repo (`web/src/...`).

---

## 1. Resumen ejecutivo

Tres capas de trabajo, en orden de dependencia:

| Capa | Qué | Tipo | Scope de este plan |
|------|-----|------|--------------------|
| **0 (Tarea A)** | Cambiar la convención de auto-orientación de ejes locales de **Y-up** a **Z-up** | Solver / correctness | **Prerequisito, fuera de scope** — su propio spec + tests + validación de ingeniería |
| **1** | Dibujar la **tríada de ejes locales** (x/y/z RGB) por barra | Visual | **En scope** |
| **2** | Mejorar el **render de perfiles 3D** (aristas + material metálico + iluminación + geometría real de catálogo) | Visual | **En scope** |
| **3** | **Indicador de orientación** (cómo está rolada la sección, ángulo β) | Visual | **En scope (menor)** |

Decisión clave: la Capa 0 es un cambio de convención del solver con efectos en resultados (My/Mz, Qy/Qz), diagramas y verificación. Se trata **aparte**. Las capas visuales asumen que los ejes que entrega `computeLocalAxes3D` ya son los correctos; la tríada (Capa 1) mostrará automáticamente la convención corregida cuando la Tarea A aterrice.

---

## 2. Estado actual del código

### 2.1 Render de elementos — `web/src/lib/three/create-element-mesh.ts`
Tres modos de render (`renderMode3D` en el store), seleccionables por el usuario:
- **`wireframe`** (default): todas las barras se dibujan con un `LineSegments2` **batcheado** (`elements-batched.ts`) — un solo draw call. Es el modo barato para modelos grandes.
- **`solid`**: frames = cilindros (`CylinderGeometry`, radio fijo **0.06**), trusses = `Line2`.
- **`sections`**: frames = **perfil extruido** (`THREE.ExtrudeGeometry` de la `THREE.Shape` de la sección), con fallback a cilindro si no hay forma. Trusses = `Line2`.

Material actual: `MeshStandardMaterial` con `roughness: 0.5, metalness: 0.15` (poco metálico), **sin aristas** (no hay `EdgesGeometry`). Orientación del perfil: se extruye a lo largo de `+Z` local y se orienta `I→J` con un quaternion, aplicando `elementRollAngle (β) + sectionRotation (θ)` alrededor del eje de la barra.

### 2.2 Formas de sección — `web/src/lib/three/section-profiles.ts`
`createSectionShape(sec)` ya genera `THREE.Shape` para: **I/H, RHS, CHS, rect, U, L, T**. Punto flojo: cuando faltan espesores (`tw`, `tf`, `t`) **estima** dimensiones (p. ej. I con `tw=h*0.05`, `tf=h*0.08`), así que el IPN/UPN renderizado puede no coincidir con el perfil real.

### 2.3 Catálogo de perfiles — `web/src/lib/data/steel-profiles.ts`
Hay **100+ perfiles europeos** (IPE, HEB, HEA, UPN, L, RHS, CHS) con dimensiones reales. Hoy **no se usan** para alimentar la geometría 3D (oportunidad: linkear sección→catálogo para geometría exacta).

### 2.4 Ejes locales — NO se visualizan
- `web/src/lib/engine/local-axes-3d.ts` → `computeLocalAxes3D()` calcula `{ex, ey, ez, L}` por barra (lo usan solver, diagramas, stress). **Es la fuente de verdad de los ejes.**
- `web/src/lib/three/axis-display.ts` → **nombre engañoso**: solo es un helper de convención de signo para diagramas (terna izquierda/derecha). **No dibuja ejes por barra.**
- **No existe ninguna tríada/gizmo de ejes locales** en el viewport. `showAxes`/`showAxes3D_basic/_pro` (en `ui.svelte.ts`) solo togglean los **ejes globales** del mundo.

### 2.5 Arquitectura de render — `web/src/components/Viewport3D.svelte` + `web/src/lib/viewport3d/`
- Patrón de "grupos" THREE bajo parents (`elementsParent`, `nodesParent`, `supportsParent`, `loadsParent`, `shellsParent`, `resultsParent`) y módulos `*-sync.ts` (`results-sync.ts`, `scene-sync.ts`).
- **LOD** (`viewport3d/lod.ts`): durante orbit/pan/zoom oculta los grupos pesados y muestra el wireframe batcheado; al soltar, restaura. → **El material/aristas pesados solo se renderizan en reposo**, lo cual es bueno para perf.
- Picking: `InstancedMesh` BVH-acelerado (`elements-picking.ts`).

### 2.6 Store relevante — `web/src/lib/store/ui.svelte.ts`
- `renderMode3D` (per-mode: `renderMode3D_basic` / `renderMode3D_pro`).
- `showAxes3D_basic` / `showAxes3D_pro` (ejes globales).
- `viewportPresentation3D` (`native3d` / `upright2dIn3d`).
- Patrón claro para agregar flags **por modo** (basic vs pro).

---

## 3. Decisiones tomadas en el brainstorming

1. **Áreas en scope:** ejes locales (1), perfiles 3D (2), indicador de orientación (3). **Pulido de escena general (grilla/fondo/nodos/apoyos): deprioritizado.**
2. **Ejes locales — cuándo se muestran:** **Estrategia C** → *toggle global + siempre en la barra seleccionada*. Default limpio (solo seleccionada); un toggle prende la tríada en todas (atenuadas). Lo mejor de "solo seleccionada" y "todas".
3. **Render de perfiles — estilo:** **Estilo C** → *metálico + aristas + mejor iluminación* (look calcsteel). (Estilo B = "sólido + aristas" como piso si hace falta algo más liviano.)
4. **Convención de ejes (Capa 0):** se hace **aparte** como tarea de ingeniería previa (ver §4).
5. **Modos de app:** asumido **basic-3D y PRO** (es feature de viewport). Flag por modo siguiendo el patrón `*_basic`/`*_pro`. *(A confirmar con el amigo.)*

---

## 4. Capa 0 (Tarea A, prerequisito) — Convención Z-up de ejes locales

> **Fuera de scope de la implementación visual, pero documentado acá porque la tríada lo refleja.** Merece su propio spec + tests de regresión + validación de un ingeniero estructural.

### 4.1 Problema
`computeLocalAxes3D()` usa una convención **Y-up histórica** del solver, aunque la geometría del producto es **Z-up**. El auto-orient elige la referencia así (lógica actual en `local-axes-3d.ts`):

```ts
const dotY = Math.abs(ex[1]);              // componente sobre Y GLOBAL
let eyRef = dotY > 0.999 ? [0,0,1] : [0,1,0];  // "vertical"(=Y) → ref Z ; resto → ref Y
// ez = normalize(ex × eyRef) ; ey = ez × ex
```

Consecuencia para vigas **horizontales**:
- **Viga +X** (`ex=(1,0,0)`): `eyRef=Y` → `ez=(0,0,1)=Z`, `ey=(0,1,0)=Y`. → `ez` vertical ✓ (coincide con lo deseado por casualidad).
- **Viga +Y** (`ex=(0,1,0)`): cae en el caso "vertical" → `eyRef=Z` → `ez=(1,0,0)=X`, `ey=(0,0,1)=Z`. → **`ey=Z`, `ez=X`** ✗.

Es decir: una viga a lo largo de Y queda con su eje local Z **horizontal**, no vertical. Gravedad (−Z global) cae sobre `−ey` → produce `Qy`/`Mz` en vez del esperado `Qz`/`My`.

### 4.2 Comportamiento deseado
**Toda viga horizontal mantiene `ez = Z` (vertical).** Para la viga +Y: `ex=Y`, `ey=±X` (horizontal en planta), `ez=Z`. Así gravedad → siempre `Qz`/`My`, coherente.

### 4.3 Fix propuesto (Z-up)
Cambiar la referencia de auto-orient de Y-up a Z-up:
- "Vertical" = `|ex·Z| > 0.999` (columnas), no `|ex·Y|`.
- Para barras no-verticales: referencia = `Z` global; `ey = normalize(Z × ex)`, `ez = ex × ey` (queda ≈ vertical).
- Para columnas (`ex≈Z`): referencia horizontal (`X` global), sin discontinuidades en barras casi-verticales.

Verificación:

| Barra | `ey = norm(Z × ex)`, `ez = ex × ey` | Resultado |
|-------|--------------------------------------|-----------|
| +X | ey=Y, ez=Z | ez vertical ✓ |
| +Y | ey=−X, ez=Z | ez vertical ✓ (eje X como se pidió; **signo de ey a fijar**) |
| +Z (columna) | ref horizontal X | ez horizontal, correcto para columna |

> **Detalle a decidir:** signo de `ey` (±X). `Z×ex` da −X; `ex×Z` da +X. Elegir para que matchee la expectativa del usuario y el sentido de los diagramas.

### 4.4 Ripples (por qué es su propia tarea)
Todo deriva de `computeLocalAxes3D`, así que los consumidores "se acomodan", pero los **valores se mueven de columna**:
- `diagrams-3d.ts`, `section-stress-3d.ts`, extracción de verificación, aplicación de **cargas locales**.
- Para barras alineadas con Y (y oblicuas): lo que hoy es `My/Qy` pasa a `Mz/Qz`.
- **Back-compat:** modelos existentes que compensaron con `rollAngle`/`localY` bajo la convención vieja cambian de resultado. Decidir migración (¿re-guardar? ¿flag de convención por modelo?).
- Requiere **tests de regresión** en casos cardinales (+X, +Y, +Z, oblicuas) y casos con `rollAngle`/`localY`.

---

## 5. Capa 1 — Tríada de ejes locales (en scope)

### 5.1 Qué se dibuja
Por barra, en el **punto medio**: 3 flechas RGB con labels:
- **x = rojo**, a lo largo del eje del miembro (`ex`).
- **y = verde**, transversal (`ey`).
- **z = azul**, transversal (`ez`) — en vigas horizontales apunta hacia arriba (post Tarea A).

Tamaño: **proporcional al largo de la barra** con mínimo/máximo (evita recomputar por frame). *(Alternativa: tamaño constante en pantalla escalando por distancia de cámara cada frame — más caro, dejar como opción.)*

### 5.2 Estrategia de visibilidad (decisión C)
- **Default:** tríada solo en la(s) barra(s) **seleccionada(s)**.
- **Toggle global "Ejes locales":** prende la tríada en **todas** las barras (atenuadas, sin labels para no saturar); la seleccionada siempre se ve resaltada y con labels.
- Flag nuevo en `ui.svelte.ts`: `showLocalAxes3D_basic` / `_pro` (default `false`), siguiendo el patrón de `showAxes3D_*`.

### 5.3 Arquitectura (siguiendo el patrón existente)
Nuevo módulo `web/src/lib/viewport3d/local-axes-sync.ts` + un parent `localAxesParent: THREE.Group` en `Viewport3D.svelte`. Función `syncLocalAxes(ctx)` que se llama cuando cambian: selección, toggle, modelo (modelVersion), o convención.

Dos caminos de render según densidad (perf):
- **Pocas barras (seleccionadas):** flechas con `THREE.ArrowHelper` (o `Line2` + cono) por eje. Labels con `createTextSprite` (ya existe en `selection-helpers.ts`). Barato.
- **Todas (toggle ON):** **un solo** `LineSegments` batcheado para los 3 ejes de N barras (`6·N` vértices, color por vértice RGB) → un draw call, sin labels. Reusa la filosofía de `elements-batched.ts`. Flechas/conos opcionales como `InstancedMesh` si se quieren puntas.

Cálculo: usar `computeLocalAxes3D(nodeI, nodeJ, localY, rollAngle, leftHand)` para obtener `{ex,ey,ez}`; colocar en midpoint; escalar.

### 5.4 Integración con LOD
La tríada-de-todas debe **ocultarse durante orbit** (como los grupos pesados) o mantenerse solo la versión batcheada liviana. La tríada de la seleccionada puede quedar visible (es barata y ayuda a inspeccionar). Integrar en `lod.ts` (`applyLowDetail`).

---

## 6. Capa 2 — Render de perfiles 3D (en scope)

### 6.1 Estilo elegido (C): metálico + aristas + luz
Sobre el modo `sections` de `create-element-mesh.ts`:
1. **Aristas nítidas:** agregar `THREE.EdgesGeometry(geo, thresholdAngle≈30°)` + `LineSegments` (color claro, p. ej. `#e6f0fa`) como hijo del mesh extruido. Da el contorno que hoy falta.
2. **Material metálico:** subir `metalness` (~0.6–0.85) y bajar `roughness` (~0.3–0.4). Para que el metalness se vea, agregar un **environment map** a la escena (p. ej. `RoomEnvironment` + `PMREMGenerator`, o un env gradiente simple) en `Viewport3D.svelte`.
3. **Iluminación:** revisar/ajustar luces de la escena (key + fill + ambient, e idealmente un hemispheric para dar volumen). Hoy el look es "plano".

### 6.2 Geometría real de catálogo (mejora de calidad)
Cuando la sección referencia un perfil del catálogo (`steel-profiles.ts`), usar sus **dimensiones reales** (`h, b, tw, tf, r`) en `createSectionShape` en vez de estimar. Esto hace que IPN/UPN/IPE/HEB se vean correctos. Opcional: radios de acuerdo (fillets) para realismo — probablemente innecesario (YAGNI) salvo que se note.

### 6.3 Perfiles validados (IPN, UPN)
- **IPN / doble T:** `createIShape` ya existe — con dims reales queda correcto.
- **UPN / canal U:** `createUShape` ya existe (abierto hacia un lado). Validar que la **orientación de la abertura** sea consistente con `ey/ez` (post Tarea A) y el `rollAngle`.
- El **inset 2D de la sección** (silueta) mostrado en los mockups es opcional como overlay 2D de ayuda; decisión menor.

### 6.4 Perf / LOD
El material/aristas pesados solo aplican en modo `sections` (y `solid`), y el LOD ya cambia a wireframe batcheado durante orbit → **sin costo en movimiento**. `EdgesGeometry` se computa una vez por geometría (cachear por sección si se repite mucho).

---

## 7. Capa 3 — Indicador de orientación (menor)

Mostrar cómo está rolada la sección (`β`):
- **Opción A (gratis):** ya se comunica con el perfil extruido + la tríada de ejes. Quizá suficiente.
- **Opción B:** etiqueta `β = 18°` y/o una silueta de sección pequeña al seleccionar.

Recomendación: empezar con A (lo que dan perfiles + tríada) y agregar B solo si el usuario lo pide. *(Decisión para el amigo.)*

---

## 8. Arquitectura y archivos a tocar

| Archivo | Cambio |
|---------|--------|
| `web/src/lib/engine/local-axes-3d.ts` | **(Tarea A, aparte)** convención Z-up |
| `web/src/lib/viewport3d/local-axes-sync.ts` | **NUEVO** — `syncLocalAxes(ctx)`, render tríada (seleccionada + batched-all) |
| `web/src/components/Viewport3D.svelte` | nuevo `localAxesParent`; llamar `syncLocalAxes` en cambios de selección/toggle/modelo; setup de environment map + luces |
| `web/src/lib/viewport3d/lod.ts` | integrar visibilidad de tríada-all en `applyLowDetail` |
| `web/src/lib/three/create-element-mesh.ts` | modo `sections`: `EdgesGeometry` + material metálico; dims reales de catálogo |
| `web/src/lib/three/section-profiles.ts` | usar dims reales del catálogo cuando aplique (sin estimar) |
| `web/src/lib/three/selection-helpers.ts` | reusar `createTextSprite` para labels x/y/z; quizá colores de eje (`AXIS_COLORS`) |
| `web/src/lib/store/ui.svelte.ts` | `showLocalAxes3D_basic/_pro` (default false) + getters/setters por modo |
| `web/src/components/toolbar/*` o panel de viewport | toggle "Ejes locales" |
| i18n `en.ts`/`es.ts` (+ demás) | claves del toggle/labels (recordar: `t()` cae a inglés si falta) |

---

## 9. Flujo de datos

```
modelStore (nodos, elementos, secciones, rollAngle)
        │
        ├─► computeLocalAxes3D(nI, nJ, localY, rollAngle, leftHand)  ── {ex,ey,ez,L}
        │         │
        │         ├─► local-axes-sync.ts ──► tríada (ArrowHelper / batched LineSegments) ──► localAxesParent
        │         └─► create-element-mesh.ts (orientación del perfil extruido)
        │
        └─► section-profiles.createSectionShape(sec [+ dims catálogo]) ──► ExtrudeGeometry + EdgesGeometry + material metálico
                                                                                   │
                                                                                   └─► elementsParent (modo sections)

uiStore.renderMode3D ─ elige wireframe/solid/sections
uiStore.showLocalAxes3D ─ toggle tríada-all
uiStore.selectedElements ─ tríada de la seleccionada
LOD (orbit) ─ oculta pesados / tríada-all; muestra wireframe batcheado
```

---

## 10. Testing

- **Tarea A (convención):** tests unitarios de `computeLocalAxes3D` en casos cardinales (+X,+Y,+Z, oblicuas, casi-verticales) verificando `ez≈vertical` para horizontales; regresión de diagramas/verificación (los valores se mueven de columna — fijar expectativas nuevas).
- **Capa 1 (tríada):** test de que `syncLocalAxes` crea la tríada en la seleccionada; con toggle ON, N barras → conteo de segmentos esperado; orientación de las flechas = `ex/ey/ez`.
- **Capa 2 (perfiles):** `section-profiles.test.ts` ya existe — extender para verificar dims reales de catálogo; smoke test de que `sections` mode crea EdgesGeometry; build/render sin errores.
- **Perf:** modelo grande (p. ej. `xl-diagrid-tower`) — orbit fluido (LOD oculta lo pesado), toggle-all no tanquea.
- General: `npm run test` (vitest) + `npm run build` limpios.

---

## 11. Riesgos / back-compat

- **Tarea A** cambia resultados para barras en Y/oblicuas → riesgo de confundir a usuarios con modelos existentes. Mitigar con tests + comunicación + (opcional) flag de convención.
- **Environment map** agrega un costo de setup (PMREM) y memoria; medir en móviles.
- **Tríada-all** en modelos enormes puede saturar visualmente aunque sea barato de dibujar — por eso default off + atenuado.
- `EdgesGeometry` por elemento puede sumar geometría; cachear por sección compartida.

---

## 12. Preguntas abiertas para el amigo

1. **Tarea A primero o en paralelo?** ¿Quién valida la convención Z-up desde lo estructural (signo de `ey`, manejo de columnas y barras casi-verticales)?
2. **Modos:** ¿basic-3D + PRO ambos, o solo PRO?
3. **Tríada-all:** ¿con o sin puntas de flecha? ¿labels solo en seleccionada (recomendado) o también en hover?
4. **Tamaño de la tríada:** ¿proporcional al largo (barato) o constante en pantalla (más fiel, más caro)?
5. **Catálogo:** ¿linkeamos sección→`steel-profiles.ts` para geometría exacta ahora, o lo dejamos para una iteración 2?
6. **Indicador de orientación (Capa 3):** ¿alcanza con perfil + tríada, o querés label/silueta de β explícita?

---

## 13. Orden de implementación sugerido

1. **Tarea A** (spec aparte) — convención Z-up + tests + validación. *(Bloqueante conceptual para que la tríada muestre lo correcto, pero la tríada puede desarrollarse en paralelo y “heredar” la corrección.)*
2. **Capa 2** — perfiles (aristas + material + luz + dims de catálogo). Es la mejora visual más visible y de bajo riesgo (no toca solver).
3. **Capa 1** — tríada de ejes locales (selección → toggle-all → labels).
4. **Capa 3** — indicador de orientación, solo si hace falta.

---

### Apéndice — mockups del brainstorming
Los mockups SVG (scope, estrategia de ejes, estilos de perfil, preview combinado, IPN/UPN) quedaron en `.superpowers/brainstorm/<session>/content/` (gitignored). Sirven como referencia visual de las decisiones C/C tomadas.
