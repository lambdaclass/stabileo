# H1-A — auditoría y mapa del flujo PRO de hormigón

**Rama:** `feat/pro-concrete-h1` · **PR:** [#161](https://github.com/lambdaclass/stabileo/pull/161) (draft)
**Arnés:** `web/e2e/h1a-audit.spec.ts` — 16 corridas: 4 pantallas × 3 idiomas a 1280×720, más las
4 a 1024×700 en español. **Mide, no assert**: una fase de auditoría no puede fallar por encontrar
algo. Lo que encuentre se convierte en aserciones en H1-B…E, dentro de los archivos que esas
fases toquen.

Nada de este documento está implementado.

---

## 0. Tres falsos positivos propios, antes de cualquier hallazgo

El arnés reportó 12 desbordes, 25 controles sin nombre accesible y un contraste de 1.00 antes de
que los verificara. **Los tres eran errores míos**, y vale dejarlos escritos porque son la clase
de error que convierte una auditoría en ruido:

| Reportaba | Por qué era falso |
|---|---|
| 12 desbordes en `.sr-only` | El texto para lector de pantalla **está clipeado a propósito**. `scrollWidth > clientWidth` es su definición, no su defecto. |
| 25 controles sin nombre | Todos eran `input` de tipo checkbox / radio / range **dentro de un `<label>` con texto visible**. Los nombra el envoltorio, correctamente. Mi sonda sólo leía `aria-label` / `title` / `textContent` del control. |
| contraste 1.00 a 0.1px | Elementos `<text>` de SVG. El `scrollWidth` y el `fontSize` de un nodo SVG no significan lo mismo que en HTML. |

El arnés ahora implementa el algoritmo de nombre accesible (aria-labelledby → aria-label →
`<label>` envolvente → `label[for]` → title → texto propio → placeholder/value) y excluye SVG y
`.sr-only`. Y un cuarto error, distinto: la pantalla de **documentos** se midió con el selector
`.documents`, que es **una tarjeta** dentro de la etapa — 8 nodos. El contenedor real es
`documents-stage`, 24 nodos. Esa pantalla estaba reportada como limpia sin haber sido mirada.

---

## 1. Layout — resultado negativo, y vale registrarlo

**Ningún desborde horizontal**, en las 4 pantallas × 3 idiomas × 2 anchos. Ni el contenedor ni
ningún hijo que no sea un scroller intencional. Las cajas se mantienen exactas:

    design      539 / 539        detailing   515 / 515
    documents   515 / 515        workspace   según ventana

Esto **contradice parcialmente** un defecto que PR20 dejó reportado —"la franja de workflow
envuelve a 1280×720 dejando un chevron colgado"—. Envolver no es desbordar: la franja puede
seguir envolviendo fea y el contenedor caber. Es una afirmación distinta y necesita otra medición
(altura de la franja y posición del último ítem), que H1-B tiene que hacer antes de darla por
buena o por falsa.

**No medí contenido sintéticamente largo.** Sólo los largos que produce `rc-design-qa-8` en tres
idiomas. Un nombre de miembro de 60 caracteres o un mensaje de norma de tres líneas siguen sin
medirse; H1-B.

---

## 2. Jerarquía — 2 saltos, los dos en los tres idiomas

| Salto | Dónde | Texto |
|---|---|---|
| `h3 → h5` | `DocumentsSection` (se ve también dentro del panel de diseño) | "Engineer review" / "Revisión del profesional" / "Revisão do profissional" |
| `h2 → h4` | `RebarWorkspace` / `RebarLayersPanel` | "Layers" / "Capas" / "Camadas" |

Los dos son defectos de estructura, no de estilo: un lector que navega por encabezados pierde un
nivel y no sabe si "Revisión del profesional" es hermana o hija de lo anterior.

---

## 3. Accesibilidad — nombres bien, contraste no

**Nombres accesibles: ninguno falta.** Después de corregir la sonda, cero controles sin nombre en
las 16 corridas. Es un buen resultado y conviene decirlo con la misma claridad que los defectos.

**Contraste: cuatro defectos, uno de ellos sistémico.**

### 3.1 `--st-text-3` no pasa AA como texto, en ningún fondo

`#64798a` sobre los cuatro fondos de panel:

| | `--st-bg` | `--st-surface` | `--st-surface-2` | `--st-surface-3` |
|---|---:|---:|---:|---:|
| `--st-text-3` | 4.03 | **3.74** | **3.62** | **3.28** |
| `--st-text-2` | 7.00 | 6.49 | 6.28 | 5.70 |

Y se usa como **texto corrido a 0.62–0.7 rem** en diez lugares de la superficie de hormigón:

    ProjectRegulationsPanel  .role-purpose (×8, una por rol) · .note
    DesignOverview           .glyph · .label          (heredan; medidos a 11.2px)
    DesignFamilyPanel        .hint · .note · .cols
    DesignFilterBar          .lbl · .refused
    FloorFamilyStateCard     .no-n
    RebarEditorColumn        .sub        RebarEditorBeam  .line.empty
    ChangedMembersPanel      .empty

Esto no se arregla archivo por archivo: o `--st-text-3` deja de usarse para oraciones y queda
para lo deshabilitado/decorativo, o cambia de valor. **`tokens.css` es contrato compartido** →
§6.

### 3.2 Tres defectos puntuales

| Ratio | Dónde | Qué |
|---:|---|---|
| **4.06** | `DetailingWorkflow` `.progress li.done` | `--st-text` sobre `--st-green` (`#1f8a52`). El paso "hecho" de la barra de progreso. |
| **4.36** | `WorkflowStages:227` `.stage-current .mark` | `--st-interactive` como **color de texto** sobre `--st-surface-3`. Ya medí esto para bordes: 4.36 pasa el 3:1 de §1.4.11 y no el 4.5 de texto. Acá es texto. |
| **3.74** | `DesignOverview:278,280` `.glyph` / `.label` | Heredan `--st-text-3`. Mismo problema que §3.1. |

---

## 4. Estilo — el hallazgo central

### El visor no usa la tipografía de la aplicación

Medido, no impresión:

| Pantalla | Fuente predominante | `IBM Plex Mono` presente |
|---|---|---|
| design | `IBM Plex Sans` | sí |
| detailing | `IBM Plex Sans` | sí |
| documents | `IBM Plex Sans` | — |
| **workspace** | **`-apple-system`** | **no** |

Y confirmado en el navegador, no inferido del CSS:

```
insideAppContainer: false
wsParent:  DIV.(none)
wsFont:    -apple-system        appFont: "IBM Plex Sans"
wsMono:    false
```

**El mecanismo exacto.** `App.svelte:1196` renderiza `<RebarWorkspace />` como **hermano** de
`.app-container`, y `.app-container` es el único elemento que declara
`font-family: var(--st-sans)` — con un comentario que dice, en sus propias palabras: *"One
declaration here reaches every descendant that does not override it."* El visor no es
descendiente. Hereda el stack del sistema de `index.html:74`.

**Y el punto de montaje es correcto.** El comentario de `App.svelte:1190` lo explica: el
lanzador vive en `aside.pro-sidebar`, que tiene ancho fijo en píxeles, y anidar el visor ahí lo
dejaba de unos cientos de píxeles de ancho. Escapar del contenedor fue deliberado. **Escapar de
la tipografía no.** El arreglo no es mover el montaje: es declarar la fuente en `.workspace`,
igual que `.app-container`.

Esto es la capa que faltaba del arreglo que ya hizo `viewer-design-system.test.ts`. Ese test
existe porque *"el visor 3D parece una aplicación distinta"* y aliaseó los cuatro custom
properties de **color** que caían a literales. La tipografía quedó afuera. Y `wsMono: false`
significa que **ninguna cifra del visor tiene figuras tabulares**, mientras cada columna numérica
del resto de PRO las tiene — que es la razón por la que `--st-mono` existe.

### Radios: el visor no es el desalineado

| Pantalla | Radios distintos |
|---|---|
| design | `3px`, `4px`, `50%`, **`10px`**, **`4px 0 0 4px`**, **`0 4px 4px 0`** |
| detailing | `3px`, `4px` |
| documents | `4px` |
| workspace | `4px`, `50%`, `3px` |

`tokens.css` define `--st-radius: 3px` y `--st-radius-lg: 6px`. El `10px` y los dos radios
partidos de la etapa de diseño no son ninguno de los dos. El visor, acá, es el más consistente
de las cuatro — lo cual es exactamente la clase de diferencia que hay que **no** "arreglar".

---

## 5. Lo que esta auditoría NO cubrió

Decirlo importa tanto como los hallazgos, porque una fase que se declara cerrada sin haber mirado
es peor que una abierta.

- **Navegación y transiciones.** Medí pantallas en reposo. No medí etapa→etapa, ni el foco al
  abrir y cerrar el visor, ni `Escape`, ni a qué control vuelve el usuario. Primer trabajo de
  H1-B.
- **La máquina de estados real.** No leí `rebarWorkspace` ni `design-run` contra la UI. Los siete
  estados de pisos están verificados; los del visor (aislamiento, filtros, opacidad, conflictos)
  no.
- **Contenido largo sintético.** Sólo los largos del fixture.
- **Comportamientos interactivos del visor** más allá de lo que se dibuja en reposo.
- **Que tokenizar no cierra nada.** La superficie de hormigón está en 64 crudos desde 132, y este
  documento encuentra cuatro defectos de contraste y uno de tipografía en archivos **ya
  tokenizados**. El color correcto no implica el contraste correcto.

---

## 6. Frontera de archivos compartidos — freno acá

Cuatro de los hallazgos viven en archivos que M1 también necesita. Reporto y no edito.

| Archivo · líneas | Contrato | ¿Quién debería ser dueño? |
|---|---|---|
| `tokens.css` `--st-text-3` (#64798a) | Token de texto de tercer nivel, usado por PRO entero y por la landing. Subirlo mueve toda la app; dejar de usarlo para oraciones es cambio por consumidor. | **Contrato compartido.** Igual que las cinco superficies de estado: propuesta medida primero, implementación por H1 sólo si M1 acuerda. |
| `WorkflowStages.svelte:206,220,227` | La franja de etapas es la cromática común del workflow PRO; el flujo metálico de M1 se renderiza dentro. `.mark` es el indicador de etapa actual. | **Compartido.** El arreglo (4.36 → `--st-text` o `--st-text-2` con el borde llevando el estado) es de una línea, pero la ve M1. |
| `DesignOverview.svelte:278,280,283-285` | El censo de resultados. M1 lo usa para el censo metálico. | **Compartido.** |
| `App.svelte:1196` + `.app-container:1334` | El punto de montaje del overlay y la única declaración de fuente de la app. | **La declaración de fuente va en `.workspace`** (`RebarWorkspace.svelte`), que es de H1 — no en `App.svelte`. Eso lo hace un cambio **no compartido**, y es la razón para preferirlo sobre mover el montaje. |

`ProjectRegulationsPanel` concentra 9 de los 10 sitios de `--st-text-3`: hay que confirmar si el
panel de reglamentos lo comparte la superficie metálica antes de tocarlo. No lo verifiqué.

---

## 7. Plan de fases, con lo que ya está anclado

| Fase | Primer trabajo, según lo medido |
|---|---|
| **H1-B** panel derecho y navegación | Medir foco y transiciones (lo que §5 dejó abierto). Cerrar el salto `h3 → h5`. Volver a medir la franja de workflow como *envoltura*, no como desborde. Contenido largo sintético. |
| **H1-C** documentos y planos | La etapa tiene 24 nodos con el fixture: hay que llegar a un estado con planos reales antes de auditarla de verdad. El salto de encabezado vive acá. |
| **H1-D** visor y rail | La fuente y el mono en `.workspace` — un cambio, no compartido, con el mayor efecto visible del bloque. El salto `h2 → h4`. Los estados interactivos del rail. |
| **H1-E** integración y gates | Los cuatro contrastes, los tres que dependen de archivos compartidos según §6, y las aserciones que reemplacen a este arnés. |

Los colores de Three.js siguen siendo autoridad del visor: `conflicted 0xe0444a`,
`unreinforced 0xd4762a`, `selected 0xffd400`, `provisional 0xa066d3`. Ninguna fase los toca, y el
espejo se sigue verificando en las dos direcciones.
