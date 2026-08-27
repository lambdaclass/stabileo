# Hallazgos abiertos de M1/M2 — propuestas, y cómo se implementaron

> **Estado: los tres están implementados.** Este documento se conserva como el registro de lo que
> se propuso, para que las **divergencias** entre la propuesta y lo que se hizo estén a la vista y
> se puedan revertir como decisión y no descubrir como sorpresa. Cada sección abre ahora con su
> estado. El detalle de ejecución está en `m1-m2-ci-audit-and-three-decisions.md`.
>
> | # | Decisión | Commit | Divergencia |
> |---|---|---|---|
> | — | *(prerrequisito)* una sección construida por el modal no tenía geometría | `806e1289` | no estaba previsto: lo destapó la decisión 1 |
> | 1 | Catálogo inline duplicado | `4a458b39` | **sí** — se retiró también el *builder* |
> | 2 | Dos sistemas de veredicto | `8e538631` | **sí** — vocabulario propio, no el badge metálico |
> | 3 | Colores hardcodeados de `SectionFigure` | `4b0afd2b` | **sí** — `--st-hair-strong`, no `--st-hair` |

Los tres puntos siguientes eran, al escribirse, decisiones de producto y no regresiones. Este
documento existe para que la decisión se tomara con los archivos, el riesgo y el costo de prueba
a la vista, y ahora también para que quede el contraste entre lo propuesto y lo hecho.

Propuesta inicial del usuario, que estas tres secciones desarrollan:

1. el modal como única fuente de perfiles;
2. un único lenguaje de veredicto normativo;
3. colores semánticos compartidos para relleno y fondo.

---

## 1 · Catálogo inline duplicado

> **Implementado — `4a458b39`.** `ProSectionsTab` pasó de 724 a 205 líneas.
>
> **Divergencia con la «propuesta mínima» de abajo, que decía «no se toca el builder».** El
> *builder* inline también se retiró, porque la instrucción de ejecución fue que el modal quede
> como única fuente de **creación** y `BuiltSectionPanel` lee exactamente las mismas listas
> (`SECTION_SHAPES`, `THIN_SHAPES`, `SOLID_SHAPES`) que leía el formulario inline: dejarlo habría
> dejado una segunda fuente de alta. Es la divergencia de mayor alcance de este trabajo.
>
> **Prerrequisito que la decisión destapó, y que había que arreglar primero** (`806e1289`): la
> rama `built` de `toSectionFields` descartaba `tw`, `tf`, `t` y `tl`, así que una sección
> construida **por el modal** resolvía `properties-only` con `missing: ['tw','tf']` donde la
> construida por el formulario inline resolvía `geometry-backed`. Sin dibujo y fuera de todo
> helper que despache por forma, ya desde `hollow-rect`. Borrar el camino que funcionaba antes de
> arreglar el que quedaba habría cambiado un duplicado por una rotura.
>
> `ColdFormedPanel` **no se tocó**: es un tercer camino de alta, pero el catálogo paramétrico C/Z
> no es una de las quince familias y no tiene equivalente en el modal.


### Archivos afectados

| Archivo | Rol |
|---|---|
| `web/src/components/pro/ProSectionsTab.svelte` | Contiene las dos rutas: pestañas `catalog`/`builder` propias **y** el botón que abre el modal |
| `web/src/components/pro/section/ProSectionModal.svelte` | La ruta que M2 introdujo como única fuente |
| `web/src/components/pro/generators/ProfilePicker.svelte` | Ya migrado: la fila del generador abre el modal |
| `web/e2e/m2-section-modal.spec.ts`, `web/e2e/profile-selector.spec.ts` | Cubren la ruta del modal |

### Comportamiento actual

`ProSectionsTab` abre un `<details>` con dos pestañas propias. La de catálogo muestra un botón
que abre el modal **y, debajo, una tabla completa** de perfiles filtrable por familia, cuyas filas
son `<tr onclick={() => addProfile(p)}>`: agregan la sección directamente al modelo.

Por esa segunda ruta la sección entra **sin pasar por `ProfileSpec`**, de modo que no tiene
disposición, huelgo ni rotación, y no queda registro de composición. Además `<tr onclick>` no es
alcanzable por teclado ni tiene rol.

### Riesgo

- **Dos secciones «IPE 200» distintas** según por dónde se agreguen: una componible y una no.
- Lo que M2 unificó se puede eludir sin darse cuenta, porque la ruta vieja está **más a mano**
  (visible al abrir el panel; el modal requiere un clic más).
- Un proyecto guardado no dice por qué ruta entró cada sección.
- La fila no es operable por teclado.

### Propuesta mínima

Que la pestaña de catálogo de `ProSectionsTab` **muestre sólo el botón que abre el modal**, con
la tabla removida. No se toca el modal, ni `ProfilePicker`, ni el builder.

Alternativa más conservadora si se quiere conservar la vista de tabla: dejarla como **lista de
lectura** —sin `onclick`— y que el único camino de alta sea el modal.

### Tests necesarios

- E2E: agregar una sección desde el panel produce una con `arrangement`, `gapMm` y `rotationDeg`
  registrados; hoy, por la ruta inline, no los tiene.
- E2E: no queda en el panel ningún control que dé de alta una sección sin pasar por el modal.
- Unitario de contrato: `ProSectionsTab` no importa `addProfile` ni llama al alta directa.
- Regresión de teclado: todo control de alta del panel es alcanzable con Tab y activable con
  Enter.

### Impacto

**M2** — es donde vive el modal y donde se haría el cambio. **M1** — ninguno: `ProfilePicker` ya
está migrado y el panel profundo de M1 se conserva dentro del modal.

---

## 2 · Dos sistemas de veredicto

> **Implementado — `8e538631`.**
>
> **La tilde estaba en dos lugares, no en uno.** Además de la ficha de resultado, `StageSection`
> pinta su estado `done` como `✓` en `--st-ok`, y las dos secciones de cálculo llegaban a `done`
> **apenas existía un objeto resultado** — no cuando el resultado era bueno. Un grupo de bulones
> por encima de su capacidad ponía su propio encabezado en verde, igual que apretar «Verify» con
> los valores por defecto, donde Vu y Tu son 0. Sacar el glifo de la ficha y dejarlo en el
> encabezado habría mudado la afirmación, no retirado.
>
> **Divergencia con la propuesta**, que decía «reemplazar `✓ / ⚠ / ✗` por el badge de estado
> metálico»: no se hizo. Los cuatro estados metálicos describen el estado de diseño de una barra,
> no un ratio de utilización, y mapear «0,4» a alguno de ellos es un error de categoría — además
> de ser exactamente la mezcla de estados que la instrucción pedía evitar. El bloque recibió
> vocabulario propio, `within / near the limit / over the limit`, deliberadamente distinto del
> canónico (`conn.checkState.adequate` es «cumple» en español: la colisión estaba a una palabra).
>
> Las secciones son `optional`, nunca `done`. **§1, la detección de nudos, conserva su `done` a
> propósito**: significa que el detector corrió y encontró nudos, sin decir nada sobre adecuación.
> La exención de `ProConnectionsTab` en `steel-never-verified` se retiró; la de
> `ProVerificationTab` se conserva, y sólo ella.


### Archivos afectados

| Archivo | Rol |
|---|---|
| `web/src/components/pro/ProConnectionsTab.svelte` | Contiene los dos: el diseño de uniones de M2 y el verificador previo (líneas ~1145–1225) |
| `web/src/components/pro/ProVerificationTab.svelte` | Superficie **compartida** con hormigón; su `✓` es legítimo para filas de HA |
| `web/src/lib/engine/steel/__tests__/steel-never-verified.test.ts` | El guard; hoy exime a las dos superficies compartidas |
| `web/src/lib/connection/joint-design.ts` | El vocabulario de M2: `incomplete / notVerifiable / designed / exceeded` |

### Comportamiento actual

En el mismo panel conviven:

- **M2**: estados con cláusula, que **nunca** dicen «verificado», y que explican que «diseñada»
  no equivale a aprobación profesional.
- **Previo**: entradas manuales Vu/Tu, botón «Verify», y un resultado con **`✓` verde** cuando el
  ratio da `ok` (`boltResult.status === 'ok' ? '✓' : …`).

El punto de entrada rotula el bloque como *«Experimental calculation, with no tests and no mapped
clauses»*, pero dentro del panel las dos convenciones se leen juntas.

### Riesgo

- Un `✓` verde junto a un cálculo declarado sin cláusulas mapeadas es **la tilde engañosa** que
  todo el alcance metálico se propuso evitar.
- El usuario no tiene cómo saber que las dos zonas del mismo panel tienen autoridad distinta.
- El guard `steel-never-verified` tuvo que eximir `ProConnectionsTab` y `ProVerificationTab` para
  poder pasar; cada exención es una superficie donde la regla ya no mira.

### Propuesta mínima

**Un solo vocabulario en las superficies metálicas.** El bloque previo pasa a los cuatro estados
de M2 —o, si su cálculo no puede sostenerlos, se retira del panel y queda como herramienta
aparte—. En concreto: reemplazar `✓ / ⚠ / ✗` por el badge de estado metálico, que no tiene forma
«aprobado».

`ProVerificationTab` **no se toca**: su `✓` es de hormigón y tiene sus propias garantías. Lo que
sí conviene es que la fila de acero de esa tabla no comparta el camino del `statusIcon` — cosa que
ya está afirmada por «the verification tab shows no steel row through the green-tick path».

### Tests necesarios

- Quitar la exención de `ProConnectionsTab` en `steel-never-verified` y que pase.
- E2E: con una unión resuelta y adecuada, ninguna zona del panel muestra `✓`.
- Unitario: el bloque previo emite uno de los cuatro estados y ninguno más.
- Mantener la aserción precisa sobre filas de acero en `ProVerificationTab`.

### Impacto

**M2** — el panel es suyo. **M1** — define el vocabulario (`steelDisplayTone`, `SteelStatusBadge`)
y su guard; habría que revisar la lista de exenciones al cerrar.

---

## 3 · Colores hardcodeados de `SectionFigure`

> **Implementado — `4b0afd2b`.**
>
> **Divergencia con la propuesta, y es la que importa: `--st-hair` era la lectura obvia y era la
> equivocada.** Compuesto sobre la fila da **1,48**, por debajo del **1,74** del literal `#24486e`:
> el marco habría quedado *más tenue* que antes. Se usó `--st-hair-strong` — 2,03 sobre la fila y
> 2,07 sobre el pozo, a la par o por encima del literal en los dos fondos. Hay además una razón
> estructural: dentro del modal esta figura vive adentro de un pozo `.preview` que ya es
> `--st-hair`, y un marco anidado del mismo token que su contenedor es un marco que nadie ve.
>
> El pozo y el relleno de vacío sí fueron a `--st-bg` como se proponía, pero desde la hoja de
> estilos y no como atributo `fill`: no porque `fill="var(…)"` no renderice —el modal ya le pasa
> un `var(--st-value)` como `stroke` y dibuja— sino porque un atributo en la plantilla no es algo
> que un test pueda relacionar con la regla que pinta el fondo con el que debe coincidir.
>
> El cuarto literal, `#566` del guión del vacío, no figuraba en la propuesta: daba **3,02**, bajo
> AA. Pasó a `--st-text-2`, **7,00**.
>
> La prueba propuesta era «E2E visual acotada… contra baseline nueva». Se hizo más fuerte y sin
> agregar un *gate* de píxeles: el E2E lee del navegador el `fill` computado del polígono de vacío
> y el `background-color` computado del contenedor, y exige que sean iguales. **Ningún snapshot se
> actualizó**, y las dos baselines que existen son de hormigón.
>
> «Los dos temas» no es hoy verificable: `tokens.css` no tiene `prefers-color-scheme` ni
> `data-theme`. Seguir el tema es lo que este cambio **habilita**.


### Archivos afectados

| Archivo | Rol |
|---|---|
| `web/src/components/pro/generators/SectionFigure.svelte` | Único componente metálico con hex literales: 4 valores |
| `web/src/lib/__tests__/design-tokens-resolve.test.ts` | El gate que exige que todo token referenciado exista |

### Comportamiento actual

Cuatro literales: `#071322` como fondo del recuadro **y** como relleno de los polígonos `isVoid`
—el truco que «perfora» el contorno— y `#24486e` como borde. Los otros cinco componentes
metálicos auditados usan tokens `--st-*` sin excepción.

### Riesgo

- La figura no sigue el tema: sobre un fondo claro, el relleno de vacío queda como una mancha
  oscura y el «agujero» se lee como material.
- El truco **exige** que el relleno de vacío y el fondo del contenedor sean **el mismo color**.
  Migrar uno solo rompe el dibujo.

### Propuesta mínima

Migrar **los dos juntos** a un mismo token de fondo —`--st-bg`, que ya usa `BuiltSectionPanel`— y
el borde a `--st-hair`. El relleno de vacío pasa a `fill="var(--st-bg)"`, que SVG resuelve.

Condición: el token debe ser **opaco**. Un token translúcido deja ver el polígono debajo y el
vacío deja de ser vacío.

### Tests necesarios

- Unitario de contrato: `SectionFigure` no contiene literales hex.
- Unitario: el token de fondo del contenedor y el del relleno de vacío son **el mismo**.
- E2E visual acotada: un RHS —que tiene vacío— dibuja el agujero en los dos temas. Comparación
  contra baseline nueva, **no** actualizando la existente.

### Impacto

**M2** — la figura es la previsualización del modal. **M1** — la usa `ProfilePicker` en las filas
de generador, así que el cambio se ve en ambos; ninguna lógica cambia.

---

## Orden sugerido — y el que se siguió

Se siguió **1 → 2 → 3** y no el sugerido, porque la decisión 1 destapó el defecto de geometría de
`806e1289` y ese defecto condiciona qué significa «el modal es la única fuente». Las otras dos son
independientes entre sí.

### El orden que se había sugerido

1. **(3)** es el más barato y no toca comportamiento.
2. **(2)** es el de mayor consecuencia para el usuario: es el que puede hacerle creer que algo fue
   aprobado.
3. **(1)** es el de mayor alcance de interfaz y conviene decidirlo antes del QA manual, porque
   cambia por dónde se agrega una sección.
