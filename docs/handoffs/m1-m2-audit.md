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

> **Cerrados.** Los tres se decidieron e implementaron: §6.1 en `4a458b39` (con el prerrequisito
> `806e1289`), §6.2 en `8e538631`, §6.3 en `4b0afd2b`. Las divergencias respecto de lo propuesto
> están en `m1-m2-open-findings-proposals.md` y el detalle en
> `m1-m2-ci-audit-and-three-decisions.md`. §6.4, el CSS muerto, sigue abierto y creció: ver §20.
>
> El texto de abajo se conserva como el estado en que se encontraron.


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

---

# Parte II · Sincronización de ramas y conflictos de M1

## 11 · Divergencia, antes de tocar nada

```
origin/main            00f82153
feat/pro-steel-family  08917b9f   ← 0 commits por delante de main: YA ESTÁ EN MAIN
feat/pro-steel-m1      f936f29c   ← main +129 / m1 +29
feat/pro-steel-m2      5f13d514   ← m1 +40
```

**Hallazgo de base**: `feat/pro-steel-family`, que era la base del PR #156, **ya estaba
íntegramente contenida en `main`**. Por eso reapuntar M1 a `main` no agranda su diff: los 29
commits de M1 sobre family son exactamente los suyos.

| PR | Base antes | Base ahora |
|---|---|---|
| #156 (M1) | `feat/pro-steel-family` | **`main`** |
| #164 (M2) | `feat/pro-steel-m1` | `feat/pro-steel-m1` (sin cambio) |

Ambos siguen **draft**. Todo se integró con `git merge --no-ff`; **no hubo rebase ni force-push**.

## 12 · Merge de `main` en M1 — `9883e2bd`

**3 conflictos**, todos resueltos conservando ambos lados salvo donde uno era superconjunto:

| Archivo | Conflicto | Resolución |
|---|---|---|
| `ProConnectionsTab.svelte` | main renombró el token de `:hover`; M1 agregó los badges de ratio | Ambos: token de main + badges de M1 |
| `ProfileSelectorPanel.svelte` | main movió las teclas al diálogo y agregó descarte por clic; M1 agregó `cardOpen`, `BODIES`, `COMPARED` | Ambos (aditivos en regiones distintas) |
| `i18n/locales/pt.ts` | 1199 claves aparentemente sólo en M1 | **Archivo de main**, más la **única** línea que M1 había cambiado (`conn.gap.aluminium.scope`) |

El de `pt.ts` merece nota: la unión ingenua duplicaba 1199 claves. M1 no había agregado ninguna —
su conjunto de claves era idéntico al de la base—, sólo editó **un valor**. Tomar el archivo de
main y reaplicar esa línea es la única resolución correcta; la unión habría resucitado claves que
main eliminó a propósito.

**Coincidencia notable**: main hizo por su cuenta el mismo arreglo de teclado que M2 (`ca20995b`)
— mover el `keydown` del `<svelte:window>` al propio panel. Dos ramas, la misma conclusión.

## 13 · Los siete fallos de M1 tras el merge, clasificados

| # | Test | Clasificación | Acción |
|---|---|---|---|
| 1 | `state-background-contrast` → «names the two components» | **Test obsoleto**: afirmaba el defecto, main lo corrigió | Dado vuelta a guardia del arreglo |
| 2 | `state-background-contrast` → violeta provisional | **Test obsoleto**: `DesignToolbar` dejó de nombrarlo | Lista derivada, con piso de 3 |
| 3 | `steel-surface-colour-rules` → tres instancias de hormigón | **Documentación desactualizada** | 2 de 3 corregidas; la 3ª se afirma **como abierta** |
| 4 | `steel-locale-coverage` → «ships eleven more» | **Test obsoleto**: main estrechó el runtime a 3 idiomas | Ahora afirma `shipped == offered` |
| 5 | `steel-locale-coverage` → «the eleven unreachable» | idem | El conjunto es vacío; el bucle se conserva |
| 6 | `steel-never-verified` → tilde en `ProVerificationTab` | **Decisión de producto** (§6.2) | Barrido acotado; la aserción precisa sobre filas de acero se conserva |
| 7 | `chs-shear-agreement` → factor 2 | **Entorno**: artefacto WASM local viejo | `npm run wasm` y pasa |

El #7 merece detalle porque invalidaba mediciones anteriores: **reproduce igual en un checkout
limpio de `origin/main`**, y el CI de main está verde porque **compila WASM desde el fuente**
(`wasm-pack build` antes de `npm run test`). Mi `src/lib/wasm/` era un artefacto de otra build.
Reconstruido, pasa. Todas las cifras de este informe son posteriores a esa reconstrucción.

Sobre el #3: el propio test decía qué hacer —*«si H1 los corrige, esto falla y el documento de
reconciliación debe actualizarse… un informe que nadie nota que envejeció es peor que ningún
informe»*—. Se cumplió al pie de la letra y `m1-token-proposal-reconciliation.md` tiene su cierre
parcial: dos instancias corregidas, `.banner-block` **todavía abierta** y afirmada como tal.

## 14 · Merge de M1 en M2 — `9e749fcc`, corregido en `cf99f655`

**2 conflictos** (`ProfileSelectorPanel.svelte`, `e2e-hooks.ts`), ambos aditivos, resueltos como
unión. Y **un defecto que el merge introdujo y ni el build ni los unitarios vieron**:

> `ReferenceError: allJointCount is not defined`

El merge dejó tres referencias sin declaración. El panel de uniones **lanzaba al montar**, y los
**19** fallos E2E de `metallic-joints`, `pro-ribbon-hierarchy` y los specs de la nave eran todos
ese único error: la pestaña nunca se renderizaba.

Ni el build ni los 7970 unitarios lo detectaron, porque la referencia vive en una expresión de
plantilla y en un cuerpo `$derived.by`: sólo es alcanzable en runtime. **Es la razón por la que
una suite E2E después de un merge no es opcional.**

Se adoptó la forma de M1, que es mejor: M2 contaba los nudos corriendo `detectJoints` **una
segunda vez** sobre todo el modelo; M1 usa `detected.length` de la pasada que ya corrió. Además
`conn.jointsNotShown` recibía el total en vez de `hiddenJointCount`, así que un modelo con 84
nudos y 6 ocultos habría informado 84 no mostrados.

## 15 · Estado CI real, con exit code

| Rama | SHA | CI | Detalle |
|---|---|---|---|
| **M1** | `9883e2bd` | **verde y rojo en el MISMO sha** | Dos corridas con 1 s de diferencia: una con los 6 jobs en verde, otra con `e2e` en rojo. Prueba directa de *flakiness*, no de rotura |
| **M2** | `9e749fcc` | rojo | El `ReferenceError` de §14 — CI lo detectó correctamente |
| **M2** | `cf99f655` | **verde** | Tras la corrección |

Gates locales, con WASM reconstruido:

| Puerta | M1 (`9883e2bd`) | M2 (`cf99f655`) |
|---|---|---|
| Unitarios | **7404 pasan**, EXIT=0 | **7970 pasan**, EXIT=0 |
| Build tests | 14 pasan | 14 pasan |
| Typecheck | 479 / baseline 479 | 473 / baseline 473 |
| Build producción | EXIT=0 | EXIT=0 |
| Árbol | limpio | limpio |
| **E2E completa** | **639 pasan / 3 fallan** | **797 pasan / 4 fallan** |

M2 tiene menos errores de tipo que M1 pese a contenerlo: sus 40 commits corrigieron seis.

## 16 · Conflictos restantes: los cuatro fallos E2E de M2

> **Superado por §19**, que los vuelve a medir contra un checkout limpio de `origin/main` con
> `node_modules` y el artefacto WASM compartidos, compara el texto del fallo y mide la tasa de
> `basic-demos:160`. La clasificación se sostiene; la evidencia es más fuerte y `viewport-perf`
> resultó no ser un umbral.


Ninguno es de acero. **Los cuatro reproducen en un checkout limpio de `origin/main`.**

| Fallo | Aislado | En main puro | Clasificación |
|---|---|---|---|
| `basic-selection-permutations` 2D y 3D | falla | **falla igual** | Preexistente. **Sin cobertura de CI**: el spec no tiene `@smoke` ni `@slow` |
| `basic-demos:160` «drawing a beam» | falla | **falla igual** | Preexistente. Es `@smoke` y pasa en el CI de Linux: diferencia de plataforma |
| `viewport-perf @perf` | falla **otro modelo cada vez** | — | Umbral sensible a carga. `@perf` **nunca corre en CI** (0 menciones) |
| `rc-design-visual` overlay legend | falla | **falla igual: 696→697 px, 645 píxeles, ratio 0,03** | Preexistente y **no bloqueante por diseño** |

Sobre la baseline de 1 px, comparada contra main como se pidió: **ninguna rama tocó
`e2e/__screenshots__`** (`git log origin/main..HEAD` sobre ese directorio: vacío), reproduce
idéntica en main, y su `describe` se llama `@slow visual baselines (non-blocking)`. **El snapshot
no se actualizó.**

## 17 · Estado de sincronización

| | M1 (#156) | M2 (#164) |
|---|---|---|
| Base del PR | **`main`** ✔ | **`feat/pro-steel-m1`** ✔ |
| Draft | sí | sí |
| Integrado | `main` por merge `9883e2bd` | M1 por merge `9e749fcc` |
| Rebase / force-push | **ninguno** | **ninguno** |
| Árbol | limpio | limpio |
| Remoto | sincronizado | sincronizado |
| CI | verde en una de dos corridas del mismo sha (e2e flaky) | **verde** |

## 18 · Commits de esta parte

- `9883e2bd` — merge de `main` en M1, con los tres conflictos resueltos
- `9e749fcc` — merge de M1 en M2
- `cf99f655` — el contador de nudos que el merge perdió
- `db57dbf9` — propuestas de los tres hallazgos abiertos


---

# Parte III · Reverificación tras las tres decisiones

Todo lo de acá es posterior a `806e1289`, `4a458b39`, `8e538631` y `4b0afd2b`.

## 19 · Los cinco fallos E2E, clasificados contra main limpio

Suite completa en la rama: **800 pasan, 5 fallan, 1 flaky, 4 saltados** — 43,2 min, 67 specs,
puerto dedicado.

El control se corrió en un *worktree* de `origin/main` (`2b0851a9`) con `node_modules` enlazado y
el artefacto WASM copiado: `engine/` y `package-lock.json` son **idénticos** entre main y M2, así
que la única variable bajo prueba es el fuente de `web/`. Esto importaba: M2 tocó
`web/src/lib/three/nodes-instanced.ts` y `node-scale.ts` en `a47d6208`, que es justo lo que
ejercitan la selección 3D y `viewport-perf`, así que la clasificación previa no se podía dar por
buena.

| # | Fallo | En la rama | En `origin/main` limpio | Texto del fallo | Clasificación |
|---|---|---|---|---|---|
| 1 | `basic-selection-permutations` **2D** | falla | **falla** | `armed kinds for elements+nodes`, línea 108, `-1/+0` | **Defecto preexistente** |
| 2 | `basic-selection-permutations` **3D** | falla | **falla** | idéntico al 2D | **Defecto preexistente** |
| 3 | `rc-design-visual` overlay legend | falla | **falla** | `696px → 697px, 645 píxeles, ratio 0.03` | **Defecto preexistente**, no bloqueante por diseño |
| 4 | `viewport-perf` `@perf` | falla en `3d-nave-industrial` y `3d-building` | **falla** en `la-bombonera` | `keyboard.up: Test timeout of 60000ms exceeded`, `orbitByKeyboard`, línea 211 | **Problema de entorno / arnés** |
| 5 | `basic-demos:160` | *flaky* | *flaky* | clic sintético sobre blanco en movimiento | **Flakiness declarada** |

Los textos de 1, 2 y 3 son **idénticos carácter por carácter** entre las dos ramas. Ninguna de las
dos ramas toca `basic-demos` ni `basic-selection-permutations`.

**El 4 no es un umbral, que es lo que se creía.** No falla por FPS: falla en `keyboard.up`, un
`ArrowLeft` mantenido que no se suelta dentro de los 60 s. Por eso le toca un modelo distinto cada
corrida — el que esté corriendo cuando se traba. Mismo modo de falla en main. `@perf` además no
corre nunca en CI.

**El 3 pertenece a main, no a estas ramas.** El baseline `darwin` es del 2026-07-25, ninguna rama
tocó `e2e/__screenshots__`, y el diff de un píxel reproduce igual en main. **No se actualizó
ningún snapshot.**

## 20 · `basic-demos:160`, con la tasa medida

No se declara verde por haber pasado una vez — y la primera medición, aislada, resultó ser la
engañosa.

| Condición | Rama | `origin/main` limpio |
|---|---|---|
| Aislado, `--repeat-each=10` · falla el **primer intento** | **0 / 10** | **1 / 10** |
| En contexto, archivo completo `--repeat-each=3` · falla el **primer intento** | **3 / 3** | **3 / 3** |
| Reintentos que hizo falta consumir | `#1` las tres veces | `#1` dos veces, **`#2` una** |
| Duración del intento que falla | ~24,7 s | ~24,7 s |
| Duración del reintento que pasa | ~10,6 s | ~9,5 s |

**No es un *flake* de baja tasa: es determinista y depende de la sesión.** Corrido solo no falla
casi nunca. Corrido después de sus hermanos, en la misma sesión de navegador que `workers: 1`
impone, **falla el primer intento siempre** y se recupera en un contexto nuevo — y la diferencia de
tiempos lo delata: el intento que falla quema ~25 s esperando, el reintento pasa en ~10 s.

Consecuencias que sólo se ven midiendo las dos condiciones:

- **repetirlo aislado no ejercita la condición en que falla.** El 0/10 de la rama, que fue lo
  primero que se midió, habría alcanzado para declararlo verde y habría sido una conclusión falsa;
- **`--retries=0` no tiene efecto acá.** `basic-demos.spec.ts:159` trae
  `test.describe.configure({ retries: 2 })`, con su propio comentario: *«el recorrido es
  determinista y se verificó como tal… lo que no es determinista es aterrizar un clic sintético
  sobre un blanco en movimiento, y un reintento es la forma honesta de decirlo»*. El repositorio ya
  había clasificado este test; lo que la medición agrega es que ese presupuesto de reintentos **se
  consume en todas las corridas**, no ocasionalmente, y que main llegó a necesitar los dos;
- por eso el `1 flaky` que aparece en toda suite completa es el comportamiento esperado, no un
  incidente.

**Clasificación: flakiness, determinista y dependiente de la sesión, idéntica en las dos ramas —
main marginalmente peor.** No es regresión de M1/M2 y no se relajó ningún timeout: el
`test.setTimeout(180_000)` y el presupuesto de reintentos son los que ya traía el spec.

## 21 · Las tres correcciones, confirmadas de punta a punta

Por área, contadas sobre la suite completa de la rama:

| Área | Specs | Pasan | Fallan |
|---|---|---|---|
| Selector de secciones | 4 | 67 | 0 |
| Generadores | 4 | 55 | 0 |
| Materiales | 2 | 16 | 0 |
| Composición / presillas | 1 | 24 | 0 |
| Cold-formed C/Z | 1 | 15 | 0 |
| Nudos | 4 | 49 | 0 |
| Uniones | 3 | 66 | 0 |
| 3D | 7 | 65 | 4 |
| Workflow metálico | 3 | 58 | 0 |

Los 4 de «3D» son exactamente `basic-selection-permutations` (2) y `viewport-perf` (2) de §19. Los
specs metálicos de 3D —`m2-3d-joints`, `m2-joint-3d`, `rebar-3d`— están en verde.

Y las tres afirmaciones, cada una con la prueba que la sostiene:

1. **El catálogo inline ya no es una segunda fuente.** `ProSectionsTab` no importa `FAMILY_LIST`,
   `PROFILE_FAMILIES`, `searchProfiles`, `familyToShape`, `SECTION_SHAPES` ni
   `computeSectionProperties`; escribe al modelo **una sola vez** y a través de
   `toSectionFields(choice, 0)`; y su entrada es un `<button>`, no un `<tr onclick>`. Las quince
   familias siguen creando sección con área y con `profileFamily`, recorridas desde `FAMILY_LIST`.
2. **El veredicto auxiliar no usa `✓` ni lenguaje de aprobación.** El barrido de
   `steel-never-verified` ya no exime `ProConnectionsTab`; queda un solo `done` en el panel y es el
   de detección; y un E2E aprieta «Verify» con los valores por defecto y lee de la ficha renderizada
   el glifo, la redacción y **el color comparado contra `--st-ok` resuelto en el mismo documento**.
3. **`SectionFigure` usa tokens compartidos.** La regla de literales se invirtió y se enumera desde
   los directorios, así que una superficie metálica nueva queda cubierta por defecto; el `fill` del
   vacío y el `background` del contenedor se afirman **iguales sea cual sea el token**; y un E2E
   sobre un SHS hueco lee los dos valores computados del navegador y exige que coincidan.

## 22 · Lo que sigue abierto

Además de §6.4, que creció: **`.conn-ratio-badge`**. `main` borró esas reglas en `2c79ed52`
—asunto: *«review fixes: no green tick for steel»*— y la resolución por unión del merge `9883e2bd`
las revivió. **Ninguna plantilla las aplica en ninguna rama** (`class="conn-ratio-badge"`: 0 en
main, 0 en M1 antes del merge, 0 en el merge, 0 en M2). M1 gastó `851fd57b` arreglando su contraste
y `steel-surface-colour-rules.test.ts` las fija leyendo el texto del CSS, así que el test pasa sobre
código que el navegador no pinta. Es producto en las dos direcciones y **no se cierra acá**.

Al lado, medido: **`svelte-check` no reporta nada para `ProConnectionsTab.svelte`**. Se le agregó un
selector deliberadamente muerto y devolvió **0** menciones, contra **9** de `ProVerificationTab` en
la misma corrida. Es la explicación de cómo lo anterior pasó inadvertido; la causa no se
diagnosticó.
