# Auditoría integrada de M1 + M2

Ramas: `feat/pro-steel-m1` (PR **#156**, draft, base `feat/pro-steel-family`) y
`feat/pro-steel-m2` (PR **#164**, draft, base `feat/pro-steel-m1`).

Auditado como producto integrado, no repitiendo los tests de cada bloque. Todo defecto abajo se
reprodujo en navegador antes de clasificarlo, y las correcciones van en commits separados.

---

## 1 · Matriz de áreas

| # | Área | Cómo se auditó | Resultado |
|---|---|---|---|
| 1 | Gates globales | Comandos completos, exit code real | **2 regresiones halladas y corregidas** |
| 2 | Selector de secciones | Sonda en navegador sobre el flujo PRO real | **2 defectos hallados y corregidos** + 1 hallazgo abierto |
| 3 | Selector de materiales | Cobertura unitaria dirigida + datos | Sin defectos |
| 4 | Generadores | E2E completos + lectura del acoplamiento fila/modal | **2 regresiones de teclado** (ver §3) |
| 5 | Workflow metálico | E2E `m2-steel-workflow` + lectura de estados | Sin defectos nuevos; 1 hallazgo abierto |
| 6 | Nudos y uniones | E2E de uniones, soldaduras y presillas | Sin defectos nuevos; 1 hallazgo abierto |
| 7 | Visualización 3D y crash | Suite completa ×2, contador de caídas | **0 caídas en 754 tests, dos veces** |
| 8 | Persistencia y datos | Verificación directa del fixture | Conforme |
| 9 | Exportaciones | Lectura del camino de emisión | Sin afirmaciones falsas |
| 10 | Estética y accesibilidad | svelte-check + tokens + navegador | 2 hallazgos abiertos |

---

## 2 · Gates, con exit code real

| Puerta | Comando | Resultado |
|---|---|---|
| Unitarios | `npm test` | **7753 pasan**, 12 saltados, 1 todo — `EXIT=0` |
| Build tests | (mismo gate, pase `build`) | **14 pasan** |
| Typecheck | `npm run typecheck` | 473, **sin errores nuevos** |
| Build de producción | `npm run build` | `EXIT=0` |
| i18n es/en/pt | conteo + `locale-parity` y `steel-locale-coverage` | **784 claves, en paridad** |
| CSS muerto | `svelte-check` | 270 en todo el repo; **5 en superficies metálicas** — ver §7.2 |
| **E2E completa (antes)** | `E2E_PORT=6470` | **741 pasan, 6 fallan** — 43,8 min |
| **E2E completa (después)** | `E2E_PORT=6480` | **748 pasan, 1 falla** — 41,4 min |

Puerto dedicado en todas las corridas; nunca 4173.

---

## 3 · Regresiones encontradas y corregidas

### 3.1 El diálogo se quedó sin teclado — `ca20995b`

**Cinco specs de `profile-selector.spec.ts` venían fallando** contra el diálogo de secciones y
nadie había leído los fallos. Reproducido en navegador: el botón Apply queda **enfocado,
habilitado y sin poder activarse**.

**Causa raíz.** `ProfileSelectorPanel` manejaba teclas en `<svelte:window>`. Eso era correcto
mientras el panel **era** el popover; dejó de serlo cuando M2 lo montó dentro del diálogo: un
listener a nivel ventana ve **todas** las teclas de la página, así que el Enter dirigido a Apply
o Cancel se interceptaba, se le hacía `preventDefault()` y se re-enrutaba a «elegir la fila bajo
el cursor». Un usuario de teclado podía abrir el diálogo desde una fila de generador, buscar,
elegir un perfil — y no tenía forma de confirmarlo.

**Segunda causa, en el mismo camino.** `data-autofocus` está en la pestaña de división, y el
diálogo la enfocaba un microtask después del montaje — es decir, después de que el panel enfocara
su buscador. La pestaña ganaba siempre. El costo no era sólo el cursor ausente: con el foco en una
pestaña, **ArrowDown recorría las pestañas en vez de la lista de perfiles**, así que el camino
teclear→flecha→Enter no funcionaba.

| Evidencia | Antes | Después |
|---|---|---|
| `profile-selector.spec.ts` | 5 fallidos | **31/31 pasan** |
| Foco al abrir | pestaña de división | buscador del catálogo |
| Enter sobre Apply | no hace nada | confirma y cierra |

**Corrección**: teclas en el contenedor del panel (el keydown burbujea desde el descendiente
enfocado, y el panel enfoca su buscador al montar); el buscador gana el foco inicial cuando
existe, y la pestaña queda de reserva para la división de construcción, que no tiene buscador.

**Regresión agregada**: se afirma el **efecto**, no el arreglo — Enter sobre Apply con el catálogo
abierto debe cerrar el diálogo. Un test que mirara qué elemento lleva el listener pasaría con el
próximo montaje que rompa esto.

### 3.2 La ficha negaba una geometría que la app tenía — `e5c8b2a0`

La ficha de datos mostraba, para **IPE 200**: *«No canonical geometry resolved: the centroid does
not follow from h and b except on a doubly symmetric section»*. Un IPE **es** doblemente
simétrico, y la app había resuelto su geometría canónica dos líneas antes — la estaba usando para
armar la lista de disposiciones.

**Causa.** El modal llamaba `sectionDataSheet({ entry })`, sin `canonical`. Como la ficha declara
centroide **sólo si se le da uno**, ningún perfil del catálogo mostraba centroide nunca, y la
frase en pantalla no era sólo poco útil: **era falsa** donde la base es `canonicalGeometry`.

`resolveProfile` tenía el valor desde siempre — cada polígono y el extent que devuelve están
desplazados por el centroide — y lo consumía y descartaba. Ahora lo reporta, y devuelve `null`,
no un número plausible, para una familia properties-only.

Además: una sección doblemente simétrica resuelve al origen, pero el motor lo devuelve unos
nanómetros corrido, y `(-1e-9).toFixed(1)` imprime **«-0.0»** — un desplazamiento medido y con
dirección, que es justo lo que no es. Lo que no llega a la resolución impresa ahora se lee cero.

---

## 4 · Fallos clasificados

| Fallo | Clasificación | Acción |
|---|---|---|
| `profile-selector` ×5 | **Regresión de M2** (panel embebido en el diálogo) | Corregido — `ca20995b` |
| Centroide siempre ausente | **Defecto de M2** (parámetro no pasado) | Corregido — `e5c8b2a0` |
| `m1-generators-joints` §3.5 | **Test viejo**: M2 mudó la disposición al modal | Corregido antes — `dc0a332e` |
| `rc-design-visual` → overlay legend | **Preexistente, no bloqueante** | Sin acción |
| `previewAfterCompose = 0` | **Error de mi sonda**: la figura usa `<polygon>`, no `<path>` | Sin acción |

El único fallo que queda en la suite completa es la baseline visual: esperaba 696×34 px y recibió
**697×34**, 645 píxeles distintos (ratio 0,03). Un píxel de ancho. La baseline `darwin` es del
**2026-07-25**, M2 no tocó ninguna, y su `describe` se llama literalmente
`@slow visual baselines (non-blocking)`. **No se actualizó el snapshot.**

---

## 5 · Lo verificado que resultó conforme

### 5.1 Selector de secciones, medido en navegador

- **Exactamente dos divisiones** (`standard`, `build`); **cero** controles de sección amorfa.
- **721 perfiles**; la búsqueda de «IPE 200» deja 1.
- **Las 15 familias** presentes y con filas: IPN 21 · IPE 18 · HEB 19 · HEA 19 · W 267 · HP 11 ·
  M 6 · UPN 12 · C 28 · MC 33 · T 11 · L 37 · RHS 55 · SHS 89 · CHS 95.
- **MC no dibuja previsualización** — correcto: es la familia properties-only cuyo centroide se
  desconoce, y dibujar un contorno inventado es justo lo que el alcance prohíbe.
- **Ficha con procedencia por campo**: `tabulated`, `derived from the canonical outline`,
  `derived from the table`, `not available`. **J se declara no publicado** con la razón: «It is
  not derived from the outline: the polygon approximation is not J».
- **Composición**: 7 disposiciones; el huelgo aparece sólo si es compuesta.
- **Huelgo cero conservado** (`"0"`, sin mensaje de error: 0 es entrada válida).
- **Huelgo negativo rechazado** con mensaje, y el valor almacenado intacto.
- **Escape cierra y el foco vuelve** a `pro-open-section-modal`.
- **Anillo de foco aplicado**: `2px solid rgb(111,176,234)` sobre el buscador.

### 5.2 Datos de la nave (§8)

`3d-nave-industrial.json`: **633 elementos, 232 nudos**, y los dos materiales con
`fy=250`, `fu=400`, `gradeId=astm-a36`, `standard=ASTM A36`, `region=US`. Conforme.

### 5.3 Aluminio (§3)

`alu-5052-h32` (fy 195, `family: 'aluminium'`, `verification: 'typical'`) está cubierto por
`material-choice.test.ts` («aluminium is aluminium once its grade travels with it») y por
`grade-family.test.ts`. La pérdida de `gradeId` que lo clasificaba como acero está corregida y
tiene regresión.

### 5.4 El crash del renderer (§7)

| Corrida | Tests | Caídas |
|---|---|---|
| E2E completa, antes de esta auditoría | 752 | **0** |
| E2E completa, después | 754 | **0** |

Antes de la mitigación, los specs de uniones solos daban 1–4 por corrida. La mitigación sigue
funcionando.

**Rendimiento medido sobre la nave**: `load=1411 ms · switch=93 ms · build=65 ms · rebuild=19 ms`.

---

## 6 · Hallazgos abiertos: decisión de producto, no regresiones

Ninguno se corrigió porque ninguno es una regresión y los tres exceden «claramente dentro del
scope». Se documentan con evidencia para que el usuario decida.

### 6.1 Dos fuentes para el mismo perfil

`ProSectionsTab` conserva un **catálogo inline completo** —pestañas de familia, buscador, tabla—
además del botón que abre el modal. Las filas son `<tr onclick={() => addProfile(p)}>`: agregan la
sección **directamente**, sin pasar por el `ProfileSpec` del modal, así que por ese camino no hay
disposición, huelgo ni rotación.

Es exactamente lo que §4 pide evitar («no haya dos fuentes para el mismo perfil/material»). M2
**agregó** el modal sin retirar el catálogo previo. Además, `<tr onclick>` no es alcanzable por
teclado.

### 6.2 Dos sistemas de veredicto en el mismo panel

`ProConnectionsTab` contiene el diseño de uniones de M2 —que nunca dice «verificado» y usa
`incomplete / notVerifiable / designed / exceeded`— **y** un verificador previo con entradas
manuales Vu/Tu, botón «Verify» y resultado con **tilde verde `✓`** (líneas 1161, 1217–1222).

El punto de entrada ya rotula ese bloque como «Experimental calculation, with no tests and no
mapped clauses», pero dentro del panel conviven dos convenciones opuestas. §5 pide «ausencia de
tildes verdes engañosas». **Preexistente**; M2 lo agravó al poner el sistema cuidadoso al lado.

### 6.3 Colores fuera del sistema visual

`SectionFigure.svelte` es el **único** componente metálico con colores hardcodeados: 4 valores hex
(`#071322` como relleno de vacío y fondo, `#24486e` como borde). Los otros cinco auditados
—`ProSectionModal`, `SectionDataSheet`, `ProConnectionsTab`, `ProfileSelectorPanel`,
`SteelPanel`— usan tokens `--st-*` sin excepción. No se cambió sin poder verificarlo
visualmente: el relleno de vacío debe coincidir **exactamente** con el fondo del contenedor, así
que los dos tienen que migrar juntos.

### 6.4 CSS muerto

270 selectores sin usar en todo el repo; **5 en superficies metálicas**: `SectionChanger` (5),
`SectionsTable` (4), `SteelPanel` (4), `MaterialsTable` (2), `ProGeneratorsPanel` (1). Los de
`SteelPanel` son reglas `:focus-visible` para elementos que el componente no renderiza —
los renderizan sus hijos, y el CSS con alcance de Svelte no cruza esa frontera. **Verificado en
navegador que el anillo de foco sí se aplica** donde importa (§5.1), así que son reglas muertas,
no accesibilidad rota.

---

## 7 · Comandos ejecutados

```
npm run typecheck
npm run build
npm test
npx svelte-check --output human
E2E_PORT=6470 npx playwright test                      # suite completa, antes
E2E_PORT=6480 npx playwright test                      # suite completa, después
E2E_PORT=6463 npx playwright test e2e/zz-audit-sections.spec.ts   # sonda de auditoría (removida)
E2E_PORT=6471/6472/6474/6475 npx playwright test <specs afectados>
```

Las sondas de auditoría (`zz-audit-sections`, `zz-probe-nav`, `zz-p`) se removieron: siempre
pasan y no afirman nada, así que en la suite serían ruido. Lo que quedó es la regresión de §3.1.

---

## 8 · Estado final

| | M1 (#156) | M2 (#164) |
|---|---|---|
| Estado | draft, abierto | draft, abierto |
| Base | `feat/pro-steel-family` | `feat/pro-steel-m1` |
| Árbol | limpio | limpio |
| Remoto | sincronizado | sincronizado |
| Autor | Bauti | Bauti, sin coautoría |

Commits de esta auditoría, todos sobre M2 y separados por defecto:

- `e5c8b2a0` — el centroide que el resolvedor ya tenía
- `ca20995b` — el teclado del diálogo

**M1 y M2 no están perfectos.** Los gates están verdes y las dos regresiones halladas están
corregidas con regresión propia, pero §6 deja tres decisiones de producto abiertas, y la más
seria —dos fuentes para el mismo perfil— toca el corazón de lo que M2 vino a unificar.
