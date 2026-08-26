# Hallazgos abiertos de M1/M2 — propuestas, sin implementar

Los tres puntos siguientes **no se implementaron**. Cada uno es una decisión de producto, no una
regresión, y este documento existe para que la decisión se tome con los archivos, el riesgo y el
costo de prueba a la vista.

Propuesta inicial del usuario, que estas tres secciones desarrollan:

1. el modal como única fuente de perfiles;
2. un único lenguaje de veredicto normativo;
3. colores semánticos compartidos para relleno y fondo.

---

## 1 · Catálogo inline duplicado

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

## Orden sugerido

1. **(3)** es el más barato y no toca comportamiento.
2. **(2)** es el de mayor consecuencia para el usuario: es el que puede hacerle creer que algo fue
   aprobado.
3. **(1)** es el de mayor alcance de interfaz y conviene decidirlo antes del QA manual, porque
   cambia por dónde se agrega una sección.
