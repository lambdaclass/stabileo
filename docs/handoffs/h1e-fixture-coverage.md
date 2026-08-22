# H1-E — qué produce cada fixture, y qué no produce ninguno

**Rama:** `feat/pro-concrete-h1` · **PR:** [#161](https://github.com/lambdaclass/stabileo/pull/161)
**Specs:** `e2e/h1e-conflict-states.spec.ts`, `e2e/h1d-viewer-audit.spec.ts`

Medido sobre producción sin modificar. Ni el motor ni el solver se tocaron para fabricar un caso.

## 1. Los tres fixtures RC

| fixture | conflictos | marcadores | estados en el rail | tiempo |
|---|---:|---:|---|---:|
| `rc-design-qa-8` | 0 | 0 | modelled 9 | 5 s |
| `rc-qa-diagnostic` | 68 | 68 | modelled 23 · **provisional 5** | 4 s |
| `pro-edificio-7p` | 1318 | 1310 | modelled 194 · provisional 6 · **failed 6** | 22 s |

`rc-qa-diagnostic` es el fixture de conflictos: los produce y es **más rápido** que el de 8
elementos. `pro-edificio-7p` se usa una sola vez, para `failed`, que es el único estado que sólo
él alcanza.

## 2. Lo que quedó ejercitado en navegador

- **Capa de conflictos**: 68 marcadores → 0 → 68. Cierra la anotación de H1-D.
- **`doc-conflicts`**: estado que H1-C nunca alcanzó. Renderiza con la cuenta real y la readiness
  cae a borrador.
- **`provisional` y `failed`** en el rail, con sus dots comparados **por valor** contra `#a066d3` y
  `#e0444a` de la escena, y con la palabra de estado al lado.

## 3. Lo que ningún fixture alcanza

### 3.1 `refused` / no armados — **cero en los tres**

Aserido como cero en `h1e-conflict-states.spec.ts`, no anotado: el día que un fixture produzca
uno, el test falla y obliga a ejercitar el filtro `rebar-hide-unreinforced` y el bloque
`.unreinforced`.

**Qué haría falta:** un miembro que el diseño rechace armar. Los tres fixtures diseñan todo lo que
tienen. Un fixture aislado con una sección insuficiente para su demanda debería producirlo, sin
tocar el motor.

### 3.2 `doc-error` — los tres construyen documento

`buildDocument` devuelve `null` cuando **no hay detallado coordinado**. Los tres fixtures coordinan.

**Qué haría falta:** detallado generado **pero no coordinado**. No encontré la ruta: `generate()`
produce conjuntos ya coordinados. Habría que ver si existe un estado intermedio alcanzable o si
hace falta un fixture sembrado con `__stabileoActions.seedDetailing`, que ya existe y escribe
`model.detailing` directamente — probablemente el camino más barato y sin tocar producción.

### 3.3 `ConflictInspector` — inalcanzable desde un test

Renderiza desde `selection.conflict`, que sólo setea `rebarWorkspace.selectConflict`, y la única
ruta de UI es **clickear un marcador en la escena WebGL**, que se resuelve por raycasting contra
el canvas. `e2e-hooks.ts` no expone `selectConflict`.

El spec asserta que **los marcadores están** y que **el inspector no**, con el motivo, en vez de
dejar un hueco silencioso.

**Cambio mínimo propuesto:** una línea en `e2e-hooks.ts`, junto a `selectAssembly` y
`reviewAssembly` que ya viven ahí:

```ts
selectConflict: (i: number) => {
  const c = detailingStore.conflicts[i];
  if (c) rebarWorkspace.selectConflict(c as never);
},
```

Con eso el inspector queda cubierto: su banda, sus bordes espejados, sus dos niveles de
severidad y sus botones de centrar y aislar — hoy todo verificado sólo por fuente.

`e2e-hooks.ts` es superficie compartida y el hook es de mutación, así que **no lo agregué**.

## 4. Estado de H1-D

**No cerrado.** Con este bloque quedan cubiertos conflictos, provisional y failed. Siguen sin
cubrir:

- `refused` y el bloque de no armados (§3.1);
- `ConflictInspector` (§3.3);
- la sección de corte (`rebar-section-axis`, `rebar-section-at`);
- el rail a viewport angosto, donde `rebar-rail-toggle` **sí** se muestra — a 1280×720 tiene
  `display: none` y la caja mide 0×0;
- la visualización por familia más allá del censo.

---

## 5. Segunda pasada — los dos fixtures autorizados

### 5.1 `doc-error`: **no es alcanzable**, y el motivo es estructural

No hace falta un fixture. Medido con `seedDetailing([])`:

    antes:   documents-stage 1 · doc-xlsx 1
    después: documents-stage 0 · documents-empty 1 · doc-xlsx 0 · doc-error 0

`buildDocument` devuelve `null` en **una sola** condición —`persisted.assemblies.length === 0`— y
`DocumentsSection` renderiza toda su etapa detrás de `{#if !selected}`, donde `selected` deriva de
la misma lista. **La ausencia que haría fallar la construcción también quita los botones que la
llamarían.** No hay nada que clickear.

O sea que `docError = t('detailing.doc.noCoordinated')` es código defensivo para una carrera que el
propio código ya eliminó: el comentario de `buildDocument` describe el arreglo —leer del store
**persistido** y no de un `$derived` que "does not necessarily recompute inside the synchronous turn
that wrote its dependency"—.

**Queda aserido como inalcanzable**, con el mecanismo, en `e2e/h1e-absence-states.spec.ts`. No lo
fabriqué: forzarlo exigiría cambiar producción para que un guard dispare.

### 5.2 `refused`: **bloqueado**, y falta un hook

`REFUSED` sale de un **outcome de diseño** —`SECTION_INADEQUATE` o `SEARCH_EXHAUSTED`
(`element-status.ts:345`)—, no de un detallado sembrado. `seedDetailing` escribe
`model.detailing`; los outcomes viven en `verificationStore`.

Medido en los tres fixtures:

| fixture | outcomes |
|---|---|
| `rc-design-qa-8` | `VERIFIED` 8 |
| `rc-qa-diagnostic` | `VERIFIED` 22 · `PROVISIONAL_BIAXIAL` 8 |
| `pro-edificio-7p` | `VERIFIED` 198 · `PROVISIONAL_BIAXIAL` 10 |

**Ninguno rechaza.** Y no hay ruta de UI: `ProSectionsTab` no tiene un solo `data-testid`,
`SectionChanger` tampoco, y `BatchEditDialog` edita armadura, no secciones.

**Lo que falta es un mutador de test**, exactamente como `selectConflict`:

```ts
updateSection: (id: number, data: unknown) => { modelStore.updateSection(id, data as never); },
```

Con eso el fixture es: cargar `rc-design-qa-8`, achicar una viga hasta que su sección no alcance,
`designAll()`, y el motor **rechaza de verdad** — no se fabrica el estado, se produce.

No lo agregué: el bloque autorizaba usar hooks existentes, y éste no existe. Es una línea y va con
el mismo criterio con que se aprobó `selectConflict`.

### 5.3 Las tres ausencias que sí se distinguen

`h1e-absence-states.spec.ts`, en los tres idiomas:

| estado | testid | qué significa |
|---|---|---|
| sin detallado | `documents-empty` | no hay nada que documentar · **ningún export ofrecido** |
| sin documento | `doc-none` | hay detallado, no se construyó documento · **los exports SÍ se ofrecen** |
| familias vacías | `rebar-empty-families` | esas familias no tienen geometría — y **no** `rebar-workspace-empty`, que diría que no hay nada |

Aserido que las dos primeras **no comparten frase**. Es el mismo defecto que tenían las familias de
pisos: "miramos y no hay" impreso igual que "nadie miró".

Y la regla de VERIFIED: una etapa vacía no dice `verified`, `issued` ni `constructible`, y los
elementos que llevarían veredicto —`doc-readiness`, `doc-maturity`, `doc-contents`,
`review-record`, `doc-revision`, `issue-submit`— **no existen**, que es más fuerte que un texto
prudente.

## 6. H1-E: los tres que faltaban

`h1e-rail-and-section.spec.ts`, 9 casos.

**Sección de corte.** Es un **plano de clipping** —`renderer.localClippingEnabled = true`—, no un
filtro: no se quita ninguna malla y el censo no se mueve. Mi primera versión asertó el censo y
falló en los tres ejes; el instrumento estaba mal, no la función. Lo observable desde el DOM es el
control dependiente: elegir eje trae el deslizador de posición y elegir ninguno lo saca. Los
límites salen de la escena (~5,4 m en y), no de un 0..1 fijo.

**Rail angosto.** A 820 el toggle aparece —a 1280 mide 0×0—, colapsa el rail y lo devuelve, mueve
`aria-expanded` (su único contenido accesible: es un glifo sin etiqueta) y conserva el foco. El
canvas mantiene ancho > 400 px, que es la razón por la que el rail pasa a ser una lámina encima.
Abierto **a** 820 y no redimensionado hacia ahí: `onResize` pone `railOpen = wide` al cruzar 860, y
mi primera versión corría contra ese handler.

**Familias.** Cada familia con geometría se apaga y se vuelve a prender por separado, verificado
contra el censo. Las 5 familias vacías **se nombran** en vez de desaparecer (4 de 5 aparecen por
nombre en el texto). Y el tally reporta por familia —sólidos, longitudinal, transversal— con el
total de barras coincidiendo con el censo; asertar el conteo del censo contra las celdas del tally
era leer un número esperando otro.

---

## 7. Tercera pasada — el fixture de rechazo, y lo que destapó

### 7.1 El fixture

`__stabileoActions.updateSection` —mutador de test, junto a `selectConflict`, `selectAssembly` y
`reviewAssembly`— achica **una** sección y el diseño vuelve a correr:

    rc-design-qa-8, sección 2 (`RC Col 400×400`) → 90 × 120 mm
    → SEARCH_EXHAUSTED ×8 · VERIFIED ×4

**Rechazo real del motor**, no un estado escrito. El buscador enumera todo el envolvente permitido
por norma para una columna que no puede con su demanda, no encuentra nada que verifique, y lo
dice — que es la distinción honesta que `candidate-search.ts` documenta entre "agotado" e
"inviable".

Dos cosas que costaron encontrar y conviene no repetir:

- **Sección 2, no la 1.** La 1 no la usan los miembros diseñados; achicarla no cambia nada.
- **90 × 120 mm, no 50 × 60.** Achicar las ocho secciones llevó el diseño más allá de diez
  minutos: cuando *nada* entra, el buscador enumera un envolvente mucho mayor.

### 7.2 Lo que destapó: `REFUSED` está tapado por `FAILED`

El outcome **es** `SEARCH_EXHAUSTED` y `element-status.ts:345` lo mapea a `REFUSED`. **El rail
nunca lo muestra.**

`element-status.ts:316` chequea `verificationStatus === 'fail'` **primero**, y un miembro cuyo
diseño fue rechazado también falla verificación — el rechazo ocurrió justamente porque nada en el
envolvente verificaba. Así que `FAILED` gana y la rama `REFUSED` no se alcanza.

Medido:

    rail: failed 5 · refused 0 · modelled 5
    censo: column bars 0 · column solids 4 · markers 20

Que `FAILED` vaya primero **es correcto** para el caso que su propio comentario describe: un
miembro con un `VERIFIED` viejo que hoy falla. Pero se traga la distinción que los estados existen
para hacer. El encabezado del mismo archivo enuncia los remedios:

> `- the design was refused → change the section, or design by hand`

y un `FAILED` manda al lector a cambiar la armadura, que es el arreglo equivocado.

**No lo toqué.** Reordenar un clasificador cambia cómo se llama **cada** miembro de la app, y eso
es una decisión, no un arreglo de paso. El test lo fija **como es** —`failed > 0` y `refused === 0`
con el motivo escrito— así que el día que se reordene, falla y hay que actualizarlo a propósito.

### 7.3 Lo que sí quedó ejercitado

- La columna rechazada **pierde el acero y conserva el hormigón**: censo de barras de columna
  200 → **0**, sólidos 4. Es la consecuencia visible del rechazo.
- El bloque `.unreinforced` **aparece y explica** (>20 caracteres), en el workspace. H1-D lo había
  aserido ausente con la premisa `refused === 0`; ésta es la otra cara, y la razón por la que se
  escribió como premisa y no como anotación.
- Ningún miembro rechazado dice `verified` ni `certified` en su fila.
- Los conteos separan rechazo, fallo y verificado: `{"SEARCH_EXHAUSTED":8,"VERIFIED":4}`.

### 7.4 `doc-error` sigue siendo inalcanzable — la cadena completa

Confirmado otra vez, y vale escribir la cadena entera porque es lo que pide no volver a intentarlo:

1. `buildDocument` devuelve `null` **sólo** si `persisted.assemblies.length === 0`
   (`detailing.svelte.ts:1479`).
2. `DocumentsSection` renderiza **toda** su etapa detrás de `{#if !selected}` (línea 191), y
   `selected` es `detailingStore.selected`, derivado de la misma lista de conjuntos.
3. Con cero conjuntos, `selected` es `null` → sale la rama `documents-empty`.
4. Los cuatro botones —`doc-report`, `doc-dxf`, `doc-xlsx`, `doc-3d`— viven **dentro** de la rama
   contraria, así que dejan de existir.
5. `currentDoc()` es el único llamador de `buildDocument`, y sólo lo llaman esos cuatro.

**El paso 4 elimina los botones antes de que el paso 5 pueda ocurrir.** No hay orden de eventos que
deje `selected` no nulo con la lista vacía: es la misma lista.

Medido: `documents-stage 0 · documents-empty 1 · doc-xlsx 0 · doc-error 0`.

`detailing.doc.noCoordinated` queda como guarda defensiva de una carrera que el propio código
eliminó al leer del store **persistido** en vez de un `$derived`. El test de inalcanzabilidad se
mantiene.
