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
